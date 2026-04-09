import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { getChartTheme } from '@/lib/chartTheme';
import { formatTaka } from '@/lib/constants';
import { getRevenueOverTime } from '@/hooks/useDashboardData';
import SkeletonLoader from '@/components/SkeletonLoader';

type Granularity = 'daily' | 'weekly' | 'monthly';

interface Props {
  orders: {date: string;selling_price: number;quantity: number;}[];
  loading: boolean;
}

export default function RevenueGrowthChart({ orders, loading }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const { isDark } = useTheme();
  const theme = getChartTheme(isDark);
  const data = getRevenueOverTime(orders as any, granularity);

  if (loading) return <SkeletonLoader variant="chart" />;

  return (
    <div className="card-hover mb-6 rounded-xl border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--card-bg)] border-[var(--card-bg)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base text-accent font-extrabold">Revenue Growth</h3>
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as Granularity[]).map((g) =>
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors active:scale-[0.97] ${
            granularity === g ?
            'bg-primary text-primary-foreground' :
            'text-muted-foreground hover:text-primary'}`
            }>
            
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280} className="text-primary-foreground" style={{ backgroundColor: 'var(--card-bg)' }}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 12 }} axisLine={{ stroke: theme.axisColor }} tickLine={false} />
          <YAxis tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 12 }} axisLine={{ stroke: theme.axisColor }} tickLine={false} tickFormatter={(v) => formatTaka(v)} />
          <Tooltip
            contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }}
            formatter={(value: number) => [formatTaka(value), 'Revenue']} />
          
          <Line type="monotone" dataKey="revenue" stroke={theme.primaryLine} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: theme.primaryLine }} />
        </LineChart>
      </ResponsiveContainer>
    </div>);

}