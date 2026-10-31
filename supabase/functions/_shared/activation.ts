import { adminClient } from "./business.ts";
import { validatePayment } from "./sslcommerz.ts";

/**
 * Validates a payment with SSLCommerz and, if it is genuine and matches our
 * record, activates the subscription. Safe to call more than once for the
 * same payment (the return redirect and the IPN both call it).
 */
export async function confirmPayment(tranId: string, valId: string): Promise<"activated" | "review" | "invalid"> {
  const payment = await validatePayment(valId);
  if (!payment || payment.tranId !== tranId) {
    console.warn("Payment failed validation", { tranId, valId });
    return "invalid";
  }

  if (payment.flagged) {
    // Money was taken, so keep a visible record instead of leaving it pending.
    console.warn("Payment flagged by SSLCommerz, held for review", { tranId, valId });
    await adminClient().from("payments")
      .update({ status: "review", val_id: payment.valId, card_type: payment.cardType, gateway_response: payment.raw })
      .eq("tran_id", tranId).in("status", ["pending", "failed", "cancelled"]);
    return "review";
  }

  const { error } = await adminClient().rpc("activate_payment", {
    p_tran_id: payment.tranId,
    p_val_id: payment.valId,
    p_amount: payment.amount,
    p_card_type: payment.cardType,
    p_response: payment.raw,
  });
  if (error) {
    console.error("activate_payment failed", { tranId, error: error.message });
    return "invalid";
  }
  return "activated";
}

/** Records a failed or cancelled attempt (only if it's still pending). */
export async function markPayment(tranId: string, status: "failed" | "cancelled") {
  await adminClient().from("payments").update({ status }).eq("tran_id", tranId).eq("status", "pending");
}
