import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_MODE } from '../../../shared/config/demoMode';
import {
  ORDER_LOCATION_DISPLAY_RADIUS_M,
  ORDER_LOCATION_OBFUSCATION_MAX_M,
  ORDER_LOCATION_OBFUSCATION_MIN_M,
} from '../../../shared/constants/locationPrivacy';
import { getSupabaseClient } from '../../../shared/lib/supabaseClient';
import { mockGroupOrders } from '../../../data/fixtures/mockData';
import type { DbLot, DbProduct, GroupOrder, Product, ProductListingRow } from '../../../shared/types';
import {
  centsToEuros,
  type DbOrder,
  type DbOrderProduct,
  type DbOrderItem,
  type DbOrderParticipant,
  type DbOrderPickupSlot,
  type DbPayment,
  type DbFacture,
  type DbFactureLigne,
  type DeliveryOption,
  type Facture,
  type FactureLigne,
  type Order,
  type OrderFull,
  type OrderItem,
  type OrderParticipant,
  type OrderProduct,
  type OrderProductInfo,
  type OrderPickupSlot,
  type OrderStatus,
  type ParticipationStatus,
  type ParticipantVisibility,
  type Payment,
  type ProfileSummary,
  type ShareMode,
  type PickupSlotStatus,
  type InvoiceSerie,
  eurosToCents,
} from '../types';

const PRODUCT_IMAGE_BUCKET = 'product-images';
const INVOICES_BUCKET = 'facturation-documents';

type DemoOrderState = {
  participants: OrderParticipant[];
  items: OrderItem[];
  payments: Payment[];
};

const demoOrdersRef: { orders: GroupOrder[] } = {
  orders: [...mockGroupOrders],
};

const demoOrderOverrides = new Map<string, Partial<Order>>();
const demoStateByOrderId = new Map<string, DemoOrderState>();

const defaultParticipantsVisibility: ParticipantVisibility = {
  profile: false,
  content: false,
  weight: false,
  amount: false,
};

export const setDemoOrders = (orders: GroupOrder[]) => {
  if (!DEMO_MODE) return;
  demoOrdersRef.orders = orders;
};

const findDemoOrder = (orderCode: string) => {
  const normalized = orderCode.trim();
  return demoOrdersRef.orders.find(
    (order) => order.orderCode === normalized || order.id === normalized
  );
};

const findDemoOrderById = (orderId: string) =>
  demoOrdersRef.orders.find((order) => order.id === orderId);

const applyDemoOrderOverrides = (order: Order): Order => {
  const overrides = demoOrderOverrides.get(order.id);
  if (!overrides) return order;
  return { ...order, ...overrides };
};

const ensureDemoState = (order: GroupOrder): DemoOrderState => {
  const existing = demoStateByOrderId.get(order.id);
  if (existing) return existing;
  const now = new Date();
  const sharerParticipant: OrderParticipant = {
    id: `demo-${order.id}-sharer`,
    orderId: order.id,
    profileId: order.sharerId,
    role: 'sharer',
    participationStatus: 'accepted',
    requestMessage: null,
    requestedAt: now,
    reviewedAt: now,
    reviewedBy: null,
    pickupSlotId: null,
    pickupSlotStatus: null,
    pickupSlotRequestedAt: null,
    pickupSlotTime: null,
    pickupSlotReviewedAt: null,
    pickupSlotReviewedBy: null,
    totalWeightKg: 0,
    totalAmountCents: 0,
    createdAt: now,
    updatedAt: now,
    pickupCode: null,
    pickupCodeGeneratedAt: null,
    pickedUpAt: null,
    profileName: order.sharerName ?? 'Partageur',
    profileHandle: null,
    avatarPath: null,
    avatarUpdatedAt: null,
  };
  const state: DemoOrderState = {
    participants: [sharerParticipant],
    items: [],
    payments: [],
  };
  demoStateByOrderId.set(order.id, state);
  return state;
};

const refreshDemoParticipantTotals = (state: DemoOrderState) => {
  const totalsByParticipant = new Map<string, { weight: number; amount: number }>();
  state.items.forEach((item) => {
    const current = totalsByParticipant.get(item.participantId) ?? { weight: 0, amount: 0 };
    current.weight += item.lineWeightKg;
    current.amount += item.lineTotalCents;
    totalsByParticipant.set(item.participantId, current);
  });
  const now = new Date();
  state.participants = state.participants.map((participant) => {
    const totals = totalsByParticipant.get(participant.id);
    if (!totals) return participant;
    return {
      ...participant,
      totalWeightKg: totals.weight,
      totalAmountCents: totals.amount,
      updatedAt: now,
    };
  });
};

const getClient = (): SupabaseClient => {
  try {
    return getSupabaseClient();
  } catch (error) {
    throw new Error('Supabase non configure.');
  }
};

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARTH_RADIUS_METERS = 6371000;

const toDate = (value: string | null) => (value ? new Date(value) : null);

type Coordinates = { lat: number; lng: number };
type ObfuscationOffset = { distanceMeters: number; bearingRad: number };

const toRadians = (value: number) => (value * Math.PI) / 180;
const toDegrees = (value: number) => (value * 180) / Math.PI;

const normalizeLongitude = (lng: number) => {
  if (!Number.isFinite(lng)) return lng;
  return ((lng + 540) % 360) - 180;
};

const toCoordinate = (lat?: number | null, lng?: number | null): Coordinates | null => {
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) return null;
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (safeLat < -90 || safeLat > 90 || safeLng < -180 || safeLng > 180) return null;
  return { lat: safeLat, lng: safeLng };
};

const areCoordinatesEquivalent = (a: Coordinates, b: Coordinates) => {
  const epsilon = 1e-9;
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
};

const sampleObfuscationOffset = (): ObfuscationOffset => {
  const minDistance = Math.max(0, ORDER_LOCATION_OBFUSCATION_MIN_M);
  const cappedMaxDistance = Math.max(0, ORDER_LOCATION_DISPLAY_RADIUS_M - 20);
  const maxDistance = Math.max(minDistance, Math.min(ORDER_LOCATION_OBFUSCATION_MAX_M, cappedMaxDistance));
  const minSquared = minDistance * minDistance;
  const maxSquared = maxDistance * maxDistance;
  const distanceMeters = Math.sqrt(Math.random() * (maxSquared - minSquared) + minSquared);
  const bearingRad = Math.random() * Math.PI * 2;
  return { distanceMeters, bearingRad };
};

const projectCoordinate = (
  origin: Coordinates,
  distanceMeters: number,
  bearingRad: number
): Coordinates => {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);
  const sinLat2 = sinLat1 * cosAngularDistance + cosLat1 * sinAngularDistance * Math.cos(bearingRad);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));
  const y = Math.sin(bearingRad) * sinAngularDistance * cosLat1;
  const x = cosAngularDistance - sinLat1 * Math.sin(lat2);
  const lng2 = lng1 + Math.atan2(y, x);
  return {
    lat: toDegrees(lat2),
    lng: normalizeLongitude(toDegrees(lng2)),
  };
};

const obfuscateCoordinate = (origin: Coordinates, forcedOffset?: ObfuscationOffset): Coordinates => {
  const offset = forcedOffset ?? sampleObfuscationOffset();
  return projectCoordinate(origin, offset.distanceMeters, offset.bearingRad);
};

const buildObfuscatedOrderCoordinates = (params: {
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
}) => {
  const delivery = toCoordinate(params.deliveryLat, params.deliveryLng);
  const pickup = toCoordinate(params.pickupLat, params.pickupLng);
  const sameSourcePoint = Boolean(delivery && pickup && areCoordinatesEquivalent(delivery, pickup));
  const sharedOffset = sameSourcePoint ? sampleObfuscationOffset() : undefined;

  const obfuscatedDelivery = delivery ? obfuscateCoordinate(delivery, sharedOffset) : null;
  const obfuscatedPickup = pickup ? obfuscateCoordinate(pickup, sharedOffset) : null;

  return {
    deliveryLat: obfuscatedDelivery?.lat ?? null,
    deliveryLng: obfuscatedDelivery?.lng ?? null,
    pickupLat: obfuscatedPickup?.lat ?? null,
    pickupLng: obfuscatedPickup?.lng ?? null,
  };
};

const mapOrderRow = (row: DbOrder): Order => ({
  id: row.id,
  orderCode: row.order_code,
  createdBy: row.created_by,
  sharerProfileId: row.sharer_profile_id,
  producerProfileId: row.producer_profile_id,
  title: row.title,
  visibility: row.visibility,
  status: row.status,
  deadline: toDate(row.deadline),
  message: row.message,
  autoApproveParticipationRequests: row.auto_approve_participation_requests,
  allowSharerMessages: row.allow_sharer_messages,
  autoApprovePickupSlots: row.auto_approve_pickup_slots,
  minWeightKg: row.min_weight_kg,
  maxWeightKg: row.max_weight_kg,
  orderedWeightKg: row.ordered_weight_kg,
  deliveryOption: row.delivery_option,
  deliveryStreet: row.delivery_street,
  deliveryInfo: row.delivery_info,
  deliveryCity: row.delivery_city,
  deliveryPostcode: row.delivery_postcode,
  deliveryAddress: row.delivery_address,
  deliveryPhone: row.delivery_phone,
  deliveryEmail: row.delivery_email,
  deliveryLat: row.delivery_lat ?? null,
  deliveryLng: row.delivery_lng ?? null,
  estimatedDeliveryDate: toDate(row.estimated_delivery_date),
  pickupStreet: row.pickup_street,
  pickupInfo: row.pickup_info,
  pickupCity: row.pickup_city,
  pickupPostcode: row.pickup_postcode,
  pickupAddress: row.pickup_address,
  pickupLat: row.pickup_lat ?? null,
  pickupLng: row.pickup_lng ?? null,
  usePickupDate: row.use_pickup_date,
  pickupDate: toDate(row.pickup_date),
  pickupWindowWeeks: row.pickup_window_weeks,
  pickupDeliveryFeeCents: row.pickup_delivery_fee_cents,
  sharerPercentage: row.sharer_percentage,
  shareMode: row.share_mode,
  sharerQuantities: row.sharer_quantities ?? {},
  currency: row.currency,
  baseTotalCents: row.base_total_cents,
  deliveryFeeCents: row.delivery_fee_cents,
  participantTotalCents: row.participant_total_cents,
  sharerShareCents: row.sharer_share_cents,
  effectiveWeightKg: row.effective_weight_kg,
  participantsVisibility: row.participants_visibility,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapOrderProductRow = (row: DbOrderProduct, product: OrderProductInfo | null): OrderProduct => ({
  id: row.id,
  orderId: row.order_id,
  productId: row.product_id,
  sortOrder: row.sort_order,
  isEnabled: row.is_enabled,
  unitLabel: row.unit_label,
  unitWeightKg: row.unit_weight_kg,
  unitBasePriceCents: row.unit_base_price_cents,
  unitDeliveryCents: row.unit_delivery_cents,
  unitSharerFeeCents: row.unit_sharer_fee_cents,
  unitFinalPriceCents: row.unit_final_price_cents,
  priceBreakdownSnapshot: row.price_breakdown_snapshot ?? null,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  product,
});

const mapPickupSlotRow = (row: DbOrderPickupSlot): OrderPickupSlot => ({
  id: row.id,
  orderId: row.order_id,
  slotType: row.slot_type,
  day: row.day,
  slotDate: row.slot_date,
  label: row.label,
  enabled: row.enabled,
  startTime: row.start_time,
  endTime: row.end_time,
  sortOrder: row.sort_order,
});

const mapParticipantRow = (row: DbOrderParticipant): OrderParticipant => ({
  id: row.id,
  orderId: row.order_id,
  profileId: row.profile_id,
  role: row.role,
  participationStatus: row.participation_status,
  requestMessage: row.request_message,
  requestedAt: new Date(row.requested_at),
  reviewedAt: toDate(row.reviewed_at),
  reviewedBy: row.reviewed_by,
  pickupSlotId: row.pickup_slot_id,
  pickupSlotStatus: row.pickup_slot_status,
  pickupSlotRequestedAt: toDate(row.pickup_slot_requested_at),
  pickupSlotTime: row.pickup_slot_time ?? null,
  pickupSlotReviewedAt: toDate(row.pickup_slot_reviewed_at),
  pickupSlotReviewedBy: row.pickup_slot_reviewed_by,
  totalWeightKg: row.total_weight_kg,
  totalAmountCents: row.total_amount_cents,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  pickupCode: row.pickup_code,
  pickupCodeGeneratedAt: toDate(row.pickup_code_generated_at),
  pickedUpAt: toDate(row.picked_up_at),
});

const mapItemRow = (row: DbOrderItem): OrderItem => ({
  id: row.id,
  orderId: row.order_id,
  participantId: row.participant_id,
  productId: row.product_id,
  lotId: row.lot_id,
  quantityUnits: row.quantity_units,
  unitLabel: row.unit_label,
  unitWeightKg: row.unit_weight_kg,
  unitBasePriceCents: row.unit_base_price_cents,
  unitDeliveryCents: row.unit_delivery_cents,
  unitSharerFeeCents: row.unit_sharer_fee_cents,
  unitFinalPriceCents: row.unit_final_price_cents,
  lineTotalCents: row.line_total_cents,
  lineWeightKg: row.line_weight_kg,
  isSharerShare: row.is_sharer_share,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapPaymentRow = (row: DbPayment): Payment => ({
  id: row.id,
  orderId: row.order_id,
  participantId: row.participant_id,
  provider: row.provider,
  providerPaymentId: row.provider_payment_id,
  idempotencyKey: row.idempotency_key,
  status: row.status,
  amountCents: row.amount_cents,
  feeCents: row.fee_cents,
  feeVatCents: row.fee_vat_cents ?? 0,
  refundedAmountCents: row.refunded_amount_cents,
  currency: row.currency,
  paidAt: toDate(row.paid_at),
  failureCode: row.failure_code,
  failureMessage: row.failure_message,
  raw: row.raw ?? {},
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapFactureRow = (row: DbFacture): Facture => ({
  id: row.id,
  serie: row.serie,
  producerProfileId: row.producer_profile_id,
  orderId: row.order_id,
  paymentId: row.payment_id,
  clientProfileId: row.client_profile_id,
  numero: row.numero,
  issuedAt: new Date(row.issued_at),
  currency: row.currency,
  totalTtcCents: row.total_ttc_cents,
  totalHtCents: row.total_ht_cents,
  totalTvaCents: row.total_tva_cents,
  mentionTva: row.mention_tva,
  pdfPath: row.pdf_path,
  status: row.status,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapFactureLigneRow = (row: DbFactureLigne): FactureLigne => ({
  id: row.id,
  factureId: row.facture_id,
  label: row.label,
  quantity: Number(row.quantity),
  unitTtcCents: row.unit_ttc_cents,
  totalTtcCents: row.total_ttc_cents,
  vatRate: Number(row.vat_rate),
  totalHtCents: row.total_ht_cents,
  totalTvaCents: row.total_tva_cents,
  metadata: row.metadata ?? null,
});

const normalizeLabel = (value?: string | null) =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isPlatformCommissionLine = (line: FactureLigne) => {
  const component = String((line.metadata as Record<string, unknown> | null)?.component ?? '').toLowerCase();
  if (component === 'platform_commission') return true;
  const label = normalizeLabel(line.label);
  return label.includes('commission plateforme') || label.includes('commission de la plateforme');
};

const isSharerDiscountLine = (line: FactureLigne) => {
  const component = String((line.metadata as Record<string, unknown> | null)?.component ?? '').toLowerCase();
  if (component === 'sharer_discount') return true;
  const label = normalizeLabel(line.label);
  return label.includes('remise avantage partage') || label.includes('remise produits du partageur');
};

const buildImageUrl = (client: SupabaseClient, path?: string | null, bucket = PRODUCT_IMAGE_BUCKET) => {
  if (!path) return '';
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? '';
};

const mapListingRowToOrderProductInfo = (
  row: ProductListingRow,
  client: SupabaseClient
): OrderProductInfo => {
  const measurement: 'kg' | 'unit' = row.sale_unit === 'kg' ? 'kg' : 'unit';
  return {
    id: row.product_id,
    code: row.product_code,
    slug: row.slug ?? null,
    activeLotCode: row.active_lot_code ?? null,
    activeLotId: row.active_lot_id ?? null,
    name: row.name,
    description: row.description ?? null,
    packaging: row.packaging ?? null,
    measurement,
    unitWeightKg: row.unit_weight_kg ?? null,
    imageUrl: buildImageUrl(client, row.primary_image_path),
    producerProfileId: row.producer_profile_id ?? null,
    producerName: row.producer_name ?? null,
    producerLocation: row.producer_location ?? null,
  };
};

const mapProductListingToProduct = (row: ProductListingRow, client: SupabaseClient): Product => {
  const measurement = row.sale_unit === 'kg' ? 'kg' : 'unit';
  const priceCents = row.active_lot_price_cents ?? row.default_price_cents ?? 0;
  const quantity =
    measurement === 'kg' ? Number(row.active_lot_stock_kg ?? 0) : Number(row.active_lot_stock_units ?? 0);
  const inStock = Boolean(row.active_lot_code) && quantity > 0;
  return {
    id: row.product_code,
    productCode: row.product_code,
    dbId: row.product_id,
    slug: row.slug,
    activeLotCode: row.active_lot_code ?? undefined,
    activeLotId: row.active_lot_id ?? undefined,
    name: row.name,
    description: row.description ?? '',
    price: centsToEuros(priceCents),
    unit: measurement === 'kg' ? 'kg' : row.packaging,
    quantity,
    category: row.category,
    imageUrl: buildImageUrl(client, row.primary_image_path),
    producerId: row.producer_profile_id ?? row.product_code,
    producerName: row.producer_name ?? 'Producteur',
    producerLocation: row.producer_location ?? 'Local',
    inStock,
    measurement,
    weightKg: row.unit_weight_kg ?? undefined,
  };
};

const mapDbProductToListingRow = (row: DbProduct): ProductListingRow => ({
  product_id: row.id,
  product_code: row.product_code,
  slug: row.slug,
  name: row.name,
  category: row.category,
  sale_unit: row.sale_unit,
  packaging: row.packaging,
  unit_weight_kg: row.unit_weight_kg ?? null,
  description: row.description ?? null,
  default_price_cents: row.default_price_cents ?? null,
  producer_profile_id: row.producer_profile_id ?? null,
  producer_name: row.producer_name ?? null,
  producer_location: row.producer_location ?? null,
  primary_image_path: null,
  active_lot_id: null,
  active_lot_code: null,
  active_lot_price_cents: null,
  active_lot_stock_units: null,
  active_lot_stock_kg: null,
  display_price_cents: row.default_price_cents ?? null,
});

const fetchProductsByIds = async (client: SupabaseClient, productIds: string[]) => {
  if (!productIds.length) return [] as ProductListingRow[];
  const { data, error } = await client.from('v_products_listing').select('*').in('product_id', productIds);
  if (error) throw error;
  const listingRows = (data as ProductListingRow[]) ?? [];
  const listingIds = new Set(listingRows.map((row) => row.product_id));
  const missingIds = productIds.filter((id) => !listingIds.has(id));
  if (!missingIds.length) return listingRows;
  const { data: fallbackData, error: fallbackError } = await client
    .from('products')
    .select('*')
    .in('id', missingIds);
  if (fallbackError) throw fallbackError;
  const fallbackRows = ((fallbackData as DbProduct[]) ?? []).map(mapDbProductToListingRow);
  return [...listingRows, ...fallbackRows];
};

const fetchProductsByCodes = async (client: SupabaseClient, productCodes: string[]) => {
  if (!productCodes.length) return [] as ProductListingRow[];
  const { data, error } = await client.from('v_products_listing').select('*').in('product_code', productCodes);
  if (error) throw error;
  return (data as ProductListingRow[]) ?? [];
};

type ActiveLotForProduct = {
  id: string;
  productId: string;
  priceCents: number;
  producedAt: string | null;
  createdAt: string;
};

const pickLatestActiveLot = (lots: ActiveLotForProduct[]) => {
  if (!lots.length) return null;
  return lots
    .slice()
    .sort((a, b) => {
      const aDate = Date.parse(a.producedAt ?? a.createdAt);
      const bDate = Date.parse(b.producedAt ?? b.createdAt);
      return bDate - aDate;
    })[0];
};

const fetchLatestActiveLotsByProductId = async (client: SupabaseClient, productIds: string[]) => {
  const map = new Map<string, ActiveLotForProduct>();
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (!uniqueProductIds.length) return map;

  const { data, error } = await client
    .from('lots')
    .select('id, product_id, status, produced_at, created_at, price_cents')
    .in('product_id', uniqueProductIds)
    .eq('status', 'active');
  if (error) throw error;

  const byProductId = new Map<string, ActiveLotForProduct[]>();
  ((data as DbLot[] | null) ?? []).forEach((row) => {
    const lot: ActiveLotForProduct = {
      id: row.id,
      productId: row.product_id,
      priceCents: Number(row.price_cents ?? 0),
      producedAt: row.produced_at ?? null,
      createdAt: row.created_at,
    };
    const bucket = byProductId.get(lot.productId) ?? [];
    bucket.push(lot);
    byProductId.set(lot.productId, bucket);
  });

  byProductId.forEach((lots, productId) => {
    const selected = pickLatestActiveLot(lots);
    if (selected) map.set(productId, selected);
  });

  return map;
};

const fetchProfilesByIds = async (client: SupabaseClient, profileIds: string[]) => {
  if (!profileIds.length) return [] as Array<Record<string, unknown>>;
  const { data, error } = await client
    .from('profiles')
    .select(
      'id, name, handle, avatar_path, avatar_updated_at, phone_public, contact_email_public, address, address_details, city, postcode, opening_hours'
    )
    .in('id', profileIds);
  if (error) throw error;
  return (data as Array<Record<string, unknown>>) ?? [];
};

const isPositiveNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const resolveUnitWeightKg = (saleUnit: string | null, unitWeightKg: number | null, packaging?: string | null) => {
  if (isPositiveNumber(unitWeightKg)) return unitWeightKg;
  const unitLabel = packaging?.toLowerCase() ?? '';
  const match = unitLabel.match(/([\d.,]+)\s*(kg|g)/);
  if (match) {
    const raw = parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(raw)) {
      return match[2] === 'kg' ? raw : raw / 1000;
    }
  }
  if (saleUnit === 'kg') return 1;
  return 0.25;
};

const resolveEffectiveWeightKg = (orderedWeightKg: number, minWeightKg: number, maxWeightKg: number | null) => {
  const current = Math.max(0, orderedWeightKg ?? 0);
  const min = Math.max(0, minWeightKg ?? 0);
  if (typeof maxWeightKg === 'number' && maxWeightKg > 0) {
    return Math.min(Math.max(current, min), maxWeightKg);
  }
  return Math.max(current, min);
};

const calculateOrderItemPricing = (params: {
  order: Order;
  basePriceCents: number;
  unitWeightKg: number;
  quantityUnits: number;
}) => {
  const { order, basePriceCents, unitWeightKg, quantityUnits } = params;
  const feePerKg = order.effectiveWeightKg > 0 ? order.deliveryFeeCents / order.effectiveWeightKg : 0;
  const unitDeliveryCents = Math.round(feePerKg * unitWeightKg);
  const basePlusDelivery = basePriceCents + unitDeliveryCents;
  const shareFraction =
    order.sharerPercentage > 0 && order.sharerPercentage < 100
      ? order.sharerPercentage / (100 - order.sharerPercentage)
      : 0;
  const unitSharerFeeCents = Math.round(basePlusDelivery * shareFraction);
  const unitFinalPriceCents = basePlusDelivery + unitSharerFeeCents;
  return {
    unitDeliveryCents,
    unitSharerFeeCents,
    unitFinalPriceCents,
    lineTotalCents: unitFinalPriceCents * quantityUnits,
    lineWeightKg: unitWeightKg * quantityUnits,
  };
};

const buildDemoOrder = (order: GroupOrder): Order => {
  const now = new Date();
  const orderedWeightKg = order.orderedWeight ?? 0;
  const minWeightKg = order.minWeight ?? 0;
  const maxWeightKg = order.maxWeight > 0 ? order.maxWeight : null;
  const participantTotalCents = eurosToCents(order.totalValue ?? 0);
  const pickupDeliveryFeeCents = eurosToCents(order.pickupDeliveryFee ?? 0);
  const status: OrderStatus = order.status;
    const demoOrder: Order = {
      id: order.id,
      orderCode: order.orderCode ?? order.id,
      createdBy: order.sharerId,
      sharerProfileId: order.sharerId,
      producerProfileId: order.producerId,
    title: order.title,
    visibility: order.visibility,
    status,
    deadline: order.deadline ?? null,
    message: order.message ?? null,
    autoApproveParticipationRequests: order.autoApproveParticipationRequests ?? false,
    allowSharerMessages: order.allowSharerMessages ?? true,
    autoApprovePickupSlots: order.autoApprovePickupSlots ?? false,
    minWeightKg,
    maxWeightKg,
    orderedWeightKg,
    deliveryOption: 'producer_pickup',
    deliveryStreet: null,
    deliveryInfo: null,
    deliveryCity: null,
    deliveryPostcode: null,
    deliveryAddress: null,
    deliveryPhone: null,
    deliveryEmail: null,
    deliveryLat: null,
    deliveryLng: null,
    estimatedDeliveryDate: order.estimatedDeliveryDate ?? null,
    pickupStreet: order.pickupStreet ?? null,
    pickupInfo: null,
    pickupCity: order.pickupCity ?? null,
    pickupPostcode: order.pickupPostcode ?? null,
    pickupAddress: order.pickupAddress ?? null,
    pickupLat: order.mapLocation?.lat ?? null,
    pickupLng: order.mapLocation?.lng ?? null,
    usePickupDate: false,
    pickupDate: null,
    pickupWindowWeeks: order.pickupWindowWeeks ?? null,
    pickupDeliveryFeeCents,
    sharerPercentage: order.sharerPercentage ?? 0,
    shareMode: order.sharerQuantities ? 'products' : 'cash',
    sharerQuantities: order.sharerQuantities ?? {},
    currency: 'EUR',
      baseTotalCents: participantTotalCents,
      deliveryFeeCents: pickupDeliveryFeeCents,
      participantTotalCents,
      sharerShareCents: 0,
      effectiveWeightKg: resolveEffectiveWeightKg(orderedWeightKg, minWeightKg, maxWeightKg),
      participantsVisibility: defaultParticipantsVisibility,
      createdAt: now,
      updatedAt: now,
    };
  return applyDemoOrderOverrides(demoOrder);
};

const buildDemoProductsOffered = (order: GroupOrder, demoOrder: Order): OrderProduct[] => {
  const now = new Date();
  return order.products.map((product, index) => {
    const unitWeightKg = resolveUnitWeightKg(
      product.measurement === 'kg' ? 'kg' : 'unit',
      product.weightKg ?? null,
      product.unit
    );
    const unitBasePriceCents = eurosToCents(product.price);
    const pricing = calculateOrderItemPricing({
      order: demoOrder,
      basePriceCents: unitBasePriceCents,
      unitWeightKg,
      quantityUnits: 1,
    });
    const productId = product.dbId ?? product.id;
    return {
      id: `demo-order-product-${order.id}-${index}`,
      orderId: order.id,
      productId,
      sortOrder: index,
      isEnabled: true,
      unitLabel: product.unit ?? null,
      unitWeightKg,
      unitBasePriceCents,
      unitDeliveryCents: pricing.unitDeliveryCents,
      unitSharerFeeCents: pricing.unitSharerFeeCents,
      unitFinalPriceCents: pricing.unitFinalPriceCents,
      priceBreakdownSnapshot: null,
      createdAt: now,
      updatedAt: now,
      product: {
        id: productId,
        code: product.productCode ?? product.id,
        slug: product.slug ?? null,
        activeLotCode: product.activeLotCode ?? null,
        activeLotId: product.activeLotId ?? null,
        name: product.name,
        description: product.description ?? null,
        packaging: product.unit ?? null,
        measurement: product.measurement,
        unitWeightKg,
        imageUrl: product.imageUrl ?? null,
        producerProfileId: product.producerId ?? null,
        producerName: product.producerName ?? null,
        producerLocation: product.producerLocation ?? null,
      },
    };
  });
};

const buildDemoPickupSlots = (order: GroupOrder, orderId: string): OrderPickupSlot[] => {
  const slots = order.pickupSlots ?? [];
  return slots.map((slot, index) => ({
    id: `demo-pickup-slot-${orderId}-${index}`,
    orderId,
    slotType: slot.date ? 'date' : 'weekday',
    day: slot.day ?? null,
    slotDate: slot.date ?? null,
    label: slot.label ?? slot.date ?? slot.day ?? 'Creneau',
    enabled: true,
    startTime: slot.start ?? '',
    endTime: slot.end ?? '',
    sortOrder: index,
  }));
};

export type CreateOrderPayload = {
  userId: string;
  productCodes: string[];
  title: string;
  visibility: 'public' | 'private';
  status?: OrderStatus;
  deadline: Date | null;
  message?: string;
  autoApproveParticipationRequests: boolean;
  allowSharerMessages: boolean;
  autoApprovePickupSlots: boolean;
  minWeightKg: number;
  maxWeightKg: number | null;
  orderedWeightKg?: number;
  deliveryOption: DeliveryOption;
  deliveryStreet?: string;
  deliveryInfo?: string;
  deliveryCity?: string;
  deliveryPostcode?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryEmail?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  estimatedDeliveryDate?: Date | null;
  pickupStreet?: string;
  pickupInfo?: string;
  pickupCity?: string;
  pickupPostcode?: string;
  pickupAddress?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  usePickupDate: boolean;
  pickupDate?: Date | null;
  pickupWindowWeeks?: number | null;
  pickupDeliveryFeeCents: number;
  sharerPercentage: number;
  shareMode: ShareMode;
  sharerQuantities: Record<string, number>;
  currency?: string;
  baseTotalCents: number;
  deliveryFeeCents: number;
  participantTotalCents: number;
  sharerShareCents: number;
  effectiveWeightKg: number;
  participantsVisibility: ParticipantVisibility;
  slots: Array<{
    slotType: 'weekday' | 'date';
    day?: string;
    slotDate?: string;
    label: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
  }>;
};

export const createOrder = async (payload: CreateOrderPayload): Promise<string> => {
  const client = getClient();
  if (!payload.userId) throw new Error('Utilisateur requis pour creer une commande.');
  if (!payload.productCodes.length) throw new Error('Selection de produits requise.');

  const productRows = await fetchProductsByCodes(client, payload.productCodes);
  if (productRows.length !== payload.productCodes.length) {
    throw new Error('Impossible de charger tous les produits selectionnes.');
  }
  const activeLotsByProductId = await fetchLatestActiveLotsByProductId(
    client,
    productRows.map((row) => row.product_id as string)
  );

  const producerProfileId = (productRows[0]?.producer_profile_id as string | null) ?? payload.userId;
  const obfuscatedCoords = buildObfuscatedOrderCoordinates({
    deliveryLat: payload.deliveryLat,
    deliveryLng: payload.deliveryLng,
    pickupLat: payload.pickupLat,
    pickupLng: payload.pickupLng,
  });
  const orderInsert = {
    created_by: payload.userId,
    sharer_profile_id: payload.userId,
    producer_profile_id: producerProfileId,
    title: payload.title,
    visibility: payload.visibility,
    status: payload.status ?? 'open',
    deadline: payload.deadline ? payload.deadline.toISOString().slice(0, 10) : null,
    message: payload.message ?? null,
    auto_approve_participation_requests: payload.autoApproveParticipationRequests,
    allow_sharer_messages: payload.allowSharerMessages,
    auto_approve_pickup_slots: payload.autoApprovePickupSlots,
    min_weight_kg: payload.minWeightKg,
    max_weight_kg: payload.maxWeightKg,
    ordered_weight_kg: payload.orderedWeightKg ?? 0,
    delivery_option: payload.deliveryOption,
    delivery_street: payload.deliveryStreet ?? null,
    delivery_info: payload.deliveryInfo ?? null,
    delivery_city: payload.deliveryCity ?? null,
    delivery_postcode: payload.deliveryPostcode ?? null,
    delivery_address: payload.deliveryAddress ?? null,
    delivery_phone: payload.deliveryPhone ?? null,
    delivery_email: payload.deliveryEmail ?? null,
    delivery_lat: obfuscatedCoords.deliveryLat,
    delivery_lng: obfuscatedCoords.deliveryLng,
    estimated_delivery_date: payload.estimatedDeliveryDate
      ? payload.estimatedDeliveryDate.toISOString().slice(0, 10)
      : null,
    pickup_street: payload.pickupStreet ?? null,
    pickup_info: payload.pickupInfo ?? null,
    pickup_city: payload.pickupCity ?? null,
    pickup_postcode: payload.pickupPostcode ?? null,
    pickup_address: payload.pickupAddress ?? null,
    pickup_lat: obfuscatedCoords.pickupLat,
    pickup_lng: obfuscatedCoords.pickupLng,
    use_pickup_date: payload.usePickupDate,
    pickup_date: payload.pickupDate ? payload.pickupDate.toISOString().slice(0, 10) : null,
    pickup_window_weeks: payload.pickupWindowWeeks ?? null,
    pickup_delivery_fee_cents: payload.pickupDeliveryFeeCents,
    sharer_percentage: payload.sharerPercentage,
    share_mode: payload.shareMode,
    sharer_quantities: payload.sharerQuantities,
    currency: payload.currency ?? 'EUR',
    base_total_cents: payload.baseTotalCents,
    delivery_fee_cents: payload.deliveryFeeCents,
    participant_total_cents: payload.participantTotalCents,
    sharer_share_cents: payload.sharerShareCents,
    effective_weight_kg: payload.effectiveWeightKg,
    participants_visibility: payload.participantsVisibility,
  };

  const { data: insertedOrder, error: insertError } = await client
    .from('orders')
    .insert(orderInsert)
    .select('*')
    .single();
  if (insertError || !insertedOrder) throw insertError ?? new Error('Creation commande impossible.');

  const order = mapOrderRow(insertedOrder as DbOrder);
  const orderProductsPayload = productRows.map((productRow, index) => {
    const unitWeightKg = resolveUnitWeightKg(
      productRow.sale_unit,
      productRow.unit_weight_kg,
      productRow.packaging
    );
    const fallbackLot = activeLotsByProductId.get(productRow.product_id as string);
    const basePriceCents = Number(
      productRow.active_lot_price_cents ?? fallbackLot?.priceCents ?? productRow.default_price_cents ?? 0
    );
    const pricing = calculateOrderItemPricing({
      order,
      basePriceCents,
      unitWeightKg,
      quantityUnits: 1,
    });
    return {
      order_id: order.id,
      product_id: productRow.product_id,
      sort_order: index,
      is_enabled: true,
      unit_label: productRow.sale_unit === 'kg' ? 'kg' : productRow.packaging,
      unit_weight_kg: unitWeightKg,
      unit_base_price_cents: basePriceCents,
      unit_delivery_cents: pricing.unitDeliveryCents,
      unit_sharer_fee_cents: pricing.unitSharerFeeCents,
      unit_final_price_cents: pricing.unitFinalPriceCents,
      price_breakdown_snapshot: {
        base_cents: basePriceCents,
        delivery_cents: pricing.unitDeliveryCents,
        sharer_cents: pricing.unitSharerFeeCents,
        final_cents: pricing.unitFinalPriceCents,
      },
    };
  });
  const orderProductsById = new Map<string, (typeof orderProductsPayload)[number]>();
  orderProductsPayload.forEach((row) => {
    orderProductsById.set(row.product_id as string, row);
  });
  if (orderProductsPayload.length) {
    const { error: orderProductsError } = await client.from('order_products').insert(orderProductsPayload);
    if (orderProductsError) throw orderProductsError;
  }

  if (payload.slots.length) {
    const slotRows = payload.slots.map((slot, index) => ({
      order_id: order.id,
      slot_type: slot.slotType,
      day: slot.slotType === 'weekday' ? slot.day ?? null : null,
      slot_date: slot.slotType === 'date' ? slot.slotDate ?? null : null,
      label: slot.label,
      enabled: slot.enabled,
      start_time: slot.startTime,
      end_time: slot.endTime,
      sort_order: index,
    }));
    const { error: slotError } = await client.from('order_pickup_slots').insert(slotRows);
    if (slotError) throw slotError;
  }

  const { data: sharerParticipant, error: sharerError } = await client
    .from('order_participants')
    .insert({
      order_id: order.id,
      profile_id: payload.userId,
      role: 'sharer',
      participation_status: 'accepted',
    })
    .select('*')
    .single();
  if (sharerError || !sharerParticipant) throw sharerError ?? new Error('Participant partageur manquant.');

  if (payload.shareMode === 'products') {
    const sharerItems = payload.productCodes
      .map((code) => ({
        code,
        quantity: Math.max(0, Number(payload.sharerQuantities[code] ?? 0)),
      }))
      .filter((entry) => entry.quantity > 0);

    if (sharerItems.length) {
      const itemsPayload = sharerItems
        .map((entry) => {
          const productRow = productRows.find((row) => row.product_code === entry.code);
          if (!productRow) return null;
          const fallbackLot = activeLotsByProductId.get(productRow.product_id as string);
          const resolvedLotId = (productRow.active_lot_id as string | null) ?? fallbackLot?.id ?? null;
          if (!resolvedLotId) {
            throw new Error(`Lot actif introuvable pour le produit ${productRow.product_code}.`);
          }
          const orderProduct = orderProductsById.get(productRow.product_id as string);
          const fallbackUnitWeightKg = resolveUnitWeightKg(
            productRow.sale_unit,
            productRow.unit_weight_kg,
            productRow.packaging
          );
          const unitWeightKg = orderProduct?.unit_weight_kg ?? fallbackUnitWeightKg;
          const basePriceCents = Number(
            productRow.active_lot_price_cents ?? fallbackLot?.priceCents ?? productRow.default_price_cents ?? 0
          );
          const unitBasePriceCents = orderProduct?.unit_base_price_cents ?? basePriceCents;
          const unitDeliveryCents = orderProduct?.unit_delivery_cents ?? 0;
          const unitSharerFeeCents = orderProduct?.unit_sharer_fee_cents ?? 0;
          const unitFinalPriceCents =
            orderProduct?.unit_final_price_cents ?? unitBasePriceCents + unitDeliveryCents + unitSharerFeeCents;
          const lineTotalCents = unitFinalPriceCents * entry.quantity;
          const lineWeightKg = unitWeightKg * entry.quantity;
          return {
            order_id: order.id,
            participant_id: (sharerParticipant as DbOrderParticipant).id,
            product_id: productRow.product_id,
            lot_id: resolvedLotId,
            quantity_units: entry.quantity,
            unit_label: productRow.sale_unit === 'kg' ? 'kg' : productRow.packaging,
            unit_weight_kg: unitWeightKg,
            unit_base_price_cents: unitBasePriceCents,
            unit_delivery_cents: unitDeliveryCents,
            unit_sharer_fee_cents: unitSharerFeeCents,
            unit_final_price_cents: unitFinalPriceCents,
            line_total_cents: lineTotalCents,
            line_weight_kg: lineWeightKg,
            is_sharer_share: true,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (itemsPayload.length) {
        const { error: itemsError } = await client.from('order_items').insert(itemsPayload);
        if (itemsError) throw itemsError;
        await recomputeCaches(order.id, (sharerParticipant as DbOrderParticipant).id);
      }
    }
  }

  return order.orderCode;
};

export const getOrderByCode = async (orderCode: string): Promise<Order> => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrder(orderCode);
    if (!demoOrder) throw new Error('Commande introuvable.');
    return buildDemoOrder(demoOrder);
  }
  const client = getClient();
  const byCode = await client.from('orders').select('*').eq('order_code', orderCode).maybeSingle();
  if (byCode.error) throw byCode.error;
  if (byCode.data) return mapOrderRow(byCode.data as DbOrder);

  if (UUID_LIKE_REGEX.test(orderCode)) {
    const byId = await client.from('orders').select('*').eq('id', orderCode).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return mapOrderRow(byId.data as DbOrder);
  }

  throw new Error('Commande introuvable.');
};

export const getOrderFullByCode = async (orderCode: string): Promise<OrderFull> => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrder(orderCode);
    if (!demoOrder) throw new Error('Commande introuvable.');
    const demoOrderRow = buildDemoOrder(demoOrder);
    const demoState = ensureDemoState(demoOrder);
    refreshDemoParticipantTotals(demoState);
    const demoProfiles: Record<string, ProfileSummary> = {};
    const demoSharerProfile = demoState.participants.find((participant) => participant.role === 'sharer');
    if (demoOrderRow.sharerProfileId) {
      demoProfiles[demoOrderRow.sharerProfileId] = {
        name: demoSharerProfile?.profileName ?? null,
        handle: demoSharerProfile?.profileHandle ?? null,
        avatarPath: demoSharerProfile?.avatarPath ?? null,
        avatarUpdatedAt: demoSharerProfile?.avatarUpdatedAt ?? null,
      };
    }
    if (demoOrderRow.producerProfileId) {
      demoProfiles[demoOrderRow.producerProfileId] = {
        name: demoOrder.producerName ?? null,
        handle: null,
        avatarPath: null,
        avatarUpdatedAt: null,
      };
    }
    return {
      order: demoOrderRow,
      productsOffered: buildDemoProductsOffered(demoOrder, demoOrderRow),
      pickupSlots: buildDemoPickupSlots(demoOrder, demoOrderRow.id),
      participants: demoState.participants,
      items: demoState.items,
      payments: demoState.payments,
      profiles: demoProfiles,
    };
  }
  const client = getClient();
  const orderRow = await getOrderByCode(orderCode);

  const [slotsRes, participantsRes, itemsRes, paymentsRes, orderProductsRes] = await Promise.all([
    client.from('order_pickup_slots').select('*').eq('order_id', orderRow.id),
    client.from('order_participants').select('*').eq('order_id', orderRow.id),
    client.from('order_items').select('*').eq('order_id', orderRow.id),
    client.from('payments').select('*').eq('order_id', orderRow.id),
    client.from('order_products').select('*').eq('order_id', orderRow.id).order('sort_order', { ascending: true }),
  ]);

  if (slotsRes.error) throw slotsRes.error;
  if (participantsRes.error) throw participantsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (orderProductsRes.error) throw orderProductsRes.error;

  const participants = (participantsRes.data as DbOrderParticipant[] | null) ?? [];
  const participantIds = participants.map((row) => row.profile_id).filter(Boolean) as string[];
  const profileIds = Array.from(new Set([orderRow.sharerProfileId, orderRow.producerProfileId, ...participantIds]));
  const profiles = await fetchProfilesByIds(client, profileIds);
  const profileMap = new Map<string, ProfileSummary>();
  profiles.forEach((profile) => {
    const id = profile.id as string;
    if (!id) return;
    profileMap.set(id, {
      name: (profile.name as string | null) ?? null,
      handle: (profile.handle as string | null) ?? null,
      avatarPath: (profile.avatar_path as string | null) ?? null,
      avatarUpdatedAt: (profile.avatar_updated_at as string | null) ?? null,
      phonePublic: (profile.phone_public as string | null) ?? null,
      contactEmailPublic: (profile.contact_email_public as string | null) ?? null,
      address: (profile.address as string | null) ?? null,
      addressDetails: (profile.address_details as string | null) ?? null,
      city: (profile.city as string | null) ?? null,
      postcode: (profile.postcode as string | null) ?? null,
      openingHours: (profile.opening_hours as Record<string, string> | null) ?? null,
    });
  });

  const mappedParticipants = participants.map((row) => {
    const mapped = mapParticipantRow(row);
    const profile = mapped.profileId ? profileMap.get(mapped.profileId) : undefined;
    return {
      ...mapped,
      profileName: profile?.name ?? null,
      profileHandle: profile?.handle ?? null,
      avatarPath: profile?.avatarPath ?? null,
      avatarUpdatedAt: profile?.avatarUpdatedAt ?? null,
    };
  });
  const profilesRecord: Record<string, ProfileSummary> = {};
  profileMap.forEach((value, key) => {
    profilesRecord[key] = value;
  });

  const orderProductRows = (orderProductsRes.data as DbOrderProduct[] | null) ?? [];
  const orderProductIds = Array.from(new Set(orderProductRows.map((row) => row.product_id)));
  const productRows = await fetchProductsByIds(client, orderProductIds);
  const productInfoById = new Map<string, OrderProductInfo>();
  (productRows as ProductListingRow[]).forEach((row) => {
    productInfoById.set(row.product_id, mapListingRowToOrderProductInfo(row, client));
  });
  const productsOffered = orderProductRows.map((row) =>
    mapOrderProductRow(row, productInfoById.get(row.product_id) ?? null)
  );

  return {
    order: orderRow,
    productsOffered,
    pickupSlots: ((slotsRes.data as DbOrderPickupSlot[] | null) ?? []).map(mapPickupSlotRow),
    participants: mappedParticipants,
    items: ((itemsRes.data as DbOrderItem[] | null) ?? []).map(mapItemRow),
    payments: ((paymentsRes.data as DbPayment[] | null) ?? []).map(mapPaymentRow),
    profiles: profilesRecord,
  };
};

export const requestParticipation = async (orderCode: string, profileId: string, message?: string) => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrder(orderCode);
    if (!demoOrder) throw new Error('Commande introuvable.');
    const state = ensureDemoState(demoOrder);
    const demoOrderRow = buildDemoOrder(demoOrder);
    const autoApprove = demoOrderRow.autoApproveParticipationRequests;
    const status: ParticipationStatus = autoApprove ? 'accepted' : 'requested';
    const now = new Date();
    const existing = state.participants.find(
      (participant) => participant.profileId === profileId && participant.role === 'participant'
    );
    if (existing) {
      existing.participationStatus = status;
      existing.requestMessage = message ?? null;
      existing.requestedAt = now;
      existing.reviewedAt = status === 'accepted' ? now : null;
      existing.updatedAt = now;
      return existing;
    }
    const participant: OrderParticipant = {
      id: `demo-${demoOrder.id}-${profileId}`,
      orderId: demoOrder.id,
      profileId,
      role: 'participant',
      participationStatus: status,
      requestMessage: message ?? null,
      requestedAt: now,
      reviewedAt: status === 'accepted' ? now : null,
      reviewedBy: null,
      pickupSlotId: null,
      pickupSlotStatus: null,
      pickupSlotRequestedAt: null,
      pickupSlotTime: null,
      pickupSlotReviewedAt: null,
      pickupSlotReviewedBy: null,
      totalWeightKg: 0,
      totalAmountCents: 0,
      createdAt: now,
      updatedAt: now,
      pickupCode: null,
      pickupCodeGeneratedAt: null,
      pickedUpAt: null,
      profileName: null,
      profileHandle: null,
      avatarPath: null,
      avatarUpdatedAt: null,
    };
    state.participants.push(participant);
    return participant;
  }
  const client = getClient();
  const order = await client
    .from('orders')
    .select('id, auto_approve_participation_requests')
    .eq('order_code', orderCode)
    .maybeSingle();
  if (order.error || !order.data) throw order.error ?? new Error('Commande introuvable.');
  const orderId = order.data.id as string;
  const status = order.data.auto_approve_participation_requests ? 'accepted' : 'requested';
  const existing = await client
    .from('order_participants')
    .select('*')
    .eq('order_id', orderId)
    .eq('profile_id', profileId)
    .limit(1);
  if (existing.error) throw existing.error;

  if (existing.data?.length) {
    const { data, error } = await client
      .from('order_participants')
      .update({
        participation_status: status,
        request_message: message ?? null,
        requested_at: new Date().toISOString(),
      })
      .eq('id', existing.data[0].id)
      .select('*')
      .single();
    if (error || !data) throw error ?? new Error('Demande de participation impossible.');
    return mapParticipantRow(data as DbOrderParticipant);
  }

  const { data, error } = await client
    .from('order_participants')
    .insert({
      order_id: orderId,
      profile_id: profileId,
      participation_status: status,
      request_message: message ?? null,
      requested_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Demande de participation impossible.');
  return mapParticipantRow(data as DbOrderParticipant);
};

export const approveParticipation = async (participantId: string) => {
  if (DEMO_MODE) {
    for (const state of demoStateByOrderId.values()) {
      const participant = state.participants.find((entry) => entry.id === participantId);
      if (!participant) continue;
      const now = new Date();
      participant.participationStatus = 'accepted';
      participant.reviewedAt = now;
      participant.updatedAt = now;
      return participant;
    }
    throw new Error('Participant introuvable.');
  }
  const client = getClient();
  const { data, error } = await client
    .from('order_participants')
    .update({ participation_status: 'accepted', reviewed_at: new Date().toISOString() })
    .eq('id', participantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Validation participation impossible.');
  return mapParticipantRow(data as DbOrderParticipant);
};

export const rejectParticipation = async (participantId: string) => {
  if (DEMO_MODE) {
    for (const state of demoStateByOrderId.values()) {
      const participant = state.participants.find((entry) => entry.id === participantId);
      if (!participant) continue;
      const now = new Date();
      participant.participationStatus = 'rejected';
      participant.reviewedAt = now;
      participant.updatedAt = now;
      return participant;
    }
    throw new Error('Participant introuvable.');
  }
  const client = getClient();
  const { data, error } = await client
    .from('order_participants')
    .update({ participation_status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', participantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Refus participation impossible.');
  return mapParticipantRow(data as DbOrderParticipant);
};

export const setParticipantPickupSlot = async (params: {
  orderId: string;
  participantId: string;
  pickupSlotId: string;
  pickupSlotTime?: string | null;
}) => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrderById(params.orderId);
    if (!demoOrder) throw new Error('Commande introuvable.');
    const state = ensureDemoState(demoOrder);
    const participant = state.participants.find((entry) => entry.id === params.participantId);
    if (!participant) throw new Error('Participant introuvable.');
    const demoOrderRow = buildDemoOrder(demoOrder);
    const autoApprove = demoOrderRow.autoApprovePickupSlots;
    const now = new Date();
    participant.pickupSlotId = params.pickupSlotId;
    participant.pickupSlotStatus = autoApprove ? 'accepted' : 'requested';
    participant.pickupSlotRequestedAt = now;
    participant.pickupSlotTime = params.pickupSlotTime ?? null;
    participant.pickupSlotReviewedAt = null;
    participant.pickupSlotReviewedBy = null;
    participant.updatedAt = now;
    return participant;
  }
  const client = getClient();
  const order = await client.from('orders').select('auto_approve_pickup_slots').eq('id', params.orderId).maybeSingle();
  if (order.error || !order.data) throw order.error ?? new Error('Commande introuvable.');
  const autoApprove = Boolean(order.data.auto_approve_pickup_slots);
  const updatePayload = {
    pickup_slot_id: params.pickupSlotId,
    pickup_slot_status: autoApprove ? 'accepted' : 'requested',
    pickup_slot_requested_at: new Date().toISOString(),
    pickup_slot_time: params.pickupSlotTime ?? null,
    pickup_slot_reviewed_at: null,
    pickup_slot_reviewed_by: null,
  };
  const { data, error } = await client
    .from('order_participants')
    .update(updatePayload)
    .eq('id', params.participantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Mise a jour du creneau impossible.');
  return mapParticipantRow(data as DbOrderParticipant);
};

export const reviewParticipantPickupSlot = async (params: {
  participantId: string;
  status: Exclude<PickupSlotStatus, 'requested'>;
  reviewerId?: string | null;
}) => {
  if (DEMO_MODE) {
    for (const state of demoStateByOrderId.values()) {
      const participant = state.participants.find((entry) => entry.id === params.participantId);
      if (!participant) continue;
      const now = new Date();
      participant.pickupSlotStatus = params.status;
      participant.pickupSlotReviewedAt = now;
      participant.pickupSlotReviewedBy = params.reviewerId ?? null;
      participant.updatedAt = now;
      return participant;
    }
    throw new Error('Participant introuvable.');
  }
  const client = getClient();
  const updatePayload = {
    pickup_slot_status: params.status,
    pickup_slot_reviewed_at: new Date().toISOString(),
    pickup_slot_reviewed_by: params.reviewerId ?? null,
  };
  const { data, error } = await client
    .from('order_participants')
    .update(updatePayload)
    .eq('id', params.participantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Mise a jour du creneau impossible.');
  return mapParticipantRow(data as DbOrderParticipant);
};

export const addItem = async (params: {
  orderId: string;
  participantId: string;
  productId: string;
  lotId?: string | null;
  quantityUnits: number;
}) => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrderById(params.orderId);
    if (!demoOrder) throw new Error('Commande introuvable.');
    const state = ensureDemoState(demoOrder);
    const participant = state.participants.find((entry) => entry.id === params.participantId);
    if (!participant) throw new Error('Participant introuvable.');
    const product = demoOrder.products.find(
      (entry) =>
        (entry.dbId ?? entry.id) === params.productId ||
        entry.productCode === params.productId ||
        entry.id === params.productId
    );
    if (!product) throw new Error('Produit non propose pour cette commande.');
    const quantityUnits = Math.max(0, Number(params.quantityUnits) || 0);
    if (!quantityUnits) throw new Error('Quantite invalide.');
    const demoOrderRow = buildDemoOrder(demoOrder);
    const unitWeightKg = resolveUnitWeightKg(
      product.measurement === 'kg' ? 'kg' : 'unit',
      product.weightKg ?? null,
      product.unit
    );
    const unitBasePriceCents = eurosToCents(product.price);
    const pricing = calculateOrderItemPricing({
      order: demoOrderRow,
      basePriceCents: unitBasePriceCents,
      unitWeightKg,
      quantityUnits,
    });
    const now = new Date();
    const item: OrderItem = {
      id: `demo-item-${params.orderId}-${now.getTime()}`,
      orderId: params.orderId,
      participantId: params.participantId,
      productId: product.dbId ?? product.id,
      lotId: params.lotId ?? null,
      quantityUnits,
      unitLabel: product.unit ?? null,
      unitWeightKg,
      unitBasePriceCents,
      unitDeliveryCents: pricing.unitDeliveryCents,
      unitSharerFeeCents: pricing.unitSharerFeeCents,
      unitFinalPriceCents: pricing.unitFinalPriceCents,
      lineTotalCents: pricing.lineTotalCents,
      lineWeightKg: pricing.lineWeightKg,
      isSharerShare: false,
      createdAt: now,
      updatedAt: now,
    };
    state.items.push(item);
    refreshDemoParticipantTotals(state);
    return item;
  }
  const client = getClient();
  const [
    { data: orderRow, error: orderError },
    { data: orderProductRow, error: orderProductError },
    { data: productRow, error: productError },
    { data: existingItems, error: itemsError },
  ] = await Promise.all([
    client.from('orders').select('*').eq('id', params.orderId).maybeSingle(),
    client
      .from('order_products')
      .select('*')
      .eq('order_id', params.orderId)
      .eq('product_id', params.productId)
      .maybeSingle(),
    client.from('v_products_listing').select('*').eq('product_id', params.productId).maybeSingle(),
    client.from('order_items').select('lot_id').eq('order_id', params.orderId).eq('product_id', params.productId),
  ]);
  if (orderError || !orderRow) throw orderError ?? new Error('Commande introuvable.');
  if (orderProductError || !orderProductRow) {
    throw orderProductError ?? new Error('Produit non propose pour cette commande.');
  }
  if (productError || !productRow) throw productError ?? new Error('Produit introuvable.');
  if (itemsError) throw itemsError;

  const orderProduct = orderProductRow as DbOrderProduct;
  const existingOrderItems = (existingItems as Array<{ lot_id: string | null }>) ?? [];
  const existingLotIds = existingOrderItems
    .map((item) => item.lot_id)
    .filter(Boolean) as string[];
  let hasNullLot = existingOrderItems.some((item) => !item.lot_id);
  const existingLotId = existingLotIds.length ? existingLotIds[0] : null;
  const distinctLotIds = new Set(existingLotIds);
  if (distinctLotIds.size > 1) {
    throw new Error('Plusieurs lots detectes pour ce produit dans la commande.');
  }
  let fallbackLotId: string | null = null;
  if (!params.lotId && !existingLotId && !(productRow.active_lot_id as string | null)) {
    const activeLotsByProductId = await fetchLatestActiveLotsByProductId(client, [params.productId]);
    fallbackLotId = activeLotsByProductId.get(params.productId)?.id ?? null;
  }
  const listingLotId = (productRow.active_lot_id as string | null) ?? fallbackLotId;
  if (existingLotId && params.lotId && params.lotId !== existingLotId) {
    throw new Error('Un seul lot est autorise pour ce produit dans la commande.');
  }
  const resolvedLotId = params.lotId ?? existingLotId ?? listingLotId ?? null;
  if (!resolvedLotId) {
    throw new Error('Lot actif introuvable pour ce produit.');
  }
  if (hasNullLot) {
    const { error: backfillLotError } = await client
      .from('order_items')
      .update({ lot_id: resolvedLotId })
      .eq('order_id', params.orderId)
      .eq('product_id', params.productId)
      .is('lot_id', null);
    if (backfillLotError) throw backfillLotError;
  }

  const unitWeightKg =
    (isPositiveNumber(orderProduct.unit_weight_kg) ? orderProduct.unit_weight_kg : null) ??
    resolveUnitWeightKg(productRow.sale_unit, productRow.unit_weight_kg, productRow.packaging);
  const unitBasePriceCents = orderProduct.unit_base_price_cents;
  const pricing = calculateOrderItemPricing({
    order: mapOrderRow(orderRow as DbOrder),
    basePriceCents: unitBasePriceCents,
    unitWeightKg,
    quantityUnits: params.quantityUnits,
  });
  const unitDeliveryCents = pricing.unitDeliveryCents;
  const unitSharerFeeCents = pricing.unitSharerFeeCents;
  const unitFinalPriceCents = pricing.unitFinalPriceCents;
  const lineTotalCents = pricing.lineTotalCents;
  const lineWeightKg = pricing.lineWeightKg;

  const { data: itemRow, error: itemError } = await client
    .from('order_items')
    .insert({
      order_id: params.orderId,
      participant_id: params.participantId,
      product_id: params.productId,
      lot_id: resolvedLotId,
      quantity_units: params.quantityUnits,
      unit_label: orderProduct.unit_label ?? (productRow.sale_unit === 'kg' ? 'kg' : productRow.packaging),
      unit_weight_kg: unitWeightKg,
      unit_base_price_cents: unitBasePriceCents,
      unit_delivery_cents: unitDeliveryCents,
      unit_sharer_fee_cents: unitSharerFeeCents,
      unit_final_price_cents: unitFinalPriceCents,
      line_total_cents: lineTotalCents,
      line_weight_kg: lineWeightKg,
      is_sharer_share: false,
    })
    .select('*')
    .single();
  if (itemError || !itemRow) throw itemError ?? new Error('Impossible d\'ajouter la ligne.');

  if (resolvedLotId) {
    const reservationPayload = {
      lot_id: resolvedLotId,
      order_id: params.orderId,
      order_item_id: (itemRow as DbOrderItem).id,
      reserved_units: productRow.sale_unit === 'kg' ? null : params.quantityUnits,
      reserved_kg: productRow.sale_unit === 'kg' ? lineWeightKg : null,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    const { error: reservationError } = await client.from('lot_reservations').insert(reservationPayload);
    if (reservationError) throw reservationError;
  }

  await recomputeCaches(params.orderId, params.participantId);
  return mapItemRow(itemRow as DbOrderItem);
};

export const removeItem = async (orderItemId: string, orderId: string, participantId?: string) => {
  const client = getClient();
  const { error } = await client.from('order_items').delete().eq('id', orderItemId);
  if (error) throw error;
  await recomputeCaches(orderId, participantId);
};

export const updateOrderItemQuantity = async (
  orderItemId: string,
  orderId: string,
  participantId: string,
  quantityUnits: number
) => {
  if (DEMO_MODE) {
    throw new Error('Mise a jour indisponible en mode demo.');
  }
  const client = getClient();
  const [
    { data: orderRow, error: orderError },
    { data: itemRow, error: itemError },
  ] = await Promise.all([
    client.from('orders').select('*').eq('id', orderId).maybeSingle(),
    client.from('order_items').select('*').eq('id', orderItemId).maybeSingle(),
  ]);
  if (orderError || !orderRow) throw orderError ?? new Error('Commande introuvable.');
  if (itemError || !itemRow) throw itemError ?? new Error('Ligne introuvable.');

  const productId = (itemRow as DbOrderItem).product_id;
  const [
    { data: orderProductRow, error: orderProductError },
    { data: productRow, error: productError },
  ] = await Promise.all([
    client
      .from('order_products')
      .select('*')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .maybeSingle(),
    client
      .from('v_products_listing')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle(),
  ]);
  if (orderProductError || !orderProductRow) {
    throw orderProductError ?? new Error('Produit non propose pour cette commande.');
  }
  if (productError || !productRow) throw productError ?? new Error('Produit introuvable.');

  const orderProduct = orderProductRow as DbOrderProduct;
  const unitWeightKg =
    (isPositiveNumber(orderProduct.unit_weight_kg) ? orderProduct.unit_weight_kg : null) ??
    resolveUnitWeightKg(productRow.sale_unit, productRow.unit_weight_kg, productRow.packaging);
  const unitBasePriceCents = orderProduct.unit_base_price_cents;
  const pricing = calculateOrderItemPricing({
    order: mapOrderRow(orderRow as DbOrder),
    basePriceCents: unitBasePriceCents,
    unitWeightKg,
    quantityUnits,
  });
  const unitDeliveryCents = pricing.unitDeliveryCents;
  const unitSharerFeeCents = pricing.unitSharerFeeCents;
  const unitFinalPriceCents = pricing.unitFinalPriceCents;
  const lineTotalCents = pricing.lineTotalCents;
  const lineWeightKg = pricing.lineWeightKg;

  const { error: updateError } = await client
    .from('order_items')
    .update({
      quantity_units: quantityUnits,
      unit_weight_kg: unitWeightKg,
      unit_delivery_cents: unitDeliveryCents,
      unit_sharer_fee_cents: unitSharerFeeCents,
      unit_final_price_cents: unitFinalPriceCents,
      line_total_cents: lineTotalCents,
      line_weight_kg: lineWeightKg,
    })
    .eq('id', orderItemId);
  if (updateError) throw updateError;

  const { data: reservationRow } = await client
    .from('lot_reservations')
    .select('id')
    .eq('order_item_id', orderItemId)
    .maybeSingle();
  if (reservationRow?.id) {
    const payload = {
      reserved_units: productRow.sale_unit === 'kg' ? null : quantityUnits,
      reserved_kg: productRow.sale_unit === 'kg' ? lineWeightKg : null,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    await client.from('lot_reservations').update(payload).eq('id', reservationRow.id);
  }

  await recomputeCaches(orderId, participantId);
};

export const recomputeCaches = async (orderId: string, participantId?: string) => {
  const client = getClient();
  const { error } = await client.rpc('recompute_order_caches', {
    p_order_id: orderId,
    p_participant_id: participantId ?? null,
  });
  if (error) throw error;
};

const finalizeOrderPricingRpc = async (client: SupabaseClient, orderId: string) => {
  const { error } = await client.rpc('finalize_order_pricing', {
    p_order_id: orderId,
  });
  if (error) throw error;
};

export const listOrdersForUser = async (profileId: string): Promise<GroupOrder[]> => {
  const client = getClient();
  const [{ data: ownOrders, error: ownError }, { data: participantRows, error: participantError }] = await Promise.all([
    client.from('orders').select('*').eq('sharer_profile_id', profileId),
    client
      .from('order_participants')
      .select('order_id')
      .eq('profile_id', profileId)
      .in('participation_status', ['accepted', 'requested']),
  ]);
  if (ownError) throw ownError;
  if (participantError) throw participantError;

  const orderIds = Array.from(
    new Set([
      ...(ownOrders ?? []).map((row) => (row as DbOrder).id),
      ...((participantRows ?? []) as Array<{ order_id: string }>).map((row) => row.order_id),
    ])
  );
  if (!orderIds.length) return [];

  const { data: orders, error: ordersError } = await client.from('orders').select('*').in('id', orderIds);
  if (ordersError) throw ordersError;

  return buildGroupOrdersFromRows(client, (orders as DbOrder[]) ?? []);
};

export const listPublicOrders = async (): Promise<GroupOrder[]> => {
  const client = getClient();
  const { data, error } = await client.from('orders').select('*').eq('visibility', 'public');
  if (error) throw error;
  return buildGroupOrdersFromRows(client, (data as DbOrder[]) ?? []);
};

const buildGroupOrdersFromRows = async (client: SupabaseClient, rows: DbOrder[]): Promise<GroupOrder[]> => {
  if (!rows.length) return [];
  const orderIds = rows.map((row) => row.id);
  const { data: orderProductsRows, error: orderProductsError } = await client
    .from('order_products')
    .select('order_id, product_id, sort_order')
    .in('order_id', orderIds);
  if (orderProductsError) throw orderProductsError;
  const { data: orderPickupSlotsRows, error: orderPickupSlotsError } = await client
    .from('order_pickup_slots')
    .select('order_id, day, slot_date, label, enabled, start_time, end_time, sort_order')
    .in('order_id', orderIds);
  if (orderPickupSlotsError) throw orderPickupSlotsError;

  const orderProducts = (orderProductsRows as Array<{
    order_id: string;
    product_id: string;
    sort_order: number | null;
  }>) ?? [];

  const orderProductMap = new Map<
    string,
    Array<{ productId: string; sortOrder: number | null }>
  >();
  orderProducts.forEach((row) => {
    const list = orderProductMap.get(row.order_id) ?? [];
    list.push({ productId: row.product_id, sortOrder: row.sort_order });
    orderProductMap.set(row.order_id, list);
  });

  const pickupSlotMap = new Map<
    string,
    Array<{
      day: string | null;
      date: string | null;
      label: string;
      enabled: boolean;
      start: string;
      end: string;
      sortOrder: number;
    }>
  >();
  ((orderPickupSlotsRows as Array<{
    order_id: string;
    day: string | null;
    slot_date: string | null;
    label: string;
    enabled: boolean;
    start_time: string;
    end_time: string;
    sort_order: number;
  }>) ?? []).forEach((row) => {
    const list = pickupSlotMap.get(row.order_id) ?? [];
    list.push({
      day: row.day,
      date: row.slot_date,
      label: row.label,
      enabled: Boolean(row.enabled),
      start: row.start_time,
      end: row.end_time,
      sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
    });
    pickupSlotMap.set(row.order_id, list);
  });

  const productIds = Array.from(new Set(orderProducts.map((row) => row.product_id)));
  const productRows = await fetchProductsByIds(client, productIds);
  const productMap = new Map<string, Product>();
  productRows.forEach((row) => {
    const product = mapProductListingToProduct(row, client);
    productMap.set(row.product_id, product);
  });

  const profileIds = Array.from(new Set(rows.flatMap((row) => [row.sharer_profile_id, row.producer_profile_id])));
  const profiles = await fetchProfilesByIds(client, profileIds);
  const profileMap = new Map<
    string,
    { name?: string | null; avatarPath?: string | null; avatarUpdatedAt?: string | null }
  >();
  profiles.forEach((profile) => {
    profileMap.set(profile.id as string, {
      name: (profile.name as string | null) ?? null,
      avatarPath: (profile.avatar_path as string | null) ?? null,
      avatarUpdatedAt: (profile.avatar_updated_at as string | null) ?? null,
    });
  });

  return rows.map((row) => {
    const order = mapOrderRow(row);
    const orderProductsForRow = (orderProductMap.get(row.id) ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const orderPickupSlotsForRow = (pickupSlotMap.get(row.id) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((slot) => slot.enabled);
    const products = orderProductsForRow
      .map((entry) => productMap.get(entry.productId))
      .filter(Boolean) as Product[];
    const sharerProfile = profileMap.get(row.sharer_profile_id);
    const producerProfile = profileMap.get(row.producer_profile_id);
    const sharerName = sharerProfile?.name ?? 'Partageur';
    const producerName = producerProfile?.name ?? products[0]?.producerName ?? 'Producteur';
    const prefersPickupLocation = order.deliveryOption === 'producer_pickup';
    const primaryMapLat = prefersPickupLocation ? order.pickupLat : order.deliveryLat;
    const primaryMapLng = prefersPickupLocation ? order.pickupLng : order.deliveryLng;
    const fallbackMapLat = prefersPickupLocation ? order.deliveryLat : order.pickupLat;
    const fallbackMapLng = prefersPickupLocation ? order.deliveryLng : order.pickupLng;
    const hasPrimaryCoordinates =
      Number.isFinite(primaryMapLat ?? NaN) && Number.isFinite(primaryMapLng ?? NaN);
    const hasFallbackCoordinates =
      Number.isFinite(fallbackMapLat ?? NaN) && Number.isFinite(fallbackMapLng ?? NaN);
    const mapLat = hasPrimaryCoordinates
      ? (primaryMapLat as number)
      : hasFallbackCoordinates
        ? (fallbackMapLat as number)
        : null;
    const mapLng = hasPrimaryCoordinates
      ? (primaryMapLng as number)
      : hasFallbackCoordinates
        ? (fallbackMapLng as number)
        : null;
    const primaryPostcode = prefersPickupLocation ? order.pickupPostcode : order.deliveryPostcode;
    const primaryCity = prefersPickupLocation ? order.pickupCity : order.deliveryCity;
    const fallbackPostcode = prefersPickupLocation ? order.deliveryPostcode : order.pickupPostcode;
    const fallbackCity = prefersPickupLocation ? order.deliveryCity : order.pickupCity;
    const areaLabel = [primaryPostcode ?? fallbackPostcode, primaryCity ?? fallbackCity]
      .filter(Boolean)
      .join(' ');
    const mapLocation =
      Number.isFinite(mapLat ?? NaN) && Number.isFinite(mapLng ?? NaN)
        ? {
            lat: mapLat as number,
            lng: mapLng as number,
            radiusMeters: ORDER_LOCATION_DISPLAY_RADIUS_M,
            areaLabel: areaLabel || order.pickupAddress || order.deliveryAddress || 'Commande locale',
          }
        : undefined;
    return {
      id: order.id,
      orderCode: order.orderCode,
      createdAt: order.createdAt ?? undefined,
      title: order.title,
      sharerId: order.sharerProfileId,
      sharerName,
      sharerAvatarPath: sharerProfile?.avatarPath ?? null,
      sharerAvatarUpdatedAt: sharerProfile?.avatarUpdatedAt ?? null,
      products,
      producerId: order.producerProfileId,
      producerName,
      producerAvatarPath: producerProfile?.avatarPath ?? null,
      producerAvatarUpdatedAt: producerProfile?.avatarUpdatedAt ?? null,
      sharerPercentage: order.sharerPercentage,
        sharerQuantities: order.sharerQuantities,
        minWeight: order.minWeightKg,
        maxWeight: order.maxWeightKg ?? 0,
        orderedWeight: order.orderedWeightKg,
        deliveryFeeCents: order.deliveryFeeCents,
        estimatedDeliveryDate: order.estimatedDeliveryDate ?? undefined,
        pickupWindowWeeks: order.pickupWindowWeeks ?? undefined,
        deadline: order.deadline ?? new Date(),
      pickupStreet: order.pickupStreet ?? undefined,
      pickupCity: order.pickupCity ?? undefined,
      pickupPostcode: order.pickupPostcode ?? undefined,
      pickupAddress: order.pickupAddress ?? '',
      message: order.message ?? '',
      status: order.status,
      visibility: order.visibility,
      statusUpdatedAt: order.updatedAt,
      autoApproveParticipationRequests: order.autoApproveParticipationRequests,
      allowSharerMessages: order.allowSharerMessages,
      autoApprovePickupSlots: order.autoApprovePickupSlots,
      totalValue: centsToEuros(order.participantTotalCents),
      participants: 0,
      pickupSlots: orderPickupSlotsForRow.map((slot) => ({
        day: slot.day ?? undefined,
        date: slot.date ?? undefined,
        start: slot.start ?? undefined,
        end: slot.end ?? undefined,
        label: slot.label ?? undefined,
      })),
      pickupDeliveryFee: centsToEuros(order.pickupDeliveryFeeCents),
      mapLocation,
    };
  });
};

export const createPaymentStub = async (params: {
  orderId: string;
  participantId: string;
  amountCents: number;
  status?: Payment['status'];
  provider?: string;
  providerPaymentId?: string | null;
  idempotencyKey?: string | null;
  raw?: Record<string, unknown>;
}) => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrderById(params.orderId);
    if (!demoOrder) throw new Error('Commande introuvable.');
    const state = ensureDemoState(demoOrder);
    const now = new Date();
    const payment: Payment = {
      id: `demo-payment-${params.orderId}-${now.getTime()}`,
      orderId: params.orderId,
      participantId: params.participantId,
      provider: params.provider ?? 'demo',
      providerPaymentId: params.providerPaymentId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      status: params.status ?? 'pending',
      amountCents: params.amountCents,
      feeCents: 0,
      feeVatCents: 0,
      refundedAmountCents: 0,
      currency: 'EUR',
      paidAt: params.status === 'paid' ? now : null,
      failureCode: null,
      failureMessage: null,
      raw: params.raw ?? {},
      createdAt: now,
      updatedAt: now,
    };
    state.payments.push(payment);
    return payment;
  }
  const client = getClient();
  const { data, error } = await client
    .from('payments')
    .insert({
      order_id: params.orderId,
      participant_id: params.participantId,
      amount_cents: params.amountCents,
      status: params.status ?? 'pending',
      provider: params.provider ?? 'stripe',
      provider_payment_id: params.providerPaymentId ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      raw: params.raw ?? {},
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Paiement impossible.');
  return mapPaymentRow(data as DbPayment);
};

export const updatePaymentStatus = async (paymentId: string, status: Payment['status']) => {
  if (DEMO_MODE) {
    for (const state of demoStateByOrderId.values()) {
      const idx = state.payments.findIndex((payment) => payment.id === paymentId);
      if (idx === -1) continue;
      const now = new Date();
      const updated: Payment = {
        ...state.payments[idx],
        status,
        paidAt: status === 'paid' ? now : state.payments[idx].paidAt,
        updatedAt: now,
      };
      state.payments[idx] = updated;
      return updated;
    }
    throw new Error('Paiement introuvable.');
  }
  const client = getClient();
  const payload: Partial<DbPayment> = { status };
  if (status === 'paid') {
    payload.paid_at = new Date().toISOString();
  }
  const { data, error } = await client
    .from('payments')
    .update(payload)
    .eq('id', paymentId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Mise a jour du paiement impossible.');
  return mapPaymentRow(data as DbPayment);
};

export const finalizePaymentSimulation = async (paymentId: string) => {
  if (DEMO_MODE) {
    return updatePaymentStatus(paymentId, 'paid');
  }
  const client = getClient();
  const { data, error } = await client.functions.invoke('finalize-payment', {
    body: { paymentId },
  });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let extractedMessage: string | null = null;
      try {
        const payload = await response.clone().json() as { error?: unknown };
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          extractedMessage = payload.error.trim();
        }
      } catch {
        // Ignore JSON parse errors and fallback to text payload below.
      }
      if (!extractedMessage) {
        try {
          const text = await response.clone().text();
          if (text.trim()) extractedMessage = text.trim();
        } catch {
          // Keep original error when response body cannot be parsed.
        }
      }
      if (extractedMessage) throw new Error(extractedMessage);
    }
    throw error;
  }
  return data;
};

export const finalizeClosePayment = async (paymentId: string) => {
  if (DEMO_MODE) {
    return updatePaymentStatus(paymentId, 'paid');
  }
  const client = getClient();
  const { data, error } = await client.rpc('finalize_close_payment', {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return data;
};

export const finalizeOrderPricing = async (orderId: string) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  await finalizeOrderPricingRpc(client, orderId);
  return null;
};

export const createPlatformInvoiceForOrder = async (orderId: string) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('create_platform_invoice_for_order', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data;
};

export const createPlatformInvoiceAndSendForOrder = async (orderId: string) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('create_platform_invoice_and_send_for_order', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data;
};

export const createLockClosePackage = async (orderId: string, useCoopBalance: boolean) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('create_lock_close_package', {
    p_order_id: orderId,
    p_use_coop_balance: useCoopBalance,
  });
  if (error) throw error;
  return data;
};

export const issueSharerInvoiceAfterLock = async (orderId: string) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('issue_sharer_invoice_after_lock', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data;
};

export const triggerOutgoingEmails = async () => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('call_process_emails_sortants');
  if (error) throw error;
  return data;
};

export const issueParticipantInvoiceWithCoop = async (params: {
  orderId: string;
  profileId: string;
  coopAppliedCents: number;
}) => {
  if (DEMO_MODE) return null;
  const client = getClient();
  const { data, error } = await client.rpc('issue_participant_invoice_with_coop', {
    p_order_id: params.orderId,
    p_profile_id: params.profileId,
    p_coop_cents: params.coopAppliedCents,
  });
  if (error) throw error;
  return data;
};

export const fetchCoopBalance = async (profileId: string): Promise<number> => {
  if (DEMO_MODE) return 0;
  const client = getClient();
  const { data, error } = await client
    .from('coop_balances')
    .select('balance_cents')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance_cents ?? 0);
};

const fetchInvoices = async (filters: {
  orderId: string;
  serie: InvoiceSerie;
  clientProfileId?: string;
  producerProfileId?: string;
}): Promise<Facture[]> => {
  if (DEMO_MODE) return [];
  const client = getClient();
  let query = client
    .from('factures')
    .select('*')
    .eq('order_id', filters.orderId)
    .eq('serie', filters.serie)
    .order('issued_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (filters.clientProfileId) {
    query = query.eq('client_profile_id', filters.clientProfileId);
  }
  if (filters.producerProfileId) {
    query = query.eq('producer_profile_id', filters.producerProfileId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data as DbFacture[] | null) ?? []).map(mapFactureRow);
};

export const fetchParticipantInvoices = async (orderId: string, currentProfileId: string): Promise<Facture[]> =>
  fetchInvoices({ orderId, serie: 'PROD_CLIENT', clientProfileId: currentProfileId });

export const fetchProducerInvoices = async (orderId: string, producerProfileId: string): Promise<Facture[]> =>
  fetchInvoices({ orderId, serie: 'PLAT_PROD', producerProfileId });

export const fetchInvoiceLines = async (invoiceId: string): Promise<FactureLigne[]> => {
  if (DEMO_MODE) return [];
  const client = getClient();
  const { data, error } = await client.from('facture_lignes').select('*').eq('facture_id', invoiceId);
  if (error) throw error;
  return ((data as DbFactureLigne[] | null) ?? []).map(mapFactureLigneRow);
};

export type ProducerStatementSources = {
  platformInvoice: Facture | null;
  platformInvoiceLines: FactureLigne[];
  platformCommissionCents: number | null;
  platformCommissionLineIds: string[];
  sharerInvoice: Facture | null;
  sharerInvoiceLines: FactureLigne[];
  sharerDiscountCents: number | null;
  sharerDiscountLineIds: string[];
  coopSurplusCents: number | null;
  coopSurplusLedgerId: string | null;
  participantGainsCents: number | null;
  participantGainsLedgerRefs: string[];
  participantCoopUsedCents: number | null;
};

type ProducerStatementCoopRpc = {
  coop_surplus_cents?: number | null;
  coop_surplus_ledger_id?: string | null;
  participant_gains_cents?: number | null;
  participant_gains_ledger_refs?: string[] | null;
  participant_coop_used_cents?: number | null;
};

export const fetchProducerStatementSources = async (params: {
  orderId: string;
  producerProfileId: string;
  sharerProfileId: string;
}): Promise<ProducerStatementSources> => {
  if (DEMO_MODE) {
    return {
      platformInvoice: null,
      platformInvoiceLines: [],
      platformCommissionCents: null,
      platformCommissionLineIds: [],
      sharerInvoice: null,
      sharerInvoiceLines: [],
      sharerDiscountCents: null,
      sharerDiscountLineIds: [],
      coopSurplusCents: null,
      coopSurplusLedgerId: null,
      participantGainsCents: null,
      participantGainsLedgerRefs: [],
      participantCoopUsedCents: null,
    };
  }

  const client = getClient();
  const [platformInvoices, sharerInvoices] = await Promise.all([
    fetchInvoices({
      orderId: params.orderId,
      serie: 'PLAT_PROD',
      producerProfileId: params.producerProfileId,
    }),
    fetchInvoices({
      orderId: params.orderId,
      serie: 'PROD_CLIENT',
      clientProfileId: params.sharerProfileId,
    }),
  ]);

  const platformInvoice = platformInvoices[0] ?? null;
  const sharerInvoice = sharerInvoices[0] ?? null;

  const [platformInvoiceLines, sharerInvoiceLines] = await Promise.all([
    platformInvoice ? fetchInvoiceLines(platformInvoice.id) : Promise.resolve([]),
    sharerInvoice ? fetchInvoiceLines(sharerInvoice.id) : Promise.resolve([]),
  ]);

  const platformCommissionLines = platformInvoiceLines.filter(isPlatformCommissionLine);
  const platformCommissionCents =
    platformCommissionLines.length > 0
      ? platformCommissionLines.reduce((sum, line) => sum + Math.max(0, line.totalTtcCents), 0)
      : platformInvoice
        ? Math.max(0, platformInvoice.totalTtcCents)
        : null;

  const sharerDiscountLines = sharerInvoiceLines.filter(isSharerDiscountLine);
  const sharerDiscountCents =
    sharerDiscountLines.length > 0
      ? sharerDiscountLines.reduce((sum, line) => sum + Math.max(0, -line.totalTtcCents), 0)
      : sharerInvoice
        ? 0
        : null;
  let coopSource: ProducerStatementCoopRpc | null = null;
  const { data: coopData, error: coopRpcError } = await client.rpc('get_producer_statement_sources', {
    p_order_id: params.orderId,
  });
  if (coopRpcError) {
    console.error('Producer statement coop RPC error:', coopRpcError);
  } else if (Array.isArray(coopData)) {
    coopSource = (coopData[0] as ProducerStatementCoopRpc | undefined) ?? null;
  } else if (coopData && typeof coopData === 'object') {
    coopSource = coopData as ProducerStatementCoopRpc;
  }

  const coopSurplusCents =
    coopSource?.coop_surplus_cents !== null && coopSource?.coop_surplus_cents !== undefined
      ? Math.max(0, Number(coopSource.coop_surplus_cents))
      : null;
  const coopSurplusLedgerId = coopSource?.coop_surplus_ledger_id ?? null;
  const participantGainsCents =
    coopSource?.participant_gains_cents !== null && coopSource?.participant_gains_cents !== undefined
      ? Math.max(0, Number(coopSource.participant_gains_cents))
      : null;
  const participantGainsLedgerRefs = (
    Array.isArray(coopSource?.participant_gains_ledger_refs) ? coopSource?.participant_gains_ledger_refs : []
  ).filter((value): value is string => typeof value === 'string' && value.length > 0);
  const participantCoopUsedCents =
    coopSource?.participant_coop_used_cents !== null && coopSource?.participant_coop_used_cents !== undefined
      ? Math.max(0, Number(coopSource.participant_coop_used_cents))
      : null;

  return {
    platformInvoice,
    platformInvoiceLines,
    platformCommissionCents,
    platformCommissionLineIds: platformCommissionLines.map((line) => line.id),
    sharerInvoice,
    sharerInvoiceLines,
    sharerDiscountCents,
    sharerDiscountLineIds: sharerDiscountLines.map((line) => line.id),
    coopSurplusCents,
    coopSurplusLedgerId,
    participantGainsCents,
    participantGainsLedgerRefs,
    participantCoopUsedCents,
  };
};

export const getInvoiceDownloadUrl = async (invoice: Facture): Promise<string | null> => {
  if (!invoice.pdfPath) return null;
  const client = getClient();
  const { data, error } = await client.storage.from(INVOICES_BUCKET).createSignedUrl(invoice.pdfPath, 60);
  if (error) throw error;
  return data?.signedUrl ?? null;
};

export const getParticipantByProfile = async (orderId: string, profileId: string): Promise<OrderParticipant | null> => {
  if (DEMO_MODE) {
    const demoOrder = findDemoOrderById(orderId);
    if (!demoOrder) return null;
    const state = ensureDemoState(demoOrder);
    return state.participants.find((participant) => participant.profileId === profileId) ?? null;
  }
  const client = getClient();
  const { data, error } = await client
    .from('order_participants')
    .select('*')
    .eq('order_id', orderId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapParticipantRow(data as DbOrderParticipant);
};

export const deleteParticipantIfNoActivity = async (params: {
  orderId: string;
  participantId: string;
  profileId: string;
}) => {
  if (DEMO_MODE) return;
  const client = getClient();
  const [{ count: itemsCount, error: itemsError }, { count: paymentsCount, error: paymentsError }] =
    await Promise.all([
      client
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', params.orderId)
        .eq('participant_id', params.participantId),
      client
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', params.orderId)
        .eq('participant_id', params.participantId),
    ]);

  if (itemsError) throw itemsError;
  if (paymentsError) throw paymentsError;
  if ((itemsCount ?? 0) > 0 || (paymentsCount ?? 0) > 0) return;

  const { error: deleteError } = await client
    .from('order_participants')
    .delete()
    .eq('id', params.participantId)
    .eq('order_id', params.orderId)
    .eq('profile_id', params.profileId)
    .eq('role', 'participant');

  if (deleteError) throw deleteError;
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<OrderStatus> => {
  if (DEMO_MODE) {
    demoOrderOverrides.set(orderId, { status });
    return status;
  }
  const client = getClient();
  const { error: rpcError } = await client.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (rpcError) {
    const isStatusDatesConstraint =
      rpcError.code === '23514' &&
      typeof rpcError.message === 'string' &&
      rpcError.message.includes('orders_status_dates_consistency_check');
    if (!isStatusDatesConstraint) throw rpcError;

    // Fallback when the RPC does not populate status date columns expected by the constraint.
    const { data: orderRow, error: orderError } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError || !orderRow) throw orderError ?? rpcError;

    const statusDateColumns: Partial<Record<OrderStatus, string>> = {
      locked: 'locked_at',
      confirmed: 'confirmed_at',
      preparing: 'preparing_at',
      prepared: 'prepared_at',
      delivered: 'delivered_at',
      distributed: 'distributed_at',
      finished: 'finished_at',
      cancelled: 'cancelled_at',
    };
    const statusOrder: OrderStatus[] = [
      'locked',
      'confirmed',
      'preparing',
      'prepared',
      'delivered',
      'distributed',
      'finished',
    ];
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if ('updated_at' in orderRow) {
      updates.updated_at = now;
    }
    const statusIndex = statusOrder.indexOf(status);
    if (status === 'cancelled') {
      const column = statusDateColumns.cancelled;
      if (column && column in orderRow && (orderRow as Record<string, unknown>)[column] == null) {
        updates[column] = now;
      }
    } else if (statusIndex >= 0) {
      for (let i = 0; i <= statusIndex; i += 1) {
        const step = statusOrder[i];
        const column = statusDateColumns[step];
        if (!column) continue;
        if (!(column in orderRow)) continue;
        if ((orderRow as Record<string, unknown>)[column] == null) {
          updates[column] = now;
        }
      }
    }
    const { data, error } = await client
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select('status')
      .maybeSingle();
    if (error) throw error;
    if (data?.status) {
      return data.status as OrderStatus;
    }
  }

  const { data, error } = await client.from('orders').select('status').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!data?.status) {
    throw new Error("Aucune ligne mise a jour. Verifiez les droits d'acces sur la commande.");
  }
  return data.status as OrderStatus;
};

export const updateOrderVisibility = async (orderId: string, visibility: 'public' | 'private') => {
  if (DEMO_MODE) {
    demoOrderOverrides.set(orderId, { visibility });
    return;
  }
  const client = getClient();
  const { error } = await client.from('orders').update({ visibility }).eq('id', orderId);
  if (error) throw error;
};

export const updateOrderParticipantSettings = async (
  orderId: string,
  updates: {
    autoApproveParticipationRequests?: boolean;
    allowSharerMessages?: boolean;
    autoApprovePickupSlots?: boolean;
  }
) => {
  if (DEMO_MODE) {
    const existing = demoOrderOverrides.get(orderId) ?? {};
    demoOrderOverrides.set(orderId, { ...existing, ...updates });
    return;
  }
  const client = getClient();
  const { error } = await client
    .from('orders')
    .update({
      auto_approve_participation_requests: updates.autoApproveParticipationRequests,
      allow_sharer_messages: updates.allowSharerMessages,
      auto_approve_pickup_slots: updates.autoApprovePickupSlots,
    })
    .eq('id', orderId);
  if (error) throw error;
};

export const updatePickupSlotEnabled = async (slotId: string, enabled: boolean) => {
  const client = getClient();
  const { error } = await client.from('order_pickup_slots').update({ enabled }).eq('id', slotId);
  if (error) throw error;
};

export const updateParticipantsVisibility = async (
  orderId: string,
  participantsVisibility: ParticipantVisibility
) => {
  if (DEMO_MODE) {
    demoOrderOverrides.set(orderId, { participantsVisibility });
    return;
  }
  const client = getClient();
  const { error } = await client
    .from('orders')
    .update({ participants_visibility: participantsVisibility })
    .eq('id', orderId);
  if (error) throw error;
};
