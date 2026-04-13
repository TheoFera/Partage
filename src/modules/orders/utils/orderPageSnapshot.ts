import type { GroupOrder, OrderPurchaseDraft } from '../../../shared/types';
import type { ProducerStatementSources } from '../api/orders';
import type { Facture, OrderFull } from '../types';

const ORDER_PAGE_SNAPSHOT_PREFIX = 'partage:order-page-snapshot:v1';

const DATE_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'deadline',
  'estimatedDeliveryDate',
  'pickupDate',
  'requestedAt',
  'reviewedAt',
  'pickupSlotRequestedAt',
  'pickupSlotReviewedAt',
  'pickupCodeGeneratedAt',
  'pickedUpAt',
  'paidAt',
  'issuedAt',
  'expiresAt',
  'statusUpdatedAt',
]);

type SnapshotEnvelope<T> = {
  version: 1;
  savedAt: string;
  data: T;
};

export type OrderPageSnapshotScope = 'client' | 'close' | 'payment';

export type OrderClientPageSnapshot = {
  orderFull: OrderFull;
  participantInvoices: Facture[];
  producerInvoices: Facture[];
  producerStatementSources: ProducerStatementSources | null;
  platformShareCents: number;
  coopBalanceCents: number;
  useCoopBalance: boolean;
  quantities: Record<string, number>;
  participantsVisibility: OrderFull['order']['participantsVisibility'];
};

export type OrderClosePageSnapshot = {
  orderFull: OrderFull;
  extraQuantities: Record<string, number>;
  coopBalanceCents: number;
  useCoopBalance: boolean;
};

export type OrderPaymentPageSnapshot = {
  order: GroupOrder;
  draft: OrderPurchaseDraft;
  checkoutPaymentSessionId: string | null;
  checkoutClientSecret: string | null;
  providerPaymentId: string | null;
  paymentState: 'idle' | 'processing' | 'succeeded' | 'failed' | 'retryable';
  paymentStatusMessage: string | null;
  paymentError: string | null;
};

const snapshotReviver = (key: string, value: unknown) => {
  if (typeof value === 'string' && DATE_FIELD_NAMES.has(key)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return value;
};

const isSnapshotEnvelope = <T,>(value: unknown): value is SnapshotEnvelope<T> => {
  if (!value || typeof value !== 'object') return false;
  return 'data' in value && 'version' in value;
};

export const buildOrderPageSnapshotKey = (
  scope: OrderPageSnapshotScope,
  orderKey?: string | null,
  viewerKey?: string | null
) => {
  const normalizedOrderKey = orderKey?.trim();
  if (!normalizedOrderKey) return null;
  const normalizedViewerKey = viewerKey?.trim() || 'guest';
  return `${ORDER_PAGE_SNAPSHOT_PREFIX}:${scope}:${normalizedOrderKey}:${normalizedViewerKey}`;
};

export const readOrderPageSnapshot = <T,>(storageKey: string | null): T | null => {
  if (typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw, snapshotReviver) as SnapshotEnvelope<T> | T;
    return isSnapshotEnvelope<T>(parsed) ? parsed.data : parsed;
  } catch (error) {
    console.warn('Unable to parse order page snapshot:', error);
    return null;
  }
};

export const findOrderPageSnapshot = <T,>(storageKeys: Array<string | null | undefined>) => {
  for (const storageKey of storageKeys) {
    const key = storageKey ?? null;
    const snapshot = readOrderPageSnapshot<T>(key);
    if (key && snapshot) {
      return { storageKey: key, snapshot };
    }
  }
  return null;
};

export const writeOrderPageSnapshot = <T,>(storageKey: string | null, data: T) => {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const payload: SnapshotEnvelope<T> = {
      version: 1,
      savedAt: new Date().toISOString(),
      data,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist order page snapshot:', error);
  }
};

export const clearOrderPageSnapshot = (storageKey: string | null) => {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Unable to clear order page snapshot:', error);
  }
};
