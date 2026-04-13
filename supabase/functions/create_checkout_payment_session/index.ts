import {
  corsHeaders,
  createCheckoutPaymentSessionDraft,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/checkout-payment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await requireAuthenticatedUser(authHeader);
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const flowKind = body?.flow_kind === "close" ? "close" : "participant";
    const amountCents = Math.max(0, Math.round(Number(body?.amount_cents ?? 0)));
    const draftPayload =
      body?.draft_payload && typeof body.draft_payload === "object" && !Array.isArray(body.draft_payload)
        ? (body.draft_payload as Record<string, unknown>)
        : {};

    if (!orderId) {
      return jsonResponse({ error: "Missing order_id" }, 400);
    }
    if (amountCents <= 0) {
      return jsonResponse({ error: "Invalid amount_cents" }, 400);
    }

    const draft = await createCheckoutPaymentSessionDraft({
      authUserId: user.id,
      orderId,
      flowKind,
      amountCents,
      draftPayload,
    });

    return jsonResponse({
      checkout_payment_session_id: draft.id,
      local_status: draft.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
