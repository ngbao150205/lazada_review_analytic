import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  History as HistoryIcon,
  LayoutDashboard,
  Loader2,
  Search,
} from "lucide-react";

import {
  Link,
} from "react-router-dom";

import {
  getProductHistory,
  getProductHistories,
  type ProductHistoryItem,
  type AnalysisHistoryItem,
} from "../services/api";

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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatNumber(value?: number): string {
  return new Intl.NumberFormat("vi-VN").format(value || 0);
}

function History() {
  const [products, setProducts] = useState<ProductHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");

  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [productHistoriesMap, setProductHistoriesMap] = useState<Record<number, AnalysisHistoryItem[]>>({});
  const [loadingHistoriesMap, setLoadingHistoriesMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError("");

      try {
        const response = await getProductHistory();
        setProducts(response.products || []);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Không thể tải lịch sử phân tích.");
        }

        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  async function toggleSelectRuns(productId: number) {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }

    setExpandedProductId(productId);

    if (!productHistoriesMap[productId]) {
      setLoadingHistoriesMap((prev) => ({ ...prev, [productId]: true }));
      try {
        const data = await getProductHistories(productId);
        setProductHistoriesMap((prev) => ({
          ...prev,
          [productId]: data.histories || [],
        }));
      } catch (err) {
        console.error(`Lỗi tải lịch sử phân tích cho sản phẩm ${productId}:`, err);
        setProductHistoriesMap((prev) => ({
          ...prev,
          [productId]: [],
        }));
      } finally {
        setLoadingHistoriesMap((prev) => ({ ...prev, [productId]: false }));
      }
    }
  }

  const filteredProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.url.toLowerCase().includes(query) ||
        product.platform_product_id.toLowerCase().includes(query) ||
        String(product.id).includes(query) ||
        (product.category || "").toLowerCase().includes(query) ||
        (product.category_label || "").toLowerCase().includes(query)
      );
    });
  }, [products, searchText]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />

          <div>
            <p className="font-semibold">
              Đang tải lịch sử phân tích...
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Hệ thống đang lấy danh sách sản phẩm từ database.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-semibold">
          Không thể tải lịch sử phân tích
        </p>

        <p className="mt-2 text-sm">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          Lịch sử phân tích
        </h1>

        <p className="mt-2 text-slate-500">
          Chọn sản phẩm và chọn lần phân tích tương ứng để mở Dashboard kết quả.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Tổng sản phẩm đã phân tích
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {products.length}
            </p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />

            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm theo tên, URL, product ID, category..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>
      </section>

      {products.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <HistoryIcon className="mx-auto mb-4 h-10 w-10 text-slate-400" />

          <h2 className="text-lg font-semibold text-slate-800">
            Chưa có sản phẩm nào trong lịch sử
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Hãy phân tích một sản phẩm để hệ thống lưu vào database.
          </p>

          <Link
            to="/analyze"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Bắt đầu phân tích
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      ) : filteredProducts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">
            Không tìm thấy sản phẩm phù hợp
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Thử tìm bằng tên sản phẩm, URL, category hoặc product ID khác.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {filteredProducts.map((product) => {
            const isExpanded = expandedProductId === product.id;
            const histories = productHistoriesMap[product.id] || [];
            const isLoadingHistories = loadingHistoriesMap[product.id];

            return (
              <article
                key={product.id}
                className={`rounded-2xl border bg-white p-6 shadow-sm transition ${
                  isExpanded
                    ? "border-blue-300 ring-2 ring-blue-50"
                    : "border-slate-100 hover:border-blue-200 hover:shadow-md"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        Product ID: {product.id}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {product.platform === "import" ? "Tải từ file" : product.platform}
                      </span>

                      {product.category && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {product.category_label || product.category}
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 line-clamp-2 text-xl font-bold text-slate-900">
                      {product.name}
                    </h2>

                    <p className="mt-2 break-all text-sm text-slate-500">
                      {product.url || "Dữ liệu đánh giá tải từ file"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {product.platform !== "import" && <span className="rounded-full bg-slate-100 px-3 py-1">
                        Platform ID: {product.platform_product_id}
                      </span>}

                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Review: {formatNumber(product.total_reviews)}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Ngày tạo: {formatDate(product.created_at)}
                      </span>

                      {product.last_crawled_at && (
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          Cập nhật gần nhất: {formatDate(product.last_crawled_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => toggleSelectRuns(product.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${
                        isExpanded
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      {isExpanded ? "Đóng lần phân tích" : "Chọn lần phân tích"}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    <Link
                      to={`/products/${product.id}/reviews`}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Xem review
                    </Link>
                  </div>
                </div>

                {/* Sub-panel: Danh sách các lần phân tích */}
                {isExpanded && (
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <HistoryIcon className="h-4 w-4 text-blue-600" />
                        Danh sách các lần phân tích:
                      </div>

                      <span className="text-xs text-slate-500">
                        {isLoadingHistories
                          ? "Đang tải..."
                          : `${histories.length} lần phân tích được ghi nhận`}
                      </span>
                    </div>

                    {isLoadingHistories ? (
                      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        Đang lấy danh sách các lần phân tích...
                      </div>
                    ) : histories.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                        <p className="text-sm text-slate-600">
                          Chưa có lịch sử các snapshot riêng lẻ trong database.
                        </p>
                        <Link
                          to={`/products/${product.id}/dashboard`}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <LayoutDashboard className="h-3.5 w-3.5" />
                          Mở Dashboard tổng hợp hiện tại
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {histories.map((run, index) => {
                          const runNumber = histories.length - index;
                          const isLatest = index === 0;

                          return (
                            <div
                              key={run.id}
                              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50/40 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900 text-sm">
                                    Lần #{runNumber}
                                  </span>

                                  {isLatest && (
                                    <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                                      Mới nhất
                                    </span>
                                  )}

                                  <span className="text-xs text-slate-500">
                                    Thời gian: {formatDate(run.analyzed_at)}
                                  </span>
                                </div>

                                <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                                    Đánh giá: <b>{formatNumber(run.analyzed_reviews || run.total_reviews)}</b>
                                  </span>

                                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                    Tích cực: <b>{run.positive_rate}%</b> ({run.positive_count})
                                  </span>

                                  <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                                    Tiêu cực: <b>{run.negative_rate}%</b> ({run.negative_count})
                                  </span>

                                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                                    Trung tính: <b>{run.neutral_rate}%</b> ({run.neutral_count})
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                <Link
                                  to={`/products/${product.id}/dashboard?historyId=${run.id}`}
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 md:w-auto"
                                >
                                  <LayoutDashboard className="h-3.5 w-3.5" />
                                  Xem Dashboard lần này
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default History;
