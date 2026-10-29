import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, Loader2, Link2, FileUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL, apiFetch } from "../services/http";
import "./Analyze.css";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
type Mode = "url" | "import";
type AnalyzeResponse = {
  product_db_id?: number; product_name?: string;
  crawl_status?: "FULL" | "PARTIAL"; crawl_error?: string | null;
  crawled_reviews?: number; cached_reviews?: number; newly_fetched_reviews?: number;
  retry_after_seconds?: number; unanalyzable_reviews?: number;
  collection?: {received: number; accepted: number; inserted: number;
    duplicates_in_batch: number; duplicates_in_database: number; blank: number; generated_ids: number};
};
const modes = [
  {id: "url" as const, label: "URL sản phẩm", icon: Link2},
  {id: "import" as const, label: "Tải file CSV / Excel", icon: FileUp},
];
function downloadExample() {
  const content = '\uFEFFcontent,rating,customer_name,created_at\n"Sản phẩm tốt, giao hàng nhanh",5,Người mua,2026-10-01\n"Chất lượng chưa tốt",2,Khách hàng,2026-10-02\n';
  const objectUrl = URL.createObjectURL(new Blob([content], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = objectUrl; link.download = "reviews-example.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
export default function Analyze() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState(""); const [productName, setProductName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [crawlBlocked, setCrawlBlocked] = useState(false);
  const [importResult, setImportResult] = useState<AnalyzeResponse | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setCrawlBlocked(false);
    setImportResult(null);
  }

  function openResult(data: AnalyzeResponse, isImport = false) {
    if (!data.product_db_id) throw new Error("Backend không trả về product_db_id.");
    localStorage.removeItem("activeProductId");
    if (isImport) localStorage.removeItem("lastAnalyzedProductUrl");
    else localStorage.setItem("lastAnalyzedProductUrl", url.trim());
    if (data.product_name) localStorage.setItem("lastAnalyzedProductName", data.product_name);
    navigate(`/products/${data.product_db_id}/dashboard`, {state: {crawlWarning: isImport
      ? "Kết quả được phân tích từ file đã tải lên và các review đã lưu của sản phẩm này."
      : data.crawl_status === "PARTIAL"
        ? `Đã phân tích và lưu kết quả từ ${data.crawled_reviews ?? 0} bình luận thu thập được trong lượt này. Chưa thu thập đủ đánh giá: ${data.crawl_error ?? "Nguồn chưa cung cấp đủ đánh giá."}${data.retry_after_seconds ? ` Thử lại sau ít nhất ${data.retry_after_seconds} giây.` : ""}` : null}});
  }
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(""); setImportResult(null); setCrawlBlocked(false);
    if (mode === "url" && !url.trim()) {setError("Vui lòng nhập URL sản phẩm."); return;}
    if (mode === "import") {
      if (!productName.trim()) {setError("Vui lòng nhập tên sản phẩm."); return;}
      if (!file || !/\.(csv|xlsx|xls)$/i.test(file.name)) {setError("Chọn file CSV hoặc Excel (.xlsx, .xls)."); return;}
      if (file.size > MAX_FILE_BYTES) {setError("File vượt quá 5 MiB. Hãy chia thành nhiều file để gộp dữ liệu."); return;}
    }
    setLoading(true);
    try {
      const endpoint = mode === "import"
        ? `/collections/import?${new URLSearchParams({product_name: productName.trim(), format: file!.name.split(".").pop()!.toLowerCase()})}`
        : "/products/analyze";
      const response = await apiFetch(API_BASE_URL + endpoint, {
        method: "POST", headers: {"Content-Type": mode === "import" ? "application/octet-stream" : "application/json"},
        body: mode === "import" ? file : JSON.stringify({url: url.trim()}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setCrawlBlocked(mode === "url" && response.status === 429);
        throw new Error(typeof data?.detail === "string" ? data.detail : `Phân tích thất bại. HTTP ${response.status}`);
      }
      if (!data?.product_db_id) throw new Error("Backend không trả về product_db_id.");
      if (mode === "import") setImportResult(data); else openResult(data);
    } catch (err) {setError(err instanceof Error ? err.message : "Không kết nối được hệ thống.");}
    finally {setLoading(false);}
  }
  return (
    <div className="analyze-page">
      <header className="analyze-heading">
        <div>
          <h1>Hiểu sản phẩm từ<br />phản hồi thực tế.</h1>
        </div>
      </header>

      <div className="analyze-workspace">
        <section className="analyze-card" aria-labelledby="analyze-form-title">
          <div className="analyze-card__heading">
            <div><p className="analyze-eyebrow">01 / Nguồn đánh giá</p><h2 id="analyze-form-title">Bắt đầu với dữ liệu của bạn.</h2></div>
          </div>
          <div role="tablist" aria-label="Nguồn đánh giá" className="analyze-tabs">
            {modes.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                ref={node => { tabRefs.current[index] = node; }}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={mode === id}
                aria-controls={`panel-${id}`}
                tabIndex={mode === id ? 0 : -1}
                disabled={loading}
                onClick={() => changeMode(id)}
                onKeyDown={event => {
                  const nextIndex = event.key === "ArrowRight" ? (index + 1) % modes.length
                    : event.key === "ArrowLeft" ? (index - 1 + modes.length) % modes.length
                    : event.key === "Home" ? 0 : event.key === "End" ? modes.length - 1 : null;
                  if (nextIndex == null) return;
                  event.preventDefault();
                  changeMode(modes[nextIndex].id);
                  tabRefs.current[nextIndex]?.focus();
                }}
                className={`analyze-tab${mode === id ? " analyze-tab--active" : ""}`}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={1.5} />{label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="analyze-form" aria-busy={loading}>
            <section id="panel-url" role="tabpanel" aria-labelledby="tab-url" hidden={mode !== "url"} tabIndex={0}>
              <div className="analyze-field">
                <label htmlFor="product-url">URL sản phẩm</label>
                <p id="product-url-help" className="analyze-help">Dán đường dẫn trang sản phẩm bạn muốn tìm hiểu.</p>
                <div className="analyze-url-field">
                  <Link2 aria-hidden="true" size={18} strokeWidth={1.5} />
                  <input id="product-url" type="url" required={mode === "url"} value={url} disabled={loading || mode !== "url"}
                    onChange={event => setUrl(event.target.value)} placeholder="https://www.lazada.vn/products/..."
                    aria-describedby="product-url-help" className="analyze-input" />
                </div>
                <p className="analyze-help">Bình luận thu thập được sẽ được phân tích và lưu vào tài khoản của bạn.</p>
              </div>
            </section>

            <section id="panel-import" role="tabpanel" aria-labelledby="tab-import" hidden={mode !== "import"} tabIndex={0}>
              <div className="analyze-field">
                <label htmlFor="product-name">Tên sản phẩm</label>
                <input id="product-name" required={mode === "import"} maxLength={500} value={productName} disabled={loading || mode !== "import"}
                  onChange={event => { setProductName(event.target.value); setImportResult(null); }}
                  className="analyze-input" placeholder="Ví dụ: Tai nghe Bluetooth ABC" aria-describedby="product-name-help" />
                <p id="product-name-help" className="analyze-help">File cùng tên sản phẩm sẽ được gộp và loại review trùng trong tài khoản của bạn.</p>
              </div>
              <div className="analyze-field analyze-field--file">
                <label htmlFor="review-file">File đánh giá</label>
                <div className={`analyze-file-picker${loading ? " analyze-file-picker--disabled" : ""}`}>
                  <span aria-hidden="true" className="analyze-file-picker__icon">{file ? <Check size={23} strokeWidth={1.5} /> : <FileUp size={23} strokeWidth={1.5} />}</span>
                  <span className="analyze-file-picker__title">{file ? file.name : "Chọn file đánh giá từ thiết bị"}</span>
                  <span className="analyze-file-picker__description">{file ? `${(file.size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KB · Bấm để chọn file khác` : "CSV, XLSX hoặc XLS · Tối đa 5 MiB"}</span>
                  <input id="review-file" type="file" required={mode === "import"}
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    disabled={loading || mode !== "import"} aria-describedby="review-file-help"
                    onChange={event => { setFile(event.target.files?.[0] ?? null); setImportResult(null); }} />
                </div>
                <p id="review-file-help" className="analyze-help">Cần cột <code>content</code> hoặc <strong>Nội dung / Bình luận</strong>. Số sao, tên khách hàng và ngày là tùy chọn. Excel đọc sheet đầu tiên, tối đa 10.000 dòng mỗi file.</p>
                <button type="button" onClick={downloadExample} className="analyze-text-link">Tải file CSV mẫu <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} /></button>
              </div>
            </section>

            {error && <div role="alert" className="analyze-notice analyze-notice--error">
              <strong>Chưa thể hoàn tất phân tích</strong>
              <p>{error}</p>
              {crawlBlocked && <><p>Nguồn chưa cung cấp thêm đánh giá. Kết quả đã phân tích trước đó vẫn được giữ trong lịch sử. Bạn có thể xem lại kết quả hoặc chuyển sang tải file đánh giá có sẵn.</p><Link to="/history" className="analyze-text-link">Xem kết quả đã lưu <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link></>}
            </div>}

            <div className="analyze-submit-area">
              <button type="submit" disabled={loading} className="analyze-submit">
                {loading ? <><Loader2 aria-hidden="true" size={19} strokeWidth={1.5} className="analyze-spinner" />Đang phân tích…</> : <>{mode === "import" ? "Tải file và phân tích" : "Phân tích sản phẩm"}<ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} /></>}
              </button>
              {loading
                ? <p role="status" className="analyze-help">{mode === "import" ? "Đang đọc file, loại trùng và phân tích đánh giá." : "Đang thu thập đánh giá và phân tích."} Tác vụ có thể mất nhiều phút. Vui lòng giữ trang này mở.</p>
                : <p className="analyze-submit-note">Kết quả được lưu để bạn có thể mở lại trong lịch sử.</p>}
            </div>

            {importResult?.collection && <div role="status" className="analyze-notice analyze-import-result">
              <div className="analyze-import-result__heading"><Check aria-hidden="true" size={19} strokeWidth={1.5} /><strong>Đã nhập dữ liệu thành công</strong></div>
              <dl className="analyze-import-result__stats">
                {[
                  ["Dòng nhận được", importResult.collection.received],
                  ["Review mới", importResult.collection.inserted],
                  ["Review trùng", importResult.collection.duplicates_in_batch + importResult.collection.duplicates_in_database],
                  ["Dòng không có bình luận", importResult.collection.blank],
                ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("vi-VN")}</dd></div>)}
              </dl>
              {!!importResult.unanalyzable_reviews && <p>{importResult.unanalyzable_reviews} review không đủ văn bản cho AI.</p>}
              <button type="button" onClick={() => openResult(importResult, true)} className="analyze-text-link">Xem kết quả phân tích <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.5} /></button>
            </div>}
          </form>
        </section>

        <aside className="analyze-guide" aria-labelledby="analyze-guide-title">
          <div className="analyze-guide__intro"><p className="analyze-eyebrow">Một vài gợi ý</p><h2 id="analyze-guide-title">{mode === "url" ? <>Một đường dẫn.<br />Nhiều góc nhìn.</> : <>Dữ liệu có sẵn.<br />Góc nhìn mới.</>}</h2><p>{mode === "url" ? "Bắt đầu từ sản phẩm bạn quan tâm và khám phá trải nghiệm được chia sẻ trong các đánh giá." : "Đưa những bình luận bạn đã thu thập vào cùng một nơi để phân tích và đọc lại dễ dàng hơn."}</p></div>
          <ol className="analyze-guide__steps">
            {(mode === "url" ? [
              { title: "Chọn đúng trang sản phẩm", text: "Sử dụng đường dẫn chi tiết sản phẩm Lazada, thay vì trang tìm kiếm hoặc cửa hàng." },
              { title: "Chờ thu thập và xử lý", text: "Thời gian phụ thuộc vào dữ liệu và khả năng truy cập nguồn đánh giá." },
              { title: "Xem kết quả trong ngữ cảnh", text: "Đọc tổng quan và đối chiếu với bình luận trước khi đưa ra quyết định." },
            ] : [
              { title: "Chuẩn bị cột bình luận", text: "Đặt tên cột là content, Nội dung hoặc Bình luận. Mỗi dòng là một đánh giá." },
              { title: "Kiểm tra file trước khi tải", text: "Dùng CSV, XLSX hoặc XLS. Giữ dung lượng trong 5 MiB và không quá 10.000 dòng." },
              { title: "Đặt tên sản phẩm rõ ràng", text: "Các file cùng tên sản phẩm được gộp dữ liệu trong tài khoản của bạn." },
            ]).map((item, index) => <li key={item.title}><span className="analyze-guide__number">0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}
          </ol>
        </aside>
      </div>

      <section className="analyze-outcomes" aria-labelledby="analyze-outcomes-title">
        <div className="analyze-outcomes__heading"><p className="analyze-eyebrow">02 / Sau khi phân tích</p><h2 id="analyze-outcomes-title">Từ dữ liệu đến điều cần làm.</h2></div>
        <div className="analyze-outcomes__grid">{[
          { title: "Nhìn rõ cảm xúc", text: "Theo dõi phản hồi Positive, Neutral và Negative để hiểu trải nghiệm chung." },
          { title: "Xác định khía cạnh", text: "Tìm hiểu điều khách hàng khen, góp ý hoặc nhắc đến nhiều trong bình luận." },
          { title: "Kiểm tra bằng chứng", text: "Quay lại từng đánh giá để xác minh các phản ánh và tín hiệu cần chú ý." },
        ].map((item, index) => <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
      </section>
    </div>
  );
}
