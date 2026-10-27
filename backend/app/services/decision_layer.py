"""Backend sentiment rules for uncertain predictions from the single AI model."""

import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

from app.services.sentiment_evidence import build_text_evidence

MODEL_CONFIDENCE_THRESHOLD = 1


# ============================================================
# RULE FILE
# ============================================================

RULE_FILE = (
    Path(__file__)
    .resolve()
    .parents[1]
    / "rules"
    / "sentiment_decision_rules.json"
)


def load_sentiment_rules() -> dict[str, Any]:
    """
    Load sentiment decision rules from JSON.

    Expected path:
        backend/app/rules/sentiment_decision_rules.json
    """

    if not RULE_FILE.exists():
        raise FileNotFoundError(
            f"Sentiment rule file not found: {RULE_FILE}"
        )

    with RULE_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


SENTIMENT_RULES = load_sentiment_rules()


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_text(text: str | None) -> str:
    if not text:
        return ""

    text = str(text).lower()
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def normalize_rating(rating: int | float | str | None) -> int | None:
    if rating is None or isinstance(rating, bool):
        return None
    try:
        value = float(rating)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(value) or not value.is_integer() or not 1 <= value <= 5:
        return None
    return int(value)


# ============================================================
# RULE HELPERS
# ============================================================

def get_rule_list(key: str) -> list[str]:
    value = SENTIMENT_RULES.get(key, [])

    if not isinstance(value, list):
        return []

    return [
        normalize_text(str(item))
        for item in value
        if normalize_text(str(item))
    ]


def get_rating_thresholds() -> tuple[int, int, int]:
    """Return validated low/neutral/high rating boundaries from the rule file."""
    keys = ("negative_rating_threshold", "neutral_rating", "positive_rating_threshold")
    values = tuple(SENTIMENT_RULES.get(key, default) for key, default in zip(keys, (2, 3, 4)))
    if any(type(value) is not int or not 1 <= value <= 5 for value in values):
        raise ValueError("Sentiment rating thresholds must be integers from 1 to 5")
    low, neutral, high = values
    if not low < neutral < high:
        raise ValueError("Expected negative_rating_threshold < neutral_rating < positive_rating_threshold")
    return low, neutral, high


CONFLICT_POLICY_DEFAULTS = {
    "positive_model_low_rating": "review_text_then_rating",
    "negative_model_high_rating": "review_text_then_rating",
    "neutral_model_extreme_rating": "rating_if_text_clear",
}


def get_conflict_policy(key: str) -> str:
    policies = SENTIMENT_RULES.get("conflict_policy", {})
    if not isinstance(policies, dict):
        raise ValueError("conflict_policy must be an object")
    default = CONFLICT_POLICY_DEFAULTS[key]
    value = policies.get(key, default)
    if value not in (default, "keep_model"):
        raise ValueError(f"Unsupported conflict_policy.{key}; expected {default} or keep_model")
    return value


def get_text_evidence(text: str) -> dict[str, Any]:
    return build_text_evidence(text, SENTIMENT_RULES)


def get_mixed_rating_label(rating: int | None) -> str | None:
    """Resolve the explicit business policy only after both polarities exist."""
    policy = SENTIMENT_RULES.get(
        "mixed_sentiment_rating_policy", {"3": "Neutral", "4": "Neutral", "5": "Positive"},
    )
    if not isinstance(policy, dict) or any(
        key not in {"1", "2", "3", "4", "5"}
        or not isinstance(label, str) or label not in {"Positive", "Negative", "Neutral"}
        for key, label in policy.items()
    ):
        raise ValueError("mixed_sentiment_rating_policy must map rating strings 1..5 to sentiment labels")
    return policy.get(str(rating)) if rating is not None else None


def detect_rating_conflict(raw_label: str, rating: int | None) -> bool:
    low, _, high = get_rating_thresholds()
    return rating is not None and (
        (raw_label == "Positive" and rating <= low)
        or (raw_label == "Negative" and rating >= high)
        or (raw_label == "Neutral" and (rating <= low or rating >= high))
    )


def requires_rating_recheck(label: str, rating: int | None) -> bool:
    low, _, high = get_rating_thresholds()
    return rating is not None and (
        (label == "Negative" and rating >= high) or (label == "Positive" and rating <= low)
    )


def get_rule_confidence(label: str) -> float:
    values = SENTIMENT_RULES.get("rule_confidence", {"Positive": 0.75, "Negative": 0.7, "Neutral": 0.6})
    if not isinstance(values, dict):
        raise ValueError("rule_confidence must be an object")
    value = values.get(label)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"Invalid rule_confidence.{label}")
    return float(value)


def get_context_limit(key: str, default: float) -> float:
    value = SENTIMENT_RULES.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"Invalid {key}")
    return float(value)


def apply_final_guards(
    final_label: str,
    final_confidence: float,
    method: str,
    rating: int | None,
    evidence: dict[str, Any],
) -> tuple[str, float, str]:
    # Validate configuration even when text has no recognized evidence.
    get_rating_thresholds()
    policies = {key: get_conflict_policy(key) for key in CONFLICT_POLICY_DEFAULTS}
    mixed_target = get_mixed_rating_label(rating)
    positive, negative = evidence["positive_score"], evidence["negative_score"]
    overall = evidence["overall_label"]
    if evidence.get('content_kind') == 'promotion':
        confidence = final_confidence if final_label == 'Neutral' else get_rule_confidence('Neutral')
        return 'Neutral', confidence, 'non_product_promotional_text'
    if evidence.get('insufficient_text'):
        confidence = final_confidence if final_label == 'Neutral' else get_rule_confidence('Neutral')
        return 'Neutral', confidence, 'insufficient_review_text'
    if positive and negative and mixed_target is not None:
        # This explicit policy takes precedence over text conclusions and the
        # legacy conflict opt-outs. Issue/risk detection still runs afterwards.
        confidence = final_confidence if mixed_target == final_label else get_rule_confidence(mixed_target)
        return mixed_target, confidence, "mixed_sentiment_rating_policy"
    target = None
    if (evidence["has_unresolved_contrast"] and not evidence["has_explicit_negative_conclusion"]
            and not evidence["has_critical_negative"] and overall is None):
        return final_label, final_confidence, "context_unresolved_preserve_model"
    if overall is not None and not evidence["has_critical_negative"]:
        target, method = overall, "explicit_overall_text"
    elif positive and negative:
        if (evidence["minor_shipping_only"] and evidence["has_positive_contrast"]
                and not evidence["has_explicit_negative_conclusion"] and not evidence["has_blocking_unknown_complaint"]):
            target, method = "Neutral", "minor_shipping_mixed_text"
        elif evidence["has_critical_negative"] or evidence["has_explicit_negative_conclusion"]:
            # A local absence of pain cannot cancel another actual failure.
            # A conflicting explicit positive conclusion is kept for review.
            if overall == "Positive":
                return final_label, final_confidence, "mixed_sentiment_preserve_model"
            target, method = "Negative", "mixed_actual_complaint"
        else:
            return final_label, final_confidence, "mixed_sentiment_preserve_model"
    elif negative:
        target, method = "Negative", "text_negative_evidence"
    elif positive:
        target = "Positive"
        method = "positive_negation_override" if evidence["has_positive_negation"] else "text_positive_evidence"
    elif evidence["has_neutral_evidence"]:
        target, method = "Neutral", "explicit_neutral_text"
    elif evidence["has_descriptive_evidence"] and final_confidence < get_context_limit("descriptive_confidence_threshold", 0.65):
        target, method = "Neutral", "descriptive_text"
    elif evidence["has_non_experiential_clauses"]:
        target, method = "Neutral", "non_experiential_text"

    if target is None:
        # Lack of a keyword is not proof that a model prediction is wrong.
        return final_label, final_confidence, "model_low_confidence_no_override"
    clear_positive = positive >= 2 and not negative and not evidence["has_blocking_unknown_complaint"]
    if (target in {"Positive", "Neutral"} and evidence["has_unclassified_actual_clauses"] and overall is None
            and not clear_positive and method not in {"descriptive_text", "minor_shipping_mixed_text"}):
        # A recognized compliment/receipt acknowledgement is insufficient to
        # dismiss another actual clause that the lexicon does not understand.
        return final_label, final_confidence, "partial_context_preserve_model"
    if target == final_label:
        return final_label, final_confidence, "model_low_confidence_text_supported"

    # Preserve the existing explicit opt-out for each model/rating conflict.
    if detect_rating_conflict(final_label, rating) and method != "positive_negation_override":
        key = {"Positive": "positive_model_low_rating", "Negative": "negative_model_high_rating",
               "Neutral": "neutral_model_extreme_rating"}[final_label]
        if policies[key] == "keep_model":
            return final_label, final_confidence, "conflict_policy_keep_model"
    # A changed label must not inherit the old label's model probability.
    return target, get_rule_confidence(target), method


def decide_result(
    text: str,
    rating: int | float | None,
    model_result: dict[str, Any],
) -> dict[str, Any]:
    """Check model/rating contradictions before trusting the confidence gate."""
    if not isinstance(model_result, dict):
        raise ValueError("AI model result must be a dictionary")
    raw_label = model_result.get("sentiment") or model_result.get("label")
    if not isinstance(raw_label, str) or raw_label not in {"Positive", "Negative", "Neutral"}:
        raise ValueError("AI model result has an invalid sentiment")
    try:
        if isinstance(model_result.get("confidence"), bool):
            raise ValueError("Boolean confidence is not a probability")
        raw_confidence = float(model_result["confidence"])
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise ValueError("AI model result has an invalid confidence") from error
    if not math.isfinite(raw_confidence) or not 0 <= raw_confidence <= 1:
        raise ValueError("AI model confidence must be between 0 and 1")

    normalized_rating = normalize_rating(rating)
    rating_recheck = requires_rating_recheck(raw_label, normalized_rating)
    conflict = detect_rating_conflict(raw_label, normalized_rating)
    result = {
        "sentiment": raw_label, "confidence": raw_confidence,
        "model_name": model_result.get("model_name", "underthesea_bilstm_custom_vocab_v3"),
        "raw_sentiment": raw_label, "raw_confidence": raw_confidence,
        "confidence_threshold": MODEL_CONFIDENCE_THRESHOLD,
        "rules_version": SENTIMENT_RULES.get("rule_version", "idea_context_v3"),
        "rules_applied": False, "label_overridden": False,
        "confidence_source": "model_probability",
        "method": "model_high_confidence", "decision_method": "model_high_confidence",
        "rating": normalized_rating, "rating_conflict": conflict,
        "rating_recheck": rating_recheck, "needs_review": False,
        "decision_reason": "confidence_gate_without_model_rating_contradiction",
    }
    if raw_confidence >= MODEL_CONFIDENCE_THRESHOLD and not rating_recheck:
        return result

    evidence = get_text_evidence(text)
    label, confidence, method = apply_final_guards(
        raw_label, raw_confidence, "model_low_confidence_no_override", normalized_rating, evidence,
    )
    if rating_recheck and raw_confidence >= MODEL_CONFIDENCE_THRESHOLD and method == "model_low_confidence_text_supported":
        method = "rating_recheck_text_supported"
    overridden = label != raw_label
    unresolved = method in {"model_low_confidence_no_override", "context_unresolved_preserve_model",
                            "partial_context_preserve_model", "mixed_sentiment_preserve_model", "conflict_policy_keep_model",
                            "insufficient_review_text"}
    low, neutral, high = get_rating_thresholds()
    rating_band = ("unknown" if normalized_rating is None else "low" if normalized_rating <= low
                   else "high" if normalized_rating >= high else "neutral" if normalized_rating == neutral
                   else "intermediate")
    return {
        **result, "sentiment": label, "confidence": confidence,
        "method": method, "decision_method": method,
        "rules_applied": True, "label_overridden": overridden,
        "confidence_source": "rule_heuristic" if overridden else "model_probability",
        "rating_conflict": conflict, "rating_band": rating_band,
        "mixed_sentiment": evidence["mixed_sentiment"],
        "recheck_outcome": ("unresolved" if unresolved else "corrected" if overridden else "confirmed") if rating_recheck else None,
        "text_rating_conflict": requires_rating_recheck(label, normalized_rating),
        "decision_reason": ("model_rating_contradiction_checked" if rating_recheck else "below_confidence_gate") + ":" + method,
        "needs_review": (evidence["mixed_sentiment"] and method == "mixed_sentiment_preserve_model")
                        or method in {"model_low_confidence_no_override", "context_unresolved_preserve_model",
                                      "partial_context_preserve_model", "insufficient_review_text"} or conflict,
        "evidence": evidence,
    }
