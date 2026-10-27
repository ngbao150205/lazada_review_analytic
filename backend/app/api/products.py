import logging
from requests import RequestException

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.schemas.product import (
    AnalyzeProductRequest,
)

from database.connection import (
    get_db,
)

from database.models import (
    Product,
    User,
    Review,
)

from typing import Optional

from app.services.product_service import (
    analyze_product,
)
from app.services.crawler_client import CrawlerServiceError
from app.services.reanalysis_service import (
    reanalyze_product, ReanalysisProductNotFound, ReanalysisEmptyProduct, ReanalysisBusy,
)
from app.security.auth import get_current_user
from app.services.category_service import category_label, issue_group_for_category
from app.services.insight_evidence_service import get_insight_evidence

from app.services.product_analysis_service import (
    get_product_analysis,
    get_product_histories,
)

from app.services.review_service import (
    get_product_reviews,
)


router = APIRouter(
    prefix="/products",
    tags=["Products"],
    dependencies=[Depends(get_current_user)],
)

logger = logging.getLogger(__name__)

def require_owned_product(db, product_id, owner_id):
    if not db.query(Product.id).filter(Product.id == product_id, Product.owner_id == owner_id).first():
        raise HTTPException(404, "Product not found")


@router.get("/collection-config")
def collection_config():
    return {"provider": "crawler"}


# ============================================================
# GET PRODUCTS HISTORY
# ============================================================
# Dùng cho trang Lịch sử phân tích.
# API này lấy danh sách sản phẩm đã lưu trong database.
# Endpoint:
#   GET /products
#   GET /products/
# ============================================================

@router.get("")
@router.get("/")
def get_products_api(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        review_count_subquery = (
            db.query(
                Review.product_id.label("product_id"),
                func.count(Review.id).label("review_count"),
            )
            .group_by(Review.product_id)
            .subquery()
        )

        products = (
            db.query(
                Product.id,
                Product.platform,
                Product.platform_product_id,
                Product.name,
                Product.url,
                Product.seller_name,
                Product.rating,
                Product.total_reviews,
                Product.product_type,
                Product.category,
                Product.is_active,
                Product.created_at,
                Product.updated_at,
                Product.last_crawled_at,
                review_count_subquery.c.review_count,
            )
            .outerjoin(
                review_count_subquery,
                review_count_subquery.c.product_id == Product.id,
            )
            .filter(Product.owner_id == user.id)
            .order_by(Product.created_at.desc())
            .all()
        )

        return {
            "products": [
                {
                    "id": product.id,
                    "platform": product.platform,
                    "platform_product_id": product.platform_product_id,
                    "name": product.name,
                    "url": product.url,
                    "seller_name": product.seller_name,
                    "rating": product.rating,
                    "total_reviews": product.review_count
                    if product.review_count is not None
                    else product.total_reviews,
                    "stored_total_reviews": product.total_reviews,
                    "product_type": product.product_type,
                    "category": product.category,
                    "category_label": category_label(product.category),
                    "issue_group": issue_group_for_category(product.category),
                    "is_active": product.is_active,
                    "created_at": product.created_at,
                    "updated_at": product.updated_at,
                    "last_crawled_at": product.last_crawled_at,
                }
                for product in products
            ]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


# ============================================================
# ANALYZE PRODUCT
# ============================================================
# Endpoint:
#   POST /products/analyze
# Body:
#   {
#       "url": "https://www.lazada.vn/products/...-i123-s456.html"
#   }
# ============================================================

@router.post("/analyze")
def analyze_product_endpoint(
    request: AnalyzeProductRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        result = analyze_product(
            db=db,
            url=request.url,
            owner_id=user.id,
        )

        return result

    except CrawlerServiceError as e:
        headers = {"Retry-After": e.retry_after} if e.retry_after else None
        if e.error_code:
            headers = {**(headers or {}), "X-Crawl-Error-Code": e.error_code}
        raise HTTPException(status_code=e.status_code, detail=str(e), headers=headers) from e

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except Exception as e:
        logger.exception("Product analysis failed")
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/{product_id}/reanalyze")
def reanalyze_product_endpoint(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Re-run AI, sentiment rules, issues and risks on saved reviews; never crawl."""
    try:
        return reanalyze_product(db, product_id, owner_id=user.id)
    except ReanalysisProductNotFound as error:
        raise HTTPException(404, str(error)) from error
    except ReanalysisEmptyProduct as error:
        raise HTTPException(400, str(error)) from error
    except ReanalysisBusy as error:
        raise HTTPException(409, str(error)) from error
    except (RequestException, ValueError) as error:
        logger.exception("AI reanalysis failed for product %s", product_id)
        raise HTTPException(502, "Không thể hoàn tất phân tích AI lại. Chưa lưu thay đổi của lượt này; vui lòng kiểm tra AI service và thử lại.") from error
    except Exception as error:
        logger.exception("Product reanalysis failed for product %s", product_id)
        raise HTTPException(500, "Không thể lưu kết quả phân tích lại. Chưa lưu thay đổi của lượt này.") from error


# ============================================================
# GET PRODUCT ANALYSIS
# ============================================================
# Endpoint:
#   GET /products/{product_id}/analysis
# ============================================================

@router.get("/{product_id}/analysis")
def get_product_analysis_api(
    product_id: int,
    history_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_owned_product(db, product_id, user.id)
    result = get_product_analysis(
        db=db,
        product_id=product_id,
        history_id=history_id,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    return result


# ============================================================
# GET PRODUCT HISTORIES
# ============================================================
# Endpoint:
#   GET /products/{product_id}/histories
# ============================================================

@router.get("/{product_id}/insights/evidence")
def get_insight_evidence_api(
    product_id: int,
    evidence_key: str,
    history_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_owned_product(db, product_id, user.id)
    result = get_insight_evidence(db, product_id, evidence_key, history_id=history_id,
                                  page=page, page_size=page_size)
    if result is None:
        raise HTTPException(404, "Không có bằng chứng cho nhận xét/lần phân tích này.")
    return result


@router.get("/{product_id}/histories")
def get_product_histories_api(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_owned_product(db, product_id, user.id)
    result = get_product_histories(
        db=db,
        product_id=product_id,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    return {"histories": result}


# ============================================================
# GET PRODUCT REVIEWS
# ============================================================
# Endpoint:
#   GET /products/{product_id}/reviews?page=1&page_size=10
# ============================================================

@router.get("/{product_id}/reviews")
def get_product_reviews_api(
    product_id: int,
    page: int = 1,
    page_size: int = 10,
    rating: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_owned_product(db, product_id, user.id)
    result = get_product_reviews(
        db=db,
        product_id=product_id,
        page=page,
        page_size=page_size,
        rating=rating,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found",
        )

    return result
