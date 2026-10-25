import { STATUS_COLORS } from '@/lib/constants';
import SkeletonLoader from '@/components/SkeletonLoader';
import ChartCard from './ChartCard';
import DonutChart from './DonutChart';

interface Props {
  data: { name: string; value: number }[];
  loading: boolean;
}

export default function OrderStatusPie({ data, loading }: Props) {
  if (loading) return <SkeletonLoader variant="chart" />;

  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.map((d) => ({ ...d, color: STATUS_COLORS[d.name] || '#94A3B8' }));

  return (
    <ChartCard title="Order status" subtitle="Every order in the period">
      <DonutChart
        data={slices}
        centerValue={total.toLocaleString()}
        centerLabel={total === 1 ? 'order' : 'orders'}
        formatValue={(v) => v.toLocaleString()}
        emptyText="No orders in this period yet"
      />
    </ChartCard>
  );
}
