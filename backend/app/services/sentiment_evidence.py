"""Clause-scoped sentiment evidence; independent of the model and database.

Offsets refer to each clause's normalized_text, never to the original review.
Excluded clauses remain in the trace, but cannot vote on current sentiment.
"""
import re
import unicodedata
from functools import lru_cache
from typing import Any

from app.services.sentiment_segments import split_review_ideas

WORD = r"0-9a-zà-ỹ"


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", str(text)).lower()
    text = re.sub(r"[\u200b-\u200f\ufeff]", " ", text)
    text = re.sub(r"(?<=[a-zà-ỹ])[-_]+(?=[a-zà-ỹ])", " ", text)
    # Compare base letters, retaining the first accented character in a run.
    # This also handles "hỏooooong", which a repeated-identical-char regex misses.
    out, index = [], 0
    while index < len(text):
        end = index + 1
        while end < len(text) and text[index].isalpha() and fold(text[end]) == fold(text[index]):
            end += 1
        run = text[index:end]
        out.append(next((c for c in run if c != fold(c)), run[0]) if len(run) >= 3 else run)
        index = end
    return re.sub(r"\s+", " ", "".join(out)).strip()


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c)).replace("đ", "d")


def phrase_regex(phrase: str) -> str:
    return rf"(?<![{WORD}]){re.escape(phrase)}(?![{WORD}])"


@lru_cache(maxsize=2048)
def compiled(pattern: str) -> re.Pattern:
    # Cache configuration patterns only; review texts are never cached here.
    return re.compile(pattern)


def matches_any(text: str, phrases: list[str]) -> bool:
    return any(compiled(phrase_regex(p)).search(text) for p in phrases)


def is_minor_shipping_delay(text: str) -> bool:
    """Only explicitly bounded delays of at most one day qualify as minor."""
    value = fold(normalize(text))
    match = re.search(r"\b(?:giao(?: hang)?|van chuyen|ship)\b.{0,25}?\b(?:cham|tre)\b", value)
    if not match:
        return False
    amounts = re.findall(r"\b(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(ngay|hom|gio|tuan|thang)\b", value[match.end():])
    words = dict(zip(("mot", "hai", "ba", "bon", "nam", "sau", "bay", "tam", "chin", "muoi"), range(1, 11)))
    hours = {"gio": 1, "ngay": 24, "hom": 24, "tuan": 168, "thang": 720}
    return bool(amounts) and all(0 < (int(n) if n.isdigit() else words[n]) * hours[unit] <= 24 for n, unit in amounts)


def build_text_evidence(text: str, rules: dict[str, Any]) -> dict[str, Any]:
    @lru_cache(maxsize=64)
    def phrases(key):
        value = rules.get(key, [])
        return list(dict.fromkeys(normalize(p) for p in value if isinstance(p, str) and p.strip())) if isinstance(value, list) else []

    negators = phrases("negation_words")
    alias_pattern = "|".join(re.escape(p) for p in sorted(negators, key=len, reverse=True))

    def canonical(value):
        value = normalize(value)
        if alias_pattern:
            value = re.sub(rf"(?<![{WORD}])(?:{alias_pattern})(?![{WORD}])", "không", value)
        return value

    current_markers = phrases("current_context_markers")
    clauses = split_review_ideas(text, rules)

    # Build one lexicon. Select longest non-overlapping matches across polarities,
    # so "không tốt" cannot also contribute a positive "tốt" vote.
    lexicon = {}
    for key, polarity in (("positive_evidence", "Positive"), ("negative_evidence", "Negative"),
                          ("strong_negative_keywords", "Negative"), ("negative_phrases", "Negative"),
                          ("positive_negation_patterns", "Positive")):
        for phrase in phrases(key):
            lexicon[canonical(phrase)] = (polarity, key)
    critical = [canonical(p) for p in phrases("critical_negative_patterns")]
    strong = [canonical(p) for p in phrases("strong_negative_keywords")]
    intensifiers = "|".join(re.escape(p) for p in sorted(phrases("intensifiers"), key=len, reverse=True))
    for index, clause in enumerate(clauses):
        original = normalize(clause["text"])
        clause["text"] = original
        related_later = [c for c in clauses[index + 1:]
                         if c["aspect"] == clause["aspect"] or c["aspect"] is None or clause["aspect"] is None]
        later = " ".join(normalize(c["text"]) for c in related_later)
        previous = clauses[index - 1] if index else None
        # A reviewer's explicit follow-up after a seller's explanation is an
        # actual complaint. Do not turn hearsay or hypothetical continuations
        # into experience merely because they mention "shop không hỗ trợ".
        reply_followup = bool(previous and previous['context'] == 'reported'
            and matches_any(previous['text'], phrases('reported_reply_sources'))
            and not matches_any(previous['text'], phrases('hypothetical_context_patterns'))
            and any(compiled(pattern).search(original)
                    for pattern in rules.get('reported_followup_complaint_patterns', [])))
        context = "actual"
        if matches_any(original, phrases("reported_context_patterns")) and not matches_any(original, phrases("reported_context_exceptions")):
            # A nested seller quote in "giả sử shop bảo ..." remains inside
            # the hypothetical idea, including its following comma clause.
            context = ('hypothetical' if previous and previous['context'] == 'hypothetical'
                       and previous['sentence_id'] == clause['sentence_id']
                       and clause['boundary'] in {'context', 'comma'} else 'reported')
        elif (index and clauses[index - 1]["context"] == "reported" and clause["comma_continuation"]
              and not reply_followup
              and not matches_any(original, current_markers + phrases("reported_continuation_breaks"))):
            # "Shop quảng cáo rất tốt, rất bền" is one reported claim, not
            # the reviewer's praise merely because a comma split the wording.
            context = "reported"
        elif matches_any(original, phrases("hypothetical_context_patterns")):
            context = "hypothetical"
        elif matches_any(original, phrases("usage_condition_patterns")):
            context = "usage_condition"
        elif (matches_any(original, phrases("future_uncertainty_patterns") + phrases("uncommitted_patterns"))
              and not matches_any(original, phrases("causal_uncertainty_patterns"))):
            context = "uncertain"
        elif (matches_any(original, phrases("no_experience_patterns") + phrases("reward_patterns"))
              and not matches_any(original, phrases("actual_failure_patterns"))):
            context = "no_experience"
        elif matches_any(original, phrases("informational_patterns")):
            context = "informational"
        elif clause["question_mark"] and (
            matches_any(original, phrases("question_patterns"))
            or re.search(r"(?:^|\s)có\s.+\skhông$", original)
        ):
            context = "question"
        elif (index and clauses[index - 1]["context"] == "hypothetical" and clause["comma_continuation"]
              and not matches_any(original, current_markers + phrases("reported_continuation_breaks"))):
            context = "hypothetical"
        elif matches_any(original, phrases("past_context_patterns")) and matches_any(later, current_markers + phrases("resolution_patterns")):
            context = "historical"
        # A continuation of an uncertain question does not assert a defect.
        elif (index and clauses[index - 1]["context"] in {"uncertain", "no_experience"}
              and clause["comma_continuation"] and re.search(r"\bcó\b.+\bkhông$", original)):
            context = "uncertain"

        normalized = canonical(original)
        folded_text = fold(normalized)
        candidates = []
        for phrase, (polarity, kind) in lexicon.items():
            exact_pattern = phrase_regex(phrase)
            if intensifiers:
                exact_pattern = exact_pattern.replace(r"\ ", rf"\s+(?:(?:{intensifiers})\s+)?")
            for match in compiled(exact_pattern).finditer(normalized):
                candidates.append((match.start(), match.end(), phrase, polarity, kind, "exact"))
            # Only complete unaccented multi-word phrases use the fallback;
            # never equate single words such as giá/giả or hông/hỏng.
            if len(phrase.split()) >= 2:
                for match in compiled(phrase_regex(fold(phrase))).finditer(folded_text):
                    fragment = normalized[match.start():match.end()]
                    pairs = list(zip(fragment.split(), phrase.split()))
                    if all(a == b or a == fold(a) for a, b in pairs):
                        candidates.append((match.start(), match.end(), phrase, polarity, kind, "unaccented_phrase"))
        selected = []
        for start, end, phrase, polarity, kind, source in sorted(candidates, key=lambda c: (-(c[1] - c[0]), c[0])):
            if any(start < m["end"] and end > m["start"] for m in selected):
                continue
            prefix = normalized[:start]
            negated = bool(re.search(r"(?<![a-zà-ỹ])không\s+(?:(?:phải(?:\s+là)?|hề|có|bị|được|thể|cảm thấy)\s+)?$", prefix))
            softened = bool(re.search(r"không\s+(?:quá|hẳn|đến nỗi)\s+$", prefix)) or (negated and phrase.startswith("quá "))
            if softened:
                polarity = "Neutral"
            elif negated:
                polarity = "Negative" if polarity == "Positive" else "Positive"
            selected.append({"start": start, "end": end, "text": normalized[start:end],
                             "phrase": phrase, "polarity": polarity, "kind": kind, "source": source,
                             "negated": negated, "critical": polarity == "Negative" and matches_any(phrase, critical),
                             "strong": polarity == "Negative" and (matches_any(phrase, strong) or negated)})
        clause.update({"context": context, "normalized_text": normalized, "matches": sorted(selected, key=lambda m: m["start"]),
                       "neutral": matches_any(original, phrases("neutral_evidence")),
                       "overall": matches_any(original, phrases("overall_markers")),
                       "suspected_complaint": matches_any(normalized, [canonical(p) for p in phrases("suspected_complaint_patterns")]),
                       "descriptive": matches_any(original, phrases("descriptive_patterns"))})
        for item in selected:
            item["minor_shipping_delay"] = (item["polarity"] == "Negative"
                and matches_any(item["phrase"], [canonical(p) for p in phrases("shipping_delay_patterns")])
                and is_minor_shipping_delay(original))

    active = [c for c in clauses if c["context"] == "actual"]
    negative = [m for c in active for m in c["matches"] if m["polarity"] == "Negative"]
    explicit_negative = any(matches_any(c["normalized_text"], [canonical(p) for p in phrases("overall_negative_patterns")])
                            and any(m["polarity"] == "Negative" for m in c["matches"]) for c in active)
    # Narrow irony cues need an actual complaint and an explicit negative
    # conclusion elsewhere. A compliment on its own remains positive.
    for clause in active:
        clause["sarcastic_praise"] = bool(negative and explicit_negative
            and matches_any(clause["normalized_text"], [canonical(p) for p in phrases("sarcastic_praise_patterns")]))
        if clause["sarcastic_praise"]:
            for item in clause["matches"]:
                if item["polarity"] == "Positive":
                    item["excluded_from_sentiment"] = "sarcastic_praise"
    positive = [m for c in active for m in c["matches"]
                if m["polarity"] == "Positive" and not m.get("excluded_from_sentiment")]
    for clause in clauses:
        eligible = clause["context"] == "actual"
        polarities = {m["polarity"] for m in clause["matches"] if not m.get("excluded_from_sentiment")} if eligible else set()
        if {"Positive", "Negative"} <= polarities:
            label = "Mixed"
        elif "Negative" in polarities:
            label = "Negative"
        elif "Positive" in polarities:
            label = "Positive"
        elif eligible and (clause["neutral"] or "Neutral" in polarities):
            label = "Neutral"
        else:
            label = "Unknown"
        clause.update(sentiment=label, eligible_for_aggregation=eligible,
                      reason=("no_recognized_evidence" if label == "Unknown" and eligible else
                              f"{clause['context']}_context" if not eligible else f"{label.lower()}_evidence"))
    # One idea contributes at most one vote per polarity. Repeated copies of
    # the same evidence for the same aspect do not gain extra weight.
    def supporting_ideas(polarity):
        return {(c["aspect"], tuple(sorted({m["phrase"] for m in c["matches"]
                 if m["polarity"] == polarity and not m.get("excluded_from_sentiment")})))
                for c in active if c["sentiment"] in {polarity, "Mixed"}}
    aspect_summary = {}
    for index, clause in enumerate(clauses):
        key = clause["aspect"] or "GENERAL"
        item = aspect_summary.setdefault(key, {"sentiments": set(), "clause_indexes": []})
        item["clause_indexes"].append(index)
        if clause["eligible_for_aggregation"] and clause["sentiment"] != "Unknown":
            item["sentiments"].add(clause["sentiment"])
    for item in aspect_summary.values():
        labels = item.pop("sentiments")
        item["sentiment"] = "Mixed" if "Mixed" in labels or {"Positive", "Negative"} <= labels else next(iter(labels - {"Neutral"}), "Neutral" if labels else "Unknown")
    neutral = any(c["neutral"] or any(m["polarity"] == "Neutral" for m in c["matches"]) for c in active)
    overall = None
    for clause in active:
        if not clause["overall"] or clause["sarcastic_praise"]:
            continue
        polarities = {m["polarity"] for m in clause["matches"]}
        if clause["neutral"] and not ("Negative" in polarities):
            overall = "Neutral"
        elif len(polarities) == 1:
            overall = next(iter(polarities))
    has_uncertainty = any(c["context"] in ("uncertain", "hypothetical", "question") for c in clauses)
    unresolved_contrast = any(c["relation"] in phrases("contrast_connectors") and not c["matches"] and not c["neutral"]
                              and len(c["text"].split()) >= 2
                              and not matches_any(c["text"], phrases("resolution_patterns"))
                              and not c["text"].startswith("hóa ra") for c in active)
    unclassified = any(not c["matches"] and not c["neutral"] and len(c["text"].split()) >= 2
                       and not matches_any(c["text"], phrases("resolution_patterns"))
                       and not c["text"].startswith("hóa ra") for c in active)
    blocking_unknown = any(not c["matches"] and c["suspected_complaint"] for c in active)
    content_policy = rules.get('non_product_content_policy', {})
    if not isinstance(content_policy, dict):
        raise ValueError('non_product_content_policy must be an object')
    def policy_hits(key):
        values = content_policy.get(key, [])
        if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
            raise ValueError(f'Invalid non_product_content_policy.{key}')
        value = normalize(text)
        return [v for v in values if matches_any(value, [normalize(v)])]
    promotion, invitation = policy_hits('promotion_markers'), policy_hits('invitation_markers')
    experience = policy_hits('product_experience_markers')
    promotional_only = bool(promotion and invitation and not experience and not positive and not negative)
    quality_policy = rules.get('insufficient_text_policy', {})
    minimum_length = quality_policy.get('long_token_min_length', 24)
    minimum_share = quality_policy.get('long_token_min_character_share', 0.6)
    if (type(minimum_length) is not int or minimum_length < 20
            or type(minimum_share) not in (int, float) or not 0.5 <= minimum_share <= 1):
        raise ValueError('Invalid insufficient_text_policy thresholds')
    # Inspect the answer after field headers, without silently correcting an
    # unknown word such as "dẹp" to "đẹp". Valid complaints/praise win over
    # noise; long model numbers/URLs do not match alphabetic-only tokens.
    answer = ' '.join(c['text'] for c in active)
    answer = re.sub(r'(?:https?://|www\.)\S+', ' ', answer)
    tokens = re.findall(r'(?<![\w/])[a-zà-ỹ]+(?![\w/])', answer)
    long_tokens = [token for token in tokens if len(token) >= minimum_length]
    character_share = sum(map(len, long_tokens)) / max(1, sum(map(len, tokens)))
    insufficient_text = bool(long_tokens and character_share >= minimum_share
                             and not positive and not negative and not blocking_unknown)
    return {
        'content_kind': 'promotion' if promotional_only else 'product_review',
        'insufficient_text': insufficient_text,
        'text_quality': {'long_token_count': len(long_tokens),
                         'long_token_character_share': round(character_share, 3)},
        'content_markers': {'promotion': promotion, 'invitation': invitation, 'product_experience': experience},
        "positive_score": len(supporting_ideas("Positive")), "negative_score": len(supporting_ideas("Negative")),
        "aspect_summary": aspect_summary,
        "has_positive_negation": any(m["kind"] == "positive_negation_patterns" or m["negated"] for m in positive),
        "has_negative_phrase": any(m["kind"] == "negative_phrases" or m["negated"] for m in negative),
        "has_strong_negative": any(m["strong"] or m["critical"] for m in negative),
        "has_critical_negative": any(m["critical"] for m in negative),
        "has_explicit_negative_conclusion": explicit_negative,
        "has_sarcastic_praise": any(c["sarcastic_praise"] for c in active),
        "future_uncertainty_not_negative": has_uncertainty and not negative,
        "has_uncertain_clauses": has_uncertainty,
        "has_non_experiential_clauses": any(c["context"] != "actual" for c in clauses),
        "has_neutral_evidence": neutral, "overall_label": overall,
        "has_unresolved_contrast": unresolved_contrast,
        "has_unclassified_actual_clauses": unclassified,
        "has_blocking_unknown_complaint": blocking_unknown,
        "has_descriptive_evidence": any(c["descriptive"] for c in active) and not positive and not negative and not blocking_unknown,
        "minor_shipping_only": bool(negative) and all(m["minor_shipping_delay"] for m in negative),
        "has_positive_contrast": any(c["relation"] in phrases("contrast_connectors")
            and any(m["polarity"] == "Positive" for m in c["matches"]) for c in active),
        "mixed_sentiment": bool(positive and negative), "clauses": clauses,
    }
