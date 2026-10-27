import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface IssueChartProps {
  data: Record<string, number>;
}

const issueLabelMap: Record<string, string> = {
  PRODUCT_QUALITY: "Chất lượng sản phẩm",
  SHIPPING_LOGISTICS: "Giao hàng và vận chuyển",
  CUSTOMER_SERVICE_RETURNS: "Dịch vụ khách hàng và đổi trả",
  PRICING_PROMOTIONS: "Giá cả và khuyến mãi",

  // giữ tạm mapping cũ nếu database còn dữ liệu issue cũ
  SHIPPING: "Giao hàng và vận chuyển",
  CUSTOMER_SERVICE: "Dịch vụ khách hàng",
  PRICE: "Giá cả",
  PACKAGING: "Đóng gói",
  OTHER: "Vấn đề khác",
};

function shortenLabel(label: string) {
  if (label.length <= 22) {
    return label;
  }

  return `${label.slice(0, 22)}...`;
}

function IssueChart({
  data,
}: IssueChartProps) {
  const chartData = Object.entries(data || {}).map(
    ([key, value]) => {
      const fullName =
        issueLabelMap[key] || key;

      return {
        key,
        name: fullName,
        shortName: shortenLabel(fullName),
        value,
      };
    }
  );

  return (
    <section aria-labelledby="issue-chart-title"
      className="
        rounded-2xl
        border
        border-gray-100
        bg-white
        p-6
        shadow-sm
      "
    >
      <h2
        id="issue-chart-title"
        className="
          mb-5
          text-lg
          font-semibold
          text-slate-900
        "
      >
        Các vấn đề được phát hiện
      </h2>

      {chartData.length === 0 ? (
        <div
          className="
            flex
            h-80
            items-center
            justify-center
            rounded-xl
            border
            border-dashed
            border-slate-200
            bg-slate-50
            text-sm
            text-slate-500
          "
        >
          Chưa có dữ liệu vấn đề
        </div>
      ) : (
        <div className="h-96 w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={chartData}
              margin={{
                top: 20,
                right: 24,
                left: 0,
                bottom: 80,
              }}
              barCategoryGap="35%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="shortName"
                interval={0}
                angle={-20}
                textAnchor="end"
                height={90}
                tick={{
                  fontSize: 12,
                  fill: "#64748b",
                }}
                tickLine={false}
                axisLine={{
                  stroke: "#CBD5E1",
                }}
              />

              <YAxis
                allowDecimals={false}
                tick={{
                  fontSize: 12,
                  fill: "#64748b",
                }}
                tickLine={false}
                axisLine={{
                  stroke: "#CBD5E1",
                }}
              />

              <Tooltip
                cursor={{
                  fill: "rgba(15, 23, 42, 0.04)",
                }}
                formatter={(value) => [
                  value,
                  "Số lượng",
                ]}
                labelFormatter={(_, payload) => {
                  return payload?.[0]?.payload?.name || "";
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
                }}
              />

              <Bar
                dataKey="value"
                isAnimationActive={false}
                fill="#2563eb"
                radius={[
                  8,
                  8,
                  0,
                  0,
                ]}
                maxBarSize={72}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default IssueChart;
