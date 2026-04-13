import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAuthenticatedUser,
  STRIPE_API_BASE,
  STRIPE_SECRET_KEY,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  verifySessionOwnership,
} from "../_shared/checkout-payment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return jsonResponse({ error: "Function env is missing" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await requireAuthenticatedUser(authHeader);
    const body = await req.json().catch(() => ({}));
    const checkoutPaymentSessionId =
      typeof body?.checkout_payment_session_id === "string" ? body.checkout_payment_session_id.trim() : "";
    const parsedReturnUrl = typeof body?.return_url === "string" ? body.return_url.trim() : "";
    if (!checkoutPaymentSessionId || !parsedReturnUrl) {
      return jsonResponse({ error: "Missing checkout_payment_session_id / return_url" }, 400);
    }

    const checkoutPaymentSession = await verifySessionOwnership(user.id, {
      checkoutPaymentSessionId,
    });

    const customerEmail = (user.email ?? "").trim();
    const form = new URLSearchParams();
    form.append("mode", "payment");
    form.append("ui_mode", "embedded");
    form.append("redirect_on_completion", "if_required");
    form.append("locale", "fr");
    form.append("return_url", parsedReturnUrl);
    form.append("line_items[0][price_data][currency]", "eur");
    form.append("line_items[0][price_data][product_data][name]", "Commande Partage");
    form.append(
      "line_items[0][price_data][product_data][description]",
      `Commande ${checkoutPaymentSession.order_id}`,
    );
    form.append("line_items[0][price_data][unit_amount]", String(Math.round(checkoutPaymentSession.amount_cents)));
    form.append("line_items[0][quantity]", "1");
    form.append("metadata[checkout_payment_session_id]", checkoutPaymentSession.id);
    form.append("metadata[order_id]", checkoutPaymentSession.order_id);
    form.append("metadata[profile_id]", checkoutPaymentSession.profile_id);
    form.append("metadata[flow_kind]", checkoutPaymentSession.flow_kind);
    form.append("payment_intent_data[metadata][checkout_payment_session_id]", checkoutPaymentSession.id);
    form.append("payment_intent_data[metadata][order_id]", checkoutPaymentSession.order_id);
    form.append("payment_intent_data[metadata][profile_id]", checkoutPaymentSession.profile_id);
    form.append("payment_intent_data[metadata][flow_kind]", checkoutPaymentSession.flow_kind);
    form.append("phone_number_collection[enabled]", "false");
    if (customerEmail) {
      form.append("customer_email", customerEmail);
    }

    const stripeRes = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": checkoutPaymentSession.idempotency_key ?? checkoutPaymentSession.id,
      },
      body: form.toString(),
    });

    const stripeJson = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      const stripeMessage =
        typeof stripeJson?.error?.message === "string" ? stripeJson.error.message : null;
      const stripeCode =
        typeof stripeJson?.error?.code === "string" ? stripeJson.error.code : null;
      const stripeParam =
        typeof stripeJson?.error?.param === "string" ? stripeJson.error.param : null;
      return jsonResponse(
        {
          error: "Stripe checkout session create failed",
          status: stripeRes.status,
          stripe_message: stripeMessage,
          stripe_code: stripeCode,
          stripe_param: stripeParam,
          details: stripeJson,
        },
        502,
      );
    }

    const providerPaymentId = typeof stripeJson?.id === "string" ? stripeJson.id : "";
    const clientSecret = typeof stripeJson?.client_secret === "string" ? stripeJson.client_secret : "";
    if (!providerPaymentId || !clientSecret) {
      return jsonResponse({ error: "Stripe response missing id/client_secret", details: stripeJson }, 502);
    }

    const serviceClient = createServiceClient();
    const { error: updateError } = await serviceClient
      .from("checkout_payment_sessions")
      .update({
        status: "checkout_created",
        checkout_session_id: providerPaymentId,
        provider_payment_id: providerPaymentId,
        provider: "stripe",
        error_code: null,
        error_message: null,
      })
      .eq("id", checkoutPaymentSession.id);
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({
      checkout_payment_session_id: checkoutPaymentSession.id,
      provider_payment_id: providerPaymentId,
      client_secret: clientSecret,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
