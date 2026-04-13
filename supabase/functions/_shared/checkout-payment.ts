import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
export const STRIPE_API_BASE = Deno.env.get("STRIPE_API_BASE") ?? "https://api.stripe.com/v1";
export const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type CheckoutPaymentSessionStatus =
  | "draft"
  | "checkout_created"
  | "checkout_completed"
  | "fulfilling"
  | "fulfilled"
  | "failed"
  | "expired";

type CheckoutFlowKind = "participant" | "close";

type CheckoutPaymentSessionRow = {
  id: string;
  checkout_session_id: string | null;
  order_id: string;
  profile_id: string;
  flow_kind: CheckoutFlowKind;
  status: CheckoutPaymentSessionStatus;
  draft_payload: JsonRecord | null;
  amount_cents: number;
  currency: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  idempotency_key: string | null;
  error_code: string | null;
  error_message: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};

type StripeCheckoutSession = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null; phone?: string | null } | null;
  metadata?: Record<string, unknown> | null;
  payment_intent?: string | { id?: string | null } | null;
};

type DbPaymentRow = {
  id: string;
  participant_id: string;
  provider_payment_id: string | null;
  status: string;
};

type DbParticipantRow = {
  id: string;
  order_id: string;
  profile_id: string;
  participation_status: string;
  role: string | null;
  total_amount_cents: number;
};

type DbOrderRow = {
  id: string;
  order_code: string | null;
  auto_approve_participation_requests: boolean;
  sharer_profile_id: string;
  status: string;
  effective_weight_kg: number;
  delivery_fee_cents: number;
  sharer_percentage: number;
};

type DbOrderProductRow = {
  product_id: string;
  unit_label: string | null;
  unit_weight_kg: number | null;
  unit_base_price_cents: number;
};

type ProductListingRow = {
  product_id: string;
  sale_unit: string | null;
  packaging: string | null;
  unit_weight_kg: number | null;
  active_lot_id: string | null;
  active_lot_price_cents: number | null;
  default_price_cents: number | null;
};

type DbOrderItemRow = {
  id: string;
  product_id: string;
  quantity_units: number;
  unit_label: string | null;
  unit_weight_kg: number | null;
  line_weight_kg: number | null;
};

type FinalizeResult = {
  checkoutPaymentSession: CheckoutPaymentSessionRow;
  stripeSession: StripeCheckoutSession | null;
  status: "processing" | "succeeded" | "failed" | "retryable";
  errorMessage: string | null;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const generateIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `checkout_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const constantTimeEqualHex = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const parseStripeSignatureHeader = (signatureHeader: string) => {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);
  return {
    timestamp: Number(timestamp),
    signatures,
  };
};

export async function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > 300) {
    throw new Error("Expired Stripe signature");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${timestamp}.${rawBody}`;
  const signature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  if (!signatures.some((candidate) => constantTimeEqualHex(candidate, signature))) {
    throw new Error("Stripe signature mismatch");
  }
}

export const createUserClient = (authHeader: string) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
  });

export const createServiceClient = () =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

export async function requireAuthenticatedUser(authHeader: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env is missing");
  }
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }
  const userClient = createUserClient(authHeader);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

const assertServerEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    throw new Error("Function env is missing");
  }
};

const mapStripeStatusToInternal = (
  sessionStatus: string | null | undefined,
  paymentStatus: string | null | undefined,
): "paid" | "authorized" | "failed" | "pending" => {
  if (sessionStatus === "complete" && (paymentStatus === "paid" || paymentStatus === "no_payment_required")) {
    return "paid";
  }
  if (sessionStatus === "complete" && paymentStatus === "unpaid") {
    return "authorized";
  }
  if (sessionStatus === "expired") {
    return "failed";
  }
  return "pending";
};

const isKgSaleUnit = (saleUnit?: string | null) => (saleUnit ?? "").trim().toLowerCase() === "kg";
const isKgUnitLabel = (unitLabel?: string | null) => (unitLabel ?? "").trim().toLowerCase() === "kg";
const isPositiveNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const resolveUnitWeightKg = (saleUnit: string | null, unitWeightKg: number | null, packaging?: string | null) => {
  if (isPositiveNumber(unitWeightKg)) return unitWeightKg;
  const unitLabel = packaging?.toLowerCase() ?? "";
  const match = unitLabel.match(/([\d.,]+)\s*(kg|g)/);
  if (match) {
    const raw = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(raw)) {
      return match[2] === "kg" ? raw : raw / 1000;
    }
  }
  if (saleUnit === "kg") return 1;
  return 0.25;
};

const normalizeQuantityUnitsForStorage = (saleUnit: string | null, quantityUnits: number) => {
  const normalized = Math.max(0, Number(quantityUnits) || 0);
  if (isKgSaleUnit(saleUnit)) {
    return normalized > 0 ? 1 : 0;
  }
  return Math.trunc(normalized);
};

const resolveStoredUnitWeightKg = (saleUnit: string | null, defaultUnitWeightKg: number, quantityUnits: number) => {
  if (isKgSaleUnit(saleUnit)) {
    return Math.max(0, Number(quantityUnits) || 0);
  }
  return defaultUnitWeightKg;
};

const resolveStoredUnitBasePriceCents = (saleUnit: string | null, basePriceCents: number, quantityUnits: number) => {
  if (isKgSaleUnit(saleUnit)) {
    return Math.round(basePriceCents * Math.max(0, Number(quantityUnits) || 0));
  }
  return basePriceCents;
};

const getOrderItemQuantity = (item: { quantity_units?: number | null; line_weight_kg?: number | null; unit_label?: string | null }) => {
  const quantityUnits = Math.max(0, Number(item.quantity_units ?? 0));
  if (isKgUnitLabel(item.unit_label)) {
    const lineWeightKg = Number(item.line_weight_kg ?? Number.NaN);
    if (Number.isFinite(lineWeightKg) && lineWeightKg >= 0) return lineWeightKg;
  }
  return quantityUnits;
};

const calculateOrderItemPricing = (params: {
  order: Pick<DbOrderRow, "effective_weight_kg" | "delivery_fee_cents" | "sharer_percentage">;
  basePriceCents: number;
  unitWeightKg: number;
  quantityUnits: number;
}) => {
  const feePerKg = params.order.effective_weight_kg > 0
    ? params.order.delivery_fee_cents / params.order.effective_weight_kg
    : 0;
  const unitDeliveryCents = Math.round(feePerKg * params.unitWeightKg);
  const basePlusDelivery = params.basePriceCents + unitDeliveryCents;
  const shareFraction =
    params.order.sharer_percentage > 0 && params.order.sharer_percentage < 100
      ? params.order.sharer_percentage / (100 - params.order.sharer_percentage)
      : 0;
  const unitSharerFeeCents = Math.round(basePlusDelivery * shareFraction);
  const unitFinalPriceCents = basePlusDelivery + unitSharerFeeCents;
  return {
    unitDeliveryCents,
    unitSharerFeeCents,
    unitFinalPriceCents,
    lineTotalCents: unitFinalPriceCents * params.quantityUnits,
    lineWeightKg: params.unitWeightKg * params.quantityUnits,
  };
};

const fetchLatestActiveLotsByProductId = async (serviceClient: ReturnType<typeof createServiceClient>, productIds: string[]) => {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  const result = new Map<string, { id: string; price_cents: number; produced_at: string | null; created_at: string }>();
  if (!uniqueProductIds.length) return result;
  const { data, error } = await serviceClient
    .from("lots")
    .select("id, product_id, produced_at, created_at, price_cents")
    .in("product_id", uniqueProductIds)
    .eq("status", "active");
  if (error) throw error;
  const byProductId = new Map<string, Array<{ id: string; price_cents: number; produced_at: string | null; created_at: string }>>();
  for (const rawRow of (data ?? []) as Array<Record<string, unknown>>) {
    const productId = normalizeText(rawRow.product_id);
    if (!productId) continue;
    const bucket = byProductId.get(productId) ?? [];
    bucket.push({
      id: normalizeText(rawRow.id),
      price_cents: Math.max(0, Number(rawRow.price_cents ?? 0)),
      produced_at: typeof rawRow.produced_at === "string" ? rawRow.produced_at : null,
      created_at: normalizeText(rawRow.created_at),
    });
    byProductId.set(productId, bucket);
  }
  byProductId.forEach((lots, productId) => {
    const selected = lots
      .slice()
      .sort((left, right) => {
        const leftDate = Date.parse(left.produced_at ?? left.created_at);
        const rightDate = Date.parse(right.produced_at ?? right.created_at);
        return rightDate - leftDate;
      })[0];
    if (selected?.id) {
      result.set(productId, selected);
    }
  });
  return result;
};

async function getCheckoutPaymentSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { id?: string | null; providerPaymentId?: string | null; checkoutSessionId?: string | null },
) {
  const id = normalizeText(params.id);
  if (id) {
    const { data, error } = await serviceClient
      .from("checkout_payment_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as CheckoutPaymentSessionRow | null) ?? null;
  }
  const providerPaymentId = normalizeText(params.providerPaymentId);
  const checkoutSessionId = normalizeText(params.checkoutSessionId);
  const sessionKey = providerPaymentId || checkoutSessionId;
  if (!sessionKey) return null;
  const { data, error } = await serviceClient
    .from("checkout_payment_sessions")
    .select("*")
    .or(`provider_payment_id.eq.${sessionKey},checkout_session_id.eq.${sessionKey}`)
    .maybeSingle();
  if (error) throw error;
  return (data as CheckoutPaymentSessionRow | null) ?? null;
}

async function updateCheckoutPaymentSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  sessionId: string,
  payload: Partial<CheckoutPaymentSessionRow>,
) {
  const { data, error } = await serviceClient
    .from("checkout_payment_sessions")
    .update(payload)
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Unable to update checkout payment session");
  return data as CheckoutPaymentSessionRow;
}

async function retrieveStripeCheckoutSession(checkoutSessionId: string) {
  assertServerEnv();
  const response = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(checkoutSessionId)}?expand[]=payment_intent`,
    {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe checkout session fetch failed (${response.status})`);
  }
  return payload as StripeCheckoutSession;
}

async function findExistingPaymentByProviderPaymentId(
  serviceClient: ReturnType<typeof createServiceClient>,
  providerPaymentId: string,
) {
  const { data, error } = await serviceClient
    .from("payments")
    .select("id, participant_id, provider_payment_id, status")
    .eq("provider_payment_id", providerPaymentId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DbPaymentRow | null) ?? null;
}

async function recomputeCaches(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  participantId?: string | null,
) {
  const { error } = await serviceClient.rpc("recompute_order_caches", {
    p_order_id: orderId,
    p_participant_id: participantId ?? null,
  });
  if (error) throw error;
}

async function createPaymentStub(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    orderId: string;
    participantId: string;
    amountCents: number;
    provider: string;
    providerPaymentId: string;
    idempotencyKey: string | null;
    raw: JsonRecord;
  },
) {
  const { data, error } = await serviceClient
    .from("payments")
    .insert({
      order_id: params.orderId,
      participant_id: params.participantId,
      amount_cents: params.amountCents,
      status: "pending",
      provider: params.provider,
      provider_payment_id: params.providerPaymentId,
      idempotency_key: params.idempotencyKey,
      raw: params.raw,
    })
    .select("id, participant_id, provider_payment_id, status")
    .single();
  if (error || !data) throw error ?? new Error("Unable to create payment");
  return data as DbPaymentRow;
}

async function triggerOutgoingEmails(serviceClient: ReturnType<typeof createServiceClient>) {
  const { error } = await serviceClient.rpc("call_process_emails_sortants");
  if (error) throw error;
}

async function finalizePaymentSimulation(serviceClient: ReturnType<typeof createServiceClient>, paymentId: string) {
  const { error } = await serviceClient.rpc("finalize_payment_simulation", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  await triggerOutgoingEmails(serviceClient);
}

async function finalizeClosePayment(serviceClient: ReturnType<typeof createServiceClient>, paymentId: string) {
  const { error } = await serviceClient.rpc("finalize_close_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
}

async function createLockClosePackage(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  useCoopBalance: boolean,
) {
  const { error } = await serviceClient.rpc("create_lock_close_package", {
    p_order_id: orderId,
    p_use_coop_balance: useCoopBalance,
  });
  if (error) throw error;
}

async function issueSharerInvoiceAfterLock(serviceClient: ReturnType<typeof createServiceClient>, orderId: string) {
  const { error } = await serviceClient.rpc("issue_sharer_invoice_after_lock", {
    p_order_id: orderId,
  });
  if (error) throw error;
}

async function issueParticipantInvoiceWithCoop(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { orderId: string; profileId: string; coopAppliedCents: number },
) {
  const { error } = await serviceClient.rpc("issue_participant_invoice_with_coop", {
    p_order_id: params.orderId,
    p_profile_id: params.profileId,
    p_coop_cents: params.coopAppliedCents,
  });
  if (error) throw error;
}

async function fetchCoopBalance(serviceClient: ReturnType<typeof createServiceClient>, profileId: string) {
  const { data, error } = await serviceClient
    .from("coop_balances")
    .select("balance_cents")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return Math.max(0, Number((data as Record<string, unknown> | null)?.balance_cents ?? 0));
}

async function getOrderById(serviceClient: ReturnType<typeof createServiceClient>, orderId: string) {
  const { data, error } = await serviceClient
    .from("orders")
    .select("id, order_code, auto_approve_participation_requests, sharer_profile_id, status, effective_weight_kg, delivery_fee_cents, sharer_percentage")
    .eq("id", orderId)
    .single();
  if (error || !data) throw error ?? new Error("Order not found");
  return data as DbOrderRow;
}

async function getParticipantByProfile(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  profileId: string,
) {
  const { data, error } = await serviceClient
    .from("order_participants")
    .select("id, order_id, profile_id, participation_status, role, total_amount_cents")
    .eq("order_id", orderId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbParticipantRow | null) ?? null;
}

async function createParticipant(
  serviceClient: ReturnType<typeof createServiceClient>,
  order: DbOrderRow,
  profileId: string,
) {
  const { data, error } = await serviceClient
    .from("order_participants")
    .insert({
      order_id: order.id,
      profile_id: profileId,
      participation_status: order.auto_approve_participation_requests ? "accepted" : "requested",
    })
    .select("id, order_id, profile_id, participation_status, role, total_amount_cents")
    .single();
  if (error || !data) throw error ?? new Error("Unable to create participant");
  return data as DbParticipantRow;
}

async function deleteParticipantIfNoActivity(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { orderId: string; participantId: string },
) {
  const [{ count: itemsCount, error: itemsError }, { count: paymentsCount, error: paymentsError }] = await Promise.all([
    serviceClient
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", params.orderId)
      .eq("participant_id", params.participantId),
    serviceClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", params.orderId)
      .eq("participant_id", params.participantId),
  ]);
  if (itemsError) throw itemsError;
  if (paymentsError) throw paymentsError;
  if ((itemsCount ?? 0) > 0 || (paymentsCount ?? 0) > 0) return;
  const { error } = await serviceClient
    .from("order_participants")
    .delete()
    .eq("id", params.participantId);
  if (error) throw error;
}

async function getOrderProductRow(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  productId: string,
) {
  const { data, error } = await serviceClient
    .from("order_products")
    .select("product_id, unit_label, unit_weight_kg, unit_base_price_cents")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Product not enabled on order");
  return data as DbOrderProductRow;
}

async function getProductListingRow(
  serviceClient: ReturnType<typeof createServiceClient>,
  productId: string,
) {
  const { data, error } = await serviceClient
    .from("v_products_listing")
    .select("product_id, sale_unit, packaging, unit_weight_kg, active_lot_id, active_lot_price_cents, default_price_cents")
    .eq("product_id", productId)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Product listing not found");
  return data as ProductListingRow;
}

async function insertOrderItem(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    order: DbOrderRow;
    participantId: string;
    productId: string;
    quantityUnits: number;
  },
) {
  const [orderProduct, productListing, activeLotsByProductId] = await Promise.all([
    getOrderProductRow(serviceClient, params.order.id, params.productId),
    getProductListingRow(serviceClient, params.productId),
    fetchLatestActiveLotsByProductId(serviceClient, [params.productId]),
  ]);
  const fallbackLot = activeLotsByProductId.get(params.productId) ?? null;
  const resolvedLotId = normalizeText(productListing.active_lot_id) || normalizeText(fallbackLot?.id);
  if (!resolvedLotId) {
    throw new Error("Active lot not found for product");
  }
  const fallbackUnitWeightKg = resolveUnitWeightKg(
    productListing.sale_unit,
    productListing.unit_weight_kg,
    productListing.packaging,
  );
  const unitWeightKg = resolveStoredUnitWeightKg(
    productListing.sale_unit,
    orderProduct.unit_weight_kg ?? fallbackUnitWeightKg,
    params.quantityUnits,
  );
  const fallbackBasePriceCents = Math.max(
    0,
    Number(productListing.active_lot_price_cents ?? fallbackLot?.price_cents ?? productListing.default_price_cents ?? 0),
  );
  const unitBasePriceCents = resolveStoredUnitBasePriceCents(
    productListing.sale_unit,
    orderProduct.unit_base_price_cents ?? fallbackBasePriceCents,
    params.quantityUnits,
  );
  const storedQuantityUnits = normalizeQuantityUnitsForStorage(productListing.sale_unit, params.quantityUnits);
  const pricing = calculateOrderItemPricing({
    order: params.order,
    basePriceCents: unitBasePriceCents,
    unitWeightKg,
    quantityUnits: storedQuantityUnits,
  });
  const { data, error } = await serviceClient
    .from("order_items")
    .insert({
      order_id: params.order.id,
      participant_id: params.participantId,
      product_id: params.productId,
      lot_id: resolvedLotId,
      quantity_units: storedQuantityUnits,
      unit_label: productListing.sale_unit === "kg" ? "kg" : productListing.packaging,
      unit_weight_kg: unitWeightKg,
      unit_base_price_cents: unitBasePriceCents,
      unit_delivery_cents: pricing.unitDeliveryCents,
      unit_sharer_fee_cents: pricing.unitSharerFeeCents,
      unit_final_price_cents: pricing.unitFinalPriceCents,
      line_total_cents: pricing.lineTotalCents,
      line_weight_kg: pricing.lineWeightKg,
      is_sharer_share: false,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Unable to add order item");
  const { error: reservationError } = await serviceClient
    .from("lot_reservations")
    .insert({
      lot_id: resolvedLotId,
      order_id: params.order.id,
      order_item_id: normalizeText((data as Record<string, unknown>).id),
      reserved_units: isKgSaleUnit(productListing.sale_unit) ? null : storedQuantityUnits,
      reserved_kg: isKgSaleUnit(productListing.sale_unit) ? pricing.lineWeightKg : null,
      status: "active",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  if (reservationError) throw reservationError;
  await recomputeCaches(serviceClient, params.order.id, params.participantId);
  return normalizeText((data as Record<string, unknown>).id);
}

async function updateOrderItemQuantity(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    order: DbOrderRow;
    participantId: string;
    orderItemId: string;
    productId: string;
    quantityUnits: number;
  },
) {
  const [orderProduct, productListing] = await Promise.all([
    getOrderProductRow(serviceClient, params.order.id, params.productId),
    getProductListingRow(serviceClient, params.productId),
  ]);
  const fallbackUnitWeightKg = resolveUnitWeightKg(
    productListing.sale_unit,
    productListing.unit_weight_kg,
    productListing.packaging,
  );
  const unitWeightKg = resolveStoredUnitWeightKg(
    productListing.sale_unit,
    orderProduct.unit_weight_kg ?? fallbackUnitWeightKg,
    params.quantityUnits,
  );
  const fallbackBasePriceCents = Math.max(
    0,
    Number(productListing.active_lot_price_cents ?? productListing.default_price_cents ?? 0),
  );
  const unitBasePriceCents = resolveStoredUnitBasePriceCents(
    productListing.sale_unit,
    orderProduct.unit_base_price_cents ?? fallbackBasePriceCents,
    params.quantityUnits,
  );
  const storedQuantityUnits = normalizeQuantityUnitsForStorage(productListing.sale_unit, params.quantityUnits);
  const pricing = calculateOrderItemPricing({
    order: params.order,
    basePriceCents: unitBasePriceCents,
    unitWeightKg,
    quantityUnits: storedQuantityUnits,
  });
  const { error } = await serviceClient
    .from("order_items")
    .update({
      quantity_units: storedQuantityUnits,
      unit_weight_kg: unitWeightKg,
      unit_base_price_cents: unitBasePriceCents,
      unit_delivery_cents: pricing.unitDeliveryCents,
      unit_sharer_fee_cents: pricing.unitSharerFeeCents,
      unit_final_price_cents: pricing.unitFinalPriceCents,
      line_total_cents: pricing.lineTotalCents,
      line_weight_kg: pricing.lineWeightKg,
    })
    .eq("id", params.orderItemId);
  if (error) throw error;
  const { data: reservationRow, error: reservationFetchError } = await serviceClient
    .from("lot_reservations")
    .select("id")
    .eq("order_item_id", params.orderItemId)
    .maybeSingle();
  if (reservationFetchError) throw reservationFetchError;
  if (reservationRow?.id) {
    const { error: reservationUpdateError } = await serviceClient
      .from("lot_reservations")
      .update({
        reserved_units: isKgSaleUnit(productListing.sale_unit) ? null : storedQuantityUnits,
        reserved_kg: isKgSaleUnit(productListing.sale_unit) ? pricing.lineWeightKg : null,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", reservationRow.id);
    if (reservationUpdateError) throw reservationUpdateError;
  }
  await recomputeCaches(serviceClient, params.order.id, params.participantId);
}

async function deleteOrderItem(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { orderItemId: string; orderId: string; participantId: string },
) {
  const { error } = await serviceClient.from("order_items").delete().eq("id", params.orderItemId);
  if (error) throw error;
  await recomputeCaches(serviceClient, params.orderId, params.participantId);
}

function parseParticipantDraft(draftPayload: JsonRecord | null) {
  const draft = isRecord(draftPayload) ? draftPayload : {};
  const quantitiesSource = isRecord(draft.quantities) ? draft.quantities : {};
  const quantities: Record<string, number> = {};
  Object.entries(quantitiesSource).forEach(([productId, rawValue]) => {
    const quantity = Math.max(0, Number(rawValue) || 0);
    if (productId && quantity > 0) {
      quantities[productId] = quantity;
    }
  });
  return {
    quantities,
    useCoopBalance: Boolean(draft.useCoopBalance),
  };
}

function parseCloseDraft(draftPayload: JsonRecord | null) {
  const draft = isRecord(draftPayload) ? draftPayload : {};
  const closeData = isRecord(draft.closeData) ? draft.closeData : {};
  const extrasSource = isRecord(closeData.extraQuantities) ? closeData.extraQuantities : {};
  const extraQuantities: Record<string, number> = {};
  Object.entries(extrasSource).forEach(([productId, rawValue]) => {
    const quantity = Math.max(0, Number(rawValue) || 0);
    if (productId && quantity > 0) {
      extraQuantities[productId] = quantity;
    }
  });
  return {
    useCoopBalance: Boolean(closeData.useCoopBalance),
    extraQuantities,
  };
}

async function finalizeParticipantCheckoutSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSession: CheckoutPaymentSessionRow,
  stripeSession: StripeCheckoutSession,
) {
  if (!checkoutPaymentSession.provider_payment_id) {
    throw new Error("Missing provider_payment_id on checkout payment session");
  }
  const existingPayment = await findExistingPaymentByProviderPaymentId(
    serviceClient,
    checkoutPaymentSession.provider_payment_id,
  );
  if (existingPayment) {
    if (existingPayment.status === "pending") {
      await finalizePaymentSimulation(serviceClient, existingPayment.id);
    } else if (existingPayment.status !== "paid" && existingPayment.status !== "authorized") {
      throw new Error("Existing payment is not in a finalizable state");
    }
    return;
  }

  const order = await getOrderById(serviceClient, checkoutPaymentSession.order_id);
  let participant = await getParticipantByProfile(
    serviceClient,
    checkoutPaymentSession.order_id,
    checkoutPaymentSession.profile_id,
  );
  let participantCreatedInFlow = false;
  if (!participant) {
    participant = await createParticipant(serviceClient, order, checkoutPaymentSession.profile_id);
    participantCreatedInFlow = true;
  }

  const draft = parseParticipantDraft(checkoutPaymentSession.draft_payload);
  const createdItemIds: string[] = [];
  let createdPaymentId: string | null = null;

  try {
    for (const [productId, quantityUnits] of Object.entries(draft.quantities)) {
      const createdItemId = await insertOrderItem(serviceClient, {
        order,
        participantId: participant.id,
        productId,
        quantityUnits,
      });
      createdItemIds.push(createdItemId);
    }

    const { data: participantItems, error: participantItemsError } = await serviceClient
      .from("order_items")
      .select("id, product_id, quantity_units, unit_label, line_weight_kg")
      .eq("order_id", order.id)
      .eq("participant_id", participant.id);
    if (participantItemsError) throw participantItemsError;

    for (const item of (participantItems as DbOrderItemRow[] | null) ?? []) {
      await updateOrderItemQuantity(serviceClient, {
        order,
        participantId: participant.id,
        orderItemId: item.id,
        productId: item.product_id,
        quantityUnits: getOrderItemQuantity(item),
      });
    }

    const refreshedParticipant = await getParticipantByProfile(serviceClient, order.id, checkoutPaymentSession.profile_id);
    if (!refreshedParticipant) {
      throw new Error("Participant not found after repricing");
    }

    const { data: participantPayments, error: participantPaymentsError } = await serviceClient
      .from("payments")
      .select("amount_cents, refunded_amount_cents, status")
      .eq("order_id", order.id)
      .eq("participant_id", refreshedParticipant.id);
    if (participantPaymentsError) throw participantPaymentsError;
    const alreadyPaidCents = ((participantPayments as Array<Record<string, unknown>> | null) ?? []).reduce(
      (sum, payment) => {
        const status = normalizeText(payment.status);
        if (status !== "paid" && status !== "authorized") return sum;
        return sum + Math.max(0, Number(payment.amount_cents ?? 0) - Number(payment.refunded_amount_cents ?? 0));
      },
      0,
    );
    const amountDueCents = Math.max(0, Number(refreshedParticipant.total_amount_cents ?? 0) - alreadyPaidCents);
    const coopBalanceCents = draft.useCoopBalance
      ? await fetchCoopBalance(serviceClient, checkoutPaymentSession.profile_id)
      : 0;
    const coopToConsumeCents = draft.useCoopBalance ? Math.min(coopBalanceCents, amountDueCents) : 0;
    const paidAmountCents = Math.max(0, amountDueCents - coopToConsumeCents);

    if (paidAmountCents <= 0) {
      if (coopToConsumeCents <= 0) {
        throw new Error("No payable amount remains after repricing");
      }
      await issueParticipantInvoiceWithCoop(serviceClient, {
        orderId: order.id,
        profileId: checkoutPaymentSession.profile_id,
        coopAppliedCents: coopToConsumeCents,
      });
      await triggerOutgoingEmails(serviceClient);
      return;
    }

    const payment = await createPaymentStub(serviceClient, {
      orderId: order.id,
      participantId: refreshedParticipant.id,
      amountCents: paidAmountCents,
      provider: checkoutPaymentSession.provider ?? "stripe",
      providerPaymentId: checkoutPaymentSession.provider_payment_id,
      idempotencyKey: checkoutPaymentSession.idempotency_key,
      raw: {
        flow_kind: "participant",
        checkout_payment_session_id: checkoutPaymentSession.id,
        use_coop_balance: draft.useCoopBalance,
        stripe_status: stripeSession.status ?? null,
        payment_status: stripeSession.payment_status ?? null,
        payment_intent_id: typeof stripeSession.payment_intent === "string"
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id ?? null,
      },
    });
    createdPaymentId = payment.id;
    await finalizePaymentSimulation(serviceClient, payment.id);
  } catch (error) {
    if (!createdPaymentId) {
      for (const orderItemId of createdItemIds.slice().reverse()) {
        try {
          await deleteOrderItem(serviceClient, {
            orderItemId,
            orderId: order.id,
            participantId: participant.id,
          });
        } catch (rollbackError) {
          console.error("Participant order item rollback error:", rollbackError);
        }
      }
      if (participantCreatedInFlow) {
        try {
          await deleteParticipantIfNoActivity(serviceClient, {
            orderId: order.id,
            participantId: participant.id,
          });
        } catch (rollbackError) {
          console.error("Participant rollback error:", rollbackError);
        }
      }
    }
    throw error;
  }
}

async function ensureSharerInvoiceExists(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  sharerProfileId: string,
) {
  const { data, error } = await serviceClient
    .from("factures")
    .select("id")
    .eq("order_id", orderId)
    .eq("serie", "PROD_CLIENT")
    .eq("client_profile_id", sharerProfileId)
    .limit(1);
  if (error) throw error;
  if (((data as Array<Record<string, unknown>> | null) ?? []).length === 0) {
    await issueSharerInvoiceAfterLock(serviceClient, orderId);
  }
}

async function finalizeCloseCheckoutSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSession: CheckoutPaymentSessionRow,
  stripeSession: StripeCheckoutSession,
) {
  if (!checkoutPaymentSession.provider_payment_id) {
    throw new Error("Missing provider_payment_id on checkout payment session");
  }
  const order = await getOrderById(serviceClient, checkoutPaymentSession.order_id);
  if (order.sharer_profile_id !== checkoutPaymentSession.profile_id) {
    throw new Error("Only the sharer can finalize close payment");
  }
  const draft = parseCloseDraft(checkoutPaymentSession.draft_payload);
  const { data: sharerParticipantData, error: sharerParticipantError } = await serviceClient
    .from("order_participants")
    .select("id, order_id, profile_id, participation_status, role, total_amount_cents")
    .eq("order_id", order.id)
    .eq("role", "sharer")
    .maybeSingle();
  if (sharerParticipantError || !sharerParticipantData) {
    throw sharerParticipantError ?? new Error("Sharer participant not found");
  }
  const sharerParticipant = sharerParticipantData as DbParticipantRow;
  const existingPayment = await findExistingPaymentByProviderPaymentId(
    serviceClient,
    checkoutPaymentSession.provider_payment_id,
  );

  if (existingPayment) {
    if (existingPayment.status === "pending") {
      await finalizeClosePayment(serviceClient, existingPayment.id);
    } else if (existingPayment.status !== "paid" && existingPayment.status !== "authorized") {
      throw new Error("Existing close payment is not in a finalizable state");
    }
    if (order.status !== "locked") {
      await createLockClosePackage(serviceClient, order.id, draft.useCoopBalance);
    }
    await ensureSharerInvoiceExists(serviceClient, order.id, checkoutPaymentSession.profile_id);
    await triggerOutgoingEmails(serviceClient);
    return;
  }

  const { data: sharerItemsData, error: sharerItemsError } = await serviceClient
    .from("order_items")
    .select("id, product_id, quantity_units, unit_label, line_weight_kg")
    .eq("order_id", order.id)
    .eq("participant_id", sharerParticipant.id);
  if (sharerItemsError) throw sharerItemsError;

  const sharerItems = (sharerItemsData as DbOrderItemRow[] | null) ?? [];
  const currentSharerQuantities = sharerItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] ?? 0) + getOrderItemQuantity(item);
    return acc;
  }, {});

  const rollbackUpdates: Array<{ orderItemId: string; productId: string; previousQuantity: number }> = [];
  const createdItemIds: string[] = [];
  let paymentId: string | null = null;

  try {
    for (const [productId, extraQty] of Object.entries(draft.extraQuantities)) {
      const existingQty = currentSharerQuantities[productId] ?? 0;
      const targetQty = existingQty + extraQty;
      const existingItem = sharerItems.find((item) => item.product_id === productId);
      if (existingItem) {
        rollbackUpdates.push({
          orderItemId: existingItem.id,
          productId,
          previousQuantity: existingQty,
        });
        await updateOrderItemQuantity(serviceClient, {
          order,
          participantId: sharerParticipant.id,
          orderItemId: existingItem.id,
          productId,
          quantityUnits: targetQty,
        });
      } else {
        const createdItemId = await insertOrderItem(serviceClient, {
          order,
          participantId: sharerParticipant.id,
          productId,
          quantityUnits: targetQty,
        });
        createdItemIds.push(createdItemId);
      }
    }

    const payment = await createPaymentStub(serviceClient, {
      orderId: order.id,
      participantId: sharerParticipant.id,
      amountCents: checkoutPaymentSession.amount_cents,
      provider: checkoutPaymentSession.provider ?? "stripe",
      providerPaymentId: checkoutPaymentSession.provider_payment_id,
      idempotencyKey: checkoutPaymentSession.idempotency_key,
      raw: {
        flow_kind: "close",
        checkout_payment_session_id: checkoutPaymentSession.id,
        use_coop_balance: draft.useCoopBalance,
        stripe_status: stripeSession.status ?? null,
        payment_status: stripeSession.payment_status ?? null,
        payment_intent_id: typeof stripeSession.payment_intent === "string"
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id ?? null,
      },
    });
    paymentId = payment.id;
    await finalizeClosePayment(serviceClient, payment.id);
    await createLockClosePackage(serviceClient, order.id, draft.useCoopBalance);
    await ensureSharerInvoiceExists(serviceClient, order.id, checkoutPaymentSession.profile_id);
    await triggerOutgoingEmails(serviceClient);
  } catch (error) {
    if (!paymentId) {
      for (const orderItemId of createdItemIds.slice().reverse()) {
        try {
          await deleteOrderItem(serviceClient, {
            orderItemId,
            orderId: order.id,
            participantId: sharerParticipant.id,
          });
        } catch (rollbackError) {
          console.error("Close payment created item rollback error:", rollbackError);
        }
      }
      for (const rollbackUpdate of rollbackUpdates.slice().reverse()) {
        try {
          await updateOrderItemQuantity(serviceClient, {
            order,
            participantId: sharerParticipant.id,
            orderItemId: rollbackUpdate.orderItemId,
            productId: rollbackUpdate.productId,
            quantityUnits: rollbackUpdate.previousQuantity,
          });
        } catch (rollbackError) {
          console.error("Close payment quantity rollback error:", rollbackError);
        }
      }
    }
    throw error;
  }
}

function buildPublicStatus(
  checkoutPaymentSession: CheckoutPaymentSessionRow,
  stripeSession: StripeCheckoutSession | null,
  errorMessage?: string | null,
): FinalizeResult {
  const stripeStatus = stripeSession?.status ?? null;
  const paymentStatus = stripeSession?.payment_status ?? null;
  let status: "processing" | "succeeded" | "failed" | "retryable" = "processing";
  if (checkoutPaymentSession.status === "fulfilled") {
    status = "succeeded";
  } else if (checkoutPaymentSession.status === "failed" || checkoutPaymentSession.status === "expired") {
    status = "retryable";
  } else if (mapStripeStatusToInternal(stripeStatus, paymentStatus) === "failed") {
    status = "failed";
  }
  return {
    checkoutPaymentSession,
    stripeSession,
    status,
    errorMessage: errorMessage ?? checkoutPaymentSession.error_message ?? null,
  };
}

export async function finalizeCheckoutPaymentSession(params: {
  checkoutPaymentSessionId?: string | null;
  providerPaymentId?: string | null;
  checkoutSessionId?: string | null;
}) {
  assertServerEnv();
  const serviceClient = createServiceClient();
  const checkoutPaymentSession = await getCheckoutPaymentSession(serviceClient, {
    id: params.checkoutPaymentSessionId,
    providerPaymentId: params.providerPaymentId,
    checkoutSessionId: params.checkoutSessionId,
  });
  if (!checkoutPaymentSession) {
    throw new Error("Checkout payment session not found");
  }

  const stripeSessionId = normalizeText(checkoutPaymentSession.checkout_session_id) ||
    normalizeText(checkoutPaymentSession.provider_payment_id);
  if (!stripeSessionId) {
    return buildPublicStatus(checkoutPaymentSession, null, "Checkout session not initialized");
  }

  const stripeSession = await retrieveStripeCheckoutSession(stripeSessionId);
  const paymentStatus = mapStripeStatusToInternal(stripeSession.status ?? null, stripeSession.payment_status ?? null);
  if (paymentStatus === "failed") {
    const updated = await updateCheckoutPaymentSession(serviceClient, checkoutPaymentSession.id, {
      status: stripeSession.status === "expired" ? "expired" : "failed",
      error_code: stripeSession.status === "expired" ? "stripe_session_expired" : "stripe_payment_failed",
      error_message: stripeSession.status === "expired"
        ? "La session Stripe a expire."
        : "Le paiement Stripe n a pas abouti.",
    });
    return buildPublicStatus(updated, stripeSession);
  }

  if (paymentStatus === "pending") {
    if (checkoutPaymentSession.status === "draft") {
      const updated = await updateCheckoutPaymentSession(serviceClient, checkoutPaymentSession.id, {
        status: "checkout_created",
        error_code: null,
        error_message: null,
      });
      return buildPublicStatus(updated, stripeSession);
    }
    return buildPublicStatus(checkoutPaymentSession, stripeSession);
  }

  if (checkoutPaymentSession.status === "fulfilled") {
    return buildPublicStatus(checkoutPaymentSession, stripeSession);
  }

  const { data: claimedRows, error: claimError } = await serviceClient
    .from("checkout_payment_sessions")
    .update({
      status: "fulfilling",
      error_code: null,
      error_message: null,
      checkout_session_id: stripeSession.id,
      provider_payment_id: stripeSession.id,
    })
    .eq("id", checkoutPaymentSession.id)
    .in("status", ["draft", "checkout_created", "checkout_completed", "failed"])
    .select("*");
  if (claimError) throw claimError;
  const claimedRow = ((claimedRows as CheckoutPaymentSessionRow[] | null) ?? [])[0] ?? null;
  if (!claimedRow) {
    const refreshed = await getCheckoutPaymentSession(serviceClient, { id: checkoutPaymentSession.id });
    if (!refreshed) throw new Error("Checkout payment session disappeared");
    return buildPublicStatus(refreshed, stripeSession);
  }

  try {
    if (claimedRow.flow_kind === "participant") {
      await finalizeParticipantCheckoutSession(serviceClient, claimedRow, stripeSession);
    } else {
      await finalizeCloseCheckoutSession(serviceClient, claimedRow, stripeSession);
    }
    const updated = await updateCheckoutPaymentSession(serviceClient, claimedRow.id, {
      status: "fulfilled",
      checkout_session_id: stripeSession.id,
      provider_payment_id: stripeSession.id,
      error_code: null,
      error_message: null,
      fulfilled_at: new Date().toISOString(),
    });
    return buildPublicStatus(updated, stripeSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updated = await updateCheckoutPaymentSession(serviceClient, claimedRow.id, {
      status: "failed",
      checkout_session_id: stripeSession.id,
      provider_payment_id: stripeSession.id,
      error_code: "finalization_error",
      error_message: message,
    });
    return buildPublicStatus(updated, stripeSession, message);
  }
}

export async function buildCheckoutPaymentSessionStatusResponse(
  checkoutPaymentSession: CheckoutPaymentSessionRow,
  stripeSession: StripeCheckoutSession | null,
  userId?: string | null,
) {
  if (userId && checkoutPaymentSession.profile_id !== userId) {
    throw new Error("Forbidden");
  }
  const result = buildPublicStatus(checkoutPaymentSession, stripeSession);
  return {
    checkout_payment_session_id: checkoutPaymentSession.id,
    provider_payment_id: checkoutPaymentSession.provider_payment_id,
    local_status: checkoutPaymentSession.status,
    status: result.status,
    can_retry: result.status === "retryable" || result.status === "failed",
    error_message: result.errorMessage,
    stripe_status: stripeSession?.status ?? null,
    payment_status: stripeSession?.payment_status ?? null,
    customer_email: stripeSession?.customer_details?.email ?? stripeSession?.customer_email ?? null,
    customer_phone: stripeSession?.customer_details?.phone ?? null,
    payment_intent_id: typeof stripeSession?.payment_intent === "string"
      ? stripeSession.payment_intent
      : stripeSession?.payment_intent?.id ?? null,
  };
}

export async function createCheckoutPaymentSessionDraft(params: {
  authUserId: string;
  orderId: string;
  flowKind: CheckoutFlowKind;
  amountCents: number;
  draftPayload: JsonRecord;
}) {
  assertServerEnv();
  const serviceClient = createServiceClient();
  const order = await getOrderById(serviceClient, params.orderId);
  if (params.flowKind === "close" && order.sharer_profile_id !== params.authUserId) {
    throw new Error("Only the sharer can create a close payment session");
  }
  const payload = {
    order_id: params.orderId,
    profile_id: params.authUserId,
    flow_kind: params.flowKind,
    status: "draft",
    draft_payload: params.draftPayload,
    amount_cents: Math.max(0, Math.round(params.amountCents)),
    currency: "EUR",
    provider: "stripe",
    idempotency_key: generateIdempotencyKey(),
    error_code: null,
    error_message: null,
  };
  const { data, error } = await serviceClient
    .from("checkout_payment_sessions")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Unable to create checkout payment session");
  return data as CheckoutPaymentSessionRow;
}

export async function verifySessionOwnership(
  authUserId: string,
  params: { checkoutPaymentSessionId?: string | null; providerPaymentId?: string | null; checkoutSessionId?: string | null },
) {
  assertServerEnv();
  const serviceClient = createServiceClient();
  const checkoutPaymentSession = await getCheckoutPaymentSession(serviceClient, {
    id: params.checkoutPaymentSessionId,
    providerPaymentId: params.providerPaymentId,
    checkoutSessionId: params.checkoutSessionId,
  });
  if (!checkoutPaymentSession) {
    throw new Error("Checkout payment session not found");
  }
  if (checkoutPaymentSession.profile_id !== authUserId) {
    throw new Error("Forbidden");
  }
  return checkoutPaymentSession;
}
