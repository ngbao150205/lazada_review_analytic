import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { InsightEvidenceResponse } from '../services/api';
import { getComparisonEvidence, type ProductComparison, type ComparisonSide } from '../services/comparisons';
import { comparisonAxisMaximum, comparisonOverview, sharedComparisonAspects, type Polarity } from '../services/comparisonView';

const number = (value: number) => value.toLocaleString('vi-VN');
const percent = (value: number | null) => value == null ? 'Chưa đủ bằng chứng' : `${value.toLocaleString('vi-VN')}%`;
export const comparisonDate = (value: string | null) => value ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`).toLocaleString('vi-VN') : 'Chưa có';
const button = 'rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
type Evidence = {side: ComparisonSide; evidence_key: string; title: string; count: number};

function EvidenceDialog({productId, snapshot, selection, close}: {productId: string; snapshot: ProductComparison; selection: Evidence; close: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InsightEvidenceResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let ignore = false; setLoading(true); setError('');
    getComparisonEvidence(productId, snapshot.id, selection.side, selection.evidence_key, page)
      .then(value => { if (!ignore) setData(value); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : 'Không tải được bằng chứng.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, snapshot.id, selection.side, selection.evidence_key, page, retry]);
  return <dialog ref={dialog} onCancel={close} onClose={close} aria-labelledby="comparison-evidence-title" className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-900/50">
    <header className="sticky top-0 flex items-start justify-between gap-3 border-b bg-white p-5">
      <div className="min-w-0"><h2 id="comparison-evidence-title" className="break-words font-bold">{snapshot.products[selection.side].name} · {selection.title}</h2><p className="mt-1 text-sm text-slate-500">{number(selection.count)} review</p></div>
      <button type="button" aria-label="Đóng bằng chứng" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button>
    </header>
    <div className="space-y-4 p-5"><p className="text-xs text-slate-500">Bình luận được lưu tại lúc so sánh; giữ nguyên khi dữ liệu sản phẩm thay đổi.</p>
      {loading ? <p role="status">Đang tải bằng chứng...</p> : error ? <p role="alert" className="text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Thử lại</button></p> : <>
        {data?.reviews.map(review => <article key={review.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Review #{review.review_reference}</strong><span className="text-amber-700">{review.rating ? `${review.rating}/5 ★` : 'Chưa có sao'}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.content}</p></article>)}
        {data?.reviews.length === 0 && <p>Chưa có bình luận làm bằng chứng cho mục này.</p>}
        {data && data.pagination.total_pages > 1 && <nav aria-label="Phân trang bằng chứng" className="flex items-center justify-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={button}>Trước</button><span className="text-sm">{page}/{data.pagination.total_pages}</span><button type="button" disabled={page >= data.pagination.total_pages} onClick={() => setPage(page + 1)} className={button}>Sau</button></nav>}
      </>}
    </div>
  </dialog>;
}

export default function ComparisonResults({data, productId}: {data: ProductComparison; productId: string}) {
  const [polarity, setPolarity] = useState<Polarity>('negative');
  const [selection, setSelection] = useState<Evidence | null>(null);
  const shared = sharedComparisonAspects(data.aspects);
  const rows = [...shared].sort((left, right) =>
    Math.max(right.a[`${polarity}_percentage`], right.b[`${polarity}_percentage`]) -
    Math.max(left.a[`${polarity}_percentage`], left.b[`${polarity}_percentage`]));
  const axisMaximum = comparisonAxisMaximum(shared, polarity);
  const ticks = [0, .25, .5, .75, 1].map(fraction => fraction * axisMaximum);
  const overview = comparisonOverview(data, shared);
  const kind = polarity === 'positive' ? 'Lời khen' : 'Phàn nàn';

  return <section aria-labelledby="comparison-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="comparison-chart-title" className="font-bold text-slate-900">Tỷ lệ review theo khía cạnh</h2>
      <div role="group" aria-label="Nội dung biểu đồ" className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(['positive', 'negative'] as const).map(value => <button key={value} type="button" aria-pressed={polarity === value} onClick={() => setPolarity(value)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${polarity === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {value === 'positive' ? 'Lời khen' : 'Phàn nàn'}
        </button>)}
      </div>
    </header>

    <ul aria-label="Tên sản phẩm trong biểu đồ" className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
      {(['a', 'b'] as const).map(side => <li key={side} className="flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 p-3">
        <span aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${side === 'a' ? 'bg-blue-600' : 'bg-violet-500'}`}/>
        <div className="min-w-0"><p className="break-words text-xs font-semibold leading-5 text-slate-700">{data.products[side].name}</p>
          <p className="mt-1 text-xs text-slate-400">{number(data.products[side].total_reviews)} review</p></div>
      </li>)}
    </ul>

    {rows.length > 0 ? <figure aria-label={`${kind}: đối chiếu các khía cạnh có phản hồi ở cả hai sản phẩm`} className="mt-5">
      <div aria-hidden="true" className="mb-4 flex gap-3">
        <div className="flex min-w-0 flex-1 justify-between text-[11px] text-slate-400">{ticks.map(tick => <span key={tick}>{percent(tick)}</span>)}</div>
        <span className="w-20 shrink-0 text-right text-[11px] text-slate-400 sm:w-24">Tỷ lệ · review</span>
      </div>
      <ul aria-label="Các khía cạnh chung" className="space-y-5">
        {rows.map(row => <li key={row.id} className="min-w-0">
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700">{row.title}</h3>
          <div className="space-y-1">
            {(['a', 'b'] as const).map(side => {
              const rate = row[side][`${polarity}_percentage`];
              const count = row[side][`${polarity}_count`];
              const product = data.products[side];
              return <button key={side} type="button" disabled={!count}
                aria-label={`${product.name} · ${row.title} · ${kind}: ${count}/${product.total_reviews} review, ${percent(rate)}`}
                title={`${product.name}: ${percent(rate)} (${count}/${product.total_reviews} review)`}
                onClick={() => setSelection({side, evidence_key: row[side][`${polarity}_key`], title: `${row.title} · ${kind}`, count})}
                className="group flex w-full items-center gap-3 rounded-lg py-1.5 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default">
                <span aria-hidden="true" className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <span className="absolute inset-0" style={{backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 0)', backgroundSize: '25% 100%'}}/>
                  <span className={`relative block h-full rounded-md ${side === 'a' ? 'bg-blue-600' : 'bg-violet-500'}`}
                    style={{width: `${rate / axisMaximum * 100}%`}}/>
                </span>
                <span className="w-20 shrink-0 text-right leading-4 sm:w-24">
                  <strong className={`block text-sm font-semibold ${side === 'a' ? 'text-blue-700' : 'text-violet-700'}`}>{percent(rate)}</strong>
                  <span className="text-[11px] text-slate-400">{number(count)}/{number(product.total_reviews)}</span>
                </span>
              </button>;
            })}
          </div>
        </li>)}
      </ul>
    </figure> : <p role="status" className="mt-5 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Chưa có dữ liệu khía cạnh chung để vẽ biểu đồ.</p>}

    <div role="region" aria-labelledby="comparison-overview-title" className="mt-6 rounded-xl bg-blue-50/70 p-4">
      <h3 id="comparison-overview-title" className="text-sm font-semibold text-slate-900">Tổng kết so sánh</h3>
      <p className="mt-1.5 break-words text-sm leading-6 text-slate-600">{overview}</p>
      {!data.comparability.same_category && shared.length > 0 && <p className="mt-1.5 text-xs text-slate-500">Khác ngành hàng: chỉ đối chiếu trải nghiệm chung trong dữ liệu đã lưu.</p>}
    </div>
    {selection && <EvidenceDialog key={`${selection.side}-${selection.evidence_key}`} productId={productId} snapshot={data} selection={selection} close={() => setSelection(null)}/>}
  </section>;
}
