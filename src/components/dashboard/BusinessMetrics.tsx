import { useMemo } from 'react';
import { formatTaka } from '@/lib/constants';
import { format, subDays, startOfDay, isToday, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import SkeletonLoader from '@/components/SkeletonLoader';

interface Order {
  date: string;
  selling_price: number;
  quantity: number;
  profit_per_order: number;
  product_id: string | null;
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

export default function BusinessMetrics({ orders, allOrders, inventory, expenses, loading, deadProductDays }: Props) {
  const metrics = useMemo(() => {
    if (loading) return null;
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
    const weeklyProfit = thisWeekOrders.reduce((s, o) => s + o.profit_per_order, 0);

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
      const name = inv?.product_name || 'Unknown';
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

    return {
      dailyRevenue, dailyCount, weeklyRevenue, weeklyProfit, weekGrowth,
      turnover, deadProducts, top1Pct, top1Name: sortedProducts[0]?.name || '—',
      top3Pct, adSpend, shippingExp, miscExp
    };
  }, [orders, allOrders, inventory, expenses, deadProductDays, loading]);

  const riskColor = (pct: number) => pct > 60 ? '#EF4444' : pct > 40 ? '#F59E0B' : '#10B981';

  if (!metrics) return <SkeletonLoader variant="card" count={6} />;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
      {/* Today */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm font-extrabold text-accent">Today's Performance</h4>
        <p className="text-xl font-bold" style={{ color: '#6366F1' }}>{formatTaka(metrics.dailyRevenue)}</p>
        <p className="text-sm font-extrabold text-accent">Daily Revenue</p>
        <p className="mt-2 font-extrabold text-xl" style={{ color: '#6366F1' }}>{metrics.dailyCount}</p>
        <p className="text-sm font-extrabold text-accent">Daily Orders</p>
      </div>

      {/* This Week */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm font-extrabold text-accent">This Week</h4>
        <p className="text-xl font-bold" style={{ color: '#6366F1' }}>{formatTaka(metrics.weeklyRevenue)}</p>
        <p className="text-sm font-extrabold text-accent">Weekly Revenue</p>
        <p className="mt-2 text-xl font-bold" style={{ color: metrics.weeklyProfit >= 0 ? '#10B981' : '#EF4444' }}>
          {formatTaka(metrics.weeklyProfit)}
        </p>
        <p className="text-sm font-extrabold text-accent">Weekly Profit</p>
        <p className="mt-1 text-sm font-bold" style={{ color: metrics.weekGrowth >= 0 ? '#10B981' : '#EF4444' }}>
          {metrics.weekGrowth >= 0 ? '+' : ''}{metrics.weekGrowth.toFixed(1)}% vs last week
        </p>
      </div>

      {/* Inventory Turnover */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm text-accent font-extrabold">Inventory Turnover</h4>
        <p className="text-2xl font-bold" style={{ color: '#6366F1' }}>{metrics.turnover.toFixed(1)}</p>
        <p className="text-sm font-extrabold text-accent">units sold per unit held</p>
      </div>

      {/* Dead Products */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm font-bold text-muted-foreground">Dead Products</h4>
        {metrics.deadProducts.length === 0 ?
        <p className="text-sm font-bold text-[#07ab4c]">No dead stock 🎉</p> :

        <div className="flex flex-wrap gap-1.5">
            {metrics.deadProducts.slice(0, 5).map((p) =>
          <span key={p.id} className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-orange-700 font-extrabold text-sm">
                {p.product_name}
              </span>
          )}
            {metrics.deadProducts.length > 5 &&
          <span className="text-xs font-bold text-muted-foreground">+{metrics.deadProducts.length - 5} more</span>
          }
          </div>
        }
      </div>

      {/* Dependency Risk */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm font-bold text-muted-foreground">Dependency Risk</h4>
        <p className="text-sm font-bold text-amber-700" style={{ color: riskColor(metrics.top1Pct) }}>
          Top product '{metrics.top1Name}' = {metrics.top1Pct.toFixed(0)}% of revenue
        </p>
        <p className="mt-1.5 text-sm font-bold" style={{ color: riskColor(metrics.top3Pct) }}>
          Top 3 products = {metrics.top3Pct.toFixed(0)}% of revenue
        </p>
      </div>

      {/* Expense Summary */}
      <div className="stat-hover rounded-xl border border-border p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-[var(--chart-card-bg)] cursor-pointer">
        <h4 className="mb-3 text-sm font-bold text-muted-foreground">Expense Summary</h4>
        <div className="space-y-1.5">
          <p className="text-sm font-bold" style={{ color: '#8B5CF6' }}>Ad Spend: {formatTaka(metrics.adSpend)}</p>
          <p className="text-sm font-bold" style={{ color: '#3B82F6' }}>Shipping: {formatTaka(metrics.shippingExp)}</p>
          <p className="text-sm font-bold text-muted-foreground">Misc: {formatTaka(metrics.miscExp)}</p>
        </div>
      </div>
    </div>);

}