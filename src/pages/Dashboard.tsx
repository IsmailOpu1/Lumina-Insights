import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useDashboardData, computeKPIs, getRevenueBySource, getOrdersByStatus, getTopProducts } from '@/hooks/useDashboardData';
import DateFilterBar from '@/components/dashboard/DateFilterBar';
import KPICards from '@/components/dashboard/KPICards';
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
import { format, min, startOfWeek, subDays, subWeeks } from 'date-fns';

export default function Dashboard() {
  const { formatCurrency, symbol } = useCurrency();
  const { orders, inventory, expenses, loading, refetch } = useDashboardData();
  const { ownerIdForQueries } = useAuth();
  const [allOrders, setAllOrders] = useState<typeof orders>([]);
  const [deadProductDays, setDeadProductDays] = useState(30);
  const [roasThreshold, setRoasThreshold] = useState(2.0);

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

  const bestSource = sourceData.length > 0
    ? sourceData.sort((a, b) => b.value - a.value)[0]
    : null;
  const totalSourceRev = sourceData.reduce((s, d) => s + d.value, 0);
  const bestSourceLabel = bestSource && totalSourceRev > 0
    ? `${bestSource.name} ${Math.round((bestSource.value / totalSourceRev) * 100)}%`
    : '—';

  const topProductName = topProducts.length > 0 ? topProducts[0].name : '—';

  // Ad spend counts both ad expenses and per-order ad costs.
  const avgAdCostPerOrder = kpis.totalOrders > 0 ? kpis.totalAdSpend / kpis.totalOrders : 0;
  const roas = kpis.totalAdSpend > 0 ? kpis.totalRevenue / kpis.totalAdSpend : Infinity;

  const kpiCards = [
    { label: 'Total Revenue', value: kpis.totalRevenue, format: 'taka' as const },
    { label: 'Net Profit', value: kpis.netProfit, format: 'taka' as const, color: kpis.netProfit >= 0 ? '#10B981' : '#EF4444' },
    { label: 'Total Orders', value: kpis.totalOrders, format: 'number' as const },
    { label: 'Inventory Value', value: kpis.inventoryValue, format: 'taka' as const },
    { label: 'Low Stock Items', value: kpis.lowStockItems.length, format: 'number' as const, color: kpis.lowStockItems.length > 0 ? '#F59E0B' : undefined },
    { label: 'Profit Margin', value: kpis.profitMargin, format: 'percent' as const },
    { label: 'Repeat Customers', value: kpis.repeatCustomers, format: 'number' as const },
    {
      label: 'Top Customer',
      value: 0,
      format: 'name' as const,
      nameValue: kpis.topCustomer?.name,
      subValue: kpis.topCustomer ? formatCurrency(kpis.topCustomer.revenue) : undefined,
    },
    {
      label: 'Avg Ad Cost/Order',
      value: avgAdCostPerOrder,
      format: 'taka' as const,
      color: '#F59E0B',
      tooltip: 'Average ad spend to acquire each order in selected period',
    },
    {
      label: 'ROAS',
      value: roas,
      format: 'roas' as const,
      color: roas >= roasThreshold ? '#4A7C59' : '#EF4444',
      tooltip: `Revenue per ${symbol}1 spent on ads. Your threshold: ${roasThreshold}x. Higher is better.`,
    },
  ];

  return (
    <div>
      <DateFilterBar />
      <KPICards kpis={kpiCards} loading={loading} />
      <RevenueGrowthChart orders={orders} loading={loading} />

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <ProfitBreakdownPie
          revenue={kpis.totalRevenue}
          cogs={kpis.cogs}
          shipping={kpis.totalShipping}
          adSpend={kpis.adSpend}
          orderAdCost={kpis.orderAdCost}
          netProfit={kpis.netProfit}
          loading={loading}
        />
        <SalesBySourcePie data={sourceData} loading={loading} />
      </div>

      <TopSellingProductsBar data={topProducts} loading={loading} />

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <OrderStatusPie data={statusData} loading={loading} />
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

      <RecentOrdersTable orders={allOrders} inventory={inventory} loading={loading} />
      <ProfitCalculator />
    </div>
  );
}
