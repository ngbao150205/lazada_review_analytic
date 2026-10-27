"""Binary alerts for fraud/counterfeit claims, scoped to each actual idea."""
import json
import re
from pathlib import Path

from sqlalchemy.orm import Session
from database.models import RiskDetection
from app.services.decision_layer import SENTIMENT_RULES
from app.services.issue_evidence import normalize_issue_text, keyword_pattern
from app.services.sentiment_evidence import build_text_evidence

RULE_FILE = Path(__file__).resolve().parents[1] / "rules" / "risk_rules.json"
RISK_RULES = json.loads(RULE_FILE.read_text(encoding="utf-8"))
RISK_RULE_VERSION = RISK_RULES["rule_version"]


def detect_risk(content: str, sentiment=None, rating=None) -> dict:
    """Sentiment and stars never create or suppress a fraud alert.

    Keep the existing call signature for the analysis pipeline. A keyword is a
    claim in the review, not verification that the seller committed fraud.
    """
    result = {"risk_flag": False, "risk_keyword": None}
    keywords = sorted({normalize_issue_text(k, RISK_RULES)
                       for k in RISK_RULES["risk_keywords"]}, key=len, reverse=True)
    normalized = normalize_issue_text(content, RISK_RULES)
    if not any(keyword_pattern(k).search(normalized) for k in keywords):
        return result
    negators = "|".join(re.escape(n) for n in RISK_RULES["negation_words"])
    negation = re.compile(
        rf"(?<![0-9a-zà-ỹ])(?:{negators})\s+"
        r"(?:(?:phải|là|hề|có|bị|gặp|thấy|bán|mua|nhận|dính|dấu hiệu)\s+)*"
        r"(?:(?:hàng|sản phẩm|shop)\s+)?$"
    )
    found = []
    for clause in build_text_evidence(content, SENTIMENT_RULES)["clauses"]:
        if not clause["eligible_for_aggregation"]:
            continue
        text = normalize_issue_text(clause["text"], RISK_RULES)
        occupied = []
        for keyword in keywords:
            for match in keyword_pattern(keyword).finditer(text):
                # Inspect the longest phrase once: a negated 'hàng fake' must
                # not be resurrected by its nested standalone 'fake'.
                if any(left < match.end() and match.start() < right for left, right in occupied):
                    continue
                occupied.append(match.span())
                if not negation.search(text[:match.start()]) and keyword not in found:
                    found.append(keyword)
    if found:
        result.update(risk_flag=True, risk_keyword=", ".join(found)[:255])
    return result


def serialize_risk(risk, content: str) -> dict:
    """Old saved flags are evaluated with current rules without changing history.

    Shipping/return flags from the former severity policy must never be shown
    as fraud alerts. Refreshing these derived fields does not require AI/crawl.
    """
    if risk is not None and risk.rule_version == RISK_RULE_VERSION:
        return {"risk_flag": bool(risk.risk_flag), "risk_keyword": risk.risk_keyword}
    return detect_risk(content)


def save_risk_detection(db: Session, review_id: int, content: str,
                        sentiment=None, rating=None) -> RiskDetection:
    result = detect_risk(content, sentiment=sentiment, rating=rating)
    risk = db.query(RiskDetection).filter(RiskDetection.review_id == review_id).first()
    if risk is None:
        risk = RiskDetection(review_id=review_id)
        db.add(risk)
    risk.risk_flag = result["risk_flag"]
    risk.risk_keyword = result["risk_keyword"]
    risk.risk_level = None  # Legacy nullable column; no severity is produced.
    risk.rule_version = RISK_RULE_VERSION
    db.flush()
    return risk
