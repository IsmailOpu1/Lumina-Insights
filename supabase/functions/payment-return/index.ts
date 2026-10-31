import { appUrl } from "../_shared/business.ts";
import { confirmPayment, markPayment } from "../_shared/activation.ts";

// SSLCommerz sends the customer's browser here (as a form POST) after
// checkout. Nothing in the posted form is trusted: success is confirmed with
// SSLCommerz before activation. Then the customer is sent back to the app.
Deno.serve(async (req) => {
  const result = new URL(req.url).searchParams.get("result");
  let outcome: "success" | "failed" | "cancelled" | "pending" | "review" = result === "cancel" ? "cancelled" : "failed";

  try {
    const form = await req.formData();
    const tranId = String(form.get("tran_id") ?? "");
    const valId = String(form.get("val_id") ?? "");

    if (result === "success" && tranId && valId) {
      const confirmed = await confirmPayment(tranId, valId);
      outcome = confirmed === "activated" ? "success" : confirmed === "review" ? "review" : "pending";
    } else if (tranId) {
      await markPayment(tranId, outcome === "cancelled" ? "cancelled" : "failed");
    }
  } catch (e) {
    console.error("payment-return error:", e);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `${appUrl()}/billing?payment=${outcome}` },
  });
});
