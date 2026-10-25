// Friendly messages for exceptions raised by database triggers and plan checks.
const MESSAGES: Record<string, string> = {
  insufficient_stock: 'Not enough stock for this order. Restock the product or lower the quantity.',
  product_not_in_workspace: 'That product does not belong to this workspace.',
  subscription_inactive: 'Your plan has expired, so this workspace is read-only. Choose a plan on the Billing page to keep working.',
  plan_limit_orders: "You've reached your plan's monthly order limit. Upgrade to Pro for unlimited orders.",
  plan_limit_team: "You've reached your plan's team member limit. Upgrade to Pro to invite more people.",
};

export function dbErrorMessage(message: string): string {
  const code = Object.keys(MESSAGES).find((k) => message.includes(k));
  return code ? MESSAGES[code] : message;
}

/**
 * The message an edge function sent with a non-2xx response, e.g. an AI
 * quota or expired-plan explanation. Falls back to `fallback`.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Not a JSON error body.
    }
  }
  return fallback;
}
