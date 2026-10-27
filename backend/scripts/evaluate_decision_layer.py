"""Audit sentiment guards with synthetic inputs or the real local model.

Uses only the standard library and decision_layer. Reads the rule configuration,
but never loads .env, accesses saved reviews, crawls, writes a database or changes
production configuration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.services import decision_layer as decision

DEFAULT_CASES = BACKEND_ROOT / "tests/fixtures/sentiment_noise_cases.json"
LABELS = {"Positive", "Neutral", "Negative"}


def load_cases(path: Path = DEFAULT_CASES) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    if not isinstance(cases, list) or not cases:
        raise ValueError("Challenge set must contain cases")
    seen = set()
    for case in cases:
        if not case["id"] or case["id"] in seen:
            raise ValueError("Case IDs must be unique and nonempty")
        seen.add(case["id"])
        if not isinstance(case["text"], str) or not case["group"] or not case["reason"]:
            raise ValueError(f"Invalid case: {case['id']}")
        expected = case["expected"]
        if expected is not None and (not expected or not set(expected) <= LABELS):
            raise ValueError(f"Invalid expectations: {case['id']}")
        # Reuse production validation of the model contract without executing guards.
        with patch.object(decision, "MODEL_CONFIDENCE_THRESHOLD", 0):
            decision.decide_result(case["text"], None, {
                "sentiment": case["raw_label"], "confidence": case["confidence"],
            })
    return cases


def evaluate_case(case: dict, raw: dict, threshold: float) -> dict:
    with patch.object(decision, "MODEL_CONFIDENCE_THRESHOLD", threshold):
        final = decision.decide_result(case["text"], case["rating"], raw)
    expected = case["expected"]
    return {
        **case,
        "status": "ok",
        "raw": raw,
        "final": final,
        "raw_matches": raw["sentiment"] in expected if expected is not None else None,
        "final_matches": final["sentiment"] in expected if expected is not None else None,
        "label_changed": raw["sentiment"] != final["sentiment"],
    }


def summarize(rows: list[dict]) -> dict:
    scored = [r for r in rows if r["status"] == "ok" and r["expected"] is not None]
    successful = [r for r in rows if r["status"] == "ok"]
    return {
        "total": len(rows),
        "scored": len(scored),
        "raw_matches": sum(r["raw_matches"] for r in scored),
        "final_matches": sum(r["final_matches"] for r in scored),
        "mismatches": sum(not r["final_matches"] for r in scored),
        "corrected": sum(not r["raw_matches"] and r["final_matches"] for r in scored),
        "harmed": sum(r["raw_matches"] and not r["final_matches"] for r in scored),
        "still_wrong": sum(not r["raw_matches"] and not r["final_matches"] for r in scored),
        "label_changes": sum(r["label_changed"] for r in successful),
        "rules_checked": sum(r["final"]["rules_applied"] for r in successful),
        "manual_review": sum(r["expected"] is None for r in rows),
        "rejected": sum(r["status"] == "rejected" for r in rows),
        "errors": sum(r["status"] == "error" for r in rows),
    }


def request_json(url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def markdown_report(report: dict) -> str:
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ").replace("\t", " ")

    lines = [
        "# Kiểm tra decision layer với bình luận nhiễu", "",
        f"- Thời điểm UTC: {report['created_at']}",
        f"- Chế độ: `{report['mode']}`; ngưỡng source: `{report['configured_threshold']}`.",
        f"- SHA-256 source / rules / corpus: `{report['hashes']['source']}` / `{report['hashes']['rules']}` / `{report['hashes']['cases']}`.",
        "- Các câu và nhãn kỳ vọng được soạn để tìm lỗi, chưa được gán nhãn độc lập; tỷ lệ bên dưới không phải accuracy trên Lazada.",
        "- Synthetic dùng model output giả lập để cô lập rule. Model dùng cùng corpus, gọi model thật một lần mỗi câu rồi áp dụng từng ngưỡng trong bộ nhớ.",
        "- Replay dùng lại raw output model đã lưu, kiểm tra hash corpus và áp dụng rule hiện tại mà không gọi model lại.",
        "- Expected = null: cần người đánh giá, loại khỏi tỷ lệ khớp. Câu rỗng/emoji có thể bị model từ chối đúng hợp đồng.",
        "- Không thay ngưỡng production, không ghi database và không crawl.", "",
    ]
    if report.get("model_health"):
        lines.extend([f"Model: `{report['model_health'].get('model_name')}`; checkpoints: `{report['model_health'].get('checkpoints')}`.", ""])
    if "evidence" in report["hashes"]:
        lines.extend([f"SHA-256 evidence parser: `{report['hashes']['evidence']}`.", ""])
    if "segments" in report["hashes"]:
        lines.extend([f"SHA-256 idea segmentation: `{report['hashes']['segments']}`.", ""])
    if report.get("baseline_summary"):
        old = report["baseline_summary"]
        lines.extend([f"Bản gốc trên cùng raw predictions: final khớp {old['final_matches']}/{old['scored']}; rule sửa sai {old['harmed']} đầu vào vốn đúng.", ""])
    for variant in report["variants"]:
        summary = variant["summary"]
        lines.extend([
            f"## Ngưỡng {variant['threshold']}", "",
            f"Model khớp: **{summary['raw_matches']}/{summary['scored']}**; final khớp: **{summary['final_matches']}/{summary['scored']}**; lệch kỳ vọng: **{summary['mismatches']}**.",
            f"Rule sửa đúng: **{summary['corrected']}**; sửa sai một đầu vào đúng: **{summary['harmed']}**; vẫn sai: **{summary['still_wrong']}**.",
            f"Chạy rule: {summary['rules_checked']}; đổi nhãn: {summary['label_changes']}; cần gán nhãn: {summary['manual_review']}; model từ chối: {summary['rejected']}; lỗi: {summary['errors']}.", "",
            "| Nhóm | Khớp model | Khớp final | Tổng có kỳ vọng | Sửa đúng | Sửa sai |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ])
        groups = defaultdict(list)
        for row in variant["rows"]:
            groups[row["group"]].append(row)
        for group, rows in sorted(groups.items()):
            s = summarize(rows)
            lines.append(f"| {group} | {s['raw_matches']} | {s['final_matches']} | {s['scored']} | {s['corrected']} | {s['harmed']} |")
        lines.extend(["", "### Chi tiết từng câu", "",
                      "| ID | Nội dung | Sao | Model (confidence) | Final (confidence) | Method | Kỳ vọng | Kết quả |",
                      "| --- | --- | --- | --- | --- | --- | --- | --- |"])
        for row in variant["rows"]:
            if row["status"] != "ok":
                lines.append(f"| {row['id']} | {cell(row['text'])} | {row['rating']} | — | — | {row['status']} | {row['expected']} | {cell(row['error'])} |")
                continue
            final, raw = row["final"], row["raw"]
            verdict = "cần gán nhãn" if row["expected"] is None else "khớp" if row["final_matches"] else "LỆCH"
            lines.append(f"| {row['id']} | {cell(row['text'])} | {row['rating']} | {raw['sentiment']} ({raw['confidence']:.4f}) | {final['sentiment']} ({final['confidence']:.4f}) | {final['method']} | {row['expected']} | {verdict} |")
        lines.extend(["", "### Các ca lệch kỳ vọng", ""])
        for row in variant["rows"]:
            if row.get("final_matches") is False:
                lines.extend([f"- **{row['id']}**: {row['reason']}",
                              f"  Evidence: `{json.dumps(row['final'].get('evidence', {}), ensure_ascii=False)}`."])
        lines.append("")
    lines.extend(["## Diễn giải", "",
                  "`rules_applied=true` nghĩa là đã đi vào nhánh rule, kể cả khi giữ nhãn. Khi đổi nhãn, `confidence_source=rule_heuristic`: confidence không phải xác suất được hiệu chỉnh và không kế thừa xác suất nhãn cũ. Một nhãn sentiment cho toàn câu không mô tả đủ từng khía cạnh. Các vấn đề issue/risk chạy sau đó chưa được chấm trong báo cáo này.", ""])
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("synthetic", "model"), default="synthetic")
    parser.add_argument("--replay", type=Path, help="Reuse raw model outputs from an earlier results.json; no inference requests.")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--ai-url", default="http://127.0.0.1:8001")
    parser.add_argument("--compare-threshold", type=float, action="append", default=[])
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/decision-layer"))
    parser.add_argument("--strict", action="store_true", help="Return exit 1 for unmet expectations at the configured threshold; recommended for quality gates.")
    args = parser.parse_args(argv)
    thresholds = list(dict.fromkeys([decision.MODEL_CONFIDENCE_THRESHOLD, *args.compare_threshold]))
    if any(not math.isfinite(t) or not 0 <= t <= 1 for t in thresholds):
        parser.error("Thresholds must be finite numbers between 0 and 1")
    cases = load_cases(args.cases)
    replay = None
    if args.replay:
        replay = json.loads(args.replay.read_text(encoding="utf-8"))
        if replay["hashes"]["cases"] != hashlib.sha256(args.cases.read_bytes()).hexdigest():
            parser.error("Replay corpus hash differs; use the same unchanged corpus")
        if replay["mode"] not in ("model", "replay"):
            parser.error("Replay requires real model outputs, not synthetic predictions")
        saved_rows = {row["id"]: row for row in replay["variants"][0]["rows"]}
        if set(saved_rows) != {case["id"] for case in cases}:
            parser.error("Replay IDs differ from the corpus")
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": "replay" if replay else args.mode,
        "configured_threshold": decision.MODEL_CONFIDENCE_THRESHOLD,
        "hashes": {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in {
            "source": Path(decision.__file__), "rules": decision.RULE_FILE, "cases": args.cases,
            "evidence": BACKEND_ROOT / "app/services/sentiment_evidence.py",
            "segments": BACKEND_ROOT / "app/services/sentiment_segments.py",
        }.items()},
    }
    if replay:
        report["model_health"] = replay.get("model_health", {})
        report["replay_source_sha256"] = hashlib.sha256(args.replay.read_bytes()).hexdigest()
        report["baseline_summary"] = replay["variants"][0]["summary"]
    elif args.mode == "model":
        report["model_health"] = request_json(args.ai_url.rstrip("/") + "/health")
    variants = [{"threshold": t, "rows": []} for t in thresholds]
    for index, case in enumerate(cases, 1):
        try:
            raw = {"sentiment": case["raw_label"], "confidence": case["confidence"]}
            if replay:
                saved = saved_rows[case["id"]]
                if saved["text"] != case["text"] or saved["rating"] != case["rating"]:
                    raise ValueError(f"Replay input differs: {case['id']}")
                if saved["status"] != "ok":
                    for variant in variants:
                        variant["rows"].append({**case, "status": saved["status"], "error": saved["error"]})
                    continue
                raw = saved["raw"]
            elif args.mode == "model":
                response = request_json(args.ai_url.rstrip("/") + "/predict", {"text": case["text"], "rating": case["rating"]})
                raw = response["final"]
            # Evaluate all variants before appending, so a validation error cannot
            # leave duplicate or misaligned rows in just one threshold report.
            evaluated = [evaluate_case(case, raw, v["threshold"]) for v in variants]
            for variant, row in zip(variants, evaluated):
                variant["rows"].append(row)
        except HTTPError as error:
            # Reject only the known empty-text contracts; unrelated 422 is a failure.
            body = error.read().decode("utf-8", errors="replace")
            known_empty = error.code == 422 and (
                "Review text is empty after preprocessing" in body
                or (not case["text"] and "string_too_short" in body)
            )
            rejected = known_empty and case["expected"] is None
            row = {**case, "status": "rejected" if rejected else "error", "error": f"HTTP {error.code}: {body[:300]}"}
            for variant in variants:
                variant["rows"].append(row)
        except (URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
            for variant in variants:
                variant["rows"].append({**case, "status": "error", "error": f"{type(error).__name__}: {error}"})
        if index % 10 == 0 or index == len(cases):
            print(f"{report['mode']}: {index}/{len(cases)}", file=sys.stderr, flush=True)
    for variant in variants:
        variant["summary"] = summarize(variant["rows"])
    report["variants"] = variants
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "report.md").write_text(markdown_report(report), encoding="utf-8")
    for variant in variants:
        print(json.dumps({"threshold": variant["threshold"], **variant["summary"]}, ensure_ascii=False))
    print(f"Reports: {args.output_dir.resolve()}")
    current = variants[0]["summary"]
    return 1 if current["errors"] or (args.strict and current["mismatches"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
