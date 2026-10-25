import { confirmPayment } from "../_shared/activation.ts";

// SSLCommerz's server-to-server payment notification. It still arrives if
// the customer closes the tab before returning, so payments always activate.
// The posted data is only used to look the payment up; SSLCommerz's
// validation API decides whether it is real.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const form = await req.formData();
    const tranId = String(form.get("tran_id") ?? "");
    const valId = String(form.get("val_id") ?? "");
    const status = String(form.get("status") ?? "");

    if (tranId && valId && status === "VALID") {
      await confirmPayment(tranId, valId);
    }
  } catch (e) {
    console.error("sslcommerz-ipn error:", e);
  }

  // Always acknowledge so SSLCommerz doesn't retry endlessly; failures are logged.
  return new Response("OK");
});
