import { ArrowLeft, ArrowUpRight, BarChart3, FileText, LayoutDashboard, ShieldAlert, Users } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import "./ProductAnalysisLayout.css";

const tabs = [
  { path: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { path: "reviews", label: "Đánh giá khách hàng", icon: FileText },
  { path: "issues", label: "Nguyên nhân tiêu cực", icon: BarChart3 },
  { path: "risk", label: "Cảnh báo rủi ro", icon: ShieldAlert },
  { path: "competitor", label: "Phân tích cạnh tranh", icon: Users },
];

export default function ProductAnalysisLayout() {
  const { productId } = useParams();
  const location = useLocation();

  if (!productId) return <div className="product-workspace__empty"><h1>Chưa chọn sản phẩm</h1><Link to="/history">Quay lại lịch sử phân tích</Link></div>;

  return <div className="product-workspace">
    <div className="product-workspace__bar">
      <div className="product-workspace__breadcrumb"><Link to="/history"><ArrowLeft aria-hidden="true" size={16} strokeWidth={1.5} />Lịch sử phân tích</Link><span aria-hidden="true">/</span><span>Sản phẩm #{productId}</span></div>
      <Link to="/analyze" className="product-workspace__new">Phân tích sản phẩm mới <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} /></Link>
    </div>
    <nav aria-label="Kết quả phân tích sản phẩm" className="product-workspace__tabs">
      {tabs.map(({ path, label, icon: Icon }) => <NavLink key={path} to={{ pathname: `/products/${productId}/${path}`, search: location.search }} className={({ isActive }) => `product-workspace__tab${isActive ? " product-workspace__tab--active" : ""}`}><Icon aria-hidden="true" size={16} strokeWidth={1.5} />{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
