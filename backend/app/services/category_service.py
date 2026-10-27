"""Classify product titles with auditable, configurable Vietnamese type phrases."""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote, urlsplit


RULE_FILE = Path(__file__).resolve().parents[1] / "rules" / "product_category_rules.json"
ISSUE_GROUPS = {"GENERAL", "FMCG_BEAUTY_HEALTH", "ELECTRONICS_TECH", "FASHION_ACCESSORIES"}


def normalize_text(text: str | None) -> str:
    """Preserve accents and word boundaries, including in NFD and URL slugs."""
    text = unicodedata.normalize("NFC", str(text or "")).lower()
    return " ".join(re.findall(r"[^\W_]+", text, flags=re.UNICODE))


@lru_cache(maxsize=512)
def _fold(text: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", text.replace("đ", "d"))
                   if not unicodedata.combining(ch))


def load_category_rules(path: Path = RULE_FILE) -> dict:
    with path.open(encoding="utf-8") as file:
        rules = json.load(file)
    if not isinstance(rules.get("rule_version"), str) or not rules.get("categories"):
        raise ValueError("Category rules require a version and categories")
    for code, rule in rules["categories"].items():
        if not re.fullmatch(r"[A-Z][A-Z_]{0,49}", code) or code == "GENERAL":
            raise ValueError(f"Invalid category code: {code}")
        if not rule.get("label") or rule.get("issue_group") not in ISSUE_GROUPS:
            raise ValueError(f"Invalid category label or issue group: {code}")
        if type(rule.get("priority")) is not int:
            raise ValueError(f"Invalid category priority: {code}")
        for field in ("keywords", "aliases", "exclude"):
            values = rule.get(field)
            if not isinstance(values, list) or any(not isinstance(v, str) or not normalize_text(v) for v in values):
                raise ValueError(f"Invalid {field}: {code}")
        if not rule["keywords"]:
            raise ValueError(f"Missing category keywords: {code}")
        preferred_over = rule.get("prefer_primary_type_over", [])
        if not isinstance(preferred_over, list) or any(other not in rules["categories"] for other in preferred_over):
            raise ValueError(f"Invalid primary type preference: {code}")
    if any(group not in ISSUE_GROUPS for group in rules.get("legacy_issue_groups", {}).values()):
        raise ValueError("Invalid legacy issue group")
    qualifiers = rules.get("title_qualifiers", [])
    if not isinstance(qualifiers, list) or any(not isinstance(q, str) or not normalize_text(q) for q in qualifiers):
        raise ValueError("Invalid title qualifiers")
    return rules


CATEGORY_RULES = load_category_rules()
CATEGORY_RULES_VERSION = CATEGORY_RULES["rule_version"]
CATEGORIES = CATEGORY_RULES["categories"]
CATEGORY_KEYWORDS = {code: rule["keywords"] for code, rule in CATEGORIES.items()}
PRODUCT_GROUP_MAPPING = {code: rule["issue_group"] for code, rule in CATEGORIES.items()}
PRODUCT_GROUP_MAPPING.update(CATEGORY_RULES.get("legacy_issue_groups", {}))


def _category_code(category: str | None) -> str:
    return re.sub(r"[\s-]+", "_", str(category or "").strip().upper())


def category_label(category: str | None) -> str:
    code = _category_code(category)
    if code == "PACKAGING":
        return "Bao bì (nhóm cũ)"
    return CATEGORIES.get(code, {}).get("label", "Khác / Chưa xác định")


def issue_group_for_category(category: str | None) -> str:
    code = _category_code(category)
    return code if code in ISSUE_GROUPS else PRODUCT_GROUP_MAPPING.get(code, "GENERAL")


@lru_cache(maxsize=2048)
def _phrase_patterns(phrase: str):
    value = normalize_text(phrase)
    return value, re.compile(rf"(?<!\w){re.escape(value)}(?!\w)"), re.compile(
        rf"(?<!\w){re.escape(_fold(value))}(?!\w)")


def _matches(text: str, phrase: str) -> list[tuple[int, int]]:
    value, exact, folded = _phrase_patterns(phrase)
    spans = {match.span() for match in exact.finditer(text)}
    # Accentless titles/slugs may match multiword phrases. Accented words must
    # still agree: "quầng" must never match "quần", nor "trả" -> "trà".
    if " " in value:
        for match in folded.finditer(_fold(text)):
            actual = text[match.start():match.end()].split()
            if all(_fold(a) == a or a == b for a, b in zip(actual, value.split())):
                spans.add(match.span())
    return sorted(spans)


def _classify_text(text: str) -> dict:
    candidates = []
    for code, rule in CATEGORIES.items():
        exclusions = [span for phrase in rule["exclude"] for span in _matches(text, phrase)]
        evidence = []
        for kind, strength in (("keywords", 2), ("aliases", 1)):
            for phrase in rule[kind]:
                spans = _matches(text, phrase)
                spans = [(start, end) for start, end in spans if not any(left <= start for left, _ in exclusions)]
                if spans:
                    evidence.append({"phrase": phrase, "kind": kind, "spans": spans,
                                     "rank": (strength, len(normalize_text(phrase).split()), rule["priority"])})
        if evidence:
            best = max(item["rank"] for item in evidence)
            candidates.append({"category": code, "rank": best, "evidence": evidence})
    if not candidates:
        return {"category": "GENERAL", "reason": "unrecognized", "matched_keywords": [], "candidates": []}
    # A laptop's keyboard/specifications do not turn it into an accessory.
    # This only applies to explicit main-device words appearing first, never
    # aliases like "iPhone" in a case title, or explicit multi-product bundles.
    suppressed = set()
    for primary in candidates:
        positions = [start for item in primary["evidence"] if item["kind"] == "keywords" for start, _ in item["spans"]]
        if not positions:
            continue
        for other in candidates:
            if other["category"] not in CATEGORIES[primary["category"]].get("prefer_primary_type_over", []):
                continue
            other_start = min(start for item in other["evidence"] for start, _ in item["spans"])
            between = text[min(positions):other_start]
            if min(positions) < other_start and not re.search(r"\b(và|combo|gồm|and)\b", between):
                suppressed.add(other["category"])
    candidates = [candidate for candidate in candidates if candidate["category"] not in suppressed]
    top_rank = max(candidate["rank"] for candidate in candidates)
    winners = [candidate for candidate in candidates if candidate["rank"] == top_rank]
    codes = sorted(candidate["category"] for candidate in candidates)
    if len(winners) != 1:
        return {"category": "GENERAL", "reason": "ambiguous", "matched_keywords": [], "candidates": codes}
    winner = winners[0]
    return {"category": winner["category"], "reason": "type_keyword" if top_rank[0] == 2 else "model_alias",
            "matched_keywords": sorted({item["phrase"] for item in winner["evidence"]}),
            "candidates": codes, "_evidence": winner["evidence"]}


def _classify_title(text: str) -> dict:
    text = normalize_text(text)
    result = _classify_text(text)
    boundaries = sorted({start for phrase in CATEGORY_RULES.get("title_qualifiers", [])
                         for start, _ in _matches(text, phrase) if start > 0})
    for boundary in boundaries:
        # Keep an actual type phrase spanning a qualifier (e.g. pet food).
        if any(start < boundary < end for item in result.get("_evidence", []) for start, end in item["spans"]):
            continue
        primary = _classify_text(text[:boundary].strip())
        if primary["category"] != "GENERAL":
            primary["reason"] = "primary_title_" + primary["reason"]
            result = primary
            break
    result.pop("_evidence", None)
    return result


def detect_category(text: str | None) -> str:
    return _classify_title(text or "")["category"]


def _lazada_slug(url: str | None) -> str:
    """Only the public product slug is evidence; query/tracking/IDs are not."""
    try:
        parsed = urlsplit(url or "")
        if parsed.scheme not in {"https", "http"} or parsed.hostname not in {"lazada.vn", "www.lazada.vn", "m.lazada.vn"}:
            return ""
        match = re.fullmatch(r"/products/(.+)-i\d+(?:-s\d+)?\.html/?", unquote(parsed.path), re.IGNORECASE)
        return match.group(1) if match and match.group(1).lower() != "pdp" else ""
    except ValueError:
        return ""


def classify_product(product_name: str | None, product_url: str | None = None, *,
                     existing_category: str | None = None) -> dict:
    result = _classify_title(product_name or "")
    source = "name"
    # A known name wins over a conflicting URL. An ambiguous name is kept
    # unresolved rather than letting unrelated URL words break a tie.
    if result["reason"] == "unrecognized":
        slug_result = _classify_title(_lazada_slug(product_url))
        if slug_result["reason"] != "unrecognized":
            result, source = slug_result, "url_slug"
    previous = _category_code(existing_category)
    if result["category"] == "GENERAL":
        if previous in PRODUCT_GROUP_MAPPING or previous in ISSUE_GROUPS - {"GENERAL"}:
            result = {**result, "category": previous, "reason": "preserved_existing_" + result["reason"]}
            source = "existing"
        else:
            source = "none"
    code = result["category"]
    return {**result, "label": category_label(code), "issue_group": issue_group_for_category(code),
            "source": source, "rule_version": CATEGORY_RULES_VERSION}


def detect_product_category(product_name: str | None, product_url: str | None = None, *,
                            existing_category: str | None = None) -> str:
    return classify_product(product_name, product_url, existing_category=existing_category)["category"]
