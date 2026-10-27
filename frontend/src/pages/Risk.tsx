import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { getProductReviews, type ProductReview } from "../services/api";

const PAGE_SIZE = 10;
const number = (value: number) => value.toLocaleString("vi-VN");

export default function Risk() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const productId = params.productId || searchParams.get("productId") || "";
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let ignore = false;
    if (!productId) return;
    setLoading(true);
    setError("");
    setReviews([]);
    setProgress("Đang tải đánh giá...");
    async function load() {
      try {
        const first = await getProductReviews(productId, 1, 100);
        let all = first.reviews || [];
        const pages = first.pagination?.total_pages || 1;
        for (let index = 2; index <= pages; index += 1) {
          if (ignore) return;
          setProgress(`Đang tải trang ${index}/${pages}...`);
          const result = await getProductReviews(productId, index, 100);
          all = all.concat(result.reviews || []);
        }
        if (!ignore) { setReviews(all); setPage(1); }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Không thể tải cảnh báo rủi ro.");
      } finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; };
  }, [productId, retry]);

  const flagged = useMemo(() => reviews.filter((review) => review.risk?.risk_flag), [reviews]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("vi-VN");
    return flagged.filter((review) => [review.content, review.review_id || review.id, review.risk?.risk_keyword]
      .join(" ").toLocaleLowerCase("vi-VN").includes(search));
  }, [flagged, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!productId) return <div className="rounded-2xl border bg-white p-8 text-center">
    <h1 className="text-xl font-semibold">Chưa chọn sản phẩm</h1><Link to="/analyze" className="mt-4 inline-block text-blue-600">Bắt đầu phân tích →</Link>
  </div>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900"><AlertTriangle className="text-red-500" />Cảnh báo rủi ro</h1>
        <p className="mt-3 text-sm text-slate-500">Sản phẩm #{productId} · Dấu hiệu lừa đảo, hàng giả, hàng nhái hoặc fake được người mua đề cập.</p></div>
      <Link to={`/products/${productId}/dashboard`} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-blue-600">Xem tổng quan</Link>
    </header>
    {loading ? <p role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">{progress}</p>
      : error ? <div role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-4 font-semibold underline">Thử lại</button></div>
      : <>
        <section aria-label="Thống kê cảnh báo" className="grid gap-4 sm:grid-cols-3">
          {[{ label: "Đánh giá có cảnh báo", value: number(flagged.length), color: "text-red-600" },
            { label: "Chưa phát hiện dấu hiệu", value: number(reviews.length - flagged.length), color: "text-slate-800" },
            { label: "Tỷ lệ có cảnh báo", value: `${reviews.length ? (flagged.length / reviews.length * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : 0}%`, color: "text-slate-800" }].map((item) =>
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{item.label}</p><strong className={`mt-2 block text-3xl ${item.color}`}>{item.value}</strong></div>)}
        </section>
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">Cảnh báo dựa trên nội dung phản ánh, chưa phải kết luận xác minh gian lận. Giao chậm, bao bì móp và lỗi chất lượng thông thường được xem ở mục Vấn đề. Chưa phát hiện dấu hiệu không có nghĩa sản phẩm an toàn.</p>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><Search size={18} className="text-slate-400" /><span className="sr-only">Tìm đánh giá có cảnh báo</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm nội dung, từ khóa hoặc ID đánh giá..." className="w-full bg-transparent text-sm outline-none" /></label>
        <p className="text-sm text-slate-500">{number(filtered.length)} đánh giá có cảnh báo{query.trim() ? " khớp tìm kiếm" : ""} / {number(reviews.length)} đánh giá đã lưu.</p>
        {visible.length === 0 ? <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">{query.trim() ? "Không có cảnh báo khớp tìm kiếm." : "Chưa phát hiện đánh giá có dấu hiệu gian lận/hàng giả."}</p>
          : <div className="space-y-4">{visible.map((review) => {
            const sentiment = typeof review.sentiment === "string" ? review.sentiment : review.sentiment?.sentiment;
            const rating = Number(review.rating);
            const validRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;
            return <article key={review.id} className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Review #{review.review_id || review.id}</h2><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Có cảnh báo</span></div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm"><span className="text-amber-500">{validRating ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)} ${rating}/5` : "Chưa có số sao"}</span>{sentiment && <span className="rounded bg-slate-100 px-2 text-slate-600">{sentiment}</span>}</div>
              <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-slate-800">{review.content}</p>
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Từ khóa cảnh báo: <strong>{review.risk?.risk_keyword || "Chưa có từ khóa"}</strong></p>
              {review.review_date && <p className="mt-3 text-xs text-slate-500">Ngày đánh giá: {new Date(review.review_date).toLocaleString("vi-VN")}</p>}
            </article>;
          })}</div>}
        {pages > 1 && <nav aria-label="Phân trang cảnh báo" className="flex items-center justify-center gap-4"><button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Trước</button><span className="text-sm">Trang {safePage}/{pages}</span><button type="button" disabled={safePage === pages} onClick={() => setPage(safePage + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Sau</button></nav>}
      </>}
  </div>;
}
