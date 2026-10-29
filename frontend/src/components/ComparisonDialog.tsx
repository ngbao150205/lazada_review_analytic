import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getComparison, type ProductComparison } from '../services/comparisons';
import ComparisonResults, { comparisonDate } from './ComparisonResults';
import { ProductPageState } from './ProductPageUI';

export default function ComparisonDialog({ productId, comparisonId, close }: {
  productId: string; comparisonId: string; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ProductComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    if (element && !element.open) element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (element?.open) element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true); setError(''); setData(null);
    getComparison(productId, comparisonId)
      .then(result => { if (!ignore) setData(result); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : 'Không thể tải kết quả so sánh.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [productId, comparisonId, retry]);

  return <dialog id="comparison-history-modal" ref={dialog} className="comparison-modal" aria-labelledby="comparison-dialog-title" aria-describedby="comparison-dialog-description"
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); close();
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    <header className="comparison-modal__header">
      <div><p className="comparison-modal__eyebrow">Lịch sử so sánh · #{comparisonId}</p><h2 id="comparison-dialog-title">Kết quả so sánh sản phẩm</h2><p id="comparison-dialog-description">{data ? comparisonDate(data.created_at) : 'Thông tin và nhận xét được lưu tại thời điểm so sánh.'}</p></div>
      <button type="button" onClick={close} className="comparison-modal__close" aria-label="Đóng kết quả so sánh"><X aria-hidden="true" size={22} strokeWidth={1.5} /></button>
    </header>
    <div className="comparison-modal__body" aria-busy={loading}>
      {loading ? <ProductPageState title="Đang tải kết quả so sánh…" loading />
        : error ? <ProductPageState title="Chưa thể tải kết quả so sánh" error><p>{error}</p><button type="button" className="product-button product-button--dark" onClick={() => setRetry(value => value + 1)}>Thử lại</button></ProductPageState>
        : data && <ComparisonResults key={data.id} data={data} productId={productId} />}
    </div>
  </dialog>;
}
