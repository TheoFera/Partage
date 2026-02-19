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

function mapStancerStatusToInternal(stancerStatus: string | null | undefined) {
  switch (stancerStatus) {
    case "captured":
      return "paid";
    case "authorized":
    case "to_capture":
    case "capture_sent":
      return "authorized";
    case "refused":
    case "failed":
    case "expired":
    case "disputed":
      return "failed";
    default:
      return "pending";
  }
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

  const { provider_payment_id } = await req.json().catch(() => ({}));
  if (!provider_payment_id) return json({ error: "Missing provider_payment_id" }, 400);

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const intentRes = await fetch(`${STANCER_API_BASE}/v2/payment_intents/${provider_payment_id}`, {
    headers: { Authorization: basicAuthHeader(STANCER_PRIVATE_KEY) },
  });

  const intentJson = await intentRes.json().catch(() => ({}));
  if (!intentRes.ok) {
    return json({ error: "Stancer fetch failed", status: intentRes.status, details: intentJson }, 502);
  }

  const stancerStatus =
    intentJson?.status ??
    intentJson?.payment?.status ??
    intentJson?.last_payment?.status ??
    (Array.isArray(intentJson?.payments) ? intentJson.payments.at(-1)?.status : undefined);

  return json({
    provider_payment_id,
    stancer_status: stancerStatus ?? null,
    status: mapStancerStatusToInternal(stancerStatus),
  });
});
