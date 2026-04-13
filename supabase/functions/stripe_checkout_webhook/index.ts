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
      data?: { object?: Record<string, unknown> | null } | null;
    };

    const sessionObject =
      event?.data?.object && typeof event.data.object === "object" ? event.data.object : null;
    const checkoutSessionId = typeof sessionObject?.id === "string" ? sessionObject.id : "";

    if (!checkoutSessionId) {
      return jsonResponse({ received: true, ignored: true, reason: "missing_session_id" });
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const result = await finalizeCheckoutPaymentSession({ checkoutSessionId });
        return jsonResponse({
          received: true,
          status: result.status,
          local_status: result.checkoutPaymentSession.status,
        });
      }
      default:
        return jsonResponse({ received: true, ignored: true, event_type: event.type ?? "unknown" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
