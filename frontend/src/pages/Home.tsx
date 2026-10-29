import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./Home.css";

// Replace these sample contact details when the project is ready.
const contact = {
  email: "contact@example.com",
  phone: "0900 000 000",
  phoneHref: "tel:0900000000",
  location: "TP. Hồ Chí Minh, Việt Nam",
};

const capabilities = [
  { number: "01", title: "Lắng nghe từng đánh giá", text: "Đưa bình luận về một nơi để đọc, tìm kiếm và xem phản hồi trong ngữ cảnh của sản phẩm." },
  { number: "02", title: "Hiểu cảm xúc khách hàng", text: "Nhận diện phản hồi Positive, Neutral và Negative để nhìn rõ bức tranh trải nghiệm." },
  { number: "03", title: "Tìm điều cần cải thiện", text: "Nhóm phản hồi theo khía cạnh để biết khách hàng đang nhắc đến chất lượng, giao hàng hay dịch vụ." },
  { number: "04", title: "Chú ý tín hiệu rủi ro", text: "Tập hợp phản ánh cần xem xét, giúp bạn quay lại bình luận gốc và kiểm tra trước khi quyết định." },
  { number: "05", title: "Đối chiếu hai sản phẩm", text: "So sánh lời khen và phàn nàn theo khía cạnh chung, với tỷ lệ và bằng chứng của từng bên." },
  { number: "06", title: "Tiếp tục từ lịch sử", text: "Mở lại sản phẩm và kết quả đã lưu trong tài khoản, tiếp tục phân tích khi bạn cần." },
];

const steps = [
  { title: "Đưa dữ liệu vào", text: "Dán URL sản phẩm Lazada hoặc tải lên file CSV / Excel có sẵn. Chọn nguồn dữ liệu phù hợp với công việc của bạn.", detail: "URL sản phẩm · CSV · Excel" },
  { title: "Để hệ thống phân tích", text: "Bình luận được xử lý để nhận diện cảm xúc, tổng hợp các khía cạnh và ghi nhận những phản ánh cần chú ý.", detail: "Cảm xúc · Khía cạnh · Rủi ro" },
  { title: "Đọc kết quả, chọn hành động", text: "Xem tổng quan, mở từng đánh giá làm bằng chứng và xác định điều cần kiểm tra hoặc cải thiện tiếp theo.", detail: "Tổng quan · Bằng chứng · So sánh" },
];

const questions = [
  { title: "Tôi có thể bắt đầu với dữ liệu nào?", answer: "Bạn có thể nhập URL sản phẩm Lazada hoặc tải file CSV, XLSX, XLS. File cần có cột nội dung bình luận; số sao, tên người đánh giá và ngày đánh giá là thông tin tùy chọn." },
  { title: "Kết quả cảm xúc có ý nghĩa gì?", answer: "Nhãn Positive, Neutral và Negative mô tả cảm xúc được nhận diện từ nội dung bình luận. Đây là thông tin hỗ trợ đọc phản hồi; bạn có thể kiểm tra lại nội dung gốc khi cần." },
  { title: "Cảnh báo rủi ro có phải là kết luận về sản phẩm?", answer: "Cảnh báo ghi nhận tín hiệu trong phản ánh của người mua để bạn kiểm tra thêm. Tỷ lệ phàn nàn không phải tỷ lệ lỗi sản phẩm, và một phản ánh chưa đủ để kết luận về người bán hay chất lượng thực tế." },
  { title: "Làm sao để so sánh hai sản phẩm?", answer: "Mở một sản phẩm đã phân tích, vào Phân tích cạnh tranh rồi chọn sản phẩm còn lại. Hệ thống đối chiếu tỷ lệ phản hồi và bằng chứng theo các khía cạnh có thể so sánh." },
  { title: "Tôi có thể xem lại kết quả ở đâu?", answer: "Mở Lịch sử phân tích để truy cập các sản phẩm đã lưu trong tài khoản. Kết quả so sánh đã lưu có thể mở lại trong phần Lịch sử so sánh của sản phẩm." },
];

const sentimentExample = [
  { label: "Positive", count: 72, percentage: 60, tone: "dark" },
  { label: "Neutral", count: 30, percentage: 25, tone: "medium" },
  { label: "Negative", count: 18, percentage: 15, tone: "light" },
];

export default function Home() {
  return (
    <div className="home-page" id="home-top">
      <section className="home-hero home-section" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <p className="home-eyebrow"><span aria-hidden="true" className="home-dot" /> Lắng nghe để hiểu hơn</p>
          <h1 id="home-title">Từ lời đánh giá,<br />đến hướng<br className="home-hero__break" /> cải thiện.</h1>
          <p className="home-lead">Hiểu khách hàng đang nghĩ gì về sản phẩm. Biến những bình luận rời rạc thành góc nhìn rõ ràng về cảm xúc, trải nghiệm và điều cần thay đổi.</p>
          <div className="home-actions">
            <Link to="/analyze" className="home-button home-button--dark">Bắt đầu phân tích <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} /></Link>
            <Link to="/history" className="home-text-link">Xem lịch sử <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} /></Link>
          </div>
        </div>

        <div className="home-preview">
          <div className="home-preview__paper">
            <div className="home-preview__heading"><div><p>Tổng quan cảm xúc</p><h2>Mỗi đánh giá đều có ý nghĩa.</h2></div><span aria-hidden="true">↗</span></div>
            <div className="home-preview__total"><strong>120</strong><span>đánh giá trong dữ liệu ví dụ</span></div>
            <div className="home-preview__bars">
              {sentimentExample.map(item => (
                <div key={item.label} className="home-preview__bar-row">
                  <div><span>{item.label}</span><span>{item.count} review · {item.percentage}%</span></div>
                  <div aria-hidden="true" className="home-preview__track"><span className={`home-preview__bar home-preview__bar--${item.tone}`} style={{ width: `${item.percentage}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="home-preview__caption"><span aria-hidden="true" className="home-dot" /><p>Đọc xu hướng. Hiểu bối cảnh. Kiểm tra bằng chứng.</p></div>
          </div>
        </div>
        <a href="#home-capabilities" className="home-scroll-link">Khám phá cách hệ thống hỗ trợ bạn <ArrowDown aria-hidden="true" size={16} strokeWidth={1.5} /></a>
      </section>

      <section id="home-capabilities" className="home-section home-capabilities" aria-labelledby="home-capabilities-title">
        <div className="home-section-heading"><div><p className="home-eyebrow">Những gì bạn có thể làm</p><h2 id="home-capabilities-title">Nhìn toàn cảnh.<br />Hiểu từng chi tiết.</h2></div><p>Một không gian để theo dõi phản hồi, tìm nguyên nhân và đưa ra quyết định dựa trên những gì khách hàng thực sự chia sẻ.</p></div>
        <div className="home-feature-grid">
          {capabilities.map(item => <article key={item.number} className="home-feature"><span className="home-feature__number">{item.number}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}
        </div>
      </section>

      <section className="home-section home-workflow" aria-labelledby="home-workflow-title">
        <div className="home-section-heading"><div><p className="home-eyebrow">Cách bắt đầu</p><h2 id="home-workflow-title">Một luồng làm việc.<br />Ba bước rõ ràng.</h2></div><Link to="/analyze" className="home-text-link">Thử với sản phẩm của bạn <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} /></Link></div>
        <ol className="home-step-grid">{steps.map((step, index) => <li key={step.title}><span className="home-step__number">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p><span className="home-step__detail">{step.detail}</span></li>)}</ol>
      </section>

      <section className="home-section home-evidence" aria-labelledby="home-evidence-title">
        <div className="home-evidence__example">
          <div className="home-example-label"><span aria-hidden="true" className="home-dot" /> Một bình luận, nhiều góc nhìn</div>
          <blockquote>“Giao hàng nhanh, đóng gói cẩn thận. Tuy nhiên máy hơi nóng khi dùng lâu.”</blockquote>
          <div className="home-evidence__observations"><div><span>Điều được ghi nhận tốt</span><p>Giao hàng & đóng gói</p></div><div><span>Điều cần xem xét thêm</span><p>Nhiệt độ khi sử dụng</p></div></div>
          <p className="home-example-note">Nội dung minh họa cách đọc phản hồi theo từng khía cạnh.</p>
        </div>
        <div className="home-evidence__copy"><p className="home-eyebrow">Từ số liệu đến ngữ cảnh</p><h2 id="home-evidence-title">Đằng sau mỗi con số<br />là một trải nghiệm.</h2><p>Một bình luận có thể vừa khen vừa góp ý. Đọc theo khía cạnh giúp bạn nhận ra điều đang làm tốt và điều cần cải thiện trong cùng một phản hồi.</p><ul><li>Đối chiếu nhận xét với nội dung bình luận.</li><li>Phân biệt cảm xúc chung và vấn đề cụ thể.</li><li>Kiểm tra phản ánh trước khi đưa ra kết luận.</li></ul><Link to="/analyze" className="home-text-link">Khám phá dữ liệu của bạn <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} /></Link></div>
      </section>

      <section className="home-section home-faq" aria-labelledby="home-faq-title">
        <div><p className="home-eyebrow">04 / Giải đáp nhanh</p><h2 id="home-faq-title">Trước khi<br />bạn bắt đầu.</h2><p className="home-faq__intro">Những điều hữu ích để sử dụng dữ liệu và đọc kết quả rõ ràng hơn.</p><a href="#home-contact" className="home-text-link">Thông tin liên hệ <ArrowDown aria-hidden="true" size={17} strokeWidth={1.5} /></a></div>
        <div className="home-faq__list">{questions.map(question => <details key={question.title}><summary>{question.title}<span aria-hidden="true" className="home-faq__plus">+</span></summary><p>{question.answer}</p></details>)}</div>
      </section>

      <section className="home-section home-start" aria-labelledby="home-start-title"><p className="home-eyebrow">Bước tiếp theo của bạn</p><h2 id="home-start-title">Bắt đầu từ một sản phẩm.<br />Hiểu thêm về khách hàng.</h2><p>Đưa dữ liệu vào và khám phá những điều đáng chú ý trong phản hồi.</p><Link to="/analyze" className="home-button home-button--dark">Phân tích sản phẩm ngay <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} /></Link></section>

      <footer id="home-contact" className="home-section home-contact" aria-labelledby="home-contact-title">
        <div className="home-contact__main"><div><p className="home-eyebrow">Contact / Liên hệ</p><h2 id="home-contact-title">Cùng tạo nên<br />trải nghiệm tốt hơn.</h2><p>Bạn có câu hỏi, ý tưởng hoặc góp ý?<br />Hãy chia sẻ cùng nhóm phát triển Sentiment AI.</p></div><address className="home-contact__details"><p className="home-contact__sample">Thông tin liên hệ</p><a href={`mailto:${contact.email}`}><span>Email</span><span>{contact.email} <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.5} /></span></a><a href={contact.phoneHref}><span>Điện thoại</span><span>{contact.phone} <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.5} /></span></a><div><span>Địa điểm</span><span>{contact.location}</span></div></address></div>
        <div className="home-contact__bottom"><span className="home-contact__wordmark">Sentiment AI<span>Customer Feedback Analysis</span></span><nav aria-label="Liên kết cuối trang"><Link to="/analyze">Phân tích</Link><Link to="/history">Lịch sử</Link><a href="#home-top">Về đầu trang ↑</a></nav></div>
      </footer>
    </div>
  );
}
