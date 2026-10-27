import sys
from pathlib import Path


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

from sqlalchemy.orm import Session, selectinload

from database.connection import SessionLocal
from database.models import Review

from app.services.issue_service import (
    get_product_category,
    save_issue_analysis,
)


# ============================================================
# REBUILD ISSUE ANALYSIS
# ============================================================

def rebuild_issue_analysis(
    db: Session
):
    """
    Rebuild toàn bộ IssueAnalysis
    cho các review đã tồn tại trong database.

    Script này:

    - Không crawl lại sản phẩm
    - Không gọi Sentiment AI
    - Không thay đổi ReviewAnalysis
    - Không thay đổi RiskDetection
    - Chỉ rebuild IssueAnalysis
    """

    reviews = (
        db.query(Review)
        .options(selectinload(Review.product), selectinload(Review.analysis))
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


    print(
        f"Found {total} reviews."
    )

    print(
        "Starting Issue Analysis rebuild..."
    )

    print()


    # ========================================================
    # PROCESS REVIEWS
    # ========================================================

    for index, review in enumerate(
        reviews,
        start=1
    ):

        # ----------------------------------------------------
        # EMPTY CONTENT
        # ----------------------------------------------------

        if not review.content:

            skipped += 1

            print(
                f"[{index}/{total}] "
                f"Review {review.id}: "
                f"SKIPPED - empty content"
            )

            continue


        # ----------------------------------------------------
        # GET EXISTING SENTIMENT
        # ----------------------------------------------------

        sentiment = None

        if review.analysis:

            sentiment = (
                review.analysis.sentiment
            )


        # ----------------------------------------------------
        # REBUILD ISSUE
        # ----------------------------------------------------

        save_issue_analysis(

            db=db,

            review_id=review.id,

            content=review.content,

            sentiment=sentiment,

            category=get_product_category(review.product) or "GENERAL",

            rating=review.rating,

        )


        rebuilt += 1


        print(
            f"[{index}/{total}] "
            f"Review {review.id}: "
            f"REBUILT"
        )


    # ========================================================
    # COMMIT
    # ========================================================

    db.commit()


    # ========================================================
    # SUMMARY
    # ========================================================

    print()

    print(
        "=" * 60
    )

    print(
        "ISSUE REBUILD COMPLETED"
    )

    print(
        "=" * 60
    )

    print(
        f"Total reviews : {total}"
    )

    print(
        f"Rebuilt       : {rebuilt}"
    )

    print(
        f"Skipped       : {skipped}"
    )

    print(
        "=" * 60
    )


# ============================================================
# MAIN
# ============================================================

def main():

    db = SessionLocal()

    try:

        rebuild_issue_analysis(
            db
        )

    except Exception:

        db.rollback()

        raise

    finally:

        db.close()


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()
