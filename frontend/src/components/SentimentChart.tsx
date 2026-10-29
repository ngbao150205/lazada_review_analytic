import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { chartColors } from "./chartColors";

interface SentimentChartProps {
  positive: number;
  negative: number;
  neutral: number;
}

function SentimentChart({ positive, negative, neutral }: SentimentChartProps) {
  const data = [
    { name: "Positive", value: positive, color: chartColors.positive, textColor: "#166534", background: "#f0fdf4", border: "#bbf7d0" },
    { name: "Negative", value: negative, color: chartColors.negative, textColor: "#991b1b", background: "#fef2f2", border: "#fecaca" },
    { name: "Neutral", value: neutral, color: chartColors.neutral, textColor: "#1e40af", background: "#eff6ff", border: "#bfdbfe" },
  ];
  const total = positive + negative + neutral;
  const visibleData = data.filter((entry) => entry.value > 0);
  const percentage = (value: number) => total ? value / total * 100 : 0;
  const formatPercentage = (value: number) => `${percentage(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  return <section aria-labelledby="sentiment-chart-title" className="dashboard-panel dashboard-sentiment">
    <h2 id="sentiment-chart-title" className="dashboard-panel__title">Phân tích cảm xúc</h2>
    <p className="dashboard-panel__description">Tỷ lệ tính trên những đánh giá đã có kết quả cảm xúc.</p>
    <div className="mt-5 grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
      {total > 0 ? <div className="relative mx-auto h-72 w-full max-w-sm sm:h-80">
        <div className="h-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={visibleData} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="88%" paddingAngle={3} stroke="#ffffff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                {visibleData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString("vi-VN")} đánh giá · ${formatPercentage(Number(value))}`, name]} contentStyle={{ borderRadius: 12, border: "1px solid #dededb", fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{total.toLocaleString("vi-VN")}</strong>
          <span className="mt-1 max-w-28 text-xs leading-relaxed text-slate-500">Đánh giá đã phân tích</span>
        </div>
      </div> : <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Chưa có kết quả phân tích cảm xúc.</p>}
      <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {data.map((entry) => <li key={entry.name} className="min-w-0 rounded-xl border p-4" style={{ backgroundColor: entry.background, borderColor: entry.border }}>
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: entry.textColor }}><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <strong className="break-all text-2xl font-semibold text-slate-900">{entry.value.toLocaleString("vi-VN")}<span className="ml-2 text-xs font-normal text-slate-600">đánh giá</span></strong>
            <span className="text-lg font-semibold tabular-nums" style={{ color: entry.textColor }}>{formatPercentage(entry.value)}</span>
          </div>
          <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full" style={{ backgroundColor: entry.color, width: `${percentage(entry.value)}%` }} /></div>
        </li>)}
      </ul>
    </div>
  </section>;
}

export default SentimentChart;
