export type OrderStatus =
  | 'draft'
  | 'open'
  | 'locked'
  | 'confirmed'
  | 'preparing'
  | 'prepared'
  | 'delivered'
  | 'distributed'
  | 'finished'
  | 'cancelled';

export type DeliveryOption = 'chronofresh' | 'producer_delivery' | 'producer_pickup';
export type ShareMode = 'products' | 'cash';
export type ParticipationStatus = 'requested' | 'invited' | 'accepted' | 'rejected' | 'removed';
export type PickupSlotStatus = 'requested' | 'accepted' | 'rejected';

export type ParticipantVisibility = {
  profile: boolean;
  content: boolean;
  weight: boolean;
  amount: boolean;
};

export type DbOrder = {
  id: string;
  order_code: string;
  created_by: string;
  sharer_profile_id: string;
  producer_profile_id: string;
  title: string;
  visibility: 'public' | 'private';
  status: OrderStatus;
  deadline: string | null;
  message: string | null;
  auto_approve_participation_requests: boolean;
  allow_sharer_messages: boolean;
  auto_approve_pickup_slots: boolean;
  min_weight_kg: number;
  max_weight_kg: number | null;
  ordered_weight_kg: number;
  delivery_option: DeliveryOption;
  delivery_street: string | null;
  delivery_info: string | null;
  delivery_city: string | null;
  delivery_postcode: string | null;
  delivery_address: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  estimated_delivery_date: string | null;
  pickup_street: string | null;
  pickup_info: string | null;
  pickup_city: string | null;
  pickup_postcode: string | null;
  pickup_address: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  use_pickup_date: boolean;
  pickup_date: string | null;
  pickup_window_weeks: number | null;
  pickup_delivery_fee_cents: number;
  sharer_percentage: number;
  share_mode: ShareMode;
  sharer_quantities: Record<string, number>;
  currency: string;
  base_total_cents: number;
  delivery_fee_cents: number;
  participant_total_cents: number;
  sharer_share_cents: number;
  effective_weight_kg: number;
  participants_visibility: ParticipantVisibility;
  created_at: string;
  updated_at: string;
};

export type DbOrderProduct = {
  id: string;
  order_id: string;
  product_id: string;
  sort_order: number | null;
  is_enabled: boolean;
  unit_label: string | null;
  unit_weight_kg: number | null;
  unit_base_price_cents: number;
  unit_delivery_cents: number;
  unit_sharer_fee_cents: number;
  unit_final_price_cents: number;
  price_breakdown_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type DbOrderPickupSlot = {
  id: string;
  order_id: string;
  slot_type: 'weekday' | 'date';
  day: string | null;
  slot_date: string | null;
  label: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DbOrderParticipant = {
  id: string;
  order_id: string;
  profile_id: string | null;
  role: 'sharer' | 'participant';
  participation_status: ParticipationStatus;
  request_message: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  pickup_slot_id: string | null;
  pickup_slot_status: PickupSlotStatus | null;
  pickup_slot_requested_at: string | null;
  pickup_slot_reviewed_at: string | null;
  pickup_slot_reviewed_by: string | null;
  total_weight_kg: number;
  total_amount_cents: number;
  created_at: string;
  updated_at: string;
  pickup_code: string | null;
  pickup_code_generated_at: string | null;
  picked_up_at: string | null;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  participant_id: string;
  product_id: string;
  lot_id: string | null;
  quantity_units: number;
  unit_label: string | null;
  unit_weight_kg: number | null;
  unit_base_price_cents: number;
  unit_delivery_cents: number;
  unit_sharer_fee_cents: number;
  unit_final_price_cents: number;
  line_total_cents: number;
  line_weight_kg: number;
  is_sharer_share: boolean;
  created_at: string;
  updated_at: string;
};

export type DbPayment = {
  id: string;
  order_id: string;
  participant_id: string;
  provider: string;
  provider_payment_id: string | null;
  idempotency_key: string | null;
  status:
    | 'pending'
    | 'authorized'
    | 'paid'
    | 'failed'
    | 'cancelled'
    | 'refunded'
    | 'partially_refunded';
  amount_cents: number;
  fee_cents: number;
  refunded_amount_cents: number;
  currency: string;
  paid_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DbLotReservation = {
  id: string;
  lot_id: string;
  order_id: string;
  order_item_id: string;
  reserved_units: number | null;
  reserved_kg: number | null;
  status: 'active' | 'released' | 'consumed' | 'expired';
  expires_at: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  orderCode: string;
  createdBy: string;
  sharerProfileId: string;
  producerProfileId: string;
  title: string;
  visibility: 'public' | 'private';
  status: OrderStatus;
  deadline: Date | null;
  message: string | null;
  autoApproveParticipationRequests: boolean;
  allowSharerMessages: boolean;
  autoApprovePickupSlots: boolean;
  minWeightKg: number;
  maxWeightKg: number | null;
  orderedWeightKg: number;
  deliveryOption: DeliveryOption;
  deliveryStreet: string | null;
  deliveryInfo: string | null;
  deliveryCity: string | null;
  deliveryPostcode: string | null;
  deliveryAddress: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  estimatedDeliveryDate: Date | null;
  pickupStreet: string | null;
  pickupInfo: string | null;
  pickupCity: string | null;
  pickupPostcode: string | null;
  pickupAddress: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  usePickupDate: boolean;
  pickupDate: Date | null;
  pickupWindowWeeks: number | null;
  pickupDeliveryFeeCents: number;
  sharerPercentage: number;
  shareMode: ShareMode;
  sharerQuantities: Record<string, number>;
  currency: string;
  baseTotalCents: number;
  deliveryFeeCents: number;
  participantTotalCents: number;
  sharerShareCents: number;
  effectiveWeightKg: number;
  participantsVisibility: ParticipantVisibility;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderProductInfo = {
  id: string;
  code: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  packaging?: string | null;
  measurement: 'unit' | 'kg';
  unitWeightKg: number | null;
  imageUrl?: string | null;
  producerProfileId?: string | null;
  producerName?: string | null;
  producerLocation?: string | null;
};

export type OrderProduct = {
  id: string;
  orderId: string;
  productId: string;
  sortOrder: number | null;
  isEnabled: boolean;
  unitLabel: string | null;
  unitWeightKg: number | null;
  unitBasePriceCents: number;
  unitDeliveryCents: number;
  unitSharerFeeCents: number;
  unitFinalPriceCents: number;
  priceBreakdownSnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  product: OrderProductInfo | null;
};

export type OrderPickupSlot = {
  id: string;
  orderId: string;
  slotType: 'weekday' | 'date';
  day: string | null;
  slotDate: string | null;
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

export type OrderParticipant = {
  id: string;
  orderId: string;
  profileId: string | null;
  role: 'sharer' | 'participant';
  participationStatus: ParticipationStatus;
  requestMessage: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  pickupSlotId: string | null;
  pickupSlotStatus: PickupSlotStatus | null;
  pickupSlotRequestedAt: Date | null;
  pickupSlotReviewedAt: Date | null;
  pickupSlotReviewedBy: string | null;
  totalWeightKg: number;
  totalAmountCents: number;
  createdAt: Date;
  updatedAt: Date;
  profileName?: string | null;
  profileHandle?: string | null;
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
  pickupCode: string | null;
  pickupCodeGeneratedAt: Date | null;
  pickedUpAt: Date | null;
};

export type ProfileSummary = {
  name?: string | null;
  handle?: string | null;
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  participantId: string;
  productId: string;
  lotId: string | null;
  quantityUnits: number;
  unitLabel: string | null;
  unitWeightKg: number | null;
  unitBasePriceCents: number;
  unitDeliveryCents: number;
  unitSharerFeeCents: number;
  unitFinalPriceCents: number;
  lineTotalCents: number;
  lineWeightKg: number;
  isSharerShare: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Payment = {
  id: string;
  orderId: string;
  participantId: string;
  provider: string;
  providerPaymentId: string | null;
  idempotencyKey: string | null;
  status: DbPayment['status'];
  amountCents: number;
  feeCents: number;
  refundedAmountCents: number;
  currency: string;
  paidAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type LotReservation = {
  id: string;
  lotId: string;
  orderId: string;
  orderItemId: string;
  reservedUnits: number | null;
  reservedKg: number | null;
  status: DbLotReservation['status'];
  expiresAt: Date | null;
  createdAt: Date;
};

export type OrderFull = {
  order: Order;
  productsOffered: OrderProduct[];
  pickupSlots: OrderPickupSlot[];
  participants: OrderParticipant[];
  items: OrderItem[];
  payments: Payment[];
  profiles?: Record<string, ProfileSummary>;
};

export const centsToEuros = (value: number) => Math.round(value) / 100;
export const eurosToCents = (value: number) => Math.round(value * 100);
