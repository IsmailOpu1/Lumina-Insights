import { differenceInCalendarDays, endOfMonth, format, getDate, getDaysInMonth, startOfMonth, subDays } from 'date-fns';
import { parseDay } from '@/lib/dates';
import { countsForProfit, isSale } from '@/lib/constants';

/**
 * Where this month is heading: the month so far plus the shop's recent daily
 * pace for the days left. The pace is the last 30 full days (today is only
 * half over), so the forecast works from the 1st of the month. The range is
 * one standard deviation of a day's takings, grown over the days left: about
 * two months in three should land inside it.
 */

export const PACE_DAYS = 30;
/** Fewer days of history than this, or fewer sales, is too little to forecast. */
const MIN_HISTORY_DAYS = 7;
const MIN_SALES = 5;

export interface ForecastOrder {
  date: string;
  status: string;
  selling_price: number;
  quantity: number;
  profit_per_order: number | null;
}

export interface ForecastExpense {
  date: string;
  amount: number;
}

export interface Range { low: number; mid: number; high: number }

export interface MonthForecast {
  monthStart: Date;
  daysLeft: number;
  revenueSoFar: number;
  profitSoFar: number;
  /** Null when there is too little history to say. */
  revenue: Range | null;
  profit: Range | null;
}

export interface GoalProgress {
  target: number;
  pct: number;
  reached: boolean;
  /** Revenue needed each remaining day, today included; null once reached. */
  perDay: number | null;
  /** Whether the forecast's middle reaches the goal. */
  onTrack: boolean | null;
}

const revenueOf = (o: ForecastOrder) => (isSale(o.status) ? o.selling_price * o.quantity : 0);
const profitOf = (o: ForecastOrder) => (countsForProfit(o.status) ? o.profit_per_order ?? 0 : 0);

function spread(values: number[]) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * `orders` and `expenses` must cover this month and the 30 days before
 * today. `firstSale` is the shop's first order date, so a shop younger than
 * 30 days isn't averaged over days it didn't exist.
 */
export function forecastMonth(
  orders: ForecastOrder[],
  expenses: ForecastExpense[],
  firstSale: string | null,
  now = new Date(),
): MonthForecast {
  const today = format(now, 'yyyy-MM-dd');
  const monthStart = startOfMonth(now);
  const monthKey = format(monthStart, 'yyyy-MM-dd');
  const daysLeft = getDaysInMonth(now) - getDate(now);

  const thisMonth = orders.filter((o) => o.date >= monthKey && o.date <= today);
  const revenueSoFar = thisMonth.reduce((s, o) => s + revenueOf(o), 0);
  const profitSoFar = thisMonth.reduce((s, o) => s + profitOf(o), 0)
    - expenses.filter((e) => e.date >= monthKey && e.date <= today).reduce((s, e) => s + e.amount, 0);

  // Daily takings over the full days before today, as far back as the shop goes.
  const history = firstSale ? Math.min(PACE_DAYS, differenceInCalendarDays(now, parseDay(firstSale))) : 0;
  const days = Array.from({ length: history }, (_, i) => format(subDays(now, i + 1), 'yyyy-MM-dd'));
  const inPace = new Set(days);
  const sales = orders.filter((o) => inPace.has(o.date) && isSale(o.status)).length;

  if (history < MIN_HISTORY_DAYS || sales < MIN_SALES) {
    return { monthStart, daysLeft, revenueSoFar, profitSoFar, revenue: null, profit: null };
  }

  const dailyRevenue = new Map<string, number>(days.map((d) => [d, 0]));
  const dailyProfit = new Map<string, number>(days.map((d) => [d, 0]));
  for (const o of orders) {
    if (!inPace.has(o.date)) continue;
    dailyRevenue.set(o.date, dailyRevenue.get(o.date)! + revenueOf(o));
    dailyProfit.set(o.date, dailyProfit.get(o.date)! + profitOf(o));
  }
  for (const e of expenses) {
    if (inPace.has(e.date)) dailyProfit.set(e.date, dailyProfit.get(e.date)! - e.amount);
  }

  const project = (soFar: number, daily: number[], floor: number | null): Range => {
    const { mean, sd } = spread(daily);
    const mid = soFar + mean * daysLeft;
    const margin = sd * Math.sqrt(daysLeft);
    return { low: floor === null ? mid - margin : Math.max(floor, mid - margin), mid, high: mid + margin };
  };

  return {
    monthStart,
    daysLeft,
    revenueSoFar,
    profitSoFar,
    // Revenue can't fall below what's already sold.
    revenue: project(revenueSoFar, [...dailyRevenue.values()], revenueSoFar),
    profit: project(profitSoFar, [...dailyProfit.values()], null),
  };
}

export function goalProgress(target: number, forecast: MonthForecast, now = new Date()): GoalProgress {
  const reached = forecast.revenueSoFar >= target;
  // Today still counts as a day to sell.
  const daysToSell = differenceInCalendarDays(endOfMonth(now), now) + 1;
  return {
    target,
    pct: Math.min(100, (forecast.revenueSoFar / target) * 100),
    reached,
    perDay: reached ? null : (target - forecast.revenueSoFar) / daysToSell,
    onTrack: forecast.revenue ? forecast.revenue.mid >= target : null,
  };
}
