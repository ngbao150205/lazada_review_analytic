import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useSearchParams,
  useParams,
  Link,
} from "react-router-dom";

import { Search } from "lucide-react";

import {
  getProductReviews,
  type ProductReview,
} from "../services/api";
import IssueEvidenceDetails from "../components/IssueEvidenceDetails";
import { ProductPageState, ProductPagination, ProductRating, ProductSentiment } from "../components/ProductPageUI";

type SentimentFilter = "ALL" | "Positive" | "Neutral" | "Negative";

const BACKEND_PAGE_SIZE = 100;
const CLIENT_PAGE_SIZE = 10;

function getReviewSentiment(review: ProductReview): string {
  if (
    review.sentiment &&
    typeof review.sentiment !== "string" &&
    review.sentiment.sentiment
  ) {
    return review.sentiment.sentiment;
  }

  return "";
}

function getReviewDisplayId(review: ProductReview): string | number {
  return review.review_id || review.id;
}

function getIssueLabel(issueType: string): string {
  const labels: Record<string, string> = {
    PRODUCT_QUALITY: "Chất lượng sản phẩm",
    SHIPPING_LOGISTICS: "Giao hàng và vận chuyển",
    CUSTOMER_SERVICE_RETURNS: "Dịch vụ khách hàng và đổi trả",
    PRICING_PROMOTIONS: "Giá cả và khuyến mãi",
    OTHER: "Vấn đề khác",
  };

  return labels[issueType] || issueType;
}

function Reviews() {
  const {
    productId: productIdFromParams,
  } = useParams();

  const [
    searchParams,
  ] = useSearchParams();

  const productId =
    productIdFromParams ||
    searchParams.get("productId");

  const [
    reviews,
    setReviews,
  ] = useState<ProductReview[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loadingProgress,
    setLoadingProgress,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    selectedSentiment,
    setSelectedSentiment,
  ] = useState<SentimentFilter>("ALL");

  const [
    selectedRating,
    setSelectedRating,
  ] = useState<number | "ALL">("ALL");

  const [
    searchText,
    setSearchText,
  ] = useState("");

  const [
    clientPage,
    setClientPage,
  ] = useState(1);


  useEffect(() => {
    async function fetchAllReviews() {
      if (!productId) {
        setReviews([]);
        return;
      }

      setLoading(true);
      setError("");
      setLoadingProgress("Đang tải page 1...");

      try {
        const firstResponse =
          await getProductReviews(
            productId,
            1,
            BACKEND_PAGE_SIZE
          );

        let allReviews =
          firstResponse.reviews || [];

        const totalPages =
          firstResponse.pagination?.total_pages || 1;


        if (totalPages > 1) {
          for (
            let page = 2;
            page <= totalPages;
            page += 1
          ) {
            setLoadingProgress(
              `Đang tải page ${page}/${totalPages}...`
            );

            const response =
              await getProductReviews(
                productId,
                page,
                BACKEND_PAGE_SIZE
              );

            allReviews = [
              ...allReviews,
              ...(response.reviews || []),
            ];
          }
        }

        setReviews(allReviews);
        setClientPage(1);

        localStorage.removeItem(
          "activeProductId"
        );
      } catch (err) {
        console.error(
          "Lỗi khi tải reviews:",
          err
        );

        if (
          err instanceof Error
        ) {
          setError(
            err.message
          );
        } else {
          setError(
            "Không thể tải danh sách đánh giá."
          );
        }

        setReviews([]);
      } finally {
        setLoading(false);
        setLoadingProgress("");
      }
    }

    fetchAllReviews();
  }, [
    productId,
  ]);

  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      const star = Math.max(1, Math.min(5, Math.round(r.rating || 0)));
      counts[star] = (counts[star] || 0) + 1;
    }
    return counts;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const query =
      searchText
        .trim()
        .toLowerCase();

    return reviews.filter((review) => {
      if (selectedRating !== "ALL") {
        const star = Math.max(1, Math.min(5, Math.round(review.rating || 0)));
        if (star !== selectedRating) {
          return false;
        }
      }

      const sentiment =
        getReviewSentiment(review);

      const matchSentiment =
        selectedSentiment === "ALL" ||
        sentiment === selectedSentiment;

      const reviewId =
        String(
          getReviewDisplayId(review)
        );

      const content =
        review.content || "";

      const matchSearch =
        query === "" ||
        content.toLowerCase().includes(query) ||
        reviewId.toLowerCase().includes(query) ||
        sentiment.toLowerCase().includes(query);

      return matchSentiment && matchSearch;
    });
  }, [
    reviews,
    selectedRating,
    selectedSentiment,
    searchText,
  ]);

  const clientTotalPages = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(
        filteredReviews.length / CLIENT_PAGE_SIZE
      )
    );
  }, [
    filteredReviews.length,
  ]);

  const paginatedReviews = useMemo(() => {
    const safePage = Math.min(
      clientPage,
      clientTotalPages
    );

    const start =
      (safePage - 1) * CLIENT_PAGE_SIZE;

    const end =
      start + CLIENT_PAGE_SIZE;

    return filteredReviews.slice(
      start,
      end
    );
  }, [
    filteredReviews,
    clientPage,
    clientTotalPages,
  ]);

  useEffect(() => {
    setClientPage(1);
  }, [
    selectedRating,
    selectedSentiment,
    searchText,
  ]);

  useEffect(() => {
    if (
      clientPage > clientTotalPages
    ) {
      setClientPage(
        clientTotalPages
      );
    }
  }, [
    clientPage,
    clientTotalPages,
  ]);

  if (!productId) return <ProductPageState title="Chưa chọn sản phẩm"><p>Chọn sản phẩm để xem các đánh giá đã lưu.</p><Link to="/history" className="product-button product-button--dark">Lịch sử phân tích</Link></ProductPageState>;
  if (loading) return <ProductPageState title="Đang tải đánh giá…" loading><p>{loadingProgress || "Đang tải dữ liệu đã lưu."}</p></ProductPageState>;
  if (error) return <ProductPageState title="Chưa thể tải đánh giá" error><p>{error}</p><Link to="/history" className="product-button product-button--outline">Về lịch sử phân tích</Link></ProductPageState>;

  return <div className="product-page">
    <section className="product-panel" aria-labelledby="reviews-filters-title">
      <div className="product-toolbar">
        <h2 id="reviews-filters-title" className="product-panel__title">Bộ lọc đánh giá</h2>
        <div className="product-toolbar__filters">
          <div className="product-field"><label htmlFor="reviews-sentiment">Cảm xúc</label><select id="reviews-sentiment" value={selectedSentiment} onChange={event => setSelectedSentiment(event.target.value as SentimentFilter)} className="product-select">
            <option value="ALL">Tất cả cảm xúc</option><option value="Positive">Positive</option><option value="Neutral">Neutral</option><option value="Negative">Negative</option>
          </select></div>
          <div className="product-field"><label htmlFor="reviews-search">Tìm đánh giá</label><div className="product-search"><Search aria-hidden="true" size={16} strokeWidth={1.5} /><input id="reviews-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Nội dung, mã đánh giá hoặc cảm xúc…" className="product-input" /></div></div>
        </div>
      </div>
      <div className="product-rating-filters" role="group" aria-label="Lọc đánh giá theo số sao"><span>Số sao</span><button type="button" aria-pressed={selectedRating === "ALL"} onClick={() => setSelectedRating("ALL")}>Tất cả</button>{[5, 4, 3, 2, 1].map(stars => <button key={stars} type="button" aria-pressed={selectedRating === stars} onClick={() => setSelectedRating(stars)} aria-label={`${stars} sao, ${ratingCounts[stars] || 0} đánh giá`}><span>{stars}</span><span aria-hidden="true" className="product-star">★</span><span>({ratingCounts[stars] || 0})</span></button>)}</div>
    </section>
    <p className="product-muted" role="status">{filteredReviews.length.toLocaleString("vi-VN")} đánh giá phù hợp · Trang {clientPage} / {clientTotalPages}</p>
    <section className="product-review-list" aria-label="Danh sách đánh giá">
      {paginatedReviews.length === 0 ? <ProductPageState title={reviews.length ? "Không có đánh giá phù hợp" : "Chưa có đánh giá"}><p>{reviews.length ? "Thử thay đổi số sao, cảm xúc hoặc từ khóa tìm kiếm." : "Các đánh giá đã lưu của sản phẩm sẽ xuất hiện tại đây."}</p>{reviews.length > 0 && <button type="button" onClick={() => { setSelectedRating("ALL"); setSelectedSentiment("ALL"); setSearchText(""); }} className="product-button product-button--outline">Đặt lại bộ lọc</button>}</ProductPageState>
        : paginatedReviews.map(review => <article key={review.id} className="product-review">
          <div className="product-review__header"><div><h2>Đánh giá #{getReviewDisplayId(review)}</h2>{review.review_date && <p className="product-review__date">{new Date(review.review_date).toLocaleString("vi-VN")}</p>}</div><ProductRating rating={review.rating} /></div>
          <p className="product-review__content">{review.content}</p>
          <div className="product-review__tags"><ProductSentiment sentiment={getReviewSentiment(review)} />{review.is_analyzed && <span className="product-badge">Đã phân tích</span>}{review.risk?.risk_flag && <span className="product-badge product-badge--risk">Cảnh báo rủi ro</span>}{review.issues?.map((issue, index) => <span key={`${issue.issue_type}-${index}`} className="product-badge">{getIssueLabel(issue.issue_type)}{issue.matched_keyword && ` · ${issue.matched_keyword}`}</span>)}</div>
          {review.issues?.map((issue, index) => <IssueEvidenceDetails key={`evidence-${issue.issue_type}-${index}`} evidence={issue.evidence} label={getIssueLabel(issue.issue_type)} />)}
          {review.issue_assessment?.needs_review && <p className="product-notice">{review.issue_assessment.reason}</p>}
          {review.risk?.risk_flag && <p className="product-notice product-notice--risk">Từ khóa cảnh báo: <strong>{review.risk.risk_keyword || "Chưa có từ khóa"}</strong></p>}
        </article>)}
    </section>
    <ProductPagination page={clientPage} totalPages={clientTotalPages} onChange={setClientPage} label="Phân trang đánh giá" />
  </div>;
}

export default Reviews;
