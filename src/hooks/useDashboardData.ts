import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFilter } from '@/context/FilterContext';
import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { parseDay } from '@/lib/dates';
import { useRefreshOnSave } from '@/context/FABContext';
import { fetchAll } from '@/lib/fetchAll';
import { useCachedState } from '@/lib/pageCache';
import { countsForProfit, isSale } from '@/lib/constants';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  selling_price: number;
  unit_cost: number;
  shipping_cost: number;
  ad_cost: number;
  source: string;
  status: string;
  date: string;
  profit_per_order: number;
  created_at: string;
}

interface InventoryItem {
  id: string;
  product_name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  supplier: string;
  created_at: string;
}

interface Expense {
  id: string;
  type: string;
  amount: number;
  platform: string;
  notes: string;
  date: string;
  created_at: string;
}

export interface DashboardData {
  orders: Order[];
  inventory: InventoryItem[];
  expenses: Expense[];
  /** The same number of days just before the period, to compare with; null for today and all time. */
  previous: { orders: Order[]; expenses: Expense[]; days: number } | null;
  loading: boolean;
  refetch: () => void;
}

/** The days just before [from, to], as many as the period has. */
export function previousPeriod(from: Date, to: Date) {
  const days = differenceInCalendarDays(to, from) + 1;
  const start = startOfDay(from);
  return { from: addDays(start, -days), to: addDays(start, -1), days };
}

/** Change from prev to cur in percent, or null when there is nothing to compare with. */
export function percentChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/**
 * Sales already delivered, and sales whose cash (mostly cash on delivery)
 * is still to come: pending, processing and shipped orders.
 */
export function getCollection(orders: { status: string; selling_price: number; quantity: number }[]) {
  let delivered = 0;
  let toCollect = 0;
  for (const o of orders) {
    if (!isSale(o.status)) continue;
    const amount = o.selling_price * o.quantity;
    if (o.status === 'Delivered') delivered += amount;
    else toCollect += amount;
  }
  return { delivered, toCollect };
}

type Loaded = Omit<DashboardData, 'loading' | 'refetch'>;

const EMPTY: Loaded = { orders: [], inventory: [], expenses: [], previous: null };

export function useDashboardData(): DashboardData {
  const { getDateRange, dateFilter } = useFilter();
  // Remembered per period, so switching back to a period shows it at once.
  const period = getDateRange();
  const [data, setData] = useCachedState<Loaded | null>(
    `dashboard:${dateFilter}:${format(period.from, 'yyyy-MM-dd')}:${format(period.to, 'yyyy-MM-dd')}`, null);

  const fetchData = useCallback(async () => {
    const { from, to } = getDateRange();
    const fromStr = format(from, 'yyyy-MM-dd');
    const toStr = format(to, 'yyyy-MM-dd');
    // Today is half a day against a whole one, and all time has nothing before it.
    const prev = dateFilter === 'today' || dateFilter === 'all' ? null : previousPeriod(from, to);
    const prevFrom = prev && format(prev.from, 'yyyy-MM-dd');
    const prevTo = prev && format(prev.to, 'yyyy-MM-dd');

    const [ordersRes, inventoryRes, expensesRes, prevOrdersRes, prevExpensesRes] = await Promise.all([
      fetchAll((a, b) => supabase.from('orders').select('*').gte('date', fromStr).lte('date', toStr)
        .order('created_at', { ascending: false }).order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('inventory').select('*').order('id').range(a, b)),
      fetchAll((a, b) => supabase.from('expenses').select('*').gte('date', fromStr).lte('date', toStr).order('id').range(a, b)),
      prev ? fetchAll((a, b) => supabase.from('orders').select('*').gte('date', prevFrom).lte('date', prevTo).order('id').range(a, b)) : null,
      prev ? fetchAll((a, b) => supabase.from('expenses').select('*').gte('date', prevFrom).lte('date', prevTo).order('id').range(a, b)) : null,
    ]);

    setData({
      orders: (ordersRes.data as Order[]) || [],
      inventory: (inventoryRes.data as InventoryItem[]) || [],
      expenses: (expensesRes.data as Expense[]) || [],
      previous: prev && prevOrdersRes && prevExpensesRes && !prevOrdersRes.error && !prevExpensesRes.error
        ? { orders: (prevOrdersRes.data as Order[]) || [], expenses: (prevExpensesRes.data as Expense[]) || [], days: prev.days }
        : null,
    });
  }, [getDateRange, dateFilter, setData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useRefreshOnSave('order', fetchData);
  useRefreshOnSave('expense', fetchData);
  useRefreshOnSave('product', fetchData);

  return { ...(data ?? EMPTY), loading: data === null, refetch: fetchData };
}

// Sales only: cancelled and returned orders earn nothing.
export function activeOrders<T extends { status: string }>(orders: T[]): T[] {
  return orders.filter(o => isSale(o.status));
}

// Computed helpers
export function computeKPIs(allOrders: Order[], inventory: InventoryItem[], expenses: Expense[]) {
  const orders = activeOrders(allOrders);
  const totalRevenue = orders.reduce((s, o) => s + o.selling_price * o.quantity, 0);
  const inventoryMap = new Map(inventory.map(i => [i.id, i]));
  // unit_cost is the product cost captured when the order was placed.
  const cogs = orders.reduce((s, o) => s + (o.unit_cost ?? 0) * o.quantity, 0);
  // Returned orders were still delivered and advertised: those costs count.
  const returned = allOrders.filter(o => o.status === 'Returned');
  const costed = allOrders.filter(o => countsForProfit(o.status));
  const orderShipping = costed.reduce((s, o) => s + o.shipping_cost, 0);
  const orderAdCost = costed.reduce((s, o) => s + (o.ad_cost ?? 0), 0);
  const returnLoss = returned.reduce((s, o) => s + o.shipping_cost + (o.ad_cost ?? 0), 0);
  const returnRate = orders.length + returned.length > 0 ? returned.length / (orders.length + returned.length) * 100 : 0;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - cogs - orderShipping - orderAdCost - totalExpenses;
  const totalOrders = orders.length;
  const inventoryValue = inventory.reduce((s, i) => s + i.stock_quantity * i.cost_price, 0);
  const lowStockItems = inventory.filter(i => i.stock_quantity < i.low_stock_threshold);
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Repeat customers
  const customerCounts: Record<string, number> = {};
  orders.forEach(o => { customerCounts[o.customer_name] = (customerCounts[o.customer_name] || 0) + 1; });
  const repeatCustomers = Object.values(customerCounts).filter(c => c >= 2).length;

  // Top customer
  const customerRevenue: Record<string, number> = {};
  orders.forEach(o => { customerRevenue[o.customer_name] = (customerRevenue[o.customer_name] || 0) + o.selling_price * o.quantity; });
  const topCustomerEntry = Object.entries(customerRevenue).sort((a, b) => b[1] - a[1])[0];
  const topCustomer = topCustomerEntry ? { name: topCustomerEntry[0], revenue: topCustomerEntry[1] } : null;

  const adSpend = expenses.filter(e => e.type === 'Ad Spend').reduce((s, e) => s + e.amount, 0);
  const shippingExpense = expenses.filter(e => e.type === 'Shipping').reduce((s, e) => s + e.amount, 0);
  const miscExpense = expenses.filter(e => e.type === 'Miscellaneous').reduce((s, e) => s + e.amount, 0);
  const totalShipping = orderShipping + shippingExpense;
  const totalAdSpend = adSpend + orderAdCost;

  return {
    totalRevenue, netProfit, totalOrders, inventoryValue,
    lowStockItems, profitMargin, repeatCustomers, topCustomer,
    cogs, totalShipping, adSpend, orderAdCost, totalAdSpend, shippingExpense, miscExpense, totalExpenses,
    returnedOrders: returned.length, returnLoss, returnRate,
    inventoryMap,
  };
}

export function getRevenueBySource(orders: Order[]) {
  const map: Record<string, number> = {};
  activeOrders(orders).forEach(o => {
    const src = o.source || 'Unknown';
    map[src] = (map[src] || 0) + o.selling_price * o.quantity;
  });
  return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
}

export function getOrdersByStatus(orders: Order[]) {
  const map: Record<string, number> = {};
  orders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

/**
 * Every product's units sold, revenue and profit. Profit is each order's own
 * profit (after product cost, delivery and the order's ad cost), so a
 * returned order's lost delivery and ads count against its product. General
 * expenses aren't split between products.
 */
export function getTopProducts(orders: Order[], inventory: InventoryItem[]) {
  const invMap = new Map(inventory.map(i => [i.id, i]));
  const productData: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  orders.filter(o => countsForProfit(o.status)).forEach(o => {
    const inv = o.product_id ? invMap.get(o.product_id) : null;
    const name = inv?.product_name || o.product_name || 'Unknown';
    if (!productData[name]) productData[name] = { name, qty: 0, revenue: 0, profit: 0 };
    productData[name].profit += o.profit_per_order ?? 0;
    if (!isSale(o.status)) return;
    productData[name].qty += o.quantity;
    productData[name].revenue += o.selling_price * o.quantity;
  });
  return Object.values(productData).sort((a, b) => b.qty - a.qty);
}

export interface Channel {
  source: string;
  orders: number;
  cancelled: number;
  returned: number;
  /** Cancelled and returned, as a percent of all orders from this source. */
  lostRate: number;
  revenue: number;
  profit: number;
}

/** Each source's orders, how many were cancelled or returned, and what it earned after them. Most profitable first. */
export function getChannels(orders: Pick<Order, 'source' | 'status' | 'selling_price' | 'quantity' | 'profit_per_order'>[]): Channel[] {
  const map = new Map<string, Channel>();
  for (const o of orders) {
    const source = o.source || 'Unknown';
    let c = map.get(source);
    if (!c) map.set(source, c = { source, orders: 0, cancelled: 0, returned: 0, lostRate: 0, revenue: 0, profit: 0 });
    c.orders += 1;
    if (o.status === 'Cancelled') c.cancelled += 1;
    if (o.status === 'Returned') c.returned += 1;
    if (isSale(o.status)) c.revenue += o.selling_price * o.quantity;
    if (countsForProfit(o.status)) c.profit += o.profit_per_order ?? 0;
  }
  return [...map.values()]
    .map(c => ({ ...c, lostRate: ((c.cancelled + c.returned) / c.orders) * 100 }))
    .sort((a, b) => b.profit - a.profit);
}

export function getRevenueOverTime(
  orders: Pick<Order, 'date' | 'selling_price' | 'quantity' | 'status'>[],
  granularity: 'daily' | 'weekly' | 'monthly'
) {
  const map: Record<string, number> = {};
  activeOrders(orders).forEach(o => {
    let key: string;
    const d = parseDay(o.date);
    if (granularity === 'daily') {
      key = format(d, 'MMM dd');
    } else if (granularity === 'weekly') {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = format(weekStart, 'MMM dd');
    } else {
      key = format(d, 'MMM yyyy');
    }
    map[key] = (map[key] || 0) + o.selling_price * o.quantity;
  });
  return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
}
