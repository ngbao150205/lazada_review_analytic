import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Activity, LoaderCircle, LogOut, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import "./Header.css";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError("Đăng xuất chưa thành công. Thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="glass-header">
      <div className="glass-header__brand">
        <span aria-hidden="true" className="glass-header__mark">
          <Activity size={21} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h2 className="glass-header__title">Sentiment AI</h2>
          <p className="glass-header__subtitle">Phân tích phản hồi khách hàng</p>
        </div>
      </div>

      <div className="glass-header__actions">
        <NavLink
          to="/account"
          aria-label={user?.full_name ? `Tài khoản: ${user.full_name}` : "Tài khoản"}
          title={user?.full_name || "Tài khoản"}
          className={({ isActive }) => `glass-header__account${isActive ? " glass-header__account--active" : ""}`}
        >
          <UserRound aria-hidden="true" size={20} strokeWidth={1.5} />
          <span className="glass-header__name">{user?.full_name || "Tài khoản"}</span>
        </NavLink>
        <span aria-hidden="true" className="glass-header__divider" />
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          aria-label={busy ? "Đang đăng xuất" : "Đăng xuất"}
          title="Đăng xuất"
          onClick={() => void leave()}
          className="glass-header__logout"
        >
          {busy
            ? <LoaderCircle aria-hidden="true" size={20} strokeWidth={1.5} className="glass-header__spinner" />
            : <LogOut aria-hidden="true" size={20} strokeWidth={1.5} />}
          <span className="glass-header__logout-label">{busy ? "Đang thoát…" : "Đăng xuất"}</span>
        </button>
      </div>
      {error && <p role="alert" className="glass-header__error">{error}</p>}
    </header>
  );
}
