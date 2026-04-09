import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { getChartTheme } from '@/lib/chartTheme';
import { STATUS_COLORS } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';

interface Props {
  data: {name: string;value: number;}[];
  loading: boolean;
}

export default function OrderStatusPie({ data, loading }: Props) {
  const { isDark } = useTheme();
  const theme = getChartTheme(isDark);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (loading) return <SkeletonLoader variant="chart" />;

  return (
    <div className="card-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base font-bold text-foreground">Order Status</h3>
      <ResponsiveContainer width="100%" height={240} className="font-extrabold text-sm">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={85} dataKey="value" paddingAngle={2}
          label={({ name, value }) => `${name} (${value})`}>
            
            {data.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name] || '#6B7280'} />)}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value} (${total > 0 ? Math.round(value / total * 100) : 0}%)`, name]}
            contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }} />
          
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {data.map((d) =>
        <div key={d.name} className="flex items-center gap-1.5 font-extrabold text-sm text-primary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.name] || '#6B7280' }} />
            {d.name}
          </div>
        )}
      </div>
    </div>);

}