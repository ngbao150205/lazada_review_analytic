import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronDown, Clock, Loader2, RefreshCw } from "lucide-react";
import SentimentChart from "../components/SentimentChart";
import IssueChart from "../components/IssueChart";
import ProductInsights from "../components/ProductInsights";
import "./Dashboard.css";
import { AnalysisTrendChart, RatingChart, RiskChart } from "../components/DashboardCharts";
import { getProductAnalysis, reanalyzeProduct, type ProductAnalysisApiResponse } from "../services/api";

function formatDate(value?: string | null): string {
  if (!value) return "Dữ liệu hiện có";
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const number = (value: number) => value.toLocaleString("vi-VN");

function Dashboard() {
  const location = useLocation();
  const crawlWarning = (location.state as { crawlWarning?: string } | null)?.crawlWarning;
  const { productId: routeProductId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = routeProductId || searchParams.get("productId");
  const historyId = searchParams.get("historyId");
  const [data, setData] = useState<ProductAnalysisApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalysisMessage, setReanalysisMessage] = useState("");
  const [reanalysisError, setReanalysisError] = useState("");
  const reanalysisInFlight = useRef(false);
  const currentProductId = useRef(productId);
  currentProductId.current = productId;

  useEffect(() => {
    setReanalysisMessage("");
    setReanalysisError("");
  }, [productId]);

  async function handleReanalyze() {
    if (!productId || reanalysisInFlight.current) return;
    const requestedProductId = productId;
    reanalysisInFlight.current = true;
    setReanalyzing(true);
    setReanalysisError("");
    setReanalysisMessage("");
    try {
      const result = await reanalyzeProduct(requestedProductId);
      if (currentProductId.current !== requestedProductId) return;
      setReanalysisMessage(
        `Đã phân tích lại ${number(result.reanalyzed_reviews)} đánh giá, ${number(result.changed_sentiments)} đánh giá thay đổi nhãn cảm xúc.`
        + (result.skipped_reviews ? ` ${number(result.skipped_reviews)} đánh giá không đủ văn bản cho AI.` : "")
        + ` Ngành hàng: ${result.classification.label}${result.classification.changed ? " (đã cập nhật)" : ""}.`
        + " Đã cập nhật vấn đề, rủi ro và lưu lần phân tích mới.",
      );
      const next = new URLSearchParams(searchParams);
      next.set("historyId", String(result.analysis_history_id));
      setSearchParams(next);
      setRetry(value => value + 1);
    } catch (err) {
      if (currentProductId.current === requestedProductId) {
        setReanalysisError(err instanceof Error ? err.message : "Không thể phân tích AI lại. Vui lòng thử lại.");
      }
    } finally {
      reanalysisInFlight.current = false;
      setReanalyzing(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    if (!productId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    getProductAnalysis(productId, historyId)
      .then((response) => {
        if (ignore) return;
        setData(response);
        localStorage.removeItem("activeProductId");
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Không thể tải dữ liệu phân tích sản phẩm.");
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, historyId, retry]);

  if (!productId || (!loading && !data)) {
    return <div className="dashboard-page dashboard-state">
      <h1>{!productId ? "Chưa chọn sản phẩm" : "Chưa thể tải dashboard"}</h1>
      <p role={error ? "alert" : undefined}>{error || "Chọn sản phẩm từ lịch sử hoặc bắt đầu một phân tích mới."}</p>
      <div className="dashboard-actions">
        {error && <button type="button" onClick={() => setRetry(value => value + 1)} className="dashboard-button dashboard-button--outline">Thử lại</button>}
        <Link to="/history" className="dashboard-button dashboard-button--dark">Chọn sản phẩm <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link>
      </div>
    </div>;
  }

  if (loading || !data) return <div role="status" className="dashboard-page dashboard-state"><Loader2 aria-hidden="true" size={26} strokeWidth={1.5} className="dashboard-spinner" /><p>Đang tải dữ liệu dashboard…</p></div>;

  const { analysis, product, histories = [] } = data;
  const rating = analysis.rating_summary;
  const newest = histories[0]?.id === analysis.history_id;

  return <div className="dashboard-page">
    {crawlWarning && <p role="status" className="dashboard-notice">{crawlWarning}</p>}
    <header className="dashboard-heading">
      <div><p className="dashboard-eyebrow"><span aria-hidden="true" /> Dashboard / Tổng quan sản phẩm</p><h1>{product.name || "Sản phẩm"}</h1></div>
      <div className="dashboard-product-tags">{product.category_label && <span>{product.category_label}</span>}<span>{product.platform === "import" ? "Dữ liệu từ file" : product.platform}</span></div>
    </header>

    <section aria-label="Lần phân tích đang hiển thị" className="dashboard-snapshot">
      <div className="dashboard-snapshot__identity"><span aria-hidden="true" className="dashboard-snapshot__icon"><Clock size={19} strokeWidth={1.5} /></span><div><p>Lần phân tích đang hiển thị {newest && <span className="dashboard-snapshot__badge">Mới nhất</span>}</p><strong>{formatDate(analysis.analyzed_at)}</strong></div></div>
      {histories.length > 1 && <div className="dashboard-snapshot__select"><label htmlFor="dashboard-history">Chuyển lần phân tích</label><select id="dashboard-history" value={analysis.history_id ?? ""} disabled={reanalyzing} onChange={event => {
        const next = new URLSearchParams(searchParams);
        next.set("historyId", event.target.value);
        setSearchParams(next);
      }}>{histories.map((history, index) => <option key={history.id} value={history.id}>Lần #{histories.length - index} · {formatDate(history.analyzed_at)}{index === 0 ? " · Mới nhất" : ""}</option>)}</select></div>}
    </section>

    <ProductInsights data={analysis.insights} source={analysis.insights_source} productId={productId} historyId={analysis.history_id} />
    <SentimentChart positive={analysis.positive_count} negative={analysis.negative_count} neutral={analysis.neutral_count} />

    <div className="dashboard-section-heading"><p className="dashboard-eyebrow">Đi sâu vào dữ liệu</p><h2>Nhìn rõ từng khía cạnh.</h2></div>
    <div className="dashboard-chart-grid">
      <RatingChart summary={rating} source={analysis.rating_summary_source} />
      <RiskChart summary={analysis.risk_summary} totalReviews={analysis.risk_total_reviews ?? analysis.total_reviews} productId={productId} source={analysis.risk_summary_source} />
      <IssueChart data={analysis.issue_summary} />
      <AnalysisTrendChart histories={histories} selectedId={analysis.history_id} />
    </div>

    <section aria-labelledby="dashboard-reanalysis-title" className="dashboard-reanalysis">
      <details><summary><div><h2 id="dashboard-reanalysis-title">Phân tích lại dữ liệu đã lưu</h2><p>Cập nhật kết quả từ những đánh giá hiện có của sản phẩm.</p></div><ChevronDown aria-hidden="true" size={18} strokeWidth={1.5} /></summary>
        <div className="dashboard-reanalysis__body"><p>Dùng toàn bộ đánh giá đã lưu để cập nhật cảm xúc, vấn đề và rủi ro. Hệ thống sẽ lưu một lần phân tích mới để bạn có thể xem lại.</p><button type="button" onClick={() => void handleReanalyze()} disabled={reanalyzing || product.total_reviews === 0} className="dashboard-button dashboard-button--dark">{reanalyzing ? <><Loader2 aria-hidden="true" size={16} strokeWidth={1.5} className="dashboard-spinner" />Đang phân tích…</> : <><RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />Phân tích lại</>}</button></div>
      </details>
      {reanalyzing && <p role="status" className="dashboard-notice">Đang xử lý các đánh giá đã lưu. Tác vụ có thể mất nhiều phút; vui lòng giữ trang này mở.</p>}
      {reanalysisMessage && <p role="status" className="dashboard-notice">{reanalysisMessage}</p>}
      {reanalysisError && <p role="alert" className="dashboard-notice dashboard-notice--error">{reanalysisError}</p>}
    </section>
    <footer className="dashboard-footnote"><p>Kết quả phản ánh tập đánh giá đã thu thập. Đối chiếu với nội dung bình luận để hiểu đầy đủ trải nghiệm của khách hàng.</p></footer>
  </div>;
}

export default Dashboard;
