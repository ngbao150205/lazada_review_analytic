"""Evidence-backed product narratives; no model, crawler or external API calls."""
import copy
import json
from collections import Counter
from pathlib import Path

from app.services.category_service import category_label, issue_group_for_category
from app.services.issue_service import get_issue_evidence, ISSUE_RULES
from app.services.issue_evidence import keyword_pattern
from app.services.risk_service import serialize_risk, RISK_RULE_VERSION
from app.services.decision_layer import SENTIMENT_RULES

RULE_FILE = Path(__file__).resolve().parents[1] / 'rules' / 'insight_rules.json'
INSIGHT_RULES = json.loads(RULE_FILE.read_text(encoding='utf-8'))
INSIGHT_RULE_VERSION = INSIGHT_RULES['rule_version']


def collection_context(previous, result):
    """Keep a small, explicit source description, never credentials/request headers."""
    previous = previous if isinstance(previous, dict) else {}
    source = str(result.get('crawl_source') or result.get('collection_provider') or 'unknown')[:80]
    return {'sources': sorted(set(previous.get('sources', []) + [source])),
            'last_source': source, 'last_status': str(result.get('crawl_status') or 'UNKNOWN')[:20],
            'last_batch_reviews': len(result.get('reviews') or []),
            'incomplete_stars': [s for s in result.get('incomplete_stars', []) if type(s) is int and 1 <= s <= 5],
            'scope': 'collected_reviews_only'}


def _topic(text, start, end, phrase, clause, topics, issue_type=None):
    # A subject inside the evidence phrase wins; otherwise associate the
    # closest subject in this idea, rather than assigning the whole review.
    candidates = []
    for index, topic in enumerate(topics):
        for keyword in topic['keywords']:
            for match in keyword_pattern(keyword).finditer(text):
                overlap = match.start() < end and start < match.end()
                distance = max(0, start - match.end(), match.start() - end)
                candidates.append(((topic['id'] == 'quality', not overlap, distance, -len(keyword), index), topic))
    if candidates:
        return min(candidates, key=lambda item: item[0])[1]
    for topic in topics:
        if clause.get('aspect') in topic.get('aspects', []):
            return topic
    for topic in topics:
        if issue_type and issue_type in topic.get('issue_types', []):
            return topic
    return next(topic for topic in topics if topic['id'] == 'quality')


def build_product_insights(reviews, *, category='GENERAL', context=None, include_all_aspects=False):
    """Count distinct reviews per aspect/polarity, with bounded example quotes.

    Private support IDs allow paginated evidence lookup. Public responses omit
    them so a dashboard does not download a product's entire list of review IDs.
    """
    rules = INSIGHT_RULES
    parser_rules = {**SENTIMENT_RULES}
    for polarity in ('positive_evidence', 'negative_evidence'):
        parser_rules[polarity] = list(dict.fromkeys(SENTIMENT_RULES.get(polarity, []) + rules.get(polarity, [])))
    reviews = list(reviews)
    total = len(reviews)
    group = issue_group_for_category(category)
    topics = [topic for topic in rules['topics'] if not topic.get('groups') or group in topic['groups']]
    buckets = {topic['id']: {'positive': set(), 'negative': set(), 'examples': {'positive': [], 'negative': []}}
               for topic in topics}
    sentiments = Counter()
    unclassified, risk_ids, excluded, recognized = [], [], 0, set()
    risk_examples, unknown_examples = [], []

    def example(review, quote, polarity, rule_id):
        return {'review_id': review.id, 'review_reference': str(review.platform_review_id),
                'quote': quote[:400], 'rating': review.rating, 'polarity': polarity, 'rule_id': rule_id}

    def record(review, topic, polarity, clause, rule_id):
        bucket = buckets[topic['id']]
        if review.id not in bucket[polarity] and len(bucket['examples'][polarity]) < rules['max_examples']:
            bucket['examples'][polarity].append(example(review, clause['original_text'], polarity, rule_id))
        bucket[polarity].add(review.id)
        recognized.add(review.id)

    for review in reviews:
        label = review.analysis.sentiment if review.analysis else None
        if label in {'Positive', 'Neutral', 'Negative'}:
            sentiments[label] += 1
        if serialize_risk(review.risk_detection, review.content)['risk_flag']:
            risk_ids.append(review.id)
            if len(risk_examples) < rules['max_examples']:
                risk_examples.append(example(review, review.content, 'risk', RISK_RULE_VERSION))
        evidence = get_issue_evidence(review.content, category, context_rules=parser_rules)
        if evidence['content_kind'] != 'product_review':
            excluded += 1
            continue
        negative_topics = set()
        for clause in evidence['clauses']:
            if not clause['eligible_for_aggregation']:
                continue
            text = clause['normalized_text']
            field = clause.get('aspect_label') or ''
            for match in clause['matches']:
                if match.get('excluded_from_sentiment') or match['polarity'] not in {'Positive', 'Negative'}:
                    continue
                polarity = match['polarity'].lower()
                topic = _topic(text, match['start'], match['end'], match['phrase'], clause, topics)
                # Field headers carry the subject when the answer is simply
                # 'tốt'/'yếu'; they are not independent praise/complaint votes.
                if field and not any(keyword_pattern(k).search(text) for t in topics for k in t['keywords']):
                    topic = _topic(field, 0, len(field), field, clause, topics)
                record(review, topic, polarity, clause, f"sentiment.{match['kind']}")
                if polarity == 'negative':
                    negative_topics.add(topic['id'])
        for occurrence in evidence['occurrences']:
            if not occurrence['accepted'] or occurrence['weight'] < ISSUE_RULES['scoring']['threshold']:
                continue
            clause = evidence['clauses'][occurrence['clause_index']]
            topic = _topic(clause['issue_text'], occurrence['start'], occurrence['end'],
                           occurrence['keyword'], clause, topics, occurrence['issue_type'])
            record(review, topic, 'negative', clause, occurrence['rule_id'])
            negative_topics.add(topic['id'])
        if label == 'Negative' and not negative_topics and review.id not in risk_ids:
            unclassified.append(review.id)
            if len(unknown_examples) < rules['max_examples']:
                unknown_examples.append(example(review, review.content, 'unclassified', 'insights.unclassified_negative'))

    support = {}

    def card(topic, polarity):
        bucket = buckets[topic['id']]
        positive, negative = len(bucket['positive']), len(bucket['negative'])
        mentioned = len(bucket['positive'] | bucket['negative'])
        mixed = (min(positive, negative) >= rules['mixed_min_reviews']
                 and min(positive, negative) / mentioned >= rules['mixed_min_share'])
        key = f"{polarity}.{topic['id']}"
        ids = bucket[polarity]
        support[key] = sorted(ids)
        count = len(ids)
        if polarity == 'positive':
            text = f"{count}/{total} đánh giá có lời khen về {topic['label'].lower()}."
        else:
            text = f"{count}/{total} đánh giá có phản ánh chưa hài lòng về {topic['label'].lower()}."
        if mixed:
            text += f" Ý kiến chưa đồng nhất: {positive} đánh giá khen và {negative} đánh giá chê."
        return {'id': key, 'topic': topic['id'], 'title': topic['label'], 'count': count,
                'total_reviews': total, 'percentage': round(count / total * 100, 1) if total else 0,
                'positive_count': positive, 'negative_count': negative, 'mentioned_reviews': mentioned,
                'mixed': mixed, 'recurring': count >= rules['recurring_min_reviews'], 'text': text,
                'examples': bucket['examples'][polarity], 'evidence_key': key}

    strengths, weaknesses = [], []
    for topic in topics:
        bucket = buckets[topic['id']]
        mentioned = len(bucket['positive'] | bucket['negative'])
        if (len(bucket['positive']) >= rules['min_strength_reviews'] and mentioned
                and len(bucket['positive']) / mentioned >= rules['strength_min_positive_share']
                and len(bucket['negative']) / mentioned < rules['mixed_min_share']):
            strengths.append(card(topic, 'positive'))
        if bucket['negative']:
            weaknesses.append(card(topic, 'negative'))
    strengths.sort(key=lambda item: (-item['count'], item['id']))
    weaknesses.sort(key=lambda item: (-item['count'], item['id']))
    priorities = []
    if risk_ids:
        support['risk'] = risk_ids
        priorities.append({'id': 'verify_fraud_claims', 'title': 'Xác minh phản ánh gian lận/hàng giả',
                           'count': len(risk_ids), 'evidence_key': 'risk', 'examples': risk_examples,
                           'reason': f"{len(risk_ids)} đánh giá đề cập dấu hiệu gian lận/hàng giả; cần xác minh nội dung phản ánh.",
                           'action': 'Đối chiếu review với đơn hàng, nguồn gốc sản phẩm và chứng từ liên quan; liên hệ khách hàng để xác minh trước khi kết luận.'})
    for item in weaknesses:
        topic = next(topic for topic in topics if topic['id'] == item['topic'])
        priorities.append({'id': f"improve.{item['topic']}", 'title': ('Cải thiện ' if item['recurring'] else 'Theo dõi và kiểm tra ') + item['title'].lower(),
                           'count': item['count'], 'evidence_key': item['evidence_key'], 'examples': item['examples'],
                           'reason': f"{item['count']}/{total} đánh giá phản ánh vấn đề này." + (' Ý kiến có cả khen và chê; cần đối chiếu từng trường hợp.' if item['mixed'] else ''),
                           'action': topic['action']})
    if unclassified:
        support['unclassified'] = unclassified
        priorities.append({'id': 'review_unclassified', 'title': 'Rà soát đánh giá chưa xác định vấn đề',
                           'count': len(unclassified), 'evidence_key': 'unclassified', 'examples': unknown_examples,
                           'reason': f"{len(unclassified)} đánh giá Negative chưa có đủ bằng chứng để kết luận khía cạnh cụ thể.",
                           'action': 'Đọc các đánh giá liên quan và xác minh nội dung; chưa tự quy thành lỗi chất lượng sản phẩm.'})
    priorities.sort(key=lambda item: (item['id'] != 'verify_fraud_claims', -item['count'], item['id']))
    analyzed = sum(sentiments.values())
    def sentiment_share(label):
        return f"{sentiments[label] / analyzed * 100:.1f}".replace('.', ',') if analyzed else '0'

    overview = (f"Đã phân tích cảm xúc {analyzed}/{total} đánh giá đã lưu: "
                f"{sentiments['Positive']} tích cực ({sentiment_share('Positive')}%), "
                f"{sentiments['Neutral']} trung lập ({sentiment_share('Neutral')}%) và "
                f"{sentiments['Negative']} tiêu cực ({sentiment_share('Negative')}%).")
    if total < rules['small_sample_reviews']:
        overview += ' Số lượng đánh giá còn ít; chưa đủ cơ sở khái quát toàn bộ sản phẩm.'
    if weaknesses:
        overview += f" Khía cạnh được phản ánh chưa hài lòng nhiều nhất trong mẫu là {weaknesses[0]['title'].lower()} ({weaknesses[0]['count']}/{total} đánh giá)."
    context = context if isinstance(context, dict) else {}
    scope_note = 'Nhận xét chỉ dựa trên đánh giá đã lưu trong hệ thống, chưa đại diện cho toàn bộ khách hàng hoặc toàn bộ đánh giá trên Lazada.'
    if context.get('last_status') not in {None, 'FULL'} and context.get('last_source'):
        scope_note += ' Lượt thu thập gần nhất chỉ cung cấp một phần dữ liệu.'
    # Comparisons need the complete matrix, including topics outside the top
    # three. Missing from the dashboard's shortlist must never mean zero.
    aspects = []
    if include_all_aspects:
        for topic in topics:
            positive, negative = card(topic, 'positive'), card(topic, 'negative')
            aspects.append({'id': topic['id'], 'title': topic['label'], 'action': topic['action'],
                            'positive_count': positive['count'], 'negative_count': negative['count'],
                            'mentioned_reviews': positive['mentioned_reviews'],
                            'positive_key': positive['evidence_key'], 'negative_key': negative['evidence_key']})
    result = {'rule_version': INSIGHT_RULE_VERSION, 'context_rules_version': SENTIMENT_RULES['rule_version'],
            'issue_rules_version': ISSUE_RULES['rule_version'], 'risk_rules_version': RISK_RULE_VERSION,
            'category': category, 'category_label': category_label(category), 'overview': overview,
            'scope': {'total_reviews': total, 'analyzed_reviews': analyzed, 'recognized_reviews': len(recognized),
                      'excluded_promotional_reviews': excluded, 'unclassified_negative_reviews': len(unclassified),
                      'small_sample': total < rules['small_sample_reviews'], 'collection': context, 'note': scope_note},
            'strengths': strengths[:rules['max_items']], 'weaknesses': weaknesses[:rules['max_items']],
            'priorities': priorities[:rules['max_items']],
            'counting_note': 'Mỗi đánh giá tính một lần trong mỗi khía cạnh và chiều khen/chê; một đánh giá có thể thuộc nhiều nhóm.',
            '_support': support}
    if include_all_aspects:
        result['aspects'] = aspects
    return result


def public_insights(snapshot):
    if not isinstance(snapshot, dict):
        return None
    return {key: copy.deepcopy(value) for key, value in snapshot.items() if not key.startswith('_')}
