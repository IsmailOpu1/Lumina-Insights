import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useFilter } from '@/context/FilterContext';
import { Button } from '@/components/ui/button';
import {
  useDashboardData, computeKPIs, getCollection, getRevenueBySource, getOrdersByStatus, getTopProducts, percentChange,
} from '@/hooks/useDashboardData';
import DateFilterBar from '@/components/dashboard/DateFilterBar';
import KPICards, { type KPI } from '@/components/dashboard/KPICards';
import RevenueGrowthChart from '@/components/dashboard/RevenueGrowthChart';
import ProfitBreakdownPie from '@/components/dashboard/ProfitBreakdownPie';
import SalesBySourcePie from '@/components/dashboard/SalesBySourcePie';
import TopSellingProductsBar from '@/components/dashboard/TopSellingProductsBar';
import OrderStatusPie from '@/components/dashboard/OrderStatusPie';
import InventoryAlerts from '@/components/dashboard/InventoryAlerts';
import BusinessMetrics from '@/components/dashboard/BusinessMetrics';
import RecentOrdersTable from '@/components/dashboard/RecentOrdersTable';
import { useCurrency } from '@/hooks/useCurrency';
import { fetchAll } from '@/lib/fetchAll';
import { format, min, parseISO, startOfWeek, subDays, subWeeks } from 'date-fns';
import {
  AlertTriangle, CalendarSearch, Crown, Gauge, Megaphone, Package, Percent, Repeat, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';
import { currentDateLocale, tr, useT } from '@/i18n';

export default function Dashboard() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const { orders, inventory, expenses, previous, loading } = useDashboardData();
  const { ownerIdForQueries, userSettings } = useAuth();
  const [allOrders, setAllOrders] = useState<typeof orders>([]);
  const [deadProductDays, setDeadProductDays] = useState(30);
  const [roasThreshold, setRoasThreshold] = useState(2.0);
  const { dateFilter, setDateFilter } = useFilter();
  const [latestSale, setLatestSale] = useState<string | null>(null);

  // An empty period isn't an empty business: imported history is often
  // older than the default 7 days, so say where the sales are.
  const periodEmpty = !loading && orders.length === 0 && dateFilter !== 'all';
  useEffect(() => {
    if (!periodEmpty) return;
    supabase
      .from('orders')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .then(({ data }) => setLatestSale(data?.[0]?.date ?? null));
  }, [periodEmpty]);

  // Recent orders independent of the date filter: enough for last week's
  // comparison, the dead-product window and the recent orders table.
  useEffect(() => {
    async function fetchRecent() {
      const now = new Date();
      const since = min([startOfWeek(subWeeks(now, 1)), subDays(now, deadProductDays)]);
      const { data } = await fetchAll((a, b) => supabase
        .from('orders')
        .select('*')
        .gte('date', format(since, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b));
      setAllOrders((data as typeof orders) || []);
    }
    fetchRecent();
  }, [orders, deadProductDays]);

  // Thresholds are workspace settings, so always read the owner's row.
  useEffect(() => {
    if (!ownerIdForQueries) return;
    async function fetchSettings() {
      const { data } = await supabase
        .from('user_settings')
        .select('dead_product_days, roas_threshold')
        .eq('user_id', ownerIdForQueries)
        .maybeSingle();
      if (data?.dead_product_days) setDeadProductDays(data.dead_product_days);
      if (data?.roas_threshold) setRoasThreshold(data.roas_threshold);
    }
    fetchSettings();
  }, [ownerIdForQueries]);

  const kpis = computeKPIs(orders, inventory, expenses);
  const before = previous && computeKPIs(previous.orders, inventory, previous.expenses);
  const changeLabel = previous && (previous.days === 7 ? t('vs previous 7 days') : previous.days === 30 ? t('vs previous 30 days') : t('vs previous {n} days', { n: previous.days }));
  const change = (cur: number, prev: number) => (before && changeLabel ? { pct: percentChange(cur, prev), label: changeLabel } : undefined);
  const collection = getCollection(orders);
  const sourceData = getRevenueBySource(orders);
  const statusData = getOrdersByStatus(orders);
  const topProducts = getTopProducts(orders, inventory);

  // Ad spend counts both ad expenses and per-order ad costs.
  const avgAdCostPerOrder = kpis.totalOrders > 0 ? kpis.totalAdSpend / kpis.totalOrders : 0;
  const roas = kpis.totalAdSpend > 0 ? kpis.totalRevenue / kpis.totalAdSpend : Infinity;

  const primaryKpis: KPI[] = [
    {
      label: t('Revenue'),
      value: kpis.totalRevenue,
      format: 'taka',
      icon: TrendingUp,
      change: before ? change(kpis.totalRevenue, before.totalRevenue) : undefined,
      // Most orders are cash on delivery: say how much of it is still to come.
      subValue: collection.toCollect > 0
        ? t('{delivered} delivered · {open} still to collect', { delivered: formatCurrency(collection.delivered), open: formatCurrency(collection.toCollect) })
        : undefined,
      tooltip: t('Still to collect: pending, processing and shipped orders not yet delivered'),
    },
    {
      label: t('Net profit'),
      value: kpis.netProfit,
      format: 'taka',
      icon: Wallet,
      tone: kpis.netProfit >= 0 ? 'positive' : 'negative',
      change: before ? change(kpis.netProfit, before.netProfit) : undefined,
      subValue: t('{pct}% margin', { pct: kpis.profitMargin.toFixed(1) }),
    },
    { label: t('Orders'), value: kpis.totalOrders, format: 'number', icon: ShoppingBag, change: before ? change(kpis.totalOrders, before.totalOrders) : undefined, subValue: kpis.repeatCustomers === 1 ? t('{n} repeat customer', { n: 1 }) : t('{n} repeat customers', { n: kpis.repeatCustomers }) },
    { label: t('Inventory value'), value: kpis.inventoryValue, format: 'taka', icon: Package, subValue: t('At cost price') },
  ];

  const secondaryKpis: KPI[] = [
    { label: t('Profit margin'), value: kpis.profitMargin, format: 'percent', icon: Percent },
    {
      label: t('Low stock'),
      value: kpis.lowStockItems.length,
      format: 'number',
      icon: AlertTriangle,
      tone: kpis.lowStockItems.length > 0 ? 'warning' : undefined,
    },
    { label: t('Repeat customers'), value: kpis.repeatCustomers, format: 'number', icon: Repeat },
    {
      label: t('Top customer'),
      value: 0,
      format: 'name',
      icon: Crown,
      nameValue: kpis.topCustomer?.name,
      subValue: kpis.topCustomer ? formatCurrency(kpis.topCustomer.revenue) : undefined,
    },
    {
      label: t('Ad cost / order'),
      value: avgAdCostPerOrder,
      format: 'taka',
      icon: Megaphone,
      tooltip: t('Average ad spend to win each order in this period'),
    },
    {
      label: 'ROAS',
      value: roas,
      format: 'roas',
      icon: Gauge,
      tone: roas >= roasThreshold ? 'positive' : 'negative',
      tooltip: t('Revenue per {amount} spent on ads. Your target: {target}x.', { amount: `${symbol}1`, target: roasThreshold }),
    },
  ];

  const name = userSettings?.full_name?.split(' ')[0] || userSettings?.business_name;

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="page-subtitle">{t("Here's how your business is doing")} · {format(new Date(), 'EEEE, d MMMM', { locale: currentDateLocale() })}</p>
        </div>
        <DateFilterBar />
      </header>

      {periodEmpty && latestSale && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CalendarSearch size={16} className="shrink-0 text-primary" />
            {t('No sales in this period. Your latest sale was on {date}.', { date: format(parseISO(latestSale), 'd MMMM yyyy', { locale: currentDateLocale() }) })}
          </p>
          <Button size="sm" variant="outline" onClick={() => setDateFilter('all')}>{t('Show all time')}</Button>
        </div>
      )}

      <KPICards primary={primaryKpis} secondary={secondaryKpis} loading={loading} />

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <RevenueGrowthChart orders={orders} loading={loading} className="xl:col-span-2" />
        <ProfitBreakdownPie
          revenue={kpis.totalRevenue}
          cogs={kpis.cogs}
          shipping={kpis.totalShipping}
          adSpend={kpis.adSpend}
          orderAdCost={kpis.orderAdCost}
          netProfit={kpis.netProfit}
          loading={loading}
        />
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <TopSellingProductsBar data={topProducts} loading={loading} />
        <SalesBySourcePie data={sourceData} loading={loading} />
        <OrderStatusPie data={statusData} loading={loading} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentOrdersTable orders={allOrders} inventory={inventory} loading={loading} />
        </div>
        <InventoryAlerts items={inventory} loading={loading} />
      </div>

      <BusinessMetrics
        orders={orders}
        allOrders={allOrders}
        inventory={inventory}
        expenses={expenses}
        loading={loading}
        deadProductDays={deadProductDays}
      />
    </div>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? tr('Good morning') : h < 17 ? tr('Good afternoon') : tr('Good evening');
}
