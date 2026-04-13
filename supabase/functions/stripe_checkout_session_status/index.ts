import {
  buildCheckoutPaymentSessionStatusResponse,
  corsHeaders,
  finalizeCheckoutPaymentSession,
  jsonResponse,
  requireAuthenticatedUser,
  verifySessionOwnership,
} from "../_shared/checkout-payment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await requireAuthenticatedUser(authHeader);
    const body = await req.json().catch(() => ({}));
    const checkoutPaymentSessionId =
      typeof body?.checkout_payment_session_id === "string" ? body.checkout_payment_session_id.trim() : "";
    const providerPaymentId =
      typeof body?.provider_payment_id === "string" ? body.provider_payment_id.trim() : "";
    const checkoutSessionId =
      typeof body?.session_id === "string" ? body.session_id.trim() : "";

    if (!checkoutPaymentSessionId && !providerPaymentId && !checkoutSessionId) {
      return jsonResponse({ error: "Missing checkout payment session identifier" }, 400);
    }

    const ownedSession = await verifySessionOwnership(user.id, {
      checkoutPaymentSessionId,
      providerPaymentId,
      checkoutSessionId,
    });

    const finalized = await finalizeCheckoutPaymentSession({
      checkoutPaymentSessionId: ownedSession.id,
    });

    return jsonResponse(
      await buildCheckoutPaymentSessionStatusResponse(
        finalized.checkoutPaymentSession,
        finalized.stripeSession,
        user.id,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
