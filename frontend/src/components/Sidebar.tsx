import { History, Home, PlayCircle } from "lucide-react";
import { matchPath, NavLink, useLocation } from "react-router-dom";
import "./Sidebar.css";

const items = [
  { to: "/", label: "Trang chủ", icon: Home, end: true },
  { to: "/analyze", label: "Bắt đầu phân tích", icon: PlayCircle, end: false },
  { to: "/history", label: "Lịch sử phân tích", icon: History, end: false },
];

function Sidebar() {
  const { pathname } = useLocation();
  // Derive selection from the URL so clicks and Back/Forward stay in sync.
  const activeIndex = items.findIndex(({ to, end }) => matchPath({ path: to, end }, pathname));

  return (
    <aside aria-label="Sentiment AI" className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
      <nav aria-label="Điều hướng chính" className="glass-sidebar">
        <span
          aria-hidden="true"
          className="glass-sidebar__selection"
          style={{
            transform: `translateY(${Math.max(0, activeIndex) * 52}px)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) => `glass-sidebar__link${isActive ? " glass-sidebar__link--active" : ""}`}
          >
            <Icon aria-hidden="true" size={21} strokeWidth={1.5} />
            <span aria-hidden="true" className="glass-sidebar__tooltip">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
