import type { AspectSide, ComparisonAspect, ProductComparison } from './comparisons';

export type Polarity = 'positive' | 'negative';
type SharedAspectSide = AspectSide & { positive_percentage: number; negative_percentage: number };
type SharedComparisonAspect = ComparisonAspect & { a: SharedAspectSide; b: SharedAspectSide };

export function sharedComparisonAspects(aspects: ComparisonAspect[]): SharedComparisonAspect[] {
  return aspects.filter((aspect): aspect is SharedComparisonAspect =>
    [aspect.a, aspect.b].every(side => side.mentioned_reviews > 0 &&
      side.positive_percentage != null && Number.isFinite(side.positive_percentage) &&
      side.negative_percentage != null && Number.isFinite(side.negative_percentage)));
}

export function comparisonAxisMaximum(aspects: SharedComparisonAspect[], polarity: Polarity): number {
  const maximum = aspects.reduce((value, aspect) =>
    Math.max(value, aspect.a[`${polarity}_percentage`], aspect.b[`${polarity}_percentage`]), 0);
  return Math.min(100, Math.max(10, Math.ceil(maximum / 10) * 10));
}

export function comparisonOverview(data: ProductComparison, shared: SharedComparisonAspect[]): string {
  if (!shared.length) return 'Chưa có khía cạnh có bằng chứng ở cả hai sản phẩm để tổng kết so sánh.';
  const names = `${data.products.a.name} và ${data.products.b.name}`;
  const sufficient = shared.filter(aspect => aspect.sufficient);
  const context = `${names} có ${shared.length} khía cạnh chung được ghi nhận trong các review đã lưu.`;
  if (!sufficient.length) return `${context} Chưa đủ bằng chứng để nhận xét khác biệt. Tỷ lệ được tính trên tổng review của từng sản phẩm.`;
  return `${context} Có ${sufficient.length} khía cạnh đạt ngưỡng bằng chứng. Tỷ lệ lời khen và phàn nàn được tính riêng trên tổng review của từng sản phẩm; một review có thể xuất hiện ở cả hai chiều. Tỷ lệ phàn nàn không phải tỷ lệ lỗi sản phẩm.`;
}
