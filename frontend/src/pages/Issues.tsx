import { API_BASE_URL, apiFetch } from "../services/http";
import { useEffect, useMemo, useState } from "react";
import type { ProductIssue } from "../services/api";
import IssueEvidenceDetails from "../components/IssueEvidenceDetails";

import {
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  AlertTriangle,
  Loader2,
  MessageSquareText,
  Search,
} from "lucide-react";



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

function getSentimentBadgeClass(sentiment?: string): string {
  if (sentiment === "Positive") {
    return "bg-green-100 text-green-700";
  }

  if (sentiment === "Negative") {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getStars(rating?: number | null): string {
  if (!rating) {
    return "Chưa có rating";
  }

  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
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

  const sentimentSummary = useMemo(() => {
    const summary: Record<SentimentFilter, number> = {
      ALL: flattenedIssues.length,
      Positive: 0,
      Neutral: 0,
      Negative: 0,
    };

    for (const item of flattenedIssues) {
      const sentiment = item.review.sentiment?.sentiment;

      if (
        sentiment === "Positive" ||
        sentiment === "Neutral" ||
        sentiment === "Negative"
      ) {
        summary[sentiment] += 1;
      }
    }

    return summary;
  }, [flattenedIssues]);

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

  if (loading) {
    return (
      <div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <div>
              <p className="font-medium">
                Đang tải dữ liệu nguyên nhân tiêu cực...
              </p>

              {loadingProgress && (
                <p className="mt-1 text-sm text-slate-500">
                  {loadingProgress}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Không thể tải dữ liệu
          </div>

          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">
          Product ID: {productId}
        </p>

        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Nguyên nhân tiêu cực
        </h1>

        <p className="mt-2 max-w-5xl text-slate-500">
          Trang này thống kê các vấn đề cụ thể được phát hiện từ review.
          Có thể lọc theo nhóm vấn đề, cảm xúc dự đoán và nội dung review.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Tổng review đã tải</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {reviews.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Review có vấn đề được phát hiện</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {reviewsWithIssues.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Nhóm vấn đề</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {issueTypes.length}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Các vấn đề thường gặp
        </h2>

        {issueTypes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
            Chưa phát hiện vấn đề cụ thể nào.
          </div>
        ) : (
          <div className="space-y-4">
            {issueTypes.map(({ issueType, count }) => {
              const percentage =
                totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0;

              return (
                <button
                  type="button"
                  key={issueType}
                  onClick={() => setSelectedIssueType(issueType)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedIssueType === issueType
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {getIssueLabel(issueType)}
                      </p>
                      <p className="text-xs text-slate-500">{issueType}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">
                        {count}
                      </p>
                      <p className="text-xs text-slate-500">{percentage}%</p>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Review có vấn đề
            </h2>
            <p className="text-sm text-slate-500">
              Danh sách review sau khi áp dụng bộ lọc hiện tại.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <select
              value={selectedIssueType}
              onChange={(event) => setSelectedIssueType(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất cả vấn đề</option>

              {issueTypes.map(({ issueType }) => (
                <option key={issueType} value={issueType}>
                  {getIssueLabel(issueType)}
                </option>
              ))}
            </select>

            <select
              value={selectedSentiment}
              onChange={(event) =>
                setSelectedSentiment(event.target.value as SentimentFilter)
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="ALL">
                Tất cả cảm xúc ({sentimentSummary.ALL})
              </option>
              <option value="Positive">
                Positive ({sentimentSummary.Positive})
              </option>
              <option value="Neutral">
                Neutral ({sentimentSummary.Neutral})
              </option>
              <option value="Negative">
                Negative ({sentimentSummary.Negative})
              </option>
            </select>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Tìm review, keyword, mã review..."
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500 md:w-72"
              />
            </div>
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
            <MessageSquareText className="mx-auto mb-3 h-8 w-8 text-slate-400" />

            <p className="font-medium text-slate-700">
              Không có review phù hợp.
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Thử đổi bộ lọc vấn đề, cảm xúc hoặc từ khóa tìm kiếm.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredIssues.map(({ review, issue }, index) => {
              const sentiment = review.sentiment?.sentiment;

              return (
                <div
                  key={`${review.id}-${issue.issue_type}-${issue.matched_keyword}-${index}`}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {getIssueLabel(issue.issue_type)}
                    </span>

                    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                      {issue.matched_keyword ? `Keyword: ${issue.matched_keyword}` : "Chưa xác định nhóm cụ thể"}
                    </span>

                    {sentiment && (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${getSentimentBadgeClass(
                          sentiment
                        )}`}
                      >
                        {sentiment}
                      </span>
                    )}

                    {review.rating !== null && review.rating !== undefined && (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                        {getStars(review.rating)} {review.rating}/5
                      </span>
                    )}
                  </div>

                  <p className="mb-3 whitespace-pre-line leading-relaxed text-slate-800">
                    {review.content || "Không có nội dung review."}
                  </p>

                  <IssueEvidenceDetails evidence={issue.evidence} label={getIssueLabel(issue.issue_type)} />

                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Review ID: {getReviewDisplayId(review)}</span>

                    <span>Ngày: {formatDate(review.review_date)}</span>

                    {review.risk?.risk_flag === true && (
                      <span>
                        Cảnh báo rủi ro
                        {review.risk.risk_keyword
                          ? ` · ${review.risk.risk_keyword}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Issues;
