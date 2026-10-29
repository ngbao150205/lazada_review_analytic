import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { getInsightEvidence, type InsightEvidenceResponse, type InsightItem, type ProductInsights as Insights } from "../services/api";

const number = (value: number) => value.toLocaleString("vi-VN");

function EvidenceDialog({ productId, historyId, item, close }: {
  productId: string; historyId?: number | null; item: InsightItem; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InsightEvidenceResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let ignore = false;
    setLoading(true); setError("");
    getInsightEvidence(productId, item.evidence_key, historyId, page)
      .then((response) => { if (!ignore) setData(response); })
      .catch((err) => { if (!ignore) setError(err instanceof Error ? err.message : "Không thể tải bằng chứng."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, item.evidence_key, historyId, page, retry]);
  return <dialog ref={dialog} onCancel={close} onClose={close} aria-labelledby="insight-evidence-title"
    className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-900/50">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#dededb] bg-white p-5">
      <div><h2 id="insight-evidence-title" className="text-lg font-medium text-slate-900">Đánh giá liên quan: {item.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{number(item.count)} đánh giá hỗ trợ nhận xét này.</p></div>
      <button type="button" onClick={close} aria-label="Đóng bằng chứng" className="rounded-lg p-2 hover:bg-slate-100"><X aria-hidden="true" size={20} strokeWidth={1.5} /></button>
    </header>
    <div className="space-y-4 p-5">
      {item.examples.length > 0 && <details className="rounded-xl bg-[#f5f5f3] p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">Trích dẫn đã lưu ({item.examples.length})</summary>
        <ul className="mt-3 space-y-3">{item.examples.map((example) => <li key={`${example.review_id}-${example.rule_id}`}>
          <blockquote className="whitespace-pre-wrap break-words italic">“{example.quote}”</blockquote>
          <span className="mt-1 block text-xs text-slate-400">Review #{example.review_reference}</span>
        </li>)}</ul>
      </details>}
      {loading ? <p role="status" className="p-6 text-center text-slate-500">Đang tải đánh giá liên quan...</p>
        : error ? <div role="alert" className="rounded-xl bg-[#f5f5f3] p-4 text-sm text-[#202329]">{error}<button type="button" className="ml-3 underline" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div>
        : data && <>
          <p className="text-xs leading-relaxed text-slate-500">{data.note}</p>
          {data.reviews.length === 0 && <p className="rounded-xl bg-[#f5f5f3] p-5 text-sm text-slate-500">Không còn review gốc tương ứng trong dữ liệu hiện có. Trích dẫn minh họa đã lưu vẫn được giữ trong nhận xét.</p>}
          {data.reviews.map((review) => <article key={review.id} className="rounded-xl border border-[#dededb] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong className="text-slate-800">Review #{review.review_reference}</strong><span className="text-[#64666a]">{review.rating ? `${review.rating}/5 ★` : "Chưa có sao"}</span></div>
            <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-slate-700">{review.content}</p>
          </article>)}
          {data.pagination.total_pages > 1 && <nav aria-label="Phân trang bằng chứng" className="flex items-center justify-center gap-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Trước</button>
            <span className="text-sm text-slate-600">Trang {page}/{data.pagination.total_pages}</span>
            <button type="button" disabled={page >= data.pagination.total_pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Sau</button>
          </nav>}
        </>}
    </div>
  </dialog>;
}

export default function ProductInsights({ data, productId, historyId }: {
  data?: Insights | null; source?: "snapshot" | "current" | "unavailable"; productId: string; historyId?: number | null;
}) {
  const [selected, setSelected] = useState<InsightItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setSelected(null); setExpanded(false); }, [productId, historyId, data]);
  const priority = data?.priorities[0];
  const action = priority?.action?.split(/[.;]\s*/)[0].trim();

  function mentions(items: InsightItem[], kind: "khen" | "phản ánh") {
    return items.slice(0, 2).map((item, index) => <span key={item.id}>
      {index > 0 && <span className="mx-1.5 text-slate-300">·</span>}
      <button type="button" onClick={() => setSelected(item)} className="text-left decoration-slate-300 underline-offset-4 hover:text-[#202329] hover:underline"
        aria-label={`Xem đánh giá về ${item.title}`}>
        {item.title} <span className="text-slate-500">({number(item.count)} {kind})</span>
      </button>{item.mixed && <span className="ml-1 text-xs text-[#64666a]">— ý kiến trái chiều</span>}
    </span>);
  }

  return <div role="region" aria-labelledby="product-insights-title" className="dashboard-panel dashboard-insights">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="product-insights-title" className="dashboard-panel__title">Nhận xét sản phẩm</h2>
      {data && <span className="dashboard-insights__scope">{number(data.scope.total_reviews)} đánh giá · {number(data.scope.analyzed_reviews)} đã phân tích</span>}
    </header>
    {!data ? <p className="dashboard-insights__empty">Lần phân tích này chưa có nhận xét. Chọn lần mới nhất hoặc phân tích lại để xem.</p> : <>
      <dl className="dashboard-insights__summary">
        <div className="sm:flex sm:gap-3"><dt className="font-medium text-[#202329] sm:w-28 sm:shrink-0">Điểm mạnh</dt>
          <dd className="min-w-0 text-slate-700">{data.strengths.length ? mentions(data.strengths, "khen") : "Chưa đủ lời khen lặp lại để kết luận."}</dd></div>
        <div className="sm:flex sm:gap-3"><dt className="font-medium text-[#64666a] sm:w-28 sm:shrink-0">Cần cải thiện</dt>
          <dd className="min-w-0 text-slate-700">{data.weaknesses.length ? mentions(data.weaknesses, "phản ánh") : "Chưa đủ bằng chứng về vấn đề cụ thể."}</dd></div>
        <div className="sm:flex sm:gap-3"><dt className="font-medium text-[#202329] sm:w-28 sm:shrink-0">Ưu tiên trước</dt>
          <dd className="min-w-0 text-slate-700">{priority ? <>
            <span className="font-medium text-slate-900">{priority.title}.</span>{action && ` ${action}.`}
            <button type="button" onClick={() => setSelected(priority)} aria-label={`Xem đánh giá liên quan: ${priority.title}`} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-[#202329] hover:underline"><Search aria-hidden="true" size={12} strokeWidth={1.5} />Xem bằng chứng</button>
          </> : "Tiếp tục theo dõi; chưa có đề xuất xử lý cụ thể."}</dd></div>
      </dl>
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="mt-4 border-t border-[#dededb] pt-3 text-sm">
        <summary className="dashboard-insights__toggle w-fit cursor-pointer font-medium text-[#202329]">{expanded ? "Thu gọn chi tiết" : "Xem chi tiết nhận xét"}</summary>
        {expanded && <div className="mt-3 space-y-4 text-slate-600">
          <p className="text-sm leading-relaxed">{data.overview}</p>
          {([{ label: "Điểm mạnh", items: data.strengths }, { label: "Điểm cần cải thiện", items: data.weaknesses }, { label: "Việc nên ưu tiên", items: data.priorities }]).map((group) => group.items.length > 0 && <div key={group.label}>
            <h3 className="font-medium text-slate-800">{group.label}</h3>
            <ul className="mt-2 space-y-2">{group.items.map((item) => <li key={item.id} className="leading-relaxed">
              <span className="font-medium text-slate-800">{item.title}: </span>{item.text || item.reason}{item.action && ` ${item.action}`}
              <button type="button" onClick={() => setSelected(item)} className="ml-2 text-xs font-medium text-[#202329] hover:underline">Xem bằng chứng ({number(item.count)})<span className="sr-only">: {item.title}</span></button>
            </li>)}</ul>
          </div>)}
          <p className="text-xs leading-relaxed text-slate-500">{data.scope.note} {data.counting_note}
            {data.scope.unclassified_negative_reviews > 0 && ` ${number(data.scope.unclassified_negative_reviews)} đánh giá Negative chưa xác định được vấn đề cụ thể.`}
            {data.scope.excluded_promotional_reviews > 0 && ` ${number(data.scope.excluded_promotional_reviews)} nội dung quảng bá đã được loại khỏi nhận xét.`}</p>
        </div>}
      </details>
    </>}
    {selected && <EvidenceDialog key={`${productId}-${historyId}-${selected.evidence_key}`} productId={productId} historyId={historyId} item={selected} close={() => setSelected(null)} />}
  </div>;
}
