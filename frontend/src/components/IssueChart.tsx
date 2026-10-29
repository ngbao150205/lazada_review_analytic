import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { chartColors } from "./chartColors";

interface IssueChartProps { data: Record<string, number>; }
const issueLabelMap: Record<string, string> = {
  PRODUCT_QUALITY: "Chất lượng sản phẩm",
  SHIPPING_LOGISTICS: "Giao hàng và vận chuyển",
  CUSTOMER_SERVICE_RETURNS: "Dịch vụ khách hàng và đổi trả",
  PRICING_PROMOTIONS: "Giá cả và khuyến mãi",
  SHIPPING: "Giao hàng và vận chuyển",
  CUSTOMER_SERVICE: "Dịch vụ khách hàng",
  PRICE: "Giá cả", PACKAGING: "Đóng gói", OTHER: "Vấn đề khác",
};
const issueColors: Record<string, string> = {
  PRODUCT_QUALITY: chartColors.negative,
  SHIPPING_LOGISTICS: chartColors.neutral,
  CUSTOMER_SERVICE_RETURNS: chartColors.purple,
  PRICING_PROMOTIONS: chartColors.orange,
  SHIPPING: chartColors.neutral,
  CUSTOMER_SERVICE: chartColors.purple,
  PRICE: chartColors.orange,
  PACKAGING: chartColors.teal,
};

export default function IssueChart({ data }: IssueChartProps) {
  const chartData = Object.entries(data || {}).map(([key, value]) => ({
    key, name: issueLabelMap[key] || key, value, color: issueColors[key] || chartColors.muted,
    shortName: (issueLabelMap[key] || key).length > 22 ? `${(issueLabelMap[key] || key).slice(0, 22)}…` : issueLabelMap[key] || key,
  }));
  return <section aria-labelledby="issue-chart-title" className="dashboard-panel">
    <h2 id="issue-chart-title" className="dashboard-panel__title">Các vấn đề được phát hiện</h2>
    <p className="dashboard-panel__description">Nhóm phản ánh được ghi nhận trong dữ liệu phân tích.</p>
    {chartData.length === 0 ? <p className="dashboard-chart-empty">Chưa có dữ liệu vấn đề.</p> : <>
      <div className="dashboard-issue-chart" style={{ height: Math.max(240, chartData.length * 52) }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 44, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#dededb" />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64666a" }} />
          <YAxis type="category" dataKey="shortName" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64666a" }} />
          <Tooltip cursor={{ fill: "#f5f5f3" }} formatter={value => [Number(value).toLocaleString("vi-VN"), "Số lượng"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""} contentStyle={{ borderRadius: 12, border: "1px solid #dededb", fontSize: 12 }} />
          <Bar dataKey="value" isAnimationActive={false} radius={[0, 5, 5, 0]} maxBarSize={28}>
            {chartData.map(item => <Cell key={item.key} fill={item.color} />)}
            <LabelList dataKey="value" position="right" fontSize={11} fontWeight={600} fill="#202329" formatter={value => Number(value).toLocaleString("vi-VN")} />
          </Bar>
        </BarChart></ResponsiveContainer>
      </div>
      <ul className="dashboard-issue-values">{chartData.map(item => <li key={item.key}><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span><strong style={{ color: item.color }}>{item.value.toLocaleString("vi-VN")}</strong></li>)}</ul>
    </>}
  </section>;
}
