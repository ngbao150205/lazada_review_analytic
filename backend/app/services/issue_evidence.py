"""Occurrence-scoped issue evidence on the same v3 ideas used by sentiment.

Clause offsets reference the original review. Keyword offsets reference only
issue_text, which has its own abbreviation normalization. No model/DB calls.
"""
import re
import unicodedata
from functools import lru_cache

from app.services.sentiment_evidence import build_text_evidence

WORD = r"0-9a-zà-ỹ"


@lru_cache(maxsize=2048)
def keyword_pattern(keyword):
    return re.compile(rf"(?<![{WORD}]){re.escape(keyword)}(?![{WORD}])")


@lru_cache(maxsize=256)
def configured_pattern(pattern):
    return re.compile(rf"(?<![{WORD}])(?:{pattern})(?![{WORD}])")


def normalize_issue_text(text, rules):
    value = unicodedata.normalize("NFC", str(text or "")).lower()
    value = re.sub(r"[\u200b-\u200f\ufeff]", " ", value)
    aliases = rules.get("abbreviations", {})
    if isinstance(aliases, dict):
        for old, new in sorted(aliases.items(), key=lambda item: len(str(item[0])), reverse=True):
            old = " ".join(unicodedata.normalize("NFC", str(old)).lower().split())
            if old:
                # A usage typo such as "sài" must not rewrite the valid
                # packaging complaint "sơ sài" into "sơ sử dụng".
                protected = [match.span() for phrase in rules.get('protected_phrases', [])
                             for match in keyword_pattern(unicodedata.normalize('NFC', phrase).lower()).finditer(value)]
                value = keyword_pattern(old).sub(lambda match: match.group() if any(
                    left <= match.start() and match.end() <= right for left, right in protected
                ) else str(new).lower(), value)
    return " ".join(value.split())


def _phrases(rules, key):
    values = rules.get(key, [])
    return [normalize_issue_text(v, rules) for v in values if isinstance(v, str) and v.strip()] if isinstance(values, list) else []


def _occurrence_reason(text, keyword, start, end, clause, rules, rule):
    if not clause["eligible_for_aggregation"]:
        return clause["reason"]
    if clause.get("aspect") in rule.get("excluded_aspects", []):
        return "different_issue_aspect"
    if rule.get("required_aspects") and clause.get("aspect") not in rule["required_aspects"]:
        return "missing_required_aspect"
    if any(keyword_pattern(p).search(text) for p in _phrases(rules, "platform_policy_patterns")):
        return "platform_policy_context"
    negators = _phrases(rules, "negation_words") or ["không", "chưa", "chẳng", "chả"]
    negation = "|".join(re.escape(n) for n in sorted(set(negators), key=len, reverse=True))
    # Anchored at THIS occurrence: an earlier negated copy cannot hide a later
    # assertion in the same idea, and an internal negator belongs to the keyword
    # ("không dùng được", "chưa nhận được hàng" are genuine complaints).
    prefix = text[:start]
    subjects = [normalize_issue_text(value, rules) for value in rule.get('negation_subjects', [])]
    subject_pattern = '|'.join(re.escape(value) for value in sorted(set(subjects), key=len, reverse=True))
    bridge = rf"(?:(?:{subject_pattern})\s+)?" if subject_pattern else ''
    if re.search(rf"(?<![{WORD}])(?:{negation})\s+(?:(?:bị|có|hề|gặp|thấy|phải|là|đến|nỗi|quá)\s+)*{bridge}$", prefix):
        return "negated_occurrence"
    for phrase in _phrases(rules, "positive_phrases"):
        if phrase != keyword and any(m.start() <= start and end <= m.end() for m in keyword_pattern(phrase).finditer(text)):
            return "positive_occurrence"
    if rule["requires_negative_context"]:
        if not any(match["polarity"] == "Negative" and not match.get("excluded_from_sentiment")
                   for match in clause["matches"]):
            return "insufficient_local_evidence"
    return "actual_complaint"


def _required_context(index, clauses, rules, rule):
    patterns = rule.get('required_context_patterns', [])
    if not patterns:
        return True, []
    indexes = [index]
    if index and rule.get('context_scope') == 'same_or_previous_idea':
        indexes.append(index - 1)
    matches = []
    for candidate in indexes:
        clause = clauses[candidate]
        # A quoted promise can explain an actual missing gift; a quoted defect
        # still cannot create the complaint itself. Hypotheses are not promises.
        if clause['context'] not in {'actual', 'reported'}:
            continue
        text = clause['issue_text']
        for pattern in patterns:
            for match in configured_pattern(pattern).finditer(text):
                if match.start() == match.end():
                    continue
                check = _occurrence_reason(text, match.group(), match.start(), match.end(),
                                           {**clause, 'eligible_for_aggregation': True}, rules,
                                           {'requires_negative_context': False})
                if check == 'actual_complaint':
                    matches.append({'clause_index': candidate, 'text': clause['original_text'],
                                    'original_start': clause['original_start'], 'original_end': clause['original_end'],
                                    'matched_text': match.group(), 'pattern': pattern})
    return bool(matches), matches


def _route_occurrence(text, keyword, start, end, clause, rules, rule):
    for route in rules.get('routing_rules', []):
        if route['from_issue_type'] != rule['issue_type']:
            continue
        for pattern in route['patterns']:
            for match in configured_pattern(pattern).finditer(text):
                if match.start() <= start and end <= match.end():
                    reason = _occurrence_reason(text, match.group(), match.start(), match.end(), clause, rules, rule)
                    return route, reason
    return None, 'actual_complaint'


def build_issue_evidence(content, catalog, issue_rules, context_rules, *, pattern_rules=()):
    """Inspect every occurrence, including excluded ones, for an auditable trace.

    catalog maps (issue_type, normalized_keyword) to a configured evidence rule.
    Every occurrence is checked; scoring uses the strongest accepted rule.
    """
    # Same v3 parser and context policy; extra product field headers are local
    # to issue extraction and do not change sentiment final or its configuration.
    headers = issue_rules.get('segmentation', {}).get('aspect_field_labels', [])
    parser_rules = {**context_rules, 'aspect_field_labels': list(dict.fromkeys(
        context_rules.get('aspect_field_labels', []) + headers))}
    text_evidence = build_text_evidence(content, parser_rules)
    clauses = text_evidence["clauses"]
    occurrences = []
    for index, clause in enumerate(clauses):
        text = normalize_issue_text(clause["text"], issue_rules)
        field = normalize_issue_text(clause.get("aspect_label"), issue_rules)
        # Field labels provide the subject, not a sentiment vote: e.g.
        # "Pin: yếu", "Giao hàng:\nchậm". Non-experiential answers still fail
        # the shared context check before they can contribute issue evidence.
        if field:
            text = field + " " + text
        clause["issue_text"] = text

        def record(rule, keyword, start, end, source, pattern=None):
            reason = _occurrence_reason(text, keyword, start, end, clause, issue_rules, rule)
            contexts, route = [], None
            if reason == 'actual_complaint':
                qualified, contexts = _required_context(index, clauses, issue_rules, rule)
                if not qualified:
                    reason = 'missing_required_context'
            if reason == 'actual_complaint':
                route, reason = _route_occurrence(text, keyword, start, end, clause, issue_rules, rule)
            kind = route['to_issue_type'] if route and reason == 'actual_complaint' else rule['issue_type']
            occurrences.append({"clause_index": index, "issue_type": kind, "keyword": keyword,
                                "rule_id": rule["id"], "rule_reason": rule["reason"],
                                "weight": rule["weight"], "strength": rule["strength"],
                                "start": start, "end": end, "match_source": source, "pattern": pattern,
                                    "original_issue_type": rule['issue_type'], "context_matches": contexts,
                                    "routing_rule_id": route['id'] if route else None,
                                    "routing_reason": route['reason'] if route else None,
                                "accepted": reason == "actual_complaint", "reason": reason})

        for (issue_type, keyword), rule in catalog.items():
            for match in keyword_pattern(keyword).finditer(text):
                record(rule, keyword, match.start(), match.end(), 'keyword')
        seen = {(item['rule_id'], item['start'], item['end']) for item in occurrences if item['clause_index'] == index}
        for rule in pattern_rules:
            for pattern in rule.get('patterns', []):
                for match in configured_pattern(pattern).finditer(text):
                    if match.start() == match.end():
                        continue
                    key = (rule['id'], match.start(), match.end())
                    if key in seen:
                        continue
                    seen.add(key)
                    record(rule, match.group(), match.start(), match.end(), 'pattern', pattern)
    occurrences.sort(key=lambda item: (item["clause_index"], item["start"], -item["end"], item["issue_type"]))
    return {"content_kind": text_evidence["content_kind"],
            "rule_version": issue_rules.get("rule_version"),
            "context_rules_version": context_rules.get("rule_version"),
            "clauses": clauses, "occurrences": occurrences}
