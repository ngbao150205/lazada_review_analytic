import sys
from pathlib import Path
from datetime import datetime


# ============================================================
# ADD PROJECT ROOT TO PYTHON PATH
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(
        0,
        str(PROJECT_ROOT)
    )


# ============================================================
# IMPORT APPLICATION
# ============================================================

from sqlalchemy.orm import Session

from database.connection import SessionLocal
from database.models import Review, ReviewAnalysis
from app.services.ai_client import predict_sentiment


MODEL_VERSION = "underthesea_bilstm_custom_vocab_v3"


# ============================================================
# REBUILD SENTIMENT ANALYSIS
# ============================================================

def rebuild_sentiment_analysis(
    db: Session
):
    """
    Rebuild toàn bộ ReviewAnalysis.

    Script này:

    - Không crawl lại sản phẩm
    - Có gọi Sentiment AI
    - Có truyền rating sang ai-service
    - Có cập nhật ReviewAnalysis
    - Không rebuild IssueAnalysis
    - Không rebuild RiskDetection
    """

    reviews = (
        db.query(Review)
        .order_by(
            Review.id
        )
        .all()
    )

    total = len(
        reviews
    )

    rebuilt = 0
    skipped = 0
    failed = 0

    print(
        f"Found {total} reviews."
    )

    print(
        "Starting Sentiment Analysis rebuild..."
    )

    print()

    for index, review in enumerate(
        reviews,
        start=1
    ):
        if not review.content:

            skipped += 1

            print(
                f"[{index}/{total}] "
                f"Review {review.id}: "
                f"SKIPPED - empty content"
            )

            continue

        try:
            ai_result = predict_sentiment(
                text=review.content,
                rating=review.rating
            )

            if not isinstance(
                ai_result,
                dict
            ):
                raise ValueError(
                    "predict_sentiment() must return a dictionary"
                )

            final_result = (
                ai_result.get("final")
                or {}
            )

            sentiment = final_result.get(
                "sentiment"
            )

            confidence = final_result.get(
                "confidence",
                0
            )

            method = final_result.get(
                "method"
            )

            if not sentiment:
                raise ValueError(
                    "AI result does not contain final.sentiment"
                )

            try:
                confidence = float(
                    confidence
                )
            except (TypeError, ValueError):
                confidence = 0.0

            analysis = review.analysis

            if analysis is None:

                analysis = ReviewAnalysis(
                    review_id=review.id
                )

                db.add(
                    analysis
                )

            analysis.sentiment = sentiment
            analysis.confidence = confidence
            analysis.model_version = final_result.get("model_name") or MODEL_VERSION
            analysis.analysis_method = method
            analysis.decision_details = final_result

            review.is_analyzed = True
            review.updated_at = datetime.utcnow()

            rebuilt += 1

            print(
                f"[{index}/{total}] "
                f"Review {review.id}: "
                f"REBUILT - {sentiment} "
                f"({confidence}) "
                f"[{method}]"
            )

            if rebuilt % 20 == 0:
                db.commit()

        except Exception as e:

            failed += 1

            print(
                f"[{index}/{total}] "
                f"Review {review.id}: "
                f"FAILED - {e}"
            )

    db.commit()

    print()
    print("=" * 60)
    print("SENTIMENT REBUILD COMPLETED")
    print("=" * 60)
    print(f"Total reviews : {total}")
    print(f"Rebuilt       : {rebuilt}")
    print(f"Skipped       : {skipped}")
    print(f"Failed        : {failed}")
    print("=" * 60)


# ============================================================
# MAIN
# ============================================================

def main():

    db = SessionLocal()

    try:

        rebuild_sentiment_analysis(
            db
        )

    except Exception:

        db.rollback()

        raise

    finally:

        db.close()


if __name__ == "__main__":
    main()
