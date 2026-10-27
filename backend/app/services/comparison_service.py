"""Compare full aspect evidence on saved reviews, without AI/crawler calls."""
import copy
import json
import re
from collections import Counter
from datetime import datetime, time, timedelta
from pathlib import Path

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import joinedload

from database.models import Product, Review, AnalysisHistory, ProductComparison, ComparisonReview
from app.services.category_service import CATEGORIES, category_label
from app.services.insight_service import build_product_insights
from app.services.rating_summary import summarize_ratings

RULES = json.loads((Path(__file__).resolve().parents[1] / 'rules' / 'comparison_rules.json').read_text())


class ComparisonNotFound(LookupError):
    pass


class ComparisonBusy(RuntimeError):
    pass


def percentage(count, total):
    return round(count * 100 / total, 1) if total else None


def public_comparison(row):
    result = {'id': row.id, 'created_at': row.created_at.isoformat(),
              **{key: copy.deepcopy(value) for key, value in row.payload.items() if not key.startswith('_')}}
    # Stored narratives use A/B references. Render their names on a copy so
    # legacy snapshots also read naturally without rewriting saved evidence.
    names = {side.upper(): product['name'] for side, product in result['products'].items()}
    def named(text):
        return re.sub(r'\b[AB]\b', lambda match: names[match.group()], text)
    for items in result['findings'].values():
        for item in items:
            for field in ('title', 'text', 'action'):
                if isinstance(item.get(field), str):
                    item[field] = named(item[field])
    result['warnings'] = [named(note) for note in result['warnings']]
    return result


def owned_comparison(db, product_id, comparison_id, owner_id):
    row = db.query(ProductComparison).filter_by(id=comparison_id, product_a_id=product_id, owner_id=owner_id).first()
    if row is None or db.query(Product.id).filter(Product.id.in_([row.product_a_id, row.product_b_id]),
                                                Product.owner_id == owner_id).count() != 2:
        raise ComparisonNotFound('Không tìm thấy lần so sánh.')
    return row


def _side(product, reviews, insights, history):
    counts = Counter(r.analysis.sentiment for r in reviews if r.analysis and r.analysis.sentiment in {'Positive', 'Neutral', 'Negative'})
    dates = [r.review_date for r in reviews if r.review_date is not None]
    return {'id': product.id, 'name': product.name, 'category': product.category,
            'category_label': category_label(product.category), 'platform': product.platform,
            'total_reviews': len(reviews), 'analyzed_reviews': sum(counts.values()),
            'sentiments': {label: {'count': counts[label], 'percentage': percentage(counts[label], sum(counts.values()))}
                           for label in ('Positive', 'Neutral', 'Negative')},
            'rating': summarize_ratings(reviews), 'scope': insights['scope'],
            'model_versions': dict(Counter(r.analysis.model_version or 'unknown' for r in reviews if r.analysis)),
            'sentiment_rule_versions': dict(Counter((r.analysis.decision_details or {}).get('rules_version') or 'unknown'
                                                   for r in reviews if r.analysis)),
            'latest_analysis_history_id': history.id if history else None,
            'latest_analysis_at': history.analyzed_at.isoformat() if history else None,
            'review_date_from': min(dates).isoformat() if dates else None,
            'review_date_to': max(dates).isoformat() if dates else None,
            'undated_reviews': sum(r.review_date is None for r in reviews),
            'risk_count': len(insights['_support'].get('risk', [])),
            'strengths': insights['strengths'], 'weaknesses': insights['weaknesses']}


def compare_aspects(a, b, total_a, total_b):
    """Policy thresholds describe observations, not statistical significance."""
    rows = []
    b_by_id = {item['id']: item for item in b}
    for left in a:
        right = b_by_id.get(left['id'])
        if right is None:
            continue
        sufficient = (min(total_a, total_b) >= RULES['min_reviews_per_product']
                      and min(left['mentioned_reviews'], right['mentioned_reviews']) >= RULES['min_mentions_per_product'])
        row = {'id': left['id'], 'title': left['title'], 'action': left['action'],
               'sufficient': sufficient, 'a': {}, 'b': {}}
        for side, item, total in [('a', left, total_a), ('b', right, total_b)]:
            row[side] = {key: item[key] for key in ('positive_count', 'negative_count', 'mentioned_reviews', 'positive_key', 'negative_key')}
            for polarity in ('positive', 'negative'):
                # No aspect evidence is unknown, not a zero complaint rate.
                row[side][f'{polarity}_percentage'] = percentage(item[f'{polarity}_count'], total) if item['mentioned_reviews'] else None
        for polarity in ('positive', 'negative'):
            count_a, count_b = left[f'{polarity}_count'], right[f'{polarity}_count']
            delta = (100 * count_a / total_a - 100 * count_b / total_b) if min(left['mentioned_reviews'], right['mentioned_reviews']) else None
            row[f'{polarity}_delta_pp'] = round(delta, 1) if delta is not None else None
            comparable = sufficient and max(count_a, count_b) >= RULES['min_polarity_reviews']
            row[f'{polarity}_relation'] = ('insufficient' if not comparable else 'similar'
                if abs(delta) < RULES['difference_percentage_points'] else 'a_more' if delta > 0 else 'b_more')
        rows.append(row)
    return rows


def _findings(aspects, products, comparable):
    strengths, weaknesses, priorities = [], [], []
    for side in ('a', 'b'):
        count = products[side]['risk_count']
        if count:
            priorities.append({'title': f"Xác minh phản ánh gian lận/hàng giả ở {side.upper()}", 'count': count,
                               'text': f'{count} review có nội dung cần xác minh; chưa phải kết luận về người bán.',
                               'action': 'Đối chiếu đơn hàng, nguồn gốc sản phẩm và chứng từ trước khi kết luận.',
                               'side': side, 'evidence_key': 'risk', 'priority': 0})
    for row in aspects:
        left, right = row['a'], row['b']
        base = {'title': row['title'], 'topic': row['id'], 'action': row['action'], 'side': 'a'}
        # Do not call an aspect an advantage when praise AND complaints are
        # higher, or when praise AND complaints favor the opposite product.
        if comparable and row['positive_relation'] == 'a_more' and row['negative_relation'] != 'a_more':
            strengths.append({**base, 'action': 'Duy trì trải nghiệm đang được khen; chỉ truyền thông lợi thế trong phạm vi bằng chứng đã xác minh.',
                              'count': left['positive_count'], 'evidence_key': left['positive_key'],
                              'text': f"A có tỷ lệ review khen cao hơn B {row['positive_delta_pp']:g} điểm phần trăm trong mẫu.",
                              'difference': row['positive_delta_pp']})
        elif comparable and row['negative_relation'] == 'b_more' and row['positive_relation'] != 'b_more':
            strengths.append({**base, 'side': 'b', 'count': right['negative_count'], 'evidence_key': right['negative_key'],
                              'action': 'Duy trì cách phục vụ hoặc kiểm soát chất lượng hiện có; tiếp tục theo dõi phản hồi mới.',
                              'text': f"A có tỷ lệ review phàn nàn thấp hơn B {abs(row['negative_delta_pp']):g} điểm phần trăm trong mẫu; chưa phải kết luận A không có lỗi.",
                              'difference': abs(row['negative_delta_pp'])})
        if comparable and row['negative_relation'] == 'a_more':
            weaknesses.append({**base, 'count': left['negative_count'], 'evidence_key': left['negative_key'],
                               'text': f"A có tỷ lệ review phàn nàn cao hơn B {row['negative_delta_pp']:g} điểm phần trăm trong mẫu.",
                               'difference': row['negative_delta_pp']})
        if left['negative_count'] >= RULES['min_polarity_reviews']:
            both = right['negative_count'] >= RULES['min_polarity_reviews']
            priorities.append({**base, 'count': left['negative_count'], 'evidence_key': left['negative_key'],
                               'priority': 1 if comparable and row['negative_relation'] == 'a_more' and row['id'] in RULES['functional_topics'] else 2,
                               'text': f"{left['negative_count']}/{products['a']['total_reviews']} review của A phản ánh khía cạnh này."
                                       + (' Cả hai sản phẩm đều có phản ánh; đây có thể là cơ hội cải thiện trải nghiệm.' if both else ''),
                               'difference': row['negative_delta_pp'] or 0})
    unknown = products['a'].get('scope', {}).get('unclassified_negative_reviews', 0)
    if unknown:
        priorities.append({'title': 'Rà soát review chưa xác định vấn đề của A', 'count': unknown,
                           'text': f'{unknown} review Negative chưa có bằng chứng đủ rõ để gán khía cạnh.',
                           'action': 'Đọc các bình luận liên quan, xác minh trải nghiệm thực tế trước khi chọn biện pháp cải thiện.',
                           'side': 'a', 'evidence_key': 'unclassified', 'priority': 3})
    strengths.sort(key=lambda item: (-item['difference'], -item['count'], item['title']))
    weaknesses.sort(key=lambda item: (-item['difference'], -item['count'], item['title']))
    priorities.sort(key=lambda item: (item['priority'], -item.get('difference', 0), -item['count'], item['title']))
    return {'strengths': strengths[:RULES['max_findings']], 'weaknesses': weaknesses[:RULES['max_findings']],
            'priorities': priorities[:3]}


def create_comparison(db, product_id, competitor_id, *, owner_id, start_date=None, end_date=None):
    if product_id == competitor_id:
        raise ValueError('Hãy chọn hai sản phẩm khác nhau.')
    if start_date and end_date and start_date > end_date:
        raise ValueError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')
    try:
        # Shared locks prevent reanalysis from replacing one side mid-read;
        # ordered IDs prevent A/B and B/A comparisons from deadlocking.
        try:
            products = db.query(Product).filter(Product.id.in_([product_id, competitor_id]), Product.owner_id == owner_id).order_by(
                Product.id).with_for_update(read=True, nowait=True).all()
        except OperationalError as error:
            if getattr(error.orig, 'sqlstate', None) == '55P03':
                raise ComparisonBusy('Sản phẩm đang được phân tích lại. Vui lòng thử so sánh khi hoàn tất.') from error
            raise
        if len(products) != 2:
            raise ComparisonNotFound('Không tìm thấy sản phẩm.')
        by_id = {p.id: p for p in products}
        selected = {'a': by_id[product_id], 'b': by_id[competitor_id]}
        query = db.query(Review).options(joinedload(Review.analysis), joinedload(Review.risk_detection)).filter(
            Review.product_id.in_([product_id, competitor_id]))
        if start_date:
            query = query.filter(Review.review_date >= datetime.combine(start_date, time.min))
        if end_date:
            query = query.filter(Review.review_date < datetime.combine(end_date, time.min) + timedelta(days=1))
        reviews = {'a': [], 'b': []}
        for review in query.order_by(Review.id).all():
            if review.content and review.content.strip():
                reviews['a' if review.product_id == product_id else 'b'].append(review)
        if not all(reviews.values()):
            raise ValueError('Mỗi sản phẩm cần ít nhất một review có bình luận trong phạm vi đã chọn.')
        insights, metrics = {}, {}
        for side, product in selected.items():
            insights[side] = build_product_insights(reviews[side], category=product.category,
                context=product.collection_context, include_all_aspects=True)
            latest = db.query(AnalysisHistory).filter_by(product_id=product.id).order_by(AnalysisHistory.analyzed_at.desc(), AnalysisHistory.id.desc()).first()
            metrics[side] = _side(product, reviews[side], insights[side], latest)
        same_category = selected['a'].category == selected['b'].category and selected['a'].category in CATEGORIES
        aspect_lists = {side: data['aspects'] if same_category else [item for item in data['aspects'] if item['id'] in RULES['common_topics']]
                        for side, data in insights.items()}
        aspects = compare_aspects(aspect_lists['a'], aspect_lists['b'], len(reviews['a']), len(reviews['b']))
        warnings = ['Kết quả chỉ phản ánh review đã lưu; không đại diện toàn bộ khách hàng. Tỷ lệ phàn nàn không phải tỷ lệ sản phẩm lỗi.',
                    'Cần chọn hai sản phẩm cùng công dụng và phân khúc; cùng ngành hàng chưa bảo đảm tương đương.']
        if not same_category:
            warnings.append('Khác ngành hàng hoặc chưa xác định ngành hàng: chỉ đối chiếu đóng gói, giao hàng và hỗ trợ; chưa kết luận lợi thế sản phẩm.')
        if any(len(rows) < RULES['min_reviews_per_product'] for rows in reviews.values()):
            warnings.append('Mẫu nhỏ: chưa đủ số review để kết luận chênh lệch theo khía cạnh.')
        if metrics['a']['model_versions'].keys() != metrics['b']['model_versions'].keys() or any(
                len(item['model_versions']) != 1 or 'unknown' in item['model_versions'] for item in metrics.values()):
            warnings.append('Phiên bản model cảm xúc khác nhau hoặc chưa rõ. Cảm xúc chỉ để tham khảo; khía cạnh được đọc lại bằng cùng bộ rule hiện tại.')
        if metrics['a']['sentiment_rule_versions'].keys() != metrics['b']['sentiment_rule_versions'].keys() or any(
                len(item['sentiment_rule_versions']) != 1 or 'unknown' in item['sentiment_rule_versions'] for item in metrics.values()):
            warnings.append('Phiên bản rule tạo nhãn cảm xúc khác nhau hoặc chưa rõ. Dùng Phân tích AI lại nếu cần đồng bộ nhãn; so sánh này không tự thay đổi kết quả cảm xúc.')
        if any(item['analyzed_reviews'] < item['total_reviews'] for item in metrics.values()):
            warnings.append('Một phần review chưa có nhãn cảm xúc. Có thể dùng Phân tích AI lại để bổ sung; không suy ra cảm xúc từ số sao.')
        if start_date or end_date:
            warnings.append('Bộ lọc dùng ngày review; review thiếu ngày được loại khỏi cả hai bên.')
        warnings.extend(f"{side.upper()}: {item['scope']['note']}" for side, item in metrics.items()
                        if item['scope']['collection'].get('last_status') not in {None, 'FULL'})
        payload = {'rule_version': RULES['rule_version'],
                   'versions': {key: insights['a'][key] for key in ('rule_version', 'context_rules_version', 'issue_rules_version', 'risk_rules_version')},
                   'window': {'start_date': start_date.isoformat() if start_date else None, 'end_date': end_date.isoformat() if end_date else None,
                              'source': 'current_saved_reviews'},
                   'products': metrics, 'aspects': aspects, 'findings': _findings(aspects, metrics, same_category),
                   'comparability': {'same_category': same_category, 'scope': 'category_aspects' if same_category else 'common_experience_only'},
                   'policy': RULES, 'warnings': warnings,
                   'counting_note': 'Mỗi review được đếm một lần cho mỗi khía cạnh và chiều khen/chê. Mẫu số là tổng review có bình luận trong phạm vi; khen và chê có thể chồng lấp. Chênh lệch tính bằng điểm phần trăm, không phải kết luận thống kê.',
                   '_support': {side: data['_support'] for side, data in insights.items()}}
        snapshot = ProductComparison(owner_id=owner_id, product_a_id=product_id, product_b_id=competitor_id, payload=payload)
        db.add(snapshot); db.flush()
        for side, rows in reviews.items():
            supported = {rid for ids in payload['_support'][side].values() for rid in ids}
            db.add_all([ComparisonReview(comparison_id=snapshot.id, side=side, source_review_id=row.id,
                review_reference=row.platform_review_id, content=row.content, rating=row.rating, review_date=row.review_date)
                for row in rows if row.id in supported])
        db.commit()
        return public_comparison(snapshot)
    except Exception:
        db.rollback()
        raise


def comparison_evidence(db, snapshot, *, side, evidence_key, page, page_size):
    support = snapshot.payload['_support'].get(side, {})
    allowed = {'risk'} | {row[side][f'{polarity}_key'] for row in snapshot.payload['aspects'] for polarity in ('positive', 'negative')}
    allowed |= {item['evidence_key'] for group in ('strengths', 'weaknesses') for item in snapshot.payload['products'][side][group]}
    allowed |= {item['evidence_key'] for item in snapshot.payload['findings']['priorities'] if item['side'] == side}
    if evidence_key not in allowed or evidence_key not in support:
        raise ComparisonNotFound('Không có bằng chứng cho khía cạnh này.')
    ids = support[evidence_key]
    selected = ids[(page - 1) * page_size:page * page_size]
    rows = db.query(ComparisonReview).filter_by(comparison_id=snapshot.id, side=side).filter(ComparisonReview.source_review_id.in_(selected)).all() if selected else []
    by_id = {row.source_review_id: row for row in rows}
    return {'side': side, 'evidence_key': evidence_key, 'source': 'snapshot',
            'reviews': [{'id': row.source_review_id, 'review_reference': row.review_reference, 'content': row.content,
                         'rating': row.rating, 'review_date': row.review_date} for rid in selected if (row := by_id.get(rid))],
            'pagination': {'page': page, 'page_size': page_size, 'total_reviews': len(ids), 'total_pages': (len(ids) + page_size - 1) // page_size}}
