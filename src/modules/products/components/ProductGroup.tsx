import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart, MapPin, ShoppingCart } from 'lucide-react';
import { Product, GroupOrder } from '../../../shared/types';
import { Avatar } from '../../../shared/ui/Avatar';
import { ImageWithFallback } from '../../../shared/ui/ImageWithFallback';
import { eurosToCents, formatEurosFromCents } from '../../../shared/lib/money';
import { formatUnitWeightLabel } from '../utils/weight';
import { getOrderStatusLabel, getOrderStatusProgress } from '../../orders/utils/orderStatus';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_GAP,
  MAX_VISIBLE_CARDS,
  MIN_VISIBLE_CARDS,
  CONTAINER_SIDE_PADDING,
} from '../../../shared/constants/cards';
import { DEMO_MODE } from '../../../shared/config/demoMode';
import '../styles/ProductsLanding.css';

type ProductGroupVariant = 'producer' | 'order';

export interface ProductGroupDescriptor {
  id: string;
  title: string;
  location: string;
  tags: string[];
  products: Product[];
  variant: ProductGroupVariant;
  orderId?: string;
  status?: GroupOrder['status'];
  profileHandle?: string;
  sharerName?: string;
  sharerPercentage?: number;
  minWeight?: number;
  maxWeight?: number;
  orderedWeight?: number;
  deliveryFeeCents?: number;
  deadline?: Date;
  statusUpdatedAt?: Date;
  avatarUrl?: string;
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
}

export type ProductOpenContext = {
  orderCode?: string | null;
  lotCode?: string | null;
};

const productFilterOptions = [
  { id: 'fruits-legumes', label: 'Fruits & Légumes' },
  { id: 'poissons-fruits-de-mer', label: 'Poissons & Fruits de mer' },
  { id: 'viandes', label: 'Viandes' },
  { id: 'charcuteries', label: 'Charcuteries' },
  { id: 'traiteurs', label: 'Traiteurs' },
  { id: 'fromages-cremerie', label: 'Fromages & Crèmerie' },
  { id: 'epicerie-sucree', label: 'Épicerie Sucrée' },
  { id: 'epicerie-salee', label: 'Épicerie Salée' },
  { id: 'boissons', label: 'Boissons' },
  { id: 'beaute-bien-etre', label: 'Beauté & Bien-être' },
];

const heroCategoryFilters = [
  {
    id: 'fruits-legumes',
    label: 'Fruits & légumes',
    icon: '🥦',
    filters: ['fruits-legumes'],
  },
  {
    id: 'viandes-poissons',
    label: 'Viandes & poissons',
    icon: '🍖',
    filters: ['viandes', 'poissons-fruits-de-mer'],
  },
  {
    id: 'cremerie-traiteur',
    label: 'Crémerie & traiteur',
    icon: '🧀',
    filters: ['fromages-cremerie', 'traiteurs'],
  },
  {
    id: 'epicerie',
    label: 'Épicerie',
    icon: '🍯',
    filters: ['epicerie-sucree', 'epicerie-salee'],
  },
  {
    id: 'boissons',
    label: 'Boissons',
    icon: '🍷',
    filters: ['boissons'],
  },
  {
    id: 'beaute-bien-etre',
    label: 'Beauté & bien-être',
    icon: '🌿',
    filters: ['beaute-bien-etre'],
  },
];

const attributeFilterOptions = [
  { id: 'bio', label: 'Bio' },
  { id: 'sans-nitrite', label: 'Sans nitrite' },
  { id: 'aop', label: 'AOP' },
  { id: 'label-rouge', label: 'Label Rouge' },
];

const producerFilterOptions = [
  { id: 'eleveur', label: 'Éleveur' },
  { id: 'maraicher', label: 'Maraîcher' },
  { id: 'arboriculteur', label: 'Arboriculteur' },
  { id: 'cerealier', label: 'Céréalier' },
  { id: 'producteur-laitier-fromager', label: 'Producteur laitier / fromager' },
  { id: 'apiculteur', label: 'Apiculteur' },
  { id: 'viticulteur-cidriculteur-brasseur', label: 'Viticulteur / Cidriculteur / Brasseur' },
  { id: 'pisciculteur-conchyliculteur', label: 'Pisciculteur / Conchyliculteur' },
  { id: 'autre', label: 'Autre' },
];

const producerTagLabelMap: Record<string, string> = producerFilterOptions.reduce(
  (acc, option) => ({ ...acc, [option.id]: option.label }),
  {} as Record<string, string>
);

const producerTagsMap: Record<string, string[]> = {
  'current-user': ['maraicher'],
  p2: ['apiculteur'],
  p3: ['viticulteur-cidriculteur-brasseur'],
  p4: ['eleveur'],
  p5: ['autre'],
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => Boolean(value && UUID_REGEX.test(value));

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const slugify = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, '-');

const parseDistanceKm = (value: string) => {
  const match = value.match(/([\d,.]+)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
};

const stripDistance = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/\s*[-–—]?\s*\d+(?:[.,]\d+)?\s*km/gi, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
};

const extractPostcode = (value?: string) => {
  if (!value) return undefined;
  const match = value.match(/\b(75\d{3}|\d{5})\b/);
  return match ? match[1] : undefined;
};

const formatParisArrondissement = (postcode?: string | null) => {
  if (!postcode) return null;
  const match = `${postcode}`.match(/75(\d{3})/);
  if (!match) return null;
  const arrondissement = parseInt(match[1].slice(-2), 10);
  if (!Number.isFinite(arrondissement) || arrondissement < 1 || arrondissement > 20) return null;
  const suffix = arrondissement === 1 ? '1er' : `${arrondissement}e`;
  return `Paris ${suffix}`;
};

const extractCityFromAddressLike = (value?: string) => {
  if (!value) return '';
  const stripped = stripDistance(value);
  const parts = stripped.split(',').map((part) => part.trim()).filter(Boolean);
  const lastPart = parts.length ? parts[parts.length - 1] : stripped;
  const postcodeCity = lastPart.match(/\b\d{4,5}\s+(.+)/);
  if (postcodeCity) return postcodeCity[1].trim();
  return lastPart.replace(/\b\d{4,5}\b/g, '').trim();
};

const formatCityLabel = (city?: string, postcode?: string, fallback?: string) => {
  const normalizedCity = city?.trim();
  const fromFallbackPostcode = extractPostcode(fallback);
  const parisLabel = formatParisArrondissement(postcode ?? fromFallbackPostcode);
  if (parisLabel && (!normalizedCity || normalizedCity.toLowerCase() === 'paris')) {
    return parisLabel;
  }
  if (normalizedCity) return normalizedCity;
  const coarse = extractCityFromAddressLike(fallback);
  return coarse || 'Proche de vous';
};

const getProducerCategoryLabel = (tags: string[]) => {
  const label = tags.map((tag) => producerTagLabelMap[tag]).filter(Boolean)[0];
  return label || producerTagLabelMap.autre || 'Autre';
};

const getProductAttributes = (product: Product) => {
  const normalized = normalizeText(`${product.name} ${product.description}`);
  const distance = parseDistanceKm(product.producerLocation);
  const attributes = new Set<string>();

  if (normalized.includes('bio')) attributes.add('bio');
  if (normalized.includes('sans nitrite')) attributes.add('sans-nitrite');
  if (distance !== null && distance <= 25) attributes.add('circuit-court');
  if (product.measurement === 'kg') attributes.add('vrac');

  return attributes;
};

const hasActiveLot = (product: Product) => Boolean(product.activeLotCode ?? product.activeLotId);
export const hasValidLotPrice = (product: Product) =>
  DEMO_MODE ? Number(product.price) > 0 : hasActiveLot(product) && Number(product.price) > 0;

const resolveOrderEffectiveWeightKg = (orderedWeight: number, minWeight: number, maxWeight?: number) => {
  const current = Math.max(0, orderedWeight ?? 0);
  const min = Math.max(0, minWeight ?? 0);
  if (Number.isFinite(maxWeight) && (maxWeight ?? 0) > 0) {
    return Math.min(Math.max(current, min), maxWeight ?? 0);
  }
  return Math.max(current, min);
};

const getProductWeightKg = (product: { weightKg?: number; unit?: string; measurement?: 'unit' | 'kg' }) => {
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
};

export function ProductResultCard({
  product,
  related: _related,
  canSave,
  inDeck,
  onSave,
  onRemove,
  onToggleSelection,
  onOpenProducer,
  onCreateOrder,
  onOpen,
  showSelectionControl,
  compact = false,
  cardWidth = CARD_WIDTH,
  priceLabelOverride,
}: {
  product: Product;
  related: Product[];
  canSave: boolean;
  inDeck: boolean;
  onSave?: (product: Product) => void;
  onRemove?: (productId: string) => void;
  onToggleSelection?: (product: Product, isSelected: boolean) => void;
  onOpenProducer?: (product: Product) => void;
  onCreateOrder?: (product: Product) => void;
  onOpen: (productId: string) => void;
  showSelectionControl?: boolean;
  compact?: boolean;
  cardWidth?: number;
  priceLabelOverride?: string;
}) {
  const [heartPulse, setHeartPulse] = React.useState(false);
  const [selected, setSelected] = React.useState(inDeck);
  React.useEffect(() => {
    setSelected(inDeck);
  }, [inDeck]);
  const measurementLabel = product.measurement === 'kg' ? '/ Kg' : '/ unité';
  const hasPrice = hasValidLotPrice(product);
  const priceLabel =
    priceLabelOverride ?? (hasPrice ? formatEurosFromCents(eurosToCents(product.price)) : 'Prix a venir');
  const canShowPriceDetails = Boolean(priceLabelOverride) || hasPrice;
  const width = cardWidth ?? CARD_WIDTH;
  const cardStyle = {
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
    flex: '0 0 auto',
    minHeight: `${CARD_HEIGHT}px`,
    height: `${CARD_HEIGHT}px`,
  };
  const sanitizedUnitLabel = (product.unit || '').trim();
  const weightLabel =
    product.measurement === 'unit' ? formatUnitWeightLabel(product.weightKg) : '';
  const measurementDetails = [sanitizedUnitLabel];
  if (weightLabel) {
    measurementDetails.push(weightLabel);
  }
  const measurementDescription = measurementDetails.filter(Boolean).join(' ');
  const measurementParenthetical = measurementDescription ? (
    <span className="measurement-parenthetical">({measurementDescription})</span>
  ) : null;
  const measurementInlineLabel = measurementParenthetical ? (
    <>
      {measurementLabel} {measurementParenthetical}
    </>
  ) : (
    measurementLabel
  );
  const imageStyle = { height: '105px' };
  const headerText = product.producerName?.trim() ?? '';
  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHeartPulse(true);
    setSelected((prev) => !prev);
    window.setTimeout(() => setHeartPulse(false), 180);
    if (onToggleSelection) {
      onToggleSelection(product, inDeck);
      return;
    }
    if (inDeck && onRemove) {
      onRemove(product.id);
      return;
    }
    if (!inDeck && onSave) {
      onSave(product);
    }
  };

  const allowSelection = showSelectionControl ?? canSave;
  const showSelectionButton = allowSelection && Boolean(onToggleSelection || onSave || onRemove);

  return (
    <div
      className="bg-white rounded-2xl border border-[#F1E3DA] shadow-[0_12px_30px_-18px_rgba(31,41,55,0.35)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow flex-shrink-0 h-full"
      style={cardStyle}
    >
    <div
      className="relative w-full overflow-hidden products-landing__group-image"
      style={imageStyle}
    >
        <ImageWithFallback
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
        />
        {showSelectionButton && (
          <button
            type="button"
            onClick={handleHeartClick}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 160ms ease-out',
              transform: heartPulse ? 'scale(0.95)' : 'scale(0.85)',
              pointerEvents: 'auto',
              zIndex: 20,
            }}
            aria-label={selected ? 'Retirer de la sélection' : 'Ajouter à la sélection'}
            aria-pressed={selected}
          >
            <Heart
              className="transition-colors"
              style={{ width: 20, height: 20 }}
              stroke={selected ? '#FF6B4A' : '#FF3B1F'}
              fill={selected ? '#FF6B4A' : 'transparent'}
              strokeWidth={1.8}
            />
          </button>
        )}
      </div>
      <div
        className="p-3.5 space-y-2 flex-1 flex flex-col"
        style={{ paddingLeft: '4px' }}
      >
        <div className="space-y-1 min-w-0">
          {headerText && (
            <button
              type="button"
              onClick={() => onOpenProducer?.(product)}
              className="block w-full text-xs text-[#6B7280] truncate text-left hover:text-[#FF6B4A] transition-colors"
            >
              {headerText}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(product.productCode ?? product.id)}
            className="block w-full text-left text-base font-semibold text-[#1F2937] hover:text-[#FF6B4A] transition-colors"
          >
            {product.name}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#1F2937] flex-wrap">
          <span className="text-lg font-semibold text-[#FF6B4A]">
            {priceLabel}
          </span>
              {canShowPriceDetails ? (
                <span className="text-[10px] px-0 py-0.5 text-[#374151] bg-transparent">
                  {measurementInlineLabel}
                </span>
              ) : null}
        </div>

        
      </div>
    </div>
  );
}

export function ProductGroupContainer({
  group,
  canSave,
  deckIds,
  supabaseClient,
  onSave,
  onRemoveFromDeck,
  onToggleSelection,
  onCreateOrder,
  onOpenProduct,
  onOpenOrder,
  onOpenProducer,
  onOpenSharer,
  onSelectProducerCategory,
  selected,
  showSelectionControl,
  orderActionLabel,
}: {
  group: ProductGroupDescriptor;
  canSave: boolean;
  deckIds: Set<string>;
  onSave?: (product: Product) => void;
  onRemoveFromDeck?: (productId: string) => void;
  onToggleSelection?: (product: Product, isSelected: boolean) => void;
  onCreateOrder?: (product: Product) => void;
  onOpenProduct: (productId: string, context?: ProductOpenContext) => void;
  onOpenOrder?: (orderId: string) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenSharer?: (sharerName: string) => void;
  onSelectProducerCategory?: (tag: string) => void;
  selected?: boolean;
  showSelectionControl?: boolean;
  supabaseClient?: SupabaseClient | null;
  orderActionLabel?: string;
}) {
  const navigate = useNavigate();
  const useCarousel = group.products.length > MAX_VISIBLE_CARDS;
  const [headerHover, setHeaderHover] = React.useState(false);
  const [bodyHover, setBodyHover] = React.useState(false);
  const [supportsHover, setSupportsHover] = React.useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const isOrder = group.variant === 'order';
  const firstProduct = group.products[0];
  const orderAvatarFallback = DEFAULT_PROFILE_AVATAR;
  const hasAvatar = true;
  const orderActionText = orderActionLabel ?? 'Participer';
  const orderCodeContext = isOrder ? group.orderId ?? null : null;

  // Index de départ des produits visibles dans le carrousel
  const [startIndex, setStartIndex] = React.useState(0);

  // borne pour ne pas dépasser la fin
  const maxIndex = Math.max(0, group.products.length - MAX_VISIBLE_CARDS);

  const canScrollLeft = useCarousel && startIndex > 0;
  const canScrollRight = useCarousel && startIndex < maxIndex;

  const visibleSlots = useCarousel
    ? MAX_VISIBLE_CARDS
    : Math.max(MIN_VISIBLE_CARDS, group.products.length);

  const containerMinWidth =
    MIN_VISIBLE_CARDS * CARD_WIDTH +
    (MIN_VISIBLE_CARDS - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2;
  const containerMaxWidth =
    visibleSlots * CARD_WIDTH +
    (visibleSlots - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2;

  const containerStyle: React.CSSProperties = {
    minWidth: `${containerMinWidth}px`,
    maxWidth: `${containerMaxWidth}px`,
    width: '100%',
    flex: '0 0 auto',
    paddingInline: CONTAINER_SIDE_PADDING,
  };
  const bodyPaddingStyle: React.CSSProperties = useCarousel
    ? { paddingBlock: CONTAINER_SIDE_PADDING, paddingInline: 0 }
    : { padding: CONTAINER_SIDE_PADDING };

  const hostLabel = isOrder
    ? group.sharerName || firstProduct?.producerName || group.title
    : getProducerCategoryLabel(group.tags);
  const shouldShowHostLabel = Boolean(hostLabel);

  const carouselGapPx = 8;
  const carouselStep = CARD_WIDTH + carouselGapPx;
  const carouselOffsetPx = useCarousel ? startIndex * carouselStep : 0;
  const carouselViewportMaxWidth =
    MAX_VISIBLE_CARDS * CARD_WIDTH + (MAX_VISIBLE_CARDS - 1) * carouselGapPx;
  const carouselTrackTransition = prefersReducedMotion
    ? 'none'
    : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';

  const orderPriceLabels = React.useMemo(() => {
    if (!isOrder) return null;
    const effectiveWeightKg = resolveOrderEffectiveWeightKg(
      group.orderedWeight ?? 0,
      group.minWeight ?? 0,
      group.maxWeight
    );
    const deliveryFeeCents = Number.isFinite(group.deliveryFeeCents ?? NaN) ? group.deliveryFeeCents ?? 0 : 0;
    const feePerKg = effectiveWeightKg > 0 ? deliveryFeeCents / effectiveWeightKg : 0;
    const sharerPercentage = group.sharerPercentage ?? 0;
    const shareFraction =
      sharerPercentage > 0 && sharerPercentage < 100
        ? sharerPercentage / (100 - sharerPercentage)
        : 0;
    const labels: Record<string, string> = {};
    group.products.forEach((product) => {
      if (!hasValidLotPrice(product)) return;
      const unitWeightKg = getProductWeightKg(product);
      const basePriceCents = eurosToCents(product.price);
      const unitDeliveryCents = Math.round(feePerKg * unitWeightKg);
      const basePlusDelivery = basePriceCents + unitDeliveryCents;
      const unitSharerFeeCents = Math.round(basePlusDelivery * shareFraction);
      const unitFinalPriceCents = basePlusDelivery + unitSharerFeeCents;
      labels[product.id] = formatEurosFromCents(unitFinalPriceCents);
    });
    return labels;
  }, [
    group.deliveryFeeCents,
    group.maxWeight,
    group.minWeight,
    group.orderedWeight,
    group.products,
    group.sharerPercentage,
    isOrder,
  ]);

  const goLeft = () => {
    if (!canScrollLeft) return;
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const goRight = () => {
    if (!canScrollRight) return;
    setStartIndex((prev) => Math.min(prev + 1, maxIndex));
  };

  React.useEffect(() => {
    setStartIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const handleOpenProduct = React.useCallback(
    (product: Product, productId: string) => {
      onOpenProduct(productId, {
        orderCode: orderCodeContext,
        lotCode: product.activeLotCode ?? null,
      });
    },
    [onOpenProduct, orderCodeContext]
  );

  const orderProgress = React.useMemo(() => {
    if (group.variant !== 'order') return null;
    const target = group.minWeight ?? group.maxWeight ?? 0;
    const current = Math.max(0, group.orderedWeight ?? 0);
    if (!(target > 0)) return { ratio: 0, label: null };
    const rawRatio = current / target;
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const percentLabel = `${Math.round(Math.max(0, rawRatio) * 100)}%`;
    return { ratio, label: percentLabel };
  }, [group.maxWeight, group.minWeight, group.orderedWeight, group.variant]);
  const orderStatusLabel =
    isOrder && group.status ? getOrderStatusLabel(group.status) : '';
  const statusProgress = React.useMemo(
    () => (isOrder ? getOrderStatusProgress(group.status) : null),
    [group.status, isOrder]
  );
  const statusProgressLabel = statusProgress ? `${statusProgress.step}/${statusProgress.total}` : '';
  const isOrderClosed = isOrder && group.status && group.status !== 'open';
  const stageDateLabel = React.useMemo(() => {
    if (!group.statusUpdatedAt) return null;
    const date = group.statusUpdatedAt instanceof Date ? group.statusUpdatedAt : new Date(group.statusUpdatedAt);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }, [group.statusUpdatedAt]);

  const availabilityProgress = React.useMemo(() => {
    if (group.variant !== 'producer') return null;
    const buckets = {
      kg: { total: 0, max: 0, count: 0 },
      unit: { total: 0, max: 0, count: 0 },
    };
    group.products.forEach((product) => {
      const quantity = Number.isFinite(product.quantity) ? Math.max(0, product.quantity) : 0;
      const bucket = product.measurement === 'kg' ? buckets.kg : buckets.unit;
      bucket.total += quantity;
      bucket.count += 1;
      bucket.max = Math.max(bucket.max, quantity);
    });
    const ratioParts = [
      buckets.kg.count && buckets.kg.max > 0
        ? buckets.kg.total / (buckets.kg.max * buckets.kg.count)
        : null,
      buckets.unit.count && buckets.unit.max > 0
        ? buckets.unit.total / (buckets.unit.max * buckets.unit.count)
        : null,
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const ratio = ratioParts.length
      ? Math.max(0, Math.min(1, ratioParts.reduce((sum, value) => sum + value, 0) / ratioParts.length))
      : 0;
    const formatQuantity = (value: number) => {
      const rounded = Math.round(value * 100) / 100;
      return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
    };
    const labelParts = [
      buckets.kg.total > 0 ? `${formatQuantity(buckets.kg.total)} kg` : null,
      buckets.unit.total > 0 ? `${formatQuantity(buckets.unit.total)} unités` : null,
    ].filter(Boolean);
    const label = labelParts.length ? `${labelParts.join(' + ')} disponibles` : 'Stock indisponible';
    return { ratio, label };
  }, [group.products, group.variant]);

  const deadlineLabel = React.useMemo(() => {
    if (group.variant !== 'order' || !group.deadline) return null;
    const date = group.deadline instanceof Date ? group.deadline : new Date(group.deadline);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }, [group.deadline, group.variant]);



  const handleAvatarClick = () => {
    const handle = group.profileHandle?.trim();
    if (handle) {
      navigate(`/profil/${handle}`);
      return;
    }
    if (isOrder) {
      if (group.sharerName) {
        onOpenSharer?.(group.sharerName);
        return;
      }
      if (firstProduct) {
        onOpenProducer?.(firstProduct);
        return;
      }
    }
    if (firstProduct) onOpenProducer?.(firstProduct);
  };

  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerDragRef = React.useRef<{ x: number; y: number; id?: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (!useCarousel) return;
    setBodyHover(true);
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const resetTouch = () => {
    touchStartRef.current = null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!useCarousel || !touchStartRef.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    resetTouch();
    setBodyHover(false);
    if (Math.abs(deltaX) < 6) return;
    if (deltaX < 0) {
      goRight();
    } else {
      goLeft();
    }
  };

  const handleTouchCancel = () => resetTouch();

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!useCarousel) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const targetEl = event.target as HTMLElement | null;
    if (targetEl && targetEl.closest('button')) return;
    pointerDragRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!useCarousel || !pointerDragRef.current) return;
    if (pointerDragRef.current.id !== undefined && pointerDragRef.current.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerDragRef.current.x;
    const deltaY = event.clientY - pointerDragRef.current.y;
    pointerDragRef.current = null;
    if (Math.abs(deltaX) < 30 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      goRight();
    } else {
      goLeft();
    }
  };

  const handlePointerCancel = () => {
    pointerDragRef.current = null;
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setSupportsHover(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  React.useEffect(() => {
    if (supportsHover) setOverlayOpen(false);
  }, [supportsHover]);

  const wheelLockRef = React.useRef(false);

  const handleWheel = (event: React.WheelEvent) => {
    if (!useCarousel) return;
    if (Math.abs(event.deltaX) < 5) return;
    if (wheelLockRef.current) return;
    wheelLockRef.current = true;
    window.setTimeout(() => {
      wheelLockRef.current = false;
    }, 60);
    event.preventDefault();
    if (event.deltaX > 0) {
      goRight();
    } else if (event.deltaX < 0) {
      goLeft();
    }
  };

  const handleHeaderClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (supportsHover) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    const isHeaderArea = Boolean(target?.closest('.products-landing__group-header'));
    const isImageArea = Boolean(target?.closest('.products-landing__group-image'));
    if (!isHeaderArea && !isImageArea) return;
    setOverlayOpen((prev) => !prev);
  };

  const showHeaderOverlay = supportsHover ? headerHover : overlayOpen;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-28px_rgba(255,107,74,0.35)] flex flex-col h-full border transition-colors ${
        selected ? 'border-2 border-[#FF6B4A]' : 'border border-[#FFE0D1]'
      }`}
      style={containerStyle}
      onMouseLeave={() => {
        setHeaderHover(false);
        setBodyHover(false);
      }}
    >
      {/* Header */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-[#FFE0D1] bg-white products-landing__group-header"
        style={{ position: 'relative', overflow: 'hidden' }}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={(event) => {
          const related =
            event.relatedTarget instanceof Element ? event.relatedTarget : null;
          if (related?.closest('.products-landing__group-body')) {
            return;
          }
          setHeaderHover(false);
        }}
        onClick={handleHeaderClick}
      >
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-[#6B7280] flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            {group.location}
          </p>
          {isOrder ? (
            <p
              className="text-left text-base font-semibold text-[#1F2937]"
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {group.title}
            </p>
          ) : (
            <p className="text-left text-base font-semibold text-[#1F2937] truncate">{group.title}</p>
          )}
        </div>

        {hasAvatar && (
          <button
            type="button"
            onClick={handleAvatarClick}
            aria-label={isOrder ? 'Voir le partageur' : 'Voir le producteur'}
            style={{
              position: 'absolute',
              top: 10.5,
              right: 3,
              width: 45,
              height: 45,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '1px solid rgba(255, 224, 209, 0.42)',
              background: '#fff',
              padding: 0,
              zIndex: 8,
              cursor: 'pointer',
            }}
          >
            {isOrder ? (
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={group.avatarPath}
                updatedAt={group.avatarUpdatedAt}
                fallbackSrc={orderAvatarFallback}
                alt={group.sharerName || 'Partageur'}
                className="w-full h-full object-cover"
              />
            ) : (
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={group.avatarPath}
                updatedAt={group.avatarUpdatedAt}
                fallbackSrc={DEFAULT_PROFILE_AVATAR}
                alt={firstProduct?.producerName || 'Producteur'}
                className="w-full h-full object-cover"
              />
            )}
          </button>
        )}

        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: `12px 12px 8px 16px`,
            opacity: showHeaderOverlay ? 1 : 0,
            transition: 'opacity 160ms ease-out',
            pointerEvents: showHeaderOverlay ? 'auto' : 'none',
          }}
          className="products-landing__header-overlay"
          data-visible={showHeaderOverlay ? 'true' : 'false'}
          onMouseLeave={() => setHeaderHover(false)}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {isOrder ? (
              <>
                {isOrderClosed ? (
                  <>
                    {orderStatusLabel && (
                      <p style={{ margin: 0, fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                        {orderStatusLabel} :{''}
                        {stageDateLabel ? (
                          <span className="text-[#6B7280]" style={{ margin: 0, fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                            {' '}{stageDateLabel}
                          </span>
                        ) : null}
                      </p>
                    )}
                    {statusProgress ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '8px',
                            borderRadius: '9999px',
                            background: '#F3F4F6',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round(statusProgress.ratio * 100)}%`,
                              height: '100%',
                              borderRadius: '9999px',
                              background: '#FF6B4A',
                              transition: 'width 180ms ease-out',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>
                          Avancement {statusProgressLabel ?? ''}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {deadlineLabel ? (
                      <p style={{ margin: 0, fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                        Clôture : {deadlineLabel}
                      </p>
                    ) : null}
                    {orderProgress ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '8px',
                            borderRadius: '9999px',
                            background: '#F3F4F6',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round(orderProgress.ratio * 100)}%`,
                              height: '100%',
                              borderRadius: '9999px',
                              background: '#FF6B4A',
                              transition: 'width 180ms ease-out',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>
                          Avancement {orderProgress.label ?? ''}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : availabilityProgress ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                  Disponibilité
                </p>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '8px',
                    borderRadius: '9999px',
                    background: '#F3F4F6',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(availabilityProgress.ratio * 100)}%`,
                      height: '100%',
                      borderRadius: '9999px',
                      background: '#34D399',
                      transition: 'width 180ms ease-out',
                    }}
                  />
                </div>
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>
                  {availabilityProgress.label}
                </span>
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
              marginLeft: 'auto',
              marginRight: hasAvatar ? 48 : 0,
            }}
          >
            {!isOrder && onCreateOrder && firstProduct && (
              <button
                type="button"
                onClick={() => onCreateOrder(firstProduct)}
                className="products-landing__header-overlay-button px-4 py-2 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors whitespace-nowrap shadow-sm"
                style={{
                  minWidth: '90px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: '#FF6B4A',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  transition: 'background 150ms ease, transform 150ms ease',
                  boxShadow: '0 12px 22px -14px rgba(255, 107, 74, 0.8)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <ShoppingCart className="w-4 h-4"/>
                <span>Créer</span>
              </button>
            )}
            {isOrder && onOpenOrder && (
              <button
                type="button"
                onClick={() => onOpenOrder(group.orderId ?? group.id)}
                className="products-landing__header-overlay-button"
                style={{
                  minWidth: '90px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: '#FF6B4A',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  transition: 'background 150ms ease, transform 150ms ease',
                  boxShadow: '0 12px 22px -14px rgba(255, 107, 74, 0.8)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <ShoppingCart className="w-4 h-4"/>
                <span>{orderActionText}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Corps : carrousel logique ou liste simple */}
      <div
        className="p-3 sm:p-4 flex-1 flex products-landing__group-body"
        style={bodyPaddingStyle}
        onMouseEnter={() => {
          setBodyHover(true);
          setHeaderHover(true);
        }}
        onMouseLeave={(event) => {
          setBodyHover(false);
          const related =
            event.relatedTarget instanceof Element ? event.relatedTarget : null;
          if (related?.closest('.products-landing__group-header')) {
            return;
          }
          setHeaderHover(false);
        }}
        onClick={handleHeaderClick}
      >
        {useCarousel ? (
          <div
            className="products-landing__cards-carousel relative w-full"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onWheel={handleWheel}
            onMouseEnter={() => setBodyHover(true)}
            onMouseLeave={() => setBodyHover(false)}
          >
            <div
              className="products-landing__cards-carousel-viewport"
              style={{ maxWidth: `${carouselViewportMaxWidth}px` }}
            >
              <div
                className="products-landing__cards-carousel-track"
                style={{
                  transform: `translate3d(${-carouselOffsetPx}px, 0, 0)`,
                  transition: carouselTrackTransition,
                  gap: `${carouselGapPx}px`,
                }}
              >
                {group.products.map((product) => (
                  <div
                    key={product.id}
                    className="products-landing__cards-carousel-item"
                    style={{
                      width: `${CARD_WIDTH}px`,
                      minWidth: `${CARD_WIDTH}px`,
                      flex: `0 0 ${CARD_WIDTH}px`,
                    }}
                  >
                    <ProductResultCard
                      product={product}
                      related={[]}
                      canSave={canSave}
                      inDeck={deckIds.has(product.id)}
                      onSave={onSave}
                      onRemove={onRemoveFromDeck}
                      onToggleSelection={onToggleSelection}
                      onOpenProducer={onOpenProducer}
                      onOpen={(productId) => handleOpenProduct(product, productId)}
                      showSelectionControl={showSelectionControl}
                      compact
                      cardWidth={CARD_WIDTH}
                      priceLabelOverride={orderPriceLabels?.[product.id]}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Flèches */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={goLeft}
                aria-label="Faire défiler vers la gauche"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  width: 35,
                  height: 35,
                  borderRadius: 9999,
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                  background: '#FF6B4A',
                  boxShadow: '0 14px 28px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: bodyHover ? 1 : 0,
                  transform: `translateY(-50%) scale(${bodyHover ? 1 : 0.9})`,
                  transition: 'opacity 140ms ease-out, transform 140ms ease-out',
                  pointerEvents: canScrollLeft ? 'auto' : 'none',
                  cursor: canScrollLeft ? 'pointer' : 'default',
                  zIndex: 4,
                }}
              >
                <ChevronLeft size={20} color="#FFFFFF" />
              </button>
            )}

            {canScrollRight && (
              <button
                type="button"
                onClick={goRight}
                aria-label="Faire défiler vers la droite"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  width: 35,
                  height: 35,
                  borderRadius: 9999,
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                  background: '#FF6B4A',
                  boxShadow: '0 14px 28px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: bodyHover ? 1 : 0,
                  transform: `translateY(-50%) scale(${bodyHover ? 1 : 0.9})`,
                  transition: 'opacity 140ms ease-out, transform 140ms ease-out',
                  pointerEvents: canScrollRight ? 'auto' : 'none',
                  cursor: canScrollRight ? 'pointer' : 'default',
                  zIndex: 4,
                }}
              >
                <ChevronRight size={20} color="#FFFFFF" />
              </button>
            )}
          </div>
        ) : (
          <div
            className="flex flex-wrap gap-2 sm:gap-3 pb-1 w-full justify-center"
            style={{ alignItems: 'stretch' }}
          >
              {group.products.map((product) => (
                <ProductResultCard
                  key={product.id}
                  product={product}
                  related={[]}
                  canSave={canSave}
                  inDeck={deckIds.has(product.id)}
                  onSave={onSave}
                  onRemove={onRemoveFromDeck}
                  onToggleSelection={onToggleSelection}
                  onOpenProducer={onOpenProducer}
                  onOpen={(productId) => handleOpenProduct(product, productId)}
                  showSelectionControl={showSelectionControl}
                  compact
                  cardWidth={CARD_WIDTH}
                  priceLabelOverride={orderPriceLabels?.[product.id]}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
