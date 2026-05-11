import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  refundFullParticipantPayment,
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
    const paymentId = typeof body?.payment_id === "string" ? body.payment_id.trim() : "";
    if (!paymentId) {
      return jsonResponse({ error: "Missing payment_id" }, 400);
    }

    const serviceClient = createServiceClient();
    const { data: paymentRow, error: paymentError } = await serviceClient
      .from("payments")
      .select("id, order_id, participant_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!paymentRow) {
      return jsonResponse({ error: "Paiement introuvable." }, 404);
    }

    const { data: orderRow, error: orderError } = await serviceClient
      .from("orders")
      .select("id, producer_profile_id, sharer_profile_id")
      .eq("id", (paymentRow as Record<string, unknown>).order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!orderRow) {
      return jsonResponse({ error: "Commande introuvable." }, 404);
    }

    const producerProfileId = (orderRow as Record<string, unknown>).producer_profile_id;
    const sharerProfileId = (orderRow as Record<string, unknown>).sharer_profile_id;
    if (producerProfileId !== user.id && sharerProfileId !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const result = await refundFullParticipantPayment(serviceClient, paymentId);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
