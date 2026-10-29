import type {
  ReactNode,
} from "react";

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { NavLink } from "react-router-dom";

interface DashboardLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

function DashboardLayout({
  children,
  fullWidth = false,
}: DashboardLayoutProps) {
  return (
    <div className="dashboard-shell min-h-screen bg-[#f5f5f3]">
      <Sidebar />

      <Header />

      <main
        className={fullWidth ? "ml-[var(--sidebar-space)] min-h-screen pb-20 lg:pb-0" : `
          ml-[var(--sidebar-space)]
          min-h-screen
          px-[var(--page-gutter)]
          pb-24 lg:pb-8
          pt-28 sm:pt-32
        `}
      >
        {children}
      </main>
      <nav aria-label="Điều hướng chính trên điện thoại" className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white p-2 lg:hidden">
        {[["/", "Trang chủ"], ["/analyze", "Phân tích"], ["/history", "Lịch sử"]].map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => `rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? "bg-slate-900 text-white" : "text-slate-600"}`}>{label}</NavLink>)}
      </nav>
    </div>
  );
}

export default DashboardLayout;
