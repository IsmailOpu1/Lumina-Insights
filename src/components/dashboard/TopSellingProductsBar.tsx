import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { getChartTheme } from '@/lib/chartTheme';
import { formatTaka } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';

interface ProductData {
  name: string;
  qty: number;
  revenue: number;
}

interface Props {
  data: ProductData[];
  loading: boolean;
}

export default function TopSellingProductsBar({ data, loading }: Props) {
  const { isDark } = useTheme();
  const theme = getChartTheme(isDark);

  if (loading) return <SkeletonLoader variant="chart" />;

  const chartData = data.map((d) => ({
    ...d,
    name: d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name,
    fullName: d.name
  }));

  // Dynamic height based on number of products
  const chartHeight = data.length <= 2 ? 150 : data.length <= 5 ? 200 : 250;

  return (
    <div className="card-hover mb-6 rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base text-foreground font-extrabold">Top Selling Products</h3>
      <ResponsiveContainer width="100%" height={chartHeight} className="font-extrabold text-sm">
        <BarChart data={chartData} barCategoryGap="60%">
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 11 }} axisLine={{ stroke: theme.axisColor }} tickLine={false} />
          <YAxis tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 12 }} axisLine={{ stroke: theme.axisColor }} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }}
            formatter={(value: number, _: string, props: any) => [`${value} units sold • ${formatTaka(props.payload.revenue)}`, props.payload.fullName]} />
          
          <Bar dataKey="qty" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={40}>
            <LabelList dataKey="qty" position="top" style={{ fill: theme.labelColor, fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>);
}