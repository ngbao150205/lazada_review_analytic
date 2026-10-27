import { API_BASE_URL, apiFetch } from './http';
import type { InsightEvidenceResponse, InsightItem, RatingSummary } from './api';

export type ComparisonSide = 'a' | 'b';
export interface AspectSide {
  positive_count: number; negative_count: number; mentioned_reviews: number;
  positive_percentage: number | null; negative_percentage: number | null;
  positive_key: string; negative_key: string;
}
export interface ComparisonAspect {
  id: string; title: string; action: string; sufficient: boolean; a: AspectSide; b: AspectSide;
  positive_delta_pp: number | null; negative_delta_pp: number | null;
  positive_relation: string; negative_relation: string;
}
interface ComparedProduct {
  id: number; name: string; category_label: string; total_reviews: number; analyzed_reviews: number;
  rating: RatingSummary; risk_count: number;
  sentiments: Record<string, { count: number; percentage: number | null }>;
  review_date_from: string | null; review_date_to: string | null; latest_analysis_at: string | null; undated_reviews: number;
  strengths: InsightItem[]; weaknesses: InsightItem[];
}
export interface ComparisonFinding {
  title: string; text: string; action: string; side: ComparisonSide; evidence_key: string; count: number;
}
export interface ProductComparison {
  id: number; created_at: string; rule_version: string;
  products: Record<ComparisonSide, ComparedProduct>; aspects: ComparisonAspect[];
  findings: { strengths: ComparisonFinding[]; weaknesses: ComparisonFinding[]; priorities: ComparisonFinding[] };
  window: { start_date: string | null; end_date: string | null };
  comparability: { same_category: boolean }; counting_note: string; warnings: string[];
  policy: { min_reviews_per_product: number; min_mentions_per_product: number; min_polarity_reviews: number; difference_percentage_points: number };
}
export interface ComparisonHistory {
  comparisons: {id: number; created_at: string; competitor_id: number; competitor_name: string; window: ProductComparison['window']}[];
  pagination: {page: number; total: number; total_pages: number};
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    let message = `Không thể tải so sánh. HTTP ${response.status}`;
    try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail; } catch { /* use status */ }
    throw new Error(message);
  }
  return response.json();
}
export const listComparisons = (productId: string, page = 1) => request<ComparisonHistory>(`/products/${productId}/comparisons?page=${page}`);
export const getComparison = (productId: string, id: string) => request<ProductComparison>(`/products/${productId}/comparisons/${id}`);
export const createComparison = (productId: string, competitorId: string) => request<ProductComparison>(`/products/${productId}/comparisons`, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({competitor_id: Number(competitorId)}),
});
export const getComparisonEvidence = (productId: string, id: number, side: ComparisonSide, key: string, page: number) =>
  request<InsightEvidenceResponse>(`/products/${productId}/comparisons/${id}/evidence?${new URLSearchParams({side, evidence_key: key, page: String(page), page_size: '10'})}`);
