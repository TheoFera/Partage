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

function mapStripeStatusToInternal(
  sessionStatus: string | null | undefined,
  paymentStatus: string | null | undefined,
) {
  if (sessionStatus === "complete" && (paymentStatus === "paid" || paymentStatus === "no_payment_required")) {
    return "paid";
  }
  if (sessionStatus === "complete" && paymentStatus === "unpaid") {
    return "authorized";
  }
  if (sessionStatus === "expired") {
    return "failed";
  }
  return "pending";
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

  const { provider_payment_id, session_id } = await req.json().catch(() => ({}));
  const checkoutSessionId =
    typeof provider_payment_id === "string" && provider_payment_id.trim()
      ? provider_payment_id.trim()
      : typeof session_id === "string" && session_id.trim()
        ? session_id.trim()
        : "";

  if (!checkoutSessionId) return json({ error: "Missing provider_payment_id" }, 400);

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const stripeRes = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(checkoutSessionId)}?expand[]=payment_intent`,
    {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    },
  );

  const stripeJson = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) {
    return json(
      { error: "Stripe checkout session fetch failed", status: stripeRes.status, details: stripeJson },
      502,
    );
  }

  const sessionStatus =
    typeof stripeJson?.status === "string" && stripeJson.status.trim() ? stripeJson.status.trim() : null;
  const paymentStatus =
    typeof stripeJson?.payment_status === "string" && stripeJson.payment_status.trim()
      ? stripeJson.payment_status.trim()
      : null;
  const paymentIntent = stripeJson?.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : typeof paymentIntent?.id === "string"
        ? paymentIntent.id
        : null;

  return json({
    provider_payment_id: checkoutSessionId,
    stripe_status: sessionStatus,
    payment_status: paymentStatus,
    status: mapStripeStatusToInternal(sessionStatus, paymentStatus),
    customer_email: stripeJson?.customer_details?.email ?? stripeJson?.customer_email ?? null,
    customer_phone: stripeJson?.customer_details?.phone ?? null,
    payment_intent_id: paymentIntentId,
  });
});
