import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Clock, Loader2, RefreshCw } from "lucide-react";
import SentimentChart from "../components/SentimentChart";
import IssueChart from "../components/IssueChart";
import ProductInsights from "../components/ProductInsights";
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
        + ` Ngưỡng tin model: ${result.analysis_config.model_confidence_threshold}. Đã cập nhật vấn đề, rủi ro và lưu lần phân tích mới.`,
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
    return <div className="mx-auto flex min-h-[400px] max-w-lg flex-col items-center justify-center text-center">
      <AlertTriangle className="mb-4 h-10 w-10 text-amber-500" />
      <h1 className="text-2xl font-bold text-slate-900">{!productId ? "Chưa chọn sản phẩm" : "Không thể tải dữ liệu"}</h1>
      <p role={error ? "alert" : undefined} className="mt-3 text-sm text-slate-500">{error || "Vui lòng bắt đầu phân tích sản phẩm để xem dashboard."}</p>
      <div className="mt-6 flex gap-3">
        {error && <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold">Thử lại</button>}
        <Link to="/analyze" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          Bắt đầu phân tích <ArrowRight size={16} />
        </Link>
      </div>
    </div>;
  }

  if (loading || !data) return <div role="status" className="flex min-h-[400px] items-center justify-center text-slate-500">Đang tải dữ liệu dashboard...</div>;

  const { analysis, product, histories = [] } = data;
  const rating = analysis.rating_summary;
  const newest = histories[0]?.id === analysis.history_id;

  return <div className="space-y-6">
    {crawlWarning && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{crawlWarning}</p>}
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-blue-600">Dashboard sản phẩm</p>
        <h1 className="mt-1 break-words text-3xl font-bold text-slate-900">{product.name || "Sản phẩm"}</h1>
        {product.category_label && <p className="mt-2 text-sm font-medium text-slate-700">Ngành hàng hiện tại: {product.category_label}</p>}
      </div>
      <Link to={`/products/${productId}/reviews`} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600">Xem đánh giá <ArrowRight size={16} /></Link>
    </header>

    <section aria-label="Phân tích AI lại" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-semibold text-slate-900">Phân tích lại dữ liệu đã lưu</h2>
          <p className="mt-1 text-sm text-slate-500">Dùng toàn bộ đánh giá hiện có của sản phẩm để chạy AI và các quy tắc hiện tại, cập nhật cảm xúc, vấn đề và rủi ro. Không cần thu thập lại từ Lazada.</p>
        </div>
        <button type="button" onClick={() => void handleReanalyze()} disabled={reanalyzing || product.total_reviews === 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
          {reanalyzing ? <><Loader2 size={16} className="animate-spin" />Đang phân tích AI...</> : <><RefreshCw size={16} />Phân tích AI lại</>}
        </button>
      </div>
      {reanalyzing && <p role="status" className="mt-3 text-sm text-blue-700">Đang xử lý các đánh giá đã lưu. Tác vụ có thể mất nhiều phút; vui lòng giữ trang này mở.</p>}
      {reanalysisMessage && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{reanalysisMessage}</p>}
      {reanalysisError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{reanalysisError}</p>}
    </section>

    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Clock size={20} /></span>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700">Lần phân tích đang hiển thị {newest && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-white">Mới nhất</span>}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(analysis.analyzed_at)}</p>
        </div>
      </div>
      {histories.length > 1 && <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="dashboard-history" className="text-xs font-medium text-slate-600">Chuyển lần phân tích</label>
        <select id="dashboard-history" value={analysis.history_id ?? ""} disabled={reanalyzing} onChange={(event) => {
          const next = new URLSearchParams(searchParams);
          next.set("historyId", event.target.value);
          setSearchParams(next);
        }} className="max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-300">
          {histories.map((history, index) => <option key={history.id} value={history.id}>Lần #{histories.length - index} ({formatDate(history.analyzed_at)}){index === 0 ? " - Mới nhất" : ""}</option>)}
        </select>
      </div>}
    </div>

    <SentimentChart positive={analysis.positive_count} negative={analysis.negative_count} neutral={analysis.neutral_count} />

    <ProductInsights data={analysis.insights} source={analysis.insights_source} productId={productId} historyId={analysis.history_id} />

    <section className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
      <RatingChart summary={rating} source={analysis.rating_summary_source} />
      <RiskChart summary={analysis.risk_summary} totalReviews={analysis.risk_total_reviews ?? analysis.total_reviews} productId={productId} source={analysis.risk_summary_source} />
      <IssueChart data={analysis.issue_summary} />
      <AnalysisTrendChart histories={histories} selectedId={analysis.history_id} />
    </section>
  </div>;
}

export default Dashboard;
