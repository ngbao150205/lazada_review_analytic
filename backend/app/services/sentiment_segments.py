"""Split review ideas before whitespace normalization; retain original spans."""
import re
import unicodedata


WORD = r"0-9a-zà-ỹ"


def _pattern(phrases):
    return "|".join(re.escape(p) for p in sorted(set(phrases), key=len, reverse=True))


def split_review_ideas(text, rules):
    raw = str(text or "")
    # NFC composition can change offsets. Map each composed character back to
    # the complete original grapheme, including decomposed Vietnamese accents.
    source, starts, ends = [], [], []
    for group in re.finditer(r"[^\u0300-\u036f][\u0300-\u036f]*|[\u0300-\u036f]+", raw):
        value = unicodedata.normalize("NFC", group.group())
        source.append(value)
        starts.extend([group.start()] * len(value))
        ends.extend([group.end()] * len(value))
    source = re.sub(r"[\u200b-\u200f\ufeff]", " ", "".join(source))
    if not source.strip():
        return []
    aspects = rules.get("aspect_keywords", {})
    if not isinstance(aspects, dict) or any(
        not isinstance(key, str) or not isinstance(terms, list)
        or any(not isinstance(term, str) or not term.strip() for term in terms)
        for key, terms in aspects.items()
    ):
        raise ValueError("aspect_keywords must map aspect names to lists of nonempty phrases")

    def phrases(key):
        values = rules.get(key, [])
        return [p.lower() for p in values if isinstance(p, str) and p.strip()] if isinstance(values, list) else []

    def contains(value, values):
        pattern = _pattern(values)
        return bool(pattern and re.search(rf"(?<![{WORD}])(?:{pattern})(?![{WORD}])", value, re.I))

    protected = set()
    protect_patterns = [r"(?<=\d)[.,](?=\d)", r"(?:https?://|www\.)[^\s<>]+",
                        r"\b(?:[a-z]{1,3}\.)+[a-z]{1,3}\b", r"\b(?:[a-z]\.){2,}"]
    for pattern in protect_patterns:
        for match in re.finditer(pattern, source, re.I):
            end = match.end()
            if pattern.startswith("(?:https"):
                end -= len(match.group()) - len(match.group().rstrip(".!?;,"))
            protected.update(range(match.start(), end))
    # Keep causal uncertainty intact: splitting at "vì" in "không biết vì sao"
    # would separate the unknown cause from the observed failure that follows.
    for abbreviation in phrases("sentence_abbreviations") + phrases("causal_uncertainty_patterns"):
        for match in re.finditer(rf"(?<![{WORD}]){re.escape(abbreviation)}", source, re.I):
            protected.update(range(match.start(), match.end()))

    events = []
    for match in re.finditer(r"[.!?;,。！？；，]+|\r\n|[\r\n]", source):
        if match.start() in protected:
            continue
        delimiter = match.group()
        kind = "newline" if "\n" in delimiter or "\r" in delimiter else "comma" if delimiter in {",", "，"} else "sentence"
        if kind == "newline":
            left, right = source[:match.start()].rstrip(), source[match.end():].lstrip()
            # A visual line wrap inside "không\n tốt" or "đóng gói\n kỹ"
            # is not an independent idea. Join only a configured continuation
            # or a known phrase genuinely spanning the line boundary.
            join = any(re.search(rf"(?<![{WORD}]){re.escape(p)}$", left, re.I)
                       for p in phrases("line_continuation_endings"))
            lexicon = sum((phrases(k) for k in ("positive_evidence", "negative_evidence", "negative_phrases", "positive_negation_patterns")), [])
            left_part = re.sub(r"\s+", " ", left[-80:])
            combined = left_part + " " + re.sub(r"\s+", " ", right[:80])
            boundary = len(left_part)
            for phrase in lexicon:
                if any(m.start() < boundary < m.end() for m in re.finditer(rf"(?<![{WORD}]){re.escape(phrase)}(?![{WORD}])", combined, re.I)):
                    join = True
                    break
            if join:
                continue
        events.append((match.start(), match.end(), kind, delimiter))

    headers = phrases("aspect_field_labels")
    pattern = _pattern(headers)
    if pattern:
        for match in re.finditer(rf"(?<![{WORD}])({pattern})\s*:", source, re.I):
            events.append((match.start(), match.start(), "aspect", ""))
    connectors = phrases("clause_connectors")
    pattern = _pattern(connectors)
    if pattern:
        for match in re.finditer(rf"(?<![{WORD}])({pattern})(?![{WORD}])", source, re.I):
            if match.start() not in protected:
                events.append((match.start(), match.end(), "connector", match.group().lower()))
    markers = sum((phrases(k) for k in ("current_context_markers", "hypothetical_context_patterns",
        "future_uncertainty_patterns", "no_experience_patterns", "reported_context_patterns", "usage_condition_patterns")), [])
    pattern = _pattern(markers)
    if pattern:
        for match in re.finditer(rf"(?<![{WORD}])({pattern})(?![{WORD}])", source, re.I):
            # "giờ" in "2.5 giờ" is a unit, not a temporal update marker.
            if match.start() in protected or (match.group().lower() == "giờ" and re.search(r"\d\s*$", source[:match.start()])):
                continue
            # Keep the explicit reported-context exception intact.
            if contains(source[match.start():match.start() + 80], phrases("reported_context_exceptions")):
                continue
            events.append((match.start(), match.start(), "context", ""))

    result = []
    start, boundary, relation, sentence_id = 0, "start", "statement", 0
    header_pattern = _pattern(headers)
    last_aspect = None
    pending_field = None

    def emit(end, punctuation=""):
        nonlocal last_aspect, pending_field
        begin, finish = start, end
        while begin < finish and source[begin].isspace(): begin += 1
        while finish > begin and source[finish - 1].isspace(): finish -= 1
        if begin == finish:
            return False
        field = re.match(rf"({header_pattern})\s*:\s*", source[begin:finish], re.I) if header_pattern else None
        field_label = field.group(1).lower() if field else pending_field
        if field:
            begin += field.end()
        if begin >= finish:
            pending_field = field_label
            return False
        pending_field = None
        value = source[begin:finish]
        candidates = [(len(term), -match.start(), aspect)
                      for aspect, terms in aspects.items() for term in terms
                      for match in re.finditer(rf"(?<![{WORD}]){re.escape(term)}(?![{WORD}])", field_label or value, re.I)]
        explicit_aspect = max(candidates)[2] if candidates else None
        inherited = (boundary in {"comma", "connector", "context"} or contains(value, phrases("current_context_markers")))
        aspect = explicit_aspect or (last_aspect if inherited else None)
        if explicit_aspect and not contains(value, phrases("resolution_patterns")):
            last_aspect = explicit_aspect
        original_start, original_end = starts[begin], ends[finish - 1]
        result.append({"text": value, "original_text": raw[original_start:original_end],
            "original_start": original_start, "original_end": original_end,
            "aspect": aspect, "aspect_label": field_label, "aspect_explicit": explicit_aspect is not None,
            "boundary": boundary, "sentence_id": sentence_id, "relation": relation,
            "question_mark": "?" in punctuation or "？" in punctuation, "comma_continuation": boundary == "comma" and relation == "statement"})
        return True

    for position, stop, kind, delimiter in sorted(events, key=lambda e: (e[0], -(e[1] - e[0]))):
        if position < start:
            continue
        emitted = emit(position, delimiter if kind in {"sentence", "comma"} else "")
        start = stop
        # Do not reset a punctuation boundary with a zero-length context event
        # at the same position (e.g. after a sentence before "chưa dùng").
        if emitted or kind in {"sentence", "comma", "newline"}:
            boundary = kind
        if kind == "connector":
            relation = delimiter
        elif emitted or kind in {"sentence", "newline", "comma"}:
            relation = "statement"
        if kind in {"sentence", "newline"}:
            sentence_id += 1
    emit(len(source))
    return result
