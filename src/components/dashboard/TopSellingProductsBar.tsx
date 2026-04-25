import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
    name: d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name,
    fullName: d.name
  }));

  // Dynamic height based on number of products (horizontal layout needs more height per item)
  const chartHeight = data.length <= 2 ? 120 : data.length <= 5 ? 180 : 240;

  return (
    <div className="card-hover mb-6 rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base text-foreground font-extrabold">Top Selling Products</h3>
      <ResponsiveContainer width="100%" height={chartHeight} className="font-extrabold text-sm">
        <BarChart 
          data={chartData} 
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} horizontal={false} />
          <XAxis 
            type="number" 
            tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 11 }} 
            axisLine={{ stroke: theme.axisColor }} 
            tickLine={false} 
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            width={75}
            tick={{ fill: theme.labelColor, fontWeight: 700, fontSize: 11 }} 
            axisLine={{ stroke: theme.axisColor }} 
            tickLine={false} 
          />
          <Tooltip
            contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }}
            formatter={(value: number, _: string, props: any) => [`${value} units sold • ${formatTaka(props.payload.revenue)}`, props.payload.fullName]} />
          
          <Bar dataKey="qty" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>);
}