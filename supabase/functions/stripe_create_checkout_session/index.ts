import {
  corsHeaders,
  createServiceClient,
  finalizeLocalZeroCheckoutPaymentSession,
  jsonResponse,
  parsePaymentBreakdown,
  prepareCheckoutPaymentSessionForStripe,
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
    const preparedCheckoutPaymentSession = await prepareCheckoutPaymentSessionForStripe(checkoutPaymentSession.id);
    const paymentBreakdown = parsePaymentBreakdown(preparedCheckoutPaymentSession.payment_breakdown);

    if (preparedCheckoutPaymentSession.payment_mode === "local_zero") {
      const finalized = await finalizeLocalZeroCheckoutPaymentSession(preparedCheckoutPaymentSession.id);
      return jsonResponse({
        checkout_payment_session_id: finalized.checkoutPaymentSession.id,
        provider_payment_id:
          finalized.checkoutPaymentSession.provider_payment_id ?? `local_zero_${preparedCheckoutPaymentSession.id}`,
        client_secret: "",
        payment_mode: "local_zero",
        payment_breakdown: paymentBreakdown,
        stripe_account_id: preparedCheckoutPaymentSession.stripe_account_id ?? null,
        status: finalized.status,
      });
    }

    const customerEmail = (user.email ?? "").trim();
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    const form = new URLSearchParams();
    form.append("mode", "payment");
    form.append("ui_mode", "embedded");
    form.append("redirect_on_completion", "if_required");
    form.append("locale", "fr");
    form.append("return_url", parsedReturnUrl);
    form.append("expires_at", String(expiresAt));
    form.append("line_items[0][price_data][currency]", "eur");
    form.append("line_items[0][price_data][product_data][name]", "Commande Partage");
    form.append(
      "line_items[0][price_data][product_data][description]",
      `Commande ${preparedCheckoutPaymentSession.order_id}`,
    );
    form.append("line_items[0][price_data][unit_amount]", String(Math.round(preparedCheckoutPaymentSession.amount_cents)));
    form.append("line_items[0][quantity]", "1");
    form.append("metadata[checkout_payment_session_id]", preparedCheckoutPaymentSession.id);
    form.append("metadata[order_id]", preparedCheckoutPaymentSession.order_id);
    form.append("metadata[profile_id]", preparedCheckoutPaymentSession.profile_id);
    form.append("metadata[flow_kind]", preparedCheckoutPaymentSession.flow_kind);
    if (preparedCheckoutPaymentSession.participant_id) {
      form.append("metadata[participant_id]", preparedCheckoutPaymentSession.participant_id);
    }
    if (preparedCheckoutPaymentSession.stripe_account_id) {
      form.append("metadata[producer_stripe_account_id]", preparedCheckoutPaymentSession.stripe_account_id);
    }
    form.append("metadata[total_economic_cents]", String(paymentBreakdown.total_economic_cents));
    form.append("metadata[coop_credit_used_cents]", String(paymentBreakdown.coop_credit_used_cents));
    form.append("metadata[card_amount_cents]", String(paymentBreakdown.card_amount_cents));
    form.append("metadata[platform_retained_target_cents]", String(paymentBreakdown.platform_retained_target_cents));
    form.append(
      "metadata[payment_provider_retained_cents]",
      String(paymentBreakdown.payment_provider_retained_cents),
    );
    form.append(
      "metadata[stripe_application_fee_amount_cents]",
      String(paymentBreakdown.stripe_application_fee_amount_cents),
    );
    form.append("metadata[producer_net_target_cents]", String(paymentBreakdown.producer_net_target_cents));
    form.append("metadata[producer_card_net_cents]", String(paymentBreakdown.producer_card_net_cents));
    form.append("metadata[producer_topup_due_cents]", String(paymentBreakdown.producer_topup_due_cents));
    form.append("payment_intent_data[metadata][checkout_payment_session_id]", preparedCheckoutPaymentSession.id);
    form.append("payment_intent_data[metadata][order_id]", preparedCheckoutPaymentSession.order_id);
    form.append("payment_intent_data[metadata][profile_id]", preparedCheckoutPaymentSession.profile_id);
    form.append("payment_intent_data[metadata][flow_kind]", preparedCheckoutPaymentSession.flow_kind);
    if (preparedCheckoutPaymentSession.participant_id) {
      form.append("payment_intent_data[metadata][participant_id]", preparedCheckoutPaymentSession.participant_id);
    }
    if (preparedCheckoutPaymentSession.stripe_account_id) {
      form.append("payment_intent_data[metadata][producer_stripe_account_id]", preparedCheckoutPaymentSession.stripe_account_id);
    }
    form.append("payment_intent_data[metadata][total_economic_cents]", String(paymentBreakdown.total_economic_cents));
    form.append("payment_intent_data[metadata][coop_credit_used_cents]", String(paymentBreakdown.coop_credit_used_cents));
    form.append("payment_intent_data[metadata][card_amount_cents]", String(paymentBreakdown.card_amount_cents));
    form.append(
      "payment_intent_data[metadata][platform_retained_target_cents]",
      String(paymentBreakdown.platform_retained_target_cents),
    );
    form.append(
      "payment_intent_data[metadata][payment_provider_retained_cents]",
      String(paymentBreakdown.payment_provider_retained_cents),
    );
    form.append(
      "payment_intent_data[metadata][stripe_application_fee_amount_cents]",
      String(paymentBreakdown.stripe_application_fee_amount_cents),
    );
    form.append(
      "payment_intent_data[metadata][producer_net_target_cents]",
      String(paymentBreakdown.producer_net_target_cents),
    );
    form.append("payment_intent_data[metadata][producer_card_net_cents]", String(paymentBreakdown.producer_card_net_cents));
    form.append("payment_intent_data[metadata][producer_topup_due_cents]", String(paymentBreakdown.producer_topup_due_cents));
    if (preparedCheckoutPaymentSession.payment_mode === "direct_charge") {
      form.append(
        "payment_intent_data[application_fee_amount]",
        String(paymentBreakdown.stripe_application_fee_amount_cents),
      );
    }
    form.append("phone_number_collection[enabled]", "false");
    if (customerEmail) {
      form.append("customer_email", customerEmail);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": checkoutPaymentSession.idempotency_key ?? checkoutPaymentSession.id,
    };
    if (preparedCheckoutPaymentSession.payment_mode === "direct_charge") {
      const stripeAccountId = preparedCheckoutPaymentSession.stripe_account_id?.trim() ?? "";
      if (!stripeAccountId) {
        return jsonResponse({ error: "Compte Stripe Connect producteur introuvable." }, 400);
      }
      headers["Stripe-Account"] = stripeAccountId;
    }

    const stripeRes = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers,
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
      const serviceClient = createServiceClient();
      await serviceClient.rpc("release_checkout_session_lot_reservations", {
        p_checkout_payment_session_id: preparedCheckoutPaymentSession.id,
        p_status: "released",
      });
      await serviceClient
        .from("checkout_payment_sessions")
        .update({
          status: "failed",
          error_code: stripeCode ?? "stripe_checkout_create_failed",
          error_message: stripeMessage ?? "La création de la session Stripe a échoué.",
        })
        .eq("id", preparedCheckoutPaymentSession.id);
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
      const serviceClient = createServiceClient();
      await serviceClient.rpc("release_checkout_session_lot_reservations", {
        p_checkout_payment_session_id: preparedCheckoutPaymentSession.id,
        p_status: "released",
      });
      await serviceClient
        .from("checkout_payment_sessions")
        .update({
          status: "failed",
          error_code: "stripe_checkout_invalid_response",
          error_message: "Stripe n'a pas retourné les identifiants attendus.",
        })
        .eq("id", preparedCheckoutPaymentSession.id);
      return jsonResponse({ error: "Stripe response missing id/client_secret", details: stripeJson }, 502);
    }

    const serviceClient = createServiceClient();
    const { error: updateError } = await serviceClient
      .from("checkout_payment_sessions")
      .update({
        status: "checkout_created",
        checkout_session_id: providerPaymentId,
        provider_payment_id: providerPaymentId,
        stripe_payment_intent_id: typeof stripeJson?.payment_intent === "string" ? stripeJson.payment_intent : null,
        provider: "stripe",
        error_code: null,
        error_message: null,
      })
      .eq("id", preparedCheckoutPaymentSession.id);
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({
      checkout_payment_session_id: preparedCheckoutPaymentSession.id,
      provider_payment_id: providerPaymentId,
      client_secret: clientSecret,
      payment_mode: preparedCheckoutPaymentSession.payment_mode ?? "stripe_checkout",
      payment_breakdown: paymentBreakdown,
      stripe_account_id: preparedCheckoutPaymentSession.stripe_account_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
