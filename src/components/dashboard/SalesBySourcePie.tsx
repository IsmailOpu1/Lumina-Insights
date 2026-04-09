import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { getChartTheme } from '@/lib/chartTheme';
import { formatTaka } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';

const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#E1306C',
  Facebook: '#1877F2',
  WhatsApp: '#25D366',
  Website: '#6366F1',
  TikTok: '#010101'
};

interface Props {
  data: {name: string;value: number;}[];
  loading: boolean;
}

export default function SalesBySourcePie({ data, loading }: Props) {
  const { isDark } = useTheme();
  const theme = getChartTheme(isDark);

  if (loading) return <SkeletonLoader variant="chart" />;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)]">
      <h3 className="mb-4 text-base text-foreground font-extrabold">Sales by Source</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart className="text-xs font-extrabold">
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={90} dataKey="value" paddingAngle={2}
          label={({ name, value }) => `${name} ${total > 0 ? Math.round(value / total * 100) : 0}%`}>
            
            {data.map((d) => {
              let color = SOURCE_COLORS[d.name] || '#6366F1';
              if (d.name === 'TikTok' && isDark) color = '#FFFFFF';
              return <Cell key={d.name} fill={color} stroke={d.name === 'TikTok' ? isDark ? '#555' : '#ccc' : 'none'} />;
            })}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${formatTaka(value)} (${total > 0 ? Math.round(value / total * 100) : 0}%)`, name]}
            contentStyle={{ backgroundColor: theme.tooltipBg, color: theme.tooltipText, border: 'none', borderRadius: 8, fontWeight: 700 }} />
          
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap justify-center gap-3 font-extrabold text-sm text-accent">
        {data.map((d) =>
        <div key={d.name} className="flex items-center gap-1.5 font-extrabold text-sm text-accent">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[d.name] || '#6366F1' }} />
            {d.name}
          </div>
        )}
      </div>
    </div>);

}