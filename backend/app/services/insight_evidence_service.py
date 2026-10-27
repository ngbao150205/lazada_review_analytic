"""Paginated source reviews for a narrative, scoped to one owned product."""
from sqlalchemy.orm import selectinload
from database.models import Product, Review, AnalysisHistory
from app.services.insight_service import build_product_insights


def get_insight_evidence(db, product_id, evidence_key, *, history_id=None, page=1, page_size=10):
    product = db.get(Product, product_id)
    if product is None:
        return None
    query = db.query(AnalysisHistory).filter(AnalysisHistory.product_id == product_id)
    latest = query.order_by(AnalysisHistory.analyzed_at.desc(), AnalysisHistory.id.desc()).first()
    history = query.filter(AnalysisHistory.id == history_id).first() if history_id else latest
    if history_id and history is None:
        return None
    if history and isinstance(history.insights, dict):
        insights, source = history.insights, 'snapshot'
    elif history is None or latest.id == history.id:
        reviews = db.query(Review).options(selectinload(Review.analysis), selectinload(Review.risk_detection)).filter(
            Review.product_id == product_id).all()
        insights = build_product_insights(reviews, category=product.category, context=product.collection_context)
        source = 'current'
    else:
        return None
    # Only exposed cards can be used, even if private support maps contain
    # additional candidates that did not make the displayed top three.
    keys = {item['evidence_key'] for group in ('strengths', 'weaknesses', 'priorities') for item in insights[group]}
    if evidence_key not in keys:
        return None
    ids = insights.get('_support', {}).get(evidence_key, [])
    page, page_size = max(1, page), min(50, max(1, page_size))
    selected = ids[(page - 1) * page_size:page * page_size]
    rows = db.query(Review).filter(Review.product_id == product_id, Review.id.in_(selected)).all() if selected else []
    by_id = {row.id: row for row in rows}
    return {'evidence_key': evidence_key, 'source': source, 'history_id': history.id if history else None,
            'note': 'Review gốc liên quan đến nhận xét; số lượng và trích dẫn minh họa của lần phân tích được lưu trong snapshot.',
            'reviews': [{'id': row.id, 'review_reference': row.platform_review_id, 'content': row.content,
                         'rating': row.rating, 'review_date': row.review_date} for key in selected if (row := by_id.get(key))],
            'pagination': {'page': page, 'page_size': page_size, 'total_reviews': len(ids),
                           'total_pages': (len(ids) + page_size - 1) // page_size}}
