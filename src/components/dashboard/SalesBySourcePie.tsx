import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import ChartCard from './ChartCard';
import DonutChart from './DonutChart';

const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#F472B6',
  Facebook: '#60A5FA',
  WhatsApp: '#34D399',
  Website: '#A78BFA',
  TikTok: '#E2E8F0',
};

interface Props {
  data: { name: string; value: number }[];
  loading: boolean;
}

export default function SalesBySourcePie({ data, loading }: Props) {
  const { formatCurrency } = useCurrency();
  if (loading) return <SkeletonLoader variant="chart" />;

  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = [...data]
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, color: SOURCE_COLORS[d.name] || '#94A3B8' }));

  return (
    <ChartCard title="Sales by channel" subtitle="Revenue per order source">
      <DonutChart
        data={slices}
        centerValue={slices.length ? `${Math.round((slices[0].value / (total || 1)) * 100)}%` : '—'}
        centerLabel={slices[0]?.name ?? ''}
        formatValue={formatCurrency}
        emptyText="No sales in this period yet"
      />
    </ChartCard>
  );
}
