export interface AnalysisSummary {
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
}

export interface ProductReview {
  id?: number;
  review_id: string;
  content: string;
  rating: number;
  review_date?: string;

  sentiment?: {
    sentiment: string;
    confidence: number;
    model_version?: string;
    method?: string;
  };

  issues?: {
    issue_type: string;
    matched_keyword: string;
  }[];

  risk?: {
    risk_flag: boolean;
    risk_keyword: string | null;
  };
}

export interface ProductAnalysisResponse {
  product_id: string;
  product_db_id: number;
  product_name: string;

  is_new_product: boolean;

  crawled_reviews: number;
  new_reviews: number;
  skipped_reviews: number;

  category: string;

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
  };

  analysis_history_id: number;

  crawl_status?: 'FULL' | 'PARTIAL';
  crawl_error?: string | null;
  retry_after_seconds?: number;

  reviews: unknown[];
}
