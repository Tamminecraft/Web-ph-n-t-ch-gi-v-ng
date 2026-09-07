import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, Legend } from "recharts";
import type { PredictionPoint } from "@/lib/gold";

export function PredictionChart({ data }: { data: PredictionPoint[] }) {
  const values = data.flatMap((d) => [d.actual, d.predicted].filter((value): value is number => value != null && Number.isFinite(value)));
  if (values.length === 0) {
    return <div className="w-full h-[420px] flex items-center justify-center text-sm text-muted-foreground">Chưa có dữ liệu biểu đồ.</div>;
  }
  const min = Math.floor(Math.min(...values) / 50) * 50 - 50;
  const max = Math.ceil(Math.max(...values) / 50) * 50 + 50;

  return (
    <div className="w-full h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.78 0.14 88)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.78 0.14 88)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(0.92 0.015 85)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "oklch(0.5 0.02 70)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            domain={[min, max]}
            tick={{ fill: "oklch(0.5 0.02 70)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid oklch(0.92 0.015 85)",
              borderRadius: 12,
              boxShadow: "0 8px 30px oklch(0.2 0.02 60 / 0.1)",
            }}
            formatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) => (v === "actual" ? "Thực tế" : "Dự đoán")}
          />
          <Area type="monotone" dataKey="predicted" fill="url(#goldFill)" stroke="none" />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="oklch(0.2 0.02 60)"
            strokeWidth={3}
            dot={{ r: 4, fill: "oklch(0.2 0.02 60)" }}
            activeDot={{ r: 6 }}
            connectNulls={true}
            strokeOpacity={0.9}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="oklch(0.66 0.13 78)"
            strokeWidth={3}
            strokeDasharray="6 5"
            dot={{ r: 4, fill: "oklch(0.66 0.13 78)" }}
            activeDot={{ r: 6 }}
            connectNulls={true}
            strokeOpacity={0.95}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
