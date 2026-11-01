import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import ChartCard from './ChartCard';
import DonutChart from './DonutChart';
import { useT } from '@/i18n';

interface Props {
  revenue: number;
  cogs: number;
  shipping: number;
  adSpend: number;
  orderAdCost?: number;
  netProfit: number;
  loading: boolean;
}

/** Where revenue went: each cost, and what was left as profit. */
export default function ProfitBreakdownPie({ revenue, cogs, shipping, adSpend, orderAdCost = 0, netProfit, loading }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  if (loading) return <SkeletonLoader variant="chart" />;

  const data = [
    { name: t('Product cost'), value: cogs, color: '#F5A524' },
    { name: t('Shipping'), value: shipping, color: '#60A5FA' },
    { name: t('Ads (expenses)'), value: adSpend, color: '#A78BFA' },
    { name: t('Ads (per order)'), value: orderAdCost, color: '#F472B6' },
    { name: t('Net profit'), value: netProfit, color: '#10B981' },
  ].filter((d) => d.value > 0);

  return (
    <ChartCard title={t('Profit breakdown')} subtitle={t('Where your revenue went')}>
      <DonutChart
        data={data}
        centerValue={formatCurrency(revenue)}
        centerLabel="revenue"
        formatValue={formatCurrency}
        emptyText="No sales in this period yet"
      />
    </ChartCard>
  );
}
