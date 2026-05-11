import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  processProducerTopupsForOrder,
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
    if (!orderId) {
      return jsonResponse({ error: "Missing order_id" }, 400);
    }

    const serviceClient = createServiceClient();
    const { data: orderRow, error: orderError } = await serviceClient
      .from("orders")
      .select("id, producer_profile_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!orderRow) {
      return jsonResponse({ error: "Commande introuvable." }, 404);
    }
    if ((orderRow as Record<string, unknown>).producer_profile_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const result = await processProducerTopupsForOrder(serviceClient, orderId);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return jsonResponse({ error: message }, status);
  }
});
