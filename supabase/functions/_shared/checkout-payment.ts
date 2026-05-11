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

type CheckoutPaymentMode = "stripe_checkout" | "direct_charge" | "local_zero";

type PaymentBreakdown = {
  total_economic_cents: number;
  coop_credit_used_cents: number;
  card_amount_cents: number;
  producer_net_target_cents: number;
  platform_retained_target_cents: number;
  platform_service_fee_cents: number;
  sharer_value_cents: number;
  platform_delivery_retained_cents: number;
  producer_delivery_cents: number;
  stripe_application_fee_amount_cents: number;
  producer_card_net_cents: number;
  producer_topup_due_cents: number;
};

type CheckoutPaymentSessionRow = {
  id: string;
  checkout_session_id: string | null;
  order_id: string;
  profile_id: string;
  participant_id?: string | null;
  flow_kind: CheckoutFlowKind;
  status: CheckoutPaymentSessionStatus;
  payment_mode?: CheckoutPaymentMode;
  payment_breakdown?: JsonRecord | null;
  stripe_account_id?: string | null;
  stripe_payment_intent_id?: string | null;
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
  payment_intent_data?: { application_fee_amount?: number | null } | null;
  payment_intent?: string | { id?: string | null } | null;
};

type DbPaymentRow = {
  id: string;
  participant_id: string;
  provider_payment_id: string | null;
  status: string;
};

type ProducerLegalEntityRow = {
  id: string;
  profile_id: string;
  stripe_account_id: string | null;
  stripe_ready_for_orders: boolean | null;
  stripe_connection_status: string | null;
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
  producer_profile_id: string;
  status: string;
  effective_weight_kg: number;
  delivery_fee_cents: number;
  pickup_delivery_fee_cents?: number | null;
  delivery_option: "chronofresh" | "producer_delivery" | "producer_pickup";
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
  lot_id: string | null;
  participant_id: string;
  quantity_units: number;
  unit_label: string | null;
  unit_weight_kg: number | null;
  unit_base_price_cents: number;
  unit_delivery_cents: number;
  unit_sharer_fee_cents: number;
  unit_final_price_cents: number;
  line_total_cents: number;
  line_weight_kg: number | null;
  is_sharer_share?: boolean | null;
};

type LotReservationStatus = "active" | "released" | "consumed" | "expired";

type DbLotReservationRow = {
  id: string;
  lot_id: string;
  order_id: string;
  order_item_id: string | null;
  participant_id: string | null;
  checkout_payment_session_id: string | null;
  reserved_units: number | null;
  reserved_kg: number | null;
  status: LotReservationStatus;
  expires_at: string | null;
  reservation_kind: string;
  created_at: string;
};

type DbLotRow = {
  id: string;
  product_id: string;
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

const PAYMENT_BREAKDOWN_KEYS = [
  "total_economic_cents",
  "coop_credit_used_cents",
  "card_amount_cents",
  "producer_net_target_cents",
  "platform_retained_target_cents",
  "platform_service_fee_cents",
  "sharer_value_cents",
  "platform_delivery_retained_cents",
  "producer_delivery_cents",
  "stripe_application_fee_amount_cents",
  "producer_card_net_cents",
  "producer_topup_due_cents",
] as const;

const emptyPaymentBreakdown = (): PaymentBreakdown => ({
  total_economic_cents: 0,
  coop_credit_used_cents: 0,
  card_amount_cents: 0,
  producer_net_target_cents: 0,
  platform_retained_target_cents: 0,
  platform_service_fee_cents: 0,
  sharer_value_cents: 0,
  platform_delivery_retained_cents: 0,
  producer_delivery_cents: 0,
  stripe_application_fee_amount_cents: 0,
  producer_card_net_cents: 0,
  producer_topup_due_cents: 0,
});

const toNonNegativeInteger = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) || 0));

export const parsePaymentBreakdown = (value: unknown): PaymentBreakdown => {
  const source = isRecord(value) ? value : {};
  return PAYMENT_BREAKDOWN_KEYS.reduce((acc, key) => {
    acc[key] = toNonNegativeInteger(source[key]);
    return acc;
  }, emptyPaymentBreakdown());
};

const serializePaymentBreakdown = (value: PaymentBreakdown): JsonRecord => ({ ...value });

const getStripeApiBase = () => STRIPE_API_BASE.replace(/\/+$/, "");

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

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretKey = STRIPE_WEBHOOK_SECRET,
) {
  if (!secretKey) {
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
    encoder.encode(secretKey),
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

async function reserveLotStock(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    lotId: string;
    orderId: string;
    reservedUnits?: number | null;
    reservedKg?: number | null;
    status?: Extract<LotReservationStatus, "active" | "consumed">;
    reservationKind?: string;
    orderItemId?: string | null;
    participantId?: string | null;
    checkoutPaymentSessionId?: string | null;
    expiresAt?: string | null;
    reservationId?: string | null;
  },
) {
  const { data, error } = await serviceClient.rpc("reserve_lot_stock", {
    p_lot_id: params.lotId,
    p_order_id: params.orderId,
    p_reserved_units: params.reservedUnits ?? null,
    p_reserved_kg: params.reservedKg ?? null,
    p_status: params.status ?? "active",
    p_reservation_kind: params.reservationKind ?? "order_item",
    p_order_item_id: params.orderItemId ?? null,
    p_participant_id: params.participantId ?? null,
    p_checkout_payment_session_id: params.checkoutPaymentSessionId ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_reservation_id: params.reservationId ?? null,
  });
  if (error || !data) throw error ?? new Error("Unable to reserve lot stock");
  return String(data);
}

async function consumeLotReservation(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    reservationId: string;
    orderItemId?: string | null;
    participantId?: string | null;
    reservationKind?: string | null;
  },
) {
  const { error } = await serviceClient.rpc("consume_lot_reservation", {
    p_reservation_id: params.reservationId,
    p_order_item_id: params.orderItemId ?? null,
    p_participant_id: params.participantId ?? null,
    p_reservation_kind: params.reservationKind ?? null,
  });
  if (error) throw error;
}

async function releaseCheckoutSessionLotReservations(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSessionId: string,
  status: Extract<LotReservationStatus, "released" | "expired"> = "released",
) {
  const { error } = await serviceClient.rpc("release_checkout_session_lot_reservations", {
    p_checkout_payment_session_id: checkoutPaymentSessionId,
    p_status: status,
  });
  if (error) throw error;
}

async function releaseReservationsForOrderItem(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderItemId: string,
  status: Extract<LotReservationStatus, "released" | "expired"> = "released",
) {
  const { data, error } = await serviceClient
    .from("lot_reservations")
    .select("*")
    .eq("order_item_id", orderItemId)
    .in("status", ["active", "consumed"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const reservations = (data as DbLotReservationRow[] | null) ?? [];
  for (const reservation of reservations) {
    const { error: releaseError } = await serviceClient.rpc("release_lot_reservation", {
      p_reservation_id: reservation.id,
      p_status: status,
    });
    if (releaseError) throw releaseError;
  }
  return reservations;
}

async function fetchPrimaryReservationForOrderItem(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderItemId: string,
) {
  const { data, error } = await serviceClient
    .from("lot_reservations")
    .select("*")
    .eq("order_item_id", orderItemId)
    .in("status", ["active", "consumed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DbLotReservationRow | null) ?? null;
}

async function listCheckoutSessionReservations(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSessionId: string,
) {
  const { data, error } = await serviceClient
    .from("lot_reservations")
    .select("*")
    .eq("checkout_payment_session_id", checkoutPaymentSessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const reservations = (data as DbLotReservationRow[] | null) ?? [];
  const lotIds = Array.from(new Set(reservations.map((reservation) => reservation.lot_id).filter(Boolean)));
  const lotMap = new Map<string, DbLotRow>();
  if (lotIds.length > 0) {
    const { data: lotsData, error: lotsError } = await serviceClient
      .from("lots")
      .select("id, product_id")
      .in("id", lotIds);
    if (lotsError) throw lotsError;
    ((lotsData as DbLotRow[] | null) ?? []).forEach((lot) => {
      lotMap.set(lot.id, lot);
    });
  }
  return reservations
    .map((reservation) => {
      const lot = lotMap.get(reservation.lot_id);
      if (!lot?.product_id) return null;
      return {
        ...reservation,
        product_id: lot.product_id,
      };
    })
    .filter(Boolean) as Array<DbLotReservationRow & { product_id: string }>;
}

async function retrieveStripeCheckoutSession(checkoutSessionId: string, stripeAccountId?: string | null) {
  assertServerEnv();
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };
  const normalizedStripeAccountId = normalizeText(stripeAccountId);
  if (normalizedStripeAccountId) {
    headers["Stripe-Account"] = normalizedStripeAccountId;
  }
  const response = await fetch(
    `${getStripeApiBase()}/checkout/sessions/${encodeURIComponent(checkoutSessionId)}?expand[]=payment_intent`,
    {
      headers,
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
    providerPaymentId: string | null;
    idempotencyKey: string | null;
    stripeAccountId?: string | null;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
    stripeChargeId?: string | null;
    legalEntityId?: string | null;
    paymentBreakdown?: PaymentBreakdown;
    raw: JsonRecord;
  },
) {
  const breakdown = params.paymentBreakdown ?? emptyPaymentBreakdown();
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
      stripe_account_id: params.stripeAccountId ?? null,
      stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
      stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
      stripe_charge_id: params.stripeChargeId ?? null,
      legal_entity_id: params.legalEntityId ?? null,
      total_economic_cents: breakdown.total_economic_cents,
      coop_credit_used_cents: breakdown.coop_credit_used_cents,
      card_amount_cents: breakdown.card_amount_cents,
      platform_retained_target_cents: breakdown.platform_retained_target_cents,
      platform_service_fee_cents: breakdown.platform_service_fee_cents,
      sharer_value_cents: breakdown.sharer_value_cents,
      platform_delivery_retained_cents: breakdown.platform_delivery_retained_cents,
      producer_delivery_cents: breakdown.producer_delivery_cents,
      stripe_application_fee_amount_cents: breakdown.stripe_application_fee_amount_cents,
      producer_net_target_cents: breakdown.producer_net_target_cents,
      producer_card_net_cents: breakdown.producer_card_net_cents,
      producer_topup_due_cents: breakdown.producer_topup_due_cents,
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

async function upsertProducerTopup(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    orderId: string;
    participantId: string;
    paymentId: string;
    legalEntityId: string;
    producerStripeAccountId: string;
    amountCents: number;
  },
) {
  const amountCents = toNonNegativeInteger(params.amountCents);
  if (amountCents <= 0) {
    return null;
  }
  const payload = {
    order_id: params.orderId,
    participant_id: params.participantId,
    payment_id: params.paymentId,
    legal_entity_id: params.legalEntityId,
    producer_stripe_account_id: params.producerStripeAccountId,
    amount_cents: amountCents,
    status: "pending",
    error_message: null,
  };
  const { data, error } = await serviceClient
    .from("producer_topups")
    .upsert(payload, { onConflict: "payment_id" })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Impossible d'enregistrer le complément producteur.");
  return data as Record<string, unknown>;
}

const parseStripeError = (stripeJson: any) => {
  const message = typeof stripeJson?.error?.message === "string"
    ? stripeJson.error.message
    : "Erreur Stripe.";
  const code = normalizeText(stripeJson?.error?.code) || null;
  return { message, code };
};

export async function processProducerTopupsForOrder(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
) {
  assertServerEnv();
  const { data: orderRow, error: orderError } = await serviceClient
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) throw new Error("Commande introuvable pour le traitement des compléments.");
  const orderStatus = normalizeText((orderRow as Record<string, unknown>).status);
  if (!["confirmed", "preparing", "prepared", "delivered", "distributed", "finished"].includes(orderStatus)) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, needsFunding: 0 };
  }

  const { data, error } = await serviceClient
    .from("producer_topups")
    .select("*")
    .eq("order_id", orderId)
    .in("status", ["pending", "failed", "needs_funding"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let needsFunding = 0;

  for (const topup of (data as Array<Record<string, unknown>> | null) ?? []) {
    processed += 1;
    const transferId = normalizeText(topup.stripe_transfer_id);
    if (transferId) {
      skipped += 1;
      continue;
    }
    const amountCents = toNonNegativeInteger(topup.amount_cents);
    if (amountCents <= 0) {
      await serviceClient
        .from("producer_topups")
        .update({ status: "cancelled", error_message: null })
        .eq("id", topup.id);
      skipped += 1;
      continue;
    }

    const form = new URLSearchParams();
    form.append("amount", String(amountCents));
    form.append("currency", "eur");
    form.append("destination", normalizeText(topup.producer_stripe_account_id));
    form.append("metadata[order_id]", normalizeText(topup.order_id));
    form.append("metadata[participant_id]", normalizeText(topup.participant_id));
    form.append("metadata[payment_id]", normalizeText(topup.payment_id));
    form.append("metadata[reason]", "coop_credit_topup");

    const stripeRes = await fetch(`${getStripeApiBase()}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `topup_payment_${normalizeText(topup.payment_id)}`,
      },
      body: form.toString(),
    });
    const stripeJson = await stripeRes.json().catch(() => ({}));

    if (!stripeRes.ok) {
      const parsedError = parseStripeError(stripeJson);
      const nextStatus =
        parsedError.code === "balance_insufficient" || parsedError.message.toLowerCase().includes("insufficient")
          ? "needs_funding"
          : "failed";
      await serviceClient
        .from("producer_topups")
        .update({
          status: nextStatus,
          error_message: parsedError.message,
        })
        .eq("id", topup.id);
      if (nextStatus === "needs_funding") {
        needsFunding += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    await serviceClient
      .from("producer_topups")
      .update({
        status: "sent",
        stripe_transfer_id: normalizeText(stripeJson?.id),
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", topup.id);
    sent += 1;
  }

  return { processed, sent, skipped, failed, needsFunding };
}

async function creditCoopBalance(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { profileId: string; orderId: string; amountCents: number; paymentId: string },
) {
  const amountCents = toNonNegativeInteger(params.amountCents);
  if (amountCents <= 0) return;
  const { data: balanceRow, error: balanceError } = await serviceClient
    .from("coop_balances")
    .select("balance_cents")
    .eq("profile_id", params.profileId)
    .maybeSingle();
  if (balanceError) throw balanceError;
  const nextBalance = toNonNegativeInteger(balanceRow?.balance_cents) + amountCents;
  const { error: upsertError } = await serviceClient
    .from("coop_balances")
    .upsert({
      profile_id: params.profileId,
      balance_cents: nextBalance,
      updated_at: new Date().toISOString(),
    });
  if (upsertError) throw upsertError;
  const { error: ledgerError } = await serviceClient
    .from("coop_ledger")
    .insert({
      profile_id: params.profileId,
      order_id: params.orderId,
      delta_cents: amountCents,
      reason: "refund_credit_restore",
      metadata: {
        payment_id: params.paymentId,
      },
    });
  if (ledgerError) throw ledgerError;
}

export async function refundFullParticipantPayment(
  serviceClient: ReturnType<typeof createServiceClient>,
  paymentId: string,
) {
  assertServerEnv();
  const { data: paymentRow, error: paymentError } = await serviceClient
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!paymentRow) throw new Error("Paiement introuvable.");
  const payment = paymentRow as Record<string, unknown>;
  if (normalizeText(payment.status) === "refunded") {
    return {
      ok: true,
      payment_id: paymentId,
      already_refunded: true,
      had_topup_sent: false,
    };
  }
  const { data: participantRow, error: participantError } = await serviceClient
    .from("order_participants")
    .select("profile_id")
    .eq("id", payment.participant_id)
    .maybeSingle();
  if (participantError) throw participantError;

  const paymentIntentId = normalizeText(payment.stripe_payment_intent_id);
  const chargeId = normalizeText(payment.stripe_charge_id);
  const stripeAccountId = normalizeText(payment.stripe_account_id);
  if (toNonNegativeInteger(payment.amount_cents) > 0 && (!paymentIntentId && !chargeId)) {
    throw new Error("Aucun identifiant Stripe remboursable n'est enregistré pour ce paiement.");
  }

  if (toNonNegativeInteger(payment.amount_cents) > 0) {
    const form = new URLSearchParams();
    if (paymentIntentId) {
      form.append("payment_intent", paymentIntentId);
    } else {
      form.append("charge", chargeId);
    }
    form.append("refund_application_fee", "true");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund_payment_${paymentId}`,
    };
    if (stripeAccountId) {
      headers["Stripe-Account"] = stripeAccountId;
    }
    const stripeRes = await fetch(`${getStripeApiBase()}/refunds`, {
      method: "POST",
      headers,
      body: form.toString(),
    });
    const stripeJson = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      const parsedError = parseStripeError(stripeJson);
      throw new Error(parsedError.message);
    }
  }

  const { data: topups, error: topupsError } = await serviceClient
    .from("producer_topups")
    .select("*")
    .eq("payment_id", paymentId);
  if (topupsError) throw topupsError;
  for (const topup of (topups as Array<Record<string, unknown>> | null) ?? []) {
    const currentStatus = normalizeText(topup.status);
    if (currentStatus === "pending" || currentStatus === "failed" || currentStatus === "needs_funding") {
      await serviceClient
        .from("producer_topups")
        .update({ status: "cancelled", error_message: null })
        .eq("id", topup.id);
    }
  }

  const coopCreditUsedCents = toNonNegativeInteger(payment.coop_credit_used_cents);
  const participantProfileId = normalizeText(participantRow?.profile_id);
  if (coopCreditUsedCents > 0 && participantProfileId) {
    await creditCoopBalance(serviceClient, {
      profileId: participantProfileId,
      orderId: normalizeText(payment.order_id),
      amountCents: coopCreditUsedCents,
      paymentId,
    });
  }

  const { error: updateError } = await serviceClient
    .from("payments")
    .update({
      status: "refunded",
      refunded_amount_cents: toNonNegativeInteger(payment.amount_cents),
      failure_code: null,
      failure_message: null,
      updated_at: new Date().toISOString(),
      raw: {
        ...(isRecord(payment.raw) ? payment.raw : {}),
        refund_handled_at: new Date().toISOString(),
      },
    })
    .eq("id", paymentId);
  if (updateError) throw updateError;

  return {
    ok: true,
    payment_id: paymentId,
    had_topup_sent: ((topups as Array<Record<string, unknown>> | null) ?? []).some(
      (topup) => normalizeText(topup.status) === "sent",
    ),
  };
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

async function getProducerLegalEntityForPayments(
  serviceClient: ReturnType<typeof createServiceClient>,
  producerProfileId: string,
) {
  const { data, error } = await serviceClient
    .from("legal_entities")
    .select("id, profile_id, stripe_account_id, stripe_ready_for_orders, stripe_connection_status")
    .eq("profile_id", producerProfileId)
    .maybeSingle();
  if (error) throw error;
  const legalEntity = (data as ProducerLegalEntityRow | null) ?? null;
  if (!legalEntity) {
    throw new Error("Structure producteur introuvable pour ce paiement.");
  }
  const stripeAccountId = normalizeText(legalEntity.stripe_account_id);
  if (!stripeAccountId) {
    throw new Error("Le producteur n'a pas encore de compte Stripe Connect.");
  }
  if (!legalEntity.stripe_ready_for_orders) {
    throw new Error("Le compte Stripe du producteur n'est pas encore prêt à recevoir des paiements.");
  }
  return {
    legalEntityId: legalEntity.id,
    stripeAccountId,
    stripeConnectionStatus: normalizeText(legalEntity.stripe_connection_status) || null,
  };
}

async function getOrderById(serviceClient: ReturnType<typeof createServiceClient>, orderId: string) {
  const { data, error } = await serviceClient
    .from("orders")
    .select(
      "id, order_code, auto_approve_participation_requests, sharer_profile_id, producer_profile_id, status, effective_weight_kg, delivery_fee_cents, pickup_delivery_fee_cents, delivery_option, sharer_percentage",
    )
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

async function listParticipantOrderItems(
  serviceClient: ReturnType<typeof createServiceClient>,
  orderId: string,
  participantId: string,
) {
  const { data, error } = await serviceClient
    .from("order_items")
    .select("id, product_id, lot_id, participant_id, quantity_units, unit_label, unit_weight_kg, unit_base_price_cents, unit_delivery_cents, unit_sharer_fee_cents, unit_final_price_cents, line_total_cents, line_weight_kg, created_at, updated_at")
    .eq("order_id", orderId)
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as DbOrderItemRow[] | null) ?? [];
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
    lotId?: string | null;
    isSharerShare?: boolean;
    skipStockReservation?: boolean;
    reservationStatus?: Extract<LotReservationStatus, "active" | "consumed">;
    reservationKind?: string;
    reservationExpiresAt?: string | null;
    checkoutPaymentSessionId?: string | null;
    skipRecompute?: boolean;
  },
) {
  const [orderProduct, productListing, activeLotsByProductId] = await Promise.all([
    getOrderProductRow(serviceClient, params.order.id, params.productId),
    getProductListingRow(serviceClient, params.productId),
    fetchLatestActiveLotsByProductId(serviceClient, [params.productId]),
  ]);
  const fallbackLot = activeLotsByProductId.get(params.productId) ?? null;
  const resolvedLotId = normalizeText(params.lotId) || normalizeText(productListing.active_lot_id) ||
    normalizeText(fallbackLot?.id);
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
      is_sharer_share: Boolean(params.isSharerShare),
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Unable to add order item");
  const orderItemId = normalizeText((data as Record<string, unknown>).id);
  if (!params.skipStockReservation) {
    try {
      await reserveLotStock(serviceClient, {
        lotId: resolvedLotId,
        orderId: params.order.id,
        orderItemId,
        participantId: params.participantId,
        checkoutPaymentSessionId: params.checkoutPaymentSessionId ?? null,
        reservedUnits: isKgSaleUnit(productListing.sale_unit) ? null : storedQuantityUnits,
        reservedKg: isKgSaleUnit(productListing.sale_unit) ? pricing.lineWeightKg : null,
        status: params.reservationStatus ?? "active",
        reservationKind: params.reservationKind ?? (params.isSharerShare ? "sharer_initial" : "order_item"),
        expiresAt: params.reservationStatus === "consumed"
          ? null
          : params.reservationExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    } catch (reservationError) {
      await serviceClient.from("order_items").delete().eq("id", orderItemId);
      throw reservationError;
    }
  }
  if (!params.skipRecompute) {
    await recomputeCaches(serviceClient, params.order.id, params.participantId);
  }
  return orderItemId;
}

async function updateOrderItemQuantity(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    order: DbOrderRow;
    participantId: string;
    orderItemId: string;
    productId: string;
    quantityUnits: number;
    skipStockReservation?: boolean;
    skipRecompute?: boolean;
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
  const { data: currentItemData, error: currentItemError } = await serviceClient
    .from("order_items")
    .select("*")
    .eq("id", params.orderItemId)
    .maybeSingle();
  if (currentItemError || !currentItemData) throw currentItemError ?? new Error("Order item not found");
  const previousItem = currentItemData as DbOrderItemRow;
  const reservation = await fetchPrimaryReservationForOrderItem(serviceClient, params.orderItemId);
  const nextItemPayload = {
    quantity_units: storedQuantityUnits,
    unit_weight_kg: unitWeightKg,
    unit_base_price_cents: unitBasePriceCents,
    unit_delivery_cents: pricing.unitDeliveryCents,
    unit_sharer_fee_cents: pricing.unitSharerFeeCents,
    unit_final_price_cents: pricing.unitFinalPriceCents,
    line_total_cents: pricing.lineTotalCents,
    line_weight_kg: pricing.lineWeightKg,
  };
  const { error } = await serviceClient
    .from("order_items")
    .update(nextItemPayload)
    .eq("id", params.orderItemId);
  if (error) throw error;
  if (!params.skipStockReservation && reservation?.id && previousItem.lot_id) {
    try {
      await reserveLotStock(serviceClient, {
        lotId: previousItem.lot_id,
        orderId: params.order.id,
        orderItemId: params.orderItemId,
        participantId: params.participantId,
        checkoutPaymentSessionId: reservation.checkout_payment_session_id,
        reservedUnits: isKgSaleUnit(productListing.sale_unit) ? null : storedQuantityUnits,
        reservedKg: isKgSaleUnit(productListing.sale_unit) ? pricing.lineWeightKg : null,
        status: reservation.status === "consumed" ? "consumed" : "active",
        reservationKind: reservation.reservation_kind,
        expiresAt: reservation.status === "consumed"
          ? null
          : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        reservationId: reservation.id,
      });
    } catch (reservationError) {
      await serviceClient
        .from("order_items")
        .update({
          quantity_units: previousItem.quantity_units,
          unit_weight_kg: previousItem.unit_weight_kg,
          unit_base_price_cents: previousItem.unit_base_price_cents,
          unit_delivery_cents: previousItem.unit_delivery_cents,
          unit_sharer_fee_cents: previousItem.unit_sharer_fee_cents,
          unit_final_price_cents: previousItem.unit_final_price_cents,
          line_total_cents: previousItem.line_total_cents,
          line_weight_kg: previousItem.line_weight_kg,
        })
        .eq("id", params.orderItemId);
      throw reservationError;
    }
  }
  if (!params.skipRecompute) {
    await recomputeCaches(serviceClient, params.order.id, params.participantId);
  }
}

async function deleteOrderItem(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: { orderItemId: string; orderId: string; participantId: string },
) {
  const releasedReservations = await releaseReservationsForOrderItem(serviceClient, params.orderItemId);
  const { error } = await serviceClient.from("order_items").delete().eq("id", params.orderItemId);
  if (error) {
    for (const reservation of releasedReservations) {
      try {
        await reserveLotStock(serviceClient, {
          lotId: reservation.lot_id,
          orderId: reservation.order_id,
          orderItemId: reservation.order_item_id,
          participantId: reservation.participant_id,
          checkoutPaymentSessionId: reservation.checkout_payment_session_id,
          reservedUnits: reservation.reserved_units,
          reservedKg: reservation.reserved_kg,
          status: reservation.status === "consumed" ? "consumed" : "active",
          reservationKind: reservation.reservation_kind,
          expiresAt: reservation.expires_at,
          reservationId: reservation.id,
        });
      } catch (restoreError) {
        console.error("Restore reservation error:", restoreError);
      }
    }
    throw error;
  }
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

async function buildCheckoutReservationPlans(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSession: CheckoutPaymentSessionRow,
) {
  const order = await getOrderById(serviceClient, checkoutPaymentSession.order_id);
  const quantities =
    checkoutPaymentSession.flow_kind === "close"
      ? parseCloseDraft(checkoutPaymentSession.draft_payload).extraQuantities
      : parseParticipantDraft(checkoutPaymentSession.draft_payload).quantities;

  const productIds = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId]) => productId);
  const activeLotsByProductId = await fetchLatestActiveLotsByProductId(serviceClient, productIds);

  const plans: Array<{
    productId: string;
    lotId: string;
    quantityUnits: number;
    storedQuantityUnits: number;
    saleUnit: string | null;
    reservedUnits: number | null;
    reservedKg: number | null;
    lineWeightKg: number;
    unitBasePriceCents: number;
    unitDeliveryCents: number;
    unitSharerFeeCents: number;
    unitFinalPriceCents: number;
    lineTotalCents: number;
  }> = [];
  for (const [productId, quantityUnits] of Object.entries(quantities)) {
    if (quantityUnits <= 0) continue;
    const [orderProduct, productListing] = await Promise.all([
      getOrderProductRow(serviceClient, checkoutPaymentSession.order_id, productId),
      getProductListingRow(serviceClient, productId),
    ]);
    const fallbackLot = activeLotsByProductId.get(productId) ?? null;
    const resolvedLotId = normalizeText(productListing.active_lot_id) || normalizeText(fallbackLot?.id);
    if (!resolvedLotId) {
      throw new Error("Lot actif introuvable pour ce produit.");
    }
    const fallbackUnitWeightKg = resolveUnitWeightKg(
      productListing.sale_unit,
      productListing.unit_weight_kg,
      productListing.packaging,
    );
    const unitWeightKg = resolveStoredUnitWeightKg(
      productListing.sale_unit,
      orderProduct.unit_weight_kg ?? fallbackUnitWeightKg,
      quantityUnits,
    );
    const storedQuantityUnits = normalizeQuantityUnitsForStorage(productListing.sale_unit, quantityUnits);
    const fallbackBasePriceCents = Math.max(
      0,
      Number(productListing.active_lot_price_cents ?? fallbackLot?.price_cents ?? productListing.default_price_cents ?? 0),
    );
    const unitBasePriceCents = resolveStoredUnitBasePriceCents(
      productListing.sale_unit,
      orderProduct.unit_base_price_cents ?? fallbackBasePriceCents,
      quantityUnits,
    );
    const pricing = calculateOrderItemPricing({
      order,
      basePriceCents: unitBasePriceCents,
      unitWeightKg,
      quantityUnits: storedQuantityUnits,
    });
    plans.push({
      productId,
      lotId: resolvedLotId,
      quantityUnits,
      storedQuantityUnits,
      saleUnit: productListing.sale_unit,
      reservedUnits: isKgSaleUnit(productListing.sale_unit) ? null : storedQuantityUnits,
      reservedKg: isKgSaleUnit(productListing.sale_unit) ? unitWeightKg * storedQuantityUnits : null,
      lineWeightKg: pricing.lineWeightKg ?? 0,
      unitBasePriceCents,
      unitDeliveryCents: pricing.unitDeliveryCents,
      unitSharerFeeCents: pricing.unitSharerFeeCents,
      unitFinalPriceCents: pricing.unitFinalPriceCents,
      lineTotalCents: pricing.lineTotalCents,
    });
  }

  return plans;
}

async function computePlatformServiceFeeFromPlans(
  serviceClient: ReturnType<typeof createServiceClient>,
  plans: Array<{ lotId: string; saleUnit: string | null; storedQuantityUnits: number; reservedKg: number | null }>,
) {
  const lotIds = Array.from(new Set(plans.map((plan) => plan.lotId).filter(Boolean)));
  if (!lotIds.length) return 0;
  const { data, error } = await serviceClient
    .from("lot_price_breakdown")
    .select("lot_id, value_type, value_cents")
    .in("lot_id", lotIds)
    .eq("source", "platform");
  if (error) throw error;

  const valuePerUnitByLot = new Map<string, number>();
  for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
    const lotId = normalizeText(row.lot_id);
    if (!lotId) continue;
    const valueType = normalizeText(row.value_type).toLowerCase();
    if (valueType && valueType !== "cents") {
      throw new Error(`Commission plateforme invalide sur le lot ${lotId}.`);
    }
    valuePerUnitByLot.set(lotId, (valuePerUnitByLot.get(lotId) ?? 0) + toNonNegativeInteger(row.value_cents));
  }

  return plans.reduce((sum, plan) => {
    const valuePerUnit = valuePerUnitByLot.get(plan.lotId) ?? 0;
    const unitsForShare = isKgSaleUnit(plan.saleUnit) ? Number(plan.reservedKg ?? 0) : plan.storedQuantityUnits;
    return sum + valuePerUnit * Math.max(0, Number(unitsForShare) || 0);
  }, 0);
}

async function computeParticipantPaymentBreakdownFromPlans(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    order: DbOrderRow;
    profileId: string;
    plans: Array<{
      lotId: string;
      saleUnit: string | null;
      storedQuantityUnits: number;
      reservedKg: number | null;
      unitDeliveryCents: number;
      unitSharerFeeCents: number;
      lineTotalCents: number;
    }>;
    coopBalanceCents: number;
    useCoopBalance: boolean;
  },
): Promise<PaymentBreakdown> {
  const totalEconomicCents = params.plans.reduce((sum, plan) => sum + toNonNegativeInteger(plan.lineTotalCents), 0);
  const coopCreditUsedCents = params.useCoopBalance ? Math.min(params.coopBalanceCents, totalEconomicCents) : 0;
  const cardAmountCents = Math.max(0, totalEconomicCents - coopCreditUsedCents);
  const platformServiceFeeCents = await computePlatformServiceFeeFromPlans(serviceClient, params.plans);
  const sharerValueCents = params.plans.reduce(
    (sum, plan) => sum + toNonNegativeInteger(plan.unitSharerFeeCents) * toNonNegativeInteger(plan.storedQuantityUnits),
    0,
  );
  const deliveryAllocatedCents = params.plans.reduce(
    (sum, plan) => sum + toNonNegativeInteger(plan.unitDeliveryCents) * toNonNegativeInteger(plan.storedQuantityUnits),
    0,
  );
  const platformDeliveryRetainedCents = params.order.delivery_option === "chronofresh" ? deliveryAllocatedCents : 0;
  const producerDeliveryCents = params.order.delivery_option === "producer_delivery" ? deliveryAllocatedCents : 0;
  const platformRetainedTargetCents =
    platformServiceFeeCents + sharerValueCents + platformDeliveryRetainedCents;
  const producerNetTargetCents = Math.max(0, totalEconomicCents - platformRetainedTargetCents);
  const stripeApplicationFeeAmountCents = Math.min(cardAmountCents, platformRetainedTargetCents);
  const producerCardNetCents = Math.max(0, cardAmountCents - stripeApplicationFeeAmountCents);
  const producerTopupDueCents = Math.max(0, producerNetTargetCents - producerCardNetCents);

  return {
    total_economic_cents: totalEconomicCents,
    coop_credit_used_cents: coopCreditUsedCents,
    card_amount_cents: cardAmountCents,
    producer_net_target_cents: producerNetTargetCents,
    platform_retained_target_cents: platformRetainedTargetCents,
    platform_service_fee_cents: platformServiceFeeCents,
    sharer_value_cents: sharerValueCents,
    platform_delivery_retained_cents: platformDeliveryRetainedCents,
    producer_delivery_cents: producerDeliveryCents,
    stripe_application_fee_amount_cents: stripeApplicationFeeAmountCents,
    producer_card_net_cents: producerCardNetCents,
    producer_topup_due_cents: producerTopupDueCents,
  };
}

async function computeParticipantPaymentBreakdownFromItems(
  serviceClient: ReturnType<typeof createServiceClient>,
  params: {
    order: DbOrderRow;
    items: DbOrderItemRow[];
    coopCreditUsedCents: number;
    totalEconomicCents: number;
  },
): Promise<PaymentBreakdown> {
  const plans = params.items.map((item) => ({
    lotId: normalizeText(item.lot_id),
    saleUnit: item.unit_label,
    storedQuantityUnits: Math.max(0, Number(item.quantity_units ?? 0)),
    reservedKg: Number(item.line_weight_kg ?? 0),
    unitDeliveryCents: toNonNegativeInteger(item.unit_delivery_cents),
    unitSharerFeeCents: toNonNegativeInteger(item.unit_sharer_fee_cents),
    lineTotalCents: toNonNegativeInteger(item.line_total_cents),
  }));
  const platformServiceFeeCents = await computePlatformServiceFeeFromPlans(serviceClient, plans);
  const sharerValueCents = params.items.reduce(
    (sum, item) => sum + toNonNegativeInteger(item.unit_sharer_fee_cents) * toNonNegativeInteger(item.quantity_units),
    0,
  );
  const deliveryAllocatedCents = params.items.reduce(
    (sum, item) => sum + toNonNegativeInteger(item.unit_delivery_cents) * toNonNegativeInteger(item.quantity_units),
    0,
  );
  const platformDeliveryRetainedCents = params.order.delivery_option === "chronofresh" ? deliveryAllocatedCents : 0;
  const producerDeliveryCents = params.order.delivery_option === "producer_delivery" ? deliveryAllocatedCents : 0;
  const platformRetainedTargetCents =
    platformServiceFeeCents + sharerValueCents + platformDeliveryRetainedCents;
  const cardAmountCents = Math.max(0, params.totalEconomicCents - params.coopCreditUsedCents);
  const producerNetTargetCents = Math.max(0, params.totalEconomicCents - platformRetainedTargetCents);
  const stripeApplicationFeeAmountCents = Math.min(cardAmountCents, platformRetainedTargetCents);
  const producerCardNetCents = Math.max(0, cardAmountCents - stripeApplicationFeeAmountCents);
  const producerTopupDueCents = Math.max(0, producerNetTargetCents - producerCardNetCents);
  return {
    total_economic_cents: params.totalEconomicCents,
    coop_credit_used_cents: params.coopCreditUsedCents,
    card_amount_cents: cardAmountCents,
    producer_net_target_cents: producerNetTargetCents,
    platform_retained_target_cents: platformRetainedTargetCents,
    platform_service_fee_cents: platformServiceFeeCents,
    sharer_value_cents: sharerValueCents,
    platform_delivery_retained_cents: platformDeliveryRetainedCents,
    producer_delivery_cents: producerDeliveryCents,
    stripe_application_fee_amount_cents: stripeApplicationFeeAmountCents,
    producer_card_net_cents: producerCardNetCents,
    producer_topup_due_cents: producerTopupDueCents,
  };
}

export async function prepareCheckoutPaymentSessionForStripe(checkoutPaymentSessionId: string) {
  assertServerEnv();
  const serviceClient = createServiceClient();
  const checkoutPaymentSession = await getCheckoutPaymentSession(serviceClient, { id: checkoutPaymentSessionId });
  if (!checkoutPaymentSession) {
    throw new Error("Checkout payment session not found");
  }
  if (!["draft", "failed", "expired"].includes(checkoutPaymentSession.status)) {
    return checkoutPaymentSession;
  }

  await releaseCheckoutSessionLotReservations(serviceClient, checkoutPaymentSession.id, "released");

  try {
    const reservationKind = checkoutPaymentSession.flow_kind === "close"
      ? "close_checkout"
      : "participant_checkout";
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const plans = await buildCheckoutReservationPlans(serviceClient, checkoutPaymentSession);
    const order = await getOrderById(serviceClient, checkoutPaymentSession.order_id);
    for (const plan of plans) {
      await reserveLotStock(serviceClient, {
        lotId: plan.lotId,
        orderId: checkoutPaymentSession.order_id,
        reservedUnits: plan.reservedUnits,
        reservedKg: plan.reservedKg,
        status: "active",
        reservationKind,
        checkoutPaymentSessionId: checkoutPaymentSession.id,
        expiresAt,
      });
    }
    if (checkoutPaymentSession.flow_kind === "participant") {
      let participant = checkoutPaymentSession.participant_id
        ? await getParticipantByProfile(serviceClient, order.id, checkoutPaymentSession.profile_id)
        : await getParticipantByProfile(serviceClient, order.id, checkoutPaymentSession.profile_id);
      if (!participant) {
        participant = await createParticipant(serviceClient, order, checkoutPaymentSession.profile_id);
      }
      const producerStripe = await getProducerLegalEntityForPayments(serviceClient, order.producer_profile_id);
      const draft = parseParticipantDraft(checkoutPaymentSession.draft_payload);
      const coopBalanceCents = draft.useCoopBalance
        ? await fetchCoopBalance(serviceClient, checkoutPaymentSession.profile_id)
        : 0;
      const paymentBreakdown = await computeParticipantPaymentBreakdownFromPlans(serviceClient, {
        order,
        profileId: checkoutPaymentSession.profile_id,
        plans,
        coopBalanceCents,
        useCoopBalance: draft.useCoopBalance,
      });
      return await updateCheckoutPaymentSession(serviceClient, checkoutPaymentSession.id, {
        status: "draft",
        participant_id: participant.id,
        payment_mode: paymentBreakdown.card_amount_cents > 0 ? "direct_charge" : "local_zero",
        payment_breakdown: serializePaymentBreakdown(paymentBreakdown),
        stripe_account_id: producerStripe.stripeAccountId,
        amount_cents: paymentBreakdown.card_amount_cents,
        error_code: null,
        error_message: null,
      });
    }
    return await updateCheckoutPaymentSession(serviceClient, checkoutPaymentSession.id, {
      status: "draft",
      payment_mode: "stripe_checkout",
      payment_breakdown: null,
      stripe_account_id: null,
      error_code: null,
      error_message: null,
    });
  } catch (error) {
    await releaseCheckoutSessionLotReservations(serviceClient, checkoutPaymentSession.id, "released");
    throw error;
  }
}

async function finalizeParticipantCheckoutSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  checkoutPaymentSession: CheckoutPaymentSessionRow,
  stripeSession: StripeCheckoutSession,
) {
  const providerPaymentId = normalizeText(checkoutPaymentSession.provider_payment_id) || normalizeText(stripeSession.id);
  if (!providerPaymentId && checkoutPaymentSession.payment_mode !== "local_zero") {
    throw new Error("Missing provider_payment_id on checkout payment session");
  }
  const existingPayment = providerPaymentId
    ? await findExistingPaymentByProviderPaymentId(
      serviceClient,
      providerPaymentId,
    )
    : null;
  if (existingPayment) {
    if (existingPayment.status === "pending") {
      await finalizePaymentSimulation(serviceClient, existingPayment.id);
    } else if (existingPayment.status !== "paid" && existingPayment.status !== "authorized") {
      throw new Error("Existing payment is not in a finalizable state");
    }
    return;
  }

  const order = await getOrderById(serviceClient, checkoutPaymentSession.order_id);
  const producerStripe = await getProducerLegalEntityForPayments(serviceClient, order.producer_profile_id);
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
  let createdPaymentId: string | null = null;
  const sessionReservations = await listCheckoutSessionReservations(serviceClient, checkoutPaymentSession.id);

  try {
    for (const reservation of sessionReservations) {
      if (reservation.status === "consumed" && reservation.order_item_id) {
        continue;
      }
      const quantityUnits = isPositiveNumber(reservation.reserved_kg)
        ? Number(reservation.reserved_kg)
        : Number(reservation.reserved_units ?? 0);
      if (quantityUnits <= 0) continue;
      const createdItemId = await insertOrderItem(serviceClient, {
        order,
        participantId: participant.id,
        productId: reservation.product_id,
        lotId: reservation.lot_id,
        quantityUnits,
        skipStockReservation: true,
        skipRecompute: true,
      });
      await consumeLotReservation(serviceClient, {
        reservationId: reservation.id,
        orderItemId: createdItemId,
        participantId: participant.id,
        reservationKind: "participant_checkout",
      });
    }
    await recomputeCaches(serviceClient, order.id, participant.id);

    const refreshedParticipant = await getParticipantByProfile(serviceClient, order.id, checkoutPaymentSession.profile_id);
    if (!refreshedParticipant) {
      throw new Error("Participant not found after repricing");
    }
    const participantItems = await listParticipantOrderItems(serviceClient, order.id, refreshedParticipant.id);

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
    const paymentBreakdown = await computeParticipantPaymentBreakdownFromItems(serviceClient, {
      order,
      items: participantItems,
      coopCreditUsedCents: coopToConsumeCents,
      totalEconomicCents: amountDueCents,
    });

    if (paidAmountCents <= 0) {
      if (coopToConsumeCents <= 0) {
        throw new Error("No payable amount remains after repricing");
      }
    }

    const payment = await createPaymentStub(serviceClient, {
      orderId: order.id,
      participantId: refreshedParticipant.id,
      amountCents: paymentBreakdown.card_amount_cents,
      provider: paymentBreakdown.card_amount_cents > 0 ? (checkoutPaymentSession.provider ?? "stripe_direct_connect") : "coop_topup_internal",
      providerPaymentId: providerPaymentId || `local_zero_${checkoutPaymentSession.id}`,
      idempotencyKey: checkoutPaymentSession.idempotency_key,
      stripeAccountId: producerStripe.stripeAccountId,
      stripeCheckoutSessionId: normalizeText(stripeSession.id) || null,
      stripePaymentIntentId: typeof stripeSession.payment_intent === "string"
        ? stripeSession.payment_intent
        : stripeSession.payment_intent?.id ?? null,
      legalEntityId: producerStripe.legalEntityId,
      paymentBreakdown,
      raw: {
        flow_kind: "participant",
        checkout_payment_session_id: checkoutPaymentSession.id,
        use_coop_balance: draft.useCoopBalance,
        payment_mode: checkoutPaymentSession.payment_mode ?? (paymentBreakdown.card_amount_cents > 0 ? "direct_charge" : "local_zero"),
        stripe_account_id: producerStripe.stripeAccountId,
        payment_breakdown: serializePaymentBreakdown(paymentBreakdown),
        stripe_status: stripeSession.status ?? null,
        payment_status: stripeSession.payment_status ?? null,
        payment_intent_id: typeof stripeSession.payment_intent === "string"
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id ?? null,
      },
    });
    createdPaymentId = payment.id;
    await finalizePaymentSimulation(serviceClient, payment.id);
    const topup = await upsertProducerTopup(serviceClient, {
      orderId: order.id,
      participantId: refreshedParticipant.id,
      paymentId: payment.id,
      legalEntityId: producerStripe.legalEntityId,
      producerStripeAccountId: producerStripe.stripeAccountId,
      amountCents: paymentBreakdown.producer_topup_due_cents,
    });
    if (topup && order.status === "confirmed") {
      await processProducerTopupsForOrder(serviceClient, order.id);
    }
  } catch (error) {
    if (!createdPaymentId && participantCreatedInFlow) {
      try {
        await deleteParticipantIfNoActivity(serviceClient, {
          orderId: order.id,
          participantId: participant.id,
        });
      } catch (rollbackError) {
        console.error("Participant rollback error:", rollbackError);
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
  let paymentId: string | null = null;
  const sessionReservations = await listCheckoutSessionReservations(serviceClient, checkoutPaymentSession.id);

  try {
    for (const reservation of sessionReservations) {
      if (reservation.status === "consumed") {
        continue;
      }
      const productId = reservation.product_id;
      const extraQty = isPositiveNumber(reservation.reserved_kg)
        ? Number(reservation.reserved_kg)
        : Number(reservation.reserved_units ?? 0);
      if (extraQty <= 0) continue;
      const existingQty = currentSharerQuantities[productId] ?? 0;
      const targetQty = existingQty + extraQty;
      const existingItem = sharerItems.find((item) => item.product_id === productId);
      if (existingItem) {
        await updateOrderItemQuantity(serviceClient, {
          order,
          participantId: sharerParticipant.id,
          orderItemId: existingItem.id,
          productId,
          quantityUnits: targetQty,
          skipStockReservation: true,
          skipRecompute: true,
        });
        await consumeLotReservation(serviceClient, {
          reservationId: reservation.id,
          orderItemId: existingItem.id,
          participantId: sharerParticipant.id,
          reservationKind: "close_checkout",
        });
      } else {
        const createdItemId = await insertOrderItem(serviceClient, {
          order,
          participantId: sharerParticipant.id,
          productId,
          lotId: reservation.lot_id,
          quantityUnits: extraQty,
          isSharerShare: true,
          skipStockReservation: true,
          skipRecompute: true,
        });
        await consumeLotReservation(serviceClient, {
          reservationId: reservation.id,
          orderItemId: createdItemId,
          participantId: sharerParticipant.id,
          reservationKind: "close_checkout",
        });
      }
      currentSharerQuantities[productId] = targetQty;
    }
    await recomputeCaches(serviceClient, order.id, sharerParticipant.id);

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
  stripeAccountId?: string | null;
  stripeSessionOverride?: StripeCheckoutSession | null;
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
  const normalizedStripeAccountId = normalizeText(params.stripeAccountId) ||
    normalizeText(checkoutPaymentSession.stripe_account_id);
  let stripeSession = params.stripeSessionOverride ?? null;
  if (!stripeSession && stripeSessionId) {
    stripeSession = await retrieveStripeCheckoutSession(stripeSessionId, normalizedStripeAccountId || null);
  }
  if (!stripeSession && checkoutPaymentSession.payment_mode === "local_zero") {
    stripeSession = {
      id: `local_zero_${checkoutPaymentSession.id}`,
      status: "complete",
      payment_status: "no_payment_required",
      metadata: {
        checkout_payment_session_id: checkoutPaymentSession.id,
      },
      payment_intent: null,
    };
  }
  if (!stripeSession) {
    return buildPublicStatus(checkoutPaymentSession, null, "Checkout session not initialized");
  }
  if (
    normalizedStripeAccountId &&
    normalizeText(checkoutPaymentSession.stripe_account_id) &&
    normalizeText(checkoutPaymentSession.stripe_account_id) !== normalizedStripeAccountId
  ) {
    throw new Error("Le compte Stripe Connect du webhook ne correspond pas à la session locale.");
  }
  const paymentStatus = mapStripeStatusToInternal(stripeSession.status ?? null, stripeSession.payment_status ?? null);
  if (paymentStatus === "failed") {
    await releaseCheckoutSessionLotReservations(
      serviceClient,
      checkoutPaymentSession.id,
      stripeSession.status === "expired" ? "expired" : "released",
    );
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
        stripe_payment_intent_id: typeof stripeSession.payment_intent === "string"
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id ?? null,
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
      stripe_payment_intent_id: typeof stripeSession.payment_intent === "string"
        ? stripeSession.payment_intent
        : stripeSession.payment_intent?.id ?? null,
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
      stripe_payment_intent_id: typeof stripeSession.payment_intent === "string"
        ? stripeSession.payment_intent
        : stripeSession.payment_intent?.id ?? null,
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
      stripe_payment_intent_id: typeof stripeSession.payment_intent === "string"
        ? stripeSession.payment_intent
        : stripeSession.payment_intent?.id ?? null,
      error_code: "finalization_error",
      error_message: message,
    });
    return buildPublicStatus(updated, stripeSession, message);
  }
}

export async function finalizeLocalZeroCheckoutPaymentSession(checkoutPaymentSessionId: string) {
  return finalizeCheckoutPaymentSession({
    checkoutPaymentSessionId,
    stripeSessionOverride: {
      id: `local_zero_${checkoutPaymentSessionId}`,
      status: "complete",
      payment_status: "no_payment_required",
      metadata: {
        checkout_payment_session_id: checkoutPaymentSessionId,
      },
      payment_intent: null,
    },
  });
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
    payment_mode: checkoutPaymentSession.payment_mode ?? "stripe_checkout",
    payment_breakdown: parsePaymentBreakdown(checkoutPaymentSession.payment_breakdown),
    stripe_account_id: checkoutPaymentSession.stripe_account_id ?? null,
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
    participant_id: null,
    flow_kind: params.flowKind,
    status: "draft",
    payment_mode: "stripe_checkout",
    payment_breakdown: null,
    stripe_account_id: null,
    stripe_payment_intent_id: null,
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
