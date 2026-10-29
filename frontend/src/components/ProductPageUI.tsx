import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import "../pages/ProductPages.css";

export function ProductPageState({ title, children, loading = false, error = false }: {
  title: string; children?: ReactNode; loading?: boolean; error?: boolean;
}) {
  return <section className="product-state" role={error ? "alert" : loading ? "status" : undefined}>
    {loading && <Loader2 aria-hidden="true" size={24} strokeWidth={1.5} className="product-spinner" />}
    <h2>{title}</h2>{children}
  </section>;
}

export function ProductRating({ rating }: { rating?: number | null }) {
  const valid = typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5;
  if (!valid) return <span className="product-muted">Chưa có số sao</span>;
  return <span className="product-rating" role="img" aria-label={`${rating} trên 5 sao`}>
    <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
    <span className="product-rating__value" aria-hidden="true">{rating}/5</span>
  </span>;
}

export function ProductSentiment({ sentiment }: { sentiment?: string | null }) {
  if (!sentiment) return null;
  const labels: Record<string, string> = { Positive: "Positive", Neutral: "Neutral", Negative: "Negative" };
  return <span className="product-sentiment" data-tone={sentiment.toLowerCase()}>{labels[sentiment] || sentiment}</span>;
}

export function ProductPagination({ page, totalPages, onChange, label, disabled = false }: {
  page: number; totalPages: number; onChange: (page: number) => void; label: string; disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return <nav className="product-pagination" aria-label={label}>
    <span>Trang {page.toLocaleString("vi-VN")} / {totalPages.toLocaleString("vi-VN")}</span>
    <div><button type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} className="product-button product-button--outline"><ChevronLeft aria-hidden="true" size={16} strokeWidth={1.5} />Trước</button><button type="button" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)} className="product-button product-button--outline">Sau<ChevronRight aria-hidden="true" size={16} strokeWidth={1.5} /></button></div>
  </nav>;
}
