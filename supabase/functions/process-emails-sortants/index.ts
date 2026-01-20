import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BILLING_INTERNAL_SECRET = Deno.env.get("BILLING_INTERNAL_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // 1) Sécurité: header obligatoire
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!BILLING_INTERNAL_SECRET || got !== BILLING_INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) Lecture body
  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const mode = body?.mode ?? "scan_pending";

  if (mode !== "scan_pending") {
    return new Response(JSON.stringify({ ok: false, error: "mode invalide" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  // 3) Lire 10 jobs pending
  const { data: jobs, error } = await supabase
    .from("emails_sortants")
    .select("id, kind, status, to_profile_id, facture_id, try_count, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true, mode, pending: jobs?.length ?? 0, jobs }), {
    headers: { "Content-Type": "application/json" },
  });
});
