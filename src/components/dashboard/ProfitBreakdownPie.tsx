import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { getChartTheme } from '@/lib/chartTheme';
import { formatTaka } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';

const COLORS = ['#4A7C59', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6'];
const LABELS = ['Revenue', 'COGS', 'Shipping', 'Ad Spend (Expenses)', 'Ad Cost (Orders)', 'Net Profit'];

interface Props {
  revenue: number;
  cogs: number;
  shipping: number;
  adSpend: number;
  orderAdCost?: number;
  netProfit: number;
  loading: boolean;
}

export default function ProfitBreakdownPie({ revenue, cogs, shipping, adSpend, orderAdCost = 0, netProfit, loading }: Props) {
  const { isDark } = useTheme();
  const theme = getChartTheme(isDark);

  if (loading) return <SkeletonLoader variant="chart" />;

  const data = [
  { name: 'Revenue', value: Math.max(revenue, 0) },
  { name: 'COGS', value: Math.max(cogs, 0) },
  { name: 'Shipping', value: Math.max(shipping, 0) },
  { name: 'Ad Spend (Expenses)', value: Math.max(adSpend, 0) },
  { name: 'Ad Cost (Orders)', value: Math.max(orderAdCost, 0) },
  { name: 'Net Profit', value: Math.max(netProfit, 0) }].
  filter((d) => d.value > 0);

  return (
    <div className="card-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(74,124,89,0.12)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base text-foreground font-extrabold">Profit Breakdown</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart className="text-sm font-extrabold">
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={90} dataKey="value" paddingAngle={2}
          label={({ name, value }) => `${name} ${formatTaka(value)}`}>
            
            {data.map((d, i) => <Cell key={i} fill={COLORS[LABELS.indexOf(d.name)] || COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: number) => formatTaka(value)} contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {data.map((d, i) =>
        <div key={d.name} className="flex items-center gap-1.5 font-extrabold text-accent text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[LABELS.indexOf(d.name)] || COLORS[i % COLORS.length] }} />
            {d.name}
          </div>
        )}
      </div>
    </div>);

}