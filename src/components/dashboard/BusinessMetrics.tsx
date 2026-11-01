import { useMemo, type ReactNode } from 'react';
import { CalendarDays, RefreshCw, Snowflake, Sun, Target, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import { activeOrders } from '@/hooks/useDashboardData';
import { countsForProfit } from '@/lib/constants';
import { rich, useT } from '@/i18n';

interface Order {
  date: string;
  status: string;
  selling_price: number;
  quantity: number;
  shipping_cost: number;
  ad_cost?: number | null;
  profit_per_order: number;
  product_id: string | null;
  product_name?: string | null;
}

interface InventoryItem {
  id: string;
  product_name: string;
  stock_quantity: number;
}

interface Expense {
  type: string;
  amount: number;
}

interface Props {
  orders: Order[];
  allOrders: Order[];
  inventory: InventoryItem[];
  expenses: Expense[];
  loading: boolean;
  deadProductDays: number;
}

export default function BusinessMetrics({ orders: periodOrders, allOrders: recentOrders, inventory, expenses, loading, deadProductDays }: Props) {
  const { t } = useT();
  const { formatCurrency } = useCurrency();
  const metrics = useMemo(() => {
    if (loading) return null;
    // Cancelled and returned orders are not sales.
    const orders = activeOrders(periodOrders);
    const allOrders = activeOrders(recentOrders);
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayOrders = allOrders.filter((o) => o.date === today);
    const dailyRevenue = todayOrders.reduce((s, o) => s + o.selling_price * o.quantity, 0);
    const dailyCount = todayOrders.length;

    // This week
    const now = new Date();
    const weekStart = format(startOfWeek(now), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now), 'yyyy-MM-dd');
    const thisWeekOrders = allOrders.filter((o) => o.date >= weekStart && o.date <= weekEnd);
    const weeklyRevenue = thisWeekOrders.reduce((s, o) => s + o.selling_price * o.quantity, 0);
    // Returned orders still lost their delivery and ad cost.
    const weeklyProfit = recentOrders
      .filter((o) => countsForProfit(o.status) && o.date >= weekStart && o.date <= weekEnd)
      .reduce((s, o) => s + o.profit_per_order, 0);

    // Last week
    const lastWeekStart = format(startOfWeek(subWeeks(now, 1)), 'yyyy-MM-dd');
    const lastWeekEnd = format(endOfWeek(subWeeks(now, 1)), 'yyyy-MM-dd');
    const lastWeekOrders = allOrders.filter((o) => o.date >= lastWeekStart && o.date <= lastWeekEnd);
    const lastWeekRevenue = lastWeekOrders.reduce((s, o) => s + o.selling_price * o.quantity, 0);
    const weekGrowth = lastWeekRevenue > 0 ? (weeklyRevenue - lastWeekRevenue) / lastWeekRevenue * 100 : 0;

    // Inventory turnover
    const totalSold = orders.reduce((s, o) => s + o.quantity, 0);
    const avgStock = inventory.length > 0 ? inventory.reduce((s, i) => s + i.stock_quantity, 0) / inventory.length : 1;
    const turnover = avgStock > 0 ? totalSold / avgStock : 0;

    // Dead products
    const cutoffDate = format(subDays(now, deadProductDays), 'yyyy-MM-dd');
    const recentProductIds = new Set(allOrders.filter((o) => o.date >= cutoffDate).map((o) => o.product_id));
    const deadProducts = inventory.filter((i) => !recentProductIds.has(i.id));

    // Dependency risk
    const productRevenue: Record<string, {name: string;revenue: number;}> = {};
    orders.forEach((o) => {
      const pid = o.product_id || 'unknown';
      const inv = inventory.find((i) => i.id === pid);
      const name = inv?.product_name || o.product_name || t('Unknown');
      if (!productRevenue[pid]) productRevenue[pid] = { name, revenue: 0 };
      productRevenue[pid].revenue += o.selling_price * o.quantity;
    });
    const sortedProducts = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue);
    const totalRev = sortedProducts.reduce((s, p) => s + p.revenue, 0);
    const top1Pct = totalRev > 0 && sortedProducts[0] ? sortedProducts[0].revenue / totalRev * 100 : 0;
    const top3Pct = totalRev > 0 ? sortedProducts.slice(0, 3).reduce((s, p) => s + p.revenue, 0) / totalRev * 100 : 0;

    // Expenses
    const adSpend = expenses.filter((e) => e.type === 'Ad Spend').reduce((s, e) => s + e.amount, 0);
    const shippingExp = expenses.filter((e) => e.type === 'Shipping').reduce((s, e) => s + e.amount, 0);
    const miscExp = expenses.filter((e) => e.type === 'Miscellaneous').reduce((s, e) => s + e.amount, 0);
    const returned = periodOrders.filter((o) => o.status === 'Returned');
    const returnLoss = returned.reduce((s, o) => s + o.shipping_cost + (o.ad_cost ?? 0), 0);

    return {
      dailyRevenue, dailyCount, weeklyRevenue, weeklyProfit, weekGrowth,
      turnover, deadProducts, top1Pct, top1Name: sortedProducts[0]?.name || '—',
      top3Pct, adSpend, shippingExp, miscExp, returnedCount: returned.length, returnLoss
    };
  }, [periodOrders, recentOrders, inventory, expenses, deadProductDays, loading, t]);

  const riskTone = (pct: number) => pct > 60 ? 'text-destructive' : pct > 40 ? 'text-warning' : 'text-success';
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  if (!metrics) return <SkeletonLoader variant="card" count={3} />;

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Tile icon={Sun} title={t('Today')}>
        <Stat label={t('Revenue')} value={formatCurrency(metrics.dailyRevenue)} />
        <Stat label={t('Orders')} value={metrics.dailyCount.toLocaleString()} />
      </Tile>

      <Tile
        icon={CalendarDays}
        title={t('This week')}
        badge={
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
            metrics.weekGrowth >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
            {t('{pct} vs last week', { pct: signed(metrics.weekGrowth) })}
          </span>
        }
      >
        <Stat label={t('Revenue')} value={formatCurrency(metrics.weeklyRevenue)} />
        <Stat
          label={t('Profit')}
          value={formatCurrency(metrics.weeklyProfit)}
          className={metrics.weeklyProfit >= 0 ? 'text-success' : 'text-destructive'}
        />
      </Tile>

      <Tile icon={Wallet} title={t('Expenses')}>
        <Stat label={t('Ads')} value={formatCurrency(metrics.adSpend)} />
        <Stat label={t('Shipping')} value={formatCurrency(metrics.shippingExp)} />
        <Stat label={t('Other')} value={formatCurrency(metrics.miscExp)} />
        {metrics.returnedCount > 0 && (
          <Stat
            label={t('Returns ({n})', { n: metrics.returnedCount })}
            value={formatCurrency(metrics.returnLoss)}
            className="text-destructive"
          />
        )}
      </Tile>

      <Tile icon={RefreshCw} title={t('Inventory turnover')}>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{metrics.turnover.toFixed(1)}x</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('Units sold per unit in stock this period')}</p>
      </Tile>

      <Tile icon={Target} title={t('Product dependency')}>
        <p className="text-sm text-muted-foreground">
          {rich(t('{pct} of revenue from {name}'), {
            pct: <span className={cn('font-semibold', riskTone(metrics.top1Pct))}>{metrics.top1Pct.toFixed(0)}%</span>,
            name: <span className="text-foreground">{metrics.top1Name}</span>,
          })}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {rich(t('{pct} from your top 3'), {
            pct: <span className={cn('font-semibold', riskTone(metrics.top3Pct))}>{metrics.top3Pct.toFixed(0)}%</span>,
          })}
        </p>
      </Tile>

      <Tile icon={Snowflake} title={t('No sales in {n} days', { n: deadProductDays })}>
        {metrics.deadProducts.length === 0 ? (
          <p className="text-sm text-success">{t('Every product is selling')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {metrics.deadProducts.slice(0, 5).map((p) => (
              <span key={p.id} className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs text-warning">
                {p.product_name}
              </span>
            ))}
            {metrics.deadProducts.length > 5 && (
              <span className="text-xs text-muted-foreground">{t('+{n} more', { n: metrics.deadProducts.length - 5 })}</span>
            )}
          </div>
        )}
      </Tile>
    </div>
  );
}

function Tile({ icon: Icon, title, badge, children }: { icon: LucideIcon; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="surface-interactive p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon size={15} />
          {title}
        </h3>
        {badge}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-base font-semibold tabular-nums text-foreground', className)}>{value}</span>
    </div>
  );
}
