"""Re-run the current AI pipeline on one owner's saved product reviews."""
import math
from collections import Counter
from datetime import datetime

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import selectinload

from database.models import Product, Review, ReviewAnalysis
from app.services import decision_layer
from app.services.insight_service import INSIGHT_RULE_VERSION, public_insights
from app.services.ai_client import predict_sentiment, UnanalyzableReview
from app.services.issue_service import save_issue_analysis, ISSUE_RULES
from app.services.category_service import classify_product
from app.services.risk_service import save_risk_detection, RISK_RULE_VERSION
from app.services.product_service import build_product_analysis, save_analysis_history, MODEL_VERSION


class ReanalysisProductNotFound(LookupError):
    pass


class ReanalysisEmptyProduct(ValueError):
    pass


class ReanalysisBusy(RuntimeError):
    pass


def reanalyze_product(db, product_id: int, *, owner_id: int):
    """Replace derived results atomically and append a fresh aggregate snapshot.

    Raw reviews, crawl timestamps and previous snapshots are preserved. There
    is no crawler call and no review-count cap. A failed AI/DB call rolls the
    transaction back, including earlier reviews in the same request.
    """
    try:
        try:
            product = db.query(Product).filter(
                Product.id == product_id, Product.owner_id == owner_id,
            ).with_for_update(nowait=True).first()
        except OperationalError as error:
            if getattr(error.orig, "sqlstate", None) == "55P03":
                raise ReanalysisBusy("Sản phẩm đang được xử lý. Vui lòng chờ tác vụ hiện tại hoàn tất.") from error
            raise
        if product is None:
            raise ReanalysisProductNotFound("Product not found")

        query = db.query(Review).filter(Review.product_id == product.id)
        total = query.count()
        if not total:
            raise ReanalysisEmptyProduct("Sản phẩm chưa có đánh giá đã lưu để phân tích lại.")

        previous_category = product.category
        classification = classify_product(product.name, product.url, existing_category=previous_category)
        category = classification["category"]
        product.category = category
        skipped = changed = 0
        methods = Counter()
        config = {
            "model_confidence_threshold": decision_layer.MODEL_CONFIDENCE_THRESHOLD,
            "sentiment_rules_version": decision_layer.SENTIMENT_RULES.get("rule_version"),
            "category_rules_version": classification["rule_version"],
            "issue_rules_version": ISSUE_RULES.get("rule_version"),
            "risk_rules_version": RISK_RULE_VERSION,
            "insight_rules_version": INSIGHT_RULE_VERSION,
        }
        for review in query.options(selectinload(Review.analysis)).order_by(Review.id).yield_per(100):
            analysis = review.analysis
            previous = analysis.sentiment if analysis else None
            try:
                result = predict_sentiment(review.content, rating=review.rating)
            except UnanalyzableReview:
                # Do not keep a stale sentiment for text the current model rejects.
                if analysis is not None:
                    db.delete(analysis)
                sentiment = None
                skipped += 1
                methods["skipped_unanalyzable"] += 1
            else:
                final = result.get("final") if isinstance(result, dict) else None
                if (not isinstance(final, dict) or not isinstance(final.get("sentiment"), str)
                        or final["sentiment"] not in {"Positive", "Negative", "Neutral"}):
                    raise ValueError("AI returned an invalid final sentiment")
                confidence = final.get("confidence")
                if (isinstance(confidence, bool) or not isinstance(confidence, (int, float))
                        or not math.isfinite(confidence) or not 0 <= confidence <= 1):
                    raise ValueError("AI returned an invalid final confidence")
                sentiment = final["sentiment"]
                if analysis is None:
                    analysis = ReviewAnalysis(review_id=review.id)
                    db.add(analysis)
                analysis.sentiment = sentiment
                analysis.confidence = confidence
                analysis.model_version = final.get("model_name") or MODEL_VERSION
                analysis.analysis_method = final.get("method")
                analysis.decision_details = final
                methods[analysis.analysis_method or "unknown"] += 1

            changed += previous != sentiment
            review.is_analyzed = sentiment is not None
            review.updated_at = datetime.utcnow()
            save_issue_analysis(db, review.id, review.content, sentiment=sentiment,
                                rating=review.rating, category=category)
            save_risk_detection(db, review.id, review.content, sentiment=sentiment, rating=review.rating)

        db.flush()
        # Issue replacement uses bulk deletes; refresh loaded relationships
        # before building counts so the new snapshot sees the new results.
        db.expire_all()
        summary = build_product_analysis(db, product)
        product.total_reviews = summary["total_reviews"]
        product.updated_at = datetime.utcnow()
        history = save_analysis_history(db, product, summary)
        public_summary = {**summary, "insights": public_insights(summary.get("insights"))}
        response = {
            "product_db_id": product.id, "analysis_history_id": history.id,
            "reanalyzed_reviews": total - skipped, "skipped_reviews": skipped,
            "changed_sentiments": changed, "analysis": public_summary,
            "analysis_config": config, "decision_methods": dict(methods),
            "classification": {**classification, "previous_category": previous_category,
                               "changed": previous_category != category},
        }
        db.commit()
        return response
    except Exception:
        db.rollback()
        raise
