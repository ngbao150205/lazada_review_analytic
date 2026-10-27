"""Authenticated, immutable comparisons scoped to the base product's owner."""
import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import User, Product, ProductComparison
from app.security.auth import get_current_user
from app.api.products import require_owned_product
from app.services.comparison_service import (create_comparison, owned_comparison, public_comparison,
    comparison_evidence, ComparisonNotFound, ComparisonBusy)

router = APIRouter(prefix='/products/{product_id}/comparisons', tags=['Product comparisons'])
logger = logging.getLogger(__name__)


class ComparisonRequest(BaseModel):
    competitor_id: int = Field(gt=0)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode='after')
    def check_window(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')
        if self.end_date == date.max:
            raise ValueError('Ngày kết thúc vượt phạm vi hỗ trợ.')
        return self


@router.post('', status_code=201)
def create(product_id: int, request: ComparisonRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return create_comparison(db, product_id, request.competitor_id, owner_id=user.id,
                                 start_date=request.start_date, end_date=request.end_date)
    except ComparisonNotFound as error:
        raise HTTPException(404, str(error)) from error
    except ComparisonBusy as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        logger.exception('Could not save comparison for product %s', product_id)
        raise HTTPException(500, 'Không thể lưu so sánh. Vui lòng thử lại.') from error


@router.get('')
def history(product_id: int, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50),
            db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_owned_product(db, product_id, user.id)
    query = db.query(ProductComparison).filter_by(owner_id=user.id, product_a_id=product_id).join(
        Product, Product.id == ProductComparison.product_b_id).filter(Product.owner_id == user.id)
    total = query.count()
    rows = query.order_by(ProductComparison.created_at.desc(), ProductComparison.id.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {'comparisons': [{'id': row.id, 'created_at': row.created_at, 'competitor_name': row.payload['products']['b']['name'],
                             'competitor_id': row.product_b_id, 'window': row.payload['window']} for row in rows],
            'pagination': {'page': page, 'page_size': page_size, 'total': total, 'total_pages': (total+page_size-1)//page_size}}


@router.get('/{comparison_id}')
def detail(product_id: int, comparison_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return public_comparison(owned_comparison(db, product_id, comparison_id, user.id))
    except ComparisonNotFound as error:
        raise HTTPException(404, str(error)) from error


@router.get('/{comparison_id}/evidence')
def evidence(product_id: int, comparison_id: int, side: Literal['a', 'b'], evidence_key: str = Query(max_length=100),
             page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50),
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        row = owned_comparison(db, product_id, comparison_id, user.id)
        return comparison_evidence(db, row, side=side, evidence_key=evidence_key, page=page, page_size=page_size)
    except ComparisonNotFound as error:
        raise HTTPException(404, str(error)) from error
