import {
  buildCloseCheckoutDraft,
  buildParticipantCheckoutDraft,
  corsHeaders,
  createCheckoutPaymentSessionDraft,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/checkout-payment.ts";

const serializeUnknownError = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const message = "message" in error && typeof error.message === "string" ? error.message.trim() : "";
    if (message) {
      return message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "[unserializable error object]";
    }
  }
  return String(error);
};

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
    const forceNew = body?.force_new === true;
    const draftPayload =
      body?.draft_payload && typeof body.draft_payload === "object" && !Array.isArray(body.draft_payload)
        ? (body.draft_payload as Record<string, unknown>)
        : {};

    if (!orderId) {
      return jsonResponse({ error: "Missing order_id" }, 400);
    }
    let amountCents = 0;
    let normalizedDraftPayload = draftPayload;
    let paymentBreakdown: Record<string, unknown> | null = null;

    if (flowKind === "participant") {
      const participantDraft = await buildParticipantCheckoutDraft({
        authUserId: user.id,
        orderId,
        draftPayload,
      });
      amountCents = participantDraft.amountCents;
      normalizedDraftPayload = participantDraft.draftPayload;
      paymentBreakdown = participantDraft.paymentBreakdown;
    } else {
      const closeDraft = await buildCloseCheckoutDraft({
        authUserId: user.id,
        orderId,
        draftPayload,
      });
      amountCents = closeDraft.amountCents;
      normalizedDraftPayload = closeDraft.draftPayload;
      paymentBreakdown = closeDraft.paymentBreakdown;
    }

    const draft = await createCheckoutPaymentSessionDraft({
      authUserId: user.id,
      orderId,
      flowKind,
      amountCents,
      draftPayload: normalizedDraftPayload,
      forceNew,
    });

    return jsonResponse({
      checkout_payment_session_id: draft.id,
      local_status: draft.status,
      normalized_draft: normalizedDraftPayload,
      payment_breakdown: paymentBreakdown,
      amount_cents: amountCents,
    });
  } catch (error) {
    const message = serializeUnknownError(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
