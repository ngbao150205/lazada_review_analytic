import argparse
import sys

from pathlib import Path


# ============================================================
# PROJECT PATH
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))


# ============================================================
# IMPORTS
# ============================================================

from database.connection import SessionLocal
from database.models import Review, ReviewAnalysis
from app.services.risk_service import save_risk_detection


# ============================================================
# REBUILD RISK DETECTION
# ============================================================

def rebuild_risk_detection(
    product_id: int | None = None,
    batch_size: int = 500
) -> None:
    """
    Rebuild risk detection for existing reviews.

    Logic:
    - Lấy toàn bộ reviews trong DB.
    - Lấy sentiment đã phân tích từ ReviewAnalysis.
    - Chạy lại save_risk_detection().
    - Update RiskDetection cũ nếu đã có.
    - Insert RiskDetection mới nếu chưa có.
    """

    db = SessionLocal()

    try:
        query = (
            db.query(Review)
            .order_by(Review.id.asc())
        )

        if product_id is not None:
            query = query.filter(
                Review.product_id == product_id
            )

        total_reviews = query.count()

        print("=" * 60)
        print("REBUILD RISK DETECTION")
        print(f"Total reviews: {total_reviews}")

        if product_id is not None:
            print(f"Product ID filter: {product_id}")

        print("=" * 60)

        processed = 0
        risk_true = 0

        offset = 0

        while offset < total_reviews:

            reviews = (
                query
                .offset(offset)
                .limit(batch_size)
                .all()
            )

            if not reviews:
                break

            for review in reviews:

                analysis = (
                    db.query(ReviewAnalysis)
                    .filter(
                        ReviewAnalysis.review_id == review.id
                    )
                    .first()
                )

                sentiment = (
                    analysis.sentiment
                    if analysis is not None
                    else None
                )

                risk = save_risk_detection(
                    db=db,
                    review_id=review.id,
                    content=review.content,
                    sentiment=sentiment,
                    rating=review.rating,
                )

                processed += 1

                if risk.risk_flag:
                    risk_true += 1

            db.commit()

            offset += batch_size

            print(
                f"Processed {min(offset, total_reviews)}/{total_reviews}"
            )

        print("=" * 60)
        print("DONE")
        print(f"Processed reviews: {processed}")
        print(f"Risk flag TRUE: {risk_true}")
        print(f"No fraud/counterfeit keyword alert: {processed - risk_true}")
        print("=" * 60)

    except Exception as error:
        db.rollback()
        print("REBUILD RISK DETECTION FAILED")
        print(error)
        raise

    finally:
        db.close()


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Rebuild risk detection for reviews"
    )

    parser.add_argument(
        "--product-id",
        type=int,
        default=None,
        help="Only rebuild risk detection for one product ID"
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Number of reviews processed per batch"
    )

    args = parser.parse_args()

    rebuild_risk_detection(
        product_id=args.product_id,
        batch_size=args.batch_size
    )


if __name__ == "__main__":
    main()