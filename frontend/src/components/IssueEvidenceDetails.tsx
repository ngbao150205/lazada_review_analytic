import type { IssueEvidence, IssueEvidenceMatch } from "../services/api";

export default function IssueEvidenceDetails({ evidence, label }: { evidence?: IssueEvidence | null; label: string }) {
  const clauses = new Map<string, IssueEvidenceMatch[]>();
  for (const match of evidence?.matches || []) {
    const key = `${match.original_start}:${match.original_end}`;
    clauses.set(key, [...(clauses.get(key) || []), match]);
  }
  return <details className="product-evidence">
    <summary className="cursor-pointer font-medium text-slate-800">Bằng chứng: {label}</summary>
    {!evidence ? <p className="mt-2 text-slate-500">Kết quả cũ chưa lưu bằng chứng chi tiết. Dùng “Phân tích AI lại” trên Dashboard để cập nhật.</p> : <div className="mt-3 space-y-3">
      <p>Ngành hàng đã dùng: <strong>{evidence.category_label || evidence.category}</strong></p>
      <p>{evidence.reason}</p>
      {evidence.classification_source === "sentiment_policy" && <div className="space-y-2">
        <p className="text-xs text-amber-800">Phân nhóm từ nhãn Negative; chưa có bằng chứng để gán nhóm vấn đề cụ thể.</p>
        {evidence.fallback_text && <blockquote className="whitespace-pre-line border-l-4 border-amber-300 pl-3 text-slate-900">{evidence.fallback_text}</blockquote>}
        <p className="break-words text-xs text-slate-500">Quy tắc: {evidence.decisive_rule_ids?.join(", ")}</p>
      </div>}
      {Array.from(clauses.entries()).map(([key, matches]) => <div key={key}>
        <blockquote className="whitespace-pre-line border-l-4 border-orange-300 pl-3 text-slate-900">{matches[0].text}</blockquote>
        <p className="mt-1 text-xs text-slate-500">Từ khóa: {Array.from(new Set(matches.map(m => m.keyword))).join(", ")}</p>
        {Array.from(new Map(matches.map(m => [m.rule_id, m])).values()).map(match => <p key={match.rule_id} className="mt-1 break-words text-xs text-slate-500">
          Quy tắc <code>{match.rule_id}</code> · {match.weight} điểm — {match.rule_reason}
          {match.routing_reason && <> {match.routing_reason} (<code>{match.routing_rule_id}</code>)</>}
        </p>)}
        {Array.from(new Map(matches.flatMap(m => m.context_matches || []).filter(c =>
          c.original_start !== matches[0].original_start || c.original_end !== matches[0].original_end
        ).map(c => [`${c.original_start}:${c.original_end}`, c])).values()).map(context => <div key={`${context.original_start}:${context.original_end}`} className="mt-2">
          <p className="text-xs text-slate-500">Ngữ cảnh liên quan:</p>
          <blockquote className="whitespace-pre-line border-l-4 border-slate-200 pl-3">{context.text}</blockquote>
        </div>)}
      </div>)}
      <p className="break-words text-xs text-slate-400">Phiên bản quy tắc: {evidence.rule_version}</p>
    </div>}
  </details>;
}
