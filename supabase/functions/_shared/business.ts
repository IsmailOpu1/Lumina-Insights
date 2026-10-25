import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Returns a Supabase client acting as the caller (so row level security
 * applies) and the caller's user, or null when the request has no valid
 * session.
 */
export async function getCaller(req: Request): Promise<{ client: SupabaseClient; user: User } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

/**
 * Service-role client for server-only work (payment records, activation).
 * Bypasses row level security — never use it with user-supplied filters.
 */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Public app URL for redirects back from the payment gateway. */
export function appUrl() {
  return (Deno.env.get("SITE_URL") || "https://lumina-insights-ashen.vercel.app").replace(/\/$/, "");
}

interface Snapshot {
  period: { from: string | null; to: string };
  business: { name: string | null; type: string | null; description: string | null; currency: string };
  revenue: number;
  net_profit: number;
  margin_pct: number;
  orders: number;
  cancelled_orders: number;
  expenses: number;
  ad_spend: number;
  roas: number | null;
  top_products: { name: string; units: number; revenue: number; profit: number }[];
  sales_by_channel: { channel: string; orders: number; revenue: number }[];
  low_stock: { name: string; stock: number; threshold: number }[];
  inventory: { products: number; value: number };
  daily: { date: string; orders: number; revenue: number; profit: number }[];
}

/** Business numbers for the caller's workspace, computed by the database. */
export async function fetchSnapshot(client: SupabaseClient, from?: string | null, to?: string | null) {
  const { data, error } = await client.rpc("business_snapshot", { p_from: from ?? null, p_to: to ?? null });
  if (error) throw new Error(`business_snapshot failed: ${error.message}`);
  return data as Snapshot;
}

const SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

export function currencySymbol(s: Snapshot) {
  return SYMBOLS[s.business.currency] ?? "৳";
}

/** The business profile block shared by every prompt. */
export function describeBusiness(s: Snapshot) {
  const b = s.business;
  return `BUSINESS PROFILE:
Name: ${b.name || "N/A"}
Type: ${b.type || "N/A"}
Description: ${b.description || "N/A"}
Currency: ${b.currency} (${currencySymbol(s)})`;
}

/** A plain-text summary of the snapshot for use in prompts. */
export function describeSnapshot(s: Snapshot) {
  const c = currencySymbol(s);
  const money = (n: number) => `${c}${Math.round(n).toLocaleString("en-US")}`;
  const period = s.period.from ? `${s.period.from} to ${s.period.to}` : `all time to ${s.period.to}`;
  const list = <T>(items: T[], fmt: (i: T) => string) => (items.length ? items.map((i) => `- ${fmt(i)}`).join("\n") : "- none");

  return `${describeBusiness(s)}

BUSINESS DATA (${period}; cancelled orders excluded):
Revenue: ${money(s.revenue)}
Net profit (after product cost, shipping, ad costs and expenses): ${money(s.net_profit)}
Net margin: ${s.margin_pct}%
Orders: ${s.orders} (plus ${s.cancelled_orders} cancelled)
Expenses: ${money(s.expenses)}
Ad spend: ${money(s.ad_spend)}${s.roas !== null ? `, ROAS ${s.roas}x` : ""}
Inventory: ${s.inventory.products} products worth ${money(s.inventory.value)} at cost

Top products by units sold:
${list(s.top_products, (p) => `${p.name}: ${p.units} units, ${money(p.revenue)} revenue, ${money(p.profit)} profit`)}

Sales by channel:
${list(s.sales_by_channel, (ch) => `${ch.channel}: ${ch.orders} orders, ${money(ch.revenue)}`)}

Low stock (below threshold):
${list(s.low_stock, (l) => `${l.name}: ${l.stock} left (threshold ${l.threshold})`)}

Daily sales (days with orders):
${list(s.daily, (d) => `${d.date}: ${d.orders} orders, ${money(d.revenue)} revenue, ${money(d.profit)} profit`)}`;
}

export type QuotaMetric = "ai_chat" | "insights" | "marketing";

const QUOTA_MESSAGES: Record<string, { status: number; error: string }> = {
  subscription_inactive: {
    status: 402,
    error: "Your plan has expired, so AI features are paused. Choose a plan on the Billing page to continue.",
  },
  plan_limit_ai_chat: {
    status: 429,
    error: "You've used today's AI assistant questions on your plan. They reset at midnight, or upgrade to Pro for more.",
  },
  plan_limit_insights: {
    status: 429,
    error: "You've used today's AI insights on your plan. They reset at midnight, or upgrade to Pro for more.",
  },
  plan_limit_marketing: {
    status: 429,
    error: "You've used this month's Marketing AI generations. Upgrade to Pro for unlimited content.",
  },
};

/**
 * Counts one use of an AI feature against the workspace's plan. Returns null
 * when allowed, or a ready-to-send error response when the plan is expired
 * or the limit is reached.
 */
export async function consumeQuota(client: SupabaseClient, metric: QuotaMetric): Promise<Response | null> {
  const { error } = await client.rpc("consume_ai_quota", { p_metric: metric });
  if (!error) return null;
  const known = Object.keys(QUOTA_MESSAGES).find((code) => error.message.includes(code));
  if (known) return json({ error: QUOTA_MESSAGES[known].error, code: known }, QUOTA_MESSAGES[known].status);
  throw new Error(`consume_ai_quota failed: ${error.message}`);
}

/**
 * Gives back a use counted by consumeQuota when the AI call then failed, so
 * customers aren't charged for errors. Never throws: a failed refund is only
 * logged, since the caller is already returning an error.
 */
export async function refundQuota(userId: string, metric: QuotaMetric) {
  const { error } = await adminClient().rpc("refund_ai_quota", { p_user: userId, p_metric: metric });
  if (error) console.error("refund_ai_quota failed:", error.message);
}

/** YYYY-MM-DD for `days` days before today (UTC). */
export function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
