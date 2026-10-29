import type { ComparisonFinding, ProductComparison } from '../services/comparisons';

export default function ComparisonOverview({ data, openEvidence }: {
  data: ProductComparison; openEvidence: (finding: ComparisonFinding) => void;
}) {
  const groups = [
    { title: 'Điểm thuận lợi của sản phẩm đang xem', items: data.findings.strengths },
    { title: 'Điểm cần cải thiện so với sản phẩm đối chiếu', items: data.findings.weaknesses },
  ].filter(group => group.items.length > 0);

  return <section className="comparison-overview" aria-labelledby="comparison-overview-title">
    <p className="comparison-overview__eyebrow">Góc nhìn tổng quan</p>
    <h2 id="comparison-overview-title">Nhận xét tổng quan giữa hai sản phẩm</h2>
    <div className="comparison-overview__products">{(['a', 'b'] as const).map(side => <div key={side}>
      <p>{side === 'a' ? 'Sản phẩm đang xem' : 'Sản phẩm đối chiếu'}</p><h3>{data.products[side].name}</h3><span>{data.products[side].total_reviews.toLocaleString('vi-VN')} đánh giá · {data.products[side].category_label || 'Chưa rõ ngành hàng'}</span>
    </div>)}</div>
    {groups.length > 0 ? <div className="comparison-overview__findings">{groups.map(group => <div key={group.title}>
      <h3>{group.title}</h3><ul>{group.items.map((item, index) => <li key={`${item.side}-${item.evidence_key}-${index}`}>
        <h4>{item.title}</h4><p>{item.text}</p>{item.action && <p className="comparison-overview__action">{item.action}</p>}
        <button type="button" className="product-link" disabled={!item.count} onClick={() => openEvidence(item)}>Xem bằng chứng ({item.count.toLocaleString('vi-VN')})</button>
      </li>)}</ul>
    </div>)}</div> : <p className="comparison-overview__empty">Chưa ghi nhận khác biệt đủ bằng chứng để đưa ra nhận xét cụ thể. Bạn có thể xem số liệu từng khía cạnh ở bên dưới.</p>}
  </section>;
}
