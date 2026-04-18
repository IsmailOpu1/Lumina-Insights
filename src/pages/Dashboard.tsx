import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardData, computeKPIs, getRevenueBySource, getOrdersByStatus, getTopProducts } from '@/hooks/useDashboardData';
import { formatTaka } from '@/lib/constants';
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

export default function Dashboard() {
  const { orders, inventory, expenses, loading, refetch } = useDashboardData();
  const [allOrders, setAllOrders] = useState<typeof orders>([]);
  const [deadProductDays, setDeadProductDays] = useState(30);
  const [roasThreshold, setRoasThreshold] = useState(2.0);

  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      setAllOrders((data as typeof orders) || []);
    }
    fetchAll();
  }, [orders]);

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase.from('user_settings').select('dead_product_days, roas_threshold').limit(1).maybeSingle();
      if (data) {
        if ((data as any).dead_product_days) setDeadProductDays((data as any).dead_product_days);
        if ((data as any).roas_threshold) setRoasThreshold((data as any).roas_threshold);
      }
    }
    fetchSettings();
  }, []);

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

  // Ad cost from orders
  const totalOrderAdCost = orders.reduce((s, o) => s + ((o as any).ad_cost ?? 0), 0);

  // Avg Ad Cost per Order
  const avgAdCostPerOrder = kpis.totalOrders > 0 ? kpis.adSpend / kpis.totalOrders : 0;

  // ROAS
  const roas = kpis.adSpend > 0 ? kpis.totalRevenue / kpis.adSpend : Infinity;

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
      subValue: kpis.topCustomer ? formatTaka(kpis.topCustomer.revenue) : undefined,
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
      tooltip: `Revenue per ৳1 spent on ads. Your threshold: ${roasThreshold}x. Higher is better.`,
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
          orderAdCost={totalOrderAdCost}
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
