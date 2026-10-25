import { adminClient, corsHeaders, getCaller, json } from "../_shared/business.ts";
import { createSession } from "../_shared/sslcommerz.ts";

// Starts an SSLCommerz checkout for the caller's workspace. Only the owner
// can pay; the price always comes from the plans table, never the request.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { plan, billing_period } = await req.json();
    if (!["starter", "pro"].includes(plan) || !["monthly", "yearly"].includes(billing_period)) {
      return json({ error: "Choose a plan and billing period" }, 400);
    }

    const { data: sub, error: subError } = await caller.client.rpc("get_my_subscription");
    if (subError) throw new Error(subError.message);
    if (!sub?.is_owner) return json({ error: "Only the workspace owner can manage billing" }, 403);

    // Switching down would cut short Pro time already paid for.
    if (plan === "starter" && sub.state === "active" && sub.plan === "pro") {
      return json({ error: "You're on Pro until your current period ends. You can switch to Starter after that." }, 409);
    }

    const { data: planRow } = await caller.client
      .from("plans")
      .select("name, monthly_price, yearly_price")
      .eq("id", plan)
      .single();
    if (!planRow) return json({ error: "Unknown plan" }, 400);

    const amount = Number(billing_period === "yearly" ? planRow.yearly_price : planRow.monthly_price);
    const tranId = `LUM-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const admin = adminClient();
    const { error: insertError } = await admin.from("payments").insert({
      owner_id: caller.user.id,
      tran_id: tranId,
      plan,
      billing_period,
      amount,
    });
    if (insertError) throw new Error(insertError.message);

    const { data: settings } = await caller.client
      .from("user_settings")
      .select("business_name, full_name")
      .eq("user_id", caller.user.id)
      .maybeSingle();

    const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
    const gatewayUrl = await createSession({
      tranId,
      amount,
      productName: `Lumina ${planRow.name} (${billing_period})`,
      customerName: settings?.full_name || settings?.business_name || caller.user.email || "Lumina customer",
      customerEmail: caller.user.email ?? "",
      returnUrl: `${functionsUrl}/payment-return`,
      ipnUrl: `${functionsUrl}/sslcommerz-ipn`,
    });

    return json({ url: gatewayUrl });
  } catch (e) {
    console.error("create-payment error:", e);
    return json({ error: "Could not start the payment. Please try again." }, 500);
  }
});
