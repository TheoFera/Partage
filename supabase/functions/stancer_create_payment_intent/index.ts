import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function basicAuthHeader(privateKey: string) {
  return `Basic ${btoa(`${privateKey}:`)}`;
}

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
  const STANCER_PRIVATE_KEY = Deno.env.get("STANCER_PRIVATE_KEY") ?? "";
  const STANCER_API_BASE = Deno.env.get("STANCER_API_BASE") ?? "https://api.stancer.com";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STANCER_PRIVATE_KEY) {
    return json({ error: "Function env is missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { order_id, amount_cents, idempotency_key, return_url } = await req.json().catch(() => ({}));

  if (!order_id || !idempotency_key || amount_cents == null) {
    return json({ error: "Missing order_id / amount_cents / idempotency_key" }, 400);
  }

  const parsedAmountCents = Number(amount_cents);
  if (!Number.isFinite(parsedAmountCents) || parsedAmountCents <= 0) {
    return json({ error: "Invalid amount_cents" }, 400);
  }

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  // Stancer limite la description a 64 caracteres.
  const shortId = (value: string) => String(value).replace(/-/g, "").slice(0, 10);
  const description = `Order ${shortId(order_id)} / User ${shortId(userData.user.id)}`;

  const parsedReturnUrl = typeof return_url === "string" && return_url.trim() ? return_url.trim() : null;

  const stancerRes = await fetch(`${STANCER_API_BASE}/v2/payment_intents/`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(STANCER_PRIVATE_KEY),
      "Content-Type": "application/json",
      "Idempotency-Key": String(idempotency_key),
    },
    body: JSON.stringify({
      currency: "eur",
      amount: parsedAmountCents,
      description,
      methods_allowed: ["card"],
      ...(parsedReturnUrl ? { return_url: parsedReturnUrl } : {}),
    }),
  });

  const stancerJson = await stancerRes.json().catch(() => ({}));

  if (!stancerRes.ok) {
    return json({ error: "Stancer create failed", status: stancerRes.status, details: stancerJson }, 502);
  }

  const provider_payment_id = stancerJson?.id;
  const payment_url = stancerJson?.url;

  if (!provider_payment_id || !payment_url) {
    return json({ error: "Stancer response missing id/url", details: stancerJson }, 502);
  }

  return json({
    provider_payment_id,
    payment_url,
  });
});
