import React from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Copy, Printer, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GroupOrder, Product, ProductDetail, TimelineStep, User } from '../types';
import { eurosToCents, formatEurosFromCents } from '../lib/money';
import { Avatar } from './Avatar';
import { ImageWithFallback } from './ImageWithFallback';
import { Logo } from './Logo';
import './ShareOverlay.css';

type Detail = { label: string; value: string };
type ShareOverlayKind = 'order' | 'product' | 'profile' | 'generic';
type ProductShareData = {
  product: Product;
  detail?: ProductDetail | null;
  ordersWithProduct: GroupOrder[];
  timelineSteps?: TimelineStep[];
};

interface ShareOverlayProps {
  open: boolean;
  kind: ShareOverlayKind;
  link: string;
  title: string;
  subtitle?: string;
  description?: string;
  details?: Detail[];
  orderData?: { order: GroupOrder };
  productData?: ProductShareData;
  profileData?: { profile: User };
  supabaseClient?: SupabaseClient | null;
  onClose: () => void;
}

type FilterOption = { id: string; label: string };
const PRINT_MODE_CLASS = 'share-overlay--printing';
const PRINT_WIDTH_MM = 190;
const PRINT_HEIGHT_MM = 277;
const PX_PER_MM = 96 / 25.4;
const PIE_COLORS = ['#F97316', '#FB923C', '#FACC15', '#34D399', '#38BDF8', '#818CF8'];
const ORDER_CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const ORDER_DAY_LABELS: Record<string, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
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

const formatCurrency = (value: number) => formatEurosFromCents(eurosToCents(value));

const formatUnitWeightLabel = (weightKg?: number | null) => {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) {
    return '';
  }
  if (weightKg < 1) return `${Math.round(weightKg * 1000)}g`;
  const kgValue = Math.round(weightKg * 100) / 100;
  return `${Number(kgValue.toFixed(2)).toString()} Kg`;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
};

const getStepLocationLabel = (step: { city?: string; postcode?: string; lieu?: string; address?: string }) => {
  const compact = [step.postcode, step.city].filter(Boolean).join(' ');
  return compact || step.lieu || step.address || 'Lieu a preciser';
};

const getStepDateLabel = (step: { periodStart?: string; periodEnd?: string; date?: string }) => {
  if (step.periodStart && step.periodEnd) return `${formatDateLabel(step.periodStart)} -> ${formatDateLabel(step.periodEnd)}`;
  if (step.periodStart) return formatDateLabel(step.periodStart);
  if (step.date) return formatDateLabel(step.date);
  return '';
};

const formatSlotTime = (value?: string | null) => {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : trimmed;
};

const labelForSlotDay = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  return ORDER_DAY_LABELS[normalized] ?? value;
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

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const isDateInRange = (date: Date, start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  const dateValue = date.getTime();
  const startValue = start.getTime();
  const endValue = end.getTime();
  const rangeStart = Math.min(startValue, endValue);
  const rangeEnd = Math.max(startValue, endValue);
  return dateValue >= rangeStart && dateValue <= rangeEnd;
};

const getMinDate = (dates: Date[]) => {
  if (!dates.length) return null;
  return dates.reduce((min, current) => (current.getTime() < min.getTime() ? current : min));
};

const getMaxDate = (dates: Date[]) => {
  if (!dates.length) return null;
  return dates.reduce((max, current) => (current.getTime() > max.getTime() ? current : max));
};

const getAccountTypeLabel = (accountType?: User['accountType']) => {
  if (accountType === 'auto_entrepreneur') return 'Auto-entreprise';
  if (accountType === 'company') return 'Entreprise';
  if (accountType === 'association') return 'Association';
  if (accountType === 'public_institution') return 'Institutions publiques';
  if (accountType === 'individual') return 'Particulier';
  return '';
};

export function ShareOverlay({
  open,
  kind,
  link,
  title,
  subtitle,
  description,
  details,
  orderData,
  productData,
  profileData,
  supabaseClient,
  onClose,
}: ShareOverlayProps) {
  const filterPanelRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const printCanvasRef = React.useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [sectionVisibility, setSectionVisibility] = React.useState<Record<string, boolean>>({});

  const order = orderData?.order;
  const product = productData?.product;
  const detail = productData?.detail;
  const profile = profileData?.profile;

  const productTimelineSteps = React.useMemo(() => {
    const rawTimeline =
      productData?.timelineSteps?.length
        ? productData.timelineSteps
        : detail?.tracabilite?.timeline ?? detail?.tracabilite?.lotTimeline ?? [];
    return rawTimeline
      .slice(0, 5)
      .map((step, index) => ({
        id: step.localId ?? step.journeyStepId ?? `${step.etape}-${index}`,
        label: step.etape || 'Etape',
        location: getStepLocationLabel(step),
        date: getStepDateLabel(step),
      }))
      .filter((step) => step.label);
  }, [detail?.tracabilite?.lotTimeline, detail?.tracabilite?.timeline, productData?.timelineSteps]);

  const productBreakdown = React.useMemo(() => {
    const rows = detail?.repartitionValeur?.postes ?? [];
    return rows
      .slice(0, 6)
      .map((row) => ({
        label: row.nom,
        value: Number.isFinite(row.valeur) ? row.valeur : 0,
        type: row.type,
      }))
      .filter((row) => row.label);
  }, [detail?.repartitionValeur?.postes]);

  const productBreakdownPie = React.useMemo(() => {
    const rows = productBreakdown
      .map((entry) => ({
        label: entry.label,
        value: Math.max(0, entry.value),
        type: entry.type === 'percent' ? 'percent' : 'eur',
      }))
      .filter((entry) => entry.value > 0);
    const totalWeight = rows.reduce((sum, entry) => sum + entry.value, 0);
    if (!rows.length || totalWeight <= 0) {
      return { slices: [] as Array<{
        label: string;
        value: number;
        type: 'eur' | 'percent';
        color: string;
        percent: number;
        start: number;
        end: number;
      }>, gradient: '', totalLabel: '' };
    }
    const totalEur = rows
      .filter((entry) => entry.type === 'eur')
      .reduce((sum, entry) => sum + entry.value, 0);
    const totalLabel = rows.every((entry) => entry.type === 'percent')
      ? '100%'
      : formatCurrency(totalEur > 0 ? totalEur : totalWeight);
    let cursor = 0;
    const slices = rows.map((entry, index) => {
      const percent = (entry.value / totalWeight) * 100;
      const start = cursor;
      const end = cursor + percent;
      cursor = end;
      return {
        ...entry,
        color: PIE_COLORS[index % PIE_COLORS.length],
        percent,
        start,
        end,
      };
    });
    const gradient = `conic-gradient(${slices
      .map((slice) => `${slice.color} ${slice.start.toFixed(3)}% ${slice.end.toFixed(3)}%`)
      .join(', ')})`;
    return { slices, gradient, totalLabel };
  }, [productBreakdown]);

  const orderCalendar = React.useMemo(() => {
    if (!order) return null;
    const markersByDate = new Map<string, Set<'deadline' | 'delivery' | 'pickup'>>();
    const addMarker = (value: Date | string | null | undefined, marker: 'deadline' | 'delivery' | 'pickup') => {
      const date = parseDateValue(value ?? null);
      if (!date) return;
      const key = toDateKey(date);
      const existing = markersByDate.get(key) ?? new Set<'deadline' | 'delivery' | 'pickup'>();
      existing.add(marker);
      markersByDate.set(key, existing);
    };
    addMarker(order.deadline, 'deadline');
    addMarker(order.estimatedDeliveryDate ?? null, 'delivery');
    const pickupDates: Date[] = (order.pickupSlots ?? []).flatMap((slot) => {
      if (!slot?.date) return [];
      addMarker(slot.date, 'pickup');
      const parsed = parseDateValue(slot.date);
      return parsed ? [parsed] : [];
    });
    const deadlineDate = parseDateValue(order.deadline ?? null);
    const createdAtDate = parseDateValue(order.createdAt ?? null);
    const deliveryDate = parseDateValue(order.estimatedDeliveryDate ?? null);
    const fallbackOpenStart = deadlineDate ? addDays(deadlineDate, -21) : null;
    const openRangeStart = createdAtDate ?? fallbackOpenStart;
    const openRangeEnd = deadlineDate;
    const pickupRangeStart = getMinDate(pickupDates) ?? deliveryDate ?? null;
    const pickupRangeEndFromSlots = getMaxDate(pickupDates);
    const pickupRangeEndFromWindow =
      deliveryDate && typeof order.pickupWindowWeeks === 'number' && order.pickupWindowWeeks > 0
        ? addDays(deliveryDate, order.pickupWindowWeeks * 7)
        : null;
    const pickupRangeEnd = pickupRangeEndFromSlots ?? pickupRangeEndFromWindow ?? pickupRangeStart ?? null;
    const deliveryRangeStart = deadlineDate;
    const deliveryRangeEnd = deliveryDate;
    const weekSlots = (order.pickupSlots ?? [])
      .filter((slot) => !slot.date)
      .map((slot, index) => {
        const dayLabel = slot.label?.trim() || labelForSlotDay(slot.day);
        const start = formatSlotTime(slot.start);
        const end = formatSlotTime(slot.end);
        return {
          id: `${dayLabel || slot.day || 'slot'}-${start}-${end}-${index}`,
          label: [dayLabel, [start, end].filter(Boolean).join(' - ')].filter(Boolean).join(' '),
        };
      })
      .filter((slot) => slot.label);
    const calendarDates = [
      openRangeStart,
      openRangeEnd,
      deadlineDate,
      deliveryDate,
      pickupRangeStart,
      pickupRangeEnd,
      ...pickupDates,
    ].filter(Boolean) as Date[];
    const seed = calendarDates.length
      ? calendarDates.reduce((min, current) => (current.getTime() < min.getTime() ? current : min), calendarDates[0])
      : new Date();
    const maxDate = calendarDates.length
      ? calendarDates.reduce((max, current) => (current.getTime() > max.getTime() ? current : max), calendarDates[0])
      : seed;
    const firstMonth = new Date(seed.getFullYear(), seed.getMonth(), 1);
    const lastMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    const months =
      firstMonth.getFullYear() === lastMonth.getFullYear() && firstMonth.getMonth() === lastMonth.getMonth()
        ? [firstMonth]
        : [firstMonth, lastMonth];
    const pickupAddressCityLine = [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ').trim();
    let pickupAddressPrecise = (order.pickupStreet ?? '').trim();
    const pickupAddressFull = (order.pickupAddress ?? '').trim();
    if (!pickupAddressPrecise && pickupAddressFull) {
      const normalizedCity = pickupAddressCityLine.trim().toLowerCase();
      const normalizedFull = pickupAddressFull.toLowerCase();
      if (normalizedCity && normalizedFull.includes(normalizedCity)) {
        pickupAddressPrecise = pickupAddressFull
          .replace(new RegExp(pickupAddressCityLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '')
          .replace(/,\s*,/g, ',')
          .replace(/^[,\s]+|[,\s]+$/g, '')
          .trim();
      } else {
        pickupAddressPrecise = pickupAddressFull;
      }
    }
    return {
      months: months.map((month) => ({
        key: `${month.getFullYear()}-${month.getMonth() + 1}`,
        monthLabel: month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        days: buildCalendarDays(month),
      })),
      markersByDate,
      openRangeStart: openRangeStart ?? null,
      openRangeEnd: openRangeEnd ?? null,
      deliveryRangeStart: deliveryRangeStart ?? null,
      deliveryRangeEnd: deliveryRangeEnd ?? null,
      pickupRangeStart: pickupRangeStart ?? null,
      pickupRangeEnd: pickupRangeEnd ?? null,
      pickupAddressPrecise: pickupAddressPrecise || '',
      pickupAddressCityLine,
      weekSlots,
    };
  }, [order]);

  const hasOrderMessage = Boolean(order?.message?.trim());
  const hasPickupAddressPrecise = Boolean(orderCalendar?.pickupAddressPrecise?.trim());
  const hasPickupAddressCity = Boolean(orderCalendar?.pickupAddressCityLine?.trim());
  const hasGenericDetails = Boolean(details?.length);
  const hasProfileContacts = Boolean(
    profile?.city ||
      profile?.postcode ||
      profile?.website ||
      profile?.phonePublic ||
      profile?.contactEmailPublic
  );

  const filterOptions = React.useMemo<FilterOption[]>(() => {
    if (kind === 'order') {
      return [
        { id: 'hero', label: 'Entete' },
        ...(hasOrderMessage ? [{ id: 'message', label: 'Message commande' }] : []),
        { id: 'products', label: 'Produits commande' },
        { id: 'calendar', label: 'Calendrier commande' },
        ...(hasPickupAddressPrecise ? [{ id: 'pickupAddressPrecise', label: 'Adresse precise retrait' }] : []),
        ...(hasPickupAddressCity ? [{ id: 'pickupAddressCity', label: 'Code postal + ville retrait' }] : []),
        { id: 'qrUrl', label: 'QR code + URL' },
      ];
    }
    if (kind === 'product') {
      return [
        { id: 'hero', label: 'Hero produit' },
        { id: 'parcours', label: 'Parcours produit' },
        { id: 'repartition', label: 'Repartition prix' },
        { id: 'qrUrl', label: 'QR code + URL' },
      ];
    }
    if (kind === 'profile') {
      return [
        { id: 'hero', label: 'Hero profil' },
        ...(hasProfileContacts ? [{ id: 'contacts', label: 'Contacts publics' }] : []),
        { id: 'qrUrl', label: 'QR code + URL' },
      ];
    }
    return [
      { id: 'hero', label: 'Entete' },
      ...(hasGenericDetails ? [{ id: 'details', label: 'Details' }] : []),
      { id: 'qrUrl', label: 'QR code + URL' },
    ];
  }, [hasGenericDetails, hasOrderMessage, hasPickupAddressCity, hasPickupAddressPrecise, hasProfileContacts, kind]);

  React.useEffect(() => {
    if (!open) return;
    const nextState: Record<string, boolean> = {};
    filterOptions.forEach((option) => {
      nextState[option.id] = true;
    });
    setSectionVisibility(nextState);
    setFiltersOpen(false);
  }, [filterOptions, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !filtersOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filterPanelRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [filtersOpen, open]);

  const qrUrl = React.useMemo(() => {
    const safeLink = link || (typeof window !== 'undefined' ? window.location.href : '');
    return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(safeLink)}`;
  }, [link]);

  const canCopy = Boolean(link);
  const handleCopy = React.useCallback(() => {
    const text = link || (typeof window !== 'undefined' ? window.location.href : '');
    if (!text) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success('Lien copie dans le presse-papier'))
      .catch(() => toast.error('Impossible de copier le lien'));
  }, [link]);

  const clearPrintMode = React.useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.remove(PRINT_MODE_CLASS);
    document.body.style.removeProperty('--share-print-scale');
    document.body.style.removeProperty('--share-print-inverse-scale');
  }, []);

  React.useEffect(() => {
    return () => clearPrintMode();
  }, [clearPrintMode]);

  const handlePrint = React.useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const targetWidthPx = PRINT_WIDTH_MM * PX_PER_MM;
    const targetHeightPx = PRINT_HEIGHT_MM * PX_PER_MM;
    const card = cardRef.current;
    const previousCardScrollTop = card?.scrollTop ?? 0;
    const previousCardScrollLeft = card?.scrollLeft ?? 0;
    const previousWindowScrollX = window.scrollX;
    const previousWindowScrollY = window.scrollY;

    if (card) {
      card.scrollTop = 0;
      card.scrollLeft = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    const canvas = printCanvasRef.current;

    let computedScale = 1;
    if (canvas) {
      const clone = canvas.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.share-overlay__hide-print').forEach((element) => {
        (element as HTMLElement).style.display = 'none';
      });
      clone.style.position = 'fixed';
      clone.style.left = '-10000px';
      clone.style.top = '0';
      clone.style.width = `${targetWidthPx}px`;
      clone.style.maxWidth = `${targetWidthPx}px`;
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.transform = 'none';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '-1';
      document.body.appendChild(clone);
      const measuredHeight = clone.getBoundingClientRect().height || clone.scrollHeight || targetHeightPx;
      document.body.removeChild(clone);
      if (measuredHeight > 0) {
        computedScale = Math.min(1, targetHeightPx / measuredHeight);
      }
    }

    const safeScale =
      Number.isFinite(computedScale) && computedScale > 0 ? Math.max(0.1, Math.min(1, computedScale * 0.96)) : 1;
    document.body.style.setProperty('--share-print-scale', safeScale.toFixed(4));
    document.body.style.setProperty('--share-print-inverse-scale', (1 / safeScale).toFixed(4));
    document.body.classList.add(PRINT_MODE_CLASS);

    const restoreAfterPrint = () => {
      clearPrintMode();
      if (card) {
        card.scrollTop = previousCardScrollTop;
        card.scrollLeft = previousCardScrollLeft;
      }
      window.scrollTo({ top: previousWindowScrollY, left: previousWindowScrollX, behavior: 'auto' });
    };

    const onAfterPrint = () => {
      restoreAfterPrint();
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);
    window.print();
    // Fallback when `afterprint` is not fired reliably.
    window.setTimeout(() => {
      restoreAfterPrint();
      window.removeEventListener('afterprint', onAfterPrint);
    }, 1200);
  }, [clearPrintMode]);

  const isSectionVisible = React.useCallback(
    (sectionId: string) => {
      if (!(sectionId in sectionVisibility)) return true;
      return sectionVisibility[sectionId];
    },
    [sectionVisibility]
  );

  const handleBackdropMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose]
  );

  const renderOrderVariant = () => {
    if (!order) return null;
    return (
      <>
        {isSectionVisible('hero') && (
          <section className="share-overlay__section share-overlay__hero">
            <h2 className="share-overlay__title">{order.title || title}</h2>
            <div className="share-overlay__avatars-line">
              <span className="share-overlay__avatar-frame">
                <Avatar
                  supabaseClient={supabaseClient ?? null}
                  path={order.sharerAvatarPath ?? null}
                  updatedAt={order.sharerAvatarUpdatedAt ?? null}
                  fallbackSrc={DEFAULT_PROFILE_AVATAR}
                  alt={order.sharerName}
                  className="share-overlay__avatar-img"
                />
              </span>
              <span className="share-overlay__avatar-arrow" aria-hidden="true">
                {'->'}
              </span>
              <span className="share-overlay__avatar-frame">
                <Avatar
                  supabaseClient={supabaseClient ?? null}
                  path={order.producerAvatarPath ?? null}
                  updatedAt={order.producerAvatarUpdatedAt ?? null}
                  fallbackSrc={DEFAULT_PROFILE_AVATAR}
                  alt={order.producerName}
                  className="share-overlay__avatar-img"
                />
              </span>
            </div>
            <p className="share-overlay__subtitle">
              <strong>{order.sharerName}</strong> se procure des produits chez <strong>{order.producerName}</strong>.
            </p>
          </section>
        )}

        {isSectionVisible('message') && order.message && (
          <section className="share-overlay__section share-overlay__callout">
            <p className="share-overlay__section-label">Message du partageur</p>
            <p className="share-overlay__body-text share-overlay__body-text--multiline">{order.message}</p>
          </section>
        )}

        {isSectionVisible('products') && (
          <section className="share-overlay__section share-overlay__order-products-section">
            <div className="share-overlay__section-head share-overlay__order-products-head">
              <h3>Les produits de la commande</h3>
              <span className="share-overlay__order-products-count">
                {order.products.length} produit{order.products.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="share-overlay__order-product-grid">
              {order.products.map((item) => {
                const hasPrice = item.price > 0;
                const measurementLabel = item.measurement === 'kg' ? '/ Kg' : '/ unite';
                const sanitizedUnitLabel = (item.unit || '').trim();
                const weightLabel = item.measurement === 'unit' ? formatUnitWeightLabel(item.weightKg) : '';
                const measurementDetails = [sanitizedUnitLabel, weightLabel].filter(Boolean).join(' ');
                const measurementInline = measurementDetails
                  ? `${measurementLabel} (${measurementDetails})`
                  : measurementLabel;
                return (
                  <article key={item.id} className="share-overlay__order-product-card">
                    <div className="share-overlay__order-product-image-wrap">
                      <ImageWithFallback
                        src={item.imageUrl}
                        alt={item.name}
                        className="share-overlay__order-product-image"
                      />
                    </div>
                    <div className="share-overlay__order-product-content">
                      <div className="share-overlay__order-product-topline">
                        <p className="share-overlay__order-product-producer">{item.producerName}</p>
                        {item.category ? <span className="share-overlay__order-product-category">{item.category}</span> : null}
                      </div>
                      <p className="share-overlay__order-product-title">{item.name}</p>
                      <div className="share-overlay__order-product-pricing">
                        <p className="share-overlay__order-product-price-main">
                          {hasPrice ? formatCurrency(item.price) : 'Prix a venir'}
                        </p>
                        {hasPrice ? <p className="share-overlay__order-product-unit">{measurementInline}</p> : null}
                      </div>
                      {item.producerLocation ? (
                        <p className="share-overlay__order-product-location">{item.producerLocation}</p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {isSectionVisible('calendar') && (
          <section className="share-overlay__section">
            <div className="share-overlay__section-head">
              <h3>Calendrier de la commande</h3>
              <span>
                {orderCalendar?.months.length === 2
                  ? `${orderCalendar.months[0].monthLabel} - ${orderCalendar.months[1].monthLabel}`
                  : orderCalendar?.months[0]?.monthLabel ?? 'Date a confirmer'}
              </span>
            </div>
            {orderCalendar ? (
              <>
                <div className="share-overlay__calendar-legend">
                  <span className="share-overlay__calendar-legend-item">
                    <span className="share-overlay__calendar-legend-swatch share-overlay__calendar-legend-swatch--deadline" />
                    Commande
                  </span>
                  <span className="share-overlay__calendar-legend-item">
                    <span className="share-overlay__calendar-legend-swatch share-overlay__calendar-legend-swatch--delivery" />
                    Livraison
                  </span>
                  <span className="share-overlay__calendar-legend-item">
                    <span className="share-overlay__calendar-legend-swatch share-overlay__calendar-legend-swatch--pickup" />
                    Récuperation
                  </span>
                </div>
                {(() => {
                  const addressLine = [
                    isSectionVisible('pickupAddressPrecise') ? orderCalendar.pickupAddressPrecise : '',
                    isSectionVisible('pickupAddressCity') ? orderCalendar.pickupAddressCityLine : '',
                  ]
                    .filter(Boolean)
                    .join(', ');
                  if (!addressLine) return null;
                  return (
                  <div className="share-overlay__calendar-address">
                    <p>
                      Adresse: <strong>{addressLine}</strong>
                    </p>
                  </div>
                  );
                })()}
                <div className={`share-overlay__calendar-months ${orderCalendar.months.length === 2 ? 'share-overlay__calendar-months--two' : ''}`}>
                  {orderCalendar.months.map((month) => (
                    <article key={month.key} className="share-overlay__calendar-month">
                      <p className="share-overlay__calendar-month-title">{month.monthLabel}</p>
                      <div className="share-overlay__calendar-grid">
                        {ORDER_CALENDAR_WEEKDAYS.map((day) => (
                          <div key={`${month.key}-${day}`} className="share-overlay__calendar-weekday">
                            {day}
                          </div>
                        ))}
                        {month.days.map((day, index) => {
                          if (!day) {
                            return <div key={`${month.key}-empty-${index}`} className="share-overlay__calendar-day share-overlay__calendar-day--empty" />;
                          }
                          const key = toDateKey(day);
                          const markers = orderCalendar.markersByDate.get(key);
                          const isDeadline = Boolean(markers?.has('deadline'));
                          const isDelivery = Boolean(markers?.has('delivery'));
                          const isPickup = Boolean(markers?.has('pickup'));
                          const isInOpenRange = isDateInRange(day, orderCalendar.openRangeStart, orderCalendar.openRangeEnd);
                          const isInDeliveryRange = isDateInRange(
                            day,
                            orderCalendar.deliveryRangeStart,
                            orderCalendar.deliveryRangeEnd
                          );
                          const isInPickupRange = isDateInRange(day, orderCalendar.pickupRangeStart, orderCalendar.pickupRangeEnd);
                          const classNames = ['share-overlay__calendar-day'];
                          if (isInPickupRange) classNames.push('share-overlay__calendar-day--pickup-window');
                          else if (isInDeliveryRange) classNames.push('share-overlay__calendar-day--delivery-window');
                          else if (isInOpenRange) classNames.push('share-overlay__calendar-day--open-window');
                          if (isDeadline) classNames.push('share-overlay__calendar-day--marker-deadline');
                          if (isDelivery) classNames.push('share-overlay__calendar-day--marker-delivery');
                          if (isPickup) classNames.push('share-overlay__calendar-day--marker-pickup');
                          return (
                            <div key={`${month.key}-${key}`} className={classNames.join(' ')}>
                              <span className="share-overlay__calendar-day-number">{day.getDate()}</span>
                              {(isDeadline || isDelivery || isPickup) && (
                                <span className="share-overlay__calendar-day-dots" aria-hidden="true">
                                  {isDeadline && <span className="share-overlay__calendar-dot share-overlay__calendar-dot--deadline" />}
                                  {isDelivery && <span className="share-overlay__calendar-dot share-overlay__calendar-dot--delivery" />}
                                  {isPickup && <span className="share-overlay__calendar-dot share-overlay__calendar-dot--pickup" />}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
                {orderCalendar.weekSlots.length ? (
                  <div className="share-overlay__calendar-week-slots">
                    {orderCalendar.weekSlots.map((slot) => (
                      <span key={slot.id} className="share-overlay__calendar-week-slot-chip">
                        {slot.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="share-overlay__body-text">Le calendrier de retrait sera confirme prochainement.</p>
            )}
          </section>
        )}
      </>
    );
  };

  const renderProductVariant = () => {
    if (!product) return null;
    const producerLabel = detail?.producer?.name || product.producerName;
    const producerCity = detail?.producer?.city || product.producerLocation;
    const category = detail?.category || product.category;
    return (
      <>
        {isSectionVisible('hero') && (
          <section className="share-overlay__section share-overlay__hero-product">
            <div className="share-overlay__hero-product-media">
              <img src={product.imageUrl} alt={product.name} className="share-overlay__hero-product-image" />
            </div>
            <div className="share-overlay__hero-product-main">
              <span className="share-overlay__badge">{category || 'Produit local'}</span>
              <h2 className="share-overlay__title">{product.name}</h2>
              <p className="share-overlay__subtitle">
                <strong>{producerLabel}</strong> - {producerCity || 'Ville proche'}
              </p>
              <p className="share-overlay__price">
                {product.price > 0 ? formatCurrency(product.price) : 'Prix a venir'}
                {product.price > 0 ? ` / ${product.unit}` : ''}
              </p>
              <p className="share-overlay__body-text">{detail?.longDescription || description || product.description}</p>
            </div>
          </section>
        )}

        {isSectionVisible('parcours') && (
          <section className="share-overlay__section">
            <div className="share-overlay__section-head">
              <h3>Parcours du produit</h3>
              <span>{productTimelineSteps.length} etape{productTimelineSteps.length > 1 ? 's' : ''}</span>
            </div>
            {productTimelineSteps.length ? (
              <ol className="share-overlay__timeline">
                {productTimelineSteps.map((step) => (
                  <li key={step.id} className="share-overlay__timeline-item">
                    <div className="share-overlay__timeline-index" aria-hidden="true" />
                    <div>
                      <p className="share-overlay__timeline-title">{step.label}</p>
                      <p className="share-overlay__timeline-meta">
                        {step.location}
                        {step.date ? ` - ${step.date}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="share-overlay__body-text">Parcours detaille a consulter directement sur la page produit.</p>
            )}
          </section>
        )}

        {isSectionVisible('repartition') && (
          <section className="share-overlay__section">
            <div className="share-overlay__section-head">
              <h3>Repartition du prix</h3>
              <span>{detail?.repartitionValeur?.mode === 'detaille' ? 'Montants exacts' : 'Montants estimatifs'}</span>
            </div>
            {productBreakdownPie.slices.length ? (
              <div className="share-overlay__pie-layout">
                <div className="share-overlay__pie-chart" style={{ backgroundImage: productBreakdownPie.gradient }}>
                  <div className="share-overlay__pie-center">
                    <span>Total</span>
                    <strong>{productBreakdownPie.totalLabel}</strong>
                  </div>
                </div>
                <ul className="share-overlay__pie-legend">
                  {productBreakdownPie.slices.map((slice) => (
                    <li key={slice.label} className="share-overlay__pie-legend-row">
                      <div className="share-overlay__pie-legend-label">
                        <span className="share-overlay__pie-swatch" style={{ backgroundColor: slice.color }} aria-hidden="true" />
                        <span>{slice.label}</span>
                      </div>
                      <div className="share-overlay__pie-legend-value">
                        <strong>{slice.type === 'percent' ? `${slice.value}%` : formatCurrency(slice.value)}</strong>
                        <span>{slice.percent.toFixed(1)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="share-overlay__body-text">La repartition sera visible des que le producteur aura renseigne les postes.</p>
            )}
          </section>
        )}
      </>
    );
  };

  const renderProfileVariant = () => {
    if (!profile) return null;
    const roleLabel =
      profile.role === 'producer' ? 'Producteur' : profile.role === 'sharer' ? 'Partageur' : 'Participant';
    const accountTypeLabel = getAccountTypeLabel(profile.accountType);
    return (
      <>
        {isSectionVisible('hero') && (
          <section className="share-overlay__section share-overlay__hero-profile">
            <span className="share-overlay__profile-avatar-frame">
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={profile.avatarPath ?? null}
                updatedAt={profile.avatarUpdatedAt ?? null}
                fallbackSrc={DEFAULT_PROFILE_AVATAR}
                alt={profile.name}
                className="share-overlay__avatar-img"
              />
            </span>
            <div className="share-overlay__profile-main">
              <h2 className="share-overlay__title">{profile.name}</h2>
              <p className="share-overlay__subtitle">@{profile.handle ?? profile.name.toLowerCase().replace(/\s+/g, '')}</p>
              <div className="share-overlay__chips">
                <span className="share-overlay__chip share-overlay__chip--warm">{roleLabel}</span>
                {profile.verified && <span className="share-overlay__chip share-overlay__chip--cool">Vérifié</span>}
                {accountTypeLabel ? <span className="share-overlay__chip">{accountTypeLabel}</span> : null}
              </div>
              {profile.tagline ? <p className="share-overlay__body-text share-overlay__body-text--multiline">{profile.tagline}</p> : null}
            </div>
          </section>
        )}

        {isSectionVisible('contacts') && hasProfileContacts && (
          <section className="share-overlay__section">
            <div className="share-overlay__section-head">
              <h3>Contacts publics</h3>
            </div>
            <ul className="share-overlay__contact-list">
              {[profile.postcode, profile.city].filter(Boolean).length ? (
                <li>{[profile.postcode, profile.city].filter(Boolean).join(' ')}</li>
              ) : null}
              {profile.website ? <li>{profile.website}</li> : null}
              {profile.phonePublic ? <li>{profile.phonePublic}</li> : null}
              {profile.contactEmailPublic ? <li>{profile.contactEmailPublic}</li> : null}
            </ul>
          </section>
        )}
      </>
    );
  };

  const renderGenericVariant = () => (
    <>
      {isSectionVisible('hero') && (
        <section className="share-overlay__section share-overlay__hero">
          <h2 className="share-overlay__title">{title}</h2>
          {subtitle ? <p className="share-overlay__subtitle">{subtitle}</p> : null}
          {description ? <p className="share-overlay__body-text">{description}</p> : null}
        </section>
      )}

      {isSectionVisible('details') && details?.length ? (
        <section className="share-overlay__section">
          <div className="share-overlay__details-grid">
            {details.map((item) => (
              <article key={`${item.label}-${item.value}`} className="share-overlay__detail-card">
                <p className="share-overlay__detail-label">{item.label}</p>
                <p className="share-overlay__detail-value">{item.value}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  const renderVariantContent = () => {
    if (kind === 'order') return renderOrderVariant();
    if (kind === 'product') return renderProductVariant();
    if (kind === 'profile') return renderProfileVariant();
    return renderGenericVariant();
  };

  if (!open) return null;

  const content = (
    <div
      className="share-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Fenetre de partage"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="share-overlay__card" ref={cardRef} onMouseDown={(event) => event.stopPropagation()}>
        <div className="share-overlay__print-canvas" ref={printCanvasRef}>
          <header className="share-overlay__header">
            <Logo className="text-[#FF6B4A]" />
            <div className="share-overlay__actions">
              <div className="share-overlay__filter" ref={filterPanelRef}>
                <button
                  type="button"
                  className="share-overlay__action-button share-overlay__hide-print"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-expanded={filtersOpen}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filtres
                </button>
                {filtersOpen && (
                  <div className="share-overlay__filter-panel">
                    <p className="share-overlay__filter-title">Sections affichees</p>
                    {filterOptions.map((option) => (
                      <label key={option.id} className="share-overlay__filter-row">
                        <input
                          type="checkbox"
                          checked={isSectionVisible(option.id)}
                          onChange={() =>
                            setSectionVisibility((prev) => ({
                              ...prev,
                              [option.id]: !isSectionVisible(option.id),
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="share-overlay__action-button share-overlay__hide-print"
                onClick={handlePrint}
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </button>
              <button
                type="button"
                className="share-overlay__close-button share-overlay__hide-print"
                onClick={onClose}
                aria-label="Fermer la fenetre de partage"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="share-overlay__body">
            {renderVariantContent()}

            {isSectionVisible('qrUrl') && (
              <section className="share-overlay__section share-overlay__qr-section">
                <div className="share-overlay__qr-box">
                  <img src={qrUrl} alt="QR code vers la page a partager" />
                </div>
                <div className="share-overlay__link-box">
                  <p className="share-overlay__section-label">Lien direct</p>
                  <p className="share-overlay__link-value">{link}</p>
                  <p className="share-overlay__body-text">
                    Scannez ce QR code ou utilisez le lien pour ouvrir cette page directement.
                  </p>
                  <button
                    type="button"
                    className="share-overlay__copy-button share-overlay__hide-print"
                    onClick={handleCopy}
                    disabled={!canCopy}
                  >
                    <Copy className="w-4 h-4" />
                    Copier le lien
                  </button>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
