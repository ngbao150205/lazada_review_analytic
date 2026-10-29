import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { getProductReviews, type ProductReview } from "../services/api";
import { ProductPageState, ProductPagination, ProductRating, ProductSentiment } from "../components/ProductPageUI";

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

  if (!productId) return <ProductPageState title="Chưa chọn sản phẩm"><Link to="/history" className="product-button product-button--dark">Chọn sản phẩm từ lịch sử</Link></ProductPageState>;

  return <div className="product-page">
    {loading ? <ProductPageState title="Đang tải cảnh báo…" loading><p>{progress}</p></ProductPageState>
      : error ? <ProductPageState title="Chưa thể tải cảnh báo" error><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="product-button product-button--outline">Thử lại</button></ProductPageState>
      : <>
        <section className="product-panel" aria-labelledby="risk-search-title"><div className="product-toolbar"><h2 id="risk-search-title" className="product-panel__title">Tìm trong các phản ánh</h2><div className="product-field"><label htmlFor="risk-search">Nội dung hoặc từ khóa</label><div className="product-search"><Search aria-hidden="true" size={16} strokeWidth={1.5} /><input id="risk-search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nội dung, từ khóa hoặc mã đánh giá…" className="product-input" /></div></div></div></section>
        <p className="product-notice">Cảnh báo dựa trên nội dung phản ánh, chưa phải kết luận xác minh gian lận. Giao chậm, bao bì móp và lỗi chất lượng thông thường được xem ở mục Vấn đề. Chưa phát hiện dấu hiệu không có nghĩa sản phẩm an toàn.</p>
        <p role="status" className="product-muted">{number(filtered.length)} đánh giá có cảnh báo{query.trim() ? " khớp tìm kiếm" : ""} · Trang {safePage} / {pages}</p>
        {visible.length === 0 ? <ProductPageState title={query.trim() ? "Không có cảnh báo khớp tìm kiếm" : "Chưa ghi nhận đánh giá có cảnh báo"}><p>{query.trim() ? "Thử từ khóa khác hoặc xóa tìm kiếm để xem toàn bộ phản ánh." : "Các đánh giá có dấu hiệu gian lận hoặc hàng giả được nhận diện sẽ xuất hiện tại đây."}</p>{query.trim() && <button type="button" onClick={() => { setQuery(""); setPage(1); }} className="product-button product-button--outline">Xóa tìm kiếm</button>}</ProductPageState>
          : <div className="product-review-list">{visible.map(review => {
            const sentiment = typeof review.sentiment === "string" ? review.sentiment : review.sentiment?.sentiment;
            return <article key={review.id} className="product-review">
              <div className="product-review__header"><div><h2>Đánh giá #{review.review_id || review.id}</h2>{review.review_date && <p className="product-review__date">{new Date(review.review_date).toLocaleString("vi-VN")}</p>}</div><ProductRating rating={review.rating} /></div>
              <div className="product-review__tags"><span className="product-badge product-badge--risk">Có cảnh báo</span><ProductSentiment sentiment={sentiment} /></div>
              <p className="product-review__content">{review.content}</p>
              <p className="product-notice product-notice--risk">Từ khóa cảnh báo: <strong>{review.risk?.risk_keyword || "Chưa có từ khóa"}</strong></p>
            </article>;
          })}</div>}
        <ProductPagination page={safePage} totalPages={pages} onChange={setPage} label="Phân trang cảnh báo" />
      </>}
  </div>;
}
