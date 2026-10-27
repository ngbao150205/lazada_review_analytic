"""Issues for final Neutral/Negative labels, with an explicit Negative fallback."""
from collections import Counter
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from database.models import Product, Review, IssueAnalysis
from app.services import decision_layer
from app.services.category_service import category_label, issue_group_for_category
from app.services.issue_evidence import build_issue_evidence, keyword_pattern, normalize_issue_text
from app.services.issue_rule_config import load_issue_rules as load_config, validate_issue_rules

RULE_FILE = Path(__file__).resolve().parents[1] / "rules" / "issue_rules.json"


def load_issue_rules():
    return load_config(RULE_FILE)


ISSUE_RULES = load_issue_rules()
PRODUCT_QUALITY = "PRODUCT_QUALITY"
SHIPPING_LOGISTICS = "SHIPPING_LOGISTICS"
CUSTOMER_SERVICE_RETURNS = "CUSTOMER_SERVICE_RETURNS"
PRICING_PROMOTIONS = "PRICING_PROMOTIONS"
OTHER = "OTHER"
ISSUE_LABELS = {
    PRODUCT_QUALITY: "Chất lượng sản phẩm", SHIPPING_LOGISTICS: "Giao hàng và vận chuyển",
    CUSTOMER_SERVICE_RETURNS: "Dịch vụ khách hàng và đổi trả", PRICING_PROMOTIONS: "Giá cả và khuyến mãi",
    OTHER: "Vấn đề khác",
}
VALID_ISSUE_TYPES = set(ISSUE_LABELS)


def normalize_text(text):
    return normalize_issue_text(text, ISSUE_RULES)


def normalize_sentiment(sentiment):
    return {"positive": "Positive", "tích cực": "Positive", "neutral": "Neutral",
            "trung lập": "Neutral", "negative": "Negative", "tiêu cực": "Negative"}.get(str(sentiment or "").strip().lower())


def normalize_product_group(category):
    return issue_group_for_category(category)


def normalize_rating(rating):
    return decision_layer.normalize_rating(rating)


def contains_keyword(text, keyword):
    keyword = normalize_text(keyword)
    return bool(keyword and keyword_pattern(keyword).search(normalize_text(text)))


def _scoped_rules(category):
    validate_issue_rules(ISSUE_RULES)
    group = normalize_product_group(category)
    return [rule for rule in ISSUE_RULES['evidence_rules']
            if 'GENERAL' in rule['product_groups'] or group in rule['product_groups']]


def _catalog(category):
    group = normalize_product_group(category)
    catalog = {}
    for rule in _scoped_rules(category):
        scopes = rule["product_groups"]
        for keyword in rule["keywords"]:
            key = (rule["issue_type"], normalize_text(keyword))
            previous = catalog.get(key)
            rank = (rule["weight"], group in scopes and group != "GENERAL", rule["id"])
            previous_rank = (previous["weight"], group in previous["product_groups"] and group != "GENERAL", previous["id"]) if previous else None
            if previous_rank is None or rank > previous_rank:
                catalog[key] = rule
    return catalog


def get_keywords_for_category(category):
    grouped = {}
    for issue_type, keyword in _catalog(category):
        grouped.setdefault(issue_type, []).append(keyword)
    return grouped


def _review_check(sentiment, rating):
    label, stars = normalize_sentiment(sentiment), normalize_rating(rating)
    policy = ISSUE_RULES["review_policy"]
    triggers = []
    if label in policy["request_on_sentiments"]:
        triggers.append("sentiment_requests_check")
    if stars is not None and stars <= policy["low_rating_max"]:
        triggers.append("low_rating_requests_check")
    if stars is not None and ((label == "Negative" and stars >= policy["high_rating_min"])
                              or (label == "Positive" and stars <= policy["low_rating_max"])):
        triggers.append("sentiment_rating_conflict")
    return {"requested": bool(triggers), "triggers": triggers, "sentiment": label, "rating": stars}


def get_issue_evidence(content, category="GENERAL", *, sentiment=None, rating=None, context_rules=None):
    evidence = build_issue_evidence(content, _catalog(category), ISSUE_RULES, context_rules if context_rules is not None else decision_layer.SENTIMENT_RULES,
                                    pattern_rules=_scoped_rules(category))
    evidence["review_check"] = _review_check(sentiment, rating)
    return evidence


def has_explicit_issue_keyword(text, category="GENERAL"):
    threshold = ISSUE_RULES["scoring"]["threshold"]
    return any(item["accepted"] and item["weight"] >= threshold for item in get_issue_evidence(text, category)["occurrences"])


def should_check_issue(text, sentiment, rating=None, category="GENERAL"):
    if normalize_sentiment(sentiment) not in ISSUE_RULES["decision_policy"]["eligible_sentiments"]:
        return False
    return _review_check(sentiment, rating)["requested"] or has_explicit_issue_keyword(text, category)


def _score_evidence(evidence):
    scores = {kind: 0 for kind in ISSUE_LABELS}
    matched = {kind: [] for kind in ISSUE_LABELS}
    for item in evidence["occurrences"]:
        if item["accepted"]:
            kind, keyword = item["issue_type"], item["keyword"]
            scores[kind] = max(scores[kind], item["weight"])
            if keyword not in matched[kind]:
                matched[kind].append(keyword)
    return scores, matched


def score_issues(content, sentiment=None, category="GENERAL", rating=None):
    """Diagnostic text weights only; assess_issues applies the final sentiment policy."""
    return _score_evidence(get_issue_evidence(content, category, sentiment=sentiment, rating=rating))


def _keyword_summary(keywords):
    # Legacy VARCHAR(255) remains a summary; full evidence is in JSON.
    result = []
    for word in sorted(set(keywords), key=lambda value: (-len(value), value)):
        if len(", ".join(result + [word])) <= 255:
            result.append(word)
    return ", ".join(result)


def _snapshot_match(item, clauses):
    clause = clauses[item["clause_index"]]
    return {**item, "text": clause["original_text"], "original_start": clause["original_start"],
            "original_end": clause["original_end"], "issue_text": clause["issue_text"],
            "context": clause["context"], "aspect": clause["aspect"], "aspect_label": clause["aspect_label"]}


def assess_issues(content, sentiment=None, category="GENERAL", rating=None):
    validate_issue_rules(ISSUE_RULES)
    policy = ISSUE_RULES["decision_policy"]
    label = normalize_sentiment(sentiment)
    if label not in policy["eligible_sentiments"]:
        reason_code = "positive_sentiment_skipped" if label == "Positive" else "missing_or_invalid_sentiment"
        reason = ("Review Positive không áp dụng phân loại vấn đề." if label == "Positive" else
                  "Chưa có nhãn cảm xúc hợp lệ để phân loại vấn đề.")
        check = _review_check(sentiment, rating)
        return {"issues": [], "assessment": {
            "rule_version": ISSUE_RULES["rule_version"], "category": category or "GENERAL",
            "issue_group": normalize_product_group(category), "review_check": check,
            "eligible": False, "fallback_used": False, "reason_code": reason_code, "reason": reason,
            "needs_review": False, "issue_count": 0, "scores": {kind: 0 for kind in ISSUE_LABELS},
            "threshold": ISSUE_RULES["scoring"]["threshold"], "has_weak_evidence": False,
        }, "trace": {"rule_version": ISSUE_RULES["rule_version"], "clauses": [], "occurrences": [],
                     "review_check": check, "skipped_reason": reason_code}}
    evidence = get_issue_evidence(content, category, sentiment=sentiment, rating=rating)
    scores, matched = _score_evidence(evidence)
    scoring = ISSUE_RULES["scoring"]
    detected = []
    for kind, score in scores.items():
        if score < scoring["threshold"]:
            continue
        accepted = [item for item in evidence["occurrences"] if item["issue_type"] == kind and item["accepted"]
                    and item["weight"] >= scoring["threshold"]]
        reason = f"Có bằng chứng trải nghiệm thực tế về {ISSUE_LABELS[kind].lower()}; trọng số cao nhất {score} đạt ngưỡng {scoring['threshold']}."
        details = {"rule_version": evidence["rule_version"], "context_rules_version": evidence["context_rules_version"],
                   "category": category or "GENERAL", "category_label": category_label(category),
                   "issue_group": normalize_product_group(category), "score": score, "threshold": scoring["threshold"],
                   "aggregation": scoring["aggregation"], "reason_code": "actual_rule_weight_meets_threshold", "reason": reason,
                   "classification_source": "text_rule",
                   "review_check": evidence["review_check"],
                   "matches": [_snapshot_match(item, evidence["clauses"]) for item in accepted],
                   "decisive_rule_ids": sorted({rid for item in accepted if item["weight"] == score
                                                for rid in (item['rule_id'], item.get('routing_rule_id')) if rid}),
                   "supporting_matches": [_snapshot_match(item, evidence["clauses"]) for item in evidence["occurrences"]
                                          if item["issue_type"] == kind and item["accepted"] and item["weight"] < scoring["threshold"]],
                   "excluded_occurrences": [_snapshot_match(item, evidence["clauses"]) for item in evidence["occurrences"]
                                            if item["issue_type"] == kind and not item["accepted"]]}
        detected.append({"issue_type": kind, "matched_keyword": _keyword_summary([item["keyword"] for item in accepted]), "score": score, "evidence": details})
    detected.sort(key=lambda item: item["score"], reverse=True)
    weak = any(item["accepted"] and item["weight"] < scoring["threshold"] for item in evidence["occurrences"])
    fallback = label == "Negative" and not detected
    if fallback:
        reason = "Review có nhãn cuối Negative nhưng chưa đủ bằng chứng xác định nhóm cụ thể; xếp Vấn đề khác để kiểm tra thêm."
        details = {"rule_version": evidence["rule_version"], "context_rules_version": evidence["context_rules_version"],
                   "category": category or "GENERAL", "category_label": category_label(category),
                   "issue_group": normalize_product_group(category), "classification_source": "sentiment_policy",
                   "score": 0, "threshold": scoring["threshold"], "aggregation": scoring["aggregation"],
                   "reason_code": "negative_sentiment_unclassified", "reason": reason,
                   "review_check": evidence["review_check"], "matches": [],
                   "decisive_rule_ids": [policy["negative_fallback_rule_id"]],
                   "fallback_text": str(content or ""),
                   "supporting_matches": [_snapshot_match(item, evidence["clauses"]) for item in evidence["occurrences"] if item["accepted"]],
                   "excluded_occurrences": [_snapshot_match(item, evidence["clauses"]) for item in evidence["occurrences"] if not item["accepted"]]}
        detected.append({"issue_type": policy["negative_fallback_issue_type"], "matched_keyword": "",
                         "score": 0, "evidence": details})
    needs_review = fallback or (not detected and (evidence["review_check"]["requested"] or weak))
    assessment = {"rule_version": evidence["rule_version"], "category": category or "GENERAL",
                  "issue_group": normalize_product_group(category), "review_check": evidence["review_check"],
                  "eligible": True, "fallback_used": fallback,
                  "needs_review": needs_review, "issue_count": len(detected), "scores": scores,
                  "threshold": scoring["threshold"], "has_weak_evidence": weak,
                  "reason": detected[0]["evidence"]["reason"] if fallback else
                            "Nội dung cần kiểm tra thêm; chưa đủ bằng chứng xác định vấn đề cụ thể." if needs_review else
                            "Đã xác định vấn đề từ bằng chứng trong nội dung." if detected else "Chưa có bằng chứng đủ mạnh để xác định vấn đề."}
    return {"issues": detected, "assessment": assessment, "trace": evidence}


def detect_issues(content, sentiment=None, category="GENERAL", rating=None):
    return assess_issues(content, sentiment, category, rating)["issues"]


def serialize_issue(issue):
    return {"id": issue.id, "review_id": issue.review_id, "issue_type": issue.issue_type,
            "issue_label": ISSUE_LABELS.get(issue.issue_type, issue.issue_type),
            "matched_keyword": issue.matched_keyword, "evidence": issue.evidence}

# ============================================================
# DELETE ISSUE ANALYSIS
# ============================================================


def delete_issue_analysis(
    db: Session,
    review_id: int,
) -> None:
    """Delete old issue analysis for one review."""

    db.query(
        IssueAnalysis
    ).filter(
        IssueAnalysis.review_id == review_id
    ).delete(
        synchronize_session=False
    )

# ============================================================
# SAVE ISSUE ANALYSIS
# ============================================================


def save_issue_analysis(
    db: Session,
    review_id: int,
    content: str,
    sentiment: str | None = None,
    category: str | None = "GENERAL",
    rating: int | float | None = None,
) -> list[IssueAnalysis]:
    """
    Save issue analysis for one review.

    Multi-label behavior:
        1. Delete old issues
        2. Detect again
        3. Insert all detected issues
    """

    delete_issue_analysis(
        db=db,
        review_id=review_id,
    )

    decision = assess_issues(
        content=content,
        sentiment=sentiment,
        category=category,
        rating=rating,
    )
    detected_issues = decision["issues"]
    review = db.get(Review, review_id)
    if review is not None:
        review.issue_assessment = decision["assessment"]

    results: list[IssueAnalysis] = []

    for item in detected_issues:
        issue_type = item.get("issue_type")

        if not issue_type:
            continue

        if str(issue_type).lower() in {"no_issue", "no issue", "không có vấn đề"}:
            continue

        issue = IssueAnalysis(
            review_id=review_id,
            issue_type=issue_type,
            matched_keyword=item.get(
                "matched_keyword",
                item.get("source", "issue_detection"),
            ),
            evidence=item["evidence"],
        )

        db.add(issue)
        results.append(issue)

    db.flush()
    # Bulk deletion does not refresh an already loaded relationship. Counts
    # and snapshots in the same request must see the replacement issue set.
    if review is not None:
        db.expire(review, ["issue_analysis"])

    return results

# ============================================================
# GET REVIEW ISSUES
# ============================================================


def get_review_issues(
    db: Session,
    review_id: int,
) -> list[dict[str, Any]]:
    """Get all issues of one review."""

    issues = (
        db.query(IssueAnalysis)
        .filter(IssueAnalysis.review_id == review_id)
        .all()
    )

    return [serialize_issue(issue) for issue in issues]

# ============================================================
# GET PRODUCT ISSUE SUMMARY
# ============================================================


def get_product_issue_summary(
    db: Session,
    product_id: int,
) -> dict[str, int]:
    """
    Count issue occurrences by issue type for one product.

    Since issue detection is multi-label, total issue occurrences
    can be greater than total reviews with issues.
    """

    rows = (
        db.query(
            IssueAnalysis.issue_type,
            func.count(IssueAnalysis.id),
        )
        .join(
            Review,
            Review.id == IssueAnalysis.review_id,
        )
        .filter(
            Review.product_id == product_id,
        )
        .group_by(
            IssueAnalysis.issue_type,
        )
        .all()
    )

    return {
        issue_type: count
        for issue_type, count in rows
    }

# ============================================================
# GET PRODUCT ISSUE DETAILS
# ============================================================


def get_product_issues(
    db: Session,
    product_id: int,
    page: int = 1,
    page_size: int = 20,
    issue_type: str | None = None,
) -> dict[str, Any] | None:
    """
    Get paginated issue details for one product.

    Because the system is multi-label, one review may appear more than once
    if it has multiple issue types.
    """

    if page < 1:
        page = 1

    if page_size < 1:
        page_size = 20

    if page_size > 100:
        page_size = 100

    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .first()
    )

    if product is None:
        return None

    query = (
        db.query(
            IssueAnalysis,
            Review,
        )
        .join(
            Review,
            Review.id == IssueAnalysis.review_id,
        )
        .filter(
            Review.product_id == product_id,
        )
    )

    if issue_type:
        query = query.filter(
            IssueAnalysis.issue_type == issue_type.upper(),
        )

    total = query.count()
    offset = (page - 1) * page_size

    rows = (
        query
        .order_by(
            Review.review_date.desc(),
            IssueAnalysis.id.asc(),
        )
        .offset(offset)
        .limit(page_size)
        .all()
    )

    issues = []

    for issue, review in rows:
        issues.append({
            "id": issue.id,
            "review_id": issue.review_id,
            "issue_type": issue.issue_type,
            "issue_label": ISSUE_LABELS.get(
                issue.issue_type,
                issue.issue_type,
            ),
            "matched_keyword": issue.matched_keyword,
            "evidence": issue.evidence,
            "review": {
                "id": review.id,
                "platform_review_id": review.platform_review_id,
                "content": review.content,
                "rating": review.rating,
                "review_date": review.review_date,
            },
        })

    total_pages = (
        (total + page_size - 1) // page_size
        if total
        else 0
    )

    return {
        "product_id": product.id,
        "platform_product_id": product.platform_product_id,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
        "summary": get_product_issue_summary(
            db=db,
            product_id=product_id,
        ),
        "issues": issues,
    }

# ============================================================
# GET TOP PRODUCT ISSUES
# ============================================================


def get_top_product_issues(
    db: Session,
    product_id: int,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Get top issue types of one product."""

    if limit < 1:
        limit = 10

    if limit > 100:
        limit = 100

    rows = (
        db.query(
            IssueAnalysis.issue_type,
            func.count(IssueAnalysis.id).label("count"),
        )
        .join(
            Review,
            Review.id == IssueAnalysis.review_id,
        )
        .filter(
            Review.product_id == product_id,
        )
        .group_by(
            IssueAnalysis.issue_type,
        )
        .order_by(
            func.count(IssueAnalysis.id).desc(),
        )
        .limit(limit)
        .all()
    )

    total = sum(
        count
        for _, count in rows
    )

    result = []

    for issue_type, count in rows:
        percentage = (
            round(count / total * 100, 2)
            if total
            else 0
        )

        result.append({
            "issue_type": issue_type,
            "issue_label": ISSUE_LABELS.get(
                issue_type,
                issue_type,
            ),
            "count": count,
            "percentage": percentage,
        })

    return result

# ============================================================
# GET PRODUCT ISSUE STATISTICS
# ============================================================


def get_product_issue_statistics(
    db: Session,
    product_id: int,
) -> dict[str, Any] | None:
    """Get issue statistics of one product."""

    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .first()
    )

    if product is None:
        return None

    summary = get_product_issue_summary(
        db=db,
        product_id=product_id,
    )

    total_issues = sum(summary.values())

    review_count_with_issues = (
        db.query(
            func.count(func.distinct(IssueAnalysis.review_id))
        )
        .join(
            Review,
            Review.id == IssueAnalysis.review_id,
        )
        .filter(
            Review.product_id == product_id,
        )
        .scalar()
        or 0
    )

    top_issues = get_top_product_issues(
        db=db,
        product_id=product_id,
    )

    return {
        "product_id": product.id,
        "platform_product_id": product.platform_product_id,
        "total_issue_occurrences": total_issues,
        "reviews_with_issues": review_count_with_issues,
        "issue_types": len(summary),
        "summary": summary,
        "top_issues": top_issues,
    }

# ============================================================
# HELPERS FOR PRODUCT CATEGORY
# ============================================================


def get_product_category(product: Product | None) -> str | None:
    """Safely get product category from Product model."""

    if product is None:
        return None

    for field_name in [
        "category",
        "product_category",
        "category_code",
    ]:
        value = getattr(product, field_name, None)

        if value:
            return str(value)

    return None

# ============================================================
# REANALYZE ONE REVIEW
# ============================================================


def reanalyze_review_issues(
    db: Session,
    review_id: int,
    category: str | None = None,
) -> list[IssueAnalysis] | None:
    """Reanalyze issues for one review."""

    review = (
        db.query(Review)
        .filter(Review.id == review_id)
        .first()
    )

    if review is None:
        return None

    sentiment = None

    if getattr(review, "analysis", None):
        sentiment = review.analysis.sentiment

    product = (
        db.query(Product)
        .filter(Product.id == review.product_id)
        .first()
    )

    final_category = category or get_product_category(product)

    issues = save_issue_analysis(
        db=db,
        review_id=review.id,
        content=review.content,
        sentiment=sentiment,
        category=final_category,
        rating=review.rating,
    )

    db.commit()

    return issues

# ============================================================
# REANALYZE PRODUCT ISSUES
# ============================================================


def reanalyze_product_issues(
    db: Session,
    product_id: int,
    category: str | None = None,
) -> dict[str, Any] | None:
    """Reanalyze issues for all reviews of one product."""

    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .first()
    )

    if product is None:
        return None

    final_category = category or get_product_category(product)

    reviews = (
        db.query(Review)
        .filter(Review.product_id == product_id)
        .all()
    )

    analyzed_reviews = 0
    reviews_with_issues = 0
    total_issue_occurrences = 0

    for review in reviews:
        sentiment = None

        if getattr(review, "analysis", None):
            sentiment = review.analysis.sentiment

        issues = save_issue_analysis(
            db=db,
            review_id=review.id,
            content=review.content,
            sentiment=sentiment,
            category=final_category,
            rating=review.rating,
        )

        analyzed_reviews += 1

        if issues:
            reviews_with_issues += 1

        total_issue_occurrences += len(issues)

    db.commit()

    return {
        "product_id": product_id,
        "analyzed_reviews": analyzed_reviews,
        "reviews_with_issues": reviews_with_issues,
        "total_issue_occurrences": total_issue_occurrences,
        "summary": get_product_issue_summary(
            db=db,
            product_id=product_id,
        ),
    }

# ============================================================
# COUNT DETECTED ISSUES
# ============================================================


def count_detected_issues(
    detected_issues: list[dict[str, Any]],
) -> dict[str, int]:
    """Count detected issue types from memory."""

    counter = Counter()

    for issue in detected_issues:
        issue_type = issue.get("issue_type")

        if issue_type:
            counter[issue_type] += 1

    return dict(counter)
