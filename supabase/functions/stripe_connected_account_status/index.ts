import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LegalEntityRecord = {
  id: string;
  profile_id: string;
  stripe_account_id: string | null;
  stripe_account_country: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStripeV2Headers(secretKey: string, version: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": version,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_API_BASE_V2 = Deno.env.get("STRIPE_API_BASE_V2") ?? "https://api.stripe.com";
  const STRIPE_V2_API_VERSION = Deno.env.get("STRIPE_V2_API_VERSION") ?? "2026-03-25.preview";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json({ error: "Function env is missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: legalEntityData, error: legalEntityError } = await serviceClient
    .from("legal_entities")
    .select("id, profile_id, stripe_account_id, stripe_account_country")
    .eq("profile_id", userData.user.id)
    .maybeSingle();

  if (legalEntityError) {
    return json({ error: "Unable to load legal entity", details: legalEntityError.message }, 500);
  }

  const legalEntity = legalEntityData as LegalEntityRecord | null;
  const stripeAccountId = (legalEntity?.stripe_account_id ?? "").trim();

  if (!legalEntity || !stripeAccountId) {
    return json({
      status: "not_connected",
      stripe_account_id: null,
      stripe_account_country: legalEntity?.stripe_account_country ?? null,
      stripe_onboarding_complete: false,
      stripe_requirements_due_count: 0,
      stripe_last_synced_at: null,
      outstanding_requirements: [],
      card_payments_status: null,
      requirements_status: null,
    });
  }

  const accountUrl = new URL(`${STRIPE_API_BASE_V2}/v2/core/accounts/${encodeURIComponent(stripeAccountId)}`);
  accountUrl.searchParams.append("include[0]", "identity");
  accountUrl.searchParams.append("include[1]", "requirements");
  accountUrl.searchParams.append("include[2]", "configuration.merchant");

  const stripeRes = await fetch(accountUrl.toString(), {
    headers: buildStripeV2Headers(STRIPE_SECRET_KEY, STRIPE_V2_API_VERSION),
  });

  const stripeJson = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) {
    const stripeMessage =
      typeof stripeJson?.error?.message === "string"
        ? stripeJson.error.message
        : "Stripe connected account fetch failed";
    return json(
      {
        error: stripeMessage,
        status: stripeRes.status,
        details: stripeJson,
      },
      502,
    );
  }

  const requirements = stripeJson?.requirements ?? {};
  const outstandingRequirements = Array.from(
    new Set([
      ...toStringList(requirements?.currently_due),
      ...toStringList(requirements?.eventually_due),
      ...toStringList(requirements?.past_due),
    ]),
  );
  const cardPaymentsStatus =
    typeof stripeJson?.configuration?.merchant?.capabilities?.card_payments?.status === "string"
      ? stripeJson.configuration.merchant.capabilities.card_payments.status.trim()
      : null;
  const requirementsStatus =
    typeof requirements?.summary?.minimum_deadline?.status === "string"
      ? requirements.summary.minimum_deadline.status.trim()
      : null;
  const readyToProcessPayments = cardPaymentsStatus === "active";
  const onboardingComplete =
    readyToProcessPayments &&
    requirementsStatus !== "currently_due" &&
    requirementsStatus !== "past_due";
  const country =
    typeof stripeJson?.identity?.country === "string" && stripeJson.identity.country.trim()
      ? stripeJson.identity.country.trim().toUpperCase()
      : legalEntity.stripe_account_country ?? null;
  const syncedAt = new Date().toISOString();

  return json({
    status: onboardingComplete ? "connected" : "action_required",
    stripe_account_id: stripeAccountId,
    stripe_account_country: country,
    stripe_onboarding_complete: onboardingComplete,
    stripe_requirements_due_count: outstandingRequirements.length,
    stripe_last_synced_at: syncedAt,
    outstanding_requirements: outstandingRequirements,
    card_payments_status: cardPaymentsStatus,
    requirements_status: requirementsStatus,
  });
});
