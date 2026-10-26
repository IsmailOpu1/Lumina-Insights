import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { tooltipStyle } from '@/lib/chartTheme';
import { LegendItem } from './ChartCard';

export interface Slice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: Slice[];
  /** Big text in the middle of the ring. */
  centerValue: string;
  centerLabel: string;
  formatValue: (v: number) => string;
  emptyText: string;
}

/** Donut with a total in the middle and a value legend underneath. */
export default function DonutChart({ data, centerValue, centerLabel, formatValue, emptyText }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [`${formatValue(value)} · ${Math.round((value / total) * 100)}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="max-w-[120px] truncate text-lg font-semibold tabular-nums text-foreground">{centerValue}</span>
          <span className="max-w-[120px] truncate text-xs text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {data.map((d) => <LegendItem key={d.name} color={d.color} label={d.name} value={formatValue(d.value)} />)}
      </div>
    </div>
  );
}
