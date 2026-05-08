import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  verifyStripeWebhookSignature,
} from "../_shared/checkout-payment.ts";
import { syncStripeConnectedAccountToLegalEntity } from "../_shared/stripe-connect.ts";

type StripeWebhookEvent = {
  type?: string;
  account?: string | null;
  data?: { object?: Record<string, unknown> | null } | null;
  related_object?: {
    id?: string | null;
    type?: string | null;
    url?: string | null;
  } | null;
};

function readTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function extractStripeAccountId(event: StripeWebhookEvent) {
  const topLevelAccount = readTrimmedString(event.account);
  if (topLevelAccount) return topLevelAccount;

  const relatedObjectType = readTrimmedString(event.related_object?.type);
  const relatedObjectId = readTrimmedString(event.related_object?.id);
  if (relatedObjectType === "v2.core.account" && relatedObjectId) {
    return relatedObjectId;
  }

  const eventObject =
    event?.data?.object && typeof event.data.object === "object" ? event.data.object : null;
  const objectId = readTrimmedString(eventObject?.id);
  if (objectId.startsWith("acct_")) return objectId;

  const nestedAccount = readTrimmedString(eventObject?.account);
  if (nestedAccount) return nestedAccount;

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";
    await verifyStripeWebhookSignature(rawBody, signature);

    const event = JSON.parse(rawBody) as StripeWebhookEvent;
    const stripeAccountId = extractStripeAccountId(event);

    if (!stripeAccountId) {
      return jsonResponse({
        received: true,
        ignored: true,
        event_type: event.type ?? "unknown",
        reason: "missing_account_id",
      });
    }

    const serviceClient = createServiceClient();
    const { data: legalEntity, error } = await serviceClient
      .from("legal_entities")
      .select("id, stripe_account_country")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    if (!legalEntity?.id) {
      return jsonResponse({ received: true, ignored: true, reason: "account_not_linked_locally" });
    }

    const { payload } = await syncStripeConnectedAccountToLegalEntity({
      serviceClient,
      stripeAccountId,
      fallbackCountry:
        typeof legalEntity.stripe_account_country === "string" ? legalEntity.stripe_account_country : null,
      legalEntityId: legalEntity.id as string,
    });

    return jsonResponse({
      received: true,
      event_type: event.type ?? "unknown",
      stripe_account_id: stripeAccountId,
      stripe_connection_status: payload.stripe_connection_status,
      stripe_ready_for_orders: payload.stripe_ready_for_orders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
