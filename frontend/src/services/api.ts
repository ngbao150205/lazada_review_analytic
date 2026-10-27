import { API_BASE_URL, apiFetch } from "./http";
import type {
  ProductAnalysisResponse,
} from "../types/product";


/*
 * ============================================================
 * API BASE URL
 * ============================================================
 */




/*
 * ============================================================
 * PRODUCT REVIEW
 * ============================================================
 */

export interface IssueEvidenceMatch {
  rule_id: string;
  keyword: string;
  rule_reason: string;
  strength: string;
  weight: number;
  text: string;
  original_start: number;
  original_end: number;
  accepted: boolean;
  reason: string;
  routing_reason?: string | null;
  routing_rule_id?: string | null;
  context_matches?: { text: string; original_start: number; original_end: number; matched_text: string }[];
}

export interface IssueEvidence {
  rule_version: string;
  context_rules_version: string;
  category: string;
  category_label: string;
  issue_group: string;
  score: number;
  threshold: number;
  reason: string;
  classification_source?: "text_rule" | "sentiment_policy";
  fallback_text?: string;
  decisive_rule_ids?: string[];
  matches: IssueEvidenceMatch[];
  excluded_occurrences?: IssueEvidenceMatch[];
}

export interface IssueAssessment {
  rule_version: string;
  eligible?: boolean;
  fallback_used?: boolean;
  needs_review: boolean;
  reason: string;
  has_weak_evidence: boolean;
  issue_count: number;
  review_check: { requested: boolean; triggers: string[]; sentiment: string | null; rating: number | null };
}

export interface ProductIssue {
  id?: number;
  review_id?: number;
  issue_type: string;
  matched_keyword: string;
  evidence?: IssueEvidence | null;
}

export interface ProductReview {
  id: number;

  review_id: string;

  content: string;

  rating: number;

  review_date?: string | null;

  sentiment:
    | {
        sentiment: string;

        confidence: number;

        model_version?: string;

        method?: string;
      }
    | string
    | null;

  issues: ProductIssue[];
  issue_assessment?: IssueAssessment | null;

  risk:
    | {
        risk_flag: boolean;

        risk_keyword: string | null;
      }
    | null;

  is_analyzed?: boolean;
}


/*
 * ============================================================
 * PRODUCT REVIEWS RESPONSE
 * ============================================================
 *
 * GET /products/{productId}/reviews
 */

export interface ProductReviewsResponse {
  product_id: number | string;

  platform_product_id: string;

  pagination: {
    page: number;

    page_size: number;

    total_reviews: number;

    total_pages: number;
  };

  reviews: ProductReview[];
}


/*
 * ============================================================
 * PRODUCT ANALYSIS API RESPONSE
 * ============================================================
 *
 * GET /products/{productId}/analysis
 *
 * Dữ liệu được lấy trực tiếp từ PostgreSQL
 * thông qua backend.
 */

export interface RatingSummary {
  counts: Record<string, number>;
  rated_reviews: number;
  unrated_reviews: number;
  average_rating: number | null;
}

export interface InsightExample {
  review_id: number;
  review_reference: string;
  quote: string;
  rating: number | null;
  polarity: string;
  rule_id: string;
}

export interface InsightItem {
  id: string;
  title: string;
  count: number;
  evidence_key: string;
  examples: InsightExample[];
  text?: string;
  reason?: string;
  action?: string;
  mixed?: boolean;
  recurring?: boolean;
  positive_count?: number;
  negative_count?: number;
}

export interface ProductInsights {
  rule_version: string;
  overview: string;
  category_label: string;
  strengths: InsightItem[];
  weaknesses: InsightItem[];
  priorities: InsightItem[];
  counting_note: string;
  scope: {
    total_reviews: number;
    analyzed_reviews: number;
    recognized_reviews: number;
    unclassified_negative_reviews: number;
    excluded_promotional_reviews: number;
    small_sample: boolean;
    note: string;
  };
}

export interface InsightEvidenceResponse {
  source: "snapshot" | "current";
  note: string;
  reviews: {id: number; review_reference: string; content: string; rating: number | null; review_date?: string | null}[];
  pagination: {page: number; page_size: number; total_reviews: number; total_pages: number};
}

export async function getInsightEvidence(productId: string, evidenceKey: string, historyId: number | null | undefined, page = 1): Promise<InsightEvidenceResponse> {
  const params = new URLSearchParams({evidence_key: evidenceKey, page: String(page), page_size: "10"});
  if (historyId != null) params.set("history_id", String(historyId));
  const response = await apiFetch(`${API_BASE_URL}/products/${productId}/insights/evidence?${params}`);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export interface AnalysisHistoryItem {
  id: number;
  product_id: number;
  total_reviews: number;
  analyzed_reviews: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  positive_rate: number;
  negative_rate: number;
  neutral_rate: number;
  issue_summary: Record<string, number>;
  risk_summary: Record<string, number>;
  risk_summary_source?: "snapshot" | "current" | "unavailable";
  risk_total_reviews?: number;
  rating_summary?: RatingSummary | null;
  analyzed_at: string;
}

export interface ProductAnalysisApiResponse {
  product: {
    id: number;
    platform_product_id: string;
    platform: string;
    name: string;
    url: string;
    seller_name?: string | null;
    rating?: number | null;
    product_type?: string | null;
    category?: string | null;
    category_label?: string;
    issue_group?: string;
    total_reviews: number;
    is_active?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
    last_crawled_at?: string | null;
  };

  analysis: {
    total_reviews: number;
    analyzed_reviews: number;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    positive_rate: number;
    negative_rate: number;
    neutral_rate: number;
    issue_summary: Record<string, number>;
    risk_summary: Record<string, number>;
    risk_summary_source?: "snapshot" | "current" | "unavailable";
    risk_total_reviews?: number;
    rating_summary?: RatingSummary | null;
    rating_summary_source?: "snapshot" | "current" | "unavailable";
    insights?: ProductInsights | null;
    insights_source?: "snapshot" | "current" | "unavailable";
    history_id?: number | null;
    analyzed_at?: string | null;
  };

  latest_history?: AnalysisHistoryItem | null;
  selected_history?: AnalysisHistoryItem | null;
  histories?: AnalysisHistoryItem[];
}


/*
 * ============================================================
 * ANALYZE PRODUCT API RESPONSE
 * ============================================================
 *
 * POST /products/analyze
 *
 * Dùng khi user nhập URL Lazada.
 */

export interface AnalyzeProductResponse
  extends ProductAnalysisResponse {}


/*
 * ============================================================
 * PARSE API ERROR
 * ============================================================
 */

async function parseError(
  response: Response
): Promise<string> {

  const text =
    await response.text();


  if (!text) {

    return (
      `API error: ${response.status}`
    );

  }


  try {

    const data =
      JSON.parse(text);


    if (
      typeof data.detail ===
      "string"
    ) {

      return data.detail;

    }


    if (
      typeof data.message ===
      "string"
    ) {

      return data.message;

    }


    return JSON.stringify(
      data
    );

  } catch {

    return text;

  }

}


/*
 * ============================================================
 * ANALYZE PRODUCT
 * ============================================================
 *
 * POST /products/analyze
 *
 * Flow:
 *
 * Frontend
 *    ↓
 * POST /products/analyze
 *    ↓
 * Backend crawl + AI + database
 *    ↓
 * PostgreSQL
 *    ↓
 * Response
 */

export async function analyzeProduct(
  url: string
): Promise<AnalyzeProductResponse> {

  const cleanUrl =
    url.trim();


  if (!cleanUrl) {

    throw new Error(
      "URL sản phẩm không được để trống."
    );

  }


  const response =
    await apiFetch(
      `${API_BASE_URL}/products/analyze`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          url: cleanUrl,
        }),
      }
    );


  if (!response.ok) {

    throw new Error(
      await parseError(
        response
      )
    );

  }


  return response.json();

}


/*
 * ============================================================
 * GET PRODUCT ANALYSIS
 * ============================================================
 *
 * GET /products/{productId}/analysis
 *
 * Đây là API chính cho Dashboard.
 *
 * QUAN TRỌNG:
 *
 * API này KHÔNG crawl.
 * API này KHÔNG gọi AI.
 *
 * Backend đọc dữ liệu từ:
 *
 * products
 * reviews
 * review_analysis
 * issue_analysis
 * risk_detection
 * analysis_history
 */

export async function getProductAnalysis(
  productId: string | number,
  historyId?: string | number | null
): Promise<ProductAnalysisApiResponse> {
  const url = historyId
    ? `${API_BASE_URL}/products/${productId}/analysis?history_id=${historyId}`
    : `${API_BASE_URL}/products/${productId}/analysis`;

  const response = await apiFetch(url);

  if (!response.ok) {
    throw new Error(
      await parseError(
        response
      )
    );
  }

  return response.json();
}

export interface ReanalyzeProductResponse {
  product_db_id: number;
  analysis_history_id: number;
  reanalyzed_reviews: number;
  skipped_reviews: number;
  changed_sentiments: number;
  analysis_config: {
    model_confidence_threshold: number;
    sentiment_rules_version: string | null;
    category_rules_version: string;
    issue_rules_version: string;
    risk_rules_version: string;
    insight_rules_version: string;
  };
  classification: {
    category: string;
    label: string;
    issue_group: string;
    previous_category: string | null;
    changed: boolean;
    source: string;
    reason: string;
    matched_keywords: string[];
    rule_version: string;
  };
  decision_methods: Record<string, number>;
}

export async function reanalyzeProduct(productId: string | number): Promise<ReanalyzeProductResponse> {
  const response = await apiFetch(`${API_BASE_URL}/products/${productId}/reanalyze`, {method: "POST"});
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function getProductHistories(
  productId: string | number
): Promise<{ histories: AnalysisHistoryItem[] }> {
  const response = await apiFetch(
    `${API_BASE_URL}/products/${productId}/histories`
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response
      )
    );
  }

  return response.json();
}


/*
 * ============================================================
 * GET PRODUCT REVIEWS
 * ============================================================
 *
 * GET /products/{productId}/reviews
 *
 * API này dùng cho trang Reviews.
 *
 * Dữ liệu được đọc trực tiếp từ PostgreSQL.
 */

export async function getProductReviews(
  productId: string | number,
  page: number = 1,
  pageSize: number = 10,
  rating?: number | null
): Promise<ProductReviewsResponse> {
  const params = new URLSearchParams({
    page: String(Math.max(1, page)),
    page_size: String(Math.min(100, Math.max(1, pageSize))),
  });

  if (rating !== undefined && rating !== null) {
    params.set("rating", String(rating));
  }

  const response = await apiFetch(
    `${API_BASE_URL}/products/${productId}/reviews?${params.toString()}`
  );


  if (!response.ok) {

    throw new Error(
      await parseError(
        response
      )
    );

  }


  return response.json();

}


/*
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 *
 * Dùng để kiểm tra backend có đang chạy hay không.
 *
 * Nếu main.py chưa có /health thì không cần sử dụng hàm này.
 */

export async function checkApiHealth(): Promise<boolean> {

  try {

    const response =
      await apiFetch(
        `${API_BASE_URL}/docs`,
        {
          method: "GET",
        }
      );


    return response.ok;

  } catch {

    return false;

  }

}

export type ProductHistoryItem = {
  id: number;
  platform: string;
  platform_product_id: string;
  name: string;
  url: string;
  seller_name?: string | null;
  rating?: number | null;
  total_reviews: number;
  stored_total_reviews?: number;
  product_type?: string;
  category?: string;
  category_label?: string;
  issue_group?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  last_crawled_at?: string | null;
};

export type ProductHistoryResponse = {
  products: ProductHistoryItem[];
};

export async function getProductHistory(): Promise<ProductHistoryResponse> {
  const response = await apiFetch(`${API_BASE_URL}/products`);

  if (!response.ok) {
    throw new Error(
      `Không thể tải lịch sử sản phẩm. HTTP ${response.status}`
    );
  }

  return response.json();
}
