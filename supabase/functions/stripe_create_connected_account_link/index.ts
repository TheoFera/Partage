import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProfileRecord = {
  id: string;
  handle: string | null;
  name: string | null;
  account_type: string | null;
  contact_email_public: string | null;
};

type LegalEntityRecord = {
  id: string;
  profile_id: string;
  legal_name: string | null;
  siret: string | null;
  stripe_account_id: string | null;
  stripe_account_country: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toSafeAppUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildStripeV2Headers(secretKey: string, version: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
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
  const STRIPE_CONNECTED_ACCOUNT_COUNTRY =
    (Deno.env.get("STRIPE_CONNECTED_ACCOUNT_COUNTRY") ?? "FR").trim().toUpperCase() || "FR";

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

  const body = await req.json().catch(() => ({}));
  const returnUrl = toSafeAppUrl(body?.return_url);
  const refreshUrl = toSafeAppUrl(body?.refresh_url) ?? returnUrl;
  const accountToken =
    typeof body?.account_token === "string" && body.account_token.trim() ? body.account_token.trim() : null;

  if (!returnUrl || !refreshUrl) {
    return json({ error: "Missing valid return_url / refresh_url" }, 400);
  }

  const [
    { data: profileData, error: profileError },
    { data: legalEntityData, error: legalEntityError },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, handle, name, account_type, contact_email_public")
      .eq("id", userData.user.id)
      .maybeSingle(),
    serviceClient
      .from("legal_entities")
      .select("id, profile_id, legal_name, siret, stripe_account_id, stripe_account_country")
      .eq("profile_id", userData.user.id)
      .maybeSingle(),
  ]);

  if (profileError) {
    return json({ error: "Unable to load profile", details: profileError.message }, 500);
  }
  if (legalEntityError) {
    return json({ error: "Unable to load legal entity", details: legalEntityError.message }, 500);
  }

  const profile = profileData as ProfileRecord | null;
  const legalEntity = legalEntityData as LegalEntityRecord | null;

  if (!profile) {
    return json({ error: "Profile not found" }, 404);
  }
  if (!legalEntity) {
    return json(
      { error: "Legal entity not found. Save legal information before connecting Stripe." },
      400,
    );
  }

  const allowedAccountTypes = new Set(["company", "association", "public_institution"]);
  if (!allowedAccountTypes.has((profile.account_type ?? "").trim())) {
    return json({ error: "This profile type cannot connect a Stripe producer account." }, 400);
  }

  const legalName = (legalEntity.legal_name ?? "").trim();
  const siret = (legalEntity.siret ?? "").trim();
  if (!legalName || !siret) {
    return json(
      {
        error: "Missing legal_name / siret. Save legal information before connecting Stripe.",
      },
      400,
    );
  }

  const contactEmail =
    (userData.user.email ?? "").trim() ||
    (profile.contact_email_public ?? "").trim();
  if (!contactEmail) {
    return json({ error: "No contact email available for Stripe onboarding." }, 400);
  }

  let stripeAccountId = (legalEntity.stripe_account_id ?? "").trim();

  if (!stripeAccountId) {
    if (STRIPE_CONNECTED_ACCOUNT_COUNTRY === "FR" && !accountToken) {
      return json(
        {
          error:
            "Pour une structure francaise, Stripe exige un account token cree cote navigateur avant la creation du compte Connect.",
        },
        400,
      );
    }

    const createAccountRes = await fetch(`${STRIPE_API_BASE_V2}/v2/core/accounts`, {
      method: "POST",
      headers: buildStripeV2Headers(STRIPE_SECRET_KEY, STRIPE_V2_API_VERSION),
      body: JSON.stringify({
        ...(accountToken
          ? {
              account_token: accountToken,
              identity: {
                country: STRIPE_CONNECTED_ACCOUNT_COUNTRY,
              },
            }
          : {
              display_name:
                legalName || profile.name?.trim() || profile.handle?.trim() || "Compte producteur",
              contact_email: contactEmail,
              identity: {
                country: STRIPE_CONNECTED_ACCOUNT_COUNTRY,
              },
            }),
        dashboard: "full",
        defaults: {
          responsibilities: {
            losses_collector: "stripe",
            fees_collector: "stripe",
          },
        },
        configuration: {
          customer: {},
          merchant: {
            capabilities: {
              card_payments: {
                requested: true,
              },
            },
          },
        },
        include: [
          "configuration.merchant",
          "configuration.customer",
          "identity",
          "defaults",
        ],
      }),
    });

    const createAccountJson = await createAccountRes.json().catch(() => ({}));
    if (!createAccountRes.ok) {
      const stripeCode =
        typeof createAccountJson?.error?.code === "string" ? createAccountJson.error.code.trim() : null;
      const stripeMessage =
        typeof createAccountJson?.error?.message === "string"
          ? createAccountJson.error.message
          : "Stripe connected account creation failed";
      return json(
        {
          error:
            stripeCode === "account_token_required"
              ? "Stripe demande un account token pour creer ce compte Connect. Rechargez la page puis relancez l onboarding."
              : stripeMessage,
          status: createAccountRes.status,
          details: createAccountJson,
        },
        createAccountRes.status >= 400 && createAccountRes.status < 500 ? 400 : 502,
      );
    }

    stripeAccountId =
      typeof createAccountJson?.id === "string" ? createAccountJson.id.trim() : "";
    if (!stripeAccountId) {
      return json({ error: "Stripe response missing connected account id" }, 502);
    }

    const { error: updateError } = await serviceClient
      .from("legal_entities")
      .update({
        stripe_account_id: stripeAccountId,
        stripe_account_country: STRIPE_CONNECTED_ACCOUNT_COUNTRY,
      })
      .eq("id", legalEntity.id)
      .eq("profile_id", userData.user.id);

    if (updateError) {
      return json({ error: "Unable to persist Stripe account id", details: updateError.message }, 500);
    }
  }

  const createAccountLinkRes = await fetch(`${STRIPE_API_BASE_V2}/v2/core/account_links`, {
    method: "POST",
    headers: buildStripeV2Headers(STRIPE_SECRET_KEY, STRIPE_V2_API_VERSION),
    body: JSON.stringify({
      account: stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "customer"],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    }),
  });

  const createAccountLinkJson = await createAccountLinkRes.json().catch(() => ({}));
  if (!createAccountLinkRes.ok) {
    const stripeMessage =
      typeof createAccountLinkJson?.error?.message === "string"
        ? createAccountLinkJson.error.message
        : "Stripe account link creation failed";
    return json(
      {
        error: stripeMessage,
        status: createAccountLinkRes.status,
        details: createAccountLinkJson,
      },
      502,
    );
  }

  const accountLinkUrl =
    typeof createAccountLinkJson?.url === "string" ? createAccountLinkJson.url.trim() : "";
  if (!accountLinkUrl) {
    return json({ error: "Stripe response missing account onboarding url" }, 502);
  }

  return json({
    stripe_account_id: stripeAccountId,
    url: accountLinkUrl,
  });
});
