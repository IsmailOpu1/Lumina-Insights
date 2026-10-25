import { adminClient } from "./business.ts";
import { validatePayment } from "./sslcommerz.ts";

/**
 * Validates a payment with SSLCommerz and, if it is genuine and matches our
 * record, activates the subscription. Safe to call more than once for the
 * same payment (the return redirect and the IPN both call it).
 */
export async function confirmPayment(tranId: string, valId: string): Promise<boolean> {
  const payment = await validatePayment(valId);
  if (!payment || payment.tranId !== tranId) {
    console.warn("Payment failed validation", { tranId, valId });
    return false;
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
    return false;
  }
  return true;
}

/** Records a failed or cancelled attempt (only if it's still pending). */
export async function markPayment(tranId: string, status: "failed" | "cancelled") {
  await adminClient().from("payments").update({ status }).eq("tran_id", tranId).eq("status", "pending");
}
