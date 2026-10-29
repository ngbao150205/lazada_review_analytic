import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, History as HistoryIcon, Loader2, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { getProductHistory, getProductHistories, type ProductHistoryItem, type AnalysisHistoryItem } from "../services/api";
import "./History.css";

const PRODUCTS_PER_PAGE = 6;
const RUNS_PER_PAGE = 5;

function HistoryPagination({ page, total, pageSize, label, onChange }: {
  page: number; total: number; pageSize: number; label: string; onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter(value => value >= 1 && value <= totalPages).sort((left, right) => left - right);
  if (total <= pageSize) return null;

  return <nav className="history-pagination" aria-label={label}>
    <p>Trang {formatNumber(page)} / {formatNumber(totalPages)}</p>
    <div className="history-pagination__buttons">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft aria-hidden="true" size={17} strokeWidth={1.5} /></button>
      {pages.map((value, index) => <span key={value} className="history-pagination__item">
        {index > 0 && value - pages[index - 1] > 1 && <span className="history-pagination__gap" aria-hidden="true">…</span>}
        <button type="button" aria-label={`Trang ${value}`} aria-current={value === page ? "page" : undefined} onClick={() => { if (value !== page) onChange(value); }}>{formatNumber(value)}</button>
      </span>)}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight aria-hidden="true" size={17} strokeWidth={1.5} /></button>
    </div>
  </nav>;
}

function formatDate(value?: string | null): string {
  if (!value) return "Chưa có thông tin";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatNumber(value = 0): string {
  return value.toLocaleString("vi-VN");
}

export default function History() {
  const [products, setProducts] = useState<ProductHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [runPages, setRunPages] = useState<Record<number, number>>({});
  const searchInput = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLElement>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [productHistoriesMap, setProductHistoriesMap] = useState<Record<number, AnalysisHistoryItem[]>>({});
  const [loadingHistoriesMap, setLoadingHistoriesMap] = useState<Record<number, boolean>>({});
  const [historiesErrors, setHistoriesErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    let ignore = false;
    async function fetchHistory() {
      setLoading(true);
      setError("");
      try {
        const response = await getProductHistory();
        if (!ignore) setProducts(response.products || []);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Không thể tải lịch sử phân tích.");
          setProducts([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void fetchHistory();
    return () => { ignore = true; };
  }, [retry]);

  async function loadRuns(productId: number) {
    if (loadingHistoriesMap[productId] || productHistoriesMap[productId]) return;
    setLoadingHistoriesMap(previous => ({ ...previous, [productId]: true }));
    setHistoriesErrors(previous => ({ ...previous, [productId]: "" }));
    try {
      const data = await getProductHistories(productId);
      setProductHistoriesMap(previous => ({ ...previous, [productId]: data.histories || [] }));
    } catch (err) {
      setHistoriesErrors(previous => ({ ...previous, [productId]: err instanceof Error ? err.message : "Không tải được các lần phân tích. Vui lòng thử lại." }));
    } finally {
      setLoadingHistoriesMap(previous => ({ ...previous, [productId]: false }));
    }
  }

  function toggleSelectRuns(productId: number) {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
    } else {
      setExpandedProductId(productId);
      void loadRuns(productId);
    }
  }

  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return products;
    return products.filter(product => [product.name, product.url, product.platform_product_id, String(product.id), product.category, product.category_label]
      .some(value => value?.toLowerCase().includes(query)));
  }, [products, searchText]);
  const page = Math.min(productPage, Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)));
  const productOffset = (page - 1) * PRODUCTS_PER_PAGE;
  const pageProducts = filteredProducts.slice(productOffset, productOffset + PRODUCTS_PER_PAGE);

  function changeSearch(value: string) {
    setSearchText(value);
    setProductPage(1);
    setExpandedProductId(null);
  }

  function changeProductPage(next: number) {
    setProductPage(next);
    setExpandedProductId(null);
    library.current?.focus({ preventScroll: true });
    library.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function clearSearch() {
    changeSearch("");
    searchInput.current?.focus();
  }

  return (
    <div className="history-page">
      <header className="history-heading">
        <div>
          <h1>Lịch sử phân tích.</h1>
        </div>
      </header>

      <section ref={library} tabIndex={-1} className="history-library" aria-labelledby="history-library-title">
        <div className="history-toolbar">
          <div className="history-search">
            <label htmlFor="history-search" className="sr-only">Tìm theo tên, URL, mã sản phẩm hoặc ngành hàng</label>
            <Search aria-hidden="true" size={18} strokeWidth={1.5} />
            <input ref={searchInput} id="history-search" type="text" value={searchText} disabled={loading || !!error} onChange={event => changeSearch(event.target.value)} placeholder="Tên, URL, mã hoặc ngành hàng…" autoComplete="off" />
            {searchText && <button type="button" onClick={clearSearch} aria-label="Xóa từ khóa tìm kiếm"><X aria-hidden="true" size={16} strokeWidth={1.5} /></button>}
          </div>
        </div>

        {loading ? <div role="status" className="history-state"><span aria-hidden="true" className="history-state__icon"><Loader2 size={24} strokeWidth={1.5} className="history-spinner" /></span><h3>Đang tải lịch sử phân tích…</h3><p>Các sản phẩm và kết quả đã lưu sẽ xuất hiện tại đây.</p></div>
          : error ? <div role="alert" className="history-state history-state--error"><h3>Chưa thể tải lịch sử</h3><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="history-button history-button--dark">Thử lại <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} /></button></div>
          : products.length === 0 ? <div className="history-state"><span aria-hidden="true" className="history-state__icon"><HistoryIcon size={26} strokeWidth={1.5} /></span><p className="history-eyebrow">Khởi đầu từ một sản phẩm</p><h3>Góc nhìn đầu tiên đang chờ bạn.</h3><p>Phân tích một sản phẩm bằng URL hoặc file đánh giá. Kết quả được lưu tại đây để bạn có thể xem lại bất cứ lúc nào.</p><Link to="/analyze" className="history-button history-button--dark">Bắt đầu phân tích <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.5} /></Link></div>
          : <>
            <p role="status" className="history-result-count">{filteredProducts.length > 0 ? `Hiển thị ${formatNumber(productOffset + 1)}–${formatNumber(productOffset + pageProducts.length)} / ${formatNumber(filteredProducts.length)} sản phẩm` : "Không có sản phẩm phù hợp"}{searchText.trim() && ` · Tổng ${formatNumber(products.length)} sản phẩm đã lưu`}</p>
            {filteredProducts.length === 0 ? <div className="history-state"><span aria-hidden="true" className="history-state__icon"><Search size={24} strokeWidth={1.5} /></span><h3>Chưa tìm thấy sản phẩm phù hợp.</h3><p>Thử một tên sản phẩm, mã, URL hoặc ngành hàng khác.</p><button type="button" onClick={clearSearch} className="history-button history-button--outline">Xóa tìm kiếm</button></div>
              : <div className="history-product-list">{pageProducts.map(product => {
                const isExpanded = expandedProductId === product.id;
                const histories = productHistoriesMap[product.id] || [];
                const isLoadingHistories = loadingHistoriesMap[product.id];
                const runsError = historiesErrors[product.id];
                const runPage = Math.min(runPages[product.id] || 1, Math.max(1, Math.ceil(histories.length / RUNS_PER_PAGE)));
                const runOffset = (runPage - 1) * RUNS_PER_PAGE;
                const pageRuns = histories.slice(runOffset, runOffset + RUNS_PER_PAGE);
                return (
                  <article key={product.id} className={`history-product${isExpanded ? " history-product--expanded" : ""}`} aria-labelledby={`history-product-${product.id}`}>
                    <div className="history-product__header">
                      <div className="history-product__info">
                        <div className="history-product__tags"><span className="history-product__id">#{product.id}</span><span>{product.platform === "import" ? "Tải từ file" : product.platform}</span>{(product.category_label || product.category) && <span>{product.category_label || product.category}</span>}</div>
                        <h3 id={`history-product-${product.id}`} title={product.name}><Link to={`/products/${product.id}/dashboard`}>{product.name}</Link></h3>
                        <p className="history-product__source">{product.url || "Dữ liệu đánh giá tải từ file"}</p>
                      </div>
                      <div className="history-product__actions">
                        <Link to={`/products/${product.id}/dashboard`} className="history-button history-button--dark" aria-label={`Mở dashboard: ${product.name}`}>Mở dashboard <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link>
                        <button type="button" onClick={() => toggleSelectRuns(product.id)} aria-expanded={isExpanded} aria-controls={`history-runs-${product.id}`} aria-label={`${isExpanded ? "Đóng" : "Chọn"} lần phân tích: ${product.name}`} className="history-button history-button--outline">Các lần phân tích <ChevronDown aria-hidden="true" size={16} strokeWidth={1.5} className={isExpanded ? "history-chevron history-chevron--expanded" : "history-chevron"} /></button>
                      </div>
                    </div>
                    <dl className="history-product__meta">
                      <div><dt>Đánh giá đã lưu</dt><dd>{formatNumber(product.total_reviews)}</dd></div>
                      <div><dt>Ngày tạo</dt><dd>{formatDate(product.created_at)}</dd></div>
                      {product.last_crawled_at && <div><dt>Thu thập gần nhất</dt><dd>{formatDate(product.last_crawled_at)}</dd></div>}
                      {product.platform !== "import" && product.platform_product_id && <div><dt>Mã trên nền tảng</dt><dd>{product.platform_product_id}</dd></div>}
                    </dl>

                    <div id={`history-runs-${product.id}`} hidden={!isExpanded} className="history-runs">
                      {isExpanded && <>
                        <div className="history-runs__heading"><h4>Các lần phân tích</h4>{!isLoadingHistories && !runsError && <span>{formatNumber(histories.length)} lần được ghi nhận</span>}</div>
                        {isLoadingHistories ? <p role="status" className="history-runs__loading"><Loader2 aria-hidden="true" size={17} strokeWidth={1.5} className="history-spinner" />Đang tải các lần phân tích…</p>
                          : runsError ? <div role="alert" className="history-runs__notice"><strong>Chưa thể tải các lần phân tích.</strong><p>{runsError}</p><button type="button" onClick={() => void loadRuns(product.id)} className="history-text-link">Thử lại <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} /></button></div>
                          : histories.length === 0 ? <div className="history-runs__notice"><strong>Chưa có lần phân tích riêng để mở lại.</strong><p>Bạn vẫn có thể xem dashboard hiện tại của sản phẩm.</p><Link to={`/products/${product.id}/dashboard`} className="history-text-link">Mở dashboard hiện tại <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link></div>
                          : <><ol className="history-run-list">{pageRuns.map((run, index) => <li key={run.id}>
                            <Link to={`/products/${product.id}/dashboard?historyId=${run.id}`} className="history-run history-run--link" aria-label={`Mở dashboard lần ${histories.length - runOffset - index} của ${product.name}, ${formatDate(run.analyzed_at)}`}>
                            <div className="history-run__top"><div className="history-run__identity"><strong>Lần #{histories.length - runOffset - index}</strong>{runOffset + index === 0 && <span className="history-run__latest">Mới nhất</span>}<span>{formatDate(run.analyzed_at)}</span></div><span className="history-text-link">Mở dashboard <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} /></span></div>
                            <dl className="history-run__stats"><div><dt>Đã phân tích</dt><dd>{formatNumber(run.analyzed_reviews ?? run.total_reviews)}<span> đánh giá</span></dd></div>{([
                              { label: "Positive", rate: run.positive_rate, count: run.positive_count, tone: "dark" },
                              { label: "Neutral", rate: run.neutral_rate, count: run.neutral_count, tone: "medium" },
                              { label: "Negative", rate: run.negative_rate, count: run.negative_count, tone: "light" },
                            ]).map(item => <div key={item.label}><dt><span aria-hidden="true" className={`history-sentiment-dot history-sentiment-dot--${item.tone}`} />{item.label}</dt><dd>{item.rate.toLocaleString("vi-VN")}%<span> · {formatNumber(item.count)} đánh giá</span></dd></div>)}</dl>
                            </Link>
                          </li>)}</ol><HistoryPagination page={runPage} total={histories.length} pageSize={RUNS_PER_PAGE} label={`Phân trang các lần phân tích: ${product.name}`} onChange={next => setRunPages(previous => ({ ...previous, [product.id]: next }))} /></>}
                      </>}
                    </div>
                  </article>
                );
              })}</div>}
            <HistoryPagination page={page} total={filteredProducts.length} pageSize={PRODUCTS_PER_PAGE} label="Phân trang sản phẩm" onChange={changeProductPage} />
          </>}
      </section>
      <footer className="history-footnote"><span aria-hidden="true" /><p>Mở dashboard để xem kết quả mới nhất. Chọn một lần phân tích để đi thẳng đến dashboard của lần đã lưu.</p></footer>
    </div>
  );
}
