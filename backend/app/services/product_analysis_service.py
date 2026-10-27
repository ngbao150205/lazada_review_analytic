import json
from collections import Counter
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session, selectinload

from app.services.rating_summary import summarize_ratings
from app.services.risk_service import serialize_risk
from app.services.insight_service import build_product_insights, public_insights
from app.services.category_service import category_label, issue_group_for_category

from database.models import (
    Product,
    Review,
    AnalysisHistory,
)


def get_product_histories(
    db: Session,
    product_id: int,
) -> Optional[List[Dict[str, Any]]]:
    """
    Lấy danh sách tất cả các lần phân tích của Product từ AnalysisHistory.
    """
    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .first()
    )

    if product is None:
        return None

    histories = (
        db.query(AnalysisHistory)
        .filter(AnalysisHistory.product_id == product_id)
        .order_by(AnalysisHistory.analyzed_at.desc(), AnalysisHistory.id.desc())
        .all()
    )

    result = []
    for h in histories:
        rating_data = h.rating_summary
        if isinstance(rating_data, str):
            try:
                rating_data = json.loads(rating_data)
            except (ValueError, TypeError):
                rating_data = None
        if not isinstance(rating_data, dict):
            rating_data = None
        issue_data = h.issue_summary
        if isinstance(issue_data, str):
            try:
                issue_data = json.loads(issue_data)
            except Exception:
                issue_data = {}
        elif not isinstance(issue_data, dict):
            issue_data = {}

        risk_data = h.risk_summary
        if isinstance(risk_data, str):
            try:
                risk_data = json.loads(risk_data)
            except Exception:
                risk_data = {}
        elif not isinstance(risk_data, dict):
            risk_data = {}

        result.append({
            "id": h.id,
            "product_id": h.product_id,
            "total_reviews": h.total_reviews,
            "analyzed_reviews": h.analyzed_reviews,
            "positive_count": h.positive_count,
            "negative_count": h.negative_count,
            "neutral_count": h.neutral_count,
            "positive_rate": h.positive_rate,
            "negative_rate": h.negative_rate,
            "neutral_rate": h.neutral_rate,
            "issue_summary": issue_data,
            "risk_summary": risk_data if "FLAGGED" in risk_data else {"FLAGGED": 0},
            "risk_summary_source": "snapshot" if "FLAGGED" in risk_data else "unavailable",
            "rating_summary": rating_data,
            "analyzed_at": h.analyzed_at.isoformat() if h.analyzed_at else None,
        })

    return result


def get_product_analysis(
    db: Session,
    product_id: int,
    history_id: Optional[int] = None,
):
    """
    Lấy toàn bộ dữ liệu phân tích Product
    trực tiếp từ PostgreSQL.

    Không crawl.
    Không gọi AI.

    Data source:

        products
            ↓
        reviews
            ↓
        review_analysis
        issue_analysis
        risk_detection
            ↓
        analysis_history
    """

    # ========================================================
    # 1. FIND PRODUCT
    # ========================================================

    product = (
        db.query(Product)
        .filter(
            Product.id == product_id
        )
        .first()
    )

    if product is None:
        return None

    # ========================================================
    # 2. GET REVIEWS
    # ========================================================

    reviews = (
        db.query(Review)
        .options(selectinload(Review.analysis), selectinload(Review.issue_analysis), selectinload(Review.risk_detection))
        .filter(
            Review.product_id == product.id
        )
        .all()
    )

    # ========================================================
    # 3. COUNTERS
    # ========================================================

    sentiment_counter = Counter()
    issue_counter = Counter()
    risk_counter = Counter()

    analyzed_reviews = 0

    # ========================================================
    # 4. PROCESS REVIEWS
    # ========================================================

    for review in reviews:

        # ====================================================
        # SENTIMENT
        # ====================================================

        if review.analysis:

            sentiment = (
                review.analysis.sentiment
            )

            if sentiment:

                sentiment_counter[
                    sentiment
                ] += 1

                analyzed_reviews += 1

        # ====================================================
        # ISSUE
        # ====================================================

        for issue in review.issue_analysis:

            if issue.issue_type:

                issue_counter[
                    issue.issue_type
                ] += 1

        # ====================================================
        # RISK
        # ====================================================

        if serialize_risk(review.risk_detection, review.content)["risk_flag"]:
            risk_counter["FLAGGED"] += 1

    # ========================================================
    # 5. SENTIMENT COUNTS
    # ========================================================

    positive_count = (
        sentiment_counter.get(
            "Positive",
            0
        )
    )

    negative_count = (
        sentiment_counter.get(
            "Negative",
            0
        )
    )

    neutral_count = (
        sentiment_counter.get(
            "Neutral",
            0
        )
    )

    # ========================================================
    # 6. TOTAL REVIEWS
    # ========================================================

    total_reviews = len(
        reviews
    )

    # ========================================================
    # 7. SENTIMENT RATES
    # ========================================================

    positive_rate = (
        round(
            positive_count
            / analyzed_reviews
            * 100,
            2
        )
        if analyzed_reviews
        else 0
    )

    negative_rate = (
        round(
            negative_count
            / analyzed_reviews
            * 100,
            2
        )
        if analyzed_reviews
        else 0
    )

    neutral_rate = (
        round(
            neutral_count
            / analyzed_reviews
            * 100,
            2
        )
        if analyzed_reviews
        else 0
    )

    # ========================================================
    # 8. GET ALL HISTORIES & SELECTED RUN
    # ========================================================

    all_histories = get_product_histories(db, product.id) or []

    selected_history = None
    if history_id is not None:
        selected_history = next(
            (h for h in all_histories if h["id"] == history_id),
            None,
        )

    if selected_history is None and len(all_histories) > 0:
        selected_history = all_histories[0]

    # If we have a selected historical run, use its snapshot for analysis
    if selected_history:
        analysis_data = {
            "total_reviews": selected_history["total_reviews"],
            "analyzed_reviews": selected_history["analyzed_reviews"],
            "positive_count": selected_history["positive_count"],
            "negative_count": selected_history["negative_count"],
            "neutral_count": selected_history["neutral_count"],
            "positive_rate": selected_history["positive_rate"],
            "negative_rate": selected_history["negative_rate"],
            "neutral_rate": selected_history["neutral_rate"],
            "issue_summary": selected_history["issue_summary"],
            "risk_summary": selected_history["risk_summary"],
            "risk_summary_source": selected_history["risk_summary_source"],
            "risk_total_reviews": selected_history["total_reviews"],
            "history_id": selected_history["id"],
            "analyzed_at": selected_history["analyzed_at"],
            "rating_summary": selected_history["rating_summary"],
            "rating_summary_source": "snapshot" if selected_history["rating_summary"] is not None else "unavailable",
        }
    else:
        analysis_data = {
            "total_reviews": total_reviews,
            "analyzed_reviews": analyzed_reviews,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "positive_rate": positive_rate,
            "negative_rate": negative_rate,
            "neutral_rate": neutral_rate,
            "issue_summary": dict(issue_counter),
            "risk_summary": {"FLAGGED": risk_counter["FLAGGED"]},
            "risk_summary_source": "current",
            "risk_total_reviews": total_reviews,
            "history_id": None,
            "analyzed_at": None,
            "rating_summary": summarize_ratings(reviews),
            "rating_summary_source": "current",
        }

    # Legacy runs lack rating snapshots. Only the latest run may explicitly
    # display current ratings; never pass these off as an older run's data.
    if selected_history and selected_history["id"] == all_histories[0]["id"] and analysis_data["rating_summary"] is None:
        analysis_data["rating_summary"] = summarize_ratings(reviews)
        analysis_data["rating_summary_source"] = "current"

    # A legacy severity snapshot cannot describe the new fraud-only policy.
    # The latest dashboard may explicitly show current rules/current reviews;
    # an older selected snapshot remains unavailable rather than fabricated.
    if selected_history and selected_history["id"] == all_histories[0]["id"] and analysis_data["risk_summary_source"] == "unavailable":
        analysis_data.update(risk_summary={"FLAGGED": risk_counter["FLAGGED"]},
                             risk_summary_source="current", risk_total_reviews=total_reviews)

    snapshot = db.get(AnalysisHistory, selected_history["id"]) if selected_history else None
    if snapshot and snapshot.insights is not None:
        analysis_data["insights"] = public_insights(snapshot.insights)
        analysis_data["insights_source"] = "snapshot"
    elif not selected_history or selected_history["id"] == all_histories[0]["id"]:
        analysis_data["insights"] = public_insights(build_product_insights(
            reviews, category=product.category, context=product.collection_context))
        analysis_data["insights_source"] = "current"
    else:
        analysis_data["insights"] = None
        analysis_data["insights_source"] = "unavailable"

    latest_history = all_histories[0] if len(all_histories) > 0 else None

    # ========================================================
    # 9. RETURN
    # ========================================================

    return {
        "product": {
            "id": product.id,
            "platform_product_id": product.platform_product_id,
            "platform": product.platform,
            "name": product.name,
            "url": product.url,
            "seller_name": product.seller_name,
            "rating": product.rating,
            "product_type": product.product_type,
            "category": product.category,
            "category_label": category_label(product.category),
            "issue_group": issue_group_for_category(product.category),
            "total_reviews": product.total_reviews,
            "is_active": product.is_active,
            "created_at": product.created_at,
            "updated_at": product.updated_at,
            "last_crawled_at": product.last_crawled_at,
        },
        "analysis": analysis_data,
        "latest_history": latest_history,
        "selected_history": selected_history,
        "histories": all_histories,
    }
