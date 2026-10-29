import { API_BASE_URL, apiFetch } from "../services/http";
import { useEffect, useMemo, useState } from "react";
import type { ProductIssue } from "../services/api";
import IssueEvidenceDetails from "../components/IssueEvidenceDetails";
import { ProductPageState, ProductPagination, ProductRating, ProductSentiment } from "../components/ProductPageUI";

import {
  useParams,
  useSearchParams,
} from "react-router-dom";

import { Search } from "lucide-react";



type ReviewIssue = ProductIssue;

type ReviewRisk = {
  risk_flag?: boolean;
  risk_keyword?: string | null;
};

type ReviewSentiment = {
  sentiment?: string;
  confidence?: number;
  model_version?: string;
  method?: string;
};

type ReviewItem = {
  id: number;
  review_id?: string | number | null;
  platform_review_id?: string | number | null;
  content: string;
  rating?: number | null;
  review_date?: string | null;
  sentiment?: ReviewSentiment | null;
  issues?: ReviewIssue[];
  risk?: ReviewRisk | null;
};

type ReviewsApiResponse =
  | ReviewItem[]
  | {
      product_id?: number;
      platform_product_id?: string | number;
      pagination?: {
        page: number;
        page_size: number;
        total_reviews: number;
        total_pages: number;
      };
      reviews?: ReviewItem[];
      data?: ReviewItem[];
      items?: ReviewItem[];
    };

type FlattenedIssue = {
  review: ReviewItem;
  issue: ReviewIssue;
};

type SentimentFilter = "ALL" | "Positive" | "Neutral" | "Negative";

function normalizeReviewsResponse(json: ReviewsApiResponse): ReviewItem[] {
  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.reviews)) {
    return json.reviews;
  }

  if (Array.isArray(json.data)) {
    return json.data;
  }

  if (Array.isArray(json.items)) {
    return json.items;
  }

  return [];
}

function getTotalPages(json: ReviewsApiResponse): number {
  if (Array.isArray(json)) {
    return 1;
  }

  return json.pagination?.total_pages || 1;
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

function formatDate(value?: string | null): string {
  if (!value) {
    return "Không rõ ngày";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getReviewDisplayId(review: ReviewItem): string | number {
  return review.review_id || review.platform_review_id || review.id;
}

function Issues() {
  const {
    productId: productIdFromParams,
  } = useParams();

  const [
    searchParams,
  ] = useSearchParams();

  const productId =
    productIdFromParams ||
    searchParams.get("productId");

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [selectedIssueType, setSelectedIssueType] = useState<string>("ALL");
  const [selectedSentiment, setSelectedSentiment] =
    useState<SentimentFilter>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  useEffect(() => {
    async function fetchAllReviews() {
      if (!productId) {
        setError("Chưa chọn sản phẩm. Vui lòng bắt đầu phân tích sản phẩm trước.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setLoadingProgress("Đang tải page 1...");

        const pageSize = 100;

        const firstResponse = await apiFetch(
          `${API_BASE_URL}/products/${productId}/reviews?page=1&page_size=${pageSize}`
        );

        if (!firstResponse.ok) {
          throw new Error(
            `Không thể tải dữ liệu review. HTTP ${firstResponse.status}`
          );
        }

        const firstJson: ReviewsApiResponse = await firstResponse.json();

        let allReviews = normalizeReviewsResponse(firstJson);
        const totalPages = getTotalPages(firstJson);

        if (totalPages > 1) {
          for (let page = 2; page <= totalPages; page += 1) {
            setLoadingProgress(`Đang tải page ${page}/${totalPages}...`);

            const response = await apiFetch(
              `${API_BASE_URL}/products/${productId}/reviews?page=${page}&page_size=${pageSize}`
            );

            if (!response.ok) {
              continue;
            }

            const json: ReviewsApiResponse = await response.json();
            const pageReviews = normalizeReviewsResponse(json);

            allReviews = [...allReviews, ...pageReviews];
          }
        }

        setReviews(allReviews);

        localStorage.removeItem(
          "activeProductId"
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định.");
      } finally {
        setLoading(false);
        setLoadingProgress("");
      }
    }

    fetchAllReviews();
  }, [productId]);

  const reviewsWithIssues = useMemo(() => {
    return reviews.filter((review) => {
      return Array.isArray(review.issues) && review.issues.length > 0;
    });
  }, [reviews]);

  const flattenedIssues: FlattenedIssue[] = useMemo(() => {
    return reviewsWithIssues.flatMap((review) => {
      return (review.issues || []).map((issue) => ({
        review,
        issue,
      }));
    });
  }, [reviewsWithIssues]);

  const issueSummary = useMemo(() => {
    const summary: Record<string, number> = {};

    for (const item of flattenedIssues) {
      const issueType = item.issue.issue_type;

      if (!issueType) {
        continue;
      }

      summary[issueType] = (summary[issueType] || 0) + 1;
    }

    return summary;
  }, [flattenedIssues]);

  const issueTypes = useMemo(() => {
    return Object.entries(issueSummary)
      .sort((a, b) => b[1] - a[1])
      .map(([issueType, count]) => ({
        issueType,
        count,
      }));
  }, [issueSummary]);

  const totalIssues = useMemo(() => {
    return Object.values(issueSummary).reduce((sum, count) => sum + count, 0);
  }, [issueSummary]);

  const filteredIssues = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return flattenedIssues.filter(({ review, issue }) => {
      const matchIssueType =
        selectedIssueType === "ALL" || issue.issue_type === selectedIssueType;

      const reviewSentiment = review.sentiment?.sentiment || "";

      const matchSentiment =
        selectedSentiment === "ALL" || reviewSentiment === selectedSentiment;

      const content = review.content || "";
      const keyword = issue.matched_keyword || "";
      const issueType = issue.issue_type || "";
      const reviewId = String(getReviewDisplayId(review));

      const matchSearch =
        query === "" ||
        content.toLowerCase().includes(query) ||
        keyword.toLowerCase().includes(query) ||
        issueType.toLowerCase().includes(query) ||
        reviewSentiment.toLowerCase().includes(query) ||
        reviewId.toLowerCase().includes(query);

      return matchIssueType && matchSentiment && matchSearch;
    });
  }, [flattenedIssues, selectedIssueType, selectedSentiment, searchText]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [productId, selectedIssueType, selectedSentiment, searchText]);
  const pages = Math.max(1, Math.ceil(filteredIssues.length / 10));
  const safePage = Math.min(page, pages);
  const visibleIssues = filteredIssues.slice((safePage - 1) * 10, safePage * 10);

  if (loading) return <ProductPageState title="Đang tải các phản ánh…" loading><p>{loadingProgress}</p></ProductPageState>;
  if (error) return <ProductPageState title="Chưa thể tải dữ liệu" error><p>{error}</p></ProductPageState>;

  return <div className="product-page product-issues-grid">
    <aside className="product-panel" aria-labelledby="issues-groups-title"><h2 id="issues-groups-title" className="product-panel__title">Các vấn đề thường gặp</h2>
      <div className="product-issue-groups"><button type="button" className="product-issue-group" aria-pressed={selectedIssueType === "ALL"} onClick={() => setSelectedIssueType("ALL")}><span>Tất cả vấn đề<strong>{totalIssues.toLocaleString("vi-VN")}</strong></span></button>{issueTypes.map(({ issueType, count }) => {
        const percentage = totalIssues ? Math.round(count / totalIssues * 100) : 0;
        return <button key={issueType} type="button" className="product-issue-group" aria-pressed={selectedIssueType === issueType} onClick={() => setSelectedIssueType(issueType)}><span><span>{getIssueLabel(issueType)}</span><strong>{count.toLocaleString("vi-VN")}</strong></span><small>{percentage}% phản ánh được phân nhóm</small><span aria-hidden="true" className="product-issue-group__track"><span style={{ width: `${percentage}%` }} /></span></button>;
      })}</div>{issueTypes.length === 0 && <p className="product-panel__description">Chưa phát hiện vấn đề cụ thể.</p>}
    </aside>
    <section className="product-issues-results" aria-label="Danh sách phản ánh theo vấn đề">
      <div className="product-panel"><div className="product-toolbar"><h2 className="product-panel__title">Bộ lọc phản ánh</h2><div className="product-toolbar__filters">
        <div className="product-field"><label htmlFor="issues-type">Nhóm vấn đề</label><select id="issues-type" value={selectedIssueType} onChange={event => setSelectedIssueType(event.target.value)} className="product-select"><option value="ALL">Tất cả vấn đề</option>{issueTypes.map(({ issueType }) => <option key={issueType} value={issueType}>{getIssueLabel(issueType)}</option>)}</select></div>
        <div className="product-field"><label htmlFor="issues-sentiment">Cảm xúc</label><select id="issues-sentiment" value={selectedSentiment} onChange={event => setSelectedSentiment(event.target.value as SentimentFilter)} className="product-select"><option value="ALL">Tất cả cảm xúc</option><option value="Positive">Positive</option><option value="Neutral">Neutral</option><option value="Negative">Negative</option></select></div>
        <div className="product-field"><label htmlFor="issues-search">Tìm phản ánh</label><div className="product-search"><Search aria-hidden="true" size={16} strokeWidth={1.5} /><input id="issues-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Nội dung, từ khóa hoặc mã đánh giá…" className="product-input" /></div></div>
      </div></div></div>
      <p className="product-muted" role="status">{filteredIssues.length.toLocaleString("vi-VN")} phản ánh phù hợp · Trang {safePage} / {pages}</p>
      {visibleIssues.length === 0 ? <ProductPageState title="Không có phản ánh phù hợp"><p>Thử thay đổi nhóm vấn đề, cảm xúc hoặc từ khóa tìm kiếm.</p><button type="button" onClick={() => { setSelectedIssueType("ALL"); setSelectedSentiment("ALL"); setSearchText(""); }} className="product-button product-button--outline">Đặt lại bộ lọc</button></ProductPageState>
        : <div className="product-review-list">{visibleIssues.map(({ review, issue }, index) => <article key={`${review.id}-${issue.issue_type}-${issue.matched_keyword}-${index}`} className="product-review">
          <div className="product-review__header"><div><h3>Đánh giá #{getReviewDisplayId(review)}</h3><p className="product-review__date">{formatDate(review.review_date)}</p></div><ProductRating rating={review.rating} /></div>
          <div className="product-review__tags"><span className="product-badge">{getIssueLabel(issue.issue_type)}</span>{issue.matched_keyword && <span className="product-badge">Từ khóa: {issue.matched_keyword}</span>}<ProductSentiment sentiment={review.sentiment?.sentiment} />{review.risk?.risk_flag && <span className="product-badge product-badge--risk">Cảnh báo rủi ro{review.risk.risk_keyword && ` · ${review.risk.risk_keyword}`}</span>}</div>
          <p className="product-review__content">{review.content || "Không có nội dung đánh giá."}</p>
          <IssueEvidenceDetails evidence={issue.evidence} label={getIssueLabel(issue.issue_type)} />
        </article>)}</div>}
      <ProductPagination page={safePage} totalPages={pages} onChange={setPage} label="Phân trang phản ánh" />
    </section>
  </div>;
}

export default Issues;
