import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AnalysisHistoryItem, RatingSummary } from "../services/api";
import { Link } from "react-router-dom";

const number = (value: number) => value.toLocaleString("vi-VN");
const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 };
const starColors = ["#ef4444", "#f97316", "#eab308", "#14b8a6", "#22c55e"];

export function RatingChart({ summary, source }: {
  summary?: RatingSummary | null;
  source?: "snapshot" | "current" | "unavailable";
}) {
  const data = Array.from({ length: 5 }, (_, index) => ({
    name: `${index + 1} sao`, value: summary?.counts[String(index + 1)] ?? 0,
  }));
  return (
    <section aria-labelledby="rating-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rating-chart-title" className="text-lg font-semibold text-slate-900">Phân bố số sao</h2>
          <p className="mt-1 text-sm text-slate-500">Số lượng đánh giá từ 1 đến 5 sao đã thu thập.</p>
        </div>
        {summary && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
          {summary.average_rating == null ? "Chưa có sao" : `${summary.average_rating.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} / 5 ★`}
        </span>}
      </div>
      {!summary ? (
        <p className="my-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
          Lần phân tích cũ chưa lưu phân bố số sao. Chọn lần mới nhất để xem số sao hiện có.
        </p>
      ) : <>
        {source === "current" && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Số sao lấy từ đánh giá hiện có; lần phân tích này chưa lưu thống kê số sao.
        </p>}
        {summary.rated_reviews > 0 ? <div className="mt-5 h-60" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} formatter={(value) => [number(Number(value)), "Đánh giá"]} />
              <Bar dataKey="value" maxBarSize={52} radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {data.map((entry, index) => <Cell key={entry.name} fill={starColors[index]} />)}
                <LabelList dataKey="value" position="top" fontSize={12} fill="#475569" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="my-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Các đánh giá chưa có thông tin số sao.</p>}
        <ul className="mt-4 grid grid-cols-5 gap-2 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
          {data.map((entry) => <li key={entry.name}>
            <span>{entry.name}</span><strong className="mt-1 block text-base text-slate-800">{number(entry.value)}</strong>
            <span>{summary.rated_reviews ? (entry.value / summary.rated_reviews * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : 0}%</span>
          </li>)}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {number(summary.rated_reviews)} đánh giá có sao · {number(summary.unrated_reviews)} đánh giá không có sao hợp lệ.
          Trung bình và tỷ lệ chỉ tính trên đánh giá có sao.
        </p>
      </>}
    </section>
  );
}

export function RiskChart({ summary, totalReviews, productId, source }: {
  summary: Record<string, number>; totalReviews: number; productId: string;
  source?: "snapshot" | "current" | "unavailable";
}) {
  const flagged = summary.FLAGGED ?? 0;
  const data = [
    { key: "flagged", name: "Có cảnh báo", value: flagged, color: "#ef4444" },
    { key: "remaining", name: "Chưa phát hiện dấu hiệu", value: Math.max(0, totalReviews - flagged), color: "#cbd5e1" },
  ];
  return <section aria-labelledby="risk-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 id="risk-chart-title" className="text-lg font-semibold text-slate-900">Cảnh báo rủi ro</h2>
    <p className="mt-1 text-sm text-slate-500">Dấu hiệu lừa đảo, hàng giả, hàng nhái hoặc fake trong đánh giá.</p>
    {source === "unavailable" ? <p className="my-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
      Lần phân tích cũ chưa lưu thống kê theo quy tắc mới. Chọn lần mới nhất để xem cảnh báo hiện có.
    </p> : <>
      {source === "current" && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Cảnh báo được xét theo quy tắc mới trên toàn bộ đánh giá hiện có.</p>}
      {totalReviews > 0 ? <div className="relative mt-3 h-60" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={data.filter((entry) => entry.value > 0)} dataKey="value" nameKey="name" innerRadius={72} outerRadius={96} paddingAngle={3} isAnimationActive={false}>
            {data.filter((entry) => entry.value > 0).map((entry) => <Cell key={entry.key} fill={entry.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [number(Number(value)), "Đánh giá"]} />
        </PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl text-slate-900">{number(flagged)}</strong><span className="mt-1 text-xs text-slate-500">đánh giá cảnh báo</span></div>
      </div> : <p className="my-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Chưa có đánh giá để kiểm tra.</p>}
      <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
        {data.map((entry) => <li key={entry.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span><strong>{number(entry.value)}</strong></li>)}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">{totalReviews ? (flagged / totalReviews * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : 0}% trong {number(totalReviews)} đánh giá có cảnh báo. Mỗi đánh giá tính một lần. Đây là phản ánh của người mua; chưa phát hiện dấu hiệu không đồng nghĩa sản phẩm an toàn.</p>
    </>}
    <Link to={`/products/${productId}/risk`} className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">Xem các đánh giá có cảnh báo hiện có →</Link>
  </section>;
}

export function AnalysisTrendChart({ histories, selectedId }: { histories: AnalysisHistoryItem[]; selectedId?: number | null }) {
  const data = [...histories].reverse().map((history, index) => ({
    name: `Lần ${index + 1}`, positive: history.analyzed_reviews ? history.positive_rate : null,
    negative: history.analyzed_reviews ? history.negative_rate : null,
    neutral: history.analyzed_reviews ? history.neutral_rate : null, id: history.id, total: history.total_reviews,
    time: new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(history.analyzed_at) ? history.analyzed_at : `${history.analyzed_at}Z`).toLocaleString("vi-VN"),
  }));
  return <section aria-labelledby="trend-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 id="trend-chart-title" className="text-lg font-semibold text-slate-900">Xu hướng qua các lần phân tích</h2>
    <p className="mt-1 text-sm text-slate-500">So sánh tỷ lệ cảm xúc trên tập đánh giá đã phân tích ở mỗi lần chạy.</p>
    {data.filter((entry) => entry.positive !== null).length < 2 ? <p className="mt-5 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Cần ít nhất 2 lần có kết quả phân tích cảm xúc để so sánh xu hướng.</p> : <>
      <div className="mt-6 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} minTickGap={25} tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`, name]}
              labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload.time ?? ""} · ${payload?.[0]?.payload.total ?? 0} đánh giá`} />
            <Line type="linear" dataKey="positive" name="Tích cực" stroke="#22c55e" strokeWidth={2} dot={data.length < 25} isAnimationActive={false} />
            <Line type="linear" dataKey="negative" name="Tiêu cực" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" dot={data.length < 25} isAnimationActive={false} />
            <Line type="linear" dataKey="neutral" name="Trung lập" stroke="#94a3b8" strokeWidth={2} dot={data.length < 25} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-5 text-xs text-slate-600">
        {[["#22c55e", "Tích cực"], ["#ef4444", "Tiêu cực"], ["#94a3b8", "Trung lập"]].map(([color, name]) => <span key={name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{name}</span>)}
      </div>
      <p className="mt-4 text-xs text-slate-500">Mỗi mốc là kết quả tổng hợp tại thời điểm phân tích, không phải số đánh giá phát sinh trong ngày.</p>
      <details className="mt-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">Xem số liệu từng lần phân tích</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-xs">
            <caption className="sr-only">Tỷ lệ cảm xúc theo lần phân tích</caption>
            <thead><tr>{["Lần phân tích", "Thời gian", "Đánh giá", "Tích cực", "Tiêu cực", "Trung lập"].map((name) => <th key={name} scope="col" className="p-2">{name}</th>)}</tr></thead>
            <tbody>{data.map((entry) => <tr key={entry.id} className={entry.id === selectedId ? "bg-blue-50" : "border-t border-slate-100"}>
              <th scope="row" className="p-2">{entry.name}{entry.id === selectedId ? " (đang chọn)" : ""}</th>
              <td className="p-2">{entry.time}</td><td className="p-2">{number(entry.total)}</td>
              <td className="p-2">{entry.positive == null ? "—" : `${entry.positive}%`}</td><td className="p-2">{entry.negative == null ? "—" : `${entry.negative}%`}</td><td className="p-2">{entry.neutral == null ? "—" : `${entry.neutral}%`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </>}
  </section>;
}
