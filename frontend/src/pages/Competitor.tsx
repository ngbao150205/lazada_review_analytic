import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, ChevronDown, Database, Link2, Loader2 } from 'lucide-react';
import { analyzeProduct, getProductHistory, type ProductHistoryItem } from '../services/api';
import { createComparison, getComparison, listComparisons, type ProductComparison, type ComparisonHistory } from '../services/comparisons';
import ComparisonResults, { comparisonDate } from '../components/ComparisonResults';
import ComparisonProductPicker from '../components/ComparisonProductPicker';

type Source = 'saved' | 'url';
type ResolvedProduct = {url: string; id: string; name: string; notice: string};
const button = 'rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const input = 'mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function lazadaId(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !['lazada.vn', 'www.lazada.vn'].includes(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error();
    const id = parsed.pathname.match(/^\/products\/(?:[^/]*-)?i(\d{1,32})(?:-s\d{1,32})?\.html\/?$/)?.[1];
    if (!id) throw new Error();
    return id;
  } catch { throw new Error('Vui lòng nhập URL sản phẩm Lazada Việt Nam hợp lệ, ví dụ https://www.lazada.vn/products/pdp-i123-s456.html.'); }
}

export default function Competitor() {
  const {productId: routeId} = useParams();
  const [params, setParams] = useSearchParams();
  const productId = routeId || params.get('productId') || '';
  const comparisonId = params.get('comparisonId');
  const [products, setProducts] = useState<ProductHistoryItem[]>([]);
  const [productsError, setProductsError] = useState('');
  const [productsLoading, setProductsLoading] = useState(true);
  const [source, setSource] = useState<Source>('saved');
  const [competitorId, setCompetitorId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [resolved, setResolved] = useState<ResolvedProduct | null>(null);
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<ProductComparison | null>(null);
  const [history, setHistory] = useState<ComparisonHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'analyzing' | 'comparing' | null>(null);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [retry, setRetry] = useState(0);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const busy = phase !== null;
  useEffect(() => {
    setPhase(null); inFlight.current = false; setSource('saved'); setCompetitorId(''); setPickerOpen(false); setUrl(''); setResolved(null); setNotice('');
    setHistoryPage(1); setHistory(null);
    return () => { generation.current += 1; };
  }, [productId]);
  useEffect(() => {
    let ignore = false; setProductsLoading(true); setProductsError('');
    getProductHistory().then(result => { if (!ignore) setProducts(result.products); })
      .catch(err => { if (!ignore) setProductsError(err.message); })
      .finally(() => { if (!ignore) setProductsLoading(false); });
    return () => { ignore = true; };
  }, [retry]);
  useEffect(() => {
    if (!productId) return;
    let ignore = false; setHistoryError('');
    listComparisons(productId, historyPage).then(result => { if (!ignore) setHistory(result); })
      .catch(err => { if (!ignore) setHistoryError(err.message); });
    return () => { ignore = true; };
  }, [productId, historyPage, refreshHistory, retry]);
  useEffect(() => {
    let ignore = false; setData(null); setError('');
    if (!productId || !comparisonId) { setLoading(false); return; }
    setLoading(true);
    getComparison(productId, comparisonId).then(result => {
      if (!ignore) { setData(result); setCompetitorId(String(result.products.b.id)); }
    }).catch(err => { if (!ignore) setError(err.message); }).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, comparisonId, retry]);
  const base = products.find(product => String(product.id) === productId);
  const selected = products.find(product => String(product.id) === competitorId);
  const choices = products.filter(product => String(product.id) !== productId && product.total_reviews > 0);

  function updateDraft(change: () => void) {
    change(); setData(null); setError('');
    const next = new URLSearchParams(params); next.delete('comparisonId'); setParams(next, {replace: true});
  }
  async function compare() {
    if (inFlight.current || !base) return;
    const epoch = generation.current;
    const active = () => generation.current === epoch;
    let targetId = competitorId;
    inFlight.current = true; setError(''); setData(null);
    try {
      if (source === 'url') {
        const clean = url.trim();
        const platformId = lazadaId(clean);
        if (base.platform === 'lazada' && String(base.platform_product_id) === platformId) throw new Error('URL này là sản phẩm đang xem. Hãy nhập URL của sản phẩm khác.');
        if (resolved?.url === clean) { targetId = resolved.id; setNotice(resolved.notice); }
        else {
          setPhase('analyzing'); setNotice('');
          const result = await analyzeProduct(clean);
          if (!active()) return;
          if (!Number.isSafeInteger(result.product_db_id) || result.product_db_id <= 0) throw new Error('Không nhận được sản phẩm đã phân tích từ hệ thống.');
          targetId = String(result.product_db_id);
          const crawlNotice = result.crawl_status === 'PARTIAL'
            ? `Đã phân tích ${result.product_name || 'sản phẩm từ URL'} với dữ liệu thu thập một phần. ${result.crawl_error || 'Nguồn chưa cung cấp đủ đánh giá.'}${result.retry_after_seconds ? ` Có thể thử thu thập thêm sau ít nhất ${result.retry_after_seconds} giây.` : ''}`
            : `Đã thu thập và phân tích ${result.product_name || 'sản phẩm từ URL'}.`;
          setResolved({url: clean, id: targetId, name: result.product_name || 'Sản phẩm vừa phân tích', notice: crawlNotice});
          setCompetitorId(targetId);
          setNotice(crawlNotice);
          // Keep the new product available in the saved-product picker too.
          void getProductHistory().then(result => { if (active()) { setProducts(result.products); setProductsError(''); } }).catch(() => {});
        }
      }
      if (!targetId) throw new Error('Vui lòng chọn sản phẩm để so sánh.');
      if (targetId === productId) throw new Error('Hãy chọn sản phẩm khác với sản phẩm đang xem.');
      setPhase('comparing');
      const result = await createComparison(productId, targetId);
      if (!active()) return;
      const next = new URLSearchParams(params); next.delete('historyId'); next.set('comparisonId', String(result.id)); setParams(next);
      setRefreshHistory(value => value + 1); setHistoryPage(1);
    } catch (err) { if (active()) setError(err instanceof Error ? err.message : 'Không thể so sánh.'); }
    finally { if (active()) { inFlight.current = false; setPhase(null); } }
  }
  const targetName = source === 'url' ? resolved?.name : selected?.name;
  if (!productId) return <div className="rounded-2xl bg-white p-6 text-sm">Chọn sản phẩm trong <Link to="/history" className="text-blue-600 underline">Lịch sử phân tích</Link> để bắt đầu so sánh.</div>;
  return <div className="min-w-0 space-y-5">
    <form onSubmit={event => { event.preventDefault(); void compare(); }} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-700">Sản phẩm đang xem</p><h2 className="mt-1 break-words font-bold text-slate-900">{base?.name || data?.products.a.name || (productsLoading ? 'Đang tải tên sản phẩm...' : 'Không tìm thấy sản phẩm')}</h2></div>
      {productsError && <p role="alert" className="mt-3 text-sm text-red-700">{productsError} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Tải lại danh sách</button></p>}
      <div role="tablist" aria-label="Cách chọn sản phẩm so sánh" className="mt-5 grid gap-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-2">
        {([{id: 'saved', title: 'Chọn sản phẩm đã phân tích', icon: Database}, {id: 'url', title: 'Nhập URL sản phẩm', icon: Link2}] as const).map(({id, title, icon: Icon}) => <button key={id} type="button" role="tab" id={`comparison-tab-${id}`} aria-selected={source === id} aria-controls={`comparison-panel-${id}`} disabled={busy || loading} onClick={() => updateDraft(() => { setSource(id); setNotice(''); })} className={`flex items-center justify-center gap-2 rounded-lg p-3 text-sm font-semibold disabled:opacity-50 ${source === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}><Icon size={16}/>{title}</button>)}
      </div>
      <fieldset disabled={busy || loading} className="mt-4 min-w-0">
        <div id={`comparison-panel-${source}`} role="tabpanel" aria-labelledby={`comparison-tab-${source}`}>
          {source === 'saved' ? <>
            <span id="comparison-picker-label" className="block text-sm font-medium text-slate-700">Tìm sản phẩm đã phân tích</span>
            <button type="button" aria-labelledby="comparison-picker-label comparison-picker-value" aria-haspopup="dialog" aria-expanded={pickerOpen} aria-controls="comparison-product-picker"
              onClick={() => setPickerOpen(true)} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <span id="comparison-picker-value" className="min-w-0 break-words text-slate-700">{selected?.name || data?.products.b.name || 'Bấm để chọn sản phẩm so sánh'}</span><ChevronDown size={18} aria-hidden="true" className="shrink-0 text-slate-400"/>
            </button>
          </> : <>
            <label htmlFor="comparison-url" className="text-sm font-medium text-slate-700">URL sản phẩm Lazada cần so sánh</label>
            <input id="comparison-url" type="url" required value={url} onChange={event => updateDraft(() => { setUrl(event.target.value); setResolved(null); setNotice(''); })} placeholder="https://www.lazada.vn/products/pdp-i123-s456.html" className={input}/>
            <p className="mt-2 text-xs leading-5 text-slate-500">Hệ thống thu thập đánh giá, lấy tên sản phẩm, chạy phân tích rồi tự tạo kết quả so sánh. Chọn sản phẩm cùng công dụng và phân khúc.</p>
            {resolved && <p className="mt-3 break-words rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Đã phân tích: <strong>{resolved.name}</strong>. Có thể dùng dữ liệu đã lưu để so sánh tiếp.</p>}
          </>}
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={busy || loading || !base || (source === 'saved' ? !competitorId : !url.trim())} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin"/> : <ArrowRightLeft size={16}/>} {phase === 'analyzing' ? 'Đang thu thập và phân tích...' : phase === 'comparing' ? 'Đang so sánh...' : source === 'url' && !resolved ? 'Phân tích URL và so sánh' : 'So sánh và lưu kết quả'}</button></div>
      {busy && <p role="status" className="mt-3 break-words text-sm text-blue-700">{phase === 'analyzing' ? 'Đang thu thập đánh giá và chạy phân tích. Tác vụ có thể mất nhiều phút; vui lòng giữ trang này mở.' : `Đang tạo kết quả so sánh${targetName ? ` với ${targetName}` : ''}...`}</p>}
    </form>
    {notice && <p role="status" className="whitespace-pre-wrap break-words rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
    {params.get('historyId') && !comparisonId && <p className="text-xs text-slate-500">So sánh dùng review hiện có của hai sản phẩm, không dùng snapshot dashboard cũ đang chọn.</p>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error}</p>{source === 'url' && resolved && <p className="mt-2">{resolved.name} đã được lưu. Bấm so sánh lại sẽ dùng dữ liệu vừa phân tích, không thu thập lại.</p>}{source === 'url' && !resolved && <p className="mt-2">Bạn có thể chọn sản phẩm đã phân tích nếu nguồn URL chưa cung cấp dữ liệu.</p>}</div>}
    {loading && <p role="status" className="p-6 text-center text-slate-500">Đang tải kết quả so sánh...</p>}
    {!loading && data && <ComparisonResults key={data.id} data={data} productId={productId}/>}
    <section aria-label="Lịch sử so sánh" className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="break-words font-bold">Lịch sử so sánh{base ? ` của ${base.name}` : ''}</h2>
      {historyError ? <p role="alert" className="mt-3 text-sm text-red-700">{historyError}<button type="button" onClick={() => setRefreshHistory(value => value + 1)} className="ml-2 underline">Thử lại</button></p> : history?.comparisons.length ? <div className="mt-3 space-y-2">{history.comparisons.map(item => <button type="button" key={item.id} disabled={busy} onClick={() => { setNotice(''); setSource('saved'); setResolved(null); const next = new URLSearchParams(params); next.set('comparisonId', String(item.id)); setParams(next); }} className={`block w-full break-words rounded-xl border p-3 text-left text-sm ${String(item.id) === comparisonId ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-100 hover:bg-slate-50'}`}>#{item.id} · {item.competitor_name}<span className="mt-1 block text-xs text-slate-500">{comparisonDate(item.created_at)} · {item.window.start_date || item.window.end_date ? `${item.window.start_date || 'Tất cả'} → ${item.window.end_date || 'Tất cả'}` : 'Toàn bộ review đã lưu'}</span></button>)}</div> : <p className="mt-3 text-sm text-slate-500">Chưa có lần so sánh nào.</p>}
      {history && history.pagination.total_pages > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button type="button" className={button} disabled={historyPage <= 1 || busy} onClick={() => setHistoryPage(historyPage - 1)}>Trang trước</button><span className="text-sm">{historyPage}/{history.pagination.total_pages}</span><button type="button" className={button} disabled={historyPage >= history.pagination.total_pages || busy} onClick={() => setHistoryPage(historyPage + 1)}>Trang sau</button></div>}
    </section>
    {pickerOpen && <ComparisonProductPicker products={choices} selectedId={competitorId} loading={productsLoading} error={productsError}
      retry={() => setRetry(value => value + 1)} select={id => updateDraft(() => setCompetitorId(id))} close={() => setPickerOpen(false)}/>}
  </div>;
}
