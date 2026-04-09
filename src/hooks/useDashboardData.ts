import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFilter } from '@/context/FilterContext';
import { format } from 'date-fns';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  product_id: string | null;
  quantity: number;
  selling_price: number;
  shipping_cost: number;
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
  loading: boolean;
  refetch: () => void;
}

export function useDashboardData(): DashboardData {
  const { getDateRange } = useFilter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    const fromStr = format(from, 'yyyy-MM-dd');
    const toStr = format(to, 'yyyy-MM-dd');

    const [ordersRes, inventoryRes, expensesRes] = await Promise.all([
      supabase.from('orders').select('*').gte('date', fromStr).lte('date', toStr).order('created_at', { ascending: false }),
      supabase.from('inventory').select('*'),
      supabase.from('expenses').select('*').gte('date', fromStr).lte('date', toStr),
    ]);

    setOrders((ordersRes.data as Order[]) || []);
    setInventory((inventoryRes.data as InventoryItem[]) || []);
    setExpenses((expensesRes.data as Expense[]) || []);
    setLoading(false);
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { orders, inventory, expenses, loading, refetch: fetchData };
}

// Computed helpers
export function computeKPIs(orders: Order[], inventory: InventoryItem[], expenses: Expense[]) {
  const totalRevenue = orders.reduce((s, o) => s + o.selling_price * o.quantity, 0);
  const inventoryMap = new Map(inventory.map(i => [i.id, i]));
  const cogs = orders.reduce((s, o) => {
    const inv = o.product_id ? inventoryMap.get(o.product_id) : null;
    return s + (inv?.cost_price ?? 0) * o.quantity;
  }, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - cogs - totalExpenses;
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

  // Shipping costs from orders
  const totalShipping = orders.reduce((s, o) => s + o.shipping_cost, 0);

  // Ad spend
  const adSpend = expenses.filter(e => e.type === 'Ad Spend').reduce((s, e) => s + e.amount, 0);
  const shippingExpense = expenses.filter(e => e.type === 'Shipping').reduce((s, e) => s + e.amount, 0);
  const miscExpense = expenses.filter(e => e.type === 'Miscellaneous').reduce((s, e) => s + e.amount, 0);

  return {
    totalRevenue, netProfit, totalOrders, inventoryValue,
    lowStockItems, profitMargin, repeatCustomers, topCustomer,
    cogs, totalShipping, adSpend, shippingExpense, miscExpense, totalExpenses,
    inventoryMap,
  };
}

export function getRevenueBySource(orders: Order[]) {
  const map: Record<string, number> = {};
  orders.forEach(o => {
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

export function getTopProducts(orders: Order[], inventory: InventoryItem[]) {
  const invMap = new Map(inventory.map(i => [i.id, i]));
  const productData: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach(o => {
    const inv = o.product_id ? invMap.get(o.product_id) : null;
    const name = inv?.product_name || 'Unknown';
    if (!productData[name]) productData[name] = { name, qty: 0, revenue: 0 };
    productData[name].qty += o.quantity;
    productData[name].revenue += o.selling_price * o.quantity;
  });
  return Object.values(productData).sort((a, b) => b.qty - a.qty).slice(0, 8);
}

export function getRevenueOverTime(orders: Order[], granularity: 'daily' | 'weekly' | 'monthly') {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    let key: string;
    const d = new Date(o.date);
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
