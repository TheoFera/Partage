import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  readStripeRequirements,
  syncStripeConnectedAccountToLegalEntity,
} from "../_shared/stripe-connect.ts";

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
  stripe_connection_status: string | null;
  stripe_ready_for_orders: boolean | null;
  stripe_onboarding_complete: boolean | null;
  stripe_requirements_due_count: number | null;
  stripe_last_synced_at: string | null;
  stripe_requirements_currently_due: string[] | null;
  stripe_requirements_eventually_due: string[] | null;
  stripe_requirements_past_due: string[] | null;
  stripe_transfers_status: string | null;
  stripe_requirements_status: string | null;
  stripe_requirements_disabled_reason: string | null;
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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
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
    .select(`
      id,
      profile_id,
      stripe_account_id,
      stripe_account_country,
      stripe_connection_status,
      stripe_ready_for_orders,
      stripe_onboarding_complete,
      stripe_requirements_due_count,
      stripe_last_synced_at,
      stripe_requirements_currently_due,
      stripe_requirements_eventually_due,
      stripe_requirements_past_due,
      stripe_transfers_status,
      stripe_requirements_status,
      stripe_requirements_disabled_reason
    `)
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
      stripe_connection_status: "not_connected",
      stripe_ready_for_orders: false,
      stripe_onboarding_complete: false,
      stripe_requirements_due_count: 0,
      stripe_last_synced_at: null,
      outstanding_requirements: [],
      stripe_requirements_currently_due: [],
      stripe_requirements_eventually_due: [],
      stripe_requirements_past_due: [],
      transfers_status: null,
      requirements_status: null,
      requirements_disabled_reason: null,
    });
  }

  try {
    const { stripeJson, payload } = await syncStripeConnectedAccountToLegalEntity({
      serviceClient,
      stripeAccountId,
      fallbackCountry: legalEntity.stripe_account_country ?? null,
      legalEntityId: legalEntity.id,
    });
    const requirements = readStripeRequirements(stripeJson);
    return json(
      {
        status: payload.stripe_connection_status,
        stripe_account_id: stripeAccountId,
        stripe_account_country: payload.stripe_account_country,
        stripe_connection_status: payload.stripe_connection_status,
        stripe_ready_for_orders: payload.stripe_ready_for_orders,
        stripe_onboarding_complete: payload.stripe_onboarding_complete,
        stripe_requirements_due_count: payload.stripe_requirements_due_count,
        stripe_last_synced_at: payload.stripe_last_synced_at,
        outstanding_requirements: requirements.outstanding,
        stripe_requirements_currently_due: payload.stripe_requirements_currently_due,
        stripe_requirements_eventually_due: payload.stripe_requirements_eventually_due,
        stripe_requirements_past_due: payload.stripe_requirements_past_due,
        transfers_status: payload.stripe_transfers_status,
        requirements_status: payload.stripe_requirements_status,
        requirements_disabled_reason: payload.stripe_requirements_disabled_reason,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe connected account fetch failed";
    const currentlyDue = Array.isArray(legalEntity?.stripe_requirements_currently_due)
      ? legalEntity.stripe_requirements_currently_due
      : [];
    const eventuallyDue = Array.isArray(legalEntity?.stripe_requirements_eventually_due)
      ? legalEntity.stripe_requirements_eventually_due
      : [];
    const pastDue = Array.isArray(legalEntity?.stripe_requirements_past_due)
      ? legalEntity.stripe_requirements_past_due
      : [];
    const outstandingRequirements = Array.from(
      new Set([...currentlyDue, ...eventuallyDue, ...pastDue].filter((value) => typeof value === "string" && value.trim())),
    );
    const localStatus =
      typeof legalEntity?.stripe_connection_status === "string" && legalEntity.stripe_connection_status.trim()
        ? legalEntity.stripe_connection_status.trim()
        : "action_required";
    return json({
      status: localStatus,
      stripe_account_id: stripeAccountId,
      stripe_account_country: legalEntity?.stripe_account_country ?? null,
      stripe_connection_status: localStatus,
      stripe_ready_for_orders: Boolean(legalEntity?.stripe_ready_for_orders),
      stripe_onboarding_complete: Boolean(legalEntity?.stripe_onboarding_complete),
      stripe_requirements_due_count:
        typeof legalEntity?.stripe_requirements_due_count === "number" ? legalEntity.stripe_requirements_due_count : 0,
      stripe_last_synced_at: legalEntity?.stripe_last_synced_at ?? null,
      outstanding_requirements: outstandingRequirements,
      stripe_requirements_currently_due: currentlyDue,
      stripe_requirements_eventually_due: eventuallyDue,
      stripe_requirements_past_due: pastDue,
      transfers_status: legalEntity?.stripe_transfers_status ?? null,
      requirements_status: legalEntity?.stripe_requirements_status ?? null,
      requirements_disabled_reason: legalEntity?.stripe_requirements_disabled_reason ?? null,
      stripe_sync_warning: message,
    });
  }
});
