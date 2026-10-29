import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import "./Account.css";

export default function Account() {
  const { user } = useAuth();
  const initials = user?.full_name.trim().split(/\s+/).filter(Boolean).slice(-2)
    .map(part => Array.from(part)[0]).join("").toLocaleUpperCase("vi-VN") || "AI";

  return <div className="account-page">
    <header className="account-heading">
      <p className="account-eyebrow"><span aria-hidden="true" /> Không gian cá nhân</p>
      <h1>Tài khoản của bạn.</h1>
      <p>Thông tin cá nhân và dữ liệu đã lưu của bạn.</p>
    </header>

    <div className="account-grid">
      <aside className="account-profile" aria-labelledby="account-profile-name">
        <span aria-hidden="true" className="account-profile__avatar">{initials}</span>
        <p className="account-profile__label">Hồ sơ của bạn</p>
        <h2 id="account-profile-name">{user?.full_name || "Tài khoản"}</h2>
        <p className="account-profile__email">{user?.email || "Chưa có thông tin email"}</p>
        <p className="account-profile__note">Sản phẩm, đánh giá và lịch sử phân tích được lưu riêng cho tài khoản của bạn.</p>
        <Link to="/history" className="account-profile__link">Xem lịch sử phân tích <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.5} /></Link>
      </aside>

      <div className="account-details">
        <section className="account-panel" aria-labelledby="account-details-title">
          <p className="account-eyebrow">Thông tin cá nhân</p>
          <h2 id="account-details-title">Thông tin tài khoản</h2>
          <dl className="account-info">
            <div><dt>Họ và tên</dt><dd>{user?.full_name || "Chưa có thông tin"}</dd></div>
            <div><dt>Địa chỉ email</dt><dd>{user?.email || "Chưa có thông tin"}</dd></div>
          </dl>
        </section>

        <section className="account-panel account-password" aria-labelledby="account-password-title">
          <div><p className="account-eyebrow">Mật khẩu</p><h2 id="account-password-title">Đặt lại mật khẩu</h2><p className="account-panel__description">Nhận hướng dẫn đặt lại mật khẩu qua email đã đăng ký.</p></div>
          <Link to="/forgot-password" className="account-button">Đặt lại qua email <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} /></Link>
        </section>
      </div>
    </div>
  </div>;
}
