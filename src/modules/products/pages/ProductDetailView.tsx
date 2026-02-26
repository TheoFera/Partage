import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Heart,
  Info,
  Leaf,
  MapPin,
  Package,
  PenLine,
  Percent,
  Plus,
  ShieldCheck,
  Star,
  Thermometer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../../../shared/ui/Avatar';
import { ImageWithFallback } from '../../../shared/ui/ImageWithFallback';
import { ProductImageUploader } from '../components/ProductImageUploader';
import { ProductResultCard } from '../components/ProductGroup';
import './ProductDetailView.css';
import { generateBase62Code } from '../utils/codeGenerator';
import { centsToEuros, eurosToCents, formatEurosFromCents } from '../../../shared/lib/money';
import { formatUnitWeightLabel } from '../utils/weight';
import { fetchLotBreakdown, saveProducerLotBreakdown } from '../utils/pricing';
import { PRODUCT_CATEGORIES } from '../constants/productCategories';
import { DEMO_MODE } from '../../../shared/config/demoMode';
import {
  CreateProductPayload,
  DbLotLabel,
  DbLotPriceBreakdown,
  DbLotTraceStep,
  GroupOrder,
  Ingredient,
  LinkedProduct,
  NutritionFacts,
  Product,
  ProductDetail,
  ProducerLabelDetail,
  ProductionLot,
  RepartitionPoste,
  TimelineStep,
} from '../../../shared/types';

interface ProductDetailViewProps {
  product: Product;
  detail: ProductDetail;
  ordersWithProduct: GroupOrder[];
  isOwner: boolean;
  isSaved?: boolean;
  catalog?: Product[];
  supabaseClient?: SupabaseClient | null;
  onHeaderActionsChange?: (actions: React.ReactNode) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenRelatedProduct?: (productId: string) => void;
  onShare: () => void;
  onCreateOrder: () => void;
  onParticipate: () => void;
  onToggleSave?: (next: boolean) => void;
  initialLotId?: string;
  timelineExtraSteps?: TimelineStep[];
  mode?: 'view' | 'create';
  onCreateProduct?: (payload: CreateProductPayload) => void;
  categoryOptions?: string[];
  producerProfileLabels?: ProducerLabelDetail[];
  readonlyPriceCentsOverride?: number | null;
}

type DetailTabKey =
  | 'circuit'
  | 'quality'
  | 'repartition'
  | 'consumption'
  | 'transparency'
  | 'lot';

const TAB_OPTIONS: Array<{ id: DetailTabKey; label: string; icon: React.ElementType }> = [
  { id: 'circuit', label: 'Circuit-court', icon: Leaf },
  { id: 'quality', label: 'Qualité', icon: ShieldCheck },
  { id: 'repartition', label: 'Répartition du prix', icon: Percent },
  { id: 'consumption', label: 'Consommation', icon: Users },
  { id: 'transparency', label: 'Transparence et confiance', icon: Info },
];

const LABEL_DESCRIPTIONS: Record<string, string> = {
  aop: "Appellation d'origine protegee avec cahier des charges strict.",
  igp: 'Indication geographique protegee et traitee en zone delimitee.',
  bio: 'Agriculture biologique certifiee, intrants controles.',
  'label rouge': 'Qualite superieure controlee sur toute la filiere.',
  hve: 'Haute Valeur Environnementale, pratiques durables.',
  'bleu blanc coeur': 'Alimentation specifique et tracabilite nutritionnelle.',
  traçable: 'Chaque lot est trace et documente.',
  'circuit court': "Peu d'intermediaires, relation directe.",
  'frais controle': 'Respect du froid et controles reguliers.',
};

const DEFAULT_VAT_RATE = 0.055;

const mapMarkerIcon = L.icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = mapMarkerIcon;

const normalizeKey = (value: string) => value.toLowerCase().trim();

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const slugify = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const getLabelDescription = (label: string) => {
  const key = normalizeKey(label);
  return LABEL_DESCRIPTIONS[key] ?? `Cahier des charges à consulter pour "${label}".`;
};

const getPrimaryPickupLabel = (orders: GroupOrder[], fallback?: string) => {
  const primary = orders[0];
  const label =
    [primary?.pickupCity, primary?.pickupPostcode].filter(Boolean).join(' ').trim() ||
    primary?.mapLocation?.areaLabel ||
    primary?.pickupAddress;
  return label || fallback || '';
};

const resolveLocationForStep = (label: string, detail: ProductDetail, pickupLabel?: string) => {
  const normalized = label.toLowerCase();
  if (normalized.includes('production')) return detail.tracabilite?.lieuProduction || detail.originCountry;
  if (normalized.includes('transformation')) return detail.tracabilite?.lieuTransformation || detail.producer.city;
  if (normalized.includes('abattage')) return detail.tracabilite?.lieuAbattage || detail.producer.city;
  if (normalized.includes('conditionnement')) return detail.tracabilite?.lieuTransformation || detail.producer.city;
  if (normalized.includes('retrait') || normalized.includes('livraison')) return pickupLabel;
  return detail.producer.city || detail.originCountry;
};

const buildFallbackTimeline = (_detail: ProductDetail, _pickupLabel?: string): TimelineStep[] => [];

type LotStepDates = {
  periodStart?: string;
  periodEnd?: string;
  dateType?: 'date' | 'period';
};

const resolveStepKey = (step: TimelineStep) => step.localId ?? step.journeyStepId ?? step.etape;

const buildLotDatesMap = (steps: TimelineStep[], journeySteps: TimelineStep[] = []) => {
  const map: Record<string, LotStepDates> = {};
  const journeyById = new Map(
    journeySteps
      .filter((step) => step.journeyStepId)
      .map((step) => [step.journeyStepId as string, step] as const)
  );
  const journeyByLabel = new Map(
    journeySteps
      .filter((step) => step.etape)
      .map((step) => [step.etape.toLowerCase(), step] as const)
  );
  steps.forEach((step) => {
    const matched =
      (step.journeyStepId ? journeyById.get(step.journeyStepId) : undefined) ??
      (step.etape ? journeyByLabel.get(step.etape.toLowerCase()) : undefined);
    const key = matched?.localId ?? resolveStepKey(step);
    if (!key) return;
    const periodStart = step.periodStart ?? step.date ?? undefined;
    const periodEnd = step.periodEnd ?? undefined;
    const hasPeriod = Boolean(periodStart && periodEnd);
    map[key] = {
      periodStart,
      periodEnd,
      dateType: hasPeriod ? 'period' : periodStart || periodEnd ? 'date' : undefined,
    };
  });
  return map;
};

const buildLotDatesMapFromDb = (steps: DbLotTraceStep[], journeySteps: TimelineStep[]) =>
  buildLotDatesMap(
    steps.map((step) => ({
      journeyStepId: step.product_step_id ?? undefined,
      etape: step.step_label ?? 'Etape',
      date: step.occurred_at ?? undefined,
      periodStart: step.period_start ?? undefined,
      periodEnd: step.period_end ?? undefined,
    })),
    journeySteps
  );

const normalizeLocationPart = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();

const collectLocationParts = (step: TimelineStep) => {
  const baseParts = [step.address, step.addressDetails, step.country, step.postcode, step.city]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);
  const baseNormalized = baseParts.map(normalizeLocationPart).filter(Boolean);
  const lieu = (step.lieu ?? '').trim();
  const normalizedLieu = normalizeLocationPart(lieu);
  const includeLieu =
    lieu &&
    (!baseNormalized.length || !baseNormalized.every((part) => normalizedLieu.includes(part)));
  const combined = includeLieu ? [...baseParts, lieu] : baseParts;
  const seen = new Set<string>();
  return combined.filter((value) => {
    const key = normalizeLocationPart(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const formatStepLocationLabel = (step: TimelineStep) => {
  const parts = collectLocationParts(step);
  return parts.length ? parts.join(', ') : 'A preciser';
};

const formatStepDateLabel = (step: TimelineStep) => {
  const start = (step.periodStart ?? step.date ?? '').trim();
  const end = (step.periodEnd ?? '').trim();
  if (start && end) return `${start} -> ${end}`;
  return start || end || '';
};

const buildStepLocationQuery = (step: TimelineStep) => {
  const parts = collectLocationParts(step);
  return parts.length ? parts.join(', ') : '';
};

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

const geocodeLocation = async (query: string) => {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return null;
  if (geocodeCache.has(normalizedQuery)) {
    return geocodeCache.get(normalizedQuery) ?? null;
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      normalizedQuery
    )}`;
    const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!response.ok) {
      geocodeCache.set(normalizedQuery, null);
      return null;
    }
    const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data?.[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      geocodeCache.set(normalizedQuery, null);
      return null;
    }
    const coords = { lat, lng };
    geocodeCache.set(normalizedQuery, coords);
    return coords;
  } catch {
    geocodeCache.set(normalizedQuery, null);
    return null;
  }
};

const formatEurosValue = (value: number) => formatEurosFromCents(eurosToCents(value));

const formatValue = (post: RepartitionPoste) => {
  if (post.type === 'percent') return `${post.valeur}%`;
  return formatEurosValue(post.valeur);
};

const PIE_COLORS = [
  '#FF6B4A',
  '#FFD166',
  '#4CC9F0',
  '#90BE6D',
  '#F8961E',
  '#577590',
  '#F28482',
  '#8E9AAF',
  '#43AA8B',
  '#277DA1',
];

const LOT_CARD_WIDTH = 220;
const LOT_CARD_GAP = 12;

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

const NUTRITION_FIELDS = [
  { key: 'energie', label: 'Energie (kcal)' },
  { key: 'matieresGrasses', label: 'Matieres grasses (g)' },
  { key: 'acidesGrasSatures', label: 'Acides gras satures (g)' },
  { key: 'glucides', label: 'Glucides (g)' },
  { key: 'sucres', label: 'Sucres (g)' },
  { key: 'fibres', label: 'Fibres (g)' },
  { key: 'proteines', label: 'Proteines (g)' },
  { key: 'sel', label: 'Sel (g)' },
] as const;

type NutritionFieldKey = (typeof NUTRITION_FIELDS)[number]['key'];

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
};

const describeWedge = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const arc = describeArc(x, y, radius, startAngle, endAngle);
  return `${arc} L ${x} ${y} Z`;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const normalizeLabelList = (values?: string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

const mergeLabelDetailsForEdit = (
  details?: ProducerLabelDetail[],
  fallback?: string[]
) => {
  const merged = [...(details ?? [])];
  const known = new Set(
    merged
      .map((entry) => normalizeKey(entry.label))
      .filter(Boolean)
  );
  (fallback ?? []).forEach((label) => {
    const trimmed = label.trim();
    const key = normalizeKey(trimmed);
    if (!key || known.has(key)) return;
    known.add(key);
    merged.push({ label: trimmed });
  });
  return merged;
};

const mergeLabelDetails = (
  details?: ProducerLabelDetail[],
  fallback?: string[]
) => {
  const map = new Map<string, ProducerLabelDetail>();
  (details ?? []).forEach((entry) => {
    const label = entry.label.trim();
    if (!label) return;
    const description = entry.description?.trim();
    const obtentionYear =
      typeof entry.obtentionYear === 'number' && Number.isFinite(entry.obtentionYear)
        ? entry.obtentionYear
        : undefined;
    map.set(normalizeKey(label), {
      label,
      description: description || undefined,
      obtentionYear,
    });
  });
  (fallback ?? []).forEach((label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = normalizeKey(trimmed);
    if (map.has(key)) return;
    map.set(key, { label: trimmed });
  });
  return Array.from(map.values());
};

const filterLabelDetails = (details: ProducerLabelDetail[], excluded: Set<string>) =>
  details.filter((entry) => !excluded.has(normalizeKey(entry.label)));

const buildAllergenList = (ingredients: Ingredient[]) => {
  const values = ingredients
    .filter((item) => item.isAllergen)
    .map((item) => (item.allergenType || item.nom || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
};

const stripTimelineProof = (steps: TimelineStep[]) =>
  steps.map(({ preuve: _preuve, localId: _localId, journeyStepId: _journeyStepId, ...rest }) => rest);

const ValuePieChart = ({
  slices,
  size = 220,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) => {
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return (
      <div className="pd-chart__empty">
        <p className="pd-chart__empty-text">Renseignez des postes pour afficher le camembert.</p>
      </div>
    );
  }

  const center = 50;
  const radius = 40;
  let currentAngle = 0;
  const computed = slices
    .filter((slice) => Number.isFinite(slice.value) && slice.value > 0)
    .map((slice) => {
      const sliceAngle = (slice.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;
      return { ...slice, startAngle, endAngle, percent: (slice.value / total) * 100 };
    });

  return (
    <div className="pd-chart">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Camembert de repartition de la valeur"
        className="pd-chart__svg"
      >
        {computed.map((slice) => (
          <path
            key={slice.label}
            d={describeWedge(center, center, radius, slice.startAngle, slice.endAngle)}
            fill={slice.color}
          >
            <title>
              {slice.label}: {formatValue({ nom: slice.label, valeur: slice.value, type: 'eur' })} ({formatPercent(slice.percent)})
            </title>
          </path>
        ))}
        <circle cx={center} cy={center} r={24} fill="#FFFFFF" opacity={0.9} />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#111827">
          Total
        </text>
        <text x={center} y={center + 10} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#6B7280">
          {formatEurosValue(total)}
        </text>
      </svg>

      <div className="pd-chart__legend">
        {computed.map((slice) => (
          <div key={`${slice.label}-legend`} className="pd-chart__legend-row">
            <div className="pd-chart__legend-label">
              <span
                aria-hidden="true"
                className="pd-chart__swatch"
                style={{ backgroundColor: slice.color }}
              />
              <span className="pd-chart__label">{slice.label}</span>
            </div>
            <div className="pd-chart__legend-value">
              <span>{formatValue({ nom: slice.label, valeur: slice.value, type: 'eur' })}</span>
              <span className="pd-chart__percent">({formatPercent(slice.percent)})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const lotStatusBadge = (lot: ProductionLot) => {
  if (lot.statut === 'en_cours') return { label: 'En cours', className: 'pd-lot-badge pd-lot-badge--active' };
  if (lot.statut === 'a_venir') return { label: 'A venir', className: 'pd-lot-badge pd-lot-badge--upcoming' };
  return { label: 'Epuise', className: 'pd-lot-badge pd-lot-badge--closed' };
};

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  detail,
  ordersWithProduct,
  isOwner,
  isSaved,
  catalog,
  supabaseClient,
  onHeaderActionsChange,
  onOpenProducer,
  onOpenRelatedProduct,
  onShare,
  onCreateOrder,
  onParticipate,
  onToggleSave,
  initialLotId,
  timelineExtraSteps,
  mode = 'view',
  onCreateProduct,
  categoryOptions,
  producerProfileLabels,
  readonlyPriceCentsOverride,
}) => {
  const isCreateMode = mode === 'create';
  const [draft, setDraft] = React.useState<ProductDetail>(() => ({
    ...detail,
    vatRate: detail.vatRate ?? DEFAULT_VAT_RATE,
  }));
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [editMode, setEditMode] = React.useState(isCreateMode);
  const [lotMode, setLotMode] = React.useState(false);
  const [notifyFollowers, setNotifyFollowers] = React.useState(false);
  const [notificationMessage, setNotificationMessage] = React.useState('');
  const [selectedLotId, setSelectedLotId] = React.useState<string | null>(() => {
    if (initialLotId) return initialLotId;
    return detail.productions?.find((lot) => lot.statut !== 'epuise')?.id ?? null;
  });
  const [lotList, setLotList] = React.useState<ProductionLot[]>(detail.productions ?? []);
  const [lotDraft, setLotDraft] = React.useState<ProductionLot | null>(null);
  const [lotEditMode, setLotEditMode] = React.useState<'create' | 'edit' | null>(null);
  const [productPosts, setProductPosts] = React.useState<RepartitionPoste[]>(
    detail.repartitionValeur?.postes ?? []
  );
  const [lotPriceBreakdownByLot, setLotPriceBreakdownByLot] = React.useState<
    Record<string, RepartitionPoste[]>
  >({});
  const [lotLabelsByLot, setLotLabelsByLot] = React.useState<Record<string, ProducerLabelDetail[]>>({});
  const [lotOrderUsageByLot, setLotOrderUsageByLot] = React.useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = React.useState<DetailTabKey>('circuit');
  const [lotCarouselIndex, setLotCarouselIndex] = React.useState(0);
  const [lotCarouselHover, setLotCarouselHover] = React.useState(false);
  const [lotVisibleCount, setLotVisibleCount] = React.useState(3);
  const [localMeasurement, setLocalMeasurement] = React.useState<Product['measurement']>(product.measurement);
  const [localUnit, setLocalUnit] = React.useState(product.unit);
  const [overrideLotPriceCents, setOverrideLotPriceCents] = React.useState<number | null>(null);
  const [localWeightKg, setLocalWeightKg] = React.useState<number | ''>(product.weightKg ?? '');
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [, setImagePreviewUrl] = React.useState<string | null>(null);
  const [pendingJourneyImages, setPendingJourneyImages] = React.useState<
    Record<string, { file: File; previewUrl: string }>
  >({});
  const [timelineOverride, setTimelineOverride] = React.useState<TimelineStep[] | null>(null);
  const [lotStepDatesByLot, setLotStepDatesByLot] = React.useState<Record<string, Record<string, LotStepDates>>>(
    {}
  );
  const [draggedStepIndex, setDraggedStepIndex] = React.useState<number | null>(null);
  const [dragOverStepIndex, setDragOverStepIndex] = React.useState<number | null>(null);
  const [producerAvatarPath, setProducerAvatarPath] = React.useState<string | null>(null);
  const [producerAvatarUpdatedAt, setProducerAvatarUpdatedAt] = React.useState<string | null>(null);
  const [producerProfileName, setProducerProfileName] = React.useState<string | null>(null);
  const [producerProfileCity, setProducerProfileCity] = React.useState<string | null>(null);
  const onToggleSaveRef = React.useRef<typeof onToggleSave>(onToggleSave);
  const imagePreviewRef = React.useRef<string | null>(null);
  const journeyMapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const journeyMapRef = React.useRef<L.Map | null>(null);
  const journeyMapLayerRef = React.useRef<L.LayerGroup | null>(null);
  const journeyMarkersRef = React.useRef<Map<string, L.Marker>>(new Map());
  const lotTouchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const lotPointerDragRef = React.useRef<{ x: number; y: number; id?: number } | null>(null);
  const lotWheelLockRef = React.useRef(false);
  const seededLotPriceRef = React.useRef(false);
  const initialLotIdRef = React.useRef<string | undefined>(initialLotId);
  const PRODUCT_IMAGE_BUCKET = 'product-images';
  const JOURNEY_IMAGE_BUCKET = import.meta.env.VITE_PRODUCT_JOURNEY_BUCKET ?? 'product-journey';

  const ensureTimelineIds = React.useCallback(
    (steps: TimelineStep[]) =>
      steps.map((step) => (step.localId ? step : { ...step, localId: generateBase62Code(8) })),
    []
  );

  const selectedLot = React.useMemo(
    () => lotList.find((lot) => lot.id === selectedLotId) ?? null,
    [lotList, selectedLotId]
  );
  const isLotManagement = lotMode && isOwner && !isCreateMode;
  const activeLot = lotDraft ?? selectedLot;
  const activeLotId = activeLot?.id ?? null;
  const activeLotDbId = activeLot?.lotDbId ?? null;
  const activeLotPersisted = React.useMemo(
    () => (activeLotId ? lotList.some((lot) => lot.id === activeLotId) : false),
    [activeLotId, lotList]
  );
  const activeLotHasOrders = activeLotId ? lotOrderUsageByLot[activeLotId] : undefined;
  const canDeleteActiveLot = Boolean(activeLotId) && (!activeLotDbId || activeLotHasOrders === false);
  const actionButtonsDisabled = isCreateMode || editMode || isLotManagement;

  const pickupLabel = React.useMemo(
    () => getPrimaryPickupLabel(ordersWithProduct, detail.producer.city),
    [ordersWithProduct, detail.producer.city]
  );

  const producerProfileId = React.useMemo(() => {
    if (isUuid(detail.producer.id)) return detail.producer.id;
    if (isUuid(product.producerId)) return product.producerId;
    return null;
  }, [detail.producer.id, product.producerId]);

  React.useEffect(() => {
    let active = true;
    if (!supabaseClient || !producerProfileId) {
      setProducerAvatarPath(null);
      setProducerAvatarUpdatedAt(null);
      setProducerProfileName(null);
      setProducerProfileCity(null);
      return () => {
        active = false;
      };
    }

    supabaseClient
      .from('profiles')
      .select('name, city, avatar_path, avatar_updated_at')
      .eq('id', producerProfileId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('Producer avatar load error:', error);
          setProducerAvatarPath(null);
          setProducerAvatarUpdatedAt(null);
          setProducerProfileName(null);
          setProducerProfileCity(null);
          return;
        }
        setProducerProfileName((data?.name as string | null) ?? null);
        setProducerProfileCity((data?.city as string | null) ?? null);
        setProducerAvatarPath((data?.avatar_path as string | null) ?? null);
        setProducerAvatarUpdatedAt((data?.avatar_updated_at as string | null) ?? null);
      });

    return () => {
      active = false;
    };
  }, [producerProfileId, supabaseClient]);
  const fallbackTimeline = React.useMemo(() => buildFallbackTimeline(detail, pickupLabel), [detail, pickupLabel]);
  const [localTimeline, setLocalTimeline] = React.useState<TimelineStep[]>(() =>
    ensureTimelineIds(detail.tracabilite?.timeline?.length ? detail.tracabilite.timeline : fallbackTimeline)
  );
  const resetTimelineEdits = React.useCallback(() => {
    setLocalTimeline(
      ensureTimelineIds(detail.tracabilite?.timeline?.length ? detail.tracabilite.timeline : fallbackTimeline)
    );
    setLotStepDatesByLot({});
    setPendingJourneyImages((current) => {
      Object.values(current).forEach((entry) => {
        if (entry.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      return {};
    });
    setTimelineOverride(null);
  }, [detail, ensureTimelineIds, fallbackTimeline]);
  const loadLotTraceSteps = React.useCallback(
    async (lotCode: string, lotDbId?: string | null) => {
      if (lotStepDatesByLot[lotCode]) return;
      if (!lotList.some((lot) => lot.id === lotCode)) {
        setLotStepDatesByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: {} }));
        return;
      }
      if (DEMO_MODE || !supabaseClient || isCreateMode || !lotDbId) {
        setLotStepDatesByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: {} }));
        return;
      }
      const { data, error } = await supabaseClient
        .from('lot_trace_steps')
        .select('*')
        .eq('lot_id', lotDbId);
      if (error) {
        console.warn('Supabase lot_trace_steps error:', error);
        setLotStepDatesByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: {} }));
        return;
      }
      const mapped = buildLotDatesMapFromDb((data as DbLotTraceStep[]) ?? [], localTimeline);
      setLotStepDatesByLot((prev) => ({ ...prev, [lotCode]: mapped }));
    },
    [isCreateMode, localTimeline, lotList, lotStepDatesByLot, supabaseClient]
  );

  const mapBreakdownRowsToPosts = React.useCallback(
    (rows: DbLotPriceBreakdown[]): RepartitionPoste[] =>
      rows
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((entry) => ({
          id: entry.id,
          lotId: entry.lot_id,
          partiePrenante: entry.stakeholder ?? undefined,
          stakeholderKey: entry.stakeholder_key ?? undefined,
          platformCostCode: entry.platform_cost_code ?? undefined,
          source: entry.source ?? 'producer',
          nom: entry.label,
          valeur: centsToEuros(entry.value_cents ?? 0),
          type: 'eur',
          sortOrder: entry.sort_order,
        })),
    []
  );

  const loadLotPriceBreakdown = React.useCallback(
    async (lotCode: string, lotDbId?: string | null) => {
      if (lotPriceBreakdownByLot[lotCode]) return;
      if (!lotList.some((lot) => lot.id === lotCode)) {
        setLotPriceBreakdownByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
        return;
      }
      if (DEMO_MODE || !supabaseClient || isCreateMode || !lotDbId) {
        setLotPriceBreakdownByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
        return;
      }
      try {
        const rows = await fetchLotBreakdown(supabaseClient, lotDbId);
        setLotPriceBreakdownByLot((prev) => ({ ...prev, [lotCode]: mapBreakdownRowsToPosts(rows) }));
      } catch (error) {
        console.warn('Supabase lot_price_breakdown error:', error);
        setLotPriceBreakdownByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
      }
    },
    [isCreateMode, lotList, lotPriceBreakdownByLot, mapBreakdownRowsToPosts, supabaseClient]
  );

  const loadLotLabels = React.useCallback(
    async (lotCode: string, lotDbId?: string | null) => {
      if (lotLabelsByLot[lotCode]) return;
      if (!lotList.some((lot) => lot.id === lotCode)) {
        setLotLabelsByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
        return;
      }
      if (DEMO_MODE || !supabaseClient || isCreateMode || !lotDbId) {
        setLotLabelsByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
        return;
      }
      const { data, error } = await supabaseClient.from('lot_labels').select('*').eq('lot_id', lotDbId);
      if (error) {
        console.warn('Supabase lot_labels error:', error);
        setLotLabelsByLot((prev) => (prev[lotCode] ? prev : { ...prev, [lotCode]: [] }));
        return;
      }
      const rows = (data as DbLotLabel[]) ?? [];
      const mapped = rows.map((label) => ({
        label: label.label,
        description: label.description ?? undefined,
        obtentionYear: label.obtained_year ?? undefined,
      }));
      setLotLabelsByLot((prev) => ({ ...prev, [lotCode]: mapped }));
    },
    [isCreateMode, lotLabelsByLot, lotList, supabaseClient]
  );

  const loadLotOrderUsage = React.useCallback(
    async (lotCode: string, lotDbId?: string | null) => {
      if (lotOrderUsageByLot[lotCode] !== undefined) return;
      if (DEMO_MODE || !supabaseClient || isCreateMode || !lotDbId) {
        setLotOrderUsageByLot((prev) =>
          prev[lotCode] !== undefined ? prev : { ...prev, [lotCode]: false }
        );
        return;
      }
      try {
        const { data, error } = await supabaseClient
          .from('order_items')
          .select('id')
          .eq('lot_id', lotDbId)
          .limit(1);
        if (error) {
          throw error;
        }
        setLotOrderUsageByLot((prev) => ({ ...prev, [lotCode]: Boolean(data?.length) }));
      } catch (error) {
        console.warn('Supabase lot order_items error:', error);
        setLotOrderUsageByLot((prev) => ({ ...prev, [lotCode]: true }));
      }
    },
    [isCreateMode, lotOrderUsageByLot, supabaseClient]
  );

  React.useEffect(() => {
    const posts = detail.repartitionValeur?.postes ?? [];
    setProductPosts(
      posts.map((post, index) => ({
        ...post,
        type: post.type ?? 'eur',
        source: post.source ?? 'producer',
        sortOrder: Number.isFinite(post.sortOrder) ? post.sortOrder : index,
      }))
    );
  }, [detail.repartitionValeur?.postes]);

  React.useEffect(() => {
    if (seededLotPriceRef.current) return;
    const posts = detail.repartitionValeur?.postes ?? [];
    if (!posts.length || !selectedLotId) return;
    setLotPriceBreakdownByLot((prev) => {
      if (prev[selectedLotId]) return prev;
      return {
        ...prev,
        [selectedLotId]: posts.map((post, index) => ({
          ...post,
          type: post.type ?? 'eur',
          source: post.source ?? 'producer',
          sortOrder: Number.isFinite(post.sortOrder) ? post.sortOrder : index,
        })),
      };
    });
    seededLotPriceRef.current = true;
  }, [detail.repartitionValeur?.postes, selectedLotId]);

  React.useEffect(() => {
    setDraft({ ...detail, vatRate: detail.vatRate ?? DEFAULT_VAT_RATE });
  }, [detail]);

  React.useEffect(() => {
    seededLotPriceRef.current = false;
    setLotLabelsByLot({});
    setLotPriceBreakdownByLot({});
    setLotOrderUsageByLot({});
    setLotMode(false);
    setLotDraft(null);
    setLotEditMode(null);
    setOverrideLotPriceCents(null);
  }, [detail.productId]);

  React.useEffect(() => {
    if (initialLotIdRef.current === initialLotId) return;
    initialLotIdRef.current = initialLotId;
    seededLotPriceRef.current = false;
    setSelectedLotId(initialLotId ?? null);
    setLotLabelsByLot({});
    setLotPriceBreakdownByLot({});
    setLotStepDatesByLot({});
    setLotOrderUsageByLot({});
    setLotDraft(null);
    setLotEditMode(null);
    setLotMode(false);
    setOverrideLotPriceCents(null);
  }, [initialLotId]);

  React.useEffect(() => {
    setLotList(detail.productions ?? []);
  }, [detail.productions]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const resolveVisibleCount = () => {
      if (window.innerWidth < 640) return 1;
      if (window.innerWidth < 1024) return 2;
      return 3;
    };
    const handleResize = () => setLotVisibleCount(resolveVisibleCount());
    setLotVisibleCount(resolveVisibleCount());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (lotEditMode === 'create' && lotDraft) return;
    if (selectedLotId && lotList.some((lot) => lot.id === selectedLotId)) return;
    if (initialLotId && lotList.some((lot) => lot.id === initialLotId)) {
      setSelectedLotId(initialLotId);
      return;
    }
    setSelectedLotId(lotList.find((lot) => lot.statut !== 'epuise')?.id ?? null);
  }, [initialLotId, lotDraft, lotEditMode, lotList, selectedLotId]);

  React.useEffect(() => {
    if (!isLotManagement) return;
    if (lotEditMode === 'create') return;
    if (!selectedLot) return;
    if (lotDraft?.id === selectedLot.id && lotEditMode === 'edit') return;
    setLotDraft({
      ...selectedLot,
      periodeDisponibilite: selectedLot.periodeDisponibilite ?? {
        debut: selectedLot.debut,
        fin: selectedLot.fin,
      },
    });
    setLotEditMode('edit');
  }, [isLotManagement, lotDraft?.id, lotEditMode, selectedLot]);

  React.useEffect(() => {
    if (!activeLotId || !activeLotPersisted) return;
    if (lotStepDatesByLot[activeLotId]) return;
    void loadLotTraceSteps(activeLotId, activeLotDbId);
  }, [activeLotDbId, activeLotId, activeLotPersisted, loadLotTraceSteps, lotStepDatesByLot]);

  React.useEffect(() => {
    if (!isLotManagement) return;
    if (!activeLotId || !activeLotPersisted) return;
    if (lotPriceBreakdownByLot[activeLotId]) return;
    void loadLotPriceBreakdown(activeLotId, activeLotDbId);
  }, [
    activeLotDbId,
    activeLotId,
    activeLotPersisted,
    isLotManagement,
    loadLotPriceBreakdown,
    lotPriceBreakdownByLot,
  ]);

  React.useEffect(() => {
    if (!activeLotId || !activeLotPersisted) return;
    if (lotLabelsByLot[activeLotId]) return;
    void loadLotLabels(activeLotId, activeLotDbId);
  }, [activeLotDbId, activeLotId, activeLotPersisted, loadLotLabels, lotLabelsByLot]);

  React.useEffect(() => {
    if (!activeLotId) return;
    if (!activeLotDbId) {
      setLotOrderUsageByLot((prev) =>
        prev[activeLotId] !== undefined ? prev : { ...prev, [activeLotId]: false }
      );
      return;
    }
    void loadLotOrderUsage(activeLotId, activeLotDbId);
  }, [activeLotDbId, activeLotId, loadLotOrderUsage]);

  React.useEffect(() => {
    onToggleSaveRef.current = onToggleSave;
  }, [onToggleSave]);

  React.useEffect(() => {
    resetTimelineEdits();
  }, [resetTimelineEdits]);

  React.useEffect(() => {
    if (!activeLotId || !activeLotPersisted) return;
    if (lotStepDatesByLot[activeLotId]) return;
    if (!detail.tracabilite?.lotTimeline?.length) return;
    setLotStepDatesByLot((prev) => ({
      ...prev,
      [activeLotId]: buildLotDatesMap(detail.tracabilite?.lotTimeline ?? [], localTimeline),
    }));
  }, [activeLotId, activeLotPersisted, detail.tracabilite?.lotTimeline, localTimeline, lotStepDatesByLot]);

  React.useEffect(() => {
    setLocalMeasurement(product.measurement);
    setLocalUnit(product.unit);
    setLocalWeightKg(product.weightKg ?? '');
  }, [product.measurement, product.unit, product.weightKg]);

  const display = editMode ? draft : detail;
  const resolvedVatRate = (editMode ? draft.vatRate : detail.vatRate) ?? DEFAULT_VAT_RATE;
  const hasOrders = ordersWithProduct.length > 0;
  const summaryOrdersLabel = hasOrders
    ? `${ordersWithProduct.length} commande${ordersWithProduct.length > 1 ? 's' : ''} disponible`
    : 'Aucune commande active';

  const baseTimeline =
    detail.tracabilite?.timeline?.length ? detail.tracabilite.timeline : fallbackTimeline;
  const timelineDisplay = React.useMemo(() => {
    const base = editMode ? localTimeline : timelineOverride ?? baseTimeline;
    if (editMode || !(timelineExtraSteps?.length ?? 0)) {
      return base;
    }
    return [...base, ...timelineExtraSteps!];
  }, [baseTimeline, editMode, localTimeline, timelineExtraSteps, timelineOverride]);
  const lotStepDates = activeLotId ? lotStepDatesByLot[activeLotId] ?? {} : {};
  const lotTimelineDisplay = React.useMemo<TimelineStep[]>(
    () =>
      localTimeline.map((step) => {
        const key = resolveStepKey(step);
        const dates = key ? lotStepDates[key] : undefined;
        const periodStart = dates?.periodStart;
        const periodEnd = dates?.periodEnd;
        const hasPeriod = Boolean(periodStart && periodEnd);
        const singleDate = hasPeriod ? undefined : periodStart || periodEnd || undefined;
        return {
          ...step,
          periodStart,
          periodEnd,
          dateType: hasPeriod ? 'period' : singleDate ? 'date' : undefined,
          date: singleDate,
        };
      }),
    [localTimeline, lotStepDates]
  );
  const journeyStepsForMap = editMode ? localTimeline : timelineDisplay;
  const journeyMapPoints = React.useMemo(() => {
    return journeyStepsForMap
      .map((step, index) => {
        const key = resolveStepKey(step);
        if (!key) return null;
        const lat = step.lat;
        const lng = step.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: key,
          orderIndex: index + 1,
          label: step.etape,
          locationLabel: formatStepLocationLabel(step),
          lat: lat as number,
          lng: lng as number,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      orderIndex: number;
      label: string;
      locationLabel: string;
      lat: number;
      lng: number;
    }>;
  }, [journeyStepsForMap]);

  React.useEffect(() => {
    if (activeTab !== 'circuit') return;
    const container = journeyMapContainerRef.current;
    if (!container || journeyMapRef.current) return;

    const map = L.map(container, { zoomControl: true, attributionControl: false }).setView([46.6, 2.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    }).addTo(map);
    journeyMapLayerRef.current = L.layerGroup().addTo(map);
    journeyMapRef.current = map;
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab === 'circuit') return;
    if (!journeyMapRef.current) return;
    journeyMapRef.current.remove();
    journeyMapRef.current = null;
    journeyMapLayerRef.current = null;
    journeyMarkersRef.current.clear();
  }, [activeTab]);

  React.useEffect(() => {
    const map = journeyMapRef.current;
    const layer = journeyMapLayerRef.current;
    if (!map || !layer) return;

    const nextIds = new Set(journeyMapPoints.map((point) => point.id));
    journeyMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        layer.removeLayer(marker);
        journeyMarkersRef.current.delete(id);
      }
    });

    journeyMapPoints.forEach((point) => {
      const existing = journeyMarkersRef.current.get(point.id);
      if (existing) {
        existing.setLatLng([point.lat, point.lng]);
        return;
      }
      const icon = L.divIcon({
        className: 'pd-map-marker',
        html: `<span>${point.orderIndex}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const marker = L.marker([point.lat, point.lng], { icon })
        .addTo(layer)
        .bindPopup(`<strong>${point.label}</strong><br />${point.locationLabel}`);
      journeyMarkersRef.current.set(point.id, marker);
    });

    if (journeyMapPoints.length) {
      const bounds = L.latLngBounds(journeyMapPoints.map((point) => [point.lat, point.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.25));
    } else {
      map.setView([46.6, 2.5], 6);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }, [journeyMapPoints]);

  const mergedProducerProfileLabels = React.useMemo(() => {
    const combined = [...(display.producerLabels ?? []), ...(producerProfileLabels ?? [])];
    const map = new Map<string, ProducerLabelDetail>();
    combined.forEach((entry) => {
      const label = entry.label.trim();
      if (!label) return;
      const description = entry.description?.trim();
      const obtentionYear =
        typeof entry.obtentionYear === 'number' && Number.isFinite(entry.obtentionYear)
          ? entry.obtentionYear
          : undefined;
      map.set(normalizeKey(label), {
        label,
        description: description || undefined,
        obtentionYear,
      });
    });
    return Array.from(map.values());
  }, [display.producerLabels, producerProfileLabels]);

  const producerLabelKeys = React.useMemo(
    () => new Set(mergedProducerProfileLabels.map((entry) => normalizeKey(entry.label))),
    [mergedProducerProfileLabels]
  );

  const officialBadgeDetails = React.useMemo(() => {
    const merged = mergeLabelDetails(display.officialBadgeDetails, display.officialBadges);
    return filterLabelDetails(merged, producerLabelKeys);
  }, [display.officialBadgeDetails, display.officialBadges, producerLabelKeys]);

  const platformBadgeDetails = React.useMemo(() => {
    const merged = mergeLabelDetails(display.platformBadgeDetails, display.platformBadges);
    return filterLabelDetails(merged, producerLabelKeys);
  }, [display.platformBadgeDetails, display.platformBadges, producerLabelKeys]);

  const productBadgeDetails = React.useMemo(() => {
    const map = new Map<string, ProducerLabelDetail>();
    [...officialBadgeDetails, ...platformBadgeDetails].forEach((entry) => {
      const key = normalizeKey(entry.label);
      if (!key || map.has(key)) return;
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [officialBadgeDetails, platformBadgeDetails]);

  const activeLotLabelDetails = React.useMemo(() => {
    if (!activeLotId) return [];
    return lotLabelsByLot[activeLotId] ?? [];
  }, [activeLotId, lotLabelsByLot]);

  const visibleLotLabels = React.useMemo(() => {
    if (isLotManagement) return activeLotLabelDetails;
    if (activeLotId && lotLabelsByLot[activeLotId]) return lotLabelsByLot[activeLotId] ?? [];
    return productBadgeDetails;
  }, [activeLotId, activeLotLabelDetails, isLotManagement, lotLabelsByLot, productBadgeDetails]);

  React.useEffect(() => {
    if (!selectedLotId) return;
    if (!productBadgeDetails.length) return;
    setLotLabelsByLot((prev) =>
      prev[selectedLotId]
        ? prev
        : { ...prev, [selectedLotId]: productBadgeDetails.map((label) => ({ ...label })) }
    );
  }, [productBadgeDetails, selectedLotId]);

  const qualityLabelCount = React.useMemo(() => {
    if (isLotManagement) return activeLotLabelDetails.length;
    const keys = new Set<string>();
    visibleLotLabels.forEach((entry) => keys.add(normalizeKey(entry.label)));
    mergedProducerProfileLabels.forEach((entry) => keys.add(normalizeKey(entry.label)));
    return keys.size;
  }, [activeLotLabelDetails.length, isLotManagement, mergedProducerProfileLabels, visibleLotLabels]);

  const displayOfficialBadges = React.useMemo(
    () => mergeLabelDetails(display.officialBadgeDetails, display.officialBadges).map((entry) => entry.label),
    [display.officialBadgeDetails, display.officialBadges]
  );
  const displayPlatformBadges = React.useMemo(
    () => mergeLabelDetails(display.platformBadgeDetails, display.platformBadges).map((entry) => entry.label),
    [display.platformBadgeDetails, display.platformBadges]
  );

  const draftOfficialBadgeDetails = React.useMemo(() => {
    const merged = mergeLabelDetailsForEdit(draft.officialBadgeDetails, draft.officialBadges);
    return filterLabelDetails(merged, producerLabelKeys);
  }, [draft.officialBadgeDetails, draft.officialBadges, producerLabelKeys]);

  const draftPlatformBadgeDetails = React.useMemo(() => {
    const merged = mergeLabelDetailsForEdit(draft.platformBadgeDetails, draft.platformBadges);
    return filterLabelDetails(merged, producerLabelKeys);
  }, [draft.platformBadgeDetails, draft.platformBadges, producerLabelKeys]);

  const displayAllergens = React.useMemo(() => {
    if (display.compositionEtiquette?.allergenes?.length) {
      return display.compositionEtiquette.allergenes;
    }
    return buildAllergenList(display.compositionEtiquette?.ingredients ?? []);
  }, [display.compositionEtiquette]);

  const totalParticipants = React.useMemo(
    () => ordersWithProduct.reduce((acc, order) => acc + (order.participants ?? 0), 0),
    [ordersWithProduct]
  );

  const activePosts = React.useMemo(() => {
    if (isLotManagement) {
      if (!activeLotId) return [];
      return lotPriceBreakdownByLot[activeLotId] ?? [];
    }
    return productPosts;
  }, [activeLotId, isLotManagement, lotPriceBreakdownByLot, productPosts]);

  const sumPostsCents = React.useCallback(
    (posts: RepartitionPoste[]) =>
      posts.reduce((acc, post) => {
        if (post.type === 'percent') return acc;
        return acc + eurosToCents(post.valeur);
      }, 0),
    []
  );

  const breakdownPriceCents = React.useMemo(
    () => sumPostsCents(activePosts),
    [activePosts, sumPostsCents]
  );

  const breakdownSlices = React.useMemo(() => {
    const groups = new Map<string, { label: string; valueCents: number }>();
    activePosts.forEach((post) => {
      if (post.type === 'percent') return;
      const rawKey = post.stakeholderKey ?? post.partiePrenante ?? 'autre';
      const key = String(rawKey).trim().toLowerCase() || 'autre';
      const label =
        post.partiePrenante?.trim() ||
        post.stakeholderKey?.trim() ||
        'Autre';
      const valueCents = eurosToCents(post.valeur);
      const existing = groups.get(key);
      if (existing) {
        existing.valueCents += valueCents;
      } else {
        groups.set(key, { label, valueCents });
      }
    });
    return Array.from(groups.values()).map((group, index) => ({
      label: group.label,
      value: centsToEuros(group.valueCents),
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [activePosts]);

  const updateActivePosts = React.useCallback(
    (updater: (prev: RepartitionPoste[]) => RepartitionPoste[]) => {
      if (isLotManagement) {
        if (!activeLotId) return;
        setLotPriceBreakdownByLot((prev) => ({
          ...prev,
          [activeLotId]: updater(prev[activeLotId] ?? []),
        }));
        return;
      }
      setProductPosts((prev) => updater(prev));
    },
    [activeLotId, isLotManagement]
  );

  const tabCounts: Record<DetailTabKey, number> = {
    circuit: timelineDisplay.length,
    quality: qualityLabelCount,
    repartition: activePosts.length,
    consumption: ordersWithProduct.length,
    transparency: (display.compositionEtiquette?.ingredients?.length ?? 0) + displayAllergens.length,
    lot: lotList.length,
  };

  const tabOptions = React.useMemo(() => TAB_OPTIONS, []);

  const tabStats = tabOptions.map((tab) => ({
    ...tab,
    value: tabCounts[tab.id] ?? 0,
  }));

  React.useEffect(() => {
    if (tabOptions.some((tab) => tab.id === activeTab)) return;
    setActiveTab('circuit');
  }, [activeTab, tabOptions]);

  const toggleFollow = React.useCallback(() => {
    setIsFollowing((prev) => !prev);
    toast.success(!isFollowing ? 'Vous suivez ce produit.' : 'Vous ne suivez plus ce produit.');
  }, [isFollowing]);

  const handleSaveToggle = React.useCallback(() => {
    if (!onToggleSaveRef.current) return;
    onToggleSaveRef.current(!isSaved);
  }, [isSaved]);

  const handleAddPost = () => {
    updateActivePosts((prev) => {
      const sortOrders = prev
        .map((post) => (Number.isFinite(post.sortOrder) ? (post.sortOrder as number) : -1))
        .filter((value) => value >= 0);
      const nextSortOrder = sortOrders.length ? Math.max(...sortOrders) + 1 : 0;
      return [
        ...prev,
        {
          partiePrenante: 'Producteur',
          nom: 'Nouveau poste',
          valeur: 0,
          type: 'eur',
          source: 'producer',
          stakeholderKey: 'producer',
          sortOrder: nextSortOrder,
        },
      ];
    });
  };

  const handleRemovePost = (index: number) => {
    updateActivePosts((prev) => {
      const target = prev[index];
      if (target?.source === 'platform') {
        toast.info('Les lignes plateforme sont verrouillees.');
        return prev;
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handlePostChange = (index: number, key: keyof RepartitionPoste, value: string) => {
    updateActivePosts((prev) =>
      prev.map((post, idx) =>
        idx === index
          ? post.source === 'platform'
            ? post
            : {
                ...post,
                [key]: key === 'valeur' ? Number(value) || 0 : value,
              }
          : post
      )
    );
  };

  const updateActiveLotLabels = React.useCallback(
    (updater: (prev: ProducerLabelDetail[]) => ProducerLabelDetail[]) => {
      if (!activeLotId) return;
      setLotLabelsByLot((prev) => ({
        ...prev,
        [activeLotId]: updater(prev[activeLotId] ?? []),
      }));
    },
    [activeLotId]
  );

  const handleAddLotLabel = () => {
    updateActiveLotLabels((prev) => [
      ...prev,
      { label: '', description: '', obtentionYear: undefined },
    ]);
  };

  const handleLotLabelChange = (
    index: number,
    field: 'label' | 'description' | 'obtentionYear',
    value: string
  ) => {
    updateActiveLotLabels((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry;
        if (field === 'obtentionYear') {
          const parsed = value.trim() ? Number(value) : undefined;
          return {
            ...entry,
            obtentionYear: Number.isFinite(parsed) ? parsed : undefined,
          };
        }
        return { ...entry, [field]: value };
      })
    );
  };

  const handleRemoveLotLabel = (index: number) => {
    updateActiveLotLabels((prev) => prev.filter((_, idx) => idx !== index));
  };

  type BadgeDetailKey = 'officialBadgeDetails' | 'platformBadgeDetails';
  const resolveBadgeListKey = (key: BadgeDetailKey) =>
    key === 'officialBadgeDetails' ? 'officialBadges' : 'platformBadges';

  const handleBadgeDetailChange = (
    key: BadgeDetailKey,
    index: number,
    field: 'label' | 'description' | 'obtentionYear',
    value: string
  ) => {
    setDraft((prev) => {
      const listKey = resolveBadgeListKey(key);
      const details = filterLabelDetails(
        mergeLabelDetailsForEdit(prev[key], prev[listKey]),
        producerLabelKeys
      );
      const nextDetails = details.map((entry, idx) => {
        if (idx !== index) return entry;
        if (field === 'obtentionYear') {
          const parsed = value.trim() ? Number(value) : undefined;
          return {
            ...entry,
            obtentionYear: Number.isFinite(parsed) ? parsed : undefined,
          };
        }
        return { ...entry, [field]: value };
      });
      const preservedProducerLabels = (prev[listKey] ?? []).filter((label) =>
        producerLabelKeys.has(normalizeKey(label))
      );
      const nextLabels = nextDetails.map((entry) => entry.label.trim()).filter(Boolean);
      const combinedLabels = normalizeLabelList([...preservedProducerLabels, ...nextLabels]);
      return {
        ...prev,
        [key]: nextDetails.length ? nextDetails : undefined,
        [listKey]: combinedLabels.length ? combinedLabels : undefined,
      };
    });
  };

  const handleAddBadgeDetail = (key: BadgeDetailKey) => {
    setDraft((prev) => {
      const listKey = resolveBadgeListKey(key);
      const details = filterLabelDetails(
        mergeLabelDetailsForEdit(prev[key], prev[listKey]),
        producerLabelKeys
      );
      const nextDetails = [
        ...details,
        { label: '', description: '', obtentionYear: undefined },
      ];
      const preservedProducerLabels = (prev[listKey] ?? []).filter((label) =>
        producerLabelKeys.has(normalizeKey(label))
      );
      const nextLabels = nextDetails.map((entry) => entry.label.trim()).filter(Boolean);
      const combinedLabels = normalizeLabelList([...preservedProducerLabels, ...nextLabels]);
      return {
        ...prev,
        [key]: nextDetails,
        [listKey]: combinedLabels.length ? combinedLabels : undefined,
      };
    });
  };

  const handleRemoveBadgeDetail = (key: BadgeDetailKey, index: number) => {
    setDraft((prev) => {
      const listKey = resolveBadgeListKey(key);
      const details = filterLabelDetails(
        mergeLabelDetailsForEdit(prev[key], prev[listKey]),
        producerLabelKeys
      );
      const nextDetails = details.filter((_, idx) => idx !== index);
      const preservedProducerLabels = (prev[listKey] ?? []).filter((label) =>
        producerLabelKeys.has(normalizeKey(label))
      );
      const nextLabels = nextDetails.map((entry) => entry.label.trim()).filter(Boolean);
      const combinedLabels = normalizeLabelList([...preservedProducerLabels, ...nextLabels]);
      return {
        ...prev,
        [key]: nextDetails.length ? nextDetails : undefined,
        [listKey]: combinedLabels.length ? combinedLabels : undefined,
      };
    });
  };

const updateTimelineStep = (index: number, patch: Partial<TimelineStep>) => {
  setLocalTimeline((prev) => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
};

const buildJourneyLocationPayload = (step: TimelineStep) => {
  const locationLabel = buildStepLocationQuery(step);
  return {
    location: locationLabel || null,
    location_address: step.address?.trim() || null,
    location_details: step.addressDetails?.trim() || null,
    location_country: step.country?.trim() || null,
    location_postcode: step.postcode?.trim() || null,
    location_city: step.city?.trim() || null,
    location_lat: Number.isFinite(step.lat) ? step.lat : null,
    location_lng: Number.isFinite(step.lng) ? step.lng : null,
  };
};

const normalizeLotDates = (dates: LotStepDates): LotStepDates => {
  const periodStart = dates.periodStart?.trim() || undefined;
  const periodEnd = dates.periodEnd?.trim() || undefined;
    const hasPeriod = Boolean(periodStart && periodEnd);
    return {
      periodStart,
      periodEnd,
      dateType: hasPeriod ? 'period' : periodStart || periodEnd ? 'date' : undefined,
    };
  };

  const updateLotStepDates = React.useCallback(
    (lotId: string, stepKey: string, nextDates: LotStepDates) => {
      setLotStepDatesByLot((prev) => ({
        ...prev,
        [lotId]: {
          ...(prev[lotId] ?? {}),
          [stepKey]: normalizeLotDates(nextDates),
        },
      }));
    },
    [normalizeLotDates]
  );

  const createTimelineStep = React.useCallback(
    () => ({
      localId: generateBase62Code(8),
      etape: 'Nouvelle etape',
      description: '',
      address: '',
      addressDetails: '',
      country: 'France',
      postcode: '',
      city: '',
      lieu: '',
    }),
    []
  );

  const handleAddTimelineStep = () => {
    setLocalTimeline((prev) => [...prev, createTimelineStep()]);
  };

  const handleRemoveTimelineStep = (index: number) => {
    const step = localTimeline[index];
    const stepKey = step ? resolveStepKey(step) : undefined;
    if (step?.localId && pendingJourneyImages[step.localId]?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(pendingJourneyImages[step.localId].previewUrl);
    }
    if (step?.localId) {
      setPendingJourneyImages((current) => {
        const next = { ...current };
        delete next[step.localId as string];
        return next;
      });
    }
    if (stepKey) {
      setLotStepDatesByLot((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((lotId) => {
          if (!next[lotId]?.[stepKey]) return;
          const lotSteps = { ...next[lotId] };
          delete lotSteps[stepKey];
          next[lotId] = lotSteps;
        });
        return next;
      });
    }
    setLocalTimeline((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleIngredientChange = (index: number, patch: Partial<Ingredient>) => {
    setDraft((prev) => {
      const ingredients = [...(prev.compositionEtiquette?.ingredients ?? [])];
      const current = ingredients[index] ?? { nom: '' };
      const nextIngredient = { ...current, ...patch };
      if (!nextIngredient.isAllergen) {
        nextIngredient.allergenType = undefined;
      }
      ingredients[index] = nextIngredient;
      const allergenes = buildAllergenList(ingredients);
      return {
        ...prev,
        compositionEtiquette: {
          ...(prev.compositionEtiquette ?? {}),
          ingredients,
          allergenes: allergenes.length ? allergenes : undefined,
        },
      };
    });
  };

  const handleAddIngredient = () => {
    setDraft((prev) => {
      const ingredients = [...(prev.compositionEtiquette?.ingredients ?? []), { nom: '', isAllergen: false }];
      const allergenes = buildAllergenList(ingredients);
      return {
        ...prev,
        compositionEtiquette: {
          ...(prev.compositionEtiquette ?? {}),
          ingredients,
          allergenes: allergenes.length ? allergenes : undefined,
        },
      };
    });
  };

  const handleRemoveIngredient = (index: number) => {
    setDraft((prev) => {
      const ingredients = (prev.compositionEtiquette?.ingredients ?? []).filter((_, idx) => idx !== index);
      const allergenes = buildAllergenList(ingredients);
      return {
        ...prev,
        compositionEtiquette: {
          ...(prev.compositionEtiquette ?? {}),
          ingredients,
          allergenes: allergenes.length ? allergenes : undefined,
        },
      };
    });
  };

  const handleNutritionChange = (key: NutritionFieldKey, value: string) => {
    setDraft((prev) => {
      const nextNutrition = { ...(prev.compositionEtiquette?.nutrition ?? {}) };
      if (value.trim()) {
        nextNutrition[key] = value.trim();
      } else {
        delete nextNutrition[key];
      }
      return {
        ...prev,
        compositionEtiquette: {
          ...(prev.compositionEtiquette ?? {}),
          nutrition: Object.keys(nextNutrition).length ? nextNutrition : undefined,
        },
      };
    });
  };

  const clearImagePreview = React.useCallback(() => {
    if (imagePreviewRef.current) {
      if (imagePreviewRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewRef.current);
      }
      imagePreviewRef.current = null;
    }
    setImagePreviewUrl(null);
  }, []);

  const applyProductImagePreview = React.useCallback(
    (file: File, nextUrl: string, trackObjectUrl: boolean) => {
      clearImagePreview();
      imagePreviewRef.current = trackObjectUrl ? nextUrl : null;
      setImagePreviewUrl(nextUrl);
      setImageFile(file);
      setDraft((prev) => ({
        ...prev,
        productImage: {
          ...(prev.productImage ?? { url: '', alt: prev.name || 'Produit' }),
          url: nextUrl,
          alt: prev.productImage?.alt ?? prev.name,
        },
      }));
    },
    [clearImagePreview]
  );

  const handleProductImageChange = React.useCallback(
    async ({ file, previewUrl }: { file: File; previewUrl: string }) => {
      if (DEMO_MODE || !supabaseClient || isCreateMode) {
        applyProductImagePreview(file, previewUrl, true);
        return;
      }

      const productCode = product.productCode ?? product.id;
      if (!productCode || productCode === 'draft') {
        applyProductImagePreview(file, previewUrl, true);
        return;
      }

      const { data: productRow, error: productError } = await supabaseClient
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle();

      if (productError || !productRow?.id) {
        throw new Error('Produit introuvable.');
      }

      const productId = productRow.id as string;
      const fileExtension = file.type === 'image/webp' ? 'webp' : 'webp';
      const targetPath = `${productId}/product-${Date.now()}.${fileExtension}`;
      let uploadedPath: string | null = null;

      try {
        const { error: uploadError } = await supabaseClient.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(targetPath, file, {
            upsert: false,
            contentType: file.type || 'image/webp',
            cacheControl: '3600',
          });
        if (uploadError) {
          throw uploadError;
        }
        uploadedPath = targetPath;

        const { data: existingImages, error: existingError } = await supabaseClient
          .from('product_images')
          .select('id, sort_order, is_primary')
          .eq('product_id', productId);

        if (existingError) {
          throw existingError;
        }

        const nextSortOrder =
          (existingImages ?? []).reduce((max, entry) => Math.max(max, entry.sort_order ?? 0), -1) + 1;

        const { error: updateError } = await supabaseClient
          .from('product_images')
          .update({ is_primary: false })
          .eq('product_id', productId)
          .eq('is_primary', true);

        if (updateError) {
          throw updateError;
        }

        const altText = (draft.productImage?.alt ?? draft.name ?? product.name ?? '').trim() || null;
        const { error: insertError } = await supabaseClient.from('product_images').insert({
          product_id: productId,
          path: targetPath,
          alt: altText,
          sort_order: nextSortOrder,
          is_primary: true,
        });

        if (insertError) {
          throw insertError;
        }

        const { data: publicData } = supabaseClient.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .getPublicUrl(targetPath);
        const publicUrl = publicData?.publicUrl || previewUrl;
        if (publicUrl !== previewUrl && previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
        applyProductImagePreview(file, publicUrl, false);
        toast.success('Image du produit mise a jour.');
      } catch (err) {
        if (uploadedPath) {
          try {
            await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedPath]);
          } catch {
            // ignore cleanup errors
          }
        }
        throw err;
      }
    },
    [
      applyProductImagePreview,
      draft.name,
      draft.productImage?.alt,
      isCreateMode,
      product.id,
      product.name,
      product.productCode,
      supabaseClient,
      ]
    );

  const queueJourneyImage = React.useCallback((localId: string, file: File, previewUrl: string) => {
    setPendingJourneyImages((prev) => {
      const existing = prev[localId];
      if (existing?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      return {
        ...prev,
        [localId]: { file, previewUrl },
      };
    });
  }, []);

  const applyJourneyImagePreview = React.useCallback(
    (index: number, previewUrl: string, label: string, localId: string) => {
      updateTimelineStep(index, {
        localId,
        preuve: { type: 'lien', label: label || 'Image', url: previewUrl },
      });
    },
    [updateTimelineStep]
  );

  const handleJourneyImageChange = React.useCallback(
    async (index: number, { file, previewUrl }: { file: File; previewUrl: string }) => {
      const currentStep = localTimeline[index];
      const nextLocalId = currentStep?.localId ?? generateBase62Code(8);
      const stepLabel = (currentStep?.etape ?? '').trim() || 'Etape';

      if (!currentStep?.localId) {
        updateTimelineStep(index, { localId: nextLocalId });
      }

      if (DEMO_MODE || !supabaseClient || isCreateMode) {
        applyJourneyImagePreview(index, previewUrl, stepLabel, nextLocalId);
        queueJourneyImage(nextLocalId, file, previewUrl);
        return;
      }

      const productCode = product.productCode ?? product.id;
      if (!productCode || productCode === 'draft') {
        applyJourneyImagePreview(index, previewUrl, stepLabel, nextLocalId);
        queueJourneyImage(nextLocalId, file, previewUrl);
        return;
      }

      const { data: productRow, error: productError } = await supabaseClient
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle();

      if (productError || !productRow?.id) {
        throw new Error('Produit introuvable.');
      }

      const productId = productRow.id as string;
      let journeyStepId = currentStep?.journeyStepId ?? null;
      let createdStep = false;

      if (!journeyStepId) {
        const locationPayload = buildJourneyLocationPayload(
          currentStep ?? ({ etape: stepLabel } as TimelineStep)
        );
        const { data: created, error: createError } = await supabaseClient
          .from('product_journey_steps')
          .insert({
            product_id: productId,
            step_label: stepLabel,
            description: null,
            location: locationPayload.location,
            location_address: locationPayload.location_address,
            location_details: locationPayload.location_details,
            location_postcode: locationPayload.location_postcode,
            location_city: locationPayload.location_city,
            location_lat: locationPayload.location_lat,
            location_lng: locationPayload.location_lng,
            sort_order: index,
          })
          .select('id')
          .maybeSingle();

        if (createError || !created?.id) {
          throw createError ?? new Error("Impossible de creer l'etape.");
        }
        journeyStepId = created.id;
        createdStep = true;
        updateTimelineStep(index, { journeyStepId: journeyStepId ?? undefined, localId: nextLocalId });
      }

      const targetPath = `${productId}/journey-${journeyStepId}-${Date.now()}.webp`;
      let uploadedPath: string | null = null;
      try {
        const { error: uploadError } = await supabaseClient.storage
          .from(JOURNEY_IMAGE_BUCKET)
          .upload(targetPath, file, {
            upsert: false,
            contentType: file.type || 'image/webp',
            cacheControl: '3600',
          });
        if (uploadError) {
          throw uploadError;
        }
        uploadedPath = targetPath;

        const locationPayload = buildJourneyLocationPayload(
          currentStep ?? ({ etape: stepLabel } as TimelineStep)
        );
        const { error: updateError } = await supabaseClient
          .from('product_journey_steps')
          .update({
            evidence_path: targetPath,
            evidence_label: stepLabel,
            location: locationPayload.location,
            location_address: locationPayload.location_address,
            location_details: locationPayload.location_details,
            location_postcode: locationPayload.location_postcode,
            location_city: locationPayload.location_city,
            location_lat: locationPayload.location_lat,
            location_lng: locationPayload.location_lng,
          })
          .eq('id', journeyStepId);

        if (updateError) {
          throw updateError;
        }

        const { data: publicData } = supabaseClient.storage
          .from(JOURNEY_IMAGE_BUCKET)
          .getPublicUrl(targetPath);
        const publicUrl = publicData?.publicUrl || previewUrl;

        if (publicUrl !== previewUrl && previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }

        updateTimelineStep(index, {
          localId: nextLocalId,
          journeyStepId: journeyStepId ?? undefined,
          preuve: { type: 'lien', label: stepLabel, url: publicUrl },
        });
        setPendingJourneyImages((current) => {
          if (!current[nextLocalId]) return current;
          const next = { ...current };
          delete next[nextLocalId];
          return next;
        });
        if (createdStep) {
          toast.success('Etape ajoutee avec image.');
        } else {
          toast.success("Image de l'etape mise a jour.");
        }
      } catch (err) {
        if (uploadedPath) {
          try {
            await supabaseClient.storage.from(JOURNEY_IMAGE_BUCKET).remove([uploadedPath]);
          } catch {
            // ignore cleanup errors
          }
        }
        throw err;
      }
    },
    [
      JOURNEY_IMAGE_BUCKET,
      applyJourneyImagePreview,
      isCreateMode,
      localTimeline,
      product.id,
      product.productCode,
      queueJourneyImage,
      supabaseClient,
      updateTimelineStep,
    ]
  );

  const persistLotStepDates = React.useCallback(
    async (step: TimelineStep, index: number, dates: LotStepDates) => {
      if (DEMO_MODE || !supabaseClient || isCreateMode) return;
      if (!activeLotId || !activeLotPersisted || !activeLotDbId) return;

      const productCode = product.productCode ?? product.id;
      if (!productCode || productCode === 'draft') return;

      const { data: productRow, error: productError } = await supabaseClient
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle();

      if (productError || !productRow?.id) {
        throw new Error('Produit introuvable.');
      }

      const productId = productRow.id as string;
      let journeyStepId = step.journeyStepId ?? null;

      if (!journeyStepId) {
        const locationPayload = buildJourneyLocationPayload(step);
        const { data: created, error: createError } = await supabaseClient
          .from('product_journey_steps')
          .insert({
            product_id: productId,
            step_label: step.etape,
            description: step.description ?? null,
            location: locationPayload.location,
            location_address: locationPayload.location_address,
            location_details: locationPayload.location_details,
            location_postcode: locationPayload.location_postcode,
            location_city: locationPayload.location_city,
            location_lat: locationPayload.location_lat,
            location_lng: locationPayload.location_lng,
            sort_order: index,
          })
          .select('id')
          .maybeSingle();

        if (createError || !created?.id) {
          throw createError ?? new Error("Impossible de creer l'etape.");
        }
        journeyStepId = created.id;
        updateTimelineStep(index, { journeyStepId: journeyStepId ?? undefined });
      }

      const normalized = normalizeLotDates(dates);
      const hasPeriod = normalized.dateType === 'period';
      const occurredAt = hasPeriod ? null : normalized.periodStart ?? normalized.periodEnd ?? null;
      const payload = {
        lot_id: activeLotDbId,
        product_step_id: journeyStepId,
        step_label: step.etape,
        location: buildStepLocationQuery(step) || null,
        occurred_at: occurredAt,
        period_start: hasPeriod ? normalized.periodStart ?? null : null,
        period_end: hasPeriod ? normalized.periodEnd ?? null : null,
      };

      const { data: existing, error: existingError } = await supabaseClient
        .from('lot_trace_steps')
        .select('id')
        .eq('lot_id', activeLotDbId)
        .eq('product_step_id', journeyStepId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing?.id) {
        const { error: updateError } = await supabaseClient
          .from('lot_trace_steps')
          .update(payload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
        return;
      }

      if (!occurredAt && !payload.period_start && !payload.period_end) return;

      const { error: insertError } = await supabaseClient.from('lot_trace_steps').insert(payload);
      if (insertError) throw insertError;
    },
    [
      activeLotDbId,
      activeLotId,
      activeLotPersisted,
      isCreateMode,
      normalizeLotDates,
      product.id,
      product.productCode,
      supabaseClient,
      updateTimelineStep,
    ]
  );

  const handleLotDateChange = React.useCallback(
    (step: TimelineStep, index: number, patch: Partial<LotStepDates>) => {
      if (!activeLotId) return;
      const stepKey = resolveStepKey(step);
      if (!stepKey) return;
      const current = lotStepDatesByLot[activeLotId]?.[stepKey] ?? {};
      const next = { ...current, ...patch };
      updateLotStepDates(activeLotId, stepKey, next);
      void persistLotStepDates(step, index, next).catch((err) => {
        console.error('Lot trace update error:', err);
        toast.error('Mise a jour des dates du lot impossible.');
      });
    },
    [activeLotId, lotStepDatesByLot, persistLotStepDates, updateLotStepDates]
  );

  React.useEffect(() => () => clearImagePreview(), [clearImagePreview]);

  const reorderTimelineStep = (from: number, to: number) => {
    setLocalTimeline((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleTimelineDragStart =
    (index: number) =>
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      setDraggedStepIndex(index);
    };

  const handleTimelineDragOver =
    (index: number) =>
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverStepIndex(index);
    };

  const handleTimelineDrop =
    (index: number) =>
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
      const data = event.dataTransfer.getData('text/plain');
      const from = draggedStepIndex ?? (data ? Number(data) : null);
      if (from === null || Number.isNaN(from)) {
        setDraggedStepIndex(null);
        setDragOverStepIndex(null);
        return;
      }
      reorderTimelineStep(from, index);
      setDraggedStepIndex(null);
      setDragOverStepIndex(null);
    };

  const handleTimelineDragEnd = () => {
    setDraggedStepIndex(null);
    setDragOverStepIndex(null);
  };

  React.useEffect(() => {
    if (!editMode) return;
    const unitReference = localMeasurement === 'kg' ? 'kg' : 'piece';
    setDraft((prev) => ({
      ...prev,
      repartitionValeur: {
        ...(prev.repartitionValeur || { mode: 'detaille', uniteReference: unitReference, postes: [] }),
        uniteReference: unitReference,
        postes: productPosts,
      },
    }));
  }, [editMode, localMeasurement, productPosts]);

  React.useEffect(() => {
    if (!editMode) return;
    setDraft((prev) => ({
      ...prev,
      tracabilite: {
        ...(prev.tracabilite ?? {}),
        timeline: localTimeline,
      },
    }));
  }, [editMode, localTimeline]);

  const availableCategories = categoryOptions?.length ? categoryOptions : PRODUCT_CATEGORIES;
  const normalizedDraftCategory = (draft.category || '').trim();
  const selectedCategory = availableCategories.includes(normalizedDraftCategory) ? normalizedDraftCategory : '';

  const editCTA = (
    <div className="pd-inline-note">
      <Info size={16} />
      <span>
        {isCreateMode
          ? 'Creation du produit : renseignez les champs pour publier.'
          : 'Mode editeur : editez le produit (actuellement sauvegarde fictive pour le prototype).'}
      </span>
    </div>
  );

  const buildCreatePayload = (): CreateProductPayload | null => {
    const name = (draft.name || '').trim();
    if (!name) {
      toast.error('Ajoutez un nom de produit.');
      return null;
    }
    const category = normalizedDraftCategory;
    if (!category) {
      toast.error('Ajoutez une categorie.');
      return null;
    }
    if (!availableCategories.includes(category)) {
      toast.error('Choisissez une categorie dans la liste.');
      return null;
    }
    const description = (draft.shortDescription || draft.longDescription || '').trim();
    const imageUrl = (draft.productImage?.url || product.imageUrl || '').trim();
    const unitValue = (localUnit || '').trim() || (localMeasurement === 'kg' ? 'kg' : 'unit');
    const priceCents = sumPostsCents(activePosts);
    const priceValue = centsToEuros(priceCents);
    const weightValue =
      typeof localWeightKg === 'number'
        ? localWeightKg
        : Number.isFinite(Number(localWeightKg))
          ? Number(localWeightKg)
          : null;
    const vatRateValue = Number.isFinite(Number(draft.vatRate)) ? Number(draft.vatRate) : DEFAULT_VAT_RATE;
    if (localMeasurement === 'unit' && (!weightValue || weightValue <= 0)) {
      toast.error('Ajoutez un poids unitaire valide.');
      return null;
    }
    if (priceCents <= 0 && !isCreateMode) {
      toast.error('Ajoutez des postes de repartition pour calculer le prix.');
      return null;
    }
    const productCode = product.productCode || generateBase62Code(16);
    const producerLabelKeySet = new Set(
      mergedProducerProfileLabels.map((entry) => normalizeKey(entry.label))
    );
    const officialBadgeDetails = filterLabelDetails(
      mergeLabelDetails(draft.officialBadgeDetails, draft.officialBadges),
      producerLabelKeySet
    );
    const platformBadgeDetails = filterLabelDetails(
      mergeLabelDetails(draft.platformBadgeDetails, draft.platformBadges),
      producerLabelKeySet
    );
    const officialBadges = normalizeLabelList(officialBadgeDetails.map((entry) => entry.label));
    const platformBadges = normalizeLabelList(platformBadgeDetails.map((entry) => entry.label));
    const normalizedIngredients = (draft.compositionEtiquette?.ingredients ?? [])
      .map((ingredient) => ({
        ...ingredient,
        nom: ingredient.nom.trim(),
        allergenType: ingredient.isAllergen
          ? (ingredient.allergenType || ingredient.nom || '').trim() || undefined
          : undefined,
      }))
      .filter((ingredient) => ingredient.nom);
    const allergenes = buildAllergenList(normalizedIngredients);
    const nutritionEntries = Object.entries(draft.compositionEtiquette?.nutrition ?? {}).filter(([, value]) =>
      String(value || '').trim()
    );
    const nutrition = nutritionEntries.length
      ? (Object.fromEntries(nutritionEntries) as NutritionFacts)
      : undefined;
    const additifs = normalizeLabelList(draft.compositionEtiquette?.additifs);
    const compositionEtiquette =
      normalizedIngredients.length ||
      allergenes.length ||
      additifs.length ||
      nutrition ||
      draft.compositionEtiquette?.conseilsUtilisation ||
      draft.compositionEtiquette?.conservationDetaillee
        ? {
            ingredients: normalizedIngredients.length ? normalizedIngredients : undefined,
            allergenes: allergenes.length ? allergenes : undefined,
            additifs: additifs.length ? additifs : undefined,
            nutrition,
            conseilsUtilisation: draft.compositionEtiquette?.conseilsUtilisation || undefined,
            conservationDetaillee: draft.compositionEtiquette?.conservationDetaillee || undefined,
          }
        : undefined;
    const detailPayload: ProductDetail = {
      ...draft,
      vatRate: vatRateValue,
      productId: productCode,
      name,
      category,
      shortDescription: description,
      longDescription: draft.longDescription?.trim() || description,
      productImage: imageUrl ? { url: imageUrl, alt: draft.productImage?.alt ?? name } : undefined,
      officialBadges: officialBadges.length ? officialBadges : undefined,
      platformBadges: platformBadges.length ? platformBadges : undefined,
      officialBadgeDetails: officialBadgeDetails.length ? officialBadgeDetails : undefined,
      platformBadgeDetails: platformBadgeDetails.length ? platformBadgeDetails : undefined,
      compositionEtiquette,
      conditionnementPrincipal: unitValue,
      tracabilite: {
        ...(draft.tracabilite ?? {}),
        timeline: localTimeline.length ? stripTimelineProof(localTimeline) : undefined,
      },
      repartitionValeur: {
        ...(draft.repartitionValeur ?? {
          mode: 'detaille',
          uniteReference: localMeasurement === 'kg' ? 'kg' : 'piece',
          postes: [],
        }),
        mode: draft.repartitionValeur?.mode ?? 'detaille',
        uniteReference: localMeasurement === 'kg' ? 'kg' : 'piece',
        postes: productPosts,
      },
      productions: lotList,
    };

    const inStockValue = lotList.some((lot) => lot.statut !== 'epuise');
    const journeyImageFiles = Object.entries(pendingJourneyImages).map(([localId, entry]) => {
      const step = localTimeline.find((item) => item.localId === localId);
      const stepLabel = (step?.etape ?? '').trim() || 'Etape';
      return {
        localId,
        stepLabel,
        file: entry.file,
        previewUrl: entry.previewUrl,
      };
    });
    const lotTraceSteps = Object.entries(lotStepDatesByLot)
      .flatMap(([lotId, steps]) =>
        Object.entries(steps).map(([stepKey, dates]) => {
          const step = localTimeline.find((item) => resolveStepKey(item) === stepKey);
          const normalized = normalizeLotDates(dates);
          if (!normalized.periodStart && !normalized.periodEnd) return null;
          return {
            lotId,
            stepKey,
            journeyStepId: step?.journeyStepId,
            stepLabel: step?.etape ?? stepKey,
            periodStart: normalized.periodStart,
            periodEnd: normalized.periodEnd,
            dateType: normalized.dateType,
          };
        })
      )
      .filter(Boolean) as CreateProductPayload['lotTraceSteps'];
    const createProducer = draft.producer ?? detail.producer;
    const producerId = createProducer?.id ?? product.producerId;
    const producerName = createProducer?.name ?? product.producerName;
    const producerLocation = createProducer?.city ?? product.producerLocation;

    return {
      product: {
        productCode,
        slug: slugify(name),
        name,
        description,
        price: priceValue,
        unit: unitValue,
        category,
        imageUrl,
        producerId,
        producerName,
        producerLocation,
        inStock: inStockValue,
        measurement: localMeasurement,
        weightKg: weightValue && weightValue > 0 ? weightValue : undefined,
        vatRate: vatRateValue,
      } as CreateProductPayload['product'],
      detail: detailPayload,
      imageFile,
      journeyImageFiles: journeyImageFiles.length ? journeyImageFiles : undefined,
      lotTraceSteps: lotTraceSteps?.length ? lotTraceSteps : undefined,
    };
  };

  const resetCreateForm = () => {
    setDraft({ ...detail, vatRate: detail.vatRate ?? DEFAULT_VAT_RATE });
    setLocalMeasurement(product.measurement);
    setLocalUnit(product.unit);
    setLocalWeightKg(product.weightKg ?? '');
    setProductPosts(detail.repartitionValeur?.postes ?? []);
    clearImagePreview();
    setImageFile(null);
    setNotificationMessage('');
    setNotifyFollowers(false);
    setLocalTimeline(fallbackTimeline);
    setPendingJourneyImages((current) => {
      Object.values(current).forEach((entry) => {
        if (entry.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      return {};
    });
    setLotStepDatesByLot({});
    setLotList(detail.productions ?? []);
    setLotDraft(null);
    setLotEditMode(null);
    setSelectedLotId(initialLotId ?? null);
    setLotPriceBreakdownByLot({});
    setLotLabelsByLot({});
    setLotOrderUsageByLot({});
    setLotMode(false);
  };

  const persistJourneySteps = React.useCallback(
    async (productId: string) => {
      if (!supabaseClient) return null;

      const resolvedTimeline: TimelineStep[] = [];
      const normalizedSteps = [];

      for (const [index, step] of localTimeline.entries()) {
        let resolvedStep = step;
        if (!Number.isFinite(step.lat) || !Number.isFinite(step.lng)) {
          const query = buildStepLocationQuery(step);
          if (query) {
            const coords = await geocodeLocation(query);
            if (coords) {
              resolvedStep = { ...step, lat: coords.lat, lng: coords.lng };
            }
          }
        }
        resolvedTimeline.push(resolvedStep);
        const stepLabel = (resolvedStep.etape || '').trim() || 'Etape';
        const description = resolvedStep.description?.trim() || null;
        const locationPayload = buildJourneyLocationPayload(resolvedStep);
        const hasEvidence = Boolean(resolvedStep.preuve?.url);
        normalizedSteps.push({
          step: resolvedStep,
          index,
          stepLabel,
          description,
          locationPayload,
          hasEvidence,
        });
      }

      const { data: existingRows, error: existingError } = await supabaseClient
        .from('product_journey_steps')
        .select('id')
        .eq('product_id', productId);
      if (existingError) {
        throw existingError;
      }

      const existingIds = new Set((existingRows ?? []).map((row) => row.id));
      const keepIds = new Set(
        normalizedSteps
          .map((entry) => entry.step.journeyStepId)
          .filter(Boolean) as string[]
      );
      const stepsToDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));
      if (stepsToDelete.length) {
        const { error: traceDeleteError } = await supabaseClient
          .from('lot_trace_steps')
          .delete()
          .in('product_step_id', stepsToDelete);
        if (traceDeleteError) {
          throw traceDeleteError;
        }

        const { error: deleteError } = await supabaseClient
          .from('product_journey_steps')
          .delete()
          .in('id', stepsToDelete);
        if (deleteError) {
          throw deleteError;
        }
      }

      const insertedSteps: Array<{ index: number; id: string }> = [];
      for (const entry of normalizedSteps) {
        const basePayload = {
          step_label: entry.stepLabel,
          description: entry.description,
          sort_order: entry.index,
          ...entry.locationPayload,
        };
        const payload = entry.hasEvidence
          ? { ...basePayload, evidence_label: entry.stepLabel }
          : basePayload;

        if (entry.step.journeyStepId) {
          const { error: updateError } = await supabaseClient
            .from('product_journey_steps')
            .update(payload)
            .eq('id', entry.step.journeyStepId);
          if (updateError) {
            throw updateError;
          }
        } else {
          const { data: created, error: createError } = await supabaseClient
            .from('product_journey_steps')
            .insert({
              product_id: productId,
              ...payload,
            })
            .select('id')
            .maybeSingle();
          if (createError || !created?.id) {
            throw createError ?? new Error("Impossible de creer l'etape.");
          }
          insertedSteps.push({ index: entry.index, id: created.id });
        }
      }

      const nextTimeline = resolvedTimeline.map((step, idx) => {
        const inserted = insertedSteps.find((entry) => entry.index === idx);
        return inserted ? { ...step, journeyStepId: inserted.id } : step;
      });

      setLocalTimeline(nextTimeline);
      return nextTimeline;
    },
    [buildJourneyLocationPayload, localTimeline, supabaseClient]
  );

  const handleSaveEdit = async () => {
    if (isCreateMode) {
      if (!onCreateProduct) return;
      const payload = buildCreatePayload();
      if (!payload) return;
      onCreateProduct(payload);
      return;
    }
    if (DEMO_MODE || !supabaseClient) {
      setEditMode(false);
      toast.success('Modifications enregistrees (demo).');
      if (notifyFollowers && !notificationMessage.trim()) {
        toast.error('Ajoutez un message de notification pour prevenir les abonnes.');
      }
      return;
    }

    const productCode = product.productCode ?? product.id;
    if (!productCode || productCode === 'draft') {
      toast.error('Produit introuvable.');
      return;
    }

    const saleUnit = localMeasurement === 'kg' ? 'kg' : 'unit';
    const unitValue = (localUnit || '').trim();
    const packagingValue = unitValue || (saleUnit === 'kg' ? 'kg' : 'piece');
    const weightValue =
      typeof localWeightKg === 'number'
        ? localWeightKg
        : Number.isFinite(Number(localWeightKg))
          ? Number(localWeightKg)
          : null;
    const vatRateValue = Number.isFinite(Number(draft.vatRate)) ? Number(draft.vatRate) : DEFAULT_VAT_RATE;
    if (saleUnit === 'unit' && (!weightValue || weightValue <= 0)) {
      toast.error('Ajoutez un poids unitaire valide.');
      return;
    }

    try {
      const { data: productRow, error: productError } = await supabaseClient
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle();
      if (productError || !productRow?.id) {
        throw productError ?? new Error('Produit introuvable.');
      }

      const { error: updateError } = await supabaseClient
        .from('products')
        .update({
          packaging: packagingValue,
          sale_unit: saleUnit,
          unit_weight_kg: saleUnit === 'unit' ? weightValue : null,
          vat_rate: vatRateValue,
        })
        .eq('id', productRow.id);
      if (updateError) {
        throw updateError;
      }

      const persistedTimeline = await persistJourneySteps(productRow.id);
      setTimelineOverride(persistedTimeline ?? localTimeline);
      setEditMode(false);
      toast.success('Modifications enregistrees.');
      if (notifyFollowers && !notificationMessage.trim()) {
        toast.error('Ajoutez un message de notification pour prevenir les abonnes.');
      }
    } catch (error) {
      console.error('Product update error:', error);
      toast.error('Mise a jour du produit impossible.');
    }
  };

  const handleCancelEdit = () => {
    if (isCreateMode) {
      resetCreateForm();
      return;
    }
    resetTimelineEdits();
    setEditMode(false);
  };

  const resolveLotTimestamp = React.useCallback((lot: ProductionLot) => {
    const candidates = [
      lot.fin,
      lot.periodeDisponibilite?.fin,
      lot.debut,
      lot.periodeDisponibilite?.debut,
      lot.DLC_DDM,
    ];
    for (const value of candidates) {
      if (!value) continue;
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return 0;
  }, []);

  const resolveLotStartTimestamp = React.useCallback((lot: ProductionLot) => {
    const candidates = [lot.periodeDisponibilite?.debut, lot.debut];
    for (const value of candidates) {
      if (!value) continue;
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return 0;
  }, []);

  const latestLotId = React.useMemo(() => {
    if (!lotList.length) return null;
    let latest = lotList[0];
    let latestTimestamp = resolveLotStartTimestamp(latest);
    lotList.slice(1).forEach((lot) => {
      const timestamp = resolveLotStartTimestamp(lot);
      if (timestamp >= latestTimestamp) {
        latest = lot;
        latestTimestamp = timestamp;
      }
    });
    return latest.id;
  }, [lotList, resolveLotStartTimestamp]);

  const cloneLotLabels = (labels: ProducerLabelDetail[]) => labels.map((label) => ({ ...label }));
  const cloneLotPosts = (posts: RepartitionPoste[]) => posts.map((post) => ({ ...post }));

  const createLotDraft = (): ProductionLot => ({
    id: `temp-${generateBase62Code(8)}`,
    nomLot: '',
    debut: '',
    fin: '',
    periodeDisponibilite: { debut: '', fin: '' },
    DLC_DDM: '',
    commentaire: '',
    numeroLot: '',
    statut: 'a_venir',
  });

  const handleAddLot = () => {
    const draft = createLotDraft();
    const referenceLotId = latestLotId ?? selectedLotId ?? null;
    const baseLabelDetails =
      referenceLotId && lotLabelsByLot[referenceLotId]
        ? lotLabelsByLot[referenceLotId]
        : productBadgeDetails;
    const basePosts =
      referenceLotId && lotPriceBreakdownByLot[referenceLotId]
        ? lotPriceBreakdownByLot[referenceLotId]
        : productPosts;
    setLotDraft(draft);
    setLotEditMode('create');
    setSelectedLotId(draft.id);
    setLotLabelsByLot((prev) => ({
      ...prev,
      [draft.id]: cloneLotLabels(baseLabelDetails),
    }));
    setLotPriceBreakdownByLot((prev) => ({
      ...prev,
      [draft.id]: cloneLotPosts(basePosts),
    }));
    setLotStepDatesByLot((prev) => (prev[draft.id] ? prev : { ...prev, [draft.id]: {} }));
  };

  const handleEditLot = (lot: ProductionLot) => {
    setLotDraft({
      ...lot,
      periodeDisponibilite: lot.periodeDisponibilite ?? { debut: lot.debut, fin: lot.fin },
    });
    setLotEditMode('edit');
    setSelectedLotId(lot.id);
    setLotLabelsByLot((prev) =>
      prev[lot.id]
        ? prev
        : lot.lotDbId
          ? prev
          : { ...prev, [lot.id]: productBadgeDetails.map((label) => ({ ...label })) }
    );
  };

  const handleLotDraftChange = (patch: Partial<ProductionLot>) => {
    setLotDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.debut !== undefined || patch.fin !== undefined) {
        next.periodeDisponibilite = {
          debut: patch.debut ?? prev.debut,
          fin: patch.fin ?? prev.fin,
        };
      }
      return next;
    });
  };

  const handleCancelLotEdit = React.useCallback(() => {
    if (lotEditMode === 'create' && lotDraft) {
      const draftId = lotDraft.id;
      setLotLabelsByLot((prev) => {
        if (!prev[draftId]) return prev;
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
      setLotPriceBreakdownByLot((prev) => {
        if (!prev[draftId]) return prev;
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
      setLotStepDatesByLot((prev) => {
        if (!prev[draftId]) return prev;
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
    }
    if (lotEditMode === 'edit' && lotDraft?.lotDbId) {
      const lotId = lotDraft.id;
      setLotLabelsByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotPriceBreakdownByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotStepDatesByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
    }
    setLotDraft(null);
    setLotEditMode(null);
  }, [lotDraft, lotEditMode]);

  const estimateLotPriceCents = React.useCallback(
    (posts: RepartitionPoste[]) =>
      posts
        .filter((post) => post.source !== 'platform')
        .reduce((acc, post) => acc + eurosToCents(post.valeur), 0),
    []
  );

  const handleSaveLot = async (options?: { keepDraft?: boolean }) => {
    if (!lotDraft) return;
    if (!lotDraft.nomLot.trim()) {
      toast.error('Ajoutez un nom de lot.');
      return;
    }
    if (!lotDraft.debut || !lotDraft.fin) {
      toast.error('Ajoutez des dates de debut et de fin.');
      return;
    }
    const normalized = {
      ...lotDraft,
      periodeDisponibilite: { debut: lotDraft.debut, fin: lotDraft.fin },
    };
    if (DEMO_MODE || !supabaseClient || isCreateMode) {
      setLotList((prev) => {
        if (lotEditMode === 'edit') {
          return prev.map((item) => (item.id === normalized.id ? normalized : item));
        }
        return [...prev, normalized];
      });
      setSelectedLotId(normalized.id);
      setLotStepDatesByLot((prev) => (prev[normalized.id] ? prev : { ...prev, [normalized.id]: {} }));
      if (options?.keepDraft) {
        setLotDraft(normalized);
        setLotEditMode('edit');
      } else {
        setLotDraft(null);
        setLotEditMode(null);
      }
      toast.success(lotEditMode === 'edit' ? 'Lot mis a jour (demo).' : 'Lot ajoute (demo).');
      return;
    }
    try {
      const productCode = product.productCode ?? product.id;
      if (!productCode || productCode === 'draft') {
        toast.error('Produit introuvable.');
        return;
      }
      const { data: productRow, error: productError } = await supabaseClient
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle();
      if (productError || !productRow?.id) {
        toast.error('Produit introuvable.');
        return;
      }
      const stockValue =
        typeof normalized.qteRestante === 'number'
          ? normalized.qteRestante
          : typeof normalized.qteTotale === 'number'
            ? normalized.qteTotale
            : null;
      const lotPosts = lotPriceBreakdownByLot[normalized.id] ?? [];
      const basePayload = {
        product_id: productRow.id,
        status:
          normalized.statut === 'en_cours'
            ? 'active'
            : normalized.statut === 'a_venir'
              ? 'draft'
              : 'sold_out',
        stock_units: localMeasurement === 'unit' ? stockValue : null,
        stock_kg: localMeasurement === 'kg' ? stockValue : null,
        lot_comment: normalized.nomLot || null,
        produced_at: normalized.debut || null,
        dlc: normalized.DLC_DDM || null,
        ddm: normalized.DLC_DDM || null,
        lot_reference: normalized.numeroLot || null,
        notes: normalized.commentaire || null,
        metadata: {
          sale_period_start: normalized.debut || null,
          sale_period_end: normalized.fin || null,
        },
      };
      const createPayload = {
        ...basePayload,
        price_cents: estimateLotPriceCents(lotPosts),
      };
      const persistLotLabels = async (lotDbId: string, labels: ProducerLabelDetail[]) => {
        const cleaned = labels
          .map((label) => ({
            label: label.label.trim(),
            description: label.description?.trim() || null,
            obtentionYear: label.obtentionYear ?? null,
          }))
          .filter((label) => label.label.length);
        const { error: deleteError } = await supabaseClient
          .from('lot_labels')
          .delete()
          .eq('lot_id', lotDbId);
        if (deleteError) throw deleteError;
        if (!cleaned.length) return;
        const { error: labelError } = await supabaseClient.from('lot_labels').insert(
          cleaned.map((label) => ({
            product_id: productRow.id,
            lot_id: lotDbId,
            label: label.label,
            description: label.description,
            label_type: null,
            obtained_year: label.obtentionYear,
          }))
        );
        if (labelError) throw labelError;
      };
      const persistLotPriceBreakdown = async (lotDbId: string, posts: RepartitionPoste[]) =>
        saveProducerLotBreakdown(supabaseClient, lotDbId, posts, {
          defaultStakeholder: 'Producteur',
          defaultStakeholderKey: 'producer',
        });
      let resolvedLotDbId = normalized.lotDbId ?? null;
      if (lotEditMode === 'edit' && !resolvedLotDbId) {
        const { data: existingLot, error: lotLookupError } = await supabaseClient
          .from('lots')
          .select('id, lot_code, lot_reference')
          .eq('product_id', productRow.id)
          .eq('lot_code', normalized.id)
          .maybeSingle();
        if (lotLookupError || !existingLot?.id) {
          throw lotLookupError ?? new Error('Lot introuvable.');
        }
        resolvedLotDbId = existingLot.id;
      }
      if (lotEditMode === 'edit' && resolvedLotDbId) {
        const { data: updated, error: updateError } = await supabaseClient
          .from('lots')
          .update(basePayload)
          .eq('id', resolvedLotDbId)
          .select('id, lot_code, lot_reference')
          .maybeSingle();
        if (updateError || !updated?.lot_code) {
          throw updateError ?? new Error('Lot introuvable.');
        }
        const persisted = {
          ...normalized,
          id: updated.lot_code,
          lotDbId: updated.id,
          numeroLot: updated.lot_reference ?? normalized.numeroLot,
        };
        const lotLabels = lotLabelsByLot[normalized.id] ?? [];
        await persistLotLabels(updated.id, lotLabels);
        const { breakdown, lot } = await persistLotPriceBreakdown(updated.id, lotPosts);
        const mappedBreakdown = mapBreakdownRowsToPosts(breakdown);
        setLotPriceBreakdownByLot((prev) => ({ ...prev, [persisted.id]: mappedBreakdown }));
        setProductPosts(mappedBreakdown);
        setOverrideLotPriceCents(lot?.price_cents ?? null);
        setLotList((prev) => prev.map((item) => (item.id === persisted.id ? persisted : item)));
        setSelectedLotId(persisted.id);
        if (options?.keepDraft) {
          setLotDraft(persisted);
          setLotEditMode('edit');
        } else {
          setLotDraft(null);
          setLotEditMode(null);
        }
        toast.success('Lot mis a jour.');
        return;
      }
      const { data: created, error: createError } = await supabaseClient
        .from('lots')
        .insert(createPayload)
        .select('id, lot_code, lot_reference')
        .maybeSingle();
      if (createError || !created?.lot_code) {
        throw createError ?? new Error('Creation du lot impossible.');
      }
      const persisted = {
        ...normalized,
        id: created.lot_code,
        lotDbId: created.id,
        numeroLot: created.lot_reference ?? normalized.numeroLot,
      };
      const draftId = normalized.id;
      const draftLabels = lotLabelsByLot[draftId] ?? [];
      const draftPosts = lotPriceBreakdownByLot[draftId] ?? [];
      await persistLotLabels(created.id, draftLabels);
      const { breakdown, lot } = await persistLotPriceBreakdown(created.id, draftPosts);
      const mappedBreakdown = mapBreakdownRowsToPosts(breakdown);
      setLotLabelsByLot((prev) => {
        const { [draftId]: draftLabels, ...rest } = prev;
        return { ...rest, [persisted.id]: draftLabels ?? [] };
      });
      setLotPriceBreakdownByLot((prev) => {
        const { [draftId]: _draftPosts, ...rest } = prev;
        return { ...rest, [persisted.id]: mappedBreakdown };
      });
      setProductPosts(mappedBreakdown);
      setOverrideLotPriceCents(lot?.price_cents ?? null);
      setLotStepDatesByLot((prev) => {
        const { [draftId]: draftSteps, ...rest } = prev;
        return { ...rest, [persisted.id]: draftSteps ?? {} };
      });
      setLotList((prev) => [...prev, persisted]);
      setSelectedLotId(persisted.id);
      if (options?.keepDraft) {
        setLotDraft(persisted);
        setLotEditMode('edit');
      } else {
        setLotDraft(null);
        setLotEditMode(null);
      }
      toast.success('Lot ajoute.');
    } catch (err) {
      console.error('Lot save error:', err);
      toast.error("Impossible d'enregistrer le lot.");
    }
  };

  const handleDeleteLot = async () => {
    if (!activeLot) return;
    const confirmDelete = window.confirm('Êtes-vous sûr de vouloir supprimer ce lot ?');
    if (!confirmDelete) return;

    const lotId = activeLot.id;
    const lotDbId = activeLot.lotDbId ?? null;
    const removeLocalLot = () => {
      setLotList((prev) => prev.filter((lot) => lot.id !== lotId));
      setLotLabelsByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotPriceBreakdownByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotStepDatesByLot((prev) => {
        if (!prev[lotId]) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotOrderUsageByLot((prev) => {
        if (prev[lotId] === undefined) return prev;
        const next = { ...prev };
        delete next[lotId];
        return next;
      });
      setLotDraft(null);
      setLotEditMode(null);
      setSelectedLotId((prev) => (prev === lotId ? null : prev));
      setOverrideLotPriceCents(null);
    };

    if (DEMO_MODE || !supabaseClient || isCreateMode || !lotDbId) {
      removeLocalLot();
      toast.success('Lot supprimé.');
      return;
    }

    try {
      const { data: existingItems, error: itemsError } = await supabaseClient
        .from('order_items')
        .select('id')
        .eq('lot_id', lotDbId)
        .limit(1);
      if (itemsError) {
        throw itemsError;
      }
      if (existingItems?.length) {
        setLotOrderUsageByLot((prev) => ({ ...prev, [lotId]: true }));
        toast.error('Ce lot est déjà utilisé dans une commande.');
        return;
      }

      const deleteForLot = async (table: string) => {
        const { error } = await supabaseClient.from(table).delete().eq('lot_id', lotDbId);
        if (error) throw error;
      };

      await deleteForLot('lot_labels');
      await deleteForLot('lot_price_breakdown');
      await deleteForLot('lot_trace_steps');
      await deleteForLot('lot_inputs');

      const { error: deleteError } = await supabaseClient.from('lots').delete().eq('id', lotDbId);
      if (deleteError) throw deleteError;

      removeLocalLot();
      toast.success('Lot supprimé.');
    } catch (error) {
      console.error('Lot delete error:', error);
      toast.error("Impossible de supprimer le lot.");
    }
  };

  const handleToggleLotMode = React.useCallback(() => {
    setEditMode(false);
    setLotMode((prev) => {
      const next = !prev;
      if (!next) {
        handleCancelLotEdit();
        return next;
      }
      if (!selectedLotId && lotList.length) {
        const nextId = lotList.find((lot) => lot.statut !== 'epuise')?.id ?? lotList[0]?.id ?? null;
        setSelectedLotId(nextId);
      }
      setLotCarouselIndex(0);
      setActiveTab('circuit');
      return next;
    });
  }, [handleCancelLotEdit, lotList, selectedLotId]);

  const handleToggleProductEdit = React.useCallback(() => {
    setLotMode(false);
    handleCancelLotEdit();
    setEditMode((prev) => !prev);
  }, [handleCancelLotEdit]);

  const handleExitLotMode = React.useCallback(() => {
    handleCancelLotEdit();
    setLotMode(false);
  }, [handleCancelLotEdit]);

  const handleOpenProducer = React.useCallback(() => {
    onOpenProducer?.(product);
  }, [onOpenProducer, product]);

  const measurementValue = editMode ? localMeasurement : product.measurement;
  const unitValue = editMode ? localUnit : product.unit;
  const measurementLabel = measurementValue === 'kg' ? '/ Kg' : '/ unité';
  const sanitizedUnitValue = (unitValue || '').trim();
  const unitWeightLabel =
    measurementValue === 'unit' ? formatUnitWeightLabel(product.weightKg) : '';
  const measurementDetails = [sanitizedUnitValue];
  if (unitWeightLabel) measurementDetails.push(unitWeightLabel);
  const measurementDetailsLabel = measurementDetails.filter(Boolean).join(' ');
  const measurementParenthetical = measurementDetailsLabel ? (
    <span className="measurement-parenthetical">({measurementDetailsLabel})</span>
  ) : null;
  const measurementInlineLabel = measurementParenthetical ? (
    <>
      {measurementLabel} {measurementParenthetical}
    </>
  ) : (
    measurementLabel
  );
  const basePriceCents = overrideLotPriceCents ?? eurosToCents(product.price);
  const computedPriceCents = editMode ? breakdownPriceCents : basePriceCents;
  const resolvedDisplayPriceCents =
    !editMode && Number.isFinite(readonlyPriceCentsOverride ?? NaN)
      ? Math.max(0, Math.round(readonlyPriceCentsOverride ?? 0))
      : computedPriceCents;
  const displayPriceLabel =
    resolvedDisplayPriceCents > 0 ? formatEurosFromCents(resolvedDisplayPriceCents) : 'Prix définie plus tard dans "Gestion des lots"';
  const displayCategory = display.category || product.category;
  const displayImage = display.productImage?.url || product.imageUrl;
  const displayProducer = display.producer ?? detail.producer;
  const resolvedProducerName =
    producerProfileName?.trim() || displayProducer.name || product.producerName || 'Producteur';
  const resolvedProducerCity =
    producerProfileCity?.trim() || displayProducer.city || product.producerLocation || 'Ville proche';
  const producerAvatarFallback = displayProducer.photo || DEFAULT_PROFILE_AVATAR;
  const relatedCatalog = React.useMemo(() => {
    const map = new Map<string, Product>();
    (catalog ?? []).forEach((entry) => {
      map.set(entry.id, entry);
      map.set(entry.name, entry);
    });
    return map;
  }, [catalog]);

  const buildLinkedProductCard = (item: LinkedProduct) => {
    const match = relatedCatalog.get(item.id) ?? relatedCatalog.get(item.name);
    if (match) return { product: match, isCatalog: true };
    const fallbackPrice = detail.priceReference?.prixIndicatifUnitaire ?? product.price;
    const fallbackProduct: Product = {
      ...product,
      id: item.id,
      name: item.name,
      description: item.category ?? product.description,
      price: fallbackPrice,
      unit: product.unit,
      category: item.category ?? product.category,
      imageUrl: displayImage || product.imageUrl,
      producerId: displayProducer.id ?? product.producerId,
      producerName: item.producerName ?? resolvedProducerName,
      producerLocation: item.city ?? resolvedProducerCity,
      inStock: true,
      measurement: product.measurement,
    };
    return { product: fallbackProduct, isCatalog: false };
  };

  const sortedLots = React.useMemo(() => {
    const statusRank: Record<ProductionLot['statut'], number> = {
      en_cours: 0,
      a_venir: 1,
      epuise: 2,
    };
    return [...lotList].sort((a, b) => {
      const dateDiff = resolveLotStartTimestamp(a) - resolveLotStartTimestamp(b);
      if (dateDiff !== 0) return dateDiff;
      const rankDiff = statusRank[a.statut] - statusRank[b.statut];
      if (rankDiff !== 0) return rankDiff;
      return a.nomLot.localeCompare(b.nomLot);
    });
  }, [lotList, resolveLotStartTimestamp]);

  const lotCarouselItems = React.useMemo(
    () => [...sortedLots.map((lot) => ({ type: 'lot' as const, lot })), { type: 'create' as const }],
    [sortedLots]
  );

  const useLotCarousel = lotCarouselItems.length > lotVisibleCount;
  const maxLotCarouselIndex = Math.max(0, lotCarouselItems.length - lotVisibleCount);
  const canLotScrollLeft = useLotCarousel && lotCarouselIndex > 0;
  const canLotScrollRight = useLotCarousel && lotCarouselIndex < maxLotCarouselIndex;
  const lotCarouselSlice = lotCarouselItems.slice(
    lotCarouselIndex,
    lotCarouselIndex + lotVisibleCount
  );
  const lotVisibleSlots = Math.max(1, Math.min(lotVisibleCount, lotCarouselItems.length || 1));
  const lotCarouselWidth =
    lotVisibleSlots * LOT_CARD_WIDTH + (lotVisibleSlots - 1) * LOT_CARD_GAP;

  React.useEffect(() => {
    setLotCarouselIndex((prev) => Math.min(prev, maxLotCarouselIndex));
  }, [maxLotCarouselIndex]);

  React.useEffect(() => {
    if (!selectedLotId) return;
    const selectedIndex = lotCarouselItems.findIndex(
      (item) => item.type === 'lot' && item.lot.id === selectedLotId
    );
    if (selectedIndex < 0) return;
    setLotCarouselIndex((current) => {
      if (selectedIndex < current) return selectedIndex;
      if (selectedIndex >= current + lotVisibleCount) {
        return Math.min(selectedIndex - lotVisibleCount + 1, maxLotCarouselIndex);
      }
      return current;
    });
  }, [lotCarouselItems, lotVisibleCount, maxLotCarouselIndex, selectedLotId]);

  const goLotLeft = () => {
    if (!canLotScrollLeft) return;
    setLotCarouselIndex((prev) => Math.max(prev - 1, 0));
  };

  const goLotRight = () => {
    if (!canLotScrollRight) return;
    setLotCarouselIndex((prev) => Math.min(prev + 1, maxLotCarouselIndex));
  };

  const handleLotTouchStart = (event: React.TouchEvent) => {
    if (!useLotCarousel) return;
    setLotCarouselHover(true);
    const touch = event.touches[0];
    lotTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const resetLotTouch = () => {
    lotTouchStartRef.current = null;
  };

  const handleLotTouchEnd = (event: React.TouchEvent) => {
    if (!useLotCarousel || !lotTouchStartRef.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - lotTouchStartRef.current.x;
    resetLotTouch();
    setLotCarouselHover(false);
    if (Math.abs(deltaX) < 6) return;
    if (deltaX < 0) {
      goLotRight();
    } else {
      goLotLeft();
    }
  };

  const handleLotTouchCancel = () => resetLotTouch();

  const handleLotPointerDown = (event: React.PointerEvent) => {
    if (!useLotCarousel) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    lotPointerDragRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const handleLotPointerUp = (event: React.PointerEvent) => {
    if (!useLotCarousel || !lotPointerDragRef.current) return;
    if (lotPointerDragRef.current.id !== undefined && lotPointerDragRef.current.id !== event.pointerId) return;
    const deltaX = event.clientX - lotPointerDragRef.current.x;
    const deltaY = event.clientY - lotPointerDragRef.current.y;
    lotPointerDragRef.current = null;
    if (Math.abs(deltaX) < 30 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      goLotRight();
    } else {
      goLotLeft();
    }
  };

  const handleLotPointerCancel = () => {
    lotPointerDragRef.current = null;
  };

  const handleLotWheel = (event: React.WheelEvent) => {
    if (!useLotCarousel) return;
    if (Math.abs(event.deltaX) < 5) return;
    if (lotWheelLockRef.current) return;
    lotWheelLockRef.current = true;
    window.setTimeout(() => {
      lotWheelLockRef.current = false;
    }, 60);
    event.preventDefault();
    if (event.deltaX > 0) {
      goLotRight();
    } else if (event.deltaX < 0) {
      goLotLeft();
    }
  };

  const circuitTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--split pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
            <div>
              <p className="pd-section-title">Carte des différentes étapes du produit</p>
            </div>
          </div>
          <div ref={journeyMapContainerRef} className="pd-map pd-map--circuit" />
          {journeyMapPoints.length ? null : (
            <p className="pd-text-xs pd-text-muted">
              
            </p>
          )}
        </div>
        {isLotManagement ? (
          <div className="pd-card pd-stack pd-stack--md">
            <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
              <div>
                <p className="pd-section-title">
                  Renseignez les dates / périodes des différentes étapes des produits du lot {activeLot?.nomLot ? `- ${activeLot.nomLot}` : ''}
                </p>
              </div>
            </div>
            {activeLot ? (
              lotTimelineDisplay.length ? (
                <div className="pd-timeline">
                  <div className="pd-timeline__line" />
                  <div className="pd-timeline__list">
                    {lotTimelineDisplay.map((step, index) => {
                      const periodLabel =
                        step.periodStart && step.periodEnd
                          ? `${step.periodStart} -> ${step.periodEnd}`
                          : step.periodStart || step.periodEnd || 'A preciser';
                      return (
                        <div key={step.localId ?? `${step.etape}-${index}`} className="pd-timeline__item">
                          <div className="pd-timeline__marker" />
                          <div className="pd-timeline__row">
                            <div className="pd-timeline__body pd-stack pd-stack--sm">
                              <div className="pd-row pd-row--between pd-gap-sm">
                                <p className="pd-text-strong">{step.etape}</p>
                              </div>
                              <div className="pd-stack pd-stack--xs">
                                <p className="pd-label">Adresse</p>
                                <p>{formatStepLocationLabel(step)}</p>
                              </div>
                              <div className="pd-grid pd-grid--two pd-gap-sm">
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Date (debut)</p>
                                  <input
                                    className="pd-input"
                                    type="date"
                                    value={step.periodStart || step.date || ''}
                                    onChange={(e) => handleLotDateChange(step, index, { periodStart: e.target.value })}
                                  />
                                </div>
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Date (fin)</p>
                                  <input
                                    className="pd-input"
                                    type="date"
                                    value={step.periodEnd || ''}
                                    onChange={(e) => handleLotDateChange(step, index, { periodEnd: e.target.value })}
                                  />
                                  <p className="pd-text-xs pd-text-muted">{periodLabel}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">
                  Ajoutez des etapes dans Circuit-court pour renseigner les dates.
                </p>
              )
            ) : (
              <p className="pd-text-sm pd-text-muted">Selectionnez un lot pour renseigner les dates d'etapes.</p>
            )}
          </div>
        ) : (
          <div className="pd-card pd-stack pd-stack--md">
            <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
              <div>
                <p className="pd-section-title">Étapes de fabrication et parcours du produit</p>
              </div>
              {editMode ? (
                <button
                  type="button"
                  onClick={handleAddTimelineStep}
                  className="pd-btn pd-btn--ghost pd-btn--dashed"
                >
                  <Plus size={16} />
                  Ajouter une etape
                </button>
              ) : null}
            </div>
            {timelineDisplay.length ? (
              <div className="pd-timeline">
                <div className="pd-timeline__line" />
                <div className="pd-timeline__list">
                  {timelineDisplay.map((step, index) => {
                    const isDragging = draggedStepIndex === index;
                    const isOver = dragOverStepIndex === index;
                    const stepImageUrl = step.preuve?.url;
                    const stepImageLabel = step.preuve?.label ?? step.etape ?? 'Etape';
                    const stepDateLabel = !editMode ? formatStepDateLabel(step) : '';
                    return (
                      <div
                        key={step.localId ?? `${step.etape}-${index}`}
                        className={`pd-timeline__item${isDragging ? ' pd-timeline__item--dragging' : ''}${
                          isOver ? ' pd-timeline__item--over' : ''
                        }`}
                        onDragOver={handleTimelineDragOver(index)}
                        onDrop={handleTimelineDrop(index)}
                      >
                        <div className="pd-timeline__marker">{index + 1}</div>
                        <div className="pd-timeline__row">
                          <div className="pd-timeline__body pd-stack pd-stack--xs">
                            <div className="pd-row pd-row--between pd-gap-sm">
                              {editMode ? (
                                <input
                                  className="pd-input pd-input--small pd-timeline__title-input"
                                  value={step.etape}
                                  onChange={(e) => updateTimelineStep(index, { etape: e.target.value })}
                                />
                              ) : (
                                <p className="pd-text-strong pd-timeline__title">{step.etape}</p>
                              )}
                              {editMode ? (
                                <button
                                  type="button"
                                  className="pd-timeline__handle"
                                  draggable
                                  onDragStart={handleTimelineDragStart(index)}
                                  onDragEnd={handleTimelineDragEnd}
                                >
                                  <GripVertical size={16} />
                                </button>
                              ) : null}
                            </div>
                            {editMode || step.description?.trim() ? (
                              <div className="pd-stack pd-stack--xs">
                                <p className="pd-label">Description</p>
                                {editMode ? (
                                  <textarea
                                    className="pd-textarea"
                                    value={step.description || ''}
                                    onChange={(e) => updateTimelineStep(index, { description: e.target.value })}
                                    rows={3}
                                  />
                                ) : (
                                  <p>{step.description}</p>
                                )}
                              </div>
                            ) : null}
                            <div className="pd-stack pd-stack--xs">
                              <p className="pd-label">Adresse</p>
                              {editMode ? (
                                <input
                                  className="pd-input"
                                  value={step.address || ''}
                                  placeholder={step.lieu || ''}
                                  onChange={(e) => updateTimelineStep(index, { address: e.target.value })}
                                />
                              ) : (
                                <p>{formatStepLocationLabel(step)}</p>
                              )}
                            </div>
                            {!editMode && stepDateLabel ? (
                              <div className="pd-stack pd-stack--xs">
                                <p className="pd-label">Date</p>
                                <p>{stepDateLabel}</p>
                              </div>
                            ) : null}
                            {editMode ? (
                              <div className="pd-grid pd-grid--two pd-gap-sm">
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Complement</p>
                                  <input
                                    className="pd-input"
                                    value={step.addressDetails || ''}
                                    onChange={(e) => updateTimelineStep(index, { addressDetails: e.target.value })}
                                  />
                                </div>
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Pays</p>
                                  <select
                                    className="pd-select"
                                    value={step.country || 'France'}
                                    onChange={(e) => updateTimelineStep(index, { country: e.target.value })}
                                  >
                                    <option value="France">France</option>
                                  </select>
                                </div>
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Code postal</p>
                                  <input
                                    className="pd-input"
                                    value={step.postcode || ''}
                                    onChange={(e) => updateTimelineStep(index, { postcode: e.target.value })}
                                  />
                                </div>
                                <div className="pd-stack pd-stack--xs">
                                  <p className="pd-label">Ville</p>
                                  <input
                                    className="pd-input"
                                    value={step.city || ''}
                                    onChange={(e) => updateTimelineStep(index, { city: e.target.value })}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {editMode ? (
                                <div className="pd-row pd-row--wrap pd-row--start pd-gap-sm">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTimelineStep(index)}
                                    className="pd-btn pd-btn--ghost pd-btn--warning"
                                  >
                                    Retirer
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {(editMode || stepImageUrl) && (
                              <div className="pd-timeline__media">
                                {editMode ? (
                                  <ProductImageUploader
                                    currentUrl={stepImageUrl}
                                    alt={stepImageLabel}
                                    onImageChange={(payload) => handleJourneyImageChange(index, payload)}
                                    aspectRatio={4 / 3}
                                  />
                                ) : (
                                  <div className="pd-timeline__media-frame">
                                    <ImageWithFallback
                                      src={stepImageUrl}
                                      alt={stepImageLabel}
                                      className="pd-timeline__media-image"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="pd-text-sm pd-text-muted">Aucune étape de renseignée.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const lotTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-card pd-stack pd-stack--md">
        <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
          <div className="pd-row pd-gap-sm">
            <Package className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Lots</p>
          </div>
          <button type="button" onClick={handleAddLot} className="pd-btn pd-btn--ghost pd-btn--dashed">
            <Plus size={16} />
            Ajouter un lot
          </button>
        </div>
        {lotList.length ? (
          <div className="pd-stack pd-stack--sm">
            {lotList.map((lot) => {
              const badge = lotStatusBadge(lot);
              const availabilityStart = lot.periodeDisponibilite?.debut || lot.debut;
              const availabilityEnd = lot.periodeDisponibilite?.fin || lot.fin;
              return (
                <div key={lot.id} className="pd-lot-card pd-stack pd-stack--sm">
                  <div className="pd-row pd-row--between pd-gap-sm">
                    <div className="pd-row pd-gap-sm">
                      <span className={badge.className}>{badge.label}</span>
                      <p className="pd-text-strong">{lot.nomLot}</p>
                    </div>
                    <div className="pd-row pd-row--wrap pd-gap-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedLotId(lot.id)}
                        className={`pd-btn pd-btn--xs ${
                          selectedLotId === lot.id ? 'pd-btn--outline-active' : 'pd-btn--outline'
                        }`}
                      >
                        {selectedLotId === lot.id ? 'Selectionne' : 'Selectionner ce lot'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditLot(lot)}
                        className="pd-btn pd-btn--xs pd-btn--outline"
                      >
                        <PenLine size={14} />
                        Modifier
                      </button>
                    </div>
                  </div>
                  <div className="pd-grid pd-grid--two pd-gap-sm pd-text-xs pd-text-muted">
                    <p>
                      Disponibilité : {availabilityStart || '-'} {'->'} {availabilityEnd || '-'}
                    </p>
                    <p>
                      Quantités : {lot.qteRestante ?? '-'} / {lot.qteTotale ?? '-'}
                    </p>
                    <p>DLC / DDM : {lot.DLC_DDM || lot.DLC_aReceptionEstimee || '-'}</p>
                    <p>Reference producteur : {lot.numeroLot || 'A preciser'}</p>
                    <p>Code lot plateforme : {lot.id}</p>
                  </div>
                  {lot.commentaire ? <p className="pd-text-body">{lot.commentaire}</p> : null}
                </div>
              );
            })}
            <p className="pd-text-xs pd-text-muted">Selectionnez un lot pour renseigner ses dates d'etapes.</p>
          </div>
        ) : (
          <p className="pd-text-sm pd-text-muted">Pas encore de lots publies.</p>
        )}
      </div>

      {selectedLot ? (
        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
            <div className="pd-row pd-gap-sm">
              <MapPin className="pd-icon pd-icon--accent" />
              <p className="pd-section-title">
                Dates de parcours des produits du lot {selectedLot.nomLot ? `- ${selectedLot.nomLot}` : ''}
              </p>
            </div>
          </div>
          {lotTimelineDisplay.length ? (
            <div className="pd-timeline">
              <div className="pd-timeline__line" />
              <div className="pd-timeline__list">
                {lotTimelineDisplay.map((step, index) => {
                  const periodLabel =
                    step.periodStart && step.periodEnd
                      ? `${step.periodStart} -> ${step.periodEnd}`
                      : step.periodStart || step.periodEnd || 'A preciser';
                  return (
                    <div key={step.localId ?? `${step.etape}-${index}`} className="pd-timeline__item">
                      <div className="pd-timeline__marker" />
                      <div className="pd-timeline__row">
                        <div className="pd-timeline__body pd-stack pd-stack--sm">
                          <div className="pd-row pd-row--between pd-gap-sm">
                            <p className="pd-text-strong">{step.etape}</p>
                          </div>
                          <div className="pd-stack pd-stack--xs">
                            <p className="pd-label">Adresse</p>
                            <p>{formatStepLocationLabel(step)}</p>
                          </div>
                          <div className="pd-grid pd-grid--two pd-gap-sm">
                            <div className="pd-stack pd-stack--xs">
                              <p className="pd-label">Date (debut)</p>
                              {editMode ? (
                                <input
                                  className="pd-input"
                                  type="date"
                                  value={step.periodStart || step.date || ''}
                                  onChange={(e) => handleLotDateChange(step, index, { periodStart: e.target.value })}
                                />
                              ) : (
                                <p>{step.periodStart || step.date || 'A preciser'}</p>
                              )}
                            </div>
                            <div className="pd-stack pd-stack--xs">
                              <p className="pd-label">Date (fin)</p>
                              {editMode ? (
                                <input
                                  className="pd-input"
                                  type="date"
                                  value={step.periodEnd || ''}
                                  onChange={(e) => handleLotDateChange(step, index, { periodEnd: e.target.value })}
                                />
                              ) : (
                                <p>{step.periodStart && step.periodEnd ? periodLabel : '-'}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">
              Ajoutez des etapes dans Circuit-court pour renseigner les dates.
            </p>
          )}
        </div>
      ) : (
        <p className="pd-text-sm pd-text-muted">Selectionnez un lot pour renseigner les dates d'etapes.</p>
      )}

    </div>
  );


  const qualityTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-card pd-stack pd-stack--md">
        <div className="pd-row pd-gap-sm">
          <ShieldCheck className="pd-icon pd-icon--accent" />
          <p className="pd-section-title">
            {isLotManagement ? 'Labels du produit (pour ce lot)' : 'Labels & caracteristiques du produit'}
          </p>
        </div>
        {isLotManagement ? (
          <div className="pd-stack pd-stack--md">
            {activeLotId ? (
              <>
                {activeLotLabelDetails.length ? (
                  <div className="pd-stack pd-stack--sm">
                    {activeLotLabelDetails.map((label, idx) => (
                      <div key={`lot-label-${idx}`} className="pd-card pd-card--subtle pd-stack pd-stack--xs">
                        <div className="pd-grid pd-grid--three pd-gap-sm">
                          <input
                            className="pd-input"
                            value={label.label}
                            onChange={(e) => handleLotLabelChange(idx, 'label', e.target.value)}
                            placeholder="Nom du label"
                          />
                          <input
                            className="pd-input"
                            value={label.description ?? ''}
                            onChange={(e) => handleLotLabelChange(idx, 'description', e.target.value)}
                            placeholder="Description"
                          />
                          <input
                            type="number"
                            className="pd-input"
                            value={label.obtentionYear ?? ''}
                            onChange={(e) => handleLotLabelChange(idx, 'obtentionYear', e.target.value)}
                            placeholder="Annee d'obtention"
                            min="1900"
                            max="2100"
                            step="1"
                          />
                        </div>
                        <div className="pd-row pd-row--wrap pd-gap-sm">
                          <button
                            type="button"
                            onClick={() => handleRemoveLotLabel(idx)}
                            className="pd-btn pd-btn--ghost pd-btn--warning"
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pd-text-sm pd-text-muted">Aucun label pour ce lot.</p>
                )}
                <button
                  type="button"
                  onClick={handleAddLotLabel}
                  className="pd-btn pd-btn--ghost pd-btn--dashed"
                >
                  <Plus size={16} />
                  Ajouter un label de lot
                </button>
              </>
            ) : (
              <p className="pd-text-sm pd-text-muted">
                Selectionnez un lot pour modifier les labels.
              </p>
            )}
          </div>
        ) : (
          <div className="pd-grid pd-grid--two pd-gap-md">
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Labels du produit</p>
              {visibleLotLabels.length ? (
                <div className="pd-grid pd-grid--two pd-gap-sm">
                  {visibleLotLabels.map((badge) => {
                    const description = badge.description?.trim() || getLabelDescription(badge.label);
                    return (
                      <div key={badge.label} className="pd-card pd-card--subtle pd-stack pd-stack--xs">
                        <p className="pd-text-strong">{badge.label}</p>
                        <p className="pd-text-xs pd-text-muted">{description}</p>
                        {badge.obtentionYear ? (
                          <p className="pd-text-xs pd-text-muted">Obtenu en {badge.obtentionYear}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">Aucun label produit renseigne.</p>
              )}
            </div>
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Labels de l'exploitation</p>
              {mergedProducerProfileLabels.length ? (
                <div className="pd-grid pd-grid--two pd-gap-sm">
                  {mergedProducerProfileLabels.map((badge) => (
                    <div key={badge.label} className="pd-card pd-card--subtle pd-stack pd-stack--xs">
                      <p className="pd-text-strong">{badge.label}</p>
                      {badge.description ? (
                        <p className="pd-text-xs pd-text-muted">{badge.description}</p>
                      ) : (
                        <p className="pd-text-xs pd-text-muted">Aucune description renseignee.</p>
                      )}
                      {badge.obtentionYear ? (
                        <p className="pd-text-xs pd-text-muted">Obtenu en {badge.obtentionYear}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">Aucun label d'exploitation pour le moment.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );


  const repartitionTab = (
    <div className="pd-tab pd-stack pd-stack--md">
      <div className="pd-card pd-stack pd-stack--md">
        <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
          <div>
            <p className="pd-text-xs pd-text-muted">
              {isLotManagement
                ? activeLot
                  ? `Lot sélectionné : ${activeLot.nomLot || 'Nouveau lot'}`
                  : 'Sélectionnez un lot pour modifier la répartition.'
                : display.repartitionValeur?.postes?.length
                  ? `Pour chaque ${display.repartitionValeur.uniteReference} - ${
                      display.repartitionValeur.mode === 'detaille' ? 'Montants exacts' : 'Montants estimatifs'
                    }`
                  : "Le producteur n'a pas encore renseigné la répartition"}
            </p>
          </div>
        </div>
        {isLotManagement ? (
          <div className="pd-stack pd-stack--md">
            {activeLot ? (
              <>
                <div className="pd-row pd-row--wrap pd-gap-sm">
                  <button
                    type="button"
                    onClick={handleAddPost}
                    className="pd-btn pd-btn--ghost pd-btn--dashed"
                  >
                    <Plus size={16} />
                    Ajouter un poste
                  </button>
                </div>
                {activePosts.length === 0 ? (
                  <p className="pd-text-sm pd-text-muted">Ajoutez des postes pour renseigner la repartition.</p>
                ) : (
                  <div className="pd-table-wrap">
                    <table className="pd-table">
                      <thead className="pd-table__head">
                        <tr>
                          <th className="pd-table__cell">Partie prenante</th>
                          <th className="pd-table__cell">Poste</th>
                          <th className="pd-table__cell">Valeur (en €)</th>
                          <th className="pd-table__cell">Commentaire</th>
                          <th className="pd-table__cell" />
                        </tr>
                      </thead>
                      <tbody>
                        {activePosts.map((post, idx) => {
                          const isLocked = post.source === 'platform';
                          return (
                            <tr
                              key={`lot-post-${idx}`}
                              className={`pd-table__row${isLocked ? ' pd-table__row--locked' : ''}`}
                            >
                              <td className="pd-table__cell">
                                <input
                                  className="pd-input"
                                  value={post.partiePrenante || ''}
                                  onChange={(e) => handlePostChange(idx, 'partiePrenante', e.target.value)}
                                  placeholder="Ex : Producteur"
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="pd-table__cell">
                                <input
                                  className="pd-input"
                                  value={post.nom}
                                  onChange={(e) => handlePostChange(idx, 'nom', e.target.value)}
                                  placeholder={`Poste ${idx + 1}`}
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="pd-table__cell">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="pd-input"
                                  value={Number.isFinite(post.valeur) ? post.valeur : 0}
                                  onChange={(e) => handlePostChange(idx, 'valeur', e.target.value)}
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="pd-table__cell">
                                <input
                                  className="pd-input"
                                  value={post.details || ''}
                                  onChange={(e) => handlePostChange(idx, 'details', e.target.value)}
                                  placeholder="Optionnel"
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="pd-table__cell">
                                {isLocked ? (
                                  <span className="pd-text-xs pd-text-muted">Verrouille</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePost(idx)}
                                    className="pd-btn pd-btn--ghost pd-btn--warning"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : activePosts.length === 0 ? (
          <p className="pd-text-sm pd-text-muted">Le producteur n'a pas encore renseigné la répartition.</p>
        ) : (
          <div className="pd-stack pd-stack--md">
            <ValuePieChart slices={breakdownSlices} />
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead className="pd-table__head">
                  <tr>
                    <th className="pd-table__cell">Partie prenante</th>
                    <th className="pd-table__cell">Poste</th>
                    <th className="pd-table__cell">Coût (en €)</th>
                    <th className="pd-table__cell">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {activePosts.map((post, idx) => (
                    <tr key={`${post.nom}-${idx}`} className="pd-table__row">
                      <td className="pd-table__cell">
                        <span className="pd-text-body">{post.partiePrenante || '-'}</span>
                      </td>
                      <td className="pd-table__cell">
                        <span className="pd-text-strong">{post.nom || `Poste ${idx + 1}`}</span>
                      </td>
                      <td className="pd-table__cell">
                        <span className="pd-text-body">{formatValue(post)}</span>
                      </td>
                      <td className="pd-table__cell">{post.details || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );


  const consumptionTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-card pd-stack pd-stack--md">
        <div className="pd-row pd-gap-sm">
          <Users className="pd-icon pd-icon--accent" />
          <p className="pd-section-title">Indicateurs par lot</p>
        </div>
        {lotList.length ? (
          <div className="pd-stack pd-stack--sm">
            {lotList.map((lot) => {
              const total = lot.qteTotale ?? 0;
              const remaining = lot.qteRestante ?? 0;
              const mutualised = total ? Math.max(total - remaining, 0) : 0;
              return (
                <div key={`cons-${lot.id}`} className="pd-lot-metrics pd-stack pd-stack--sm">
                  <div className="pd-row pd-row--between pd-text-sm">
                    <span className="pd-text-strong">{lot.nomLot}</span>
                    <span className="pd-text-xs pd-text-muted">{lot.statut.replace('_', ' ')}</span>
                  </div>
                  <div className="pd-grid pd-grid--three pd-gap-sm pd-text-xs pd-text-muted">
                    <div>
                      <p className="pd-label pd-label--tiny">Kg mutualises</p>
                      <p className="pd-text-body">{mutualised || '-'}</p>
                    </div>
                    <div>
                      <p className="pd-label pd-label--tiny">Participants</p>
                      <p className="pd-text-body">{totalParticipants || '-'}</p>
                    </div>
                    <div>
                      <p className="pd-label pd-label--tiny">Commandes</p>
                      <p className="pd-text-body">{ordersWithProduct.length || '-'}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pd-text-sm pd-text-muted">Pas encore de lots pour afficher les indicateurs.</p>
        )}
      </div>

      <div className="pd-grid pd-grid--two pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Avis & commentaires</p>
          {detail.avis?.listeAvis?.length ? (
            <div className="pd-stack pd-stack--sm">
              <div className="pd-row pd-gap-sm pd-text-sm">
                <Star size={16} className="pd-icon pd-icon--star" />
                <span className="pd-text-strong">{detail.avis.noteMoyenne.toFixed(1)}</span>
                <span className="pd-text-muted">({detail.avis.nbAvis} avis)</span>
              </div>
              {detail.avis.listeAvis.map((avis) => (
                <div key={avis.commentaire} className="pd-review-card pd-stack pd-stack--xs">
                  <div className="pd-row pd-gap-sm pd-text-sm">
                    <CheckCircle2 size={14} className="pd-icon pd-icon--success" />
                    <span className="pd-text-strong">{avis.auteur}</span>
                    <span className="pd-text-xs pd-text-muted">{avis.date}</span>
                    <span className="pd-text-xs pd-text-muted">Note {avis.note}/5</span>
                  </div>
                  <p className="pd-text-body">{avis.commentaire}</p>
                  <button className="pd-link-btn">Marquer utile</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Pas encore d'avis.</p>
          )}
        </div>
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Questions / FAQ</p>
          <div className="pd-stack pd-stack--xs">
            <label className="pd-text-sm" htmlFor="question-input">
              Poser une question
            </label>
            <textarea
              id="question-input"
              className="pd-textarea"
              placeholder="Comment ca marche, conditions de retrait..."
            />
            <button className="pd-btn pd-btn--primary">Publier la question</button>
          </div>
          {detail.questions?.listeQnA?.length ? (
            <div className="pd-stack pd-stack--sm">
              {detail.questions.listeQnA.map((qa, idx) => (
                <div key={`${qa.question}-${idx}`} className="pd-faq-card pd-stack pd-stack--xs">
                  <p className="pd-text-strong">{qa.question}</p>
                  <p className="pd-text-xs pd-text-muted">{qa.date}</p>
                  {qa.reponse ? <p className="pd-text-body">Reponse : {qa.reponse}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );


  const transparencyTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--three pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Conservation & dates</p>
          <div className="pd-stack pd-stack--sm">
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">DLC / DDM</p>
              {isLotManagement ? (
                activeLot ? (
                  <input
                    className="pd-input"
                    value={lotDraft?.DLC_DDM || ''}
                    onChange={(e) => handleLotDraftChange({ DLC_DDM: e.target.value })}
                    placeholder="DLC / DDM du lot"
                  />
                ) : (
                  <p className="pd-text-sm pd-text-muted">Selectionnez un lot pour definir la DLC / DDM.</p>
                )
              ) : editMode ? (
                <input
                  className="pd-input"
                  value={draft.dlcEstimee || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dlcEstimee: e.target.value }))}
                  placeholder="DLC estimee"
                />
              ) : (
                <p className="pd-text-body">DLC estimée : {display.dlcEstimee || '-'}</p>
              )}
              {isLotManagement ? (
                display.dlcEstimee ? (
                  <p className="pd-text-xs pd-text-muted">Produit : {display.dlcEstimee}</p>
                ) : null
              ) : activeLot?.DLC_DDM ? (
                <p className="pd-text-xs pd-text-muted">Lot sélectionné : {activeLot.DLC_DDM}</p>
              ) : null}
            </div>
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">Conservation</p>
              <div className="pd-row pd-gap-sm pd-text-sm">
                <Thermometer size={16} />
                {editMode ? (
                  <select
                    className="pd-select"
                    value={draft.conservationMode || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, conservationMode: e.target.value as any }))}
                  >
                    <option value="">A preciser</option>
                    <option value="frais">Frais</option>
                    <option value="ambiant">Ambiant</option>
                    <option value="congele">Congele</option>
                  </select>
                ) : (
                  <span>{display.conservationMode ? `${display.conservationMode} (0-4C si frais)` : 'A preciser'}</span>
                )}
              </div>
              {display.compositionEtiquette?.conservationDetaillee ? (
                <p className="pd-text-xs pd-text-muted">{display.compositionEtiquette.conservationDetaillee}</p>
              ) : null}
            </div>
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">Apres ouverture</p>
              {editMode ? (
                <textarea
                  className="pd-textarea"
                  value={draft.compositionEtiquette?.conseilsUtilisation || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...(prev.compositionEtiquette ?? {}),
                        conseilsUtilisation: e.target.value,
                      },
                    }))
                  }
                  placeholder="Conseils de consommation apres ouverture"
                  rows={3}
                />
              ) : (
                <p className="pd-text-body">
                  {display.compositionEtiquette?.conseilsUtilisation || 'Consommer sous 48h apres ouverture.'}
                </p>
              )}
              <p className="pd-text-xs pd-text-muted">
                Congelation :{' '}
                {display.conservationMode === 'congele' ||
                (display.compositionEtiquette?.conservationDetaillee || '').toLowerCase().includes('congel')
                  ? 'oui'
                  : 'non'}
              </p>
            </div>
          </div>
        </div>
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Ingredients & allergenes</p>
          <div className="pd-stack pd-stack--sm">
            {editMode ? (
              <div className="pd-stack pd-stack--sm">
                <div className="pd-table-wrap">
                  <table className="pd-table">
                    <thead className="pd-table__head">
                      <tr>
                        <th className="pd-table__cell">Ingredient</th>
                        <th className="pd-table__cell">Allergene</th>
                        <th className="pd-table__cell">Type</th>
                        <th className="pd-table__cell" />
                      </tr>
                    </thead>
                    <tbody>
                      {(draft.compositionEtiquette?.ingredients ?? []).map((ingredient, idx) => (
                        <tr key={`ingredient-${idx}`} className="pd-table__row">
                          <td className="pd-table__cell">
                            <input
                              className="pd-input"
                              value={ingredient.nom}
                              onChange={(e) => handleIngredientChange(idx, { nom: e.target.value })}
                              placeholder="Ex : lait cru"
                            />
                          </td>
                          <td className="pd-table__cell">
                            <input
                              type="checkbox"
                              className="pd-checkbox"
                              checked={Boolean(ingredient.isAllergen)}
                              onChange={(e) => handleIngredientChange(idx, { isAllergen: e.target.checked })}
                            />
                          </td>
                          <td className="pd-table__cell">
                            <input
                              className="pd-input"
                              value={ingredient.allergenType || ''}
                              onChange={(e) => handleIngredientChange(idx, { allergenType: e.target.value })}
                              placeholder="Type d'allergene"
                              disabled={!ingredient.isAllergen}
                            />
                          </td>
                          <td className="pd-table__cell">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(idx)}
                              className="pd-btn pd-btn--ghost pd-btn--warning"
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleAddIngredient}
                  className="pd-btn pd-btn--ghost pd-btn--dashed"
                >
                  <Plus size={16} />
                  Ajouter un ingredient
                </button>
              </div>
            ) : display.compositionEtiquette?.ingredients?.length ? (
              <div className="pd-row pd-row--wrap pd-gap-xs">
                {display.compositionEtiquette.ingredients.map((ingredient) => (
                  <span key={ingredient.nom} className="pd-chip">
                    {ingredient.nom}
                  </span>
                ))}
              </div>
            ) : (
              <p className="pd-text-sm pd-text-muted">Ingredients a preciser.</p>
            )}
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Allergenes</p>
              {displayAllergens.length ? (
                <div className="pd-row pd-row--wrap pd-gap-xs">
                  {displayAllergens.map((allergene) => (
                    <span key={allergene} className="pd-chip pd-chip--warn">
                      {allergene}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">Aucun allergene mentionne.</p>
              )}
            </div>
          </div>
        </div>
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Nutrition & composition</p>
          <div className="pd-stack pd-stack--sm">
            {editMode ? (
              <div className="pd-nutrition">
                <div className="pd-nutrition__header">Nutrition pour 100g</div>
                <div className="pd-grid pd-grid--three pd-gap-sm pd-text-xs">
                  {NUTRITION_FIELDS.map((field) => (
                    <label key={field.key} className="pd-stack pd-stack--xs">
                      <span className="pd-text-muted">{field.label}</span>
                      <input
                        className="pd-input"
                        value={draft.compositionEtiquette?.nutrition?.[field.key] ?? ''}
                        onChange={(e) => handleNutritionChange(field.key, e.target.value)}
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : display.compositionEtiquette?.nutrition ? (
              <div className="pd-nutrition">
                <div className="pd-nutrition__header">Nutrition pour 100g</div>
                <div className="pd-grid pd-grid--three pd-gap-sm pd-text-xs">
                  {NUTRITION_FIELDS.map((field) => {
                    const value = display.compositionEtiquette?.nutrition?.[field.key];
                    if (!value) return null;
                    return (
                      <div key={field.key} className="pd-row pd-row--between">
                        <span className="pd-text-muted">{field.label}</span>
                        <span>{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="pd-text-sm pd-text-muted">Valeurs nutritionnelles a renseigner.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === 'circuit') return circuitTab;
    if (activeTab === 'lot') return lotTab;
    if (activeTab === 'quality') return qualityTab;
    if (activeTab === 'repartition') return repartitionTab;
    if (activeTab === 'consumption') return consumptionTab;
    if (activeTab === 'transparency') return transparencyTab;
    return null;
  };

  const relatedSections = [
    { id: 'producer', title: 'Du meme producteur', items: detail.produitsLies?.autresDuProducteur ?? [] },
    { id: 'formats', title: 'Autres formats', items: detail.produitsLies?.autresFormats ?? [] },
    { id: 'similar', title: 'Similaires', items: detail.produitsLies?.similaires ?? [] },
  ].filter((section) => section.items.length);
  const relatedItems = relatedSections.flatMap((section) =>
    section.items.map((item) => ({ item, sectionId: section.id }))
  );

  const handleOpenLinkedProduct = (productId: string, isCatalog: boolean) => {
    if (!onOpenRelatedProduct) return;
    if (!isCatalog) {
      toast.info('Produit indisponible dans le catalogue.');
      return;
    }
    onOpenRelatedProduct(productId);
  };

  const canToggleSave = Boolean(onToggleSave);
  const headerActions = React.useMemo(() => {
    if (!onHeaderActionsChange || isCreateMode) return null;
    return (
      <>
        <button
          type="button"
          onClick={handleSaveToggle}
          className={`header-action-button header-action-button--ghost ${isSaved ? 'pd-btn--save-active' : ''}`}
          disabled={!canToggleSave}
        >
          <Heart className="header-action-icon" />
          <span className="header-action-label">
            {isSaved ? 'Dans ma sélection' : 'Ajouter a ma sélection'}
          </span>
        </button>
        {isOwner ? (
          <>
            <button
              type="button"
              onClick={handleToggleLotMode}
              className={`header-action-button header-action-button--ghost ${
                isLotManagement ? 'pd-btn--outline-active' : ''
              }`}
            >
              <Package className="header-action-icon" />
              <span className="header-action-label">
                {isLotManagement ? 'Quitter la gestion des lots' : 'Gérer les lots'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleToggleProductEdit}
              className={`header-action-button header-action-button--ghost ${
                editMode ? 'pd-btn--outline-active' : ''
              }`}
            >
              <PenLine className="header-action-icon" />
              <span className="header-action-label">
                {editMode ? 'Quitter la modification' : 'Modifier le produit'}
              </span>
            </button>
          </>
        ) : null}
      </>
    );
  }, [
    canToggleSave,
    editMode,
    handleSaveToggle,
    handleToggleLotMode,
    handleToggleProductEdit,
    isCreateMode,
    isLotManagement,
    isOwner,
    isSaved,
    onHeaderActionsChange,
  ]);

  React.useEffect(() => {
    if (!onHeaderActionsChange) return;
    onHeaderActionsChange(headerActions);
  }, [headerActions, onHeaderActionsChange]);

  React.useEffect(() => {
    if (!onHeaderActionsChange) return;
    return () => onHeaderActionsChange(null);
  }, [onHeaderActionsChange]);

  return (
    <div className="pd-view">
      <div className="pd-stack pd-stack--lg">
        {isOwner && editMode ? (
          <div className="pd-card pd-card--soft pd-card--dashed pd-stack pd-stack--sm">
            {editCTA}
            {!isCreateMode ? (
              <>
                <label className="pd-row pd-row--start pd-gap-sm pd-text-sm">
                  <input
                    type="checkbox"
                    checked={notifyFollowers}
                    onChange={(e) => setNotifyFollowers(e.target.checked)}
                    className="pd-checkbox"
                  />
                  <div className="pd-stack pd-stack--xs">
                    <span className="pd-text-strong">Notifier les personnes qui suivent ce produit</span>
                    <p className="pd-text-sm pd-text-muted">
                      Décochez si vous ne souhaitez pas notifier les personnes qui suivent ce produit.
                    </p>
                  </div>
                </label>
                {notifyFollowers ? (
                  <div className="pd-stack pd-stack--xs">
                    <label className="pd-text-strong" htmlFor="notification-message">
                      Message de notification
                    </label>
                    <textarea
                      id="notification-message"
                      className="pd-textarea"
                      placeholder="Ex : Nouveau lot disponible / Changement de DLC / Nouveau format..."
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                    />
                    <div className="pd-preview pd-stack pd-stack--xs">
                      <p className="pd-text-strong">Apercu de la notification</p>
                      <p className="pd-text-body">{detail.name}</p>
                      <p>{notificationMessage || 'Message a ajouter pour notifier vos abonnes.'}</p>
                      <p className="pd-link-accent">Lien vers le produit</p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="pd-row pd-row--wrap pd-gap-sm">
              <button type="button" onClick={handleSaveEdit} className="pd-btn pd-btn--primary pd-btn--pill">
                {isCreateMode ? 'Publier le produit' : 'Enregistrer'}
              </button>
              <button type="button" onClick={handleCancelEdit} className="pd-btn pd-btn--outline pd-btn--pill">
                {isCreateMode ? 'Reinitialiser' : 'Annuler'}
              </button>
            </div>
          </div>
        ) : null}
        {isOwner && isLotManagement ? (
          <div className="pd-stack pd-stack--md">
            <div className="pd-card pd-card--soft pd-card--dashed pd-stack pd-stack--md">
              <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
                <div className="pd-row pd-gap-sm">
                  <Package className="pd-icon pd-icon--accent" />
                  <div className="pd-stack pd-stack--xs">
                    <p className="pd-section-title">Gestion des lots</p>
                    <p className="pd-text-xs pd-text-muted">
                      Modifiez les informations du lot sélectionné avant d'enregistrer.
                    </p>
                  </div>
                </div>
                <div className="pd-row pd-row--wrap pd-gap-sm">
                  {canDeleteActiveLot ? (
                    <button
                      type="button"
                      onClick={handleDeleteLot}
                      className="pd-btn pd-btn--outline pd-btn--pill"
                      disabled={!activeLot}
                    >
                      Supprimer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleSaveLot({ keepDraft: true })}
                    className="pd-btn pd-btn--primary pd-btn--pill"
                    disabled={!lotDraft}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={handleExitLotMode}
                    className="pd-btn pd-btn--outline pd-btn--pill"
                  >
                    Quitter
                  </button>
                </div>
              </div>
              {lotDraft ? (
                <>
                  <div className="pd-grid pd-grid--two pd-gap-sm">
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Nom du lot</span>
                      <input
                        className="pd-input"
                        value={lotDraft.nomLot}
                        onChange={(e) => handleLotDraftChange({ nomLot: e.target.value })}
                        placeholder="Ex : Mars S1"
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Code du lot plateforme</span>
                      <input
                        className="pd-input"
                        value={lotDraft.lotDbId ? lotDraft.id : 'Genere apres enregistrement'}
                        readOnly
                        disabled
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Réference lot producteur</span>
                      <input
                        className="pd-input"
                        value={lotDraft.numeroLot || ''}
                        onChange={(e) => handleLotDraftChange({ numeroLot: e.target.value })}
                        placeholder="Ex : MB-0325"
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Statut</span>
                      <select
                        className="pd-select"
                        value={lotDraft.statut}
                        onChange={(e) => handleLotDraftChange({ statut: e.target.value as ProductionLot['statut'] })}
                      >
                        <option value="a_venir">A venir</option>
                        <option value="en_cours">En cours</option>
                        <option value="epuise">Epuisé</option>
                      </select>
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Début de la période de vente du lot</span>
                      <input
                        type="date"
                        className="pd-input"
                        value={lotDraft.debut || ''}
                        onChange={(e) => handleLotDraftChange({ debut: e.target.value })}
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Fin de la période de vente du lot</span>
                      <input
                        type="date"
                        className="pd-input"
                        value={lotDraft.fin || ''}
                        onChange={(e) => handleLotDraftChange({ fin: e.target.value })}
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Quantité totale (en unité ou Kg)</span>
                      <input
                        type="number"
                        className="pd-input"
                        value={lotDraft.qteTotale ?? ''}
                        onChange={(e) =>
                          handleLotDraftChange({
                            qteTotale: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Quantité restante (en unité ou Kg)</span>
                      <input
                        type="number"
                        className="pd-input"
                        value={lotDraft.qteRestante ?? ''}
                        onChange={(e) =>
                          handleLotDraftChange({
                            qteRestante: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="pd-stack pd-stack--xs">
                    <span className="pd-label">Commentaire</span>
                    <textarea
                      className="pd-textarea"
                      value={lotDraft.commentaire || ''}
                      onChange={(e) => handleLotDraftChange({ commentaire: e.target.value })}
                      rows={3}
                    />
                  </label>
                </>
              ) : (
                <p className="pd-text-sm pd-text-muted">
                  Sélectionnez un lot pour le modifier ou créez-en un nouveau.
                </p>
              )}
            </div>
            <div className="pd-card pd-stack pd-stack--md">
              <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
                <div className="pd-row pd-gap-sm">
                  <Package className="pd-icon pd-icon--accent" />
                  <p className="pd-section-title">Lots</p>
                </div>
                <p className="pd-text-xs pd-text-muted">Sélectionnez votre lot.</p>
              </div>
              <div
                className={`pd-lot-carousel${lotCarouselHover ? ' pd-lot-carousel--hover' : ''}`}
                onMouseEnter={() => setLotCarouselHover(true)}
                onMouseLeave={() => setLotCarouselHover(false)}
              >
                <div
                  className="pd-lot-carousel__viewport"
                  style={{ maxWidth: `${lotCarouselWidth}px` }}
                  onTouchStart={handleLotTouchStart}
                  onTouchEnd={handleLotTouchEnd}
                  onTouchCancel={handleLotTouchCancel}
                  onPointerDown={handleLotPointerDown}
                  onPointerUp={handleLotPointerUp}
                  onPointerCancel={handleLotPointerCancel}
                  onWheel={handleLotWheel}
                >
                  <div className="pd-lot-carousel__track">
                    {lotCarouselSlice.map((item, idx) => {
                      if (item.type === 'create') {
                        return (
                          <button
                            key={`lot-create-${idx}`}
                            type="button"
                            onClick={handleAddLot}
                            className="pd-lot-card pd-lot-card--selectable pd-lot-card--create pd-stack pd-stack--sm"
                          >
                            <div className="pd-row pd-gap-sm">
                              <Plus size={16} />
                              <p className="pd-text-strong">Créer un nouveau lot</p>
                            </div>
                            <p className="pd-text-xs pd-text-muted">
                              Duplique les labels et la répartition du prix du lot précèdent.
                            </p>
                          </button>
                        );
                      }
                      const lot = item.lot;
                      const displayLot = lotDraft?.id === lot.id ? lotDraft : lot;
                      const badge = lotStatusBadge(displayLot);
                      const availabilityStart =
                        displayLot.periodeDisponibilite?.debut || displayLot.debut;
                      const availabilityEnd =
                        displayLot.periodeDisponibilite?.fin || displayLot.fin;
                      const isActive = selectedLotId === lot.id || lotDraft?.id === lot.id;
                      return (
                        <button
                          key={lot.id}
                          type="button"
                          onClick={() => handleEditLot(lot)}
                          className={`pd-lot-card pd-lot-card--selectable pd-stack pd-stack--xs${
                            isActive ? ' pd-lot-card--active' : ''
                          }`}
                        >
                          <div className="pd-row pd-row--between pd-gap-sm">
                            <span className={badge.className}>{badge.label}</span>
                            <span className="pd-text-xs pd-text-muted">
                              {availabilityStart || '-'} {'->'} {availabilityEnd || '-'}
                            </span>
                          </div>
                          <p className="pd-text-strong">{displayLot.nomLot || 'Lot sans nom'}</p>
                          <p className="pd-text-xs pd-text-muted">
                            Réference producteur : {displayLot.numeroLot || 'A preciser'}
                          </p>
                          <p className="pd-text-xs pd-text-muted">Code lot plateforme : {lot.id}</p>
                          <p className="pd-text-xs pd-text-muted">
                            Quantités : {displayLot.qteRestante ?? '-'} / {displayLot.qteTotale ?? '-'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {canLotScrollLeft ? (
                    <button
                      type="button"
                      onClick={goLotLeft}
                      aria-label="Faire defiler vers la gauche"
                      className="pd-lot-carousel__arrow pd-lot-carousel__arrow--left"
                      style={{
                        opacity: lotCarouselHover ? 1 : 0,
                        transform: `translateY(-50%) scale(${lotCarouselHover ? 1 : 0.9})`,
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  ) : null}
                  {canLotScrollRight ? (
                    <button
                      type="button"
                      onClick={goLotRight}
                      aria-label="Faire defiler vers la droite"
                      className="pd-lot-carousel__arrow pd-lot-carousel__arrow--right"
                      style={{
                        opacity: lotCarouselHover ? 1 : 0,
                        transform: `translateY(-50%) scale(${lotCarouselHover ? 1 : 0.9})`,
                      }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="pd-card pd-card--hero pd-card--tabs pd-stack pd-stack--lg">
          <div className="pd-grid pd-grid--hero pd-gap-lg">
          <div className="pd-stack pd-stack--md">
            <div className="pd-row pd-row--wrap pd-gap-sm">
              <span className="pd-badge pd-badge--category">
                {displayCategory}
              </span>
              {displayOfficialBadges.map((badge) => (
                <span key={badge} className="pd-badge pd-badge--official">
                  {badge}
                </span>
              ))}
              {displayPlatformBadges.map((badge) => (
                <span key={badge} className="pd-badge pd-badge--platform">
                  {badge}
                </span>
              ))}
            </div>
            {editMode ? (
              <div className="pd-stack pd-stack--sm">
                <input
                  className="pd-input pd-input--title"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <select
                  className="pd-select"
                  value={selectedCategory}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                  aria-label="Categorie"
                >
                  <option value="" disabled>
                    Choisir une categorie
                  </option>
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="pd-stack pd-stack--xs">
                <h1 className="pd-title">{display.name}</h1>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenProducer}
              className="pd-producer-button"
              disabled={!onOpenProducer}
            >
              <Avatar
                path={producerAvatarPath}
                updatedAt={producerAvatarUpdatedAt}
                supabaseClient={supabaseClient ?? null}
                fallbackSrc={producerAvatarFallback}
                alt={resolvedProducerName}
                className="pd-avatar"
              />
              <div>
                <div className="pd-row pd-gap-sm">
                  <p className="pd-text-strong pd-producer-name">{resolvedProducerName}</p>
                  {displayProducer.badgesProducteur?.includes('Producteur verifie') ? (
                    <span className="pd-chip pd-chip--success">Verifié</span>
                  ) : null}
                </div>
                <p className="pd-row pd-gap-xs pd-text-xs pd-text-muted">
                  <MapPin size={14} className="pd-icon pd-icon--accent" />
                  {resolvedProducerCity}
                </p>
              </div>
            </button>

            {editMode ? (
              <>
                <div className="pd-row pd-row--wrap pd-gap-sm">
                  <div className="pd-stack pd-stack--xs">
                    <span className="pd-label">Prix</span>
                    <span className="pd-price">{displayPriceLabel}</span>
                    <span className="pd-text-xs pd-text-muted">
                      Le prix du produit est rattaché à chaque lot afin que vous puissiez le faire varier.
                    </span>
                  </div>
                </div>
                <div className="pd-row pd-row--wrap pd-gap-sm">
                  <label className="pd-stack pd-stack--xs" htmlFor="product-measurement">
                    <span className="pd-label">Unité de vente</span>
                    <select
                      id="product-measurement"
                      className="pd-select"
                      value={localMeasurement}
                      onChange={(e) => setLocalMeasurement(e.target.value as Product['measurement'])}
                    >
                      <option value="kg">Kg</option>
                      <option value="unit">Unité</option>
                    </select>
                  </label>
                  <label className="pd-stack pd-stack--xs" htmlFor="product-unit">
                    <span className="pd-label">Conditionnement</span>
                    <input
                      id="product-unit"
                      className="pd-input"
                      value={localUnit}
                      onChange={(e) => setLocalUnit(e.target.value)}
                      placeholder="Ex : colis, bouteille"
                    />
                  </label>
                  <label className="pd-stack pd-stack--xs" htmlFor="product-weight">
                    <span className="pd-label">Poids unitaire (kg)</span>
                    <input
                      id="product-weight"
                      type="number"
                      step="0.01"
                      className="pd-input"
                      value={localWeightKg}
                      onChange={(e) =>
                        setLocalWeightKg(e.target.value ? Number(e.target.value) : '')
                      }
                      placeholder="Ex : 0.25"
                    />
                  </label>
                  {isOwner ? (
                    <label className="pd-stack pd-stack--xs">
                      <span className="pd-label">Taux de TVA</span>
                      <select
                        className="pd-select"
                        value={resolvedVatRate}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            vatRate: Number(e.target.value),
                          }))
                        }
                      >
                        <option value={0}>0%</option>
                        <option value={0.055}>5,5%</option>
                        <option value={0.1}>10%</option>
                        <option value={0.2}>20%</option>
                      </select>
                    </label>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="pd-row pd-row--wrap pd-gap-sm pd-text-sm">
                <span className="pd-price">{displayPriceLabel}</span>
                <span className="pd-measurement-inline">{measurementInlineLabel}</span>
              </div>
            )}

            {editMode ? (
              <textarea
                className="pd-textarea"
                value={draft.longDescription || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, longDescription: e.target.value }))}
                placeholder="Description detaillée"
                rows={3}
              />
            ) : display.longDescription ? (
              <p className="pd-callout">{display.longDescription}</p>
            ) : null}
            {!isCreateMode ? (
              <div className="pd-row pd-row--wrap pd-row--start pd-gap-sm">
                <button
                  type="button"
                  onClick={onCreateOrder}
                  disabled={actionButtonsDisabled}
                  className={`pd-btn pd-btn--pill ${
                    actionButtonsDisabled ? 'pd-btn--disabled' : 'pd-btn--primary'
                  }`}
                >
                  Créer une commande avec ce produit
                </button>
                <button
                  type="button"
                  onClick={onParticipate}
                  disabled={!hasOrders || actionButtonsDisabled}
                  className={`pd-btn pd-btn--pill ${
                    !hasOrders || actionButtonsDisabled ? 'pd-btn--disabled' : 'pd-btn--outline-primary'
                  }`}
                >
                  Trouver des commandes de ce produit{' '}
                  <span className="pd-text-xs pd-text-muted">({summaryOrdersLabel})</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="pd-stack pd-stack--md">
            {editMode ? (
              <ProductImageUploader
                currentUrl={displayImage}
                alt={display.name || 'Produit'}
                onImageChange={handleProductImageChange}
              />
            ) : (
              <div className="pd-media-card">
                <ImageWithFallback
                  src={displayImage}
                  alt={display.name ?? undefined}
                  className="pd-media-image"
                />
              </div>
            )}
          </div>
          </div>

          <div className="pd-divider" />

          <div className="profile-tabs-wrapper" aria-label="Sections du produit">
            <div className="profile-tabs">
              {tabStats.map((stat) => {
                const isActive = activeTab === stat.id;
                const Icon = stat.icon;
                return (
                  <button
                    key={stat.id}
                    type="button"
                    onClick={() => setActiveTab(stat.id)}
                    aria-pressed={isActive}
                    aria-label={`${stat.label} (${stat.value})`}
                    className={`profile-tab${isActive ? ' profile-tab--active' : ''}`}
                  >
                    <Icon className="profile-tab-icon" />
                    <span className="profile-tab-label">{stat.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="profile-tab-content">{renderTabContent()}</div>
          </div>
        </div>
      </div>

      {relatedItems.length ? (
        <section className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
            <h2 className="pd-section-title">Produits liés proches</h2>
          </div>
          <div className="pd-related-row">
            {relatedItems.map(({ item, sectionId }) => {
              const { product: relatedProduct, isCatalog } = buildLinkedProductCard(item);
              return (
                <ProductResultCard
                  key={`${sectionId}-${item.id}`}
                  product={relatedProduct}
                  related={[]}
                  canSave={false}
                  inDeck={false}
                  onOpen={(productId) => handleOpenLinkedProduct(productId, isCatalog)}
                  showSelectionControl={false}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};
