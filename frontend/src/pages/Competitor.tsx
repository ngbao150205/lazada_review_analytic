import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, ArrowUpRight, ChevronDown, Database, Link2, Loader2 } from 'lucide-react';
import { analyzeProduct, getProductHistory, type ProductHistoryItem } from '../services/api';
import { createComparison, listComparisons, type ComparisonHistory } from '../services/comparisons';
import { comparisonDate } from '../components/ComparisonResults';
import ComparisonDialog from '../components/ComparisonDialog';
import ComparisonProductPicker from '../components/ComparisonProductPicker';
import { ProductPageState, ProductPagination } from '../components/ProductPageUI';

type Source = 'saved' | 'url';
type ResolvedProduct = {url: string; id: string; name: string; notice: string};

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
  const [history, setHistory] = useState<ComparisonHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [phase, setPhase] = useState<'analyzing' | 'comparing' | null>(null);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [retry, setRetry] = useState(0);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const busy = phase !== null;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
  const base = products.find(product => String(product.id) === productId);
  const selected = products.find(product => String(product.id) === competitorId);
  const choices = products.filter(product => String(product.id) !== productId && product.total_reviews > 0);

  function updateDraft(change: () => void) {
    change(); setError('');
    const next = new URLSearchParams(params); next.delete('comparisonId'); setParams(next, {replace: true});
  }
  async function compare() {
    if (inFlight.current || !base) return;
    const epoch = generation.current;
    const active = () => generation.current === epoch;
    let targetId = competitorId;
    inFlight.current = true; setError('');
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
  if (!productId) return <ProductPageState title="Chưa chọn sản phẩm"><Link to="/history" className="product-button product-button--dark">Chọn sản phẩm từ lịch sử</Link></ProductPageState>;
  return <div className="product-page">
    <header className="competitor-heading"><h1>Phân tích cạnh tranh.</h1><Link to={`/products/${productId}/dashboard`} className="product-link">Về dashboard <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link></header>
    <form onSubmit={event => { event.preventDefault(); void compare(); }} className="product-panel competitor-form">
      <div className="competitor-base"><p>Sản phẩm đang xem</p><h2>{base?.name || (productsLoading ? 'Đang tải tên sản phẩm…' : 'Không tìm thấy sản phẩm')}</h2></div>
      {productsError && <p role="alert" className="product-notice product-notice--error">{productsError} <button type="button" className="product-link" onClick={() => setRetry(value => value + 1)}>Tải lại danh sách</button></p>}
      <div role="tablist" aria-label="Cách chọn sản phẩm so sánh" className="competitor-tabs">
        {([{id: 'saved', title: 'Sản phẩm đã phân tích', icon: Database}, {id: 'url', title: 'URL sản phẩm', icon: Link2}] as const).map(({id, title, icon: Icon}, index) => <button key={id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab" id={`comparison-tab-${id}`} aria-selected={source === id} aria-controls={`comparison-panel-${id}`} tabIndex={source === id ? 0 : -1} disabled={busy} onClick={() => updateDraft(() => { setSource(id); setNotice(''); })} onKeyDown={event => {
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 1 - index : null;
          if (target == null) return;
          event.preventDefault();
          updateDraft(() => { setSource(target === 0 ? 'saved' : 'url'); setNotice(''); });
          tabRefs.current[target]?.focus();
        }}><Icon aria-hidden="true" size={16} strokeWidth={1.5} />{title}</button>)}
      </div>
      <fieldset disabled={busy} className="min-w-0">
        <div id={`comparison-panel-${source}`} role="tabpanel" aria-labelledby={`comparison-tab-${source}`} tabIndex={0}>
          {source === 'saved' ? <div className="product-field">
            <span id="comparison-picker-label" className="product-muted">Chọn sản phẩm để đối chiếu</span>
            <button type="button" aria-labelledby="comparison-picker-label comparison-picker-value" aria-haspopup="dialog" aria-expanded={pickerOpen} aria-controls="comparison-product-picker" onClick={() => setPickerOpen(true)} className="competitor-picker-button"><span id="comparison-picker-value">{selected?.name || 'Tìm sản phẩm đã phân tích'}</span><ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" /></button>
            <p className="product-muted">Chọn sản phẩm cùng công dụng và phân khúc để kết quả đối chiếu có ý nghĩa hơn.</p>
          </div> : <div className="product-field">
            <label htmlFor="comparison-url">URL sản phẩm Lazada cần so sánh</label><input id="comparison-url" type="url" required value={url} onChange={event => updateDraft(() => { setUrl(event.target.value); setResolved(null); setNotice(''); })} placeholder="https://www.lazada.vn/products/pdp-i123-s456.html" className="product-input" aria-describedby="comparison-url-help" />
            <p id="comparison-url-help" className="product-muted">Hệ thống thu thập đánh giá, phân tích và tạo kết quả so sánh với sản phẩm đang xem.</p>
            {resolved && <p className="product-notice">Đã phân tích: <strong>{resolved.name}</strong>. Có thể dùng dữ liệu đã lưu để so sánh tiếp.</p>}
          </div>}
        </div>
      </fieldset>
      <div className="competitor-submit"><p>Kết quả so sánh được lưu để bạn có thể mở lại theo từng thời điểm.</p><button type="submit" disabled={busy || !base || (source === 'saved' ? !competitorId : !url.trim())} className="product-button product-button--dark">{busy ? <Loader2 aria-hidden="true" size={16} strokeWidth={1.5} className="product-spinner" /> : <ArrowRightLeft aria-hidden="true" size={16} strokeWidth={1.5} />}{phase === 'analyzing' ? 'Đang thu thập và phân tích…' : phase === 'comparing' ? 'Đang so sánh…' : source === 'url' && !resolved ? 'Phân tích URL và so sánh' : 'So sánh và lưu kết quả'}</button></div>
      {busy && <p role="status" className="product-notice">{phase === 'analyzing' ? 'Đang thu thập đánh giá và phân tích. Tác vụ có thể mất nhiều phút; vui lòng giữ trang này mở.' : `Đang tạo kết quả so sánh${targetName ? ` với ${targetName}` : ''}…`}</p>}
    </form>
    {notice && <p role="status" className="product-notice">{notice}</p>}
    {params.get('historyId') && !comparisonId && <p className="product-muted">So sánh dùng đánh giá hiện có của hai sản phẩm, không dùng dữ liệu dashboard cũ đang chọn.</p>}
    {error && <div role="alert" className="product-notice product-notice--error"><p>{error}</p>{source === 'url' && resolved && <p>{resolved.name} đã được lưu. Bấm so sánh lại sẽ dùng dữ liệu vừa phân tích, không thu thập lại.</p>}{source === 'url' && !resolved && <p>Bạn có thể chọn sản phẩm đã phân tích nếu nguồn URL chưa cung cấp dữ liệu.</p>}</div>}
    <section aria-labelledby="comparison-history-title" className="product-panel competitor-history"><h2 id="comparison-history-title" className="product-panel__title">Lịch sử so sánh</h2>
      {historyError ? <p role="alert" className="product-notice product-notice--error">{historyError}<button type="button" onClick={() => setRefreshHistory(value => value + 1)} className="product-link">Thử lại</button></p> : history?.comparisons.length ? <div className="competitor-history__list">{history.comparisons.map(item => <button type="button" key={item.id} disabled={busy} aria-haspopup="dialog" aria-controls="comparison-history-modal" aria-expanded={String(item.id) === comparisonId} onClick={() => { const next = new URLSearchParams(params); next.set('comparisonId', String(item.id)); setParams(next); }}><strong>So sánh với {item.competitor_name}</strong><span>#{item.id} · {comparisonDate(item.created_at)} · {item.window.start_date || item.window.end_date ? `${item.window.start_date || 'Tất cả'} → ${item.window.end_date || 'Tất cả'}` : 'Toàn bộ đánh giá đã lưu'}</span></button>)}</div> : <p className="product-muted">{history ? 'Chưa có lần so sánh nào.' : 'Đang tải lịch sử so sánh…'}</p>}
      {history && <ProductPagination page={historyPage} totalPages={history.pagination.total_pages} onChange={setHistoryPage} disabled={busy} label="Phân trang lịch sử so sánh" />}
    </section>
    {comparisonId && <ComparisonDialog key={`${productId}-${comparisonId}`} productId={productId} comparisonId={comparisonId} close={() => { const next = new URLSearchParams(params); next.delete('comparisonId'); setParams(next, {replace: true}); }} />}
    {pickerOpen && <ComparisonProductPicker products={choices} selectedId={competitorId} loading={productsLoading} error={productsError} retry={() => setRetry(value => value + 1)} select={id => updateDraft(() => setCompetitorId(id))} close={() => setPickerOpen(false)} />}
  </div>;
}
