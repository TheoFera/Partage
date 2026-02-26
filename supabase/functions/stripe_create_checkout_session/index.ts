import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_API_BASE = Deno.env.get("STRIPE_API_BASE") ?? "https://api.stripe.com/v1";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
    return json({ error: "Function env is missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { order_id, amount_cents, idempotency_key, return_url } = await req.json().catch(() => ({}));

  if (!order_id || !idempotency_key || amount_cents == null || !return_url) {
    return json({ error: "Missing order_id / amount_cents / idempotency_key / return_url" }, 400);
  }

  const parsedAmountCents = Number(amount_cents);
  if (!Number.isFinite(parsedAmountCents) || parsedAmountCents <= 0) {
    return json({ error: "Invalid amount_cents" }, 400);
  }

  const parsedReturnUrl = typeof return_url === "string" ? return_url.trim() : "";
  if (!parsedReturnUrl) {
    return json({ error: "Invalid return_url" }, 400);
  }

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const customerEmail = (userData.user.email ?? "").trim();
  const form = new URLSearchParams();
  form.append("mode", "payment");
  form.append("ui_mode", "embedded");
  form.append("locale", "fr");
  form.append("return_url", parsedReturnUrl);
  form.append("line_items[0][price_data][currency]", "eur");
  form.append("line_items[0][price_data][product_data][name]", "Commande Partage");
  form.append("line_items[0][price_data][product_data][description]", `Commande ${order_id}`);
  form.append("line_items[0][price_data][unit_amount]", String(Math.round(parsedAmountCents)));
  form.append("line_items[0][quantity]", "1");
  form.append("metadata[order_id]", String(order_id));
  form.append("metadata[user_id]", String(userData.user.id));
  form.append("payment_intent_data[metadata][order_id]", String(order_id));
  form.append("payment_intent_data[metadata][user_id]", String(userData.user.id));
  form.append("phone_number_collection[enabled]", "false");
  if (customerEmail) {
    form.append("customer_email", customerEmail);
  }

  const stripeRes = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": String(idempotency_key),
    },
    body: form.toString(),
  });

  const stripeJson = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) {
    const stripeMessage =
      typeof stripeJson?.error?.message === "string" ? stripeJson.error.message : null;
    return json(
      {
        error: "Stripe checkout session create failed",
        status: stripeRes.status,
        stripe_message: stripeMessage,
        details: stripeJson,
      },
      502,
    );
  }

  const provider_payment_id = stripeJson?.id;
  const client_secret = stripeJson?.client_secret;
  if (!provider_payment_id || !client_secret) {
    return json({ error: "Stripe response missing id/client_secret", details: stripeJson }, 502);
  }

  return json({
    provider_payment_id,
    client_secret,
  });
});
