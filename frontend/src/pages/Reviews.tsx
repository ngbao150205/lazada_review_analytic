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

import {
  Search,
  Star,
} from "lucide-react";

import {
  getProductReviews,
  type ProductReview,
} from "../services/api";
import IssueEvidenceDetails from "../components/IssueEvidenceDetails";

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

function getSentimentBadgeClass(sentiment: string): string {
  if (sentiment === "Positive") {
    return "bg-green-100 text-green-700";
  }

  if (sentiment === "Negative") {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getReviewDisplayId(review: ProductReview): string | number {
  return review.review_id || review.id;
}

function getStars(rating?: number | null): string {
  const safeRating = Math.max(
    0,
    Math.min(
      5,
      rating ?? 0
    )
  );

  return "★".repeat(safeRating);
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

  const [
    totalReviews,
    setTotalReviews,
  ] = useState(0);

  useEffect(() => {
    async function fetchAllReviews() {
      if (!productId) {
        setReviews([]);
        setTotalReviews(0);
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

        const total =
          firstResponse.pagination?.total_reviews ||
          allReviews.length;

        setTotalReviews(total);

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
        setTotalReviews(0);
      } finally {
        setLoading(false);
        setLoadingProgress("");
      }
    }

    fetchAllReviews();
  }, [
    productId,
  ]);

  const sentimentSummary = useMemo(() => {
    const summary: Record<SentimentFilter, number> = {
      ALL: reviews.length,
      Positive: 0,
      Neutral: 0,
      Negative: 0,
    };

    for (const review of reviews) {
      const sentiment = getReviewSentiment(review);

      if (
        sentiment === "Positive" ||
        sentiment === "Neutral" ||
        sentiment === "Negative"
      ) {
        summary[sentiment] += 1;
      }
    }

    return summary;
  }, [
    reviews,
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

  if (!productId) {
    return (
      <div className="
        flex
        min-h-[400px]
        items-center
        justify-center
      ">
        <div className="
          max-w-lg
          text-center
        ">
          <div className="
            mb-4
            text-4xl
          ">
            !
          </div>

          <h2 className="
            text-2xl
            font-bold
            text-slate-800
          ">
            Chưa chọn sản phẩm
          </h2>

          <p className="
            mt-3
            text-slate-500
          ">
            Vui lòng bắt đầu phân tích sản phẩm để xem đánh giá.
          </p>

          <Link
            to="/analyze"
            className="
              mt-6
              inline-block
              rounded-xl
              bg-blue-600
              px-5
              py-3
              font-semibold
              text-white
              transition
              hover:bg-blue-700
            "
          >
            Bắt đầu phân tích
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="
        flex
        min-h-[400px]
        items-center
        justify-center
      ">
        <div className="
          rounded-2xl
          border
          border-slate-100
          bg-white
          p-8
          text-center
          shadow-sm
        ">
          <div className="
            mb-3
            text-lg
            font-semibold
            text-slate-700
          ">
            Đang tải toàn bộ đánh giá...
          </div>

          <p className="
            text-sm
            text-slate-500
          ">
            {loadingProgress || "Đang lấy dữ liệu từ database."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="
        flex
        min-h-[400px]
        items-center
        justify-center
      ">
        <div className="
          max-w-lg
          text-center
        ">
          <div className="
            mb-4
            text-4xl
            text-red-500
          ">
            !
          </div>

          <h2 className="
            text-2xl
            font-bold
            text-slate-800
          ">
            Không thể tải đánh giá
          </h2>

          <p className="
            mt-3
            text-sm
            text-red-600
          ">
            {error}
          </p>

          <Link
            to="/analyze"
            className="
              mt-6
              inline-block
              rounded-xl
              bg-blue-600
              px-5
              py-3
              font-semibold
              text-white
              transition
              hover:bg-blue-700
            "
          >
            Phân tích sản phẩm khác
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="
      space-y-6
    ">
      <header>
        <p className="
          text-sm
          font-semibold
          text-blue-600
        ">
          Product ID: {productId}
        </p>

        <h1 className="
          mt-1
          text-3xl
          font-bold
          text-slate-800
        ">
          Đánh giá khách hàng
        </h1>

        <p className="
          mt-2
          text-slate-500
        ">
          Danh sách đánh giá của sản phẩm từ database.
        </p>

        <p className="
          mt-1
          text-sm
          text-slate-400
        ">
          Tổng cộng:{" "}
          <span className="
            font-semibold
            text-slate-600
          ">
            {totalReviews}
          </span>{" "}
          đánh giá · Đã tải:{" "}
          <span className="
            font-semibold
            text-slate-600
          ">
            {reviews.length}
          </span>
        </p>
      </header>

      {reviews.length === 0 ? (
        <div className="
          rounded-2xl
          border
          border-slate-200
          bg-white
          p-10
          text-center
          shadow-sm
        ">
          <h2 className="
            text-lg
            font-semibold
            text-slate-700
          ">
            Chưa có đánh giá
          </h2>

          <p className="
            mt-2
            text-sm
            text-slate-500
          ">
            Sản phẩm chưa có review trong database.
          </p>
        </div>
      ) : (
        <>
          <section className="
            grid
            grid-cols-1
            gap-4
            md:grid-cols-4
          ">
            <button
              type="button"
              onClick={() => setSelectedSentiment("ALL")}
              className={`
                rounded-2xl
                border
                p-5
                text-left
                shadow-sm
                transition
                ${
                  selectedSentiment === "ALL"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }
              `}
            >
              <p className="
                text-sm
                text-slate-500
              ">
                Tất cả
              </p>

              <p className="
                mt-2
                text-2xl
                font-bold
                text-slate-900
              ">
                {sentimentSummary.ALL}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSentiment("Positive")}
              className={`
                rounded-2xl
                border
                p-5
                text-left
                shadow-sm
                transition
                ${
                  selectedSentiment === "Positive"
                    ? "border-green-500 bg-green-50"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }
              `}
            >
              <p className="
                text-sm
                text-slate-500
              ">
                Positive
              </p>

              <p className="
                mt-2
                text-2xl
                font-bold
                text-green-700
              ">
                {sentimentSummary.Positive}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSentiment("Neutral")}
              className={`
                rounded-2xl
                border
                p-5
                text-left
                shadow-sm
                transition
                ${
                  selectedSentiment === "Neutral"
                    ? "border-slate-500 bg-slate-50"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }
              `}
            >
              <p className="
                text-sm
                text-slate-500
              ">
                Neutral
              </p>

              <p className="
                mt-2
                text-2xl
                font-bold
                text-slate-700
              ">
                {sentimentSummary.Neutral}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSentiment("Negative")}
              className={`
                rounded-2xl
                border
                p-5
                text-left
                shadow-sm
                transition
                ${
                  selectedSentiment === "Negative"
                    ? "border-red-500 bg-red-50"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }
              `}
            >
              <p className="
                text-sm
                text-slate-500
              ">
                Negative
              </p>

              <p className="
                mt-2
                text-2xl
                font-bold
                text-red-700
              ">
                {sentimentSummary.Negative}
              </p>
            </button>
          </section>

          <section className="
            flex
            flex-col
            gap-4
            rounded-2xl
            border
            border-slate-100
            bg-white
            p-4
            shadow-sm
          ">
            <div className="
              flex
              flex-col
              gap-3
              md:flex-row
              md:items-center
              md:justify-between
            ">
              <div>
                <p className="
                  text-sm
                  font-semibold
                  text-slate-700
                ">
                  Bộ lọc đánh giá
                </p>

                <p className="
                  text-xs
                  text-slate-500
                ">
                  Đang hiển thị {paginatedReviews.length} review trên trang {clientPage} / {clientTotalPages}.
                  Tổng sau lọc: {filteredReviews.length}.
                </p>
              </div>

              <div className="
                flex
                flex-col
                gap-3
                md:flex-row
                md:items-center
              ">
                <select
                  value={selectedSentiment}
                  onChange={(event) =>
                    setSelectedSentiment(
                      event.target.value as SentimentFilter
                    )
                  }
                  className="
                    rounded-xl
                    border
                    border-slate-200
                    bg-white
                    px-4
                    py-2
                    text-sm
                    outline-none
                    focus:border-blue-500
                  "
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

                <div className="
                  relative
                  w-full
                  md:w-80
                ">
                  <Search className="
                    absolute
                    left-3
                    top-2.5
                    h-4
                    w-4
                    text-slate-400
                  " />

                  <input
                    value={searchText}
                    onChange={(event) =>
                      setSearchText(event.target.value)
                    }
                    placeholder="Tìm review, mã review, sentiment..."
                    className="
                      w-full
                      rounded-xl
                      border
                      border-slate-200
                      py-2
                      pl-9
                      pr-4
                      text-sm
                      outline-none
                      focus:border-blue-500
                    "
                  />
                </div>
              </div>
            </div>

            {/* BỘ LỌC THEO SỐ SAO 1 - 5 */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
              <span className="mr-1 text-xs font-semibold text-slate-500">Số sao:</span>
              <button
                type="button"
                onClick={() => setSelectedRating("ALL")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  selectedRating === "ALL"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tất cả ({reviews.length})
              </button>

              {[5, 4, 3, 2, 1].map((stars) => {
                const count = ratingCounts[stars] || 0;
                const isSelected = selectedRating === stars;
                return (
                  <button
                    key={stars}
                    type="button"
                    onClick={() => setSelectedRating(stars)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-300"
                        : "border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100/80"
                    }`}
                  >
                    <span>{stars}</span>
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isSelected
                          ? "fill-white text-white"
                          : "fill-amber-400 text-amber-400"
                      }`}
                    />
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        isSelected
                          ? "bg-amber-600 text-white"
                          : "bg-amber-200/60 text-amber-900"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="
            space-y-4
          ">
            {paginatedReviews.length === 0 ? (
              <div className="
                rounded-2xl
                border
                border-dashed
                border-slate-200
                bg-white
                p-10
                text-center
                shadow-sm
              ">
                <h2 className="
                  text-lg
                  font-semibold
                  text-slate-700
                ">
                  Không có review phù hợp
                </h2>

                <p className="
                  mt-2
                  text-sm
                  text-slate-500
                ">
                  Thử đổi bộ lọc số sao, cảm xúc hoặc từ khóa tìm kiếm.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRating("ALL");
                    setSelectedSentiment("ALL");
                    setSearchText("");
                  }}
                  className="
                    mt-3
                    inline-flex
                    items-center
                    gap-1.5
                    rounded-lg
                    bg-slate-100
                    px-3
                    py-1.5
                    text-xs
                    font-semibold
                    text-slate-700
                    hover:bg-slate-200
                  "
                >
                  Đặt lại bộ lọc
                </button>
              </div>
            ) : (
              paginatedReviews.map((review) => {
                const sentiment =
                  getReviewSentiment(review);

                return (
                  <article
                    key={review.id}
                    className="
                      rounded-2xl
                      border
                      border-slate-200
                      bg-white
                      p-6
                      shadow-sm
                    "
                  >
                    <div className="
                      flex
                      flex-col
                      gap-3
                      sm:flex-row
                      sm:items-center
                      sm:justify-between
                    ">
                      <div>
                        <p className="
                          text-sm
                          font-semibold
                          text-slate-700
                        ">
                          Review #{getReviewDisplayId(review)}
                        </p>

                        {review.review_date && (
                          <p className="
                            mt-1
                            text-xs
                            text-slate-400
                          ">
                            {new Date(
                              review.review_date
                            ).toLocaleString(
                              "vi-VN"
                            )}
                          </p>
                        )}
                      </div>

                      <div className="
                        font-semibold
                        text-amber-500
                      ">
                        {getStars(review.rating)}

                        <span className="
                          ml-2
                          text-sm
                          text-slate-500
                        ">
                          {review.rating}/5
                        </span>
                      </div>
                    </div>

                    <p className="
                      mt-5
                      whitespace-pre-wrap
                      leading-7
                      text-slate-700
                    ">
                      {review.content}
                    </p>

                    <div className="
                      mt-5
                      flex
                      flex-wrap
                      gap-2
                    ">
                      {sentiment && (
                        <span
                          className={`
                            rounded-full
                            px-3
                            py-1
                            text-xs
                            font-semibold
                            ${getSentimentBadgeClass(sentiment)}
                          `}
                        >
                          {sentiment}
                        </span>
                      )}

                      {review.is_analyzed && (
                        <span className="
                          rounded-full
                          bg-blue-100
                          px-3
                          py-1
                          text-xs
                          font-semibold
                          text-blue-700
                        ">
                          Đã phân tích
                        </span>
                      )}

                      {review.risk?.risk_flag && (
                        <span className="
                          rounded-full
                          bg-red-100
                          px-3
                          py-1
                          text-xs
                          font-semibold
                          text-red-700
                        ">
                          Cảnh báo rủi ro
                        </span>
                      )}
                    </div>

                    {Array.isArray(review.issues) && review.issues.length > 0 && (
                      <div className="
                        mt-4
                      ">
                        <p className="
                          mb-2
                          text-xs
                          font-semibold
                          uppercase
                          tracking-wide
                          text-slate-500
                        ">
                          Vấn đề phát hiện
                        </p>

                        <div className="
                          flex
                          flex-wrap
                          gap-2
                        ">
                          {review.issues.map(
                            (
                              issue,
                              index
                            ) => (
                              <span
                                key={`${issue.issue_type}-${index}`}
                                className="
                                  rounded-lg
                                  bg-orange-50
                                  px-3
                                  py-1.5
                                  text-xs
                                  font-medium
                                  text-orange-700
                                "
                              >
                                {getIssueLabel(issue.issue_type)}

                                {issue.matched_keyword && (
                                  <span className="
                                    ml-1
                                    text-orange-500
                                  ">
                                    ({issue.matched_keyword})
                                  </span>
                                )}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {review.issues?.map((issue, index) => <IssueEvidenceDetails key={`evidence-${issue.issue_type}-${index}`} evidence={issue.evidence} label={getIssueLabel(issue.issue_type)} />)}

                    {review.issue_assessment?.needs_review && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{review.issue_assessment.reason}</p>}

                    {review.risk?.risk_flag && (
                      <div className="
                        mt-4
                        rounded-xl
                        border
                        border-red-100
                        bg-red-50
                        p-4
                      ">
                        <p className="
                          text-sm
                          font-semibold
                          text-red-700
                        ">
                          Phát hiện rủi ro
                        </p>

                        <p className="
                          mt-1
                          text-xs
                          text-red-600
                        ">
                          {review.risk.risk_keyword && (
                            <>
                              Từ khóa:{" "}
                              <strong>
                                {review.risk.risk_keyword}
                              </strong>
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>

          {clientTotalPages > 1 && (
            <div className="
              flex
              items-center
              justify-center
              gap-4
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-4
              shadow-sm
            ">
              <button
                type="button"
                disabled={
                  clientPage <= 1
                }
                onClick={() => {
                  setClientPage(
                    (current) =>
                      Math.max(
                        1,
                        current - 1
                      )
                  );
                }}
                className="
                  rounded-lg
                  border
                  border-slate-200
                  px-4
                  py-2
                  text-sm
                  font-medium
                  text-slate-700
                  transition
                  hover:bg-slate-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                ← Trước
              </button>

              <span className="
                text-sm
                font-medium
                text-slate-600
              ">
                Trang {clientPage} / {clientTotalPages}
              </span>

              <button
                type="button"
                disabled={
                  clientPage >= clientTotalPages
                }
                onClick={() => {
                  setClientPage(
                    (current) =>
                      Math.min(
                        clientTotalPages,
                        current + 1
                      )
                  );
                }}
                className="
                  rounded-lg
                  border
                  border-slate-200
                  px-4
                  py-2
                  text-sm
                  font-medium
                  text-slate-700
                  transition
                  hover:bg-slate-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Sau →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Reviews;
