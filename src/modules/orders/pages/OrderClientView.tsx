import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Globe2,
  Info,
  Lock,
  MapPin,
  SlidersHorizontal,
  ShoppingCart,
  ShieldCheck,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { User, Product } from '../../../shared/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProductResultCard } from '../../products/components/ProductGroup';
import { formatUnitWeightLabel } from '../../products/utils/weight';
import { Avatar } from '../../../shared/ui/Avatar';
import { CARD_WIDTH, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../../../shared/constants/cards';
import { toast } from 'sonner';
import './OrderClientView.css';
import { eurosToCents, formatEurosFromCents } from '../../../shared/lib/money';
import { getOrderStatusLabel, getOrderStatusProgress } from '../utils/orderStatus';
import {
  addItem,
  approveParticipation,
  createPlatformInvoiceAndSendForOrder,
  createPaymentStub,
  deleteParticipantIfNoActivity,
  finalizePaymentSimulation,
  fetchCoopBalance,
  fetchParticipantInvoices,
  fetchProducerStatementSources,
  fetchProducerInvoices,
  getInvoiceDownloadUrl,
  getOrderFullByCode,
  issueParticipantInvoiceWithCoop,
  removeItem,
  rejectParticipation,
  reviewParticipantPickupSlot,
  requestParticipation,
  setParticipantPickupSlot,
  updatePaymentStatus,
  updateParticipantsVisibility,
  updateOrderItemQuantity,
  updateOrderParticipantSettings,
  updateOrderStatus,
  updateOrderVisibility,
} from '../api/orders';
import type { ProducerStatementSources } from '../api/orders';
import { centsToEuros, type Facture, type OrderFull, type OrderStatus, type PickupSlotStatus } from '../types';

interface OrderClientViewProps {
  onClose: () => void;
  currentUser?: User | null;
  onOpenParticipantProfile?: (participantName: string) => void;
  onStartPayment?: (payload: {
    quantities: Record<string, number>;
    total: number;
    weight: number;
    useCoopBalance: boolean;
  }) => void;
  supabaseClient?: SupabaseClient | null;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

function labelForDay(day?: string | null) {
  if (!day) return '';
  return DAY_LABELS[day] ?? day;
}

const normalizeOpeningHoursDayKey = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (DAY_LABELS[normalized]) return normalized;
  const match = Object.entries(DAY_LABELS).find(([, label]) => label.toLowerCase() === normalized);
  return match ? match[0] : null;
};

const OPENING_HOURS_DAY_ORDER: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const buildOpeningHoursByDay = (openingHours?: Record<string, string> | null) => {
  const result: Record<string, string> = {};
  if (!openingHours) return result;
  Object.entries(openingHours).forEach(([day, hours]) => {
    const key = normalizeOpeningHoursDayKey(day);
    const value = (hours ?? '').trim();
    if (!key || !value) return;
    result[key] = value;
  });
  return result;
};

type PickupSlot = {
  day?: string | null;
  date?: string | null;
  label?: string | null;
  start?: string | null;
  end?: string | null;
};

type PickupSlotReservation = {
  id: string;
  name: string;
  status: PickupSlotStatus | null;
  time: string | null;
};

function formatPickupSlotLabel(slot: PickupSlot) {
  if (slot.date) {
    const date = new Date(slot.date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
    return slot.date;
  }
  return labelForDay(slot.label ?? slot.day);
}

function formatPickupSlotTime(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : trimmed;
}

const PICKUP_SLOT_TIME_STEP_MINUTES = 15;

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatMinutesToTime = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const ceilToStep = (value: number, step: number) => Math.ceil(value / step) * step;

const buildPickupTimeOptions = (
  start?: string | null,
  end?: string | null,
  minMinutes?: number | null
) => {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return [];
  const [from, to] = startMinutes <= endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];
  const minBound =
    typeof minMinutes === 'number'
      ? Math.min(Math.max(ceilToStep(minMinutes, PICKUP_SLOT_TIME_STEP_MINUTES), from), to + 1)
      : from;
  const options: string[] = [];
  for (let current = minBound; current <= to; current += PICKUP_SLOT_TIME_STEP_MINUTES) {
    options.push(formatMinutesToTime(current));
  }
  return options;
};

const PICKUP_SLOT_STATUS_LABELS: Record<PickupSlotStatus, string> = {
  accepted: 'Accepté',
  rejected: 'Refusé',
  requested: 'En attente',
};

const formatPickupSlotStatusLabel = (status?: PickupSlotStatus | null) =>
  status ? PICKUP_SLOT_STATUS_LABELS[status] ?? null : null;

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const toRange = (start: Date | null, end: Date | null) => {
  if (!start || !end) return null;
  const startTime = start.getTime();
  const endTime = end.getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  return startTime <= endTime ? { start, end } : { start: end, end: start };
};

const isDateInRange = (date: Date, range: { start: Date; end: Date } | null) => {
  if (!range) return false;
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
};

const buildCalendarDays = (month: Date) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const totalCells = Math.ceil((offset + totalDays) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - offset + 1;
    if (dayNumber < 1 || dayNumber > totalDays) return null;
    return new Date(year, monthIndex, dayNumber);
  });
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

function getProductWeightKg(product: { weightKg?: number; unit?: string; measurement?: 'unit' | 'kg' }) {
  if (product.weightKg) return product.weightKg;
  const unit = product.unit?.toLowerCase() ?? '';
  const match = unit.match(/([\d.,]+)\s*(kg|g)/);
  if (match) {
    const raw = parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(raw)) {
      return match[2] === 'kg' ? raw : raw / 1000;
    }
  }
  if (product.measurement === 'kg') return 1;
  return 0.25;
}

const formatProductWeightLabelForSelection = (product: {
  weightKg?: number;
  unit?: string;
  measurement?: 'unit' | 'kg';
}) => {
  const weightKg = getProductWeightKg(product);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return '';
  if (weightKg < 1) {
    const gramLabel = formatUnitWeightLabel(weightKg);
    return gramLabel || `${Math.round(weightKg * 1000)}g`;
  }
  return `${weightKg.toFixed(2)} kg`;
};

const getProductMeasurementLabel = (product: { measurement?: 'unit' | 'kg'; weightKg?: number | null }) => {
  if (product.measurement === 'kg') return 'kg';
  if (product.measurement === 'unit') return formatUnitWeightLabel(product.weightKg);
  return '';
};

const normalizeTextForSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const slugify = (value: string) =>
  normalizeTextForSlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const buildProductPath = (product: Product, orderCode?: string | null) => {
  const productCode = product.productCode ?? product.id;
  const slug = product.slug ?? slugify(product.name);
  const lotCode = product.activeLotCode ?? null;
  if (lotCode) {
    const base = `/produits/${slug || 'produit'}-${productCode}/lot/${lotCode}`;
    return orderCode ? `${base}/cmd/${orderCode}` : base;
  }
  return `/produits/${slug || 'produit'}-${productCode}`;
};

const DEFAULT_PROFILE_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="80" fill="#E5E7EB" />
      <circle cx="80" cy="64" r="30" fill="#9CA3AF" />
      <ellipse cx="80" cy="118" rx="42" ry="32" fill="#6B7280" />
    </svg>`
  );

const resolveOrderEffectiveWeightKg = (
  orderedWeightKg: number,
  minWeightKg: number,
  maxWeightKg: number | null
) => {
  const current = Math.max(0, orderedWeightKg ?? 0);
  const min = Math.max(0, minWeightKg ?? 0);
  if (typeof maxWeightKg === 'number' && maxWeightKg > 0) {
    return Math.min(Math.max(current, min), maxWeightKg);
  }
  return Math.max(current, min);
};

const PAID_PAYMENT_STATUSES = new Set(['paid', 'authorized']);

const sumPaidCentsForParticipant = (payments: OrderFull['payments'], participantId?: string | null) => {
  if (!participantId) return 0;
  return payments.reduce(
    (sum, payment) =>
      payment.participantId === participantId && PAID_PAYMENT_STATUSES.has(payment.status)
        ? sum + payment.amountCents
        : sum,
    0
  );
};

const ORDER_DELIVERY_OPTION_LABELS = {
  chronofresh: 'Chronofresh',
  producer_delivery: 'Livraison producteur',
  producer_pickup: 'Retrait par le partageur',
} as const;

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Brouillon',
  open: 'Ouverte',
  locked: 'Clôturée',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  prepared: 'En livraison',
  delivered: 'Livrée au partageur',
  distributed: 'Distribuée',
  finished: 'Terminée',
  cancelled: 'Annulée',
};

const ORDER_CARD_WIDTH = CARD_WIDTH;

type ParticipantVisibility = {
  profile: boolean;
  content: boolean;
  weight: boolean;
  amount: boolean;
};

type OrderParticipant = {
  id: string;
  profileId?: string | null;
  name: string;
  handle?: string;
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
  quantities: Record<string, number>;
  totalWeight: number;
  totalAmount: number;
  pickupCode: string | null;
  role: 'sharer' | 'participant';
};

const defaultParticipantVisibility: ParticipantVisibility = {
  profile: false,
  content: false,
  weight: false,
  amount: false,
};

const participantVisibilityOptions: Array<{ key: keyof ParticipantVisibility; label: string }> = [
  { key: 'profile', label: 'Profil des participants' },
  { key: 'content', label: 'Contenu de la commande' },
  { key: 'weight', label: 'Poids de la participation' },
  { key: 'amount', label: 'Montant de la participation' },
];

const emptyOrder: OrderFull['order'] = {
  id: '',
  orderCode: '',
  createdBy: '',
  sharerProfileId: '',
  producerProfileId: '',
  title: '',
  visibility: 'public',
  status: 'open',
  deadline: null,
  message: null,
  autoApproveParticipationRequests: false,
  allowSharerMessages: true,
  autoApprovePickupSlots: false,
  minWeightKg: 0,
  maxWeightKg: null,
  orderedWeightKg: 0,
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
  estimatedDeliveryDate: null,
  pickupStreet: null,
  pickupInfo: null,
  pickupCity: null,
  pickupPostcode: null,
  pickupAddress: null,
  pickupLat: null,
  pickupLng: null,
  usePickupDate: false,
  pickupDate: null,
  pickupWindowWeeks: null,
  pickupDeliveryFeeCents: 0,
  sharerPercentage: 0,
  shareMode: 'products',
  sharerQuantities: {},
  currency: 'EUR',
  baseTotalCents: 0,
  deliveryFeeCents: 0,
  participantTotalCents: 0,
  sharerShareCents: 0,
  effectiveWeightKg: 0,
  participantsVisibility: defaultParticipantVisibility,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const emptyOrderFull: OrderFull = {
  order: emptyOrder,
  productsOffered: [],
  pickupSlots: [],
  participants: [],
  items: [],
  payments: [],
  profiles: {},
};

export function OrderClientView({
  onClose,
  currentUser,
  onOpenParticipantProfile,
  onStartPayment,
  supabaseClient,
}: OrderClientViewProps) {
  const navigate = useNavigate();
  const { orderCode } = useParams<{ orderCode: string }>();
  const [orderFull, setOrderFull] = React.useState<OrderFull | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isWorking, setIsWorking] = React.useState(false);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [participantsVisibility, setParticipantsVisibility] = React.useState<ParticipantVisibility>(
    defaultParticipantVisibility
  );
  const [participantsPanelOpen, setParticipantsPanelOpen] = React.useState(false);
  const participantsPanelRef = React.useRef<HTMLDivElement | null>(null);
  const participantsButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [participantInvoices, setParticipantInvoices] = React.useState<Facture[]>([]);
  const [producerInvoices, setProducerInvoices] = React.useState<Facture[]>([]);
  const [isInvoiceLoading, setIsInvoiceLoading] = React.useState(false);
  const [producerStatementSources, setProducerStatementSources] = React.useState<ProducerStatementSources | null>(
    null
  );
  const [isProducerStatementLoading, setIsProducerStatementLoading] = React.useState(false);
  const [platformShareCents, setPlatformShareCents] = React.useState(0);
  const [coopBalanceCents, setCoopBalanceCents] = React.useState(0);
  const [useCoopBalance, setUseCoopBalance] = React.useState(true);

  const isAuthenticated = Boolean(currentUser);

  const loadInvoices = React.useCallback(
    async (orderId: string, producerProfileId?: string | null) => {
      if (!currentUser?.id) {
        setParticipantInvoices([]);
        setProducerInvoices([]);
        return;
      }
      setIsInvoiceLoading(true);
      try {
        const isProducerForOrder =
          Boolean(producerProfileId) &&
          (currentUser.id === producerProfileId || currentUser.producerId === producerProfileId);
        const [participantData, producerData] = await Promise.all([
          fetchParticipantInvoices(orderId, currentUser.id),
          isProducerForOrder && producerProfileId
            ? fetchProducerInvoices(orderId, producerProfileId)
            : Promise.resolve([]),
        ]);
        setParticipantInvoices(participantData);
        setProducerInvoices(producerData);
      } catch (error) {
        console.error('Invoice load error:', error);
        toast.error('Impossible de charger les factures.');
      } finally {
        setIsInvoiceLoading(false);
      }
    },
    [currentUser]
  );

  const loadOrder = React.useCallback(async () => {
    if (!orderCode) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getOrderFullByCode(orderCode);
      setOrderFull(data);
      const next: Record<string, number> = {};
      data.productsOffered.forEach((entry) => {
        const key = entry.product?.code ?? entry.productId;
        if (!key) return;
        next[key] = Math.max(0, Number(next[key]) || 0);
      });
      setQuantities(next);
      setParticipantsVisibility(data.order.participantsVisibility);
      setParticipantsPanelOpen(false);
      await loadInvoices(data.order.id, data.order.producerProfileId);
    } catch (error) {
      console.error('Order load error:', error);
      setLoadError('Impossible de charger la commande.');
    } finally {
      setIsLoading(false);
    }
  }, [orderCode, loadInvoices]);

  React.useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  React.useEffect(() => {
    const activeOrder = orderFull?.order;
    if (!activeOrder || !currentUser?.id) return;

    const isProducerForOrder =
      Boolean(activeOrder.producerProfileId) &&
      (currentUser.id === activeOrder.producerProfileId ||
        currentUser.producerId === activeOrder.producerProfileId);

    const hasPendingParticipantPdf = participantInvoices.some((invoice) => !invoice.pdfPath);
    const hasPendingProducerPdf = isProducerForOrder && producerInvoices.some((invoice) => !invoice.pdfPath);
    if (!hasPendingParticipantPdf && !hasPendingProducerPdf) return;

    let cancelled = false;
    let retries = 0;
    const maxRetries = 20;
    const delayMs = 3000;

    const refresh = async () => {
      if (cancelled) return;
      retries += 1;
      try {
        const [participantData, producerData] = await Promise.all([
          fetchParticipantInvoices(activeOrder.id, currentUser.id),
          isProducerForOrder && activeOrder.producerProfileId
            ? fetchProducerInvoices(activeOrder.id, activeOrder.producerProfileId)
            : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setParticipantInvoices(participantData);
        setProducerInvoices(producerData);

        const stillPendingParticipant = participantData.some((invoice) => !invoice.pdfPath);
        const stillPendingProducer = isProducerForOrder && producerData.some((invoice) => !invoice.pdfPath);
        if ((stillPendingParticipant || stillPendingProducer) && retries < maxRetries) {
          setTimeout(refresh, delayMs);
        }
      } catch (error) {
        console.error('Invoice polling error:', error);
        if (!cancelled && retries < maxRetries) {
          setTimeout(refresh, delayMs);
        }
      }
    };

    const timer = setTimeout(refresh, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    currentUser?.id,
    currentUser?.producerId,
    orderFull?.order,
    participantInvoices,
    producerInvoices,
  ]);

  React.useEffect(() => {
    if (!currentUser?.id) {
      setCoopBalanceCents(0);
      return;
    }
    let isActive = true;
    fetchCoopBalance(currentUser.id)
      .then((balance) => {
        if (isActive) setCoopBalanceCents(balance);
      })
      .catch((error) => {
        console.error('Coop balance load error:', error);
        if (isActive) setCoopBalanceCents(0);
      });
    return () => {
      isActive = false;
    };
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!orderFull || !supabaseClient) {
      setPlatformShareCents(0);
      return;
    }
    let isActive = true;

    const computePlatformShare = async () => {
      const items = orderFull.items ?? [];
      if (!items.length) {
        if (isActive) setPlatformShareCents(0);
        return;
      }

      const lotItems = items.filter((item) => item.lotId);
      const lotIds = Array.from(new Set(lotItems.map((item) => item.lotId).filter(Boolean))) as string[];
      const lotUnitTotals = lotItems.reduce((acc, item) => {
        if (!item.lotId) return acc;
        acc[item.lotId] = (acc[item.lotId] ?? 0) + item.quantityUnits;
        return acc;
      }, {} as Record<string, number>);
      const lotUnitBasePriceCents = lotItems.reduce((acc, item) => {
        if (!item.lotId) return acc;
        if (acc[item.lotId] === undefined) {
          acc[item.lotId] = item.unitBasePriceCents ?? 0;
        }
        return acc;
      }, {} as Record<string, number>);

      let platformFromLots = 0;
      const lotsWithPlatform = new Set<string>();
      if (lotIds.length > 0) {
        const { data, error } = await supabaseClient
          .from('lot_price_breakdown')
          .select('lot_id, value_type, value_cents')
          .in('lot_id', lotIds)
          .eq('source', 'platform');
        if (error) {
          console.error('Platform fee fetch error:', error);
        } else {
          (data ?? []).forEach((row) => {
            const lotId = row.lot_id as string;
            const units = lotUnitTotals[lotId] ?? 0;
            if (!units) return;
            const valueType = row.value_type ?? 'cents';
            let valuePerUnit = 0;
            if (valueType === 'percent') {
              const percent = Number(row.value_cents ?? 0);
              const baseCents = lotUnitBasePriceCents[lotId] ?? 0;
              valuePerUnit = Math.round(baseCents * (percent / 100));
            } else {
              valuePerUnit = Number(row.value_cents ?? 0);
            }
            if (!Number.isFinite(valuePerUnit)) return;
            platformFromLots += valuePerUnit * units;
            lotsWithPlatform.add(lotId);
          });
        }
      }

      let fallbackTotal = 0;
      const fallbackItems = items.filter((item) => !item.lotId || !lotsWithPlatform.has(item.lotId));
      if (fallbackItems.length) {
        const productIds = Array.from(
          new Set(fallbackItems.map((item) => item.productId).filter(Boolean))
        ) as string[];
        const [settingsRes, legalRes, productsRes] = await Promise.all([
          supabaseClient
            .from('platform_settings')
            .select('value_numeric')
            .eq('key', 'platform_fee_percent')
            .maybeSingle(),
          orderFull.order.producerProfileId
            ? supabaseClient
                .from('legal_entities')
                .select('producer_delivery_fee')
                .eq('profile_id', orderFull.order.producerProfileId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          productIds.length
            ? supabaseClient.from('products').select('id, platform_fee_percent').in('id', productIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (settingsRes.error) {
          console.error('Platform settings fetch error:', settingsRes.error);
        }
        if (legalRes?.error) {
          console.error('Producer platform fee fetch error:', legalRes.error);
        }
        if (productsRes?.error) {
          console.error('Product platform fee fetch error:', productsRes.error);
        }

        const platformDefaultRaw = Number(settingsRes.data?.value_numeric ?? NaN);
        const platformDefaultPercent = Number.isFinite(platformDefaultRaw) ? platformDefaultRaw : null;
        const producerRaw = Number(legalRes?.data?.producer_delivery_fee ?? NaN);
        const producerPercent = Number.isFinite(producerRaw) ? producerRaw : null;
        const productPercentById = new Map<string, number>();
        ((productsRes?.data as Array<{ id: string; platform_fee_percent?: number | null }> | null) ?? []).forEach(
          (row) => {
            const raw = Number(row.platform_fee_percent ?? NaN);
            if (Number.isFinite(raw)) {
              productPercentById.set(row.id, raw);
            }
          }
        );

        fallbackItems.forEach((item) => {
          const percent =
            platformDefaultPercent ?? producerPercent ?? productPercentById.get(item.productId) ?? 0;
          if (!percent) return;
          const baseTotalCents = (item.unitBasePriceCents ?? 0) * (item.quantityUnits ?? 0);
          if (!Number.isFinite(baseTotalCents) || baseTotalCents <= 0) return;
          fallbackTotal += Math.round(baseTotalCents * (percent / 100));
        });
      }

      if (isActive) {
        setPlatformShareCents(platformFromLots + fallbackTotal);
      }
    };

    computePlatformShare().catch((error) => {
      console.error('Platform fee fetch error:', error);
      if (isActive) setPlatformShareCents(0);
    });

    return () => {
      isActive = false;
    };
  }, [orderFull, supabaseClient]);

  const orderFullValue = orderFull ?? emptyOrderFull;
  const order = orderFullValue.order;
  const orderItems = orderFullValue.items;
  const profiles = orderFullValue.profiles ?? {};
  const resolvedOrderCode = order.orderCode || orderCode || null;
  const products = orderFullValue.productsOffered.map((entry) => {
    const info = entry.product;
    const productKey = info?.code ?? entry.productId;
    const producerProfileId = info?.producerProfileId ?? order.producerProfileId ?? null;
    const producerProfileName = producerProfileId ? profiles[producerProfileId]?.name?.trim() : '';
    const resolvedProducerName = producerProfileName || info?.producerName?.trim() || 'Producteur';
    const measurement: Product['measurement'] =
      info?.measurement ?? (entry.unitLabel === 'kg' ? 'kg' : 'unit');
    const unitLabel = entry.unitLabel ?? info?.packaging ?? '';
    const unitWeightKg = entry.unitWeightKg ?? info?.unitWeightKg ?? null;
    const unitBasePriceCents =
      Number.isFinite(entry.unitBasePriceCents ?? NaN) ? entry.unitBasePriceCents : entry.unitFinalPriceCents;
    return {
      id: productKey,
      productCode: info?.code ?? productKey,
      dbId: entry.productId,
      slug: info?.slug ?? undefined,
      activeLotCode: info?.activeLotCode ?? undefined,
      activeLotId: info?.activeLotId ?? undefined,
      name: info?.name ?? 'Produit',
      description: info?.description ?? '',
      price: centsToEuros(unitBasePriceCents),
      unit: unitLabel,
      quantity: 0,
      category: '',
      imageUrl: info?.imageUrl ?? '',
      producerId: producerProfileId ?? '',
      producerName: resolvedProducerName,
      producerLocation: info?.producerLocation ?? '',
      inStock: true,
      measurement,
      weightKg: unitWeightKg ?? undefined,
    };
  });
const getProfileMeta = React.useCallback(
  (profileId?: string | null) => (profileId ? profiles[profileId] ?? null : null),
  [profiles]
);

const sharerProfileId = order.sharerProfileId;
const sharerProfileMeta = sharerProfileId ? profiles[sharerProfileId] : undefined;

const sharerParticipant = orderFullValue.participants.find((p) => p.role === 'sharer');

const sharerName =
  sharerProfileMeta?.name ??
  sharerParticipant?.profileName ??
  'Partageur';

const sharerProfileHandle =
  sharerProfileMeta?.handle ??
  sharerParticipant?.profileHandle ??
  null;

const sharerAvatarPath =
  sharerProfileMeta?.avatarPath ??
  sharerParticipant?.avatarPath ??
  null;

const sharerAvatarUpdatedAt =
  sharerProfileMeta?.avatarUpdatedAt ??
  sharerParticipant?.avatarUpdatedAt ??
  null;


  const isOwner = Boolean(
    currentUser &&
      (currentUser.id === order.sharerProfileId || currentUser.id === order.createdBy)
  );
  const isProducer = Boolean(
    currentUser &&
      (currentUser.id === order.producerProfileId ||
        currentUser.producerId === order.producerProfileId)
  );
  const canShowPickupCodes = isOwner || isProducer;
  const myParticipant = currentUser
    ? orderFullValue.participants.find((participant) => participant.profileId === currentUser.id)
    : undefined;
  const isVisitor = !isOwner && !isProducer && !myParticipant;
  const participantInvoice = participantInvoices[0] ?? null;
  const producerInvoice = producerInvoices[0] ?? null;
  const participantInvoiceIdsKey = React.useMemo(
    () => participantInvoices.map((invoice) => invoice.id).join(','),
    [participantInvoices]
  );
  const producerInvoiceIdsKey = React.useMemo(
    () => producerInvoices.map((invoice) => invoice.id).join(','),
    [producerInvoices]
  );
  const producerProfileMeta =
    order.producerProfileId && order.producerProfileId !== ''
      ? profiles[order.producerProfileId]
      : undefined;
  const producerName =
    producerProfileMeta?.name ??
    orderFullValue.productsOffered[0]?.product?.producerName ??
    'Producteur';
  const buildProfileHandle = (value?: string | null) =>
    value ? value.toLowerCase().replace(/\s+/g, '') : '';
  const handleAvatarNavigation = (handle?: string | null, fallbackName?: string | null) => {
    const fallback = buildProfileHandle(fallbackName);
    const target = (handle ?? '').trim() || fallback;
    if (!target) return;
    navigate(`/profil/${encodeURIComponent(target)}`);
  };
  const producerProfileHandle = producerProfileMeta?.handle ?? null;
  const producerAvatarPath = producerProfileMeta?.avatarPath ?? null;
  const producerAvatarUpdatedAt = producerProfileMeta?.avatarUpdatedAt ?? null;
  const producerOpeningHoursByDay = React.useMemo(
    () => buildOpeningHoursByDay(producerProfileMeta?.openingHours ?? null),
    [producerProfileMeta?.openingHours]
  );
  const producerOpeningHoursEntries = React.useMemo(() => {
    const entries = Object.entries(producerOpeningHoursByDay)
      .map(([day, hours]) => ({
        day,
        label: labelForDay(day) || day,
        hours,
      }))
      .filter((entry) => entry.hours.trim().length > 0)
      .sort((a, b) => (OPENING_HOURS_DAY_ORDER[a.day] ?? 99) - (OPENING_HOURS_DAY_ORDER[b.day] ?? 99));
    return entries;
  }, [producerOpeningHoursByDay]);
  const producerPickupAddress = React.useMemo(() => {
    const parts = [
      producerProfileMeta?.address,
      producerProfileMeta?.addressDetails,
      [producerProfileMeta?.postcode, producerProfileMeta?.city].filter(Boolean).join(' ') || undefined,
    ]
      .filter(Boolean)
      .join(', ');
    if (parts) return parts;
    return (
      orderFullValue.productsOffered[0]?.product?.producerLocation ||
      producerProfileMeta?.city ||
      'Adresse du producteur à confirmer'
    );
  }, [
    orderFullValue.productsOffered,
    producerProfileMeta?.address,
    producerProfileMeta?.addressDetails,
    producerProfileMeta?.city,
    producerProfileMeta?.postcode,
  ]);
  const producerPickupHoursLabel = React.useMemo(() => {
    if (producerOpeningHoursEntries.length === 0) return 'Horaires a confirmer';
    return producerOpeningHoursEntries.map((entry) => `${entry.label} ${entry.hours}`).join(' / ');
  }, [producerOpeningHoursEntries]);
  const shouldShowProducerPickupDetails = isOwner && order.deliveryOption === 'producer_pickup';
  const updateOrderLocal = (updates: Partial<typeof order>) => {
    setOrderFull((prev) => (prev ? { ...prev, order: { ...prev.order, ...updates } } : prev));
  };

  const handleOpenProduct = React.useCallback(
    (product: Product) => {
      const target = buildProductPath(product, resolvedOrderCode);
      navigate(target);
    },
    [navigate, resolvedOrderCode]
  );
  const handleOpenProducerFromProduct = (product: Product) => {
    const producerMeta = getProfileMeta(product.producerId || order.producerProfileId || null);
    handleAvatarNavigation(
      producerMeta?.handle ?? producerProfileHandle,
      producerMeta?.name ?? product.producerName ?? producerName
    );
  };

  React.useEffect(() => {
    if (!participantsPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setParticipantsPanelOpen(false);
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (participantsPanelRef.current?.contains(target)) return;
      if (participantsButtonRef.current?.contains(target)) return;
      setParticipantsPanelOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [participantsPanelOpen]);

  const totalCards = React.useMemo(
    () => Object.values(quantities).reduce((sum, qty) => sum + qty, 0),
    [quantities]
  );

  const autoApproveParticipationRequests = Boolean(order.autoApproveParticipationRequests);
  const allowSharerMessages = order.allowSharerMessages ?? true;
  const autoApprovePickupSlots = Boolean(order.autoApprovePickupSlots);

  const shouldShowParticipationRequestButton =
    !isOwner && !myParticipant && !autoApproveParticipationRequests;

  const isOrderOpen = order.status === 'open';
  const isAfterLocked = [
    'confirmed',
    'preparing',
    'prepared',
    'delivered',
    'distributed',
    'finished',
  ].includes(order.status);
  const isLockedOrAfter = order.status === 'locked' || isAfterLocked;
  const shouldRestrictAccess = isVisitor && isAfterLocked;

  React.useEffect(() => {
    if (!isProducer || !isLockedOrAfter || !order.id || !order.producerProfileId || !order.sharerProfileId) {
      setProducerStatementSources(null);
      setIsProducerStatementLoading(false);
      return;
    }

    let cancelled = false;
    setIsProducerStatementLoading(true);

    fetchProducerStatementSources({
      orderId: order.id,
      producerProfileId: order.producerProfileId,
      sharerProfileId: order.sharerProfileId,
    })
      .then((data) => {
        if (!cancelled) {
          setProducerStatementSources(data);
        }
      })
      .catch((error) => {
        console.error('Producer statement sources load error:', error);
        if (!cancelled) {
          setProducerStatementSources(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProducerStatementLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLockedOrAfter,
    isProducer,
    order.id,
    order.producerProfileId,
    order.sharerProfileId,
    participantInvoiceIdsKey,
    producerInvoiceIdsKey,
  ]);

  const alreadyOrderedWeight = order.orderedWeightKg ?? 0;
  const productWeightById = React.useMemo(
    () =>
      products.reduce((acc, product) => {
        acc[product.id] = getProductWeightKg(product);
        return acc;
      }, {} as Record<string, number>),
    [products]
  );
  const computeSelectedWeight = React.useCallback(
    (quantitiesMap: Record<string, number>) =>
      Object.entries(quantitiesMap).reduce(
        (sum, [productId, qty]) => sum + (productWeightById[productId] ?? 0) * (Number(qty) || 0),
        0
      ),
    [productWeightById]
  );
  const selectedWeight = React.useMemo(
    () => computeSelectedWeight(quantities),
    [computeSelectedWeight, quantities]
  );
  const totalWeightTowardsGoal = alreadyOrderedWeight + selectedWeight;
  const baselineEffectiveWeightKg = React.useMemo(() => {
    const stored = Number.isFinite(order.effectiveWeightKg ?? NaN) ? order.effectiveWeightKg ?? 0 : 0;
    if (stored > 0) return stored;
    return resolveOrderEffectiveWeightKg(order.orderedWeightKg ?? 0, order.minWeightKg, order.maxWeightKg);
  }, [order.effectiveWeightKg, order.maxWeightKg, order.minWeightKg, order.orderedWeightKg]);
  const maxOrderWeightKg = React.useMemo(
    () => (typeof order.maxWeightKg === 'number' && order.maxWeightKg > 0 ? order.maxWeightKg : null),
    [order.maxWeightKg]
  );
  const clampQuantityForMax = React.useCallback(
    (productId: string, candidateQty: number, quantitiesMap: Record<string, number>) => {
      const currentQty = Number(quantitiesMap[productId] ?? 0);
      const sanitized = Math.max(0, candidateQty);
      if (maxOrderWeightKg === null) return sanitized;
      if (sanitized <= currentQty) return sanitized;
      const productWeight = productWeightById[productId] ?? 0;
      if (productWeight <= 0) return sanitized;
      const totalSelected = computeSelectedWeight(quantitiesMap);
      const otherWeight = totalSelected - productWeight * currentQty;
      const availableForProduct = maxOrderWeightKg - alreadyOrderedWeight - otherWeight;
      if (availableForProduct <= 0) return currentQty;
      const maxQty = availableForProduct / productWeight;
      if (!Number.isFinite(maxQty)) return sanitized;
      const clampedMax = Math.max(0, maxQty);
      if (clampedMax < currentQty) return currentQty;
      return sanitized > clampedMax ? clampedMax : sanitized;
    },
    [alreadyOrderedWeight, computeSelectedWeight, maxOrderWeightKg, productWeightById]
  );
  const pricingWeightKg = React.useMemo(() => {
    const projected = totalWeightTowardsGoal;
    const unclamped = Math.max(baselineEffectiveWeightKg, projected);
    return maxOrderWeightKg ? Math.min(unclamped, maxOrderWeightKg) : unclamped;
  }, [baselineEffectiveWeightKg, maxOrderWeightKg, totalWeightTowardsGoal]);
  const pricingDeliveryFeeCents = React.useMemo(() => {
    const baseFee = Number.isFinite(order.deliveryFeeCents ?? NaN) ? order.deliveryFeeCents : 0;
    const pickupFee = Number.isFinite(order.pickupDeliveryFeeCents ?? NaN) ? order.pickupDeliveryFeeCents : 0;
    return order.deliveryOption === 'producer_pickup' ? pickupFee : baseFee;
  }, [order.deliveryFeeCents, order.deliveryOption, order.pickupDeliveryFeeCents]);
  const unitPriceCentsById = React.useMemo(() => {
    const feePerKg = pricingWeightKg > 0 ? pricingDeliveryFeeCents / pricingWeightKg : 0;
    const shareFraction =
      order.sharerPercentage > 0 && order.sharerPercentage < 100
        ? order.sharerPercentage / (100 - order.sharerPercentage)
        : 0;
    return products.reduce((acc, product) => {
      const unitWeightKg = getProductWeightKg(product);
      const basePriceCents = eurosToCents(product.price);
      const unitDeliveryCents = Math.round(feePerKg * unitWeightKg);
      const basePlusDelivery = basePriceCents + unitDeliveryCents;
      const unitSharerFeeCents = Math.round(basePlusDelivery * shareFraction);
      acc[product.id] = basePlusDelivery + unitSharerFeeCents;
      return acc;
    }, {} as Record<string, number>);
  }, [order.sharerPercentage, pricingDeliveryFeeCents, pricingWeightKg, products]);
  const unitPriceLabelsById = React.useMemo(() => {
    return products.reduce((acc, product) => {
      const unitPriceCents = unitPriceCentsById[product.id];
      if (Number.isFinite(unitPriceCents ?? NaN)) {
        acc[product.id] = formatEurosFromCents(unitPriceCents);
      }
      return acc;
    }, {} as Record<string, string>);
  }, [products, unitPriceCentsById]);
  const totalPriceCents = React.useMemo(
    () =>
      products.reduce((sum, product) => {
        const qty = quantities[product.id] ?? 0;
        const unitPriceCents = unitPriceCentsById[product.id] ?? eurosToCents(product.price);
        return sum + unitPriceCents * qty;
      }, 0),
    [products, quantities, unitPriceCentsById]
  );
  const totalPrice = centsToEuros(totalPriceCents);
  const coopAppliedCents = useCoopBalance ? Math.min(coopBalanceCents, totalPriceCents) : 0;
  const remainingToPayCents = Math.max(0, totalPriceCents - coopAppliedCents);
  const shouldShowCoopToggle = coopBalanceCents > 0 && totalCards > 0;

  const basePercent = order.minWeightKg > 0 ? (alreadyOrderedWeight / order.minWeightKg) * 100 : 0;
  const selectionPercent = order.minWeightKg > 0 ? (selectedWeight / order.minWeightKg) * 100 : 0;
  const progressPercent = basePercent + selectionPercent;
  const cappedBase = Math.min(basePercent, 100);
  const cappedSelection = Math.max(Math.min(basePercent + selectionPercent, 100) - cappedBase, 0);
  const extraPercent = Math.max(0, progressPercent - 100);
  const remainingWeightToMin = Math.max(order.minWeightKg - totalWeightTowardsGoal, 0);
  const remainingWeightToMax =
    maxOrderWeightKg !== null ? Math.max(maxOrderWeightKg - totalWeightTowardsGoal, 0) : null;
  const isAboveMinWeight = order.minWeightKg > 0 && totalWeightTowardsGoal > order.minWeightKg;
  const remainingWeightLabel =
    maxOrderWeightKg !== null && isAboveMinWeight
      ? 'Poids restant avant le seuil maximum'
      : 'Poids restant';
  const remainingWeightDisplay =
    maxOrderWeightKg !== null && isAboveMinWeight && remainingWeightToMax !== null
      ? remainingWeightToMax
      : remainingWeightToMin;
  const isMinimumReached = order.minWeightKg <= 0 || alreadyOrderedWeight >= order.minWeightKg;
  const participantTotalsCents = React.useMemo(
    () =>
      orderFullValue.participants.reduce(
        (sum, participant) => (participant.role === 'participant' ? sum + participant.totalAmountCents : sum),
        0
      ),
    [orderFullValue.participants]
  );
  const participantsTotalAllCents = React.useMemo(
    () => orderFullValue.participants.reduce((sum, participant) => sum + participant.totalAmountCents, 0),
    [orderFullValue.participants]
  );
  const participantWeightKg = React.useMemo(
    () =>
      orderFullValue.participants.reduce(
        (sum, participant) => (participant.role === 'participant' ? sum + participant.totalWeightKg : sum),
        0
      ),
    [orderFullValue.participants]
  );
  const sharerProductsCents = sharerParticipant?.totalAmountCents ?? 0;
  const sharerPercentage = Math.max(order.sharerPercentage ?? 0, 0);
  const sharerShareFromItemsCents = React.useMemo(() => {
    if (!orderItems.length) return 0;
    const sharerId = sharerParticipant?.id ?? null;
    return orderItems.reduce((sum, item) => {
      if (sharerId && item.participantId === sharerId) return sum;
      const qty = Number(item.quantityUnits ?? 0);
      const unitSharerFee = Number(item.unitSharerFeeCents ?? 0);
      return sum + unitSharerFee * qty;
    }, 0);
  }, [orderItems, sharerParticipant?.id]);
  const sharerShareCents = React.useMemo(() => {
    const storedShare = Math.max(0, Number.isFinite(order.sharerShareCents ?? NaN) ? order.sharerShareCents : 0);
    const percentShare = Math.max(0, Math.round(participantTotalsCents * (sharerPercentage / 100)));
    const computedShare = sharerShareFromItemsCents > 0 ? sharerShareFromItemsCents : percentShare;
    if (isLockedOrAfter && storedShare > 0) return storedShare;
    return storedShare > 0 ? storedShare : computedShare;
  }, [
    isLockedOrAfter,
    order.sharerShareCents,
    participantTotalsCents,
    sharerPercentage,
    sharerShareFromItemsCents,
  ]);
  const pickupFeeCents = Math.max(
    0,
    Number.isFinite(order.pickupDeliveryFeeCents ?? NaN) ? order.pickupDeliveryFeeCents : 0
  );
  const adjustedSharerShareCents =
    order.deliveryOption === 'producer_pickup' ? sharerShareCents + pickupFeeCents : sharerShareCents;
  const sharerDeficitCents = Math.max(0, sharerProductsCents - adjustedSharerShareCents);
  const sharerGainCents = Math.max(0, adjustedSharerShareCents - sharerProductsCents);
  const paidPayments = React.useMemo(
    () => orderFullValue.payments.filter((payment) => PAID_PAYMENT_STATUSES.has(payment.status)),
    [orderFullValue.payments]
  );
  const paidTotalCents = React.useMemo(
    () => paidPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
    [paidPayments]
  );
  const paidPaymentCount = paidPayments.length;
  const paymentFeeTotals = React.useMemo(() => {
    return paidPayments.reduce(
      (acc, payment) => {
        const fallbackFeeHt = Math.round(payment.amountCents * 0.007 + 15);
        const feeHt = Number.isFinite(payment.feeCents ?? NaN) ? payment.feeCents : fallbackFeeHt;
        const feeVat = Number.isFinite(payment.feeVatCents ?? NaN) ? payment.feeVatCents : Math.round(feeHt * 0.2);
        const feeTtc = feeHt + feeVat;
        return {
          feeHt: acc.feeHt + feeHt,
          feeVat: acc.feeVat + feeVat,
          feeTtc: acc.feeTtc + feeTtc,
        };
      },
      { feeHt: 0, feeVat: 0, feeTtc: 0 }
    );
  }, [paidPayments]);
  const paymentFeeCents = paymentFeeTotals.feeTtc;
  const paymentFeeVatCents = paymentFeeTotals.feeVat;
  const paymentFeeHtCents = paymentFeeTotals.feeHt;
  const baseDeliveryFeeCents = Math.max(0, Number.isFinite(order.deliveryFeeCents ?? NaN) ? order.deliveryFeeCents : 0);
  const deliveryFeeToProducerCents = order.deliveryOption === 'producer_delivery' ? baseDeliveryFeeCents : 0;
  const deliveryFeeToPlatformCents = order.deliveryOption === 'chronofresh' ? baseDeliveryFeeCents : 0;
  const deliveryFeeToSharerCents = order.deliveryOption === 'producer_pickup' ? pickupFeeCents : 0;
  const sharerShareProductsCents = Math.max(0, Math.min(adjustedSharerShareCents, sharerProductsCents));
  const platformShareWithFeesCents = platformShareCents + paymentFeeCents + deliveryFeeToPlatformCents;
  const remainingToCollectCents = Math.max(0, participantTotalsCents - paidTotalCents);
  const paymentsReceivedCents = participantsTotalAllCents;
  const sharerWeightKg = sharerParticipant?.totalWeightKg ?? 0;
  const maxWeightKg = typeof order.maxWeightKg === 'number' ? order.maxWeightKg : null;
  const estimatedParticipantValuePerKg =
    participantWeightKg > 0 ? participantTotalsCents / participantWeightKg : 0;
  const maxParticipantWeightKg =
    maxWeightKg !== null ? Math.max(maxWeightKg - sharerWeightKg, participantWeightKg, 0) : participantWeightKg;
  const maxParticipantTotalsCents = Math.round(maxParticipantWeightKg * estimatedParticipantValuePerKg);
  const maxSharerShareCents = Math.round(maxParticipantTotalsCents * (sharerPercentage / 100));
  const maxSharerShareWithPickupCents =
    order.deliveryOption === 'producer_pickup' ? maxSharerShareCents + pickupFeeCents : maxSharerShareCents;
  const canReachFullCoverage =
    sharerDeficitCents > 0 && maxWeightKg !== null && maxSharerShareWithPickupCents >= sharerProductsCents;

  const baseSegmentStyle: React.CSSProperties = {
    width: `${cappedBase}%`,
    boxShadow: '0 6px 16px -8px rgba(34,197,94,0.4)',
    background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
    backgroundColor: '#22c55e',
  };

  const selectionSegmentStyle: React.CSSProperties = {
    width: `${cappedSelection}%`,
    left: `${cappedBase}%`,
    boxShadow: '0 6px 16px -8px rgba(250,204,21,0.6)',
    background: 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)',
    backgroundColor: '#facc15',
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    if (!isOrderOpen) return;
    setQuantities((prev) => {
      const current = prev[productId] ?? 0;
      const candidate = current + delta;
      const next = clampQuantityForMax(productId, candidate, prev);
      if (next === current) return prev;
      return { ...prev, [productId]: next };
    });
  };

  const handleVisibilityToggle = () => {
    if (!isOwner) return;
    const next = order.visibility === 'public' ? 'private' : 'public';
    setIsWorking(true);
    updateOrderVisibility(order.id, next)
      .then(() => {
        updateOrderLocal({ visibility: next });
        toast.success(`Commande rendue ${next === 'public' ? 'publique' : 'privee'}`);
        if (next === 'public' && participantsVisibility.profile) {
          const nextVisibility = { ...participantsVisibility, profile: false };
          setParticipantsVisibility(nextVisibility);
          updateOrderLocal({ participantsVisibility: nextVisibility });
          updateParticipantsVisibility(order.id, nextVisibility).catch((error) => {
            console.error('Participants visibility error:', error);
            toast.error('Impossible de mettre a jour la visibilite.');
          });
        }
      })
      .catch((error) => {
        console.error('Visibility update error:', error);
        toast.error('Impossible de changer la visibilite.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAutoApproveParticipationRequests = (value: boolean) => {
    if (!isOwner || value === autoApproveParticipationRequests) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { autoApproveParticipationRequests: value })
      .then(() => {
        updateOrderLocal({ autoApproveParticipationRequests: value });
        toast.success(
          value
            ? 'Les demandes seront validées automatiquement.'
            : 'Les demandes nécessitent desormais une validation manuelle.'
        );
      })
      .catch((error) => {
        console.error('Participation settings error:', error);
        toast.error('Impossible de mettre à jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAllowSharerMessages = (value: boolean) => {
    if (!isOwner || value === allowSharerMessages) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { allowSharerMessages: value })
      .then(() => {
        updateOrderLocal({ allowSharerMessages: value });
        toast.success(
          value
            ? 'Les participants potentiels peuvent vous ecrire a nouveau.'
            : 'Les messages des participants potentiels ont ete desactives.'
        );
      })
      .catch((error) => {
        console.error('Sharer messages error:', error);
        toast.error('Impossible de mettre a jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAutoApprovePickupSlots = (value: boolean) => {
    if (!isOwner || value === autoApprovePickupSlots) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { autoApprovePickupSlots: value })
      .then(() => {
        updateOrderLocal({ autoApprovePickupSlots: value });
        toast.success(
          value
            ? 'Les demandes de rendez-vous seront validees automatiquement.'
            : 'Les demandes de rendez-vous devront etre validees manuellement.'
        );
      })
      .catch((error) => {
        console.error('Pickup slot settings error:', error);
        toast.error('Impossible de mettre a jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const handleCloseOrder = () => {
    if (!isOwner || isWorking || order.status === 'locked') return;
    navigate(`/cmd/${order.orderCode ?? order.id}/close`);
  };

  const handleStatusUpdate = (nextStatus: OrderStatus, successMessage: string) => {
    if (isWorking) return;
    setIsWorking(true);
    updateOrderStatus(order.id, nextStatus)
      .then(async (updatedStatus) => {
        updateOrderLocal({ status: updatedStatus });
        if (nextStatus === 'distributed') {
          try {
            await createPlatformInvoiceAndSendForOrder(order.id);
            await loadInvoices(order.id, order.producerProfileId);
          } catch (error) {
            console.error('Platform invoice error:', error);
            toast.error("Impossible d'emettre la facture plateforme.");
          }
        }
        toast.success(successMessage);
      })
      .catch((error) => {
        console.error('Order status update error:', error);
        toast.error('Impossible de mettre a jour le statut de la commande.');
      })
      .finally(() => setIsWorking(false));
  };

  const statusActions = React.useMemo(() => {
    const actions: Array<{
      id: string;
      label: string;
      nextStatus: OrderStatus;
      successMessage: string;
    }> = [];
    if (isProducer) {
      if (order.status === 'locked') {
        actions.push({
          id: 'producer-confirmed',
          label: 'Confirmer la commande',
          nextStatus: 'confirmed',
          successMessage: 'Commande confirmée.',
        });
      } else if (order.status === 'confirmed') {
        actions.push({
          id: 'producer-preparing',
          label: 'Démarrer la préparation',
          nextStatus: 'preparing',
          successMessage: 'Préparation démarrée.',
        });
      } else if (order.status === 'preparing') {
        actions.push({
          id: 'producer-prepared',
          label: 'Marquer comme préparée',
          nextStatus: 'prepared',
          successMessage: 'Commande marquée comme préparée.',
        });
      }
    }
    if (isOwner) {
      if (order.status === 'prepared') {
        actions.push({
          id: 'owner-delivered',
          label: 'Marquer comme livrée (réceptionnée)',
          nextStatus: 'delivered',
          successMessage: 'Commande livrée et réceptionnée.',
        });
      } else if (order.status === 'delivered') {
        actions.push({
          id: 'owner-distributed',
          label: 'Marquer comme distribuée',
          nextStatus: 'distributed',
          successMessage: 'Commande marquée comme distribuée.',
        });
      } else if (order.status === 'distributed') {
        actions.push({
          id: 'owner-finished',
          label: 'Terminer la commande',
          nextStatus: 'finished',
          successMessage: 'Commande terminée.',
        });
      }
    }
    return actions;
  }, [isOwner, isProducer, order.status]);

  const handlePurchase = async () => {
    if (!isOrderOpen) {
      toast.info("La commande n'est pas ouverte.");
      return;
    }
    if (totalCards === 0) {
      toast.info('Ajoutez au moins une carte avant de valider.');
      return;
    }
    if (remainingToPayCents > 0 && onStartPayment) {
      onStartPayment({
        quantities: { ...quantities },
        total: centsToEuros(remainingToPayCents),
        weight: selectedWeight,
        useCoopBalance,
      });
      return;
    }
    if (!isAuthenticated || !currentUser) {
      toast.info('Connectez-vous pour participer.');
      return;
    }

    setIsWorking(true);
    let createdPaymentId: string | null = null;
    let participantCreatedInFlow = false;
    let participantIdForRollback: string | null = null;
    const createdOrderItems: Array<{ id: string }> = [];
    try {
      let participant = myParticipant;
      if (!participant) {
        if (!autoApproveParticipationRequests) {
          toast.info('Votre participation doit etre acceptee avant de payer.');
          return;
        }
        const createdParticipant = await requestParticipation(order.orderCode, currentUser.id);
        participantCreatedInFlow = true;
        const enrichedParticipant = {
          ...createdParticipant,
          profileName: currentUser.name ?? null,
          profileHandle: currentUser.handle ?? null,
        };
        participant = enrichedParticipant;
        setOrderFull((prev) => {
          if (!prev) return prev;
          const others = prev.participants.filter((p) => p.profileId !== currentUser.id);
          return { ...prev, participants: [...others, enrichedParticipant] };
        });
      }

      if (!participant) {
        toast.info('Votre participation doit etre acceptee avant de payer.');
        return;
      }

      if (participant.participationStatus !== 'accepted') {
        toast.info('Votre participation doit etre acceptee avant de payer.');
        return;
      }
      participantIdForRollback = participant.id;

      for (const product of products) {
        const qty = quantities[product.id] ?? 0;
        if (qty <= 0 || !product.dbId) continue;
        const item = await addItem({
          orderId: order.id,
          participantId: participant.id,
          productId: product.dbId,
          lotId: product.activeLotId ?? null,
          quantityUnits: qty,
        });
        createdOrderItems.push({ id: item.id });
      }

      const withItems = await getOrderFullByCode(order.orderCode);
      const participantItems = withItems.items.filter((item) => item.participantId === participant.id);
      for (const item of participantItems) {
        await updateOrderItemQuantity(item.id, order.id, participant.id, item.quantityUnits);
      }

      const refreshed = await getOrderFullByCode(order.orderCode);
      setOrderFull(refreshed);
      const refreshedParticipant = refreshed.participants.find((p) => p.id === participant.id);
      if (refreshedParticipant) {
        const refreshedPaidCents = sumPaidCentsForParticipant(refreshed.payments, refreshedParticipant.id);
        const coopToConsumeCents =
          useCoopBalance && coopBalanceCents > 0
            ? Math.min(coopBalanceCents, refreshedParticipant.totalAmountCents)
            : 0;
        const amountCentsToPay = Math.max(
          0,
          refreshedParticipant.totalAmountCents - refreshedPaidCents - coopToConsumeCents
        );
        if (amountCentsToPay > 0) {
          const payment = await createPaymentStub({
            orderId: order.id,
            participantId: refreshedParticipant.id,
            amountCents: amountCentsToPay,
            raw: {
              flow_kind: 'participant',
              use_coop_balance: Boolean(useCoopBalance),
            },
          });
          createdPaymentId = payment.id;
          await finalizePaymentSimulation(payment.id);
        } else if (coopToConsumeCents > 0 && currentUser?.id) {
          await issueParticipantInvoiceWithCoop({
            orderId: order.id,
            profileId: currentUser.id,
            coopAppliedCents: coopToConsumeCents,
          });
          const updatedBalance = await fetchCoopBalance(currentUser.id);
          setCoopBalanceCents(updatedBalance);
        }
        const updated = await getOrderFullByCode(order.orderCode);
        setOrderFull(updated);
        await loadInvoices(updated.order.id, updated.order.producerProfileId);
      }
      toast.success('Paiement initie (stub).');
    } catch (error) {
      if (createdPaymentId) {
        try {
          await updatePaymentStatus(createdPaymentId, 'failed');
        } catch (markFailedError) {
          console.error('Purchase mark failed error:', markFailedError);
        }
      }

      if (!createdPaymentId && createdOrderItems.length > 0 && participantIdForRollback) {
        for (const created of createdOrderItems.slice().reverse()) {
          try {
            await removeItem(created.id, order.id, participantIdForRollback);
          } catch (rollbackItemError) {
            console.error('Purchase rollback item error:', rollbackItemError);
          }
        }
      }

      if (!createdPaymentId && participantCreatedInFlow && participantIdForRollback && currentUser?.id) {
        try {
          await deleteParticipantIfNoActivity({
            orderId: order.id,
            participantId: participantIdForRollback,
            profileId: currentUser.id,
          });
        } catch (rollbackParticipantError) {
          console.error('Purchase rollback participant error:', rollbackParticipantError);
        }
      }
      console.error('Purchase error:', error);
      toast.error('Impossible de finaliser la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRequestParticipation = async () => {
    if (!currentUser) return;
    setIsWorking(true);
    try {
      await requestParticipation(order.orderCode, currentUser.id);
      await loadOrder();
      toast.success('Demande de participation envoyee.');
    } catch (error) {
      console.error('Participation request error:', error);
      toast.error('Impossible de demander la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleApproveParticipant = async (participantId: string) => {
    setIsWorking(true);
    try {
      const updatedParticipant = await approveParticipation(participantId);
      setOrderFull((prev) => {
        if (!prev) return prev;
        const participants = prev.participants.map((participant) =>
          participant.id === updatedParticipant.id ? { ...participant, ...updatedParticipant } : participant
        );
        return { ...prev, participants };
      });
      toast.success('Participation acceptee.');
    } catch (error) {
      console.error('Approve participant error:', error);
      toast.error('Impossible de valider la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRejectParticipant = async (participantId: string) => {
    setIsWorking(true);
    try {
      await rejectParticipation(participantId);
      await loadOrder();
      toast.success('Participation refusee.');
    } catch (error) {
      console.error('Reject participant error:', error);
      toast.error('Impossible de refuser la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handlePickupSlotSelect = async (slotId: string, pickupSlotTime?: string | null) => {
    if (!myParticipant) return;
    if (!canSelectPickupSlot) {
      toast.info('Seuls les participants acceptés peuvent réserver un créneau.');
      return;
    }
    if (isSelectedDatePast) {
      toast.info("Impossible de réserver un créneau dans le passé.");
      return;
    }
    if (pickupSlotTime) {
      const selectedMinutes = parseTimeToMinutes(pickupSlotTime);
      if (
        typeof minSelectableMinutes === 'number' &&
        selectedMinutes !== null &&
        selectedMinutes < minSelectableMinutes
      ) {
        toast.info('Choisissez une heure au moins 30 minutes après maintenant.');
        return;
      }
    }
    setIsWorking(true);
    try {
      if (myParticipant.pickupSlotId && myParticipant.pickupSlotId !== slotId) {
        setPickupSlotTimesById((prev) => {
          const next = { ...prev };
          delete next[myParticipant.pickupSlotId as string];
          return next;
        });
      }
      await setParticipantPickupSlot({
        orderId: order.id,
        participantId: myParticipant.id,
        pickupSlotId: slotId,
        pickupSlotTime: pickupSlotTime ?? null,
      });
      await loadOrder();
      toast.success('Creneau enregistre.');
    } catch (error) {
      console.error('Pickup slot error:', error);
      toast.error('Impossible de selectionner ce creneau.');
    } finally {
      setIsWorking(false);
    }
  };

  const handlePickupSlotReview = async (participantId: string, status: Exclude<PickupSlotStatus, 'requested'>) => {
    if (!isOwner || autoApprovePickupSlots) return;
    setIsWorking(true);
    try {
      await reviewParticipantPickupSlot({
        participantId,
        status,
        reviewerId: currentUser?.id ?? null,
      });
      await loadOrder();
      toast.success(status === 'accepted' ? 'Créneau validé.' : 'Créneau refusé.');
    } catch (error) {
      console.error('Pickup slot review error:', error);
      toast.error("Impossible de mettre à jour ce créneau.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleInvoiceDownload = async (invoice: Facture) => {
    try {
      let invoiceToDownload = invoice;

      if (!invoiceToDownload.pdfPath) {
        const refreshed =
          invoice.serie === 'PLAT_PROD' && invoice.producerProfileId
            ? await fetchProducerInvoices(order.id, invoice.producerProfileId)
            : await fetchParticipantInvoices(order.id, invoice.clientProfileId ?? currentUser?.id ?? '');

        if (invoice.serie === 'PLAT_PROD') {
          setProducerInvoices(refreshed);
        } else if ((invoice.clientProfileId ?? null) === (currentUser?.id ?? null)) {
          setParticipantInvoices(refreshed);
        }

        invoiceToDownload = refreshed.find((item) => item.id === invoice.id) ?? refreshed[0] ?? invoice;
      }

      const url = await getInvoiceDownloadUrl(invoiceToDownload);
      if (!url) {
        toast.info('PDF en cours de génération.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Invoice download error:', error);
      toast.error('Impossible de télécharger la facture.');
    }
  };

  const handleParticipantInvoiceDownload = async (participant: OrderParticipant) => {
    if (!participant.profileId) {
      toast.info('Facture indisponible pour ce participant.');
      return;
    }
    setIsInvoiceLoading(true);
    try {
      const invoices = await fetchParticipantInvoices(order.id, participant.profileId);
      const invoice = invoices[0];
      if (!invoice) {
        toast.info('Aucune facture disponible pour ce participant.');
        return;
      }
      await handleInvoiceDownload(invoice);
    } catch (error) {
      console.error('Participant invoice error:', error);
      toast.error('Impossible de charger la facture du participant.');
    } finally {
      setIsInvoiceLoading(false);
    }
  };

  const canViewFullAddress = isOwner || isProducer || Boolean(myParticipant);
  const pickupCityLine = [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ').trim();
  const deliveryCityLine = [order.deliveryPostcode, order.deliveryCity].filter(Boolean).join(' ').trim();
  const visitorSlotCityLabel = order.deliveryOption === 'producer_pickup' ? pickupCityLine : deliveryCityLine;
  const cityFallbackLabel = 'Ville communiquée ultérieurement';

  const pickupAddressFull =
    order.pickupAddress ||
    [order.pickupStreet, [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
    'Lieu précis communiqué après paiement';

  const deliveryAddressFull =
    [order.deliveryStreet, [order.deliveryPostcode, order.deliveryCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    order.deliveryAddress ||
    'Adresse non renseignée';
  const pickupAddress = canViewFullAddress ? pickupAddressFull : pickupCityLine || cityFallbackLabel;
  const deliveryAddress = canViewFullAddress ? deliveryAddressFull : deliveryCityLine || cityFallbackLabel;
  const deliveryInfo = order.deliveryInfo?.trim() || '';
  const deliveryPhone = order.deliveryPhone?.trim() || '';
  const deliveryEmail = order.deliveryEmail?.trim() || '';
  const pickupInfo = order.pickupInfo?.trim() || '';
  const deliveryModeLabel = ORDER_DELIVERY_OPTION_LABELS[order.deliveryOption] ?? 'Livraison';
  const locationAddress = order.deliveryOption === 'producer_pickup' ? pickupAddress : deliveryAddress;

  const estimatedDeliveryDate =
    order.estimatedDeliveryDate instanceof Date
      ? order.estimatedDeliveryDate
      : order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate)
        : null;
  const deliveryDateLabel =
    estimatedDeliveryDate && !Number.isNaN(estimatedDeliveryDate.getTime())
      ? estimatedDeliveryDate.toLocaleDateString('fr-FR')
      : null;
  const pickupSlots = React.useMemo(
    () =>
      orderFullValue.pickupSlots.map((slot) => {
        const label = formatPickupSlotLabel({
          day: slot.day,
          date: slot.slotDate,
          label: slot.label,
        });
        const start = formatPickupSlotTime(slot.startTime);
        const end = formatPickupSlotTime(slot.endTime);
        const timeLabel = start || end ? `${start || '??'} - ${end || '??'}` : 'Horaire a definir';
        const slotDate = parseDateValue(slot.slotDate);
        const dateKey = slotDate ? toDateKey(slotDate) : null;
        return {
          id: slot.id,
          label,
          timeLabel,
          enabled: slot.enabled,
          dateKey,
          sortOrder: slot.sortOrder ?? 0,
          start,
          end,
        };
      }),
    [orderFullValue.pickupSlots]
  );
  const hasPickupSlots = pickupSlots.length > 0;
  const pickupSlotsByDate = React.useMemo(() => {
    const map = new Map<string, (typeof pickupSlots)[number][]>();
    pickupSlots.forEach((slot) => {
      if (!slot.dateKey) return;
      const list = map.get(slot.dateKey) ?? [];
      list.push(slot);
      map.set(slot.dateKey, list);
    });
    return map;
  }, [pickupSlots]);
  const pickupSlotDateKeys = React.useMemo(() => {
    const keys = Array.from(pickupSlotsByDate.keys());
    keys.sort();
    return keys;
  }, [pickupSlotsByDate]);
  const pickupWindowWeeks =
    typeof order.pickupWindowWeeks === 'number' && order.pickupWindowWeeks > 0
      ? order.pickupWindowWeeks
      : null;
  const pickupWindowEndDate =
    estimatedDeliveryDate && pickupWindowWeeks
      ? (() => {
          const end = new Date(
            estimatedDeliveryDate.getFullYear(),
            estimatedDeliveryDate.getMonth(),
            estimatedDeliveryDate.getDate()
          );
          end.setDate(end.getDate() + pickupWindowWeeks * 7);
          return end;
        })()
      : null;
  const pickupDurationLabel = pickupWindowWeeks
    ? `${pickupWindowWeeks} semaine${pickupWindowWeeks > 1 ? 's' : ''}`
    : null;
  const pickupWindowLabel =
    pickupDurationLabel && pickupWindowEndDate
      ? `${pickupDurationLabel} (jusqu'au ${pickupWindowEndDate.toLocaleDateString('fr-FR')})`
      : pickupDurationLabel;
  const isPickupSelectionOpen = ['delivered', 'distributed', 'finished'].includes(order.status);
  const isAcceptedParticipant = Boolean(
    myParticipant && myParticipant.participationStatus === 'accepted' && myParticipant.role === 'participant'
  );
  const canSelectPickupSlot = isPickupSelectionOpen && isAcceptedParticipant;
  const shouldHidePickupSlots = !isAuthenticated;
  const canShowPickupSlotDetails = pickupSlotsByDate.size > 0 && !shouldHidePickupSlots;
  const createdAtDay = parseDateValue(order.createdAt);
  const deadlineDay = parseDateValue(order.deadline);
  const estimatedDeliveryDay = parseDateValue(estimatedDeliveryDate ?? null);
  const pickupStartDay = estimatedDeliveryDay ? addDays(estimatedDeliveryDay, 1) : null;
  const pickupWindowEndDay = parseDateValue(pickupWindowEndDate ?? null);
  const explicitPickupDay = order.usePickupDate ? parseDateValue(order.pickupDate ?? null) : null;
  const pickupRetrievalDate = explicitPickupDay ?? estimatedDeliveryDate;
  const pickupRetrievalDateLabel =
    pickupRetrievalDate && !Number.isNaN(pickupRetrievalDate.getTime())
      ? pickupRetrievalDate.toLocaleDateString('fr-FR')
      : null;
  const slotRangeStart = pickupSlotDateKeys.length ? parseDateValue(pickupSlotDateKeys[0]) : null;
  const slotRangeEnd = pickupSlotDateKeys.length
    ? parseDateValue(pickupSlotDateKeys[pickupSlotDateKeys.length - 1])
    : null;
  const openRange = toRange(createdAtDay, deadlineDay);
  const deliveryRange = toRange(deadlineDay, estimatedDeliveryDay);
  const availabilityStart = pickupStartDay ?? slotRangeStart;
  const availabilityRange = explicitPickupDay
    ? { start: explicitPickupDay, end: explicitPickupDay }
    : toRange(availabilityStart, pickupWindowEndDay ?? slotRangeEnd);
  const calendarMonthViews = React.useMemo(() => {
    const calendarDates = [
      openRange?.start,
      openRange?.end,
      deliveryRange?.start,
      deliveryRange?.end,
      availabilityRange?.start,
      availabilityRange?.end,
      slotRangeStart,
      slotRangeEnd,
    ].filter((value): value is Date => Boolean(value));

    const firstDate = calendarDates.length
      ? calendarDates.reduce((min, current) => (current.getTime() < min.getTime() ? current : min), calendarDates[0])
      : new Date();
    const lastDate = calendarDates.length
      ? calendarDates.reduce((max, current) => (current.getTime() > max.getTime() ? current : max), calendarDates[0])
      : firstDate;
    const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const lastMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
    const months =
      firstMonth.getFullYear() === lastMonth.getFullYear() && firstMonth.getMonth() === lastMonth.getMonth()
        ? [firstMonth]
        : [firstMonth, lastMonth];

    return months.map((month) => ({
      key: `${month.getFullYear()}-${month.getMonth() + 1}`,
      monthLabel: month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      days: buildCalendarDays(month),
    }));
  }, [availabilityRange, deliveryRange, openRange, slotRangeEnd, slotRangeStart]);
  const calendarPeriodLabel = React.useMemo(() => {
    if (calendarMonthViews.length === 0) return '';
    if (calendarMonthViews.length === 1) return calendarMonthViews[0].monthLabel;
    return `${calendarMonthViews[0].monthLabel} - ${calendarMonthViews[1].monthLabel}`;
  }, [calendarMonthViews]);
  const [selectedPickupDateKey, setSelectedPickupDateKey] = React.useState<string | null>(null);
  const [pickupSlotTimesById, setPickupSlotTimesById] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!order.id) return;
    setSelectedPickupDateKey(null);
    setPickupSlotTimesById({});
  }, [order.id]);
  const myParticipantPickupTime = React.useMemo(
    () => formatPickupSlotTime(myParticipant?.pickupSlotTime ?? null),
    [myParticipant?.pickupSlotTime]
  );
  React.useEffect(() => {
    const slotId = myParticipant?.pickupSlotId ?? null;
    if (!slotId) return;
    setPickupSlotTimesById((prev) => {
      const next = { ...prev };
      if (myParticipantPickupTime) {
        next[slotId] = myParticipantPickupTime;
      } else {
        delete next[slotId];
      }
      return next;
    });
  }, [myParticipant?.pickupSlotId, myParticipantPickupTime]);
  const now = new Date();
  const todayKey = toDateKey(now);
  const selectedPickupDate = selectedPickupDateKey ? parseDateValue(selectedPickupDateKey) : null;
  const selectedDateSlots = selectedPickupDateKey ? pickupSlotsByDate.get(selectedPickupDateKey) ?? [] : [];
  const selectedDateLabel = selectedPickupDate
    ? selectedPickupDate.toLocaleDateString('fr-FR')
    : selectedPickupDateKey;
  const myPickupSlotDateKey = React.useMemo(() => {
    if (!myParticipant || myParticipant.role !== 'participant' || !myParticipant.pickupSlotId) return null;
    const slot = pickupSlots.find((entry) => entry.id === myParticipant.pickupSlotId);
    return slot?.dateKey ?? null;
  }, [myParticipant, pickupSlots]);
  const myPickupSlotStatus = myParticipant?.pickupSlotStatus ?? null;
  const isSelectedDateToday = Boolean(selectedPickupDateKey && selectedPickupDateKey === todayKey);
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isSelectedDatePast = Boolean(
    selectedPickupDate && selectedPickupDate.getTime() < todayDate.getTime()
  );
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minSelectableMinutes = isSelectedDateToday ? nowMinutes + 30 : null;
  const canSelectPickupSlotOnSelectedDate = canSelectPickupSlot && !isSelectedDatePast;
  const selectedDateSlotsSorted = React.useMemo(() => {
    if (selectedDateSlots.length === 0) return [];
    return [...selectedDateSlots].sort((a, b) => {
      const order = a.sortOrder - b.sortOrder;
      if (order !== 0) return order;
      return (a.start ?? '').localeCompare(b.start ?? '');
    });
  }, [selectedDateSlots]);
  const minSelectableTimeLabel =
    minSelectableMinutes !== null
      ? formatMinutesToTime(ceilToStep(minSelectableMinutes, PICKUP_SLOT_TIME_STEP_MINUTES))
      : null;
  const pickupSlotHeaderStatus = React.useMemo(() => {
    if (!isAcceptedParticipant) return null;
    if (!isPickupSelectionOpen) return 'Sélection possible après livraison';
    if (isSelectedDatePast) return "Impossible de réserver dans le passé";
    return null;
  }, [isAcceptedParticipant, isPickupSelectionOpen, isSelectedDatePast]);
  const pickupSlotStatusLabel = formatPickupSlotStatusLabel(myParticipant?.pickupSlotStatus ?? null);
  const pickupSlotReservations = React.useMemo(() => {
    if (!isOwner) return new Map<string, PickupSlotReservation[]>();
    const map = new Map<string, PickupSlotReservation[]>();
    orderFullValue.participants.forEach((participant) => {
      if (participant.role !== 'participant') return;
      if (!participant.pickupSlotId) return;
      const meta = getProfileMeta(participant.profileId);
      const baseName = participant.profileName ?? meta?.name ?? 'Participant';
      const name = baseName;
      const entry: PickupSlotReservation = {
        id: participant.id,
        name,
        status: participant.pickupSlotStatus ?? null,
        time: formatPickupSlotTime(participant.pickupSlotTime) ?? null,
      };
      const list = map.get(participant.pickupSlotId) ?? [];
      list.push(entry);
      map.set(participant.pickupSlotId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [getProfileMeta, isOwner, orderFullValue.participants]);

  const pickupSlotReservationCountsByDate = React.useMemo(() => {
    if (!isOwner) return new Map<string, number>();
    const map = new Map<string, number>();
    pickupSlots.forEach((slot) => {
      if (!slot.dateKey) return;
      const reservations = pickupSlotReservations.get(slot.id) ?? [];
      const count = reservations.filter((reservation) => reservation.status !== 'rejected').length;
      if (!count) return;
      map.set(slot.dateKey, (map.get(slot.dateKey) ?? 0) + count);
    });
    return map;
  }, [isOwner, pickupSlots, pickupSlotReservations]);

  const selectedDateReservationCount = React.useMemo(() => {
    if (!isOwner || selectedDateSlotsSorted.length === 0) return 0;
    return selectedDateSlotsSorted.reduce(
      (sum, slot) =>
        sum +
        (pickupSlotReservations.get(slot.id) ?? []).filter((reservation) => reservation.status !== 'rejected').length,
      0
    );
  }, [isOwner, pickupSlotReservations, selectedDateSlotsSorted]);
  const deliveryDetailLines = React.useMemo(() => {
    if (!canViewFullAddress) {
      const lines: string[] = [];
      if (order.deliveryOption === 'producer_pickup') {
        const cityLine = pickupCityLine || deliveryCityLine;
        if (cityLine) lines.push(`Ville de retrait : ${cityLine}`);
      } else {
        if (deliveryCityLine) lines.push(`Ville de livraison : ${deliveryCityLine}`);
        if (deliveryDateLabel) lines.push(`Livraison : ${deliveryDateLabel}`);
      }
      return lines;
    }
    const lines = [`Adresse de livraison : ${deliveryAddress}`];
    if (deliveryInfo) lines.push(`Infos livraison : ${deliveryInfo}`);
    if (order.deliveryOption === 'producer_delivery') {
      if (deliveryPhone) lines.push(`Telephone livraison : ${deliveryPhone}`);
      if (deliveryEmail) lines.push(`Email livraison : ${deliveryEmail}`);
    }
    if (order.deliveryOption === 'producer_pickup') {
      if (pickupAddress) lines.push(`Adresse de retrait : ${pickupAddress}`);
      if (pickupInfo) lines.push(`Infos retrait : ${pickupInfo}`);
    } else if (deliveryDateLabel) {
      lines.push(`Livraison : ${deliveryDateLabel}`);
    }
    return lines;
  }, [
    canViewFullAddress,
    deliveryAddress,
    deliveryCityLine,
    deliveryDateLabel,
    deliveryInfo,
    deliveryPhone,
    deliveryEmail,
    order.deliveryOption,
    pickupAddress,
    pickupCityLine,
    pickupInfo,
    pickupWindowLabel,
  ]);
  const producerContactLines = React.useMemo(() => {
    const lines: string[] = [];
    if (producerProfileMeta?.contactEmailPublic) {
      lines.push(`Email : ${producerProfileMeta.contactEmailPublic}`);
    }
    if (producerProfileMeta?.phonePublic) {
      lines.push(`Téléphone : ${producerProfileMeta.phonePublic}`);
    }
    if (!lines.length) {
      lines.push('Coordonnées du producteur : non renseignées');
    }
    return lines;
  }, [producerProfileMeta?.contactEmailPublic, producerProfileMeta?.phonePublic]);
  const producerStatementData = React.useMemo(() => {
    const totalOrderedCents = paymentsReceivedCents;
    const platformCommissionFromSource = producerStatementSources?.platformCommissionCents;
    const sharerDiscountFromSource = producerStatementSources?.sharerDiscountCents;
    const coopSurplusFromSource = producerStatementSources?.coopSurplusCents;
    const participantGainsFromSource = producerStatementSources?.participantGainsCents;
    const participantCoopUsedFromSource = producerStatementSources?.participantCoopUsedCents;

    const platformCommissionCents =
      platformCommissionFromSource !== null && platformCommissionFromSource !== undefined
        ? Math.max(0, platformCommissionFromSource)
        : Math.max(0, platformShareCents);
    const sharerDiscountCents =
      sharerDiscountFromSource !== null && sharerDiscountFromSource !== undefined
        ? Math.max(0, sharerDiscountFromSource)
        : Math.max(0, sharerShareProductsCents);
    const coopSurplusCents =
      coopSurplusFromSource !== null && coopSurplusFromSource !== undefined
        ? Math.max(0, coopSurplusFromSource)
        : Math.max(0, adjustedSharerShareCents - sharerDiscountCents);
    const participantGainsCents =
      participantGainsFromSource !== null && participantGainsFromSource !== undefined
        ? Math.max(0, participantGainsFromSource)
        : 0;
    const participantCoopUsedCents =
      participantCoopUsedFromSource !== null && participantCoopUsedFromSource !== undefined
        ? Math.max(0, participantCoopUsedFromSource)
        : 0;

    const isPlatformCommissionEstimated =
      isProducerStatementLoading || platformCommissionFromSource === null || platformCommissionFromSource === undefined;
    const isSharerDiscountEstimated =
      isProducerStatementLoading || sharerDiscountFromSource === null || sharerDiscountFromSource === undefined;
    const isCoopSurplusEstimated =
      isProducerStatementLoading || coopSurplusFromSource === null || coopSurplusFromSource === undefined;
    const isParticipantGainsEstimated =
      isProducerStatementLoading || participantGainsFromSource === null || participantGainsFromSource === undefined;
    const isRemainingToCollectEstimated =
      isProducerStatementLoading || participantCoopUsedFromSource === null || participantCoopUsedFromSource === undefined;

    const totalDeductionsCents =
      platformCommissionCents + sharerDiscountCents + coopSurplusCents + participantGainsCents;
    const transferToProducerCents = Math.max(0, totalOrderedCents - totalDeductionsCents);
    const remainingToCollectAfterCoopCents = isRemainingToCollectEstimated
      ? 0
      : Math.max(0, remainingToCollectCents - participantCoopUsedCents);
    const participantGainsRefs = producerStatementSources?.participantGainsLedgerRefs ?? [];
    const participantGainsReference =
      participantGainsRefs.length > 0
        ? `Ledger ${participantGainsRefs
            .slice(0, 2)
            .map((value) => value.slice(0, 8))
            .join(', ')}${participantGainsRefs.length > 2 ? '...' : ''}`
        : null;

    return {
      totalOrderedCents,
      platformCommissionCents,
      platformCommissionReference: producerStatementSources?.platformInvoice?.numero
        ? `Facture ${producerStatementSources.platformInvoice.numero}`
        : null,
      platformCommissionEstimated: isPlatformCommissionEstimated,
      sharerDiscountCents,
      sharerDiscountReference: producerStatementSources?.sharerInvoice?.numero
        ? `Facture ${producerStatementSources.sharerInvoice.numero}`
        : null,
      sharerDiscountEstimated: isSharerDiscountEstimated,
      coopSurplusCents,
      coopSurplusReference: producerStatementSources?.coopSurplusLedgerId
        ? `Ledger ${producerStatementSources.coopSurplusLedgerId.slice(0, 8)}`
        : null,
      coopSurplusEstimated: isCoopSurplusEstimated,
      participantGainsCents,
      participantGainsReference,
      participantGainsEstimated: isParticipantGainsEstimated,
      paymentFeeTtcCents: paymentFeeCents,
      deliveryFeeToPlatformCents,
      transferToProducerCents,
      remainingToCollectCents: remainingToCollectAfterCoopCents,
    };
  }, [
    deliveryFeeToPlatformCents,
    isProducerStatementLoading,
    paymentFeeCents,
    paymentsReceivedCents,
    platformShareCents,
    producerStatementSources,
    remainingToCollectCents,
    adjustedSharerShareCents,
    sharerShareProductsCents,
  ]);
  const producerPickupDetailLines = React.useMemo(() => {
    if (!shouldShowProducerPickupDetails) return [];
    return [
      `Adresse du producteur : ${producerPickupAddress}`,
      `Horaires du producteur : ${producerPickupHoursLabel}`,
    ];
  }, [producerPickupAddress, producerPickupHoursLabel, shouldShowProducerPickupDetails]);
  const deliveryInfoLines = React.useMemo(() => {
    if (isProducer && order.deliveryOption === 'producer_pickup') {
      const label = pickupRetrievalDateLabel ?? 'date a confirmer';
      return [`Le créateur de la commande viendra récuperer ses produits le ${label}`];
    }
    const hidePickupAddressLines = isOwner && order.deliveryOption === 'producer_pickup';
    const filteredDeliveryLines = hidePickupAddressLines
      ? deliveryDetailLines.filter(
          (line) =>
            !line.startsWith('Adresse de livraison :') &&
            !line.startsWith('Adresse de retrait :') &&
            !line.startsWith('Fenêtre de retrait :') &&
            !line.startsWith('Fenêtre de retrait :')
        )
      : deliveryDetailLines;
    const lines = [...filteredDeliveryLines];
    if (isOwner) {
      if (order.deliveryOption === 'producer_pickup') {
        if (producerPickupAddress) lines.push(`Adresse producteur : ${producerPickupAddress}`);
        if (producerPickupHoursLabel) lines.push(`Horaires producteur : ${producerPickupHoursLabel}`);
        lines.push(...producerContactLines);
      }
      if (order.deliveryOption === 'producer_delivery') {
        lines.push('Le producteur a reçu vos coordonnées pour la livraison.');
      }
    }
    return lines;
  }, [
    deliveryDetailLines,
    isOwner,
    isProducer,
    order.deliveryOption,
    pickupRetrievalDateLabel,
    producerContactLines,
    producerPickupAddress,
    producerPickupHoursLabel,
  ]);
  const pickupLine = deliveryDateLabel
    ? `Livraison : ${deliveryDateLabel}`
    : hasPickupSlots
      ? isPickupSelectionOpen
        ? 'Choix du rendez-vous de récupération disponible'
        : 'Choix du rendez-vous de récupération disponible après réception'
      : order.message || 'Voir message de retrait';
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? getOrderStatusLabel(order.status);
  const statusTone =
    order.status === 'finished'
      ? 'success'
      : order.status === 'cancelled' || order.status === 'locked'
        ? 'danger'
        : order.status === 'open'
          ? 'info'
          : order.status === 'draft'
            ? 'muted'
            : 'warning';
  const statusColor =
    statusTone === 'success'
      ? 'order-client-view__status-pill--success'
      : statusTone === 'danger'
        ? 'order-client-view__status-pill--danger'
        : statusTone === 'warning'
          ? 'order-client-view__status-pill--warning'
          : statusTone === 'muted'
            ? 'order-client-view__status-pill--muted'
            : 'order-client-view__status-pill--info';
  const statusProgress = getOrderStatusProgress(order.status);
  const canViewStatusProgress =
    order.status !== 'open' &&
    (isProducer || isOwner || Boolean(myParticipant?.participationStatus === 'accepted'));
  const showStatusProgress = canViewStatusProgress && statusProgress !== null;
  const statusProgressPercent = statusProgress ? Math.round(statusProgress.ratio * 100) : 0;
  const statusProgressLabel = statusProgress ? `Etape ${statusProgress.step}/${statusProgress.total}` : '';
  const shouldShowSupportCard = ['delivered', 'distributed', 'finished'].includes(order.status);
  const productCodeByDbId = React.useMemo(() => {
    const entries = orderFullValue.productsOffered.map((entry) => [
      entry.productId,
      entry.product?.code ?? entry.productId,
    ] as const);
    return new Map(entries);
  }, [orderFullValue.productsOffered]);
  const participants = React.useMemo(() => {
    return orderFullValue.participants.map((participant) => {
      const quantities: Record<string, number> = {};
      products.forEach((product) => {
        quantities[product.id] = 0;
      });
      const items = orderFullValue.items.filter((item) => item.participantId === participant.id);
      items.forEach((item) => {
        const code = productCodeByDbId.get(item.productId);
        if (!code) return;
        quantities[code] = (quantities[code] ?? 0) + item.quantityUnits;
      });
      const meta = getProfileMeta(participant.profileId);
      const displayName =
        participant.role === 'sharer'
          ? `${participant.profileName ?? meta?.name ?? 'Partageur'} (partageur)`
          : participant.profileName ?? meta?.name ?? 'Participant';
      return {
        id: participant.id,
        profileId: participant.profileId ?? null,
        name: displayName,
        handle: participant.profileHandle ?? meta?.handle ?? undefined,
        avatarPath: participant.avatarPath ?? meta?.avatarPath ?? null,
        avatarUpdatedAt: participant.avatarUpdatedAt ?? meta?.avatarUpdatedAt ?? null,
        quantities,
        totalAmount: centsToEuros(participant.totalAmountCents),
        totalWeight: participant.totalWeightKg,
        pickupCode: participant.pickupCode ?? null,
        role: participant.role,
      };
    });
  }, [getProfileMeta, orderFullValue.items, orderFullValue.participants, productCodeByDbId, products]);
  const participantsWithTotals = participants;
  const pendingParticipants = orderFullValue.participants.filter(
    (participant) => participant.participationStatus === 'requested'
  );
  const ownerVisibility: ParticipantVisibility = React.useMemo(
    () => ({ profile: true, content: true, weight: true, amount: true }),
    []
  );
  const baseParticipantVisibility = React.useMemo(
    () => ({
      profile: order.visibility === 'public' ? false : participantsVisibility.profile,
      content: participantsVisibility.content,
      weight: participantsVisibility.weight,
      amount: participantsVisibility.amount,
    }),
    [order.visibility, participantsVisibility]
  );
  const producerParticipantVisibility = React.useMemo(
    () => ({
      profile: false,
      content: true,
      weight: true,
      amount: true,
    }),
    []
  );
  const viewerVisibility = isOwner
    ? ownerVisibility
    : isProducer
      ? producerParticipantVisibility
      : baseParticipantVisibility;
  const isProfileVisibilityLocked = order.visibility === 'public';
  const hasVisibleColumns = Object.values(viewerVisibility).some(Boolean);
  const canShowParticipants = isOwner || (isAuthenticated && hasVisibleColumns);
  const shouldShowPickupCodeColumn = canShowPickupCodes;
  const participantsTitle = !canShowParticipants
    ? 'Liste des participants à la commande'
    : participantsWithTotals.length
      ? `${participantsWithTotals.length} participant${participantsWithTotals.length > 1 ? 's' : ''} à la commande`
      : isOwner
        ? 'Aucun participant pour le moment à la commande'
        : 'Liste des participants à la commande';
  const participantsCountFooterLabel = `${participantsWithTotals.length} participant${
    participantsWithTotals.length > 1 ? 's' : ''
  }`;
  const totalWeightAll = React.useMemo(
    () => participantsWithTotals.reduce((sum, participant) => sum + participant.totalWeight, 0),
    [participantsWithTotals]
  );
  const totalAmountAll = React.useMemo(
    () => participantsWithTotals.reduce((sum, participant) => sum + participant.totalAmount, 0),
    [participantsWithTotals]
  );
  const productTotals = React.useMemo(
    () =>
      products.map((product) => {
        const totalUnits = participants.reduce(
          (sum, participant) => sum + (participant.quantities[product.id] ?? 0),
          0
        );
        const totalWeight = totalUnits * getProductWeightKg(product);
        return { productId: product.id, totalUnits, totalWeight, measurement: product.measurement };
      }),
    [products, participants]
  );
  const shouldShowTotals = viewerVisibility.content || viewerVisibility.weight || viewerVisibility.amount;
  const shouldShowInvoiceColumn = isProducer;
  const canReviewPickupSlots = isOwner && !autoApprovePickupSlots;
  const formatUnitsTotal = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(2);
  const canShowPreview = isAuthenticated && Boolean(myParticipant) && !isOwner && !isProducer;
  const otherParticipants = React.useMemo(
    () =>
      orderFullValue.participants.filter(
        (participant) =>
          participant.role === 'participant' &&
          participant.participationStatus === 'accepted' &&
          participant.id !== myParticipant?.id
      ),
    [orderFullValue.participants, myParticipant?.id]
  );
  const otherParticipantIds = React.useMemo(
    () => new Set(otherParticipants.map((participant) => participant.id)),
    [otherParticipants]
  );
  const previewItems = React.useMemo(() => {
    if (!canShowPreview || otherParticipantIds.size === 0) return [];
    const totals = new Map<string, number>();
    orderFullValue.items.forEach((item) => {
      if (!otherParticipantIds.has(item.participantId)) return;
      const code = productCodeByDbId.get(item.productId);
      if (!code) return;
      totals.set(code, (totals.get(code) ?? 0) + item.quantityUnits);
    });
    return products
      .map((product) => {
        const totalUnits = totals.get(product.id) ?? 0;
        if (!totalUnits) return null;
        const quantityLabel =
          product.measurement === 'kg' ? `${totalUnits.toFixed(2)} kg` : formatUnitsTotal(totalUnits);
        return { id: product.id, label: `${product.name} x ${quantityLabel}` };
      })
      .filter((entry): entry is { id: string; label: string } => Boolean(entry));
  }, [canShowPreview, orderFullValue.items, otherParticipantIds, productCodeByDbId, products, formatUnitsTotal]);
  const previewFallbackLabel = otherParticipants.length
    ? `${otherParticipants.length} participant${otherParticipants.length > 1 ? 's' : ''} ${
        otherParticipants.length > 1 ? 'ont' : 'a'
      } déjà composé leur panier.`
    : "Aucun autre participant n'a encore composé son panier.";

  const handleParticipantClick = (participant: OrderParticipant) => {
    const target = participant.handle ?? participant.name;
    if (!target) return;
    if (onOpenParticipantProfile) {
      onOpenParticipantProfile(target);
      return;
    }
    handleAvatarNavigation(participant.handle ?? null, participant.name);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        Chargement de la commande...
      </div>
    );
  }

  if (loadError || !orderFull) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        {loadError ?? 'Commande introuvable.'}
      </div>
    );
  }

  if (shouldRestrictAccess) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        La commande est clôturée et en cours de préparation et de distribution
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-8">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <button
            onClick={onClose}
            className="order-client-view__back-button"
            type="button"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <span className={`order-client-view__status-pill ${statusColor}`}>
            Statut : {statusLabel}
          </span>
        </div>
        {isOwner && (
          <div className="order-client-view__owner-actions">
            <button
              type="button"
              onClick={handleVisibilityToggle}
              className={`order-client-view__visibility-button ${
                order.visibility === 'public'
                  ? 'order-client-view__visibility-button--public'
                  : 'order-client-view__visibility-button--private'
              }`}
            >
              {order.visibility === 'public' ? <Globe2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {order.visibility === 'public' ? 'Commande publique' : 'Commande privée'}
            </button>
            <button
              type="button"
              onClick={() => updateAutoApproveParticipationRequests(!autoApproveParticipationRequests)}
              className={`order-client-view__visibility-button ${
                autoApproveParticipationRequests
                  ? 'order-client-view__visibility-button--public'
                  : 'order-client-view__visibility-button--private'
              }`}
              aria-pressed={autoApproveParticipationRequests}
              title="Validation directe ou au cas par cas des demandes de participation"
            >
              <span className="block text-[11px] text-center leading-tight whitespace-nowrap">
                Validation des participants {autoApproveParticipationRequests ? 'automatique' : 'manuelle'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => updateAllowSharerMessages(!allowSharerMessages)}
              className={`order-client-view__visibility-button ${
                allowSharerMessages
                  ? 'order-client-view__visibility-button--public'
                  : 'order-client-view__visibility-button--private'
              }`}
              aria-pressed={allowSharerMessages}
              title="Autoriser ou ne pas autoriser les messages entrants des potentiels participants"
            >
              <span className="block text-[11px] text-center leading-tight whitespace-nowrap">
                Messages {allowSharerMessages ? 'acceptés' : 'désactivés'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => updateAutoApprovePickupSlots(!autoApprovePickupSlots)}
              className={`order-client-view__visibility-button ${
                autoApprovePickupSlots
                  ? 'order-client-view__visibility-button--public'
                  : 'order-client-view__visibility-button--private'
              }`}
              aria-pressed={autoApprovePickupSlots}
              title="Validation directe ou au cas par cas des demandes de rendez-vous pour la récupération des produits"
            >
              <span className="block text-[11px] text-center leading-tight whitespace-nowrap">
                Validation des rendez-vous {autoApprovePickupSlots ? 'automatique' : 'manuelle'}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="order-client-view__layout">
        <div className="order-client-view__main">
          <div className="order-client-view__card">
            <div className="order-client-view__header">
              <div className="order-client-view__header-row">
                <div className="order-client-view__header-title-block">
                  <h2 className="order-client-view__header-title">{order.title}</h2>
                  <div className="order-client-view__header-meta">
                    <div className="order-client-view__header-avatars">
                      <button
                        type="button"
                        onClick={() => handleAvatarNavigation(sharerProfileHandle, sharerName)}
                        aria-label={`Voir le profil de ${sharerName}`}
                        className="order-client-view__header-avatar-button"
                      >
                        <Avatar
                          supabaseClient={supabaseClient ?? null}
                          path={sharerAvatarPath}
                          updatedAt={sharerAvatarUpdatedAt}
                          fallbackSrc={DEFAULT_PROFILE_AVATAR}
                          alt={sharerName}
                          className="order-client-view__header-avatar-img"
                        />
                      </button>
                      <span className="order-client-view__header-arrow" aria-hidden="true">
                        <svg viewBox="0 0 54 24" role="img" focusable="false">
                          <path
                            d="M4 12h44m0 0l-7-7m7 7l-7 7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAvatarNavigation(producerProfileHandle, producerName)}
                        aria-label={`Voir le profil de ${producerName}`}
                        className="order-client-view__header-avatar-button"
                      >
                        <Avatar
                          supabaseClient={supabaseClient ?? null}
                          path={producerAvatarPath}
                          updatedAt={producerAvatarUpdatedAt}
                          fallbackSrc={DEFAULT_PROFILE_AVATAR}
                          alt={producerName}
                          className="order-client-view__header-avatar-img"
                        />
                      </button>
                    </div>
                    <p className="order-client-view__header-description">
                      <span className="order-client-view__header-emphasis">{sharerName}</span> se procure des produits
                      chez <span className="order-client-view__header-emphasis">{producerName}</span> : participez à sa commande
                    </p>
                    {order.message && (
                    <div className="order-client-view__header-message">
                      <p>{order.message}</p>
                    </div>
                      )}
                  </div>
                </div>
              </div>

              <div className="order-client-view__header-grid">
                <div className="order-client-view__calendar-card">
                  <div className="order-client-view__calendar-header">
                    <div className="order-client-view__info-header">
                      <MapPin className="order-client-view__info-icon order-client-view__info-icon--accent" />
                      Retrait : {locationAddress}
                    </div>
                    <span className="order-client-view__calendar-month">{calendarPeriodLabel}</span>
                  </div>
                  <div className="order-client-view__calendar-legend">
                    <span className="order-client-view__calendar-legend-item">
                      <span className="order-client-view__calendar-legend-swatch order-client-view__calendar-legend-swatch--open" />
                      Commande
                    </span>
                    <span className="order-client-view__calendar-legend-item">
                      <span className="order-client-view__calendar-legend-swatch order-client-view__calendar-legend-swatch--delivery" />
                      Livraison
                    </span>
                    <span className="order-client-view__calendar-legend-item">
                      <span className="order-client-view__calendar-legend-swatch order-client-view__calendar-legend-swatch--availability" />
                      Récupération
                    </span>
                  </div>
                  <div
                    className={`order-client-view__calendar-months ${
                      calendarMonthViews.length === 2 ? 'order-client-view__calendar-months--two' : ''
                    }`}
                  >
                    {calendarMonthViews.map((calendarMonth) => (
                      <div key={calendarMonth.key} className="order-client-view__calendar-month-panel">
                        <p className="order-client-view__calendar-month-title">{calendarMonth.monthLabel}</p>
                        <div className="order-client-view__calendar-grid">
                          {WEEKDAY_LABELS.map((label) => (
                            <div key={`${calendarMonth.key}-${label}`} className="order-client-view__calendar-weekday">
                              {label}
                            </div>
                          ))}
                          {calendarMonth.days.map((day, index) => {
                            if (!day) {
                              return (
                                <div
                                  key={`${calendarMonth.key}-empty-${index}`}
                                  className="order-client-view__calendar-day order-client-view__calendar-day--empty"
                                  aria-hidden="true"
                                />
                              );
                            }
                            const dateKey = toDateKey(day);
                            const isInAvailability = availabilityRange ? isDateInRange(day, availabilityRange) : false;
                            const isInDelivery = deliveryRange ? isDateInRange(day, deliveryRange) : false;
                            const isInOpen = openRange ? isDateInRange(day, openRange) : false;
                            const isSelected = selectedPickupDateKey === dateKey;
                            const isToday = todayKey === dateKey;
                            const isMyPickupDay = Boolean(myPickupSlotDateKey && myPickupSlotDateKey === dateKey);
                            const isMyPickupDayAccepted = isMyPickupDay && myPickupSlotStatus === 'accepted';
                            const isMyPickupDayPending = isMyPickupDay && myPickupSlotStatus === 'requested';
                            const myPickupSymbol = isMyPickupDayAccepted ? 'v' : isMyPickupDayPending ? '...' : null;
                            const dayScheduleKey = WEEKDAY_KEYS[day.getDay()];
                            const hasProducerPickupDay = Boolean(
                              shouldShowProducerPickupDetails && producerOpeningHoursByDay[dayScheduleKey]
                            );
                            const showProducerPickupIndicator = hasProducerPickupDay && isInAvailability;
                            const hasSlots =
                              canShowPickupSlotDetails &&
                              (pickupSlotsByDate.get(dateKey) ?? []).some((slot) => slot.enabled);
                            const hasCalendarMarker = hasSlots || showProducerPickupIndicator;
                            const reservationCount = pickupSlotReservationCountsByDate.get(dateKey) ?? 0;
                            const reservationCountLabel = reservationCount > 9 ? '9+' : String(reservationCount);
                            const isClickable = Boolean(availabilityRange) && isInAvailability && canShowPickupSlotDetails;
                            const toneClass = isInAvailability
                              ? 'order-client-view__calendar-day--availability'
                              : isInDelivery
                                ? 'order-client-view__calendar-day--delivery'
                                : isInOpen
                                  ? 'order-client-view__calendar-day--open'
                                  : '';
                            return (
                              <button
                                key={`${calendarMonth.key}-${dateKey}`}
                                type="button"
                                className={`order-client-view__calendar-day ${toneClass} ${
                                  isSelected ? 'order-client-view__calendar-day--selected' : ''
                                } ${isToday ? 'order-client-view__calendar-day--today' : ''} ${
                                  isMyPickupDayAccepted ? 'order-client-view__calendar-day--my-pickup' : ''
                                } ${
                                  isClickable
                                    ? 'order-client-view__calendar-day--clickable'
                                    : 'order-client-view__calendar-day--inactive'
                                }`}
                                onClick={() => {
                                  if (!isClickable) return;
                                  setSelectedPickupDateKey(dateKey);
                                }}
                                aria-pressed={isSelected}
                                aria-disabled={!isClickable}
                                tabIndex={isClickable ? 0 : -1}
                              >
                                <span>{day.getDate()}</span>
                                {hasCalendarMarker && <span className="order-client-view__calendar-day-dot" />}
                                {myPickupSymbol && (
                                  <span
                                    className={`order-client-view__calendar-day-pickup ${
                                      isMyPickupDayPending ? 'order-client-view__calendar-day-pickup--pending' : ''
                                    }`}
                                    title={
                                      isMyPickupDayAccepted
                                        ? 'Créneau confirmé'
                                        : isMyPickupDayPending
                                          ? 'Créneau en attente'
                                          : 'Votre créneau'
                                    }
                                  >
                                    {myPickupSymbol}
                                  </span>
                                )}
                                {reservationCount > 0 && (
                                  <span
                                    className="order-client-view__calendar-day-count"
                                    title={`${reservationCount} réservation${reservationCount > 1 ? 's' : ''}`}
                                  >
                                    {reservationCountLabel}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {canShowPickupSlotDetails && (
                    <div className="order-client-view__calendar-slots">
                      {selectedPickupDateKey ? (
                        <>
                          <div className="order-client-view__calendar-slots-header">
                            <span className="order-client-view__calendar-slots-title">
                              Disponibilités le {selectedDateLabel}
                            </span>
                            {pickupSlotHeaderStatus && (
                              <span className="order-client-view__calendar-slots-status">
                                {pickupSlotHeaderStatus}
                              </span>
                            )}
                            {isOwner && selectedDateReservationCount > 0 && (
                              <span className="order-client-view__pickup-slots-count">
                                {selectedDateReservationCount} réservation
                                {selectedDateReservationCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {selectedDateSlotsSorted.length === 0 ? (
                            <p className="order-client-view__calendar-slots-note">Aucun créneau pour cette date.</p>
                          ) : (
                            <div className="order-client-view__pickup-slots-grid">
                              {selectedDateSlotsSorted.map((slot) => {
                                const isSelected = myParticipant?.pickupSlotId === slot.id;
                                const isDisabled = !slot.enabled || !canSelectPickupSlotOnSelectedDate;
                                const slotReservations = pickupSlotReservations.get(slot.id) ?? [];
                                const reservationCount = slotReservations.filter(
                                  (reservation) => reservation.status !== 'rejected'
                                ).length;
                                const timeOptions = buildPickupTimeOptions(
                                  slot.start,
                                  slot.end,
                                  isSelectedDateToday ? minSelectableMinutes : null
                                );
                                const hasSelectableTimes = timeOptions.length > 0;
                                const rawSelectedTime =
                                  pickupSlotTimesById[slot.id] ?? (isSelected ? myParticipantPickupTime ?? '' : '');
                                const normalizedTimeOptions =
                                  timeOptions.length > 0 && rawSelectedTime && !timeOptions.includes(rawSelectedTime)
                                    ? [rawSelectedTime, ...timeOptions]
                                    : timeOptions;
                                const selectedTime = rawSelectedTime && normalizedTimeOptions.includes(rawSelectedTime)
                                  ? rawSelectedTime
                                  : '';
                                return (
                                  <div key={slot.id} className="order-client-view__pickup-slot-wrapper">
                                    <div
                                      className={`order-client-view__pickup-slot ${
                                        isDisabled ? 'order-client-view__pickup-slot--disabled' : ''
                                      } ${isSelected ? 'order-client-view__pickup-slot--selected' : ''}`}
                                    >
                                      <div>
                                        <p className="order-client-view__pickup-slot-date">{slot.timeLabel}</p>
                                        <p className="order-client-view__pickup-slot-time">{slot.label}</p>
                                      </div>
                                      <div className="order-client-view__pickup-slot-status">
                                        {isSelected && (
                                          <span className="order-client-view__pickup-slot-tag">
                                            Sélectionné{myParticipantPickupTime ? ` à ${myParticipantPickupTime}` : ''}
                                          </span>
                                        )}
                                        {isSelected && myParticipant?.pickupSlotStatus === 'accepted' && (
                                          <span className="order-client-view__pickup-slot-tag">
                                            Créneau confirmé
                                          </span>
                                        )}
                                        {isSelected && myParticipant?.pickupSlotStatus === 'requested' && (
                                          <span className="order-client-view__pickup-slot-tag order-client-view__pickup-slot-tag--pending">
                                            En attente de validation
                                          </span>
                                        )}
                                        {isSelected && myParticipant?.pickupSlotStatus === 'rejected' && (
                                          <span className="order-client-view__pickup-slot-tag order-client-view__pickup-slot-tag--rejected">
                                            Demande refusée
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {canSelectPickupSlotOnSelectedDate && timeOptions.length > 0 && (
                                      <div className="order-client-view__pickup-slot-time-picker">
                                        <label
                                          htmlFor={`pickup-slot-time-${slot.id}`}
                                          className="order-client-view__pickup-slot-time-label"
                                        >
                                          Heure souhaitée
                                        </label>
                                        <select
                                          id={`pickup-slot-time-${slot.id}`}
                                          className="order-client-view__pickup-slot-time-select"
                                          value={selectedTime}
                                          onChange={(event) => {
                                            const value = event.target.value;
                                            setPickupSlotTimesById((prev) => ({ ...prev, [slot.id]: value }));
                                          }}
                                          disabled={isDisabled || isWorking}
                                        >
                                          <option value="">Choisir une heure</option>
                                          {normalizedTimeOptions.map((option) => (
                                            <option key={option} value={option}>
                                              {option}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                    {canSelectPickupSlotOnSelectedDate && (
                                      <button
                                        type="button"
                                        className="order-client-view__pickup-slot-validate"
                                        onClick={() => {
                                          if (isDisabled || isWorking) return;
                                          if (!hasSelectableTimes) {
                                            toast.info('Aucune heure disponible pour ce créneau.');
                                            return;
                                          }
                                          if (!selectedTime) {
                                            toast.info('Choisissez une heure pour ce créneau.');
                                            return;
                                          }
                                          handlePickupSlotSelect(slot.id, selectedTime);
                                        }}
                                        disabled={isDisabled || isWorking || !hasSelectableTimes || !selectedTime}
                                      >
                                        Valider
                                      </button>
                                    )}
                                    {isOwner && reservationCount > 0 && (
                                      <div className="order-client-view__pickup-slot-reservations">
                                        <span className="order-client-view__pickup-slot-reservations-title">
                                          {reservationCount} réservation{reservationCount > 1 ? 's' : ''}
                                        </span>
                                        <div className="order-client-view__pickup-slot-reservations-list">
                                          {slotReservations.map((reservation) => {
                                            const statusLabel =
                                              reservation.status && reservation.status !== 'accepted'
                                                ? formatPickupSlotStatusLabel(reservation.status)
                                                : null;
                                            const statusClass =
                                              reservation.status === 'requested'
                                                ? 'order-client-view__pickup-slot-reservation--pending'
                                                : reservation.status === 'accepted'
                                                  ? 'order-client-view__pickup-slot-reservation--accepted'
                                                  : '';
                                            const timeLabel = reservation.time ? ` · ${reservation.time}` : '';
                                            const canReview = canReviewPickupSlots && reservation.status === 'requested';
                                            return (
                                              <div
                                                key={reservation.id}
                                                className={`order-client-view__pickup-slot-reservation ${statusClass}`}
                                              >
                                                <span className="order-client-view__pickup-slot-reservation-name">
                                                  {reservation.name}
                                                  {timeLabel}
                                                  {statusLabel ? ` · ${statusLabel}` : ''}
                                                </span>
                                                {canReview && (
                                                  <div className="order-client-view__pickup-slot-reservation-actions">
                                                    <button
                                                      type="button"
                                                      className="order-client-view__pickup-slot-reservation-action order-client-view__pickup-slot-reservation-action--accept"
                                                      onClick={() => handlePickupSlotReview(reservation.id, 'accepted')}
                                                      disabled={isWorking}
                                                    >
                                                      Valider
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="order-client-view__pickup-slot-reservation-action order-client-view__pickup-slot-reservation-action--reject"
                                                      onClick={() => handlePickupSlotReview(reservation.id, 'rejected')}
                                                      disabled={isWorking}
                                                    >
                                                      Refuser
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="order-client-view__calendar-slots-note">
                          Sélectionnez un jour dans la période de récupération.
                        </p>
                      )}
                    </div>
                  )}
                  
                </div>
                {(isProducer || isOwner) && (
                  <div className="order-client-view__info-card">
                    <div className="order-client-view__info-header">
                      <Globe2 className="order-client-view__info-icon order-client-view__info-icon--accent" />
                      Livraison
                    </div>
                    <p className="order-client-view__info-title">{deliveryModeLabel}</p>
                    {deliveryInfoLines.map((line, index) => (
                      <p key={`delivery-${index}`} className="order-client-view__info-line">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
                {isProducer && isLockedOrAfter && (
                  <div className="order-client-view__info-card">
                    <div className="order-client-view__info-header">
                      <ShieldCheck className="order-client-view__info-icon order-client-view__info-icon--accent" />
                      Relevé de règlement
                    </div>
                    <div className="order-client-view__statement">
                      <div className="order-client-view__statement-row">
                        <span className="order-client-view__statement-label">Total commande</span>
                        <span className="order-client-view__statement-value order-client-view__statement-value--strong">
                          {formatEurosFromCents(producerStatementData.totalOrderedCents)}
                        </span>
                      </div>
                      <div className="order-client-view__statement-row">
                        <span className="order-client-view__statement-label">
                          Commission de la plateforme
                          <span className="order-client-view__statement-meta">
                            {producerStatementData.platformCommissionReference ? (
                              <span className="order-client-view__statement-ref">
                                {producerStatementData.platformCommissionReference}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="order-client-view__statement-value">
                          -{formatEurosFromCents(producerStatementData.platformCommissionCents)}
                        </span>
                      </div>
                      <div className="order-client-view__statement-row order-client-view__statement-row--detail">
                        <span className="order-client-view__statement-label">
                          dont frais de paiement
                        </span>
                        <span className="order-client-view__statement-value">
                          {formatEurosFromCents(producerStatementData.paymentFeeTtcCents)}
                        </span>
                      </div>
                      <div className="order-client-view__statement-row">
                        <span className="order-client-view__statement-label">
                          Remise sur les produits du partageur
                          <span className="order-client-view__statement-meta">
                            {producerStatementData.sharerDiscountReference ? (
                              <span className="order-client-view__statement-ref">
                                {producerStatementData.sharerDiscountReference}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="order-client-view__statement-value">
                          -{formatEurosFromCents(producerStatementData.sharerDiscountCents)}
                        </span>
                      </div>
                      <div className="order-client-view__statement-row">
                        <span className="order-client-view__statement-label">
                          Affectation gains de coopération partageur
                          <span className="order-client-view__statement-meta">
                            {producerStatementData.coopSurplusReference ? (
                              <span className="order-client-view__statement-ref">
                                {producerStatementData.coopSurplusReference}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="order-client-view__statement-value">
                          -{formatEurosFromCents(producerStatementData.coopSurplusCents)}
                        </span>
                      </div>
                      <div className="order-client-view__statement-row">
                        <span className="order-client-view__statement-label">
                          Affectation gains de coopération participants
                          <span className="order-client-view__statement-meta">
                            {producerStatementData.participantGainsReference ? (
                              <span className="order-client-view__statement-ref">
                                {producerStatementData.participantGainsReference}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="order-client-view__statement-value">
                          -{formatEurosFromCents(producerStatementData.participantGainsCents)}
                        </span>
                      </div>
                      {producerStatementData.deliveryFeeToPlatformCents > 0 && (
                        <div className="order-client-view__statement-row order-client-view__statement-row--detail">
                          <span className="order-client-view__statement-label">Frais de livraison plateforme (info)</span>
                          <span className="order-client-view__statement-value">
                            {formatEurosFromCents(producerStatementData.deliveryFeeToPlatformCents)}
                          </span>
                        </div>
                      )}
                      <div className="order-client-view__statement-total">
                        <span className="order-client-view__statement-label order-client-view__statement-value--strong">
                          Virement au producteur
                        </span>
                        <span className="order-client-view__statement-value order-client-view__statement-value--strong">
                          {formatEurosFromCents(producerStatementData.transferToProducerCents)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
            </div>
          </div>

          {!isProducer && (
            <div className="order-client-view__products-section">
              <div className="order-client-view__products-header">
                <div>
                  <h3 className="order-client-view__products-title">
                    {isOrderOpen ? 'Choisissez vos produits' : 'Les produits de la commande'}
                  </h3>
                </div>
              </div>

              {products.length === 0 ? (
                <div className="order-client-view__empty-card">
                  Aucun produit n'est associé a cette commande pour l'instant.
                </div>
              ) : (
                <OrderProductsCarousel
                  products={products}
                  quantities={quantities}
                  onDeltaQuantity={handleQuantityChange}
                  onDirectQuantity={(productId, value) =>
                    setQuantities((prev) => {
                      if (!isOrderOpen) return prev;
                      const next = clampQuantityForMax(productId, Math.max(0, value), prev);
                      if (next === (prev[productId] ?? 0)) return prev;
                      return { ...prev, [productId]: next };
                    })
                  }
                  unitPriceLabelsById={unitPriceLabelsById}
                  isSelectionLocked={!isOrderOpen}
                  onOpenProduct={handleOpenProduct}
                  onOpenProducer={handleOpenProducerFromProduct}
                />
              )}
            </div>
          )}
        </div>

        <div className="order-client-view__aside">
          <div className="order-client-view__summary">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FF6B4A]/10 text-[#FF6B4A] border border-[#FF6B4A]/20">
                  <Users className="w-4 h-4" />
                </span>
                <p className="text-lg font-semibold text-[#1F2937] leading-snug">
                  Progression de la commande
                </p>
              </div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#B45309] border border-[#FFDCC4] font-semibold text-sm shadow-sm">
                {showStatusProgress ? `${statusProgressPercent}%` : `${progressPercent.toFixed(0)}%`}
              </span>
            </div>

            {showStatusProgress && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-medium">
                  <span className="text-[#FF6B4A] font-semibold">{statusProgressLabel}</span>
                  <span className="text-[#1F2937] font-semibold">Statut : {statusLabel}</span>
                </div>
                <div className="order-client-view__status-progress-track">
                  <div
                    className="order-client-view__status-progress-fill"
                    style={{ width: `${statusProgressPercent}%` }}
                  />
                </div>
                {statusActions.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {statusActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="order-client-view__purchase-button"
                        onClick={() => handleStatusUpdate(action.nextStatus, action.successMessage)}
                        disabled={isWorking}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!showStatusProgress && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-medium">
                  <span className="text-[#15803d] font-semibold">Déjà achetés : {alreadyOrderedWeight.toFixed(2)} kg</span>
                  <span className="text-[#d97706] font-semibold">Votre sélection : {selectedWeight.toFixed(2)} kg</span>
                  <span className="text-[#FF6B4A] font-semibold">Objectif : {order.minWeightKg} kg</span>
                </div>
                <div className="order-client-view__progress-track">
                  <div
                    className="order-client-view__progress-fill order-client-view__progress-fill--base"
                    style={baseSegmentStyle}
                  />
                  <div
                    className="order-client-view__progress-fill order-client-view__progress-fill--selection"
                    style={selectionSegmentStyle}
                  />
                </div>
              </div>
            )}

            {!showStatusProgress && extraPercent > 0 && (
              <div className="flex items-start gap-3 text-xs text-[#9A3412] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-3 shadow-sm">
                <span className="inline-flex w-2 h-2 mt-1 rounded-full bg-[#FF6B4A]" />
                <span>Les {extraPercent.toFixed(0)}% au-dessus du minimum requis pour lancer la commande vous permettent d'obtenir des avoirs sur des prochaines commandes.</span>
              </div>
            )}

            {!showStatusProgress && (
              <div className="gap-3 text-sm">
                  <p className="text-[#1F2937] p-2">{remainingWeightLabel} : {remainingWeightDisplay.toFixed(2)} kg</p>
              </div>
            )}
            {isOwner && isOrderOpen && (
              <div className="space-y-3">
                  <span className="text-[#1F2937] p-2 text-sm">Part du partageur accumulée : {formatEurosFromCents(adjustedSharerShareCents)}</span>
                {sharerProductsCents > adjustedSharerShareCents ? (
                  <>
                    <p className="text-xs text-[#9A3412] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-2">
                      Vous allez devoir compléter encore {formatEurosFromCents(sharerDeficitCents)} pour clôturer la commande
                      et obtenir vos produits car votre part gagnée n&apos;est pas encore suffisante.
                    </p>
                    {canReachFullCoverage && (
                      <p className="text-xs text-[#92400E] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-2">
                        Continuez de partager la commande autour de vous pour obtenir une part suffisante qui vous
                        permettra de vous faire rembourser l&apos;intégralité des produits.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl px-3 py-2">
                    La part du partageur obtenue est supérieure à la valeur de vos produits, ainsi vous allez obtenir
                    vos produits gratuitement ainsi que {formatEurosFromCents(sharerGainCents)} de gain de coopération.
                  </p>
                )}
                <button
                  type="button"
                  className="order-client-view__purchase-button order-client-view__close-button"
                  disabled={!isMinimumReached || isWorking}
                  onClick={handleCloseOrder}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Clôturer
                </button>
              </div>
            )}
          </div>

            {!isProducer && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-4">
            <div className="order-client-view__payment-summary">
              <div className="order-client-view__payment-row">
                <span>Montant du panier</span>
                <span className="order-client-view__payment-value">{formatPrice(totalPrice)}</span>
              </div>
              {shouldShowCoopToggle ? (
                <>
                  <div className="order-client-view__payment-row order-client-view__payment-row--toggle">
                    <label className="order-client-view__toggle">
                      <input
                        type="checkbox"
                        checked={useCoopBalance}
                        onChange={(event) => setUseCoopBalance(event.target.checked)}
                      />
                      <span>Utiliser vos gains de coopération</span>
                    </label>
                    <span className="order-client-view__payment-value">
                      -{formatEurosFromCents(coopAppliedCents)}
                    </span>
                  </div>
                  <div className="order-client-view__payment-row">
                    <span>Montant à Payer</span>
                    <span className="order-client-view__payment-value">
                      {formatEurosFromCents(remainingToPayCents)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {isOrderOpen ? (
                <button
                  type="button"
                  onClick={handlePurchase}
                  disabled={totalCards === 0 || isWorking}
                  className="order-client-view__purchase-button"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Payer
                </button>
              ) : (
                <div className="text-xs text-[#6B7280] font-semibold">
                  Paiement indisponible pour le moment
                </div>
              )}
            </div>
            </div>
            )}
          </div>
        </div>
      </div>

      <div className="order-client-view__participants">
            <div className="order-client-view__participants-header">
              <div>
                <p className="order-client-view__participants-title">{participantsTitle}</p>
              </div>
              {isOwner && (
                <div className="order-client-view__participants-controls">
                  <button
                    type="button"
                    ref={participantsButtonRef}
                    onClick={() => setParticipantsPanelOpen((prev) => !prev)}
                    className="order-client-view__participants-visibility-button"
                    aria-expanded={participantsPanelOpen}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    Visibilité des differentes colonnes du tableau pour les participants
                  </button>
                  {participantsPanelOpen && (
                    <div ref={participantsPanelRef} className="order-client-view__participants-panel">
                      {participantVisibilityOptions.map((option) => {
                        const isLocked = isProfileVisibilityLocked && option.key === 'profile';
                        const isActive = isLocked ? false : participantsVisibility[option.key];
                        return (
                          <div key={option.key} className="order-client-view__participants-panel-row">
                            <span className="order-client-view__participants-panel-label">{option.label}</span>
                            <button
                              type="button"
                              className={`order-client-view__participants-panel-toggle ${
                                isActive ? 'order-client-view__participants-panel-toggle--active' : ''
                              }`}
                              aria-pressed={isActive}
                              disabled={isLocked}
                              onClick={() => {
                                if (isLocked) return;
                                const next = { ...participantsVisibility, [option.key]: !isActive };
                                if (isProfileVisibilityLocked) {
                                  next.profile = false;
                                }
                                setParticipantsVisibility(next);
                                setIsWorking(true);
                                updateParticipantsVisibility(order.id, next)
                                  .then(() => updateOrderLocal({ participantsVisibility: next }))
                                  .catch((error) => {
                                    console.error('Participants visibility error:', error);
                                    toast.error('Impossible de mettre a jour la visibilite.');
                                  })
                                  .finally(() => setIsWorking(false));
                              }}
                            >
                              {isActive ? 'Visible' : 'Masquée'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
            )}
          </div>

            {!canShowPickupCodes && myParticipant && (
              <div className="order-client-view__pickup-code-card">
                {myParticipant.pickupCode ? (
                  <p className="order-client-view__pickup-code-label">
                    Ton code de retrait :
                    <span className="order-client-view__pickup-code">{myParticipant.pickupCode}</span>
                  </p>
                ) : (
                  <p className="order-client-view__pickup-code-label">
                    Une fois ta participation acceptée et payée tu obtiendras un code de récupération pour tes produits
                  </p>
                )}
              </div>
            )}
            {participantInvoice && (
              <div className="order-client-view__pickup-code-card">
                <p className="order-client-view__pickup-code-label">
                  Votre facture :
                  <span className="order-client-view__pickup-code">{participantInvoice.numero}</span>
                </p>
                <p className="order-client-view__pickup-code-label">
                  Total TTC :{' '}
                  <span className="order-client-view__pickup-code">
                    {formatEurosFromCents(participantInvoice.totalTtcCents)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => handleInvoiceDownload(participantInvoice)}
                  className="order-client-view__purchase-button"
                  disabled={isInvoiceLoading}
                >
                  {participantInvoice.pdfPath ? 'Télecharger (PDF)' : 'PDF en cours de génération'}
                </button>
              </div>
            )}
            {producerInvoice && (
              <div className="order-client-view__pickup-code-card">
                <p className="order-client-view__pickup-code-label">
                  Facture producteur :
                  <span className="order-client-view__pickup-code">{producerInvoice.numero}</span>
                </p>
                <p className="order-client-view__pickup-code-label">
                  Total TTC :{' '}
                  <span className="order-client-view__pickup-code">
                    {formatEurosFromCents(producerInvoice.totalTtcCents)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => handleInvoiceDownload(producerInvoice)}
                  className="order-client-view__purchase-button"
                  disabled={isInvoiceLoading}
                >
                  {producerInvoice.pdfPath ? 'Télecharger (PDF)' : 'PDF en cours de generation'}
                </button>
              </div>
            )}
            {shouldShowSupportCard && (
              <div className="order-client-view__support-card">
                <p className="order-client-view__support-title">En cas de problème</p>
                <p className="order-client-view__support-text">
                  Envoyez un mail à reclamation@partagetonpanier.fr en précisant :
                </p>
                <ul className="order-client-view__support-list">
                  <li>Le n° commande : {order.orderCode}</li>
                  {myParticipant?.pickupCode && <li>votre code de retrait : {myParticipant.pickupCode}</li>}
                  <li>Faites une description précise du problème</li>
                  <li>Ajoutez une photo si nécessaire</li>
                </ul>
              </div>
            )}

            {!canShowParticipants ? (
              <div className="order-client-view__participants-masked">
                {!isOwner && !isAuthenticated
                  ? 'Connectez-vous pour voir la liste des participants'
                  : 'Liste des participants masquée par le créateur de la commande'}
              </div>
            ) : participantsWithTotals.length === 0 ? (
              <div className="order-client-view__participants-empty">
                {isOwner ? 'Aucun participant pour le moment' : 'Liste des participants indisponible pour le moment'}
              </div>
            ) : (
              <>
                <div className="order-client-view__participants-table-wrapper">
                  <table className="order-client-view__participants-table">
                    <thead>
                      <tr>
                        {viewerVisibility.profile && <th>Participant</th>}
                        {viewerVisibility.content &&
                          products.map((product) => {
                            const unitLabel = (product.unit ?? '').trim();
                            const measurementLabel = getProductMeasurementLabel(product);
                            const showMeasurement =
                              Boolean(measurementLabel) &&
                              measurementLabel.toLowerCase() !== unitLabel.toLowerCase();
                            return (
                              <th key={product.id} style={{ minWidth: 120 }}>
                                <button
                                  type="button"
                                  className="order-client-view__participants-table-product order-client-view__participants-table-product-button"
                                  onClick={() => handleOpenProduct(product)}
                                  aria-label={`Voir le produit ${product.name}`}
                                >
                                  {product.name}
                                </button>
                                {unitLabel && (
                                  <span className="order-client-view__participants-table-unit">{unitLabel}</span>
                                )}
                                {showMeasurement && (
                                  <span className="order-client-view__participants-table-unit">
                                    {measurementLabel}
                                  </span>
                                )}
                              </th>
                            );
                          })}
                        {viewerVisibility.weight && (
                          <th className="order-client-view__participants-table-number">Poids</th>
                        )}
                        {viewerVisibility.amount && (
                          <th className="order-client-view__participants-table-number">Montant</th>
                        )}
                        {shouldShowPickupCodeColumn && (
                          <th className="order-client-view__participants-table-number">Code</th>
                        )}
                        {shouldShowInvoiceColumn && (
                          <th className="order-client-view__participants-table-number">Facture</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {participantsWithTotals.map((participant) => (
                        <tr key={participant.id}>
                          {viewerVisibility.profile && (
                            <td>
                              <div className="order-client-view__participant-cell">
                                <button
                                  type="button"
                                  className="order-client-view__participant-avatar"
                                  onClick={() => handleParticipantClick(participant)}
                                  aria-label={`Voir le profil de ${participant.name}`}
                                >
                                <Avatar
                                  supabaseClient={supabaseClient ?? null}
                                  path={participant.avatarPath ?? null}
                                  updatedAt={participant.avatarUpdatedAt ?? null}
                                  fallbackSrc={DEFAULT_PROFILE_AVATAR}
                                  alt={participant.name}
                                  className="w-full h-full object-cover"
                                />
                                </button>
                                <button
                                  type="button"
                                  className="order-client-view__participant-name"
                                  onClick={() => handleParticipantClick(participant)}
                                >
                                  {participant.name}
                                </button>
                              </div>
                            </td>
                          )}
                          {viewerVisibility.content &&
                            products.map((product) => {
                              const qty = participant.quantities[product.id] ?? 0;
                              return (
                                <td
                                  key={product.id}
                                  className={`order-client-view__participants-table-center ${
                                    qty === 0 ? 'order-client-view__participants-table-muted' : ''
                                  }`}
                                >
                                  {qty}
                                </td>
                              );
                            })}
                          {viewerVisibility.weight && (
                            <td className="order-client-view__participants-table-number">
                              {participant.totalWeight.toFixed(2)} kg
                            </td>
                          )}
                          {viewerVisibility.amount && (
                            <td className="order-client-view__participants-table-number">
                              {formatPrice(participant.totalAmount)}
                            </td>
                          )}
                          {shouldShowPickupCodeColumn && (
                            <td className="order-client-view__participants-table-number">
                              {participant.pickupCode ?? 'En attente'}
                            </td>
                          )}
                          {shouldShowInvoiceColumn && (
                            <td className="order-client-view__participants-table-number">
                              {participant.role === 'sharer' && !isLockedOrAfter ? (
                                <span className="order-client-view__participants-table-muted">Après clôture</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleParticipantInvoiceDownload(participant)}
                                  className="order-client-view__purchase-button"
                                  disabled={isInvoiceLoading}
                                >
                                  Télécharger
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {shouldShowTotals && (
                      <tfoot>
                        <tr className="order-client-view__participants-total-row">
                          {viewerVisibility.profile && (
                            <td className="order-client-view__participants-total-label">Total</td>
                          )}
                          {viewerVisibility.content &&
                            products.map((product, index) => {
                              const totals = productTotals[index];
                              const content =
                                totals.measurement === 'kg'
                                  ? `${totals.totalWeight.toFixed(2)} kg`
                                  : formatUnitsTotal(totals.totalUnits);
                              return (
                                <td key={product.id} className="order-client-view__participants-table-center">
                                  {content}
                                </td>
                              );
                            })}
                          {viewerVisibility.weight && (
                            <td className="order-client-view__participants-table-number">
                              {totalWeightAll.toFixed(2)} kg
                            </td>
                          )}
                          {viewerVisibility.amount && (
                            <td className="order-client-view__participants-table-number">
                              {formatPrice(totalAmountAll)}
                            </td>
                          )}
                          {shouldShowPickupCodeColumn && (
                            <td className="order-client-view__participants-table-number" />
                          )}
                          {shouldShowInvoiceColumn && (
                            <td className="order-client-view__participants-table-number" />
                          )}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {canShowPreview && (
                  <div className="order-client-view__participants-preview">
                    <p className="order-client-view__participants-preview-title">
                      Ce que les autres ont pris (aperçu)
                    </p>
                    {previewItems.length > 0 ? (
                      <ul className="order-client-view__participants-preview-list">
                        {previewItems.map((item) => (
                          <li key={item.id} className="order-client-view__participants-preview-item">
                            {item.label}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="order-client-view__participants-preview-fallback">{previewFallbackLabel}</p>
                    )}
                  </div>
                )}
              </>
            )}
            {isOwner && pendingParticipants.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#FFDCC4] bg-[#FFF7ED] p-4 text-sm space-y-3">
                <p className="font-semibold text-[#B45309]">Demandes en attente</p>
                {pendingParticipants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between gap-3">
                    <span className="text-[#92400E]">
                      {participant.profileName ?? 'Participant'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full bg-white border border-[#FF6B4A] text-[#FF6B4A] text-xs"
                        onClick={() => handleApproveParticipant(participant.id)}
                        disabled={isWorking}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full bg-white border border-gray-200 text-[#6B7280] text-xs"
                        onClick={() => handleRejectParticipant(participant.id)}
                        disabled={isWorking}
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
    </div>
  );
}

function OrderProductsCarousel({
  products,
  quantities,
  onDeltaQuantity,
  onDirectQuantity,
  unitPriceLabelsById,
  isSelectionLocked,
  onOpenProduct,
  onOpenProducer,
}: {
  products: Product[];
  quantities: Record<string, number>;
  onDeltaQuantity: (productId: string, delta: number) => void;
  onDirectQuantity: (productId: string, value: number) => void;
  unitPriceLabelsById: Record<string, string>;
  isSelectionLocked: boolean;
  onOpenProduct: (product: Product) => void;
  onOpenProducer: (product: Product) => void;
}) {
  const [startIndex, setStartIndex] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(MIN_VISIBLE_CARDS);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const computeVisible = React.useCallback((width: number) => {
    const available = Math.max(0, width - CONTAINER_SIDE_PADDING * 2 + CARD_GAP);
    const perCard = CARD_WIDTH + CARD_GAP;
    return Math.max(MIN_VISIBLE_CARDS, Math.floor(available / perCard) || 0);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width ?? el.clientWidth;
      const next = computeVisible(width);
      setVisibleCount((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [computeVisible]);

  React.useEffect(() => {
    const maxIndex = Math.max(0, products.length - visibleCount);
    setStartIndex((prev) => Math.min(prev, maxIndex));
  }, [products.length, visibleCount]);

  const useCarousel = products.length > visibleCount;
  const maxIndex = Math.max(0, products.length - visibleCount);

  const containerMinWidth =
    MIN_VISIBLE_CARDS * CARD_WIDTH +
    (MIN_VISIBLE_CARDS - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2;

  const containerStyle: React.CSSProperties = {
    minWidth: `${containerMinWidth}px`,
    width: '100%',
    paddingInline: CONTAINER_SIDE_PADDING,
    position: 'relative',
  };

  const productsToShow = useCarousel
    ? products.slice(startIndex, startIndex + visibleCount)
    : products;

  const canScrollLeft = useCarousel && startIndex > 0;
  const canScrollRight = useCarousel && startIndex < maxIndex;

  const goLeft = () => {
    if (!canScrollLeft) return;
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const goRight = () => {
    if (!canScrollRight) return;
    setStartIndex((prev) => Math.min(prev + 1, maxIndex));
  };

  return (
    <div className="relative" style={containerStyle} ref={containerRef}>
      <div
        className="flex gap-3"
        style={{ alignItems: 'stretch', justifyContent: useCarousel ? 'flex-start' : 'center' }}
      >
        {productsToShow.map((product) => {
          const quantity = quantities[product.id] ?? 0;
          return (
            <div
              key={product.id}
              style={{
                width: `${ORDER_CARD_WIDTH}px`,
                minWidth: `${ORDER_CARD_WIDTH}px`,
                flex: `0 0 ${ORDER_CARD_WIDTH}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <ProductResultCard
                product={product}
                related={[]}
                canSave={false}
                inDeck={false}
                onOpen={() => onOpenProduct(product)}
                onOpenProducer={() => onOpenProducer(product)}
                showSelectionControl={false}
                cardWidth={ORDER_CARD_WIDTH}
                compact
                priceLabelOverride={unitPriceLabelsById[product.id]}
              />
              <div className="w-full space-y-2" style={{ maxWidth: ORDER_CARD_WIDTH }}>
                {!isSelectionLocked && (
                  <p className="text-[12px] text-[#6B7280] text-center">
                    {formatProductWeightLabelForSelection(product)}
                  </p>
                )}
                {!isSelectionLocked && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDeltaQuantity(product.id, -1)}
                      className="order-client-view__quantity-button order-client-view__quantity-button--decrement"
                      aria-label={`Retirer une carte de ${product.name}`}
                      disabled={isSelectionLocked}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={quantity}
                      onChange={(e) => {
                        const value = Math.max(0, Number(e.target.value) || 0);
                        onDirectQuantity(product.id, value);
                      }}
                      className="w-20 text-center border border-gray-200 rounded-lg py-2 focus:outline-none focus:border-[#FF6B4A]"
                      aria-label={`Quantite pour ${product.name}`}
                      disabled={isSelectionLocked}
                    />
                    <button
                      type="button"
                      onClick={() => onDeltaQuantity(product.id, 1)}
                      className="order-client-view__quantity-button order-client-view__quantity-button--increment"
                      aria-label={`Ajouter une carte de ${product.name}`}
                      disabled={isSelectionLocked}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={goLeft}
          aria-label="Défiler vers la gauche"
          className="order-client-view__carousel-button order-client-view__carousel-button--left"
        >
          <ChevronLeft className="w-4 h-4 text-[#FF6B4A] mx-auto" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={goRight}
          aria-label="Défiler vers la droite"
          className="order-client-view__carousel-button order-client-view__carousel-button--right"
        >
          <ChevronRight className="w-4 h-4 text-[#FF6B4A] mx-auto" />
        </button>
      )}
    </div>
  );
}




















