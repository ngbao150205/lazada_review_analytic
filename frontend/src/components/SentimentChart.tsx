import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface SentimentChartProps {
  positive: number;
  negative: number;
  neutral: number;
}

function SentimentChart({ positive, negative, neutral }: SentimentChartProps) {
  const data = [
    { name: "Tích cực", value: positive, color: "#22c55e" },
    { name: "Tiêu cực", value: negative, color: "#ef4444" },
    { name: "Trung lập", value: neutral, color: "#94a3b8" },
  ];
  const total = positive + negative + neutral;
  const visibleData = data.filter((entry) => entry.value > 0);
  return <section aria-labelledby="sentiment-chart-title" className="min-w-0 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <h2 id="sentiment-chart-title" className="text-xl font-bold text-slate-900 sm:text-2xl">Phân tích cảm xúc</h2>
    <p className="mt-1 text-sm text-slate-500">Tỷ lệ tính trên những đánh giá đã có kết quả cảm xúc.</p>
    <div className="mt-5 grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
      {total > 0 ? <div className="relative h-64 sm:h-80">
        <div className="h-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={visibleData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="84%" paddingAngle={3} isAnimationActive={false}>
                {visibleData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => [Number(value).toLocaleString("vi-VN"), "Đánh giá"]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{total.toLocaleString("vi-VN")}</strong>
          <span className="mt-1 max-w-28 text-xs leading-relaxed text-slate-500">Đánh giá đã phân tích</span>
        </div>
      </div> : <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Chưa có kết quả phân tích cảm xúc.</p>}
      <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {data.map((entry) => <li key={entry.name} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <strong className="break-all text-2xl font-bold text-slate-900">{entry.value.toLocaleString("vi-VN")}</strong>
            <span className="text-sm font-medium text-slate-500">{total ? (entry.value / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : 0}%</span>
          </div>
        </li>)}
      </ul>
    </div>
  </section>;
}

export default SentimentChart;
