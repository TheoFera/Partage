import {
  buildCheckoutPaymentSessionStatusResponse,
  corsHeaders,
  finalizeCheckoutPaymentSession,
  jsonResponse,
  serializeUnknownError,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/checkout-payment.ts";

const extractBearerToken = (value: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return (match?.[1] ?? trimmed).trim();
};

const isServiceRoleAuthorized = (req: Request) => {
  const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY.trim();
  if (!serviceRoleKey) return false;
  const authorizationToken = extractBearerToken(req.headers.get("Authorization"));
  const apiKey = (req.headers.get("apikey") ?? "").trim();
  return authorizationToken === serviceRoleKey || apiKey === serviceRoleKey;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!isServiceRoleAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const checkoutPaymentSessionId =
      typeof body?.checkout_payment_session_id === "string" ? body.checkout_payment_session_id.trim() : "";
    const providerPaymentId =
      typeof body?.provider_payment_id === "string" ? body.provider_payment_id.trim() : "";
    const checkoutSessionId =
      typeof body?.session_id === "string" ? body.session_id.trim() : "";

    if (!checkoutPaymentSessionId && !providerPaymentId && !checkoutSessionId) {
      return jsonResponse({ error: "Missing checkout payment session identifier" }, 400);
    }

    const finalized = await finalizeCheckoutPaymentSession({
      checkoutPaymentSessionId,
      providerPaymentId,
      checkoutSessionId,
    });

    return jsonResponse(
      await buildCheckoutPaymentSessionStatusResponse(
        finalized.checkoutPaymentSession,
        finalized.stripeSession,
      ),
    );
  } catch (error) {
    const message = serializeUnknownError(error, "Impossible de réparer le paiement pour le moment.");
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
