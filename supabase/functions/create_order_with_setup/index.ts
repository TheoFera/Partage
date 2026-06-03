import {
  corsHeaders,
  createOrderWithSetup,
  createServiceClient,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/checkout-payment.ts";

const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
    if (typeof value.details === "string" && value.details.trim()) return value.details.trim();
    if (typeof value.hint === "string" && value.hint.trim()) return value.hint.trim();
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
    const serviceClient = createServiceClient();
    const result = await createOrderWithSetup(serviceClient, {
      authUserId: user.id,
      rawPayload: body,
    });
    return jsonResponse({
      ok: true,
      order_id: result.orderId,
      order_code: result.orderCode,
    });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const status =
      message === "Missing Authorization header" || message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : 400;
    return jsonResponse({ error: message }, status);
  }
});
