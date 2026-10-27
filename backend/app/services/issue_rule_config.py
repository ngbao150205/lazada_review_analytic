"""Validated, explicit evidence weights; no weights inferred from phrase length."""
import json
import math
import re
from pathlib import Path

ISSUE_TYPES = {'PRODUCT_QUALITY', 'SHIPPING_LOGISTICS', 'CUSTOMER_SERVICE_RETURNS', 'PRICING_PROMOTIONS', 'OTHER'}
GROUPS = {'GENERAL', 'FMCG_BEAUTY_HEALTH', 'ELECTRONICS_TECH', 'FASHION_ACCESSORIES'}


def validate_patterns(patterns, name):
    if not isinstance(patterns, list):
        raise ValueError(f'Invalid issue patterns: {name}')
    for pattern in patterns:
        if not isinstance(pattern, str) or not pattern.strip():
            raise ValueError(f'Invalid issue pattern: {name}')
        try:
            compiled = re.compile(pattern)
        except re.error as error:
            raise ValueError(f'Invalid issue pattern: {name}') from error
        if compiled.search('') is not None:
            raise ValueError(f'Issue pattern must not match empty text: {name}')


def validate_issue_rules(rules):
    scoring = rules.get('scoring', {})
    if scoring.get('aggregation') != 'max_rule_weight':
        raise ValueError('Issue scoring.aggregation must be max_rule_weight')
    threshold = scoring.get('threshold')
    if type(threshold) not in (int, float) or not math.isfinite(threshold) or threshold <= 0:
        raise ValueError('Issue scoring.threshold must be positive and finite')
    if not isinstance(rules.get('rule_version'), str) or not rules['rule_version']:
        raise ValueError('Issue rules require rule_version')
    protected = rules.get('protected_phrases', [])
    if not isinstance(protected, list) or any(not isinstance(v, str) or not v.strip() for v in protected):
        raise ValueError('Invalid issue protected_phrases')
    segmentation = rules.get('segmentation', {})
    if not isinstance(segmentation, dict):
        raise ValueError('Issue segmentation must be an object')
    headers = segmentation.get('aspect_field_labels', [])
    if not isinstance(headers, list) or any(not isinstance(v, str) or not v.strip() for v in headers):
        raise ValueError('Invalid issue segmentation.aspect_field_labels')
    decision = rules.get('decision_policy', {})
    if decision.get('eligible_sentiments') != ['Neutral', 'Negative']:
        raise ValueError('Issue decision_policy.eligible_sentiments must be Neutral and Negative')
    if decision.get('negative_fallback_issue_type') != 'OTHER':
        raise ValueError('Issue negative fallback must be OTHER')
    fallback_id = decision.get('negative_fallback_rule_id')
    if not isinstance(fallback_id, str) or not fallback_id.strip():
        raise ValueError('Issue negative fallback requires a rule id')
    policy = rules.get('review_policy', {})
    low, high = policy.get('low_rating_max'), policy.get('high_rating_min')
    if type(low) is not int or type(high) is not int or not 1 <= low < high <= 5:
        raise ValueError('Issue review_policy requires 1 <= low_rating_max < high_rating_min <= 5')
    sentiments = policy.get('request_on_sentiments')
    if not isinstance(sentiments, list) or any(label not in {'Positive', 'Negative', 'Neutral'} for label in sentiments):
        raise ValueError('Invalid issue review_policy.request_on_sentiments')
    registry = rules.get('evidence_rules')
    if not isinstance(registry, list) or not registry:
        raise ValueError('Issue evidence_rules must be a nonempty list')
    ids = set()
    for rule in registry:
        if not isinstance(rule, dict):
            raise ValueError('Each issue evidence rule must be an object')
        rule_id = rule.get('id')
        if not isinstance(rule_id, str) or not rule_id.strip() or rule_id in ids:
            raise ValueError('Issue rule ids must be nonempty and unique')
        ids.add(rule_id)
        if rule.get('issue_type') not in ISSUE_TYPES:
            raise ValueError(f'Invalid issue type: {rule_id}')
        scopes = rule.get('product_groups')
        if not isinstance(scopes, list) or not scopes or any(group not in GROUPS for group in scopes):
            raise ValueError(f'Invalid product_groups: {rule_id}')
        weight = rule.get('weight')
        if type(weight) not in (int, float) or not math.isfinite(weight) or weight <= 0:
            raise ValueError(f'Invalid issue rule weight: {rule_id}')
        if rule.get('strength') not in {'weak', 'moderate', 'strong'}:
            raise ValueError(f'Invalid issue rule strength: {rule_id}')
        if type(rule.get('requires_negative_context')) is not bool:
            raise ValueError(f'Invalid requires_negative_context: {rule_id}')
        for key in ('excluded_aspects', 'required_aspects', 'negation_subjects'):
            aspects = rule.get(key, [])
            if not isinstance(aspects, list) or any(not isinstance(a, str) or not a.strip() for a in aspects):
                raise ValueError(f'Invalid {key}: {rule_id}')
        if not isinstance(rule.get('reason'), str) or not rule['reason'].strip():
            raise ValueError(f'Missing issue rule reason: {rule_id}')
        keywords = rule.get('keywords')
        if not isinstance(keywords, list) or not keywords or any(not isinstance(k, str) or not k.strip() for k in keywords):
            raise ValueError(f'Invalid keywords: {rule_id}')
        validate_patterns(rule.get('patterns', []), rule_id)
        validate_patterns(rule.get('required_context_patterns', []), rule_id)
        if rule.get('context_scope', 'same_idea') not in {'same_idea', 'same_or_previous_idea'}:
            raise ValueError(f'Invalid context_scope: {rule_id}')
    routes = rules.get('routing_rules', [])
    if not isinstance(routes, list):
        raise ValueError('Issue routing_rules must be a list')
    for route in routes:
        if not isinstance(route, dict):
            raise ValueError('Issue route must be an object')
        rid = route.get('id')
        if not isinstance(rid, str) or not rid.strip() or rid in ids:
            raise ValueError('Issue route ids must be nonempty and unique')
        ids.add(rid)
        if route.get('from_issue_type') not in ISSUE_TYPES or route.get('to_issue_type') not in ISSUE_TYPES:
            raise ValueError(f'Invalid issue route types: {rid}')
        if not isinstance(route.get('reason'), str) or not route['reason'].strip() or not route.get('patterns'):
            raise ValueError(f'Missing issue route reason/patterns: {rid}')
        validate_patterns(route['patterns'], rid)
    return rules


def load_issue_rules(path: Path):
    with path.open(encoding='utf-8') as file:
        return validate_issue_rules(json.load(file))
