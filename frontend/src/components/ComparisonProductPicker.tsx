import { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { ProductHistoryItem } from '../services/api';

const searchable = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

export default function ComparisonProductPicker({products, selectedId, loading, error, retry, select, close}: {
  products: ProductHistoryItem[]; selectedId: string; loading: boolean; error: string;
  retry: () => void; select: (id: string) => void; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const filtered = products.filter(product => searchable(`${product.name} ${product.category_label || ''}`).includes(searchable(search)));
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    searchInput.current?.focus();
  }, []);
  function dismiss() { dialog.current?.close(); close(); }

  return <dialog id="comparison-product-picker" ref={dialog} aria-labelledby="comparison-picker-title"
    onCancel={event => { event.preventDefault(); dismiss(); }} onClose={close}
    onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } }}
    onClick={event => { if (event.target === event.currentTarget) dismiss(); }}
    className="comparison-picker m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-900/50">
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 id="comparison-picker-title" className="font-medium text-slate-900">Chọn sản phẩm đã phân tích</h2>
          <p className="mt-1 text-xs text-slate-500">Tìm theo tên hoặc ngành hàng, hỗ trợ gõ không dấu.</p></div>
        <button type="button" onClick={dismiss} aria-label="Đóng chọn sản phẩm" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} strokeWidth={1.5}/></button>
      </header>
      <div className="px-5 pt-4">
        <label htmlFor="comparison-product-search" className="sr-only">Tìm sản phẩm đã phân tích</label>
        <div className="relative"><Search size={16} strokeWidth={1.5} aria-hidden="true" className="absolute left-3 top-3.5 text-slate-400"/>
          <input ref={searchInput} id="comparison-product-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nhập tên sản phẩm hoặc ngành hàng"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#202329] focus:ring-2 focus:ring-[#202329]/10"/></div>
        <p aria-live="polite" className="mt-2 text-xs text-slate-500">{loading ? 'Đang tải sản phẩm...' : `${filtered.length} sản phẩm`}</p>
      </div>
      <div className="min-h-0 overflow-y-auto p-5">
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<button type="button" onClick={retry} className="ml-2 underline">Tải lại danh sách</button></p>
          : loading ? <p role="status" className="p-4 text-center text-sm text-slate-500">Đang tải danh sách...</p>
          : filtered.length ? <ul className="space-y-2">{filtered.map(product => <li key={product.id}>
            <button type="button" aria-pressed={String(product.id) === selectedId} onClick={() => { select(String(product.id)); dismiss(); }}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${String(product.id) === selectedId ? 'border-[#202329] bg-[#ededeb]' : 'border-slate-100 hover:border-[#77797e] hover:bg-slate-50'}`}>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-800">{product.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{product.category_label || 'Chưa rõ ngành hàng'} · {product.total_reviews.toLocaleString('vi-VN')} đánh giá</span></span>
              {String(product.id) === selectedId && <Check size={18} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-[#202329]"/>}
            </button>
          </li>)}</ul> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{products.length ? 'Không có sản phẩm khớp từ khóa.' : 'Chưa có sản phẩm khác đã phân tích. Bạn có thể dùng cách nhập URL.'}</p>}
      </div>
    </div>
  </dialog>;
}
