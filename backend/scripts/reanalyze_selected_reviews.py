"""Reanalyze explicitly selected reviews of one owner, never the whole database.

Dry-run by default. Applying requires an exclusive backup file, refreshes issue
and risk results, and appends a new product snapshot without editing old ones.
"""
import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database.models import Product, Review, ReviewAnalysis
from app.services.ai_client import predict_sentiment
from app.services.issue_service import get_product_category, save_issue_analysis
from app.services.risk_service import save_risk_detection
from app.services.product_service import build_product_analysis, save_analysis_history


def columns(record):
    return {c.name: getattr(record, c.name) for c in record.__table__.columns} if record is not None else None


def reanalyze_selected_reviews(db, *, owner_id, review_ids, apply=False, backup_path=None, predictor=None):
    ids = list(dict.fromkeys(review_ids))
    if not ids or len(ids) > 100 or type(owner_id) is not int or owner_id < 1:
        raise ValueError("Cần owner_id và từ 1 đến 100 review ID cụ thể.")
    if apply and backup_path is None:
        raise ValueError("Phải có đường dẫn backup trước khi cập nhật dữ liệu.")
    predictor = predictor or predict_sentiment
    try:
        reviews = db.scalars(select(Review).join(Product).where(
            Product.owner_id == owner_id, Review.platform_review_id.in_(ids),
        ).options(selectinload(Review.product), selectinload(Review.analysis),
                  selectinload(Review.issue_analysis), selectinload(Review.risk_detection))).all()
        if Counter(r.platform_review_id for r in reviews) != Counter(ids):
            raise ValueError("Không tìm thấy duy nhất từng review ID trong tài khoản đã chọn; chưa cập nhật.")
        product_ids = sorted({r.product_id for r in reviews})
        # Match the product-lock order used by collection jobs.
        products = db.scalars(select(Product).where(Product.owner_id == owner_id, Product.id.in_(product_ids))
                              .order_by(Product.id).with_for_update() if apply else
                              select(Product).where(Product.owner_id == owner_id, Product.id.in_(product_ids))).all()
        plan, predictions = [], {}
        for review in reviews:
            final = predictor(review.content, rating=review.rating)["final"]
            predictions[review.id] = final
            plan.append({"review_id": review.platform_review_id, "review_db_id": review.id, "product_db_id": review.product_id,
                         "content_sha256": hashlib.sha256(review.content.encode()).hexdigest(), "rating": review.rating,
                         "before": {"analysis": columns(review.analysis), "issues": [columns(i) for i in review.issue_analysis],
                                    "risk": columns(review.risk_detection)},
                         "after": {k: final.get(k) for k in ("sentiment", "confidence", "method", "model_name", "rules_version")}})
        result = {"owner_id": owner_id, "applied": False, "reviews": plan, "new_history_ids": []}
        if not apply:
            return result
        path = Path(backup_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Never overwrite an existing backup or mutate rows before it is saved.
        with path.open("x", encoding="utf-8") as stream:
            json.dump({"created_at": datetime.now(timezone.utc).isoformat(), **result}, stream,
                      ensure_ascii=False, indent=2, default=str)
        for review in reviews:
            final = predictions[review.id]
            analysis = review.analysis
            if analysis is None:
                analysis = ReviewAnalysis(review_id=review.id)
                db.add(analysis)
            analysis.sentiment = final["sentiment"]
            analysis.confidence = final["confidence"]
            analysis.model_version = final["model_name"]
            analysis.analysis_method = final["method"]
            analysis.decision_details = final
            review.is_analyzed = True
            review.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            save_issue_analysis(db, review.id, review.content, sentiment=final["sentiment"],
                                rating=review.rating, category=get_product_category(review.product) or "GENERAL")
            save_risk_detection(db, review.id, review.content, sentiment=final["sentiment"], rating=review.rating)
        db.flush()
        # Bulk issue replacement invalidates already-loaded ORM collections.
        db.expire_all()
        for product in products:
            summary = build_product_analysis(db, product)
            product.total_reviews = summary["total_reviews"]
            history = save_analysis_history(db, product, summary)
            result["new_history_ids"].append(history.id)
        db.commit()
        result["applied"] = True
        return result
    except Exception:
        db.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner-id", type=int, required=True)
    parser.add_argument("--review-id", action="append", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    from database.connection import SessionLocal
    with SessionLocal() as db:
        result = reanalyze_selected_reviews(db, owner_id=args.owner_id, review_ids=args.review_id,
                                            apply=args.apply, backup_path=args.backup)
    print(json.dumps({"applied": result["applied"], "owner_id": result["owner_id"],
                      "reviews": [{"review_id": r["review_id"], "before": (r["before"]["analysis"] or {}).get("sentiment"),
                                   "after": r["after"]["sentiment"], "method": r["after"]["method"]} for r in result["reviews"]],
                      "new_history_ids": result["new_history_ids"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
