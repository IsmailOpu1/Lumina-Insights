// SSLCommerz (bKash, Nagad, Rocket, cards) — session creation and the
// server-to-server validation every payment must pass before activation.
//
// Secrets: SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD, and
// SSLCOMMERZ_LIVE=true once the live store is approved (sandbox otherwise).

function config() {
  const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
  const storePassword = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD");
  if (!storeId || !storePassword) throw new Error("SSLCommerz is not configured");
  const live = Deno.env.get("SSLCOMMERZ_LIVE") === "true";
  return {
    storeId,
    storePassword,
    base: live ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com",
  };
}

export interface SessionRequest {
  tranId: string;
  amount: number;
  productName: string;
  customerName: string;
  customerEmail: string;
  returnUrl: string; // payment-return function; ?result= is appended
  ipnUrl: string;
}

/** Starts a checkout session; returns the gateway page URL to redirect to. */
export async function createSession(req: SessionRequest): Promise<string> {
  const { storeId, storePassword, base } = config();
  const form = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: req.amount.toFixed(2),
    currency: "BDT",
    tran_id: req.tranId,
    success_url: `${req.returnUrl}?result=success`,
    fail_url: `${req.returnUrl}?result=fail`,
    cancel_url: `${req.returnUrl}?result=cancel`,
    ipn_url: req.ipnUrl,
    product_name: req.productName,
    product_category: "Software subscription",
    product_profile: "non-physical-goods",
    shipping_method: "NO",
    num_of_item: "1",
    cus_name: req.customerName,
    cus_email: req.customerEmail,
    // Required by SSLCommerz; Lumina doesn't collect a billing address.
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_postcode: "1000",
    cus_country: "Bangladesh",
    cus_phone: "01700000000",
  });

  const res = await fetch(`${base}/gwprocess/v4/api.php`, { method: "POST", body: form });
  const data = await res.json();
  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    throw new Error(`SSLCommerz session failed: ${data.failedreason ?? res.status}`);
  }
  return data.GatewayPageURL as string;
}

export interface ValidatedPayment {
  /** SSLCommerz flagged it as risky: real money, but hold it for review. */
  flagged: boolean;
  tranId: string;
  valId: string;
  amount: number;
  cardType: string;
  raw: Record<string, unknown>;
}

/**
 * Confirms a payment with SSLCommerz itself. The form posted to our return
 * URL and IPN can be forged, so this is the only source we trust.
 * Returns null when the payment is not valid.
 */
export async function validatePayment(valId: string): Promise<ValidatedPayment | null> {
  const { storeId, storePassword, base } = config();
  const url = new URL(`${base}/validator/api/validationserverAPI.php`);
  url.search = new URLSearchParams({
    val_id: valId,
    store_id: storeId,
    store_passwd: storePassword,
    v: "1",
    format: "json",
  }).toString();

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const valid = data.status === "VALID" || data.status === "VALIDATED";
  if (!valid || data.currency_type !== "BDT") return null;

  return {
    // risk_level 1 means SSLCommerz flagged the payment; hold it for review.
    flagged: String(data.risk_level) === "1",
    tranId: String(data.tran_id),
    valId: String(data.val_id),
    amount: Number(data.currency_amount ?? data.amount),
    cardType: String(data.card_type ?? ""),
    raw: data,
  };
}
