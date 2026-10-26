import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { axisTick, chartTheme, tooltipStyle } from '@/lib/chartTheme';
import { getRevenueOverTime } from '@/hooks/useDashboardData';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import ChartCard from './ChartCard';
import Segmented from './Segmented';

type Granularity = 'daily' | 'weekly' | 'monthly';

interface Props {
  orders: { date: string; selling_price: number; quantity: number; status: string }[];
  loading: boolean;
  className?: string;
}

export default function RevenueGrowthChart({ orders, loading, className }: Props) {
  const { formatCurrency } = useCurrency();
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const data = getRevenueOverTime(orders, granularity);

  if (loading) return <SkeletonLoader variant="chart" />;

  return (
    <ChartCard
      title="Revenue"
      subtitle="Sales over the selected period, cancelled orders excluded"
      className={className}
      action={
        <Segmented<Granularity>
          label="Chart granularity"
          value={granularity}
          onChange={setGranularity}
          options={[
            { label: 'Day', value: 'daily' },
            { label: 'Week', value: 'weekly' },
            { label: 'Month', value: 'monthly' },
          ]}
        />
      }
    >
      {data.length === 0 ? (
        <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No sales in this period yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.primaryLine} stopOpacity={0.35} />
                <stop offset="100%" stopColor={chartTheme.primaryLine} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartTheme.gridColor} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={72} tickFormatter={(v) => formatCurrency(v)} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ stroke: chartTheme.axisColor }}
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={chartTheme.primaryLine}
              strokeWidth={2}
              fill="url(#revenueFill)"
              activeDot={{ r: 4, fill: chartTheme.highlight, stroke: chartTheme.tooltipBg, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
