import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useFilter } from '@/context/FilterContext';
import { Button } from '@/components/ui/button';
import { useDashboardData, computeKPIs, getRevenueBySource, getOrdersByStatus, getTopProducts } from '@/hooks/useDashboardData';
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
import ProfitCalculator from '@/components/dashboard/ProfitCalculator';
import { useCurrency } from '@/hooks/useCurrency';
import { format, min, parseISO, startOfWeek, subDays, subWeeks } from 'date-fns';
import {
  AlertTriangle, CalendarSearch, Crown, Gauge, Megaphone, Package, Percent, Repeat, ShoppingBag, TrendingUp, Wallet,
} from 'lucide-react';

export default function Dashboard() {
  const { formatCurrency, symbol } = useCurrency();
  const { orders, inventory, expenses, loading, refetch } = useDashboardData();
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
      const { data } = await supabase
        .from('orders')
        .select('*')
        .gte('date', format(since, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });
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
  const sourceData = getRevenueBySource(orders);
  const statusData = getOrdersByStatus(orders);
  const topProducts = getTopProducts(orders, inventory);

  // Ad spend counts both ad expenses and per-order ad costs.
  const avgAdCostPerOrder = kpis.totalOrders > 0 ? kpis.totalAdSpend / kpis.totalOrders : 0;
  const roas = kpis.totalAdSpend > 0 ? kpis.totalRevenue / kpis.totalAdSpend : Infinity;

  const primaryKpis: KPI[] = [
    { label: 'Revenue', value: kpis.totalRevenue, format: 'taka', icon: TrendingUp },
    {
      label: 'Net profit',
      value: kpis.netProfit,
      format: 'taka',
      icon: Wallet,
      tone: kpis.netProfit >= 0 ? 'positive' : 'negative',
      subValue: `${kpis.profitMargin.toFixed(1)}% margin`,
    },
    { label: 'Orders', value: kpis.totalOrders, format: 'number', icon: ShoppingBag, subValue: `${kpis.repeatCustomers} repeat customer${kpis.repeatCustomers === 1 ? '' : 's'}` },
    { label: 'Inventory value', value: kpis.inventoryValue, format: 'taka', icon: Package, subValue: 'At cost price' },
  ];

  const secondaryKpis: KPI[] = [
    { label: 'Profit margin', value: kpis.profitMargin, format: 'percent', icon: Percent },
    {
      label: 'Low stock',
      value: kpis.lowStockItems.length,
      format: 'number',
      icon: AlertTriangle,
      tone: kpis.lowStockItems.length > 0 ? 'warning' : undefined,
    },
    { label: 'Repeat customers', value: kpis.repeatCustomers, format: 'number', icon: Repeat },
    {
      label: 'Top customer',
      value: 0,
      format: 'name',
      icon: Crown,
      nameValue: kpis.topCustomer?.name,
      subValue: kpis.topCustomer ? formatCurrency(kpis.topCustomer.revenue) : undefined,
    },
    {
      label: 'Ad cost / order',
      value: avgAdCostPerOrder,
      format: 'taka',
      icon: Megaphone,
      tooltip: 'Average ad spend to win each order in this period',
    },
    {
      label: 'ROAS',
      value: roas,
      format: 'roas',
      icon: Gauge,
      tone: roas >= roasThreshold ? 'positive' : 'negative',
      tooltip: `Revenue per ${symbol}1 spent on ads. Your target: ${roasThreshold}x.`,
    },
  ];

  const name = userSettings?.full_name?.split(' ')[0] || userSettings?.business_name;

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="page-subtitle">Here's how your business is doing · {format(new Date(), 'EEEE, d MMMM')}</p>
        </div>
        <DateFilterBar />
      </header>

      {periodEmpty && latestSale && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CalendarSearch size={16} className="shrink-0 text-primary" />
            No sales in this period. Your latest sale was on {format(parseISO(latestSale), 'd MMMM yyyy')}.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDateFilter('all')}>Show all time</Button>
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

      <ProfitCalculator />
    </div>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
