import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DeckCard, DeliveryDay, DeliveryLeadType, User } from '../types';
import { Calendar, MapPin, Package, Percent, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD_WIDTH, CARD_HEIGHT, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../constants/cards';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProductResultCard } from './ProductsLanding';
import { eurosToCents, formatEurosFromCents } from '../lib/money';
import { toast } from 'sonner';
import { createOrder } from '../services/orders';
import { DEMO_MODE } from '../data/productsProvider';

interface CreateOrderFormProps {
  products: DeckCard[];
  onCreateOrder?: (order: any) => void;
  preselectedProductIds?: string[];
  onCancel?: () => void;
  user?: User | null;
  producer?: User | null;
}

type PickupSlot = {
  day?: string;
  date?: string;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
};

const defaultSlots: PickupSlot[] = [
  { day: 'monday', label: 'Lundi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'tuesday', label: 'Mardi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'wednesday', label: 'Mercredi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'thursday', label: 'Jeudi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'friday', label: 'Vendredi', enabled: true, start: '17:30', end: '19:30' },
  { day: 'saturday', label: 'Samedi', enabled: true, start: '10:00', end: '12:00' },
  { day: 'sunday', label: 'Dimanche', enabled: false, start: '10:00', end: '12:00' },
];

type DeliveryOption = 'chronofresh' | 'producer_delivery' | 'producer_pickup';

const deliveryOptions: Array<{ id: DeliveryOption; title: string; description: string }> = [
  {
    id: 'chronofresh',
    title: 'Option 1 - Expedition Chronofresh',
    description: "Le site gère l'expedition via chronofresh. Pratique si le producteur est loin.",
  },
  {
    id: 'producer_delivery',
    title: 'Option 2 - Livraison par le producteur',
    description: 'Si cette option vous est proposée, le producteur livre dans votre zone.',
  },
  {
    id: 'producer_pickup',
    title: 'Option 3 - Collecter vous-même les produits',
    description: 'Vous allez chercher les produits chez le producteur (pas de frais de livraison).',
  },
];

const deliveryDayLabels: Record<DeliveryDay, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

type OpeningHourSlot = { start: string; end: string };

const normalizeOpeningHoursDayKey = (day: string): DeliveryDay | null => {
  const normalized = day.trim().toLowerCase();
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(deliveryDayLabels, normalized)) {
    return normalized as DeliveryDay;
  }
  const match = (Object.entries(deliveryDayLabels) as Array<[DeliveryDay, string]>).find(
    ([, label]) => label.toLowerCase() === normalized
  );
  return match ? match[0] : null;
};

const parseTimeSegment = (segment?: string) => {
  if (!segment) return '';
  const trimmed = segment.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/(\d{1,2})(?:(?:[:hH])(\d{1,2}))?/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return '';
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseOpeningHoursEntry = (value?: string): OpeningHourSlot => {
  if (!value) return { start: '', end: '' };
  const [startSegment, endSegment] = value.split('-');
  return {
    start: parseTimeSegment(startSegment),
    end: parseTimeSegment(endSegment),
  };
};

const buildOpeningHoursByDay = (openingHours?: Record<string, string>) => {
  const result: Partial<Record<DeliveryDay, OpeningHourSlot>> = {};
  if (!openingHours) return result;
  Object.entries(openingHours).forEach(([day, value]) => {
    const normalizedDay = normalizeOpeningHoursDayKey(day);
    if (!normalizedDay) return;
    const parsed = parseOpeningHoursEntry(value);
    if (!parsed.start && !parsed.end) return;
    result[normalizedDay] = parsed;
  });
  return result;
};

const buildPickupSlotsFromOpeningHours = (openingHours?: Record<string, string>) => {
  const openingByDay = buildOpeningHoursByDay(openingHours);
  const hasOpeningHours = Object.keys(openingByDay).length > 0;
  return defaultSlots.map((slot) => {
    if (!slot.day) return slot;
    if (!hasOpeningHours) {
      return { ...slot, enabled: false };
    }
    const openingSlot = openingByDay[slot.day as DeliveryDay];
    if (!openingSlot) {
      return { ...slot, enabled: false };
    }
    return {
      ...slot,
      enabled: true,
      start: openingSlot.start,
      end: openingSlot.end,
    };
  });
};

const hasActiveLot = (product: DeckCard) => Boolean(product.activeLotCode ?? product.activeLotId);
const hasValidLotPrice = (product: DeckCard) =>
  DEMO_MODE ? Number(product.price) > 0 : hasActiveLot(product) && Number(product.price) > 0;

const deliveryDayIndexMap: Record<DeliveryDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const deliveryDayIndexToKey: Record<number, DeliveryDay> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const DELIVERY_GEOCODE_CACHE_KEY = 'delivery-geocode-cache';
const DELIVERY_GEOCODE_CACHE_LIMIT = 50;
const DELIVERY_GEOCODE_DEBOUNCE_MS = 650;

function getProductWeightKg(product: DeckCard) {
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

type GeoPoint = { lat: number; lng: number };

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceKm = (from: GeoPoint, to: GeoPoint) => {
  const earthRadius = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
};

export function CreateOrderForm({
  products,
  preselectedProductIds,
  onCreateOrder,
  onCancel,
  user,
  producer,
}: CreateOrderFormProps) {
  const navigate = useNavigate();
  const [selectedProducts, setSelectedProducts] = React.useState<string[]>(preselectedProductIds ?? []);
  const [title, setTitle] = React.useState('');
  const [visibility, setVisibility] = React.useState<'public' | 'private'>('public');
  const [sharerPercentage, setSharerPercentage] = React.useState(5);
  const [autoApproveParticipationRequests, setAutoApproveParticipationRequests] = React.useState(true);
  const [allowSharerMessages, setAllowSharerMessages] = React.useState(true);
  const [autoApprovePickupSlots, setAutoApprovePickupSlots] = React.useState(true);
  const [minWeight, setMinWeight] = React.useState(5);
  const [maxWeight, setMaxWeight] = React.useState(20);
  const [deadline, setDeadline] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [shareMode, setShareMode] = React.useState<'products' | 'cash'>('products');
  const [shareQuantities, setShareQuantities] = React.useState<Record<string, number>>({});
  const [deliveryStreet, setDeliveryStreet] = React.useState('');
  const [deliveryInfo, setDeliveryInfo] = React.useState('');
  const [deliveryCity, setDeliveryCity] = React.useState('');
  const [deliveryPostcode, setDeliveryPostcode] = React.useState('');
  const [deliveryOption, setDeliveryOption] = React.useState<DeliveryOption>('chronofresh');
  const [pickupDeliveryFee, setPickupDeliveryFee] = React.useState(0);
  const [useSamePickupAddress, setUseSamePickupAddress] = React.useState(true);
  const [usePickupDate, setUsePickupDate] = React.useState(false);
  const [pickupDate, setPickupDate] = React.useState('');
  const [pickupStreet, setPickupStreet] = React.useState('');
  const [pickupInfo, setPickupInfo] = React.useState('');
  const [pickupCity, setPickupCity] = React.useState('');
  const [pickupPostcode, setPickupPostcode] = React.useState('');
  const [pickupSlots, setPickupSlots] = React.useState<PickupSlot[]>(() =>
    buildPickupSlotsFromOpeningHours(user?.openingHours)
  );
  const [pickupWindowWeeks, setPickupWindowWeeks] = React.useState(2);
  const [pickupDateSlots, setPickupDateSlots] = React.useState<PickupSlot[]>([]);
  const [deliveryGeoStatus, setDeliveryGeoStatus] = React.useState<'idle' | 'loading' | 'resolved' | 'error'>('idle');
  const [deliveryGeoCoords, setDeliveryGeoCoords] = React.useState<GeoPoint | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const geocodeCacheRef = React.useRef<Map<string, GeoPoint>>(new Map());
  const pickupSlotsTouchedRef = React.useRef(false);
  const pickupDateSlotsTouchedRef = React.useRef(false);

  const producerLegal = producer?.legalEntity;
  const deliveryOptionConfig = React.useMemo(
    () => ({
      chronofresh: {
        enabled: Boolean(producerLegal?.chronofreshEnabled),
        minWeight: producerLegal?.chronofreshMinWeight,
        maxWeight: producerLegal?.chronofreshMaxWeight,
        days: [] as DeliveryDay[],
      },
      producer_delivery: {
        enabled: Boolean(producerLegal?.producerDeliveryEnabled),
        minWeight: producerLegal?.producerDeliveryMinWeight,
        maxWeight: producerLegal?.producerDeliveryMaxWeight,
        days: producerLegal?.producerDeliveryDays ?? [],
      },
      producer_pickup: {
        enabled: Boolean(producerLegal?.producerPickupEnabled),
        minWeight: producerLegal?.producerPickupMinWeight,
        maxWeight: producerLegal?.producerPickupMaxWeight,
        days: producerLegal?.producerPickupDays ?? [],
      },
    }),
    [producerLegal]
  );

  const isDeliveryAddressComplete = Boolean(
    deliveryStreet.trim() && deliveryPostcode.trim() && deliveryCity.trim()
  );
  const deliveryAddressQuery = React.useMemo(() => {
    const parts = [deliveryStreet, deliveryInfo, deliveryPostcode, deliveryCity]
      .map((value) => value.trim())
      .filter(Boolean);
    return parts.join(', ');
  }, [deliveryCity, deliveryInfo, deliveryPostcode, deliveryStreet]);
  const openingHoursByDay = React.useMemo(
    () => buildOpeningHoursByDay(user?.openingHours),
    [user?.openingHours]
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(DELIVERY_GEOCODE_CACHE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Record<string, GeoPoint>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (Number.isFinite(value?.lat) && Number.isFinite(value?.lng)) {
          geocodeCacheRef.current.set(key, { lat: Number(value.lat), lng: Number(value.lng) });
        }
      });
    } catch {
      // ignore cache parse errors
    }
  }, []);

  const readGeocodeCache = React.useCallback((key: string) => geocodeCacheRef.current.get(key), []);
  const writeGeocodeCache = React.useCallback((key: string, coords: GeoPoint) => {
    const cache = geocodeCacheRef.current;
    cache.set(key, coords);
    if (cache.size > DELIVERY_GEOCODE_CACHE_LIMIT) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    if (typeof window === 'undefined') return;
    try {
      const payload = Object.fromEntries(cache.entries());
      window.localStorage.setItem(DELIVERY_GEOCODE_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, []);

  React.useEffect(() => {
    if (!user) return;
    setDeliveryStreet((prev) => {
      if (prev.trim()) return prev;
      const next = user.address?.trim();
      return next ? next : prev;
    });
    setDeliveryInfo((prev) => {
      if (prev.trim()) return prev;
      const next = user.addressDetails?.trim();
      return next ? next : prev;
    });
    setDeliveryCity((prev) => {
      if (prev.trim()) return prev;
      const next = user.city?.trim();
      return next ? next : prev;
    });
    setDeliveryPostcode((prev) => {
      if (prev.trim()) return prev;
      const next = user.postcode?.trim();
      return next ? next : prev;
    });
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    if (pickupSlotsTouchedRef.current) return;
    setPickupSlots(buildPickupSlotsFromOpeningHours(user.openingHours));
  }, [user?.id, user?.openingHours]);

  const deliveryProfileCoords = React.useMemo(() => {
    const lat = user?.addressLat;
    const lng = user?.addressLng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: Number(lat), lng: Number(lng) };
    }
    return null;
  }, [user?.addressLat, user?.addressLng]);
  const isDeliveryAddressFromProfile = React.useMemo(() => {
    if (!user) return false;
    const norm = (value?: string | null) => (value ?? '').trim().toLowerCase();
    return (
      norm(deliveryStreet) === norm(user.address) &&
      norm(deliveryCity) === norm(user.city) &&
      norm(deliveryPostcode) === norm(user.postcode) &&
      norm(deliveryInfo) === norm(user.addressDetails ?? '')
    );
  }, [deliveryCity, deliveryInfo, deliveryPostcode, deliveryStreet, user]);

  const producerCoords = React.useMemo(() => {
    const lat = producer?.addressLat;
    const lng = producer?.addressLng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: Number(lat), lng: Number(lng) };
    }
    return null;
  }, [producer?.addressLat, producer?.addressLng]);

  const normalizedProducerDeliveryRadiusKm = Number.isFinite(producerLegal?.producerDeliveryRadiusKm ?? NaN)
    ? Math.max(0, producerLegal?.producerDeliveryRadiusKm ?? 0)
    : 0;
  const shouldCheckDeliveryZone = Boolean(producerLegal?.producerDeliveryEnabled);

  const deliveryDistanceKm = React.useMemo(() => {
    if (!producerCoords || !deliveryGeoCoords) return null;
    return distanceKm(producerCoords, deliveryGeoCoords);
  }, [producerCoords, deliveryGeoCoords]);

  const deliveryZoneInfo = React.useMemo(() => {
    if (!shouldCheckDeliveryZone) return { within: true, reason: undefined };
    if (normalizedProducerDeliveryRadiusKm <= 0) {
      return { within: false, reason: 'Zone de livraison non definie.' };
    }
    if (!producerCoords) {
      return { within: false, reason: 'Adresse producteur manquante.' };
    }
    if (!isDeliveryAddressComplete) {
      return { within: false, reason: 'Adresse de livraison incomplete.' };
    }
    if (deliveryGeoStatus === 'loading' || deliveryGeoStatus === 'idle') {
      return { within: false, reason: "Verification de l'adresse en cours." };
    }
    if (deliveryGeoStatus === 'error' || !deliveryGeoCoords) {
      return { within: false, reason: 'Adresse de livraison introuvable.' };
    }
    if (deliveryDistanceKm === null) {
      return { within: false, reason: 'Zone de livraison non verifiee.' };
    }
    if (deliveryDistanceKm <= normalizedProducerDeliveryRadiusKm) {
      return { within: true, reason: undefined };
    }
    return {
      within: false,
      reason: `Adresse hors zone (${deliveryDistanceKm.toFixed(1)} km > ${normalizedProducerDeliveryRadiusKm} km).`,
    };
  }, [
    deliveryDistanceKm,
    deliveryGeoCoords,
    deliveryGeoStatus,
    isDeliveryAddressComplete,
    normalizedProducerDeliveryRadiusKm,
    producerCoords,
    shouldCheckDeliveryZone,
  ]);

  const selectedProductsData = products.filter((p) => selectedProducts.includes(p.id));
  const deliveryOptionStates = React.useMemo(() => {
    const orderMinWeight = Number.isFinite(minWeight) ? minWeight : 0;
    const orderMaxWeight = Number.isFinite(maxWeight) ? maxWeight : 0;

    const resolveWeightMatch = (minLimit?: number, maxLimit?: number) => {
      const minReq = Number.isFinite(minLimit ?? NaN) ? (minLimit ?? 0) : 0;
      const maxReq = Number.isFinite(maxLimit ?? NaN) ? (maxLimit ?? 0) : 0;

      if (minReq > 0 && orderMinWeight < minReq) {
        return { ok: false, reason: `Poids min requis: ${minReq} kg.` };
      }
      if (maxReq > 0 && orderMinWeight > maxReq) {
        return { ok: false, reason: `Poids min doit etre <= ${maxReq} kg.` };
      }
      if (maxReq > 0) {
        if (orderMaxWeight <= 0) {
          return { ok: false, reason: `Definissez un poids max <= ${maxReq} kg.` };
        }
        if (orderMaxWeight > maxReq) {
          return { ok: false, reason: `Poids max autorise: ${maxReq} kg.` };
        }
      }
      return { ok: true };
    };

    return deliveryOptions.reduce((acc, option) => {
      const optionConfig = deliveryOptionConfig[option.id];
      const authorized = optionConfig?.enabled ?? true;
      let eligible = authorized;
      let reason: string | undefined;
      if (!authorized) {
        reason = 'Non propose par le producteur.';
      } else {
        const weightCheck = resolveWeightMatch(optionConfig?.minWeight, optionConfig?.maxWeight);
        if (!weightCheck.ok) {
          eligible = false;
          reason = weightCheck.reason;
        } else if (option.id === 'producer_delivery' && !deliveryZoneInfo.within) {
          eligible = false;
          reason = deliveryZoneInfo.reason ?? 'Adresse hors zone.';
        }
      }
      acc[option.id] = { eligible, reason };
      return acc;
    }, {} as Record<DeliveryOption, { eligible: boolean; reason?: string }>);
  }, [deliveryOptionConfig, deliveryZoneInfo, maxWeight, minWeight]);

  const producerEnabledDeliveryOptions = deliveryOptions.filter(
    (option) => deliveryOptionConfig[option.id]?.enabled
  );
  const enabledDeliveryOptions = producerEnabledDeliveryOptions.filter(
    (option) => deliveryOptionStates[option.id]?.eligible
  );
  const activeDeliveryConfig = deliveryOptionConfig[deliveryOption] ?? deliveryOptionConfig.chronofresh;
  const minWeightLimit = activeDeliveryConfig?.minWeight ?? 0;
  const maxWeightLimit = activeDeliveryConfig?.maxWeight ?? 0;
  const clampWeightToRange = (value: number, minLimit: number, maxLimit: number) => {
    let next = Number.isFinite(value) ? value : 0;
    if (minLimit > 0) next = Math.max(next, minLimit);
    if (maxLimit > 0) next = Math.min(next, maxLimit);
    return next;
  };
  const normalizedMinWeight = clampWeightToRange(minWeight, minWeightLimit, maxWeightLimit);
  const normalizedMaxWeight = clampWeightToRange(maxWeight, minWeightLimit, maxWeightLimit);
  const fallbackLeadType: DeliveryLeadType =
    producerLegal?.deliveryLeadType ?? (producerLegal?.deliveryFixedDay ? 'fixed_day' : 'days');
  const fallbackLeadDays = producerLegal?.deliveryLeadDays ?? 5;
  const fallbackLeadFixedDay = producerLegal?.deliveryFixedDay ?? 'monday';
  const minWeightInputMin = minWeightLimit > 0 ? minWeightLimit : 0;
  const minWeightInputMax = maxWeightLimit > 0 ? maxWeightLimit : undefined;
  const maxWeightInputMin = Math.max(minWeightInputMin, normalizedMinWeight || 0);
  const maxWeightInputMax = maxWeightLimit > 0 ? maxWeightLimit : undefined;
  const formatWeightRange = (minLimit?: number, maxLimit?: number) => {
    if (minLimit && maxLimit) return `${minLimit} kg - ${maxLimit} kg`;
    if (minLimit) return `min ${minLimit} kg`;
    if (maxLimit) return `max ${maxLimit} kg`;
    return 'Aucun seuil';
  };
  const formatDaysList = (days?: DeliveryDay[]) => {
    if (!days || days.length === 0) return 'Jours à définir';
    return days.map((day) => deliveryDayLabels[day]).join(', ');
  };
  const getNextDateForDays = (baseDate: Date, days?: DeliveryDay[]) => {
    if (!days || days.length === 0) return null;
    const current = baseDate.getDay();
    let minDelta: number | null = null;
    Array.from(new Set(days)).forEach((day) => {
      const target = deliveryDayIndexMap[day];
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      if (minDelta === null || delta < minDelta) minDelta = delta;
    });
    if (minDelta === null) return null;
    const next = new Date(baseDate);
    next.setDate(next.getDate() + minDelta);
    return next;
  };
  const pickupHoursLabel =
    producerLegal?.producerPickupStartTime && producerLegal?.producerPickupEndTime
      ? `${producerLegal.producerPickupStartTime} - ${producerLegal.producerPickupEndTime}`
      : 'Horaires à définir';
  const deliveryRuleLabel = (() => {
    if (deliveryOption === 'producer_delivery') {
      return producerLegal?.producerDeliveryDays?.length
        ? `Livraison producteur: ${formatDaysList(producerLegal.producerDeliveryDays)}`
        : 'Jours de livraison à définir';
    }
    if (deliveryOption === 'producer_pickup') {
      if (producerLegal?.producerPickupDays?.length) {
        return `Retrait producteur: ${formatDaysList(producerLegal.producerPickupDays)} (${pickupHoursLabel})`;
      }
      return `Retrait producteur: ${pickupHoursLabel}`;
    }
    if (deliveryOption === 'chronofresh') {
      if (fallbackLeadType === 'fixed_day') {
        return `Jour fixe: ${deliveryDayLabels[fallbackLeadFixedDay]}`;
      }
      return `J+${fallbackLeadDays}`;
    }
    return 'A definir';
  })();
  const toDateKey = React.useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const getOpeningSlotForDate = React.useCallback(
    (date: Date) => {
      const dayKey = deliveryDayIndexToKey[date.getDay()];
      return dayKey ? openingHoursByDay[dayKey] : undefined;
    },
    [openingHoursByDay]
  );
  const buildPickupDateSlots = React.useCallback(
    (start: Date, end: Date, previous: PickupSlot[]) => {
      const next: PickupSlot[] = [];
      const previousByDate = new Map<string, PickupSlot>();
      previous.forEach((slot) => {
        if (slot.date) previousByDate.set(slot.date, slot);
      });
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (current <= last) {
        const key = toDateKey(current);
        const existing = previousByDate.get(key);
        const openingSlot = getOpeningSlotForDate(current);
        const defaultEnabled = Boolean(openingSlot);
        const defaultStart = openingSlot ? openingSlot.start : '17:00';
        const defaultEnd = openingSlot ? openingSlot.end : '19:00';
        const shouldKeepExisting = pickupDateSlotsTouchedRef.current && existing;
        next.push({
          date: key,
          label: current.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' }),
          enabled: shouldKeepExisting ? existing.enabled : defaultEnabled,
          start: shouldKeepExisting ? existing.start : defaultStart,
          end: shouldKeepExisting ? existing.end : defaultEnd,
        });
        current.setDate(current.getDate() + 1);
      }
      return next;
    },
    [getOpeningSlotForDate, toDateKey]
  );

  const totalWeightProducts = selectedProductsData.reduce((sum, p) => sum + (p.weightKg ?? 1), 0);
  const safeMinWeight = Math.max(0, normalizedMinWeight);
  const safeMaxWeight = Math.max(0, normalizedMaxWeight);
  const effectiveWeight =
    safeMaxWeight > 0
      ? Math.min(Math.max(totalWeightProducts, safeMinWeight), safeMaxWeight)
      : Math.max(totalWeightProducts, safeMinWeight);
  const completeWeight = safeMaxWeight > 0 ? safeMaxWeight : effectiveWeight;
  const pricePerKgCandidates = selectedProductsData
    .map((p) => {
      if (p.measurement === 'kg') return p.price;
      const unitWeight = p.weightKg ?? 1;
      return unitWeight > 0 ? p.price / unitWeight : p.price;
    })
    .filter((price) => Number.isFinite(price) && price > 0);
  const minPricePerKg = pricePerKgCandidates.length > 0 ? Math.min(...pricePerKgCandidates) : 0;
  const maxPricePerKg = pricePerKgCandidates.length > 0 ? Math.max(...pricePerKgCandidates) : 0;
  const shareFraction = Math.min(Math.max(sharerPercentage / 100, 0), 0.8);

  const logisticCostByWeight = (weightKg: number) => {
    if (!weightKg || weightKg <= 0) return 0;
    const raw = 7 + 8 * Math.sqrt(weightKg);
    return Math.max(15, 5 * Math.round(raw / 5));
  };

  const normalizedProducerDeliveryFee = Number.isFinite(producerLegal?.producerDeliveryFee ?? NaN)
    ? Math.max(0, producerLegal?.producerDeliveryFee ?? 0)
    : 0;
  const normalizedPickupDeliveryFee = Number.isFinite(pickupDeliveryFee) ? Math.max(0, pickupDeliveryFee) : 0;
  const resolveDeliveryFee = (weightKg: number) => {
    if (deliveryOption === 'producer_delivery') return normalizedProducerDeliveryFee;
    if (deliveryOption === 'producer_pickup') return normalizedPickupDeliveryFee;
    return logisticCostByWeight(weightKg);
  };

  const logTotal = effectiveWeight > 0 ? resolveDeliveryFee(effectiveWeight) : 0;
  const logPerKg = effectiveWeight > 0 ? logTotal / effectiveWeight : 0;
  const logPerKgComplete = completeWeight > 0 ? resolveDeliveryFee(completeWeight) / completeWeight : 0;
  const minShareWeight = safeMinWeight > 0 ? safeMinWeight : effectiveWeight;
  const maxShareWeight = safeMaxWeight > 0 ? safeMaxWeight : completeWeight;
  const logPerKgAtMin = minShareWeight > 0 ? resolveDeliveryFee(minShareWeight) / minShareWeight : 0;
  const logPerKgAtMax = maxShareWeight > 0 ? resolveDeliveryFee(maxShareWeight) / maxShareWeight : 0;
  const estimatedDeliveryDate = React.useMemo(() => {
    if (!deadline) return null;
    const baseDate = new Date(deadline);
    if (Number.isNaN(baseDate.getTime())) return null;

    if (deliveryOption === 'producer_delivery') {
      return getNextDateForDays(baseDate, producerLegal?.producerDeliveryDays);
    }

    if (deliveryOption === 'producer_pickup') {
      return getNextDateForDays(baseDate, producerLegal?.producerPickupDays);
    }

    if (deliveryOption === 'chronofresh') {
      if (fallbackLeadType === 'fixed_day') {
        return getNextDateForDays(baseDate, [fallbackLeadFixedDay]);
      }

      const next = new Date(baseDate);
      next.setDate(next.getDate() + Math.max(0, fallbackLeadDays));
      return next;
    }

    return null;
  }, [
    deadline,
    deliveryOption,
    fallbackLeadDays,
    fallbackLeadFixedDay,
    fallbackLeadType,
    getNextDateForDays,
    producerLegal?.producerDeliveryDays,
    producerLegal?.producerPickupDays,
  ]);

  const pickupWindowRange = React.useMemo(() => {
    if (!estimatedDeliveryDate) return null;
    const start = new Date(
      estimatedDeliveryDate.getFullYear(),
      estimatedDeliveryDate.getMonth(),
      estimatedDeliveryDate.getDate()
    );
    const end = new Date(start);
    end.setDate(end.getDate() + pickupWindowWeeks * 7);
    return { start, end };
  }, [estimatedDeliveryDate, pickupWindowWeeks]);
  const pickupWindowLabel = pickupWindowRange
    ? `${pickupWindowRange.start.toLocaleDateString('fr-FR')} - ${pickupWindowRange.end.toLocaleDateString('fr-FR')}`
    : 'A definir';
  const pickupWindowStart = pickupWindowRange?.start.getTime() ?? null;
  const pickupWindowEnd = pickupWindowRange?.end.getTime() ?? null;

  const perProductRows = selectedProductsData.map((p) => {
    const hasPrice = hasValidLotPrice(p);
    const weight = p.weightKg ?? 1;
    const logPerUnit = logPerKg * weight;
    const basePlusLog = p.price + logPerUnit;
    const participantPrice = basePlusLog * (shareFraction > 0 ? 1 / (1 - shareFraction) : 1);
    const sharePerUnit = participantPrice - basePlusLog;
    const logPerUnitAtMin = logPerKgAtMin * weight;
    const basePlusLogAtMin = p.price + logPerUnitAtMin;
    const participantPriceAtMin = basePlusLogAtMin * (shareFraction > 0 ? 1 / (1 - shareFraction) : 1);
    const logPerUnitComplete = logPerKgComplete * weight;
    const basePlusLogComplete = p.price + logPerUnitComplete;
    const participantPriceComplete =
      basePlusLogComplete * (shareFraction > 0 ? 1 / (1 - shareFraction) : 1);
    const priceType = p.measurement === 'kg' ? 'Au kilo' : 'À la pièce';

    return {
      id: p.id,
      name: p.name,
      basePrice: p.price,
      logPerUnit,
      sharePerUnit,
      participantPrice,
      participantPriceAtMin,
      participantPriceComplete,
      priceType,
      hasPrice,
    };
  });

  const sharePriceLabels = perProductRows.reduce((acc, row) => {
    if (!row.hasPrice) return acc;
    acc[row.id] = formatEurosFromCents(eurosToCents(row.participantPriceAtMin));
    return acc;
  }, {} as Record<string, string>);
  const shareTotalValue = perProductRows.reduce((sum, row) => {
    const qty = shareQuantities[row.id] ?? 0;
    return sum + row.participantPriceAtMin * qty;
  }, 0);
  const shareTotalLabel = formatEurosFromCents(eurosToCents(shareTotalValue));

  const totalShareBase = perProductRows.reduce((sum, r) => sum + r.sharePerUnit, 0);
  const weightScale = totalWeightProducts > 0 ? effectiveWeight / totalWeightProducts : 1;
  const totalShareEffective = totalShareBase * weightScale;
  const shareMultiplier = shareFraction > 0 ? shareFraction / (1 - shareFraction) : 0;
  const minShareAtThreshold =
    minShareWeight > 0 ? (minPricePerKg + logPerKgAtMin) * shareMultiplier * minShareWeight : 0;
  const maxShareAtThreshold =
    maxShareWeight > 0 ? (maxPricePerKg + logPerKgAtMax) * shareMultiplier * maxShareWeight : 0;
  const summaryRows = [
    {
      key: 'priceType',
      label: 'Type prix',
      className: 'is-center',
      render: (row: (typeof perProductRows)[number]) => row.priceType,
    },
    {
      key: 'basePrice',
      label: 'Prix de base',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) =>
        formatEurosFromCents(eurosToCents(row.basePrice)),
    },
    {
      key: 'logPerUnit',
      label: 'Livraison',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) =>
        formatEurosFromCents(eurosToCents(row.logPerUnit)),
    },
    {
      key: 'sharePerUnit',
      label: 'Partageur',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) =>
        formatEurosFromCents(eurosToCents(row.sharePerUnit)),
    },
      {
        key: 'participantPrice',
        label: 'Prix final au poids minimum',
        className: 'is-right',
        render: (row: (typeof perProductRows)[number]) =>
          formatEurosFromCents(eurosToCents(row.participantPriceAtMin)),
      },
    {
      key: 'participantPriceComplete',
      label: 'Prix final au poids maximum',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) =>
        formatEurosFromCents(eurosToCents(row.participantPriceComplete)),
    },
  ];

  const deliveryAddress = [deliveryStreet, deliveryInfo, [deliveryPostcode, deliveryCity].filter(Boolean).join(' ') || undefined]
    .filter(Boolean)
    .join(', ');
  const pickupAddress = useSamePickupAddress
    ? deliveryAddress
    : [pickupStreet, pickupInfo, [pickupPostcode, pickupCity].filter(Boolean).join(' ') || undefined]
        .filter(Boolean)
        .join(', ');
  const deliveryCoords = deliveryGeoCoords;
  const deliveryLat = deliveryCoords?.lat ?? null;
  const deliveryLng = deliveryCoords?.lng ?? null;
  const pickupLat = useSamePickupAddress ? deliveryLat : null;
  const pickupLng = useSamePickupAddress ? deliveryLng : null;
  const selectedDeliveryOption = deliveryOptions.find((option) => option.id === deliveryOption);
  const selectedDeliveryOptionState = deliveryOptionStates[deliveryOption];
  const isDeliveryOptionValid = selectedDeliveryOptionState?.eligible ?? true;

  const groupedByProducer = products.reduce((acc, card) => {
    const producerId = card.producerId;
    if (!acc[producerId]) {
      acc[producerId] = {
        producerName: card.producerName,
        products: [],
      };
    }
    acc[producerId].products.push(card);
    return acc;
  }, {} as Record<string, { producerName: string; products: DeckCard[] }>);

  const canReceiveCashShare = user?.accountType ? user.accountType !== 'individual' : false;

  const participantOptionBaseClass =
    'flex-1 min-w-[160px] px-4 py-2 rounded-full border-2 text-sm font-semibold transition-colors';

  const optionButtonClass = (active: boolean) =>
    `${participantOptionBaseClass} ${
      active
        ? 'border-[#28C1A5] bg-[#28C1A5]/10 text-[#0F5132]'
        : 'border-gray-200 text-[#1F2937] hover:border-[#FF6B4A]'
    }`;

  const visibilityButtonClass = (option: 'public' | 'private') => {
    const baseActiveClass =
      option === 'public'
        ? 'border-[#28C1A5] bg-[#28C1A5]/10 text-[#0F5132]'
        : 'border-[#FF6B4A] bg-[#FF6B4A]/10 text-[#B45309]';

    return `${participantOptionBaseClass} ${
      visibility === option ? baseActiveClass : 'border-gray-200 text-[#1F2937] hover:border-[#FFD166]'
    }`;
  };

  React.useEffect(() => {
    if (preselectedProductIds && preselectedProductIds.length > 0) {
      setSelectedProducts((prev) => {
        const validPrev = prev.filter((id) => products.some((p) => p.id === id));
        const next = [...preselectedProductIds, ...validPrev];
        return Array.from(new Set(next));
      });
    } else {
      setSelectedProducts((prev) => prev.filter((id) => products.some((p) => p.id === id)));
    }
  }, [preselectedProductIds, products]);

  React.useEffect(() => {
    setShareQuantities((prev) => {
      const next: Record<string, number> = {};
      selectedProducts.forEach((id) => {
        const value = prev[id] ?? 0;
        next[id] = Math.max(0, Number(value) || 0);
      });
      return next;
    });
  }, [selectedProducts]);

  React.useEffect(() => {
    if (!canReceiveCashShare && shareMode === 'cash') {
      setShareMode('products');
    }
  }, [canReceiveCashShare, shareMode]);

  React.useEffect(() => {
    if (!isDeliveryAddressComplete) {
      setDeliveryGeoCoords(null);
      setDeliveryGeoStatus('idle');
      return;
    }
    if (isDeliveryAddressFromProfile) {
      if (!deliveryProfileCoords) {
        setDeliveryGeoCoords(null);
        setDeliveryGeoStatus('error');
        return;
      }
      setDeliveryGeoCoords(deliveryProfileCoords);
      setDeliveryGeoStatus('resolved');
      return;
    }

    const cacheKey = deliveryAddressQuery.trim().toLowerCase();
    const cached = cacheKey ? readGeocodeCache(cacheKey) : undefined;
    if (cached) {
      setDeliveryGeoCoords(cached);
      setDeliveryGeoStatus('resolved');
      return;
    }

    setDeliveryGeoCoords(null);
    setDeliveryGeoStatus('loading');
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const encoded = encodeURIComponent(deliveryAddressQuery);
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encoded}&limit=1`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          const coords = (data?.features?.[0]?.geometry?.coordinates ?? []) as [number, number];
          const lng = Number(coords?.[0]);
          const lat = Number(coords?.[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const next = { lat, lng };
            setDeliveryGeoCoords(next);
            setDeliveryGeoStatus('resolved');
            if (cacheKey) writeGeocodeCache(cacheKey, next);
          } else {
            setDeliveryGeoCoords(null);
            setDeliveryGeoStatus('error');
          }
        })
        .catch(() => {
          if (!active) return;
          setDeliveryGeoCoords(null);
          setDeliveryGeoStatus('error');
        });
    }, DELIVERY_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    deliveryAddressQuery,
    deliveryProfileCoords,
    isDeliveryAddressComplete,
    isDeliveryAddressFromProfile,
    readGeocodeCache,
    writeGeocodeCache,
  ]);

  React.useEffect(() => {
    if (enabledDeliveryOptions.length === 0) return;
    if (!deliveryOptionStates[deliveryOption]?.eligible) {
      setDeliveryOption(enabledDeliveryOptions[0].id);
    }
  }, [deliveryOption, deliveryOptionStates, enabledDeliveryOptions]);

  React.useEffect(() => {
    const nextMin = clampWeightToRange(minWeight, minWeightLimit, maxWeightLimit);
    const nextMax = clampWeightToRange(maxWeight, minWeightLimit, maxWeightLimit);
    const adjustedMax = nextMax > 0 && nextMax < nextMin ? nextMin : nextMax;
    if (nextMin !== minWeight) setMinWeight(nextMin);
    if (adjustedMax !== maxWeight) setMaxWeight(adjustedMax);
  }, [maxWeightLimit, minWeightLimit]);

  React.useEffect(() => {
    if (visibility !== 'private' && usePickupDate) {
      setUsePickupDate(false);
      setPickupDate('');
    }
  }, [visibility, usePickupDate]);

  React.useEffect(() => {
    if (visibility !== 'public' || pickupWindowStart === null || pickupWindowEnd === null) return;
    const start = new Date(pickupWindowStart);
    const end = new Date(pickupWindowEnd);
    setPickupDateSlots((prev) => buildPickupDateSlots(start, end, prev));
  }, [buildPickupDateSlots, pickupWindowEnd, pickupWindowStart, visibility]);

  const toggleSlot = (day: string) => {
    pickupSlotsTouchedRef.current = true;
    setPickupSlots((prev) => prev.map((slot) => (slot.day === day ? { ...slot, enabled: !slot.enabled } : slot)));
  };

  const updateSlotTime = (day: string, key: 'start' | 'end', value: string) => {
    pickupSlotsTouchedRef.current = true;
    setPickupSlots((prev) => prev.map((slot) => (slot.day === day ? { ...slot, [key]: value } : slot)));
  };

  const toggleDateSlot = (date: string) => {
    pickupDateSlotsTouchedRef.current = true;
    setPickupDateSlots((prev) =>
      prev.map((slot) => (slot.date === date ? { ...slot, enabled: !slot.enabled } : slot))
    );
  };

  const updateDateSlotTime = (date: string, key: 'start' | 'end', value: string) => {
    pickupDateSlotsTouchedRef.current = true;
    setPickupDateSlots((prev) =>
      prev.map((slot) => (slot.date === date ? { ...slot, [key]: value } : slot))
    );
  };

  const handleShareQuantityChange = (productId: string, delta: number) => {
    setShareQuantities((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const handleShareDirectQuantity = (productId: string, value: number) => {
    setShareQuantities((prev) => ({ ...prev, [productId]: Math.max(0, value) }));
  };

  const selectionCardWidth = CARD_WIDTH;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProducts.length === 0) {
      alert('Veuillez sélectionner au moins un produit');
      return;
    }
 
    if (!isDeliveryOptionValid) {
      alert(selectedDeliveryOptionState?.reason ?? 'Option de livraison indisponible.');
      return;
    }

    const activeSlots: PickupSlot[] = usePickupDate
      ? []
      : visibility === 'public'
        ? pickupDateSlots.filter((slot) => slot.enabled && slot.date)
        : pickupSlots.filter((slot) => slot.enabled && slot.day);

    if (!user) {
      toast.info('Connectez-vous pour creer une commande.');
      return;
    }

    const participantVisibility = {
      profile: false,
      content: false,
      weight: false,
      amount: false,
    };

    const sharerSelectionWeight = selectedProductsData.reduce((sum, product) => {
      const qty = shareQuantities[product.id] ?? 0;
      return sum + getProductWeightKg(product) * qty;
    }, 0);

    const baseTotal = perProductRows.reduce((sum, r) => sum + r.basePrice, 0);
    const participantTotal = perProductRows.reduce((sum, r) => sum + r.participantPrice, 0);

    const orderDraft = {
      products: selectedProductsData,
      title,
      visibility,
      status: 'open',
      deadline: deadline ? new Date(deadline) : null,
      message,
      autoApproveParticipationRequests,
      allowSharerMessages,
      autoApprovePickupSlots,
      minWeight: normalizedMinWeight,
      maxWeight: normalizedMaxWeight,
      pickupWindowWeeks: visibility === 'public' ? pickupWindowWeeks : undefined,
      pickupStreet: useSamePickupAddress ? deliveryStreet : pickupStreet,
      pickupInfo: useSamePickupAddress ? deliveryInfo : pickupInfo,
      pickupCity: useSamePickupAddress ? deliveryCity : pickupCity,
      pickupPostcode: useSamePickupAddress ? deliveryPostcode : pickupPostcode,
      pickupAddress,
      pickupSlots: activeSlots.map((slot) => ({
        day: slot.day,
        date: slot.date,
        label: slot.label,
        start: slot.start,
        end: slot.end,
      })),
      pickupDeliveryFee: deliveryOption === 'producer_pickup' ? pickupDeliveryFee : 0,
      shareMode,
      sharerPercentage,
      shareQuantities,
      totals: {
        participantTotal,
      },
      estimatedDeliveryDate,
    };

    if (DEMO_MODE && onCreateOrder) {
      onCreateOrder(orderDraft);
      return;
    }

    setIsSubmitting(true);
    createOrder({
      userId: user.id,
      productCodes: selectedProductsData.map((product) => product.id),
      title,
      visibility,
      status: 'open',
      deadline: deadline ? new Date(deadline) : null,
      message,
      autoApproveParticipationRequests,
      allowSharerMessages,
      autoApprovePickupSlots,
      minWeightKg: normalizedMinWeight,
      maxWeightKg: normalizedMaxWeight,
      orderedWeightKg: shareMode === 'products' ? sharerSelectionWeight : 0,
      deliveryOption,
      deliveryStreet,
      deliveryInfo,
      deliveryCity,
      deliveryPostcode,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      estimatedDeliveryDate,
      pickupWindowWeeks: visibility === 'public' ? pickupWindowWeeks : undefined,
      pickupStreet: useSamePickupAddress ? deliveryStreet : pickupStreet,
      pickupInfo: useSamePickupAddress ? deliveryInfo : pickupInfo,
      pickupCity: useSamePickupAddress ? deliveryCity : pickupCity,
      pickupPostcode: useSamePickupAddress ? deliveryPostcode : pickupPostcode,
      pickupAddress,
      pickupLat,
      pickupLng,
      usePickupDate,
      pickupDate: usePickupDate && pickupDate ? new Date(pickupDate) : null,
      pickupDeliveryFeeCents: deliveryOption === 'producer_pickup' ? eurosToCents(pickupDeliveryFee) : 0,
      sharerPercentage,
      shareMode,
      sharerQuantities: shareQuantities,
      baseTotalCents: eurosToCents(baseTotal),
      deliveryFeeCents: eurosToCents(logTotal),
      participantTotalCents: eurosToCents(participantTotal),
      sharerShareCents: eurosToCents(totalShareEffective),
      effectiveWeightKg: effectiveWeight,
      participantsVisibility: participantVisibility,
      slots: activeSlots.map((slot) => ({
        slotType: slot.date ? 'date' : 'weekday',
        day: slot.day,
        slotDate: slot.date,
        label: slot.label,
        enabled: true,
        startTime: slot.start,
        endTime: slot.end,
      })),
    })
      .then((orderCode) => {
        toast.success('Commande creee avec succes.');
        navigate(`/cmd/${orderCode}`);
      })
      .catch((error) => {
        console.error('Order creation error:', error);
        toast.error('Impossible de creer la commande.');
      })
      .finally(() => setIsSubmitting(false));
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-24 h-24 rounded-full bg-[#FF6B4A]/20 flex items-center justify-center mb-4">
          <Package className="w-12 h-12 text-[#FF6B4A]" />
        </div>
        <h3 className="text-[#1F2937] mb-2">Votre sélection est vide</h3>
        <p className="text-[#6B7280] text-center max-w-sm">
          Utilisez le bouton "Créer" depuis les pages "Produits".
        </p>
      </div>
    );
  }

  const renderPickupLine = () => {
    if (usePickupDate) {
      if (!pickupDate) return 'Date precise à définir';
      return new Date(pickupDate).toLocaleDateString('fr-FR');
    }
    if (visibility === 'public') {
      if (!pickupWindowRange) return 'Date de livraison à définir';
      return `Du ${pickupWindowRange.start.toLocaleDateString('fr-FR')} au ${pickupWindowRange.end.toLocaleDateString('fr-FR')}`;
    }
    const active = pickupSlots.filter((slot) => slot.enabled);
    if (active.length === 0) return 'Non precisé';
    return active
      .map((slot) => `${slot.label} ${slot.start || '??'}-${slot.end || '??'}`)
      .join(' / ');
  };
  const hasEstimatedDeliveryDate = Boolean(estimatedDeliveryDate);
  const hasPickupInfo =
    (usePickupDate && Boolean(pickupDate)) ||
    (visibility === 'public' && Boolean(pickupWindowRange)) ||
    (visibility !== 'public' && pickupSlots.some((slot) => slot.enabled));

  return (
    <form onSubmit={handleSubmit} className="pb-6">
      <div className="create-order-layout gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-[#1F2937] mb-4">
              Sélectionnez les produits de {Object.entries(groupedByProducer)[0]?.[1]?.producerName ?? ''} à inclure dans la commande
            </h3>

            <div className="space-y-6">
              {Object.entries(groupedByProducer).map(([producerId, group]) => (
                <div key={producerId} className="space-y-2">
                  <ProducerProductCarousel
                    products={group.products}
                    selectedProducts={selectedProducts}
                    onToggleSelection={(productId, wasSelected) => {
                      setSelectedProducts((prev) =>
                        wasSelected ? prev.filter((id) => id !== productId) : [...prev, productId]
                      );
                    }}
                    cardWidth={selectionCardWidth}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[#1F2937] text-base font-semibold">Paramètres d'échanges avec les participants</h3>
              <p className="text-sm text-[#6B7280]">
                Gérez la visibilité de la commande et les préférences de contact pour les partageurs.
              </p>
            </div>

            <div>
                <label className="block text-sm text-[#6B7280] mb-2">Nom de la commande</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Foie gras - Quartier centre"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  required
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <label>Visibilité de la commande</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={visibilityButtonClass('public')}
                  >
                    Commande publique
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={visibilityButtonClass('private')}
                  >
                    Commande privée
                  </button>
                </div>
                <p className="text-xs text-[#6B7280] mt-2">
                  Les commandes privées ne sont trouvables que par le lien de la commande.
                </p>
              </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p>Validation des participants à la commande</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setAutoApproveParticipationRequests(true)}
                      className={optionButtonClass(autoApproveParticipationRequests)}
                    >
                      Automatique
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoApproveParticipationRequests(false)}
                      className={optionButtonClass(!autoApproveParticipationRequests)}
                    >
                      Manuelle
                    </button>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-2">
                    La validation des demandes de participation à la commande peut se faire directement ou au cas par cas par vous.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p>Messages de potentiels participants à la commande</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setAllowSharerMessages(true)}
                      className={optionButtonClass(allowSharerMessages)}
                    >
                      Acceptés
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllowSharerMessages(false)}
                      className={optionButtonClass(!allowSharerMessages)}
                    >
                      Désactivés
                    </button>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-2">
                    Si les messages sont acceptés, vous pourrez recevoir des messages privés de personnes souhaitant, par exemple, participer à la commande mais ayant des questions.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p>Validation des rendez-vous de récupération des produits</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setAutoApprovePickupSlots(true)}
                      className={optionButtonClass(autoApprovePickupSlots)}
                    >
                      Automatique
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoApprovePickupSlots(false)}
                      className={optionButtonClass(!autoApprovePickupSlots)}
                    >
                      Manuelle
                    </button>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-2">
                    La validation des demandes de rendez-vous proposées par les participants peut se faire directement ou au cas par cas par vous.
                  </p>
                </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[#1F2937] text-base font-semibold">Livraison</h3>
              <p className="text-sm text-[#6B7280]">
                Indiquez l'adresse de livraison et choisissez le mode de livraison.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-[#6B7280]">Adresse de livraison</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="text"
                  value={deliveryStreet}
                  onChange={(e) => setDeliveryStreet(e.target.value)}
                  placeholder="Ex. 15 Rue de la Republique"
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  value={deliveryInfo}
                  onChange={(e) => setDeliveryInfo(e.target.value)}
                  placeholder="Informations complémentaires : Lieu précis, bâtiment, étage, code d'entrée"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder="Ville"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    required
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={deliveryPostcode}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setDeliveryPostcode(next);
                    }}
                    placeholder="Code postal"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    pattern="[0-9]{4,5}"
                    maxLength={5}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Poids minimum de la commande</label>
                <input
                  type="number"
                  value={normalizedMinWeight}
                  onChange={(e) => {
                    const next = clampWeightToRange(Number(e.target.value), minWeightLimit, maxWeightLimit);
                    setMinWeight(next);
                    if (maxWeight > 0 && next > maxWeight) setMaxWeight(next);
                  }}
                  min={minWeightInputMin}
                  max={minWeightInputMax}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Poids maximum de la commande</label>
                <input
                  type="number"
                  value={normalizedMaxWeight}
                  onChange={(e) => {
                    let next = clampWeightToRange(Number(e.target.value), minWeightLimit, maxWeightLimit);
                    if (next > 0 && next < normalizedMinWeight) next = normalizedMinWeight;
                    setMaxWeight(next);
                  }}
                  min={maxWeightInputMin}
                  max={maxWeightInputMax}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label>Option de livraison</label>
              <div>
                {producerEnabledDeliveryOptions.map((option) => {
                  const optionConfig = deliveryOptionConfig[option.id];
                  const optionState = deliveryOptionStates[option.id];
                  const isEnabled = optionState?.eligible ?? true;
                  return (
                    <label key={option.id} style={{ display: 'block', marginBottom: 8 }}>
                      <input
                        type="radio"
                        name="deliveryOption"
                        value={option.id}
                        checked={deliveryOption === option.id}
                        onChange={() => setDeliveryOption(option.id)}
                        disabled={!isEnabled}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ fontWeight: 600 }}>{option.title}</span>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{option.description}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                        {(option.id === 'producer_delivery' || option.id === 'producer_pickup') && (
                          <div>Jours : {formatDaysList(optionConfig?.days)}</div>
                        )}
                        {option.id === 'chronofresh' && (
                          <div>
                            Delai :{' '}
                            {fallbackLeadType === 'fixed_day'
                              ? `Jour fixe ${deliveryDayLabels[fallbackLeadFixedDay]}`
                              : `J+${fallbackLeadDays}`}
                          </div>
                        )}
                        {option.id === 'producer_pickup' && <div>Horaires : {pickupHoursLabel}</div>}
                        <div>Seuils : {formatWeightRange(optionConfig?.minWeight, optionConfig?.maxWeight)}</div>
                      </div>
                      {!isEnabled && optionState?.reason ? (
                        <div style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>
                          {optionState.reason}
                        </div>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              {enabledDeliveryOptions.length === 0 && (
                <p className="text-xs text-[#B45309]">Aucune option disponible pour les criteres actuels.</p>
              )}
            </div>
            {deliveryOption === 'producer_pickup' && (
                <div className="space-y-2">
                  <label className="block text-sm text-[#6B7280] mb-2">Frais que vous prendrez pour aller chercher la commande chez le producteur (en €)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pickupDeliveryFee}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setPickupDeliveryFee(Number.isFinite(next) ? Math.max(0, next) : 0);
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                  <p className="text-xs text-[#6B7280]">
                    Indiquez 0€ si vous ne prenez pas de frais.
                  </p>
                </div>
              )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
            </div>
            {(minWeightLimit > 0 || maxWeightLimit > 0) && (
              <p className="text-xs text-[#6B7280]">
                Seuils producteur pour cette option : {formatWeightRange(minWeightLimit, maxWeightLimit)}.
              </p>
            )}

            <div>
                <label className="block text-sm text-[#6B7280] mb-2">Date de clôture de la commande</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {deliveryOption === 'chronofresh' ? (
                    <>
                      <label className="block text-sm text-[#6B7280]">Délai Chronofresh apres clôture</label>
                      <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white text-[#1F2937]">
                        {deliveryRuleLabel}
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm text-[#6B7280]">
                        {deliveryOption === 'producer_delivery'
                          ? 'Jours de livraison producteur'
                          : 'Jours de retrait producteur'}
                      </label>
                      <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white text-[#1F2937]">
                        {deliveryRuleLabel}
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-[#F9FAFB] rounded-xl border border-gray-200 p-4 text-sm text-[#6B7280] space-y-2">
                  <p className="text-[#1F2937] font-semibold">Date de livraison estimée</p>
                  <p>
                    {estimatedDeliveryDate
                      ? estimatedDeliveryDate.toLocaleDateString('fr-FR')
                      : 'Sélectionnez une date de clôture pour estimer la livraison.'}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Basée sur la date de clôture de la commande et le mode de livraison selectionné.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[#1F2937] text-base font-semibold">Part du partageur</h3>
              <p className="text-sm text-[#6B7280]">
                Choisissez les produits que vous souhaitez commander pour vous puis définissez le pourcentage que vous garderez gratuitement sur la commande.
              </p>
            </div>

            <div>
              <label
                className={`flex items-center gap-2 text-sm ${
                  canReceiveCashShare ? 'text-[#1F2937]' : 'text-[#9CA3AF]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={shareMode === 'cash'}
                  onChange={(e) => setShareMode(e.target.checked ? 'cash' : 'products')}
                  disabled={!canReceiveCashShare}
                />
                Recevoir la totalité de la part du partageur en argent. (option indisponible pour les profils de particuliers.)
              </label>
            </div>

            {shareMode === 'products' && (
              <div className="space-y-4">

                <label className="block text-sm text-[#6B7280]">Sélection des produits et des quantités</label>
                {selectedProductsData.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">Sélectionnez d'abord des produits dans la commande.</p>
                ) : (
                  <ShareProductsCarousel
                    products={selectedProductsData}
                    quantities={shareQuantities}
                    onDeltaQuantity={handleShareQuantityChange}
                    onDirectQuantity={handleShareDirectQuantity}
                    priceLabels={sharePriceLabels}
                  />
                )}

                  <div className="bg-[#F9FAFB] rounded-lg border border-gray-200 p-3 text-sm text-[#1F2937] space-y-1">
                    <p>
                      Valeur estimée : <span className="font-semibold">{shareTotalLabel}</span>
                    </p>
                  </div>
                </div>
              )}


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Définissez votre part partageur (%)</label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="number"
                    value={sharerPercentage}
                    onChange={(e) => setSharerPercentage(Number(e.target.value))}
                    min="0"
                    max="100"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    required
                  />
                </div>
              </div>
              <div className="bg-[#F9FAFB] rounded-lg border border-gray-200 p-3 text-sm text-[#1F2937] space-y-1">
                <p className="font-semibold">Part partageur selon le niveau de participation :</p>
                <p className="text-[#6B7280]">
                  au poids minimum de la commande : <span className="text-[#1F2937] font-semibold">{minShareAtThreshold.toFixed(2)} €</span>
                </p>
                <p className="text-[#6B7280]">
                  au poids maximum de la commande : <span className="text-[#1F2937] font-semibold">{maxShareAtThreshold.toFixed(2)} €</span>
                </p>
              </div>
            </div>
          <p className="text-sm text-[#6B7280]">La part partageur que vous recevrez vous permettra d'obtenir les produits gratuitement si sa valeur est supérieure ou égale à la valeur des produits que vous avez sélectionnés ci-dessus.
            Si votre part partageur au moment de la clôture est inférieure à la valeur des produits vous devrez compléter le montant en réalisant un paiement bancaire. 
            Si votre part est supérieure au montant des produits que vous avez commandés, le surplus monétaire obtenu sera utilisable lui aussi sur la plateforme.</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-[#1F2937] text-base font-semibold">Retrait</h3>
                <p className="text-sm text-[#6B7280]">
                  Choisissez l'adresse de retrait et la période de disponibilité des produits.
                </p>
              </div>
              <div className="text-sm text-[#6B7280]">
                Disponibilité : <span className="text-[#FF6B4A] font-semibold">{renderPickupLine()}</span>
              </div>
            </div>


            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={useSamePickupAddress}
                  onChange={(e) => setUseSamePickupAddress(e.target.checked)}
                />
                Même adresse de retrait que l'adresse de livraison
              </label>
              {useSamePickupAddress ? (
                <p className="text-xs text-[#6B7280]">L'adresse précise n'est communiquée aux participants qu'après paiement.</p>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm text-[#6B7280]">Adresse de retrait</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      type="text"
                      value={pickupStreet}
                      onChange={(e) => setPickupStreet(e.target.value)}
                      placeholder="Ex. 15 Rue de la Republique"
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                      required={!useSamePickupAddress}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={pickupInfo}
                      onChange={(e) => setPickupInfo(e.target.value)}
                      placeholder="Informations complémentaires : Lieu précis, bâtiment, étage, code d'entrée"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={pickupCity}
                        onChange={(e) => setPickupCity(e.target.value)}
                        placeholder="Ville"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                        required={!useSamePickupAddress}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={pickupPostcode}
                        onChange={(e) => {
                          const next = e.target.value.replace(/\D/g, '').slice(0, 5);
                          setPickupPostcode(next);
                        }}
                        placeholder="Code postal"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        pattern="[0-9]{4,5}"
                        maxLength={5}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                        required={!useSamePickupAddress}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    L'adresse précise n'est communiquée aux participants qu'après paiement.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#6B7280] mb-2">Message aux participants</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex. Retrait chez moi, à l'adresse enregistrée."
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                {visibility === 'public' ? (
                  <>
                    <div>
                      <label className="block text-sm text-[#6B7280] mb-2">Durée de recupération</label>
                      <select
                        value={pickupWindowWeeks}
                        onChange={(e) => setPickupWindowWeeks(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                      >
                        <option value={1}>1 semaine</option>
                        <option value={2}>2 semaines</option>
                        <option value={3}>3 semaines</option>
                        <option value={4}>4 semaines</option>
                      </select>
                      <p className="text-xs text-[#6B7280] mt-2">
                        Date limite de retrait :{' '}
                        <span className="text-[#1F2937] font-semibold">
                          {pickupWindowRange ? pickupWindowRange.end.toLocaleDateString('fr-FR') : 'A definir'}
                        </span>
                      </p>
                    </div>
                    {pickupWindowRange ? (
                      <div className="space-y-3">
                        {pickupDateSlots.map((slot) => (
                          <div key={slot.date ?? slot.label} className="flex items-center gap-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => slot.date && toggleDateSlot(slot.date)}
                              className={`px-3 py-1 rounded-full border text-sm ${
                                slot.enabled
                                  ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                                  : 'border-gray-200 text-[#6B7280]'
                              }`}
                            >
                              {slot.label}
                            </button>
                            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                              <input
                                type="time"
                                value={slot.start}
                                onChange={(e) => slot.date && updateDateSlotTime(slot.date, 'start', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                                disabled={!slot.enabled}
                              />
                              <span>-</span>
                              <input
                                type="time"
                                value={slot.end}
                                onChange={(e) => slot.date && updateDateSlotTime(slot.date, 'end', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                                disabled={!slot.enabled}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#B45309]">
                        Définissez une date de clôture pour generer les dates de retrait.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {visibility === 'private' && (
                      <label className="flex items-center gap-2 text-sm text-[#1F2937]">
                        <input
                          type="checkbox"
                          checked={usePickupDate}
                          onChange={(e) => setUsePickupDate(e.target.checked)}
                        />
                        Choisir une date precise (valable pour les commandes privees uniquement)
                      </label>
                    )}

                    {usePickupDate ? (
                      <div>
                        <label className="block text-sm text-[#6B7280] mb-2">Date de retrait</label>
                        <input
                          type="date"
                          value={pickupDate}
                          onChange={(e) => setPickupDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                          required={usePickupDate}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pickupSlots.map((slot) => (
                          <div key={slot.day ?? slot.label} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => slot.day && toggleSlot(slot.day)}
                              className={`px-3 py-1 rounded-full border text-sm ${
                                slot.enabled
                                  ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                                  : 'border-gray-200 text-[#6B7280]'
                              }`}
                            >
                              {slot.label}
                            </button>
                            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                              <input
                                type="time"
                                value={slot.start}
                                onChange={(e) => slot.day && updateSlotTime(slot.day, 'start', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                                disabled={!slot.enabled}
                              />
                              <span>-</span>
                              <input
                                type="time"
                                value={slot.end}
                                onChange={(e) => slot.day && updateSlotTime(slot.day, 'end', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                                disabled={!slot.enabled}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="bg-[#F9FAFB] rounded-xl border border-gray-200 p-4 text-sm text-[#6B7280] space-y-2">
                {visibility === 'public' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B4A]" />
                      <span>Définissez la duree pour calculer la date limite de retrait.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#28C1A5]" />
                      <span>Indiquez vos disponibilites pour chaque jour de la plage.</span>
                    </div>
                    {pickupWindowRange && (
                      <div className="text-xs text-[#6B7280]">Plage : {pickupWindowLabel}</div>
                    )}
                  </>
                ) : usePickupDate ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B4A]" />
                      <span>Choisissez une date unique pour le retrait (commande privee).</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#28C1A5]" />
                      <span>La date precise sera communiquee aux participants.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF6B4A]" />
                      <span>Activez les jours ou vous pouvez distribuer la commande.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#28C1A5]" />
                      <span>Precisez une plage horaire par jour pour eviter les confusions.</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="create-order-summary">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm w-full">
            <h3 className="text-[#1F2937] mb-4">Récapitulatif</h3>
            {selectedProducts.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Ajoutez des produits pour voir le récapitulatif.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 text-sm text-[#1F2937]">
                  <p>
                    Poids minimum de la commande :{' '}
                    <span style={{ fontWeight: 600 }}>{effectiveWeight.toFixed(2)} kg</span>
                  </p>
                  <p>
                    Coût livraison total : <span style={{ fontWeight: 600 }}>{logTotal.toFixed(2)} €</span>
                  </p>
                  <p>
                    Part partageur :{' '}
                    <span style={{ fontWeight: 600 }}>{sharerPercentage.toFixed(1)}%</span>{' '}
                    <span className="text-xs text-[#6B7280]">
                      {shareMode === 'cash' ? '(en argent)' : '(en produits)'}
                    </span>{' '}
                    (
                    <span style={{ fontWeight: 600 }}>
                      {minShareAtThreshold.toFixed(2)} € jusqu'&agrave; {maxShareAtThreshold.toFixed(2)} €
                    </span>
                    )
                  </p>
                  <p>
                    Livraison :{' '}
                    <span style={{ fontWeight: 600 }}>
                      {selectedDeliveryOption?.title ?? 'Non precise'}
                    </span>
                  </p>
                  {hasEstimatedDeliveryDate && (
                    <p>
                      Date de livraison estimee :{' '}
                      <span style={{ fontWeight: 600 }}>
                        {estimatedDeliveryDate?.toLocaleDateString('fr-FR')}
                      </span>
                    </p>
                  )}

                </div>
                <div className="create-order-summary-table-wrapper is-vertical">
                  <table className="create-order-summary-table is-vertical">
                    <thead className="create-order-summary-table-head">
                      <tr className="create-order-summary-table-row">
                        <th className="create-order-summary-table-cell" scope="col">
                          Produit
                        </th>
                        {perProductRows.map((row) => (
                          <th key={row.id} className="create-order-summary-table-cell is-center" scope="col">
                            {row.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((summaryRow) => (
                        <tr key={summaryRow.key} className="create-order-summary-table-row">
                          <th className="create-order-summary-table-cell" scope="row">
                            {summaryRow.label}
                          </th>
                          {perProductRows.map((row) => (
                            <td
                              key={row.id}
                              className={`create-order-summary-table-cell ${summaryRow.className}`.trim()}
                              data-label={row.name}
                            >
                              {summaryRow.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasPickupInfo && (
                  <p className="text-[#6B7280]">
                    Disponibilite : {renderPickupLine()}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="submit"
          disabled={selectedProducts.length === 0 || !isDeliveryOptionValid || isSubmitting}
          className="w-full sm:flex-1 py-3 bg-[#FF6B4A] text-white rounded-xl hover:bg-[#FF5A39] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-lg"
        >
          Créer la commande
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#1F2937] hover:border-[#FF6B4A] transition-colors"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function ShareProductsCarousel({
  products,
  quantities,
  onDeltaQuantity,
  onDirectQuantity,
  priceLabels,
}: {
  products: DeckCard[];
  quantities: Record<string, number>;
  onDeltaQuantity: (productId: string, delta: number) => void;
  onDirectQuantity: (productId: string, value: number) => void;
  priceLabels?: Record<string, string>;
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
                width: `${CARD_WIDTH}px`,
                minWidth: `${CARD_WIDTH}px`,
                flex: `0 0 ${CARD_WIDTH}px`,
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
                onOpen={() => undefined}
                onOpenProducer={() => undefined}
                showSelectionControl={false}
                cardWidth={CARD_WIDTH}
                compact
                priceLabelOverride={priceLabels?.[product.id]}
              />
              <div className="w-full space-y-2" style={{ maxWidth: CARD_WIDTH }}>
                <p className="text-[12px] text-[#6B7280] text-center">{getProductWeightKg(product).toFixed(2)} kg</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDeltaQuantity(product.id, -1)}
                    className="order-client-view__quantity-button order-client-view__quantity-button--decrement"
                    aria-label={`Retirer une quantite de ${product.name}`}
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
                  />
                  <button
                    type="button"
                    onClick={() => onDeltaQuantity(product.id, 1)}
                    className="order-client-view__quantity-button order-client-view__quantity-button--increment"
                    aria-label={`Ajouter une quantite de ${product.name}`}
                  >
                    +
                  </button>
                </div>
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

function ProducerProductCarousel({
  products,
  selectedProducts,
  onToggleSelection,
  cardWidth,
}: {
  products: DeckCard[];
  selectedProducts: string[];
  onToggleSelection: (productId: string, wasSelected: boolean) => void;
  cardWidth: number;
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
        style={{
          alignItems: 'stretch',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        {productsToShow.map((product) => {
          const isSelected = selectedProducts.includes(product.id);
          const hasPrice = Boolean(product.activeLotCode) && product.price > 0;
          const priceLabel = hasPrice
            ? formatEurosFromCents(eurosToCents(product.price))
            : 'Prix à venir';
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onToggleSelection(product.id, isSelected)}
              style={{
                width: `${cardWidth}px`,
                minWidth: `${cardWidth}px`,
                flex: `0 0 ${cardWidth}px`,
                minHeight: `${CARD_HEIGHT}px`,
                height: `${CARD_HEIGHT}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                border: '2px solid',
                borderColor: isSelected ? '#FF6B4A' : '#e5e7eb',
                borderRadius: 16,
                background: '#fff',
                boxShadow: isSelected
                  ? '0 14px 30px rgba(255,107,74,0.3)'
                  : '0 12px 26px rgba(17,24,39,0.06)',
                padding: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease',
              }}
            >
              <div style={{ width: '100%', height: '105px', background: '#f3f4f6', flexShrink: 0 }}>
                <ImageWithFallback
                  src={product.imageUrl}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div style={{ padding: '10px 12px', textAlign: 'left', display: 'grid', gap: 6, flex: 1 }}>
                <p style={{ margin: 0, color: '#6B7280', fontSize: 12, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.producerName}
                </p>
                <p style={{ margin: 0, color: '#111827', fontWeight: 700, fontSize: 15, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#FF6B4A', fontWeight: 700, fontSize: 15 }}>
                    {priceLabel}
                  </span>
                  {hasPrice ? (
                    <span style={{ fontSize: 11, color: '#374151' }}>
                      / {product.measurement === 'kg' ? 'Kg' : 'Unité'} ({product.unit})
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={goLeft}
          aria-label="Défiler vers la gauche"
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border transition"
          style={{
            borderColor: '#FF6B4A',
            background: '#FF6B4A',
            boxShadow: '0 12px 26px rgba(255,107,74,0.35)',
            width: 39,
            height: 39,
          }}
        >
          <ChevronLeft className="text-white mx-auto" style={{ width: 20, height: 20 }} />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={goRight}
          aria-label="Défiler vers la droite"
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border transition"
          style={{
            borderColor: '#FF6B4A',
            background: '#FF6B4A',
            boxShadow: '0 12px 26px rgba(255,107,74,0.35)',
            width: 39,
            height: 39,
          }}
        >
          <ChevronRight className="text-white mx-auto" style={{ width: 20, height: 20 }} />
        </button>
      )}
    </div>
  );
}

