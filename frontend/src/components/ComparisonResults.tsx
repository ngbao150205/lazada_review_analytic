import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { InsightEvidenceResponse } from '../services/api';
import { getComparisonEvidence, type ProductComparison, type ComparisonSide } from '../services/comparisons';
import { ProductRating } from './ProductPageUI';
import ComparisonOverview from './ComparisonOverview';

const number = (value: number) => value.toLocaleString('vi-VN');
const percent = (value: number | null) => value == null ? 'Chưa đủ bằng chứng' : `${value.toLocaleString('vi-VN')}%`;
export const comparisonDate = (value: string | null) => value ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`).toLocaleString('vi-VN') : 'Chưa có';
const button = 'product-button product-button--outline';
type Evidence = {side: ComparisonSide; evidence_key: string; title: string; count: number};

function EvidenceDialog({productId, snapshot, selection, close}: {productId: string; snapshot: ProductComparison; selection: Evidence; close: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InsightEvidenceResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  useEffect(() => {
    let ignore = false; setLoading(true); setError('');
    getComparisonEvidence(productId, snapshot.id, selection.side, selection.evidence_key, page)
      .then(value => { if (!ignore) setData(value); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : 'Không tải được bằng chứng.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, snapshot.id, selection.side, selection.evidence_key, page, retry]);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClose={event => { event.stopPropagation(); close(); }} aria-labelledby="comparison-evidence-title" className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-900/50">
    <header className="sticky top-0 flex items-start justify-between gap-3 border-b bg-white p-5">
      <div className="min-w-0"><h2 id="comparison-evidence-title" className="break-words font-medium">{snapshot.products[selection.side].name} · {selection.title}</h2><p className="mt-1 text-sm text-slate-500">{number(selection.count)} review</p></div>
      <button type="button" aria-label="Đóng bằng chứng" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button>
    </header>
    <div className="space-y-4 p-5"><p className="text-xs text-slate-500">Bình luận được lưu tại lúc so sánh; giữ nguyên khi dữ liệu sản phẩm thay đổi.</p>
      {loading ? <p role="status">Đang tải bằng chứng...</p> : error ? <p role="alert" className="text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Thử lại</button></p> : <>
        {data?.reviews.map(review => <article key={review.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Review #{review.review_reference}</strong><ProductRating rating={review.rating} /></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.content}</p></article>)}
        {data?.reviews.length === 0 && <p>Chưa có bình luận làm bằng chứng cho mục này.</p>}
        {data && data.pagination.total_pages > 1 && <nav aria-label="Phân trang bằng chứng" className="flex items-center justify-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={button}>Trước</button><span className="text-sm">{page}/{data.pagination.total_pages}</span><button type="button" disabled={page >= data.pagination.total_pages} onClick={() => setPage(page + 1)} className={button}>Sau</button></nav>}
      </>}
    </div>
  </dialog>;
}

export default function ComparisonResults({data, productId}: {data: ProductComparison; productId: string}) {
  const [polarity, setPolarity] = useState<'positive' | 'negative'>('negative');
  const [selection, setSelection] = useState<Evidence | null>(null);
  const names = {a: data.products.a.name, b: data.products.b.name};
  const rows = data.aspects.filter(row => row.a.mentioned_reviews || row.b.mentioned_reviews);
  const chart = data.aspects.filter(row => row.a.mentioned_reviews || row.b.mentioned_reviews)
    .sort((left, right) => Math.max(right.a[`${polarity}_percentage`] || 0, right.b[`${polarity}_percentage`] || 0) - Math.max(left.a[`${polarity}_percentage`] || 0, left.b[`${polarity}_percentage`] || 0))
    .slice(0, 5).map(row => ({name: row.title, current: row.a[`${polarity}_percentage`], competitor: row.b[`${polarity}_percentage`]}));
  return <div className="comparison-results">
    <ComparisonOverview data={data} openEvidence={item => setSelection({ side: item.side, evidence_key: item.evidence_key, title: item.title, count: item.count })} />
    <section aria-labelledby="aspect-table-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="aspect-table-title" className="font-medium">So sánh từng khía cạnh</h2></div><p className="mt-2 break-words text-xs leading-5 text-slate-500">Tỷ lệ trên tổng review mỗi sản phẩm. Bấm số liệu để đọc bằng chứng. Chênh lệch tính bằng điểm phần trăm: {names.a} trừ {names.b}.</p>
    <p className="mt-2 text-xs text-slate-500">Kết quả đã lưu #{data.id} · {comparisonDate(data.created_at)} · {data.window.start_date || data.window.end_date ? `Ngày review: ${data.window.start_date || 'không giới hạn'} → ${data.window.end_date || 'không giới hạn'}` : 'Toàn bộ bình luận đã lưu tại lúc so sánh'}</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[630px] text-left text-sm"><caption className="sr-only">Lời khen và phàn nàn của {names.a} và {names.b} theo khía cạnh</caption><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Khía cạnh</th><th className="p-3"><span className="block min-w-40 max-w-64 break-words text-slate-800">{names.a}</span><span className="mt-1 block">Khen / Phàn nàn</span></th><th className="p-3"><span className="block min-w-40 max-w-64 break-words text-slate-800">{names.b}</span><span className="mt-1 block">Khen / Phàn nàn</span></th><th className="p-3">Chênh lệch</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 align-top"><th scope="row" className="p-3 font-medium">{row.title}</th>{(['a', 'b'] as const).map(side => <td key={side} className="p-3">{(['positive', 'negative'] as const).map(kind => <div key={kind} className="mb-1">{row[side].mentioned_reviews ? <button type="button" disabled={!row[side][`${kind}_count`]} onClick={() => setSelection({side, evidence_key: row[side][`${kind}_key`], title: `${row.title} · ${kind === 'positive' ? 'Lời khen' : 'Phàn nàn'}`, count: row[side][`${kind}_count`]})} aria-label={`${names[side]} ${row.title} ${kind === 'positive' ? 'khen' : 'phàn nàn'}`} className={`${kind === 'positive' ? 'text-emerald-700' : 'text-red-700'} text-left hover:underline disabled:cursor-default disabled:no-underline`}>{row[side][`${kind}_count`]}/{data.products[side].total_reviews} · {percent(row[side][`${kind}_percentage`])}</button> : <span className="text-xs text-slate-400">Chưa có bằng chứng {kind === 'positive' ? 'khía cạnh' : ''}</span>}</div>)}</td>)}<td className="p-3 text-xs leading-5 text-slate-600">{!row.sufficient ? 'Chưa đủ dữ liệu đối chiếu' : <>{(['positive', 'negative'] as const).map(kind => <p key={kind}>{kind === 'positive' ? 'Khen' : 'Phàn nàn'}: {row[`${kind}_delta_pp`]! > 0 ? '+' : ''}{row[`${kind}_delta_pp`]?.toLocaleString('vi-VN')} đpt{row[`${kind}_relation`] === 'similar' ? ' · gần tương đương' : row[`${kind}_relation`] === 'insufficient' ? ' · ít bằng chứng' : ''}</p>)}</>}</td></tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">Chưa nhận diện được khía cạnh chung. Có thể mở các review hoặc bổ sung dữ liệu.</p>}<p className="mt-3 text-xs leading-5 text-slate-500">Cần ít nhất {data.policy.min_reviews_per_product} review mỗi sản phẩm, {data.policy.min_mentions_per_product} review nhắc khía cạnh ở mỗi bên và {data.policy.min_polarity_reviews} bằng chứng khen/chê ở ít nhất một bên; chênh từ {data.policy.difference_percentage_points} điểm phần trăm mới tạo nhận xét khác biệt.</p>
    </section>
    {chart.length > 0 && <section aria-labelledby="comparison-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="comparison-chart-title" className="font-medium">Tỷ lệ review theo khía cạnh</h2><select aria-label="Nội dung biểu đồ" value={polarity} onChange={event => setPolarity(event.target.value as 'positive' | 'negative')} className="rounded-lg border p-2 text-sm"><option value="negative">Phàn nàn</option><option value="positive">Lời khen</option></select></div><ul aria-label="Tên sản phẩm trong biểu đồ" className="mt-4 space-y-2 text-xs">{(['a', 'b'] as const).map(side => <li key={side} className="flex items-start gap-2"><span aria-hidden="true" className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${side === 'a' ? 'bg-blue-600' : 'bg-violet-500'}`}/><span className="min-w-0 break-words">{names[side]}</span></li>)}</ul><div className="mt-3 h-80 min-w-0" role="img" aria-label={`Biểu đồ tỷ lệ giữa ${names.a} và ${names.b}; số liệu đầy đủ trong bảng phía trên`}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{left: 0, right: 20}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} fontSize={11}/><YAxis type="category" dataKey="name" width={105} fontSize={11} tickFormatter={value => value.length > 17 ? `${value.slice(0, 17)}…` : value}/><Tooltip formatter={value => percent(typeof value === 'number' ? value : null)} wrapperStyle={{maxWidth: 'min(320px, 80vw)'}} contentStyle={{whiteSpace: 'normal', overflowWrap: 'anywhere'}} itemStyle={{whiteSpace: 'normal'}}/><Bar dataKey="current" name={names.a} fill="#2563eb" radius={[0, 4, 4, 0]}/><Bar dataKey="competitor" name={names.b} fill="#8b5cf6" radius={[0, 4, 4, 0]}/></BarChart></ResponsiveContainer></div></section>}
    {selection && <EvidenceDialog key={`${selection.side}-${selection.evidence_key}`} productId={productId} snapshot={data} selection={selection} close={() => setSelection(null)}/>}
  </div>;
}
