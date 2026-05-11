import {
  corsHeaders,
  finalizeCheckoutPaymentSession,
  jsonResponse,
  verifyStripeWebhookSignature,
} from "../_shared/checkout-payment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";
    await verifyStripeWebhookSignature(rawBody, signature);
    const event = JSON.parse(rawBody) as {
      type?: string;
      account?: string | null;
      data?: { object?: Record<string, unknown> | null } | null;
    };

    const sessionObject =
      event?.data?.object && typeof event.data.object === "object" ? event.data.object : null;
    const metadataObject =
      sessionObject?.metadata && typeof sessionObject.metadata === "object"
        ? sessionObject.metadata as Record<string, unknown>
        : null;
    const checkoutSessionId = typeof sessionObject?.id === "string" ? sessionObject.id : "";
    const checkoutPaymentSessionId =
      typeof metadataObject?.checkout_payment_session_id === "string"
        ? metadataObject.checkout_payment_session_id
        : "";
    const stripeAccountId = typeof event.account === "string" ? event.account : "";

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        if (!checkoutSessionId) {
          return jsonResponse({ received: true, ignored: true, reason: "missing_session_id" });
        }
        const result = await finalizeCheckoutPaymentSession({
          checkoutSessionId,
          stripeAccountId,
          stripeSessionOverride: sessionObject as any,
        });
        return jsonResponse({
          received: true,
          status: result.status,
          local_status: result.checkoutPaymentSession.status,
        });
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "charge.succeeded": {
        if (!checkoutPaymentSessionId) {
          return jsonResponse({ received: true, ignored: true, reason: "missing_checkout_payment_session_id" });
        }
        const result = await finalizeCheckoutPaymentSession({
          checkoutPaymentSessionId,
          stripeAccountId,
        });
        return jsonResponse({
          received: true,
          status: result.status,
          local_status: result.checkoutPaymentSession.status,
        });
      }
      case "charge.refunded":
      case "charge.dispute.created":
        return jsonResponse({
          received: true,
          ignored: true,
          event_type: event.type,
          stripe_account_id: stripeAccountId || null,
          checkout_payment_session_id: checkoutPaymentSessionId || null,
        });
      default:
        return jsonResponse({ received: true, ignored: true, event_type: event.type ?? "unknown" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
