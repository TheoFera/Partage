import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { Check, LogOut, Pencil, Share2 } from 'lucide-react';
import { Header, type SearchSuggestion } from './shared/ui/Header';
import { Navigation } from './shared/ui/Navigation';
import { CreateOrderForm } from './modules/orders/pages/CreateOrderForm';
import { ProfileView } from './modules/profile/pages/ProfileView';
import { MessagesView } from './modules/messages/pages/MessagesView';
import { AddProductForm } from './modules/products/pages/AddProductForm';
import { ClientSwipeView } from './modules/products/pages/ClientSwipeView';
import { FiltersPopover } from './shared/ui/FiltersPopover';
import { NotificationsPopover } from './shared/ui/NotificationsPopover';
import { ProductsLanding } from './modules/products/pages/ProductsLanding';
import { HowItWorksView } from './modules/marketing/pages/HowItWorksView';
import { AboutUsView } from './modules/marketing/pages/AboutUsView';
import { MapView } from './modules/products/pages/MapView';
import { OrderClientView } from './modules/orders/pages/OrderClientView';
import { OrderPaymentView } from './modules/orders/pages/OrderPaymentView';
import { OrderShareGainView } from './modules/orders/pages/OrderShareGainView';
import { OrderCloseView } from './modules/orders/pages/OrderCloseView';
import { AuthPage } from './modules/auth/pages/AuthPage';
import { ShareOverlay } from './shared/ui/ShareOverlay';
import { PostcodeOverlay } from './shared/ui/PostcodeOverlay';
import { mockProducts, mockUser, mockGroupOrders } from './data/fixtures/mockData';
import { ProductDetailView } from './modules/products/pages/ProductDetailView';
import type { OrderFull } from './modules/orders/types';
import {
  CreateProductPayload,
  Product,
  ProductDetail,
  ProducerLabelDetail,
  DeckCard,
  User,
  GroupOrder,
  UserRole,
  DeliveryDay,
  LegalEntity,
  OrderPurchaseDraft,
  TimelineStep,
} from './shared/types';
import { getSupabaseClient } from './shared/lib/supabaseClient';
import { centsToEuros, eurosToCents, formatEurosFromCents } from './shared/lib/money';
import { DEMO_MODE } from './shared/config/demoMode';
import { getLotByCode, getProductByCode, listProducts } from './modules/products/api/productsProvider';
import {
  addItem,
  createLockClosePackage,
  createPaymentStub,
  deleteParticipantIfNoActivity,
  fetchCoopBalance,
  fetchParticipantInvoices,
  getOrderFullByCode,
  getParticipantByProfile,
  issueParticipantInvoiceWithCoop,
  issueSharerInvoiceAfterLock,
  listOrdersForUser,
  listPublicOrders,
  finalizeClosePayment,
  finalizePaymentSimulation,
  removeItem,
  requestParticipation,
  setDemoOrders,
  triggerOutgoingEmails,
  updateOrderItemQuantity,
  updatePaymentStatus,
} from './modules/orders/api/orders';
import {
  PRODUCER_LABELS_DESCRIPTION_COLUMN,
  PRODUCER_LABELS_TABLE,
  PRODUCER_LABELS_YEAR_COLUMN,
} from './shared/constants/producerLabels';
import { toast, Toaster } from 'sonner';

const tabRoutes = {
  home: '/',
  deck: '/carte',
  create: '/decouvrir',
  messages: '/messages',
  profile: '/profil',
} as const;

type SearchScope = 'products' | 'producers' | 'combined';

const productFilterOptions = [
  { id: 'fruits-legumes', label: 'Fruits & Legumes' },
  { id: 'poissons-fruits-de-mer', label: 'Poissons & Fruits de mer' },
  { id: 'viandes', label: 'Viandes' },
  { id: 'charcuteries', label: 'Charcuteries' },
  { id: 'traiteurs', label: 'Traiteurs' },
  { id: 'fromages-cremerie', label: 'Fromages & Cremerie' },
  { id: 'epicerie-sucree', label: 'Epicerie Sucree' },
  { id: 'epicerie-salee', label: 'Epicerie Salee' },
  { id: 'boissons', label: 'Boissons' },
  { id: 'beaute-bien-etre', label: 'Beaute & Bien-etre' },
];

const attributeFilterOptions = [
  { id: 'bio', label: 'Bio' },
  { id: 'sans-nitrite', label: 'Sans nitrite' },
  { id: 'aop', label: 'AOP' },
  { id: 'label-rouge', label: 'Label Rouge' },
];

const profileRoleOptions = [
  { id: 'participant', label: 'Participants' },
  { id: 'sharer', label: 'Partageurs' },
  { id: 'producer', label: 'Producteurs' },
];

const producerFilterOptions = [
  { id: 'eleveur', label: 'Eleveur' },
  { id: 'maraicher', label: 'Maraicher' },
  { id: 'arboriculteur', label: 'Arboriculteur' },
  { id: 'cerealier', label: 'Cerealier' },
  { id: 'producteur-laitier-fromager', label: 'Producteur laitier / fromager' },
  { id: 'apiculteur', label: 'Apiculteur' },
  { id: 'viticulteur-cidriculteur-brasseur', label: 'Viticulteur / Cidriculteur / Brasseur' },
  { id: 'pisciculteur-conchyliculteur', label: 'Pisciculteur / Conchyliculteur' },
  { id: 'autre', label: 'Autre' },
];

const producerTagsMap: Record<string, string[]> = {
  'current-user': ['maraicher'],
  p2: ['apiculteur'],
  p3: ['viticulteur-cidriculteur-brasseur'],
  p4: ['eleveur'],
  p5: ['autre'],
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => Boolean(value && UUID_REGEX.test(value));
const POSTCODE_REGEX = /^\d{5}$/;
const POSTCODE_RADIUS_DEFAULT_KM = 20;
const POSTCODE_STORAGE_KEY = 'partage:postcode-search:v1';
const POSTCODE_COORDS_STORAGE_KEY = 'partage:postcode-search-coords:v1';
const POSTCODE_OVERLAY_DISMISSED_SESSION_KEY = 'partage:postcode-overlay-dismissed:v1';
const POSTCODE_GEOCODE_DEBOUNCE_MS = 250;
const POSTCODE_OVERLAY_ALLOWED_PATHS = new Set(['/', '/carte', '/decouvrir']);

const mockNotifications = [
  {
    id: 'notif-1',
    title: 'Paiement confirme',
    message: 'Votre participation a la commande "Commande Ma Ferme" est validee.',
    time: 'Il y a 2 min',
    unread: true,
  },
  {
    id: 'notif-2',
    title: 'Nouvelle commande partagee',
    message: 'Marie Dupont a publie "Panier gourmand du week-end".',
    time: 'Il y a 1 h',
    unread: true,
  },
  {
    id: 'notif-3',
    title: 'Rappel de retrait',
    message: 'Retrait prevu vendredi 17:00 - 19:00.',
    time: 'Hier',
    unread: false,
  },
  {
    id: 'notif-4',
    title: 'Message recu',
    message: 'Le producteur a ajoute une info sur la commande.',
    time: 'Il y a 3 j',
    unread: false,
  },
];

const getTabFromPath = (pathname: string) => {
  if (pathname.startsWith('/carte')) return 'deck';
  if (pathname.startsWith('/decouvrir')) return 'create';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname === '/produit/nouveau') return 'profile';
  if (pathname.startsWith('/profil')) return 'profile';
  return 'home';
};

const parseSlugAndCode = (value?: string | null) => {
  if (!value) return { slug: null, productCode: null };
  const lastDash = value.lastIndexOf('-');
  if (lastDash <= 0) return { slug: null, productCode: value };
  return { slug: value.slice(0, lastDash), productCode: value.slice(lastDash + 1) };
};

const NotFound = ({ message }: { message: string }) => (
  <div className="bg-white rounded-xl p-6 shadow-sm text-center">
    <p className="text-sm text-[#6B7280]">{message}</p>
  </div>
);

const AuthWall = ({
  onLogin,
  onSignup,
  title = 'Connexion requise',
  description = 'Connectez-vous ou creez un compte pour continuer.',
}: {
  onLogin: () => void;
  onSignup: () => void;
  title?: string;
  description?: string;
}) => (
  <div className="bg-white border border-dashed border-[#FF6B4A]/40 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
    <div className="flex flex-col items-center gap-3">
      <span className="px-3 py-1 rounded-full bg-[#FFF1E6] text-[#B45309] text-xs font-semibold">
        Acces limite
      </span>
      <h2 className="text-xl sm:text-2xl text-[#1F2937] font-semibold">{title}</h2>
      <p className="text-sm text-[#6B7280] max-w-xl">{description}</p>
    </div>
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <button
        onClick={onLogin}
        className="px-4 py-2 rounded-lg bg-[#FF6B4A] text-white font-semibold shadow-sm hover:bg-[#FF5A39] transition-colors w-full sm:w-auto"
      >
        Se connecter
      </button>
      <button
        onClick={onSignup}
        className="px-4 py-2 rounded-lg border border-[#FF6B4A] text-[#FF6B4A] font-semibold hover:bg-[#FFF1E6] transition-colors w-full sm:w-auto"
      >
        Creer un compte
      </button>
    </div>
  </div>
);

type StartPaymentPayload = {
  quantities: Record<string, number>;
  total: number;
  weight: number;
  useCoopBalance: boolean;
};

type OrderRouteProps = {
  groupOrders: GroupOrder[];
  currentUser: User | null;
  onClose: () => void;
  onOpenParticipantProfile: (participantName: string) => void;
  onStartPurchase: (order: GroupOrder, payload: StartPaymentPayload) => void;
  supabaseClient?: SupabaseClient | null;
};

type DbNotificationRow = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  order_id?: string | null;
  data?: Record<string, unknown> | null;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread?: boolean;
  orderId?: string | null;
  orderCode?: string | null;
};

type ShareOverlayDetail = { label: string; value: string };

type ProductShareContext = {
  product: Product;
  detail?: ProductDetail | null;
  ordersWithProduct: GroupOrder[];
  timelineSteps?: TimelineStep[];
  sharePath?: string;
};

type ShareOverlayKind = 'order' | 'product' | 'profile' | 'generic';

type ShareOverlayPayload =
  | {
      kind: 'order';
      link: string;
      title: string;
      subtitle?: string;
      description?: string;
      details?: ShareOverlayDetail[];
      orderData: { order: GroupOrder };
    }
  | {
      kind: 'product';
      link: string;
      title: string;
      subtitle?: string;
      description?: string;
      details?: ShareOverlayDetail[];
      productData: ProductShareContext;
    }
  | {
      kind: 'profile';
      link: string;
      title: string;
      subtitle?: string;
      description?: string;
      details?: ShareOverlayDetail[];
      profileData: { profile: User };
    }
  | {
      kind: 'generic';
      link: string;
      title: string;
      subtitle?: string;
      description?: string;
      details?: ShareOverlayDetail[];
    };

const OrderRoute = ({
  groupOrders,
  currentUser,
  onClose,
  onOpenParticipantProfile,
  onStartPurchase,
  supabaseClient,
}: OrderRouteProps) => {
  const params = useParams<{ orderCode: string }>();
  if (!params.orderCode) return <NotFound message="Commande introuvable." />;
  const order = groupOrders.find((o) => o.orderCode === params.orderCode || o.id === params.orderCode);
  return (
    <OrderClientView
      onClose={onClose}
      currentUser={currentUser}
      onOpenParticipantProfile={onOpenParticipantProfile}
      onStartPayment={(payload) => {
        if (!order) {
          toast.error('Commande introuvable pour le paiement.');
          return;
        }
        onStartPurchase(order, payload);
      }}
      supabaseClient={supabaseClient}
    />
  );
};

type AuthRedirectExtras = {
  signupPrefill?: {
    address?: string;
    addressDetails?: string;
    city?: string;
    postcode?: string;
  };
};

const normalizeUserRole = (role?: string | null): UserRole => {
  if (role === 'client') return 'participant';
  const allowedRoles: UserRole[] = ['producer', 'sharer', 'participant'];
  return allowedRoles.includes(role as UserRole) ? (role as UserRole) : 'sharer';
};

const mapSupabaseUserToProfile = (authUser: SupabaseAuthUser): User => {
  const fallbackHandle = authUser.email?.split('@')[0] || authUser.id.slice(0, 6);
  const metaRole = authUser.user_metadata?.role as string | undefined;
  const safeRole = normalizeUserRole(metaRole);
  const metaLat = toNumberOrUndefined(
    authUser.user_metadata?.address_lat ?? authUser.user_metadata?.addressLat ?? authUser.user_metadata?.lat
  );
  const metaLng = toNumberOrUndefined(
    authUser.user_metadata?.address_lng ?? authUser.user_metadata?.addressLng ?? authUser.user_metadata?.lng
  );
  return {
    id: authUser.id,
    name: authUser.user_metadata?.full_name || fallbackHandle || 'Profil',
    email: authUser.email ?? undefined,
    handle: authUser.user_metadata?.handle || fallbackHandle,
    role: safeRole,
    profileImage: authUser.user_metadata?.avatar_url,
    profileVisibility: authUser.user_metadata?.profileVisibility,
    addressVisibility: authUser.user_metadata?.addressVisibility,
    tagline: authUser.user_metadata?.tagline,
    website: authUser.user_metadata?.website,
    address: authUser.user_metadata?.address,
    addressDetails: authUser.user_metadata?.address_details ?? authUser.user_metadata?.addressDetails,
    verified: Boolean(authUser.user_metadata?.verified),
    businessStatus: authUser.user_metadata?.businessStatus,
    producerId: authUser.user_metadata?.producerId,
    addressLat: metaLat,
    addressLng: metaLng,
  };
};

const sanitizeHandle = (value?: string | null) => {
  if (!value) return 'profil';
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
  return normalized || 'profil';
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseDistanceKm = (value?: string) => {
  if (!value) return null;
  const match = value.match(/([\d,.]+)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePostcode = (value?: string | null) => (value ?? '').replace(/\D+/g, '').slice(0, 5);

const extractPostcode = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

const parseSearchQueryParts = (query: string): { text: string; postcode: string | null } => {
  const trimmed = query.trim();
  if (!trimmed) return { text: '', postcode: null };
  const postcodeMatch = trimmed.match(/\b\d{5}\b/);
  const postcode = postcodeMatch ? postcodeMatch[0] : null;
  if (!postcode) return { text: trimmed, postcode: null };
  const text = trimmed.replace(new RegExp(`\\b${postcode}\\b`, 'g'), ' ').replace(/\s+/g, ' ').trim();
  return { text, postcode };
};

const formatRelativeTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "A l'instant";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return date.toLocaleDateString('fr-FR');
};

const geocodeAddress = async (query: string): Promise<{ lat: number; lng: number } | null> => {
  if (!query) return null;
  try {
    const response = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coords = data?.features?.[0]?.geometry?.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  } catch {
    return null;
  }
  return null;
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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

const slugify = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, '-');
const normalizeLabelKey = (value?: string | null) => (value ?? '').trim().toLowerCase();
const DB_PRODUCT_CATEGORIES = [
  'Fruits & Legumes',
  'Poissons & Fruits de mer',
  'Viandes',
  'Charcuteries',
  'Traiteurs',
  'Fromages & Cremerie',
  'Epicerie Sucree',
  'Epicerie Salee',
  'Boissons',
  'Beaute & Bien-etre',
];
const resolveDbCategory = (value: string) => {
  const normalized = normalizeText(value);
  return DB_PRODUCT_CATEGORIES.find((entry) => normalizeText(entry) === normalized) ?? null;
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

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (from: GeoPoint, to: GeoPoint) => {
  const earthRadius = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
};

type ProfileRow = {
  id: string;
  handle: string;
  name: string | null;
  role: string | null;
  profile_visibility: string | null;
  address_visibility: string | null;
  tagline: string | null;
  website: string | null;
  address: string | null;
  address_details?: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  phone_public: string | null;
  contact_email_public: string | null;
  address_lat?: number | null;
  address_lng?: number | null;
  offers_on_site_pickup: boolean | null;
  fresh_products_certified: boolean | null;
  social_links: Record<string, string | null> | null;
  opening_hours: Record<string, string> | null;
  account_type: string | null;
  verified: boolean | null;
  business_status?: string | null;
  producer_id?: string | null;
  profile_image?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
  updated_at?: string | null;
};

type ProfileSearchResult = {
  id: string;
  handle: string;
  name: string;
  role: UserRole;
  city?: string | null;
  postcode?: string | null;
  producerId?: string | null;
};

type LegalEntityRow = {
  id: string;
  profile_id: string;
  legal_name: string;
  siret: string;
  vat_number: string | null;
  vat_regime?: string | null;
  entity_type: string;
  producer_category?: string | null;
  iban?: string | null;
  account_holder_name?: string | null;
  can_receive_sharer_cash?: boolean | null;
  delivery_lead_type?: string | null;
  delivery_lead_days?: number | null;
  delivery_fixed_day?: string | null;
  chronofresh_enabled?: boolean | null;
  chronofresh_min_weight?: number | null;
  chronofresh_max_weight?: number | null;
  producer_delivery_enabled?: boolean | null;
  producer_delivery_days?: string[] | null;
  producer_delivery_min_weight?: number | null;
  producer_delivery_max_weight?: number | null;
  producer_delivery_radius_km?: number | null;
  producer_delivery_fee?: number | null;
  producer_pickup_enabled?: boolean | null;
  producer_pickup_days?: string[] | null;
  producer_pickup_start_time?: string | null;
  producer_pickup_end_time?: string | null;
  producer_pickup_min_weight?: number | null;
  producer_pickup_max_weight?: number | null;
};

type GeoPoint = {
  lat: number;
  lng: number;
};

type PostcodeSearchStatus = 'idle' | 'loading' | 'resolved' | 'failed';

type PostcodeSearchState = {
  postcode: string;
  status: PostcodeSearchStatus;
  coords?: GeoPoint;
};

type ProducerGeoRecord = {
  postcode?: string;
  city?: string;
  coords?: GeoPoint;
};

const DELIVERY_DAY_VALUES: DeliveryDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DELIVERY_DAY_SET = new Set<string>(DELIVERY_DAY_VALUES);

const normalizeDeliveryDayValue = (value?: string | null): DeliveryDay | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase().trim();
  return DELIVERY_DAY_SET.has(normalized) ? (normalized as DeliveryDay) : undefined;
};

const normalizeDeliveryDays = (values?: string[] | null): DeliveryDay[] | undefined => {
  if (!values?.length) return undefined;
  const normalizedDays: DeliveryDay[] = [];
  for (const value of values) {
    const normalizedDay = normalizeDeliveryDayValue(value);
    if (normalizedDay) {
      normalizedDays.push(normalizedDay);
    }
  }
  return normalizedDays.length ? normalizedDays : undefined;
};

const mapLegalRowToEntity = (row: LegalEntityRow): LegalEntity => ({
  legalName: row.legal_name,
  siret: row.siret,
  vatNumber: row.vat_number ?? undefined,
  vatRegime: (row.vat_regime as LegalEntity['vatRegime']) ?? 'unknown',
  entityType: (row.entity_type as LegalEntity['entityType']) ?? 'company',
  producerCategory: row.producer_category ?? undefined,
  iban: row.iban ?? undefined,
  accountHolderName: row.account_holder_name ?? undefined,
  canReceiveSharerCash: row.can_receive_sharer_cash ?? undefined,
  deliveryLeadType: (row.delivery_lead_type as LegalEntity['deliveryLeadType']) ?? undefined,
  deliveryLeadDays: toNumberOrUndefined(row.delivery_lead_days),
  deliveryFixedDay: normalizeDeliveryDayValue(row.delivery_fixed_day),
  chronofreshEnabled: row.chronofresh_enabled ?? undefined,
  chronofreshMinWeight: toNumberOrUndefined(row.chronofresh_min_weight),
  chronofreshMaxWeight: toNumberOrUndefined(row.chronofresh_max_weight),
  producerDeliveryEnabled: row.producer_delivery_enabled ?? undefined,
  producerDeliveryDays: normalizeDeliveryDays(row.producer_delivery_days),
  producerDeliveryMinWeight: toNumberOrUndefined(row.producer_delivery_min_weight),
  producerDeliveryMaxWeight: toNumberOrUndefined(row.producer_delivery_max_weight),
  producerDeliveryRadiusKm: toNumberOrUndefined(row.producer_delivery_radius_km),
  producerDeliveryFee: toNumberOrUndefined(row.producer_delivery_fee),
  producerPickupEnabled: row.producer_pickup_enabled ?? undefined,
  producerPickupDays: normalizeDeliveryDays(row.producer_pickup_days),
  producerPickupStartTime: row.producer_pickup_start_time ?? undefined,
  producerPickupEndTime: row.producer_pickup_end_time ?? undefined,
  producerPickupMinWeight: toNumberOrUndefined(row.producer_pickup_min_weight),
  producerPickupMaxWeight: toNumberOrUndefined(row.producer_pickup_max_weight),
});

const mapProfileRowToUser = (
  row: ProfileRow,
  authUser?: SupabaseAuthUser | null,
  legalEntityRow?: LegalEntityRow | null
): User => {
  const rawRole = (row.role as string) || (authUser?.user_metadata?.role as string) || 'sharer';
  const safeRole = normalizeUserRole(rawRole);
  const fallbackName =
    authUser?.user_metadata?.full_name ||
    authUser?.email?.split('@')[0] ||
    row.handle ||
    'Profil';
  const rowLat = toNumberOrUndefined(row.address_lat);
  const rowLng = toNumberOrUndefined(row.address_lng);
  const metaLat = toNumberOrUndefined(
    authUser?.user_metadata?.address_lat ?? authUser?.user_metadata?.addressLat ?? authUser?.user_metadata?.lat
  );
  const metaLng = toNumberOrUndefined(
    authUser?.user_metadata?.address_lng ?? authUser?.user_metadata?.addressLng ?? authUser?.user_metadata?.lng
  );

  return {
    id: row.id,
    name: row.name || fallbackName,
    email: authUser?.email ?? undefined,
    handle: row.handle || sanitizeHandle(fallbackName),
    role: safeRole,
    accountType: (row.account_type as User['accountType']) ?? 'individual',
    profileImage: row.profile_image ?? undefined,
    avatarPath: row.avatar_path ?? undefined,
    avatarUpdatedAt: row.avatar_updated_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    profileVisibility: (row.profile_visibility as User['profileVisibility']) ?? 'public',
    addressVisibility: (row.address_visibility as User['addressVisibility']) ?? 'private',
    tagline: row.tagline ?? undefined,
    website: row.website ?? undefined,
    address: row.address ?? undefined,
    addressDetails:
      row.address_details ??
      authUser?.user_metadata?.address_details ??
      authUser?.user_metadata?.addressDetails ??
      undefined,
    city: row.city ?? undefined,
    postcode: row.postcode ?? undefined,
    phone: row.phone ?? undefined,
    phonePublic: row.phone_public ?? undefined,
    contactEmailPublic: row.contact_email_public ?? undefined,
    offersOnSitePickup: Boolean(row.offers_on_site_pickup),
    freshProductsCertified: Boolean(row.fresh_products_certified),
    socialLinks: row.social_links ?? undefined,
    openingHours: row.opening_hours ?? undefined,
    verified: Boolean(row.verified),
    businessStatus: row.business_status ?? undefined,
    producerId: row.producer_id ?? undefined,
    addressLat: rowLat ?? metaLat,
    addressLng: rowLng ?? metaLng,
    legalEntity: legalEntityRow ? mapLegalRowToEntity(legalEntityRow) : undefined,
  };
};

type ProfileRouteProps = {
  user: User | null;
  viewer: User;
  products: Product[];
  groupOrders: GroupOrder[];
  userOrders: GroupOrder[];
  deck: DeckCard[];
  deckSelectionIds: Set<string>;
  canSaveProduct: boolean;
  profileMode: 'view' | 'edit';
  onProfileModeChange: (mode: 'view' | 'edit') => void;
  followingProfiles: Record<string, boolean>;
  fetchProfileByHandle: (handle: string) => Promise<User | null>;
  setProfileForShare: React.Dispatch<React.SetStateAction<User | null>>;
  onUpdateUser: (user: Partial<User>) => void;
  onRemoveFromDeck: (productId: string) => void;
  onAddToDeck?: (product: Product) => void;
  onOpenOrder: (orderId: string) => void;
  onToggleFollow: (target: User) => void;
  onMessageUser: (target: User) => void;
  onStartOrderFromProduct: (product: Product) => void;
  onAddProductClick?: () => void;
  onOpenProduct: (productId: string) => void;
  supabaseClient?: SupabaseClient | null;
  onAvatarUpdated?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
  onRegisterSave?: (handler: (() => void) | null) => void;
  forceOwn?: boolean;
};

const ProfileRoute: React.FC<ProfileRouteProps> = ({
  user,
  viewer,
  products,
  groupOrders,
  userOrders,
  deck,
  deckSelectionIds,
  canSaveProduct,
  profileMode,
  onProfileModeChange,
  followingProfiles,
  fetchProfileByHandle,
  setProfileForShare,
  onUpdateUser,
  onRemoveFromDeck,
  onAddToDeck,
  onOpenOrder,
  onToggleFollow,
  onMessageUser,
  onStartOrderFromProduct,
  onAddProductClick,
  onOpenProduct,
  supabaseClient,
  onAvatarUpdated,
  onRegisterSave,
  forceOwn,
}) => {
  const params = useParams<{ handle?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [fetchedProfile, setFetchedProfile] = React.useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(false);

  const profileHandle = user?.handle ?? viewer.handle ?? viewer.name.toLowerCase().replace(/\s+/g, '');
  const resolvedIsOwn =
    Boolean(user) && (forceOwn || !params.handle || params.handle === profileHandle);

  React.useEffect(() => {
    let active = true;
    if (resolvedIsOwn) {
      setFetchedProfile(user ?? null);
      return () => {
        active = false;
      };
    }

    const handleParam = params.handle;
    if (!handleParam) {
      setFetchedProfile(null);
      return () => {
        active = false;
      };
    }

    setLoadingProfile(true);
    fetchProfileByHandle(handleParam)
      .then((profile) => {
        if (!active) return;
        setFetchedProfile(profile);
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [fetchProfileByHandle, params.handle, resolvedIsOwn, user, viewer.handle, viewer.name]);

  const shouldShowNotFound = !resolvedIsOwn && !loadingProfile && !fetchedProfile;

  const profileUser: User | null = React.useMemo(() => {
    if (resolvedIsOwn && user) return user;
    if (fetchedProfile) return fetchedProfile;
    return {
      ...viewer,
      handle: params.handle ?? viewer.handle,
      profileVisibility: 'public',
      addressVisibility: 'private',
    };
  }, [fetchedProfile, params.handle, resolvedIsOwn, user, viewer]);

  React.useEffect(() => {
    if (!profileUser) return;
    setProfileForShare((prev) => {
      if (prev && prev.id === profileUser.id && prev.handle === profileUser.handle) return prev;
      return profileUser;
    });
  }, [profileUser, setProfileForShare]);

  React.useEffect(() => {
    if (!resolvedIsOwn) return;
    const targetHandle = profileUser?.handle;
    if (targetHandle && location.pathname !== `/profil/${targetHandle}`) {
      navigate(`/profil/${targetHandle}`, { replace: true });
    }
  }, [location.pathname, navigate, profileUser?.handle, resolvedIsOwn]);

  const safeProducts = products ?? [];
  const safeGroupOrders = groupOrders ?? [];
  const safeUserOrders = userOrders ?? [];

  const producerProductsForProfile = React.useMemo(() => {
    const producerIds = new Set([profileUser?.id, profileUser?.producerId].filter(Boolean) as string[]);
    const byId = producerIds.size
      ? safeProducts.filter((product) => product.producerId && producerIds.has(product.producerId))
      : [];
    if (byId.length) return byId;
    return safeProducts.filter((product) => product.producerName === profileUser?.name);
  }, [safeProducts, profileUser?.id, profileUser?.name, profileUser?.producerId]);

  const sharerOrdersForProfile = React.useMemo(() => {
    const source = resolvedIsOwn ? safeUserOrders : safeGroupOrders;
    return source.filter((order) => order.sharerId === profileUser?.id);
  }, [safeGroupOrders, profileUser?.id, resolvedIsOwn, safeUserOrders]);

  const producerOrdersForProfile = React.useMemo(() => {
    const producerIds = new Set([profileUser?.id, profileUser?.producerId].filter(Boolean) as string[]);
    const byId = producerIds.size
      ? safeGroupOrders.filter((order) => order.producerId && producerIds.has(order.producerId))
      : [];
    if (byId.length) return byId;
    return safeGroupOrders.filter((order) => order.producerName === profileUser?.name);
  }, [safeGroupOrders, profileUser?.id, profileUser?.name, profileUser?.producerId]);

  const participantOrdersForProfile = React.useMemo(() => {
    if (!resolvedIsOwn || !profileUser) return [];
    return safeUserOrders.filter((order) => order.sharerId !== profileUser.id);
  }, [profileUser, resolvedIsOwn, safeUserOrders]);

  const mergedOrdersForProfile = React.useMemo(() => {
    let source: GroupOrder[] = [];
    if (profileUser?.role === 'producer') {
      source = [
        ...producerOrdersForProfile,
        ...sharerOrdersForProfile,
        ...(resolvedIsOwn ? participantOrdersForProfile : []),
      ];
    } else if (profileUser?.role === 'sharer') {
      source = [
        ...sharerOrdersForProfile,
        ...(resolvedIsOwn ? participantOrdersForProfile : []),
      ];
    } else if (resolvedIsOwn) {
      source = [...participantOrdersForProfile];
    } else {
      source = [...sharerOrdersForProfile];
    }
    const unique = new Map<string, GroupOrder>();
    source.forEach((order) => {
      if (!unique.has(order.id)) unique.set(order.id, order);
    });
    return Array.from(unique.values());
  }, [
    participantOrdersForProfile,
    producerOrdersForProfile,
    profileUser?.role,
    resolvedIsOwn,
    sharerOrdersForProfile,
  ]);

  const visibleOrdersForProfile = React.useMemo(
    () =>
      resolvedIsOwn
        ? mergedOrdersForProfile
        : mergedOrdersForProfile.filter((order) => order.visibility === 'public'),
    [mergedOrdersForProfile, resolvedIsOwn]
  );

  const externalDeck = React.useMemo(() => {
    const collection = new Map<string, DeckCard>();
    visibleOrdersForProfile.forEach((order) => {
      order.products.forEach((product) => {
        collection.set(product.id, { ...product, addedAt: new Date() });
      });
    });
    return Array.from(collection.values());
  }, [visibleOrdersForProfile]);

  const profileDeck = resolvedIsOwn ? deck : externalDeck;

  if (shouldShowNotFound || !profileUser) {
    return <NotFound message="Profil introuvable." />;
  }

  const isFollowing = Boolean(followingProfiles[profileUser.id]);

  return (
    <ProfileView
      user={profileUser}
      producerProducts={producerProductsForProfile}
      deck={profileDeck}
      orders={visibleOrdersForProfile}
      isOwnProfile={resolvedIsOwn}
      mode={resolvedIsOwn ? profileMode : 'view'}
      onModeChange={resolvedIsOwn ? onProfileModeChange : undefined}
      onUpdateUser={resolvedIsOwn ? onUpdateUser : () => {}}
      onRemoveFromDeck={onRemoveFromDeck}
      onAddToDeck={onAddToDeck}
      selectionIds={deckSelectionIds}
      onOpenOrder={onOpenOrder}
      isFollowing={isFollowing}
      onToggleFollow={!resolvedIsOwn ? () => onToggleFollow(profileUser) : undefined}
      onMessageUser={!resolvedIsOwn ? () => onMessageUser(profileUser) : undefined}
      onStartOrderFromProduct={onStartOrderFromProduct}
      onAddProductClick={resolvedIsOwn && profileUser.role === 'producer' ? onAddProductClick : undefined}
      onOpenProduct={onOpenProduct}
      supabaseClient={supabaseClient ?? null}
      onAvatarUpdated={onAvatarUpdated}
      onRegisterSave={onRegisterSave}
    />
  );
};

type ProductRouteViewProps = {
  products: Product[];
  deck: DeckCard[];
  groupOrders: GroupOrder[];
  user: User | null;
  canSaveProduct: boolean;
  useDemoProducts: boolean;
  createdProductDetails: Record<string, ProductDetail>;
  supabaseClient?: SupabaseClient | null;
  onHeaderActionsChange: React.Dispatch<React.SetStateAction<React.ReactNode | null>>;
  onOpenProducer: (product: Product) => void;
  onOpenRelatedProduct: (productId: string) => void;
  onStartOrderFromProduct: (product: Product) => void;
  onAddToDeck: (product: Product) => void;
  onRemoveFromDeck: (productId: string) => void;
  onShareProduct: (product: Product, context?: ProductShareContext) => void;
  onShareContextChange?: (context: ProductShareContext | null) => void;
  onSearchProductOrders?: (product: Product) => void;
};

const ProductRouteView: React.FC<ProductRouteViewProps> = ({
  products,
  deck,
  groupOrders,
  user,
  canSaveProduct,
  useDemoProducts,
  createdProductDetails,
  supabaseClient,
  onHeaderActionsChange,
  onOpenProducer,
  onOpenRelatedProduct,
  onStartOrderFromProduct,
  onAddToDeck,
  onRemoveFromDeck,
  onShareProduct,
  onShareContextChange,
  onSearchProductOrders,
}) => {
  const params = useParams<{
    id?: string;
    slugAndCode?: string;
    productSlug?: string;
    lotCode?: string;
    orderCode?: string;
  }>();
  const navigate = useNavigate();
  const slugParam = params.slugAndCode ?? params.productSlug ?? null;
  const productCode = slugParam ? parseSlugAndCode(slugParam).productCode : params.id ?? null;
  const lotCode = params.lotCode ?? null;
  const orderCode = params.orderCode ?? null;
  const [product, setProduct] = React.useState<Product | null>(null);
  const [detail, setDetail] = React.useState<ProductDetail | null>(null);
  const [activeLotCode, setActiveLotCode] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [producerProfileLabels, setProducerProfileLabels] = React.useState<ProducerLabelDetail[]>([]);
  const [orderContext, setOrderContext] = React.useState<OrderFull | null>(null);

  const ordersForProduct = React.useMemo(() => {
    if (!product) return [] as GroupOrder[];
    return groupOrders.filter(
      (order) =>
        order.status === 'open' &&
        order.products.some((item) => item.id === product.id || item.name === product.name)
    );
  }, [groupOrders, product?.id, product?.name]);

  const isOwner = Boolean(
    product && user && (user.producerId === product.producerId || user.id === product.producerId)
  );

  const inDeck = Boolean(product && deck.some((card) => card.id === product.id));
  const buildLotPath = React.useCallback((target: Product, code: string) => {
    const slug = target.slug ?? slugify(target.name);
    const productCodeValue = target.productCode ?? target.id;
    return `/produits/${slug || 'produit'}-${productCodeValue}/lot/${code}`;
  }, []);

  const handleParticipate = React.useCallback(() => {
    if (!product) return;
    if (!ordersForProduct.length) {
      toast.info('Aucune commande active pour ce produit.');
    }
    onSearchProductOrders?.(product);
    navigate(tabRoutes.home);
  }, [navigate, onSearchProductOrders, ordersForProduct.length, product]);

  const handleToggleSave = React.useCallback(
    (next: boolean) => {
      if (!product) return;
      if (next) {
        onAddToDeck(product);
      } else {
        onRemoveFromDeck(product.id);
      }
    },
    [onAddToDeck, onRemoveFromDeck, product]
  );

  React.useEffect(() => {
    let active = true;
    if (!productCode) {
      setProduct(null);
      setDetail(null);
      setActiveLotCode(null);
      return () => {
        active = false;
      };
    }
    setIsLoading(true);
    const run = async () => {
      const localDetail = !lotCode ? createdProductDetails[productCode] : null;
      const localProduct = !lotCode
        ? products.find((item) => item.productCode === productCode || item.id === productCode) ?? null
        : null;
      if (localDetail && localProduct) {
        setProduct(localProduct);
        setDetail(localDetail);
        setActiveLotCode(null);
        setIsLoading(false);
        return;
      }
      const result = lotCode
        ? await getLotByCode(lotCode)
        : await getProductByCode(productCode);
      if (!active) return;
      if (!result) {
        setProduct(null);
        setDetail(null);
        setActiveLotCode(null);
        setIsLoading(false);
        return;
      }
      setProduct(result.product);
      setDetail(result.detail);
      let nextLotCode: string | null = null;
      if ('activeLotCode' in result) {
        nextLotCode = result.activeLotCode ?? null;
      } else if ('lotCode' in result) {
        nextLotCode = result.lotCode ?? null;
      }
      setActiveLotCode(nextLotCode);
      setIsLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [createdProductDetails, lotCode, productCode, products, useDemoProducts]);

  React.useEffect(() => {
    let active = true;
    if (!orderCode) {
      setOrderContext(null);
      return () => {
        active = false;
      };
    }
    getOrderFullByCode(orderCode)
      .then((data) => {
        if (!active) return;
        setOrderContext(data);
      })
      .catch((error) => {
        console.warn('Order context load error:', error);
        if (!active) return;
        setOrderContext(null);
      });
    return () => {
      active = false;
    };
  }, [orderCode]);

  const orderTimelineStep = React.useMemo(() => {
    const order =
      orderContext?.order ??
      groupOrders.find((entry) => entry.orderCode === orderCode || entry.id === orderCode) ??
      null;
    if (!order || !orderCode) return null;
    const orderData = order as Partial<OrderFull['order']> &
      Partial<GroupOrder> & {
        pickupLat?: number | null;
        pickupLng?: number | null;
        deliveryLat?: number | null;
        deliveryLng?: number | null;
      };
    const pickupCity = orderData.pickupCity ?? '';
    const pickupPostcode = orderData.pickupPostcode ?? '';
    const deliveryCity = orderData.deliveryCity ?? '';
    const deliveryPostcode = orderData.deliveryPostcode ?? '';
    const usesPickup =
      orderData.deliveryOption === 'producer_pickup' || pickupCity || pickupPostcode;
    const city = (usesPickup ? pickupCity : deliveryCity).trim() || undefined;
    const postcode = (usesPickup ? pickupPostcode : deliveryPostcode).trim() || undefined;
    const lat =
      (usesPickup ? orderData.pickupLat : orderData.deliveryLat) ?? orderData.mapLocation?.lat ?? undefined;
    const lng =
      (usesPickup ? orderData.pickupLng : orderData.deliveryLng) ?? orderData.mapLocation?.lng ?? undefined;
    const locationLabel = [postcode, city].filter(Boolean).join(' ');
    const resolvedDate = orderData.estimatedDeliveryDate ?? orderData.pickupDate ?? null;
    const parsedDate = resolvedDate ? new Date(resolvedDate) : null;
    const dateLabel =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString().slice(0, 10)
        : undefined;
    if (!locationLabel && !dateLabel) return null;
    return {
      localId: `order-step-${orderCode}`,
      etape: 'Recuperation de la commande',
      city,
      postcode,
      lat: typeof lat === 'number' ? lat : orderData.mapLocation?.lat,
      lng: typeof lng === 'number' ? lng : orderData.mapLocation?.lng,
      date: dateLabel,
      dateType: dateLabel ? 'date' : undefined,
    } as const;
  }, [groupOrders, orderCode, orderContext?.order]);

  const productShareTimeline = React.useMemo(() => {
    const baseTimeline = detail?.tracabilite?.timeline?.length
      ? detail.tracabilite.timeline
      : detail?.tracabilite?.lotTimeline ?? [];
    if (!orderTimelineStep) return baseTimeline;
    return [...baseTimeline, orderTimelineStep];
  }, [detail?.tracabilite?.lotTimeline, detail?.tracabilite?.timeline, orderTimelineStep]);

  const productSharePath = React.useMemo(() => {
    if (!product) return null;
    const slug = product.slug ?? slugify(product.name);
    const productCodeValue = product.productCode ?? product.id;
    const resolvedLotCode = lotCode ?? activeLotCode ?? product.activeLotCode ?? null;
    const resolvedOrderCode = (orderContext?.order?.orderCode ?? orderCode)?.trim() || null;
    if (resolvedLotCode) {
      const basePath = `/produits/${slug || 'produit'}-${productCodeValue}/lot/${resolvedLotCode}`;
      if (!resolvedOrderCode) return basePath;
      return `${basePath}/cmd/${encodeURIComponent(resolvedOrderCode)}`;
    }
    return `/produits/${slug || 'produit'}-${productCodeValue}`;
  }, [activeLotCode, lotCode, orderCode, orderContext?.order?.orderCode, product]);

  React.useEffect(() => {
    if (!product || lotCode || !activeLotCode) return;
    navigate(buildLotPath(product, activeLotCode), { replace: true });
  }, [activeLotCode, buildLotPath, lotCode, navigate, product]);

  React.useEffect(() => {
    let active = true;
    if (!supabaseClient || !product?.producerId || !isUuid(product.producerId)) {
      setProducerProfileLabels([]);
      return () => {
        active = false;
      };
    }

    supabaseClient
      .from(PRODUCER_LABELS_TABLE)
      .select('*')
      .eq('profile_id', product.producerId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('Producer labels load error:', error);
          setProducerProfileLabels([]);
          return;
        }
        const rows = (data as Array<Record<string, unknown>>) ?? [];
        const mapped = rows
          .map((row) => {
            const labelValue = typeof row.label === 'string' ? row.label.trim() : '';
            if (!labelValue) return null;
            const descriptionValue = row[PRODUCER_LABELS_DESCRIPTION_COLUMN];
            const description =
              typeof descriptionValue === 'string' ? descriptionValue.trim() : undefined;
            const yearValue = row[PRODUCER_LABELS_YEAR_COLUMN];
            const obtentionYear = toNumberOrUndefined(yearValue);
            return { label: labelValue, description, obtentionYear };
          })
          .filter(Boolean) as ProducerLabelDetail[];
        setProducerProfileLabels(mapped);
      });

    return () => {
      active = false;
    };
  }, [product?.producerId, supabaseClient]);

  React.useEffect(() => {
    if (!onShareContextChange) return;
    if (!product || !detail) {
      onShareContextChange(null);
      return;
    }
    onShareContextChange({
      product,
      detail,
      ordersWithProduct: ordersForProduct,
      timelineSteps: productShareTimeline,
      sharePath: productSharePath ?? undefined,
    });
    return () => onShareContextChange(null);
  }, [detail, onShareContextChange, ordersForProduct, product, productSharePath, productShareTimeline]);

  if (isLoading && !product) {
    return <NotFound message="Chargement du produit..." />;
  }

  if (!product || !detail) {
    return <NotFound message="Produit introuvable." />;
  }

  if (!detail.productions?.length && !isOwner) {
    return <NotFound message="Produit non disponible." />;
  }

      return (
      <ProductDetailView
        product={product}
        detail={detail}
        ordersWithProduct={ordersForProduct}
        isOwner={isOwner}
        isSaved={inDeck}
        catalog={products}
        supabaseClient={supabaseClient ?? null}
        producerProfileLabels={producerProfileLabels}
        onHeaderActionsChange={onHeaderActionsChange}
        onOpenProducer={onOpenProducer}
        onOpenRelatedProduct={onOpenRelatedProduct}
      onShare={() =>
        onShareProduct(product, {
          product,
          detail,
          ordersWithProduct: ordersForProduct,
          timelineSteps: productShareTimeline,
          sharePath: productSharePath ?? undefined,
        })
      }
      onCreateOrder={() => onStartOrderFromProduct(product)}
      onParticipate={handleParticipate}
      onToggleSave={canSaveProduct ? handleToggleSave : undefined}
      initialLotId={lotCode ?? activeLotCode ?? undefined}
      timelineExtraSteps={orderTimelineStep ? [orderTimelineStep] : undefined}
    />
  );
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRecoveryAuth = React.useMemo(() => {
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const searchParams = new URLSearchParams(location.search || '');
    return (
      hashParams.get('type') === 'recovery' ||
      searchParams.get('type') === 'recovery' ||
      searchParams.get('reset') === '1'
    );
  }, [location.hash, location.search]);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);
  const supabaseClient = React.useMemo<SupabaseClient | null>(() => {
    try {
      return getSupabaseClient();
    } catch (error) {
      console.warn('Supabase non configure:', error);
      return null;
    }
  }, []);
  const [user, setUser] = React.useState<User | null>(null);
  const [products, setProducts] = React.useState<Product[]>(DEMO_MODE ? mockProducts : []);
  const [createdProductDetails, setCreatedProductDetails] = React.useState<Record<string, ProductDetail>>({});
  const [useDemoProducts, setUseDemoProducts] = React.useState<boolean>(DEMO_MODE);
  const [groupOrders, setGroupOrders] = React.useState<GroupOrder[]>(DEMO_MODE ? mockGroupOrders : []);
  const [userOrders, setUserOrders] = React.useState<GroupOrder[]>(DEMO_MODE ? mockGroupOrders : []);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !supabaseClient) return;
    if (import.meta.env.DEV) {
      (window as any).supabase = supabaseClient;
      (window as any).appUserId = user?.id ?? null;
    }
  }, [supabaseClient, user?.id]);
  React.useEffect(() => {
    if (!DEMO_MODE) return;
    setDemoOrders(groupOrders);
    setUserOrders(groupOrders);
  }, [groupOrders]);
  React.useEffect(() => {
    if (DEMO_MODE || !supabaseClient) return;
    let active = true;
    const loadOrders = async () => {
      try {
        const [publicOrders, userOrdersResult] = await Promise.all([
          listPublicOrders(),
          user?.id ? listOrdersForUser(user.id) : Promise.resolve([]),
        ]);
        if (!active) return;
        const merged = new Map<string, GroupOrder>();
        [...publicOrders, ...userOrdersResult].forEach((order) => {
          merged.set(order.id, order);
        });
        setGroupOrders(Array.from(merged.values()));
        setUserOrders(userOrdersResult);
      } catch (error) {
        console.warn('Orders load error:', error);
      }
    };
    loadOrders();
    return () => {
      active = false;
    };
  }, [supabaseClient, user?.id]);
  const [deck, setDeck] = React.useState<DeckCard[]>([]);
  const [orderBuilderProducts, setOrderBuilderProducts] = React.useState<DeckCard[] | null>(null);
  const [orderBuilderSelection, setOrderBuilderSelection] = React.useState<string[] | null>(null);
  const [purchaseDraft, setPurchaseDraft] = React.useState<OrderPurchaseDraft | null>(null);
  const [recentPurchase, setRecentPurchase] = React.useState<OrderPurchaseDraft | null>(null);
  const [productHeaderActions, setProductHeaderActions] = React.useState<React.ReactNode | null>(null);
  const [productShareContext, setProductShareContext] = React.useState<ProductShareContext | null>(null);
  const [shareOverlay, setShareOverlay] = React.useState<{
    open: boolean;
    kind: ShareOverlayKind;
    link: string;
    title: string;
    subtitle?: string;
    description?: string;
    details?: ShareOverlayDetail[];
    orderData?: { order: GroupOrder };
    productData?: ProductShareContext;
    profileData?: { profile: User };
  }>({ open: false, kind: 'generic', link: '', title: '' });
  const [profileForShare, setProfileForShare] = React.useState<User | null>(null);
  const [guestLocation, setGuestLocation] = React.useState<GeoPoint | null>(null);
  const [guestLocationStatus, setGuestLocationStatus] = React.useState<
    'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error'
  >('idle');
  React.useEffect(() => {
    let active = true;
    listProducts()
      .then(({ products: nextProducts, isDemo }) => {
        if (!active) return;
        setProducts(nextProducts);
        setUseDemoProducts(isDemo);
      })
      .catch((error) => {
        console.warn('Products listing error:', error);
        if (!active) return;
        setProducts(DEMO_MODE ? mockProducts : []);
        setUseDemoProducts(DEMO_MODE);
      });
    return () => {
      active = false;
    };
  }, []);
  const requestGuestLocation = React.useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!navigator.geolocation) {
      setGuestLocationStatus('unsupported');
      return;
    }
    setGuestLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGuestLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGuestLocationStatus('granted');
      },
      (error) => {
        if (error.code === 1) {
          setGuestLocationStatus('denied');
          return;
        }
        setGuestLocationStatus('error');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);
  const updateScrollbarCompensation = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const width = Math.max(0, window.innerWidth - root.clientWidth);
    root.style.setProperty('--scrollbar-compensation', `${width}px`);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;
    let frameId = 0;

    const scheduleUpdate = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        updateScrollbarCompensation();
      });
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(root);
    resizeObserver.observe(body);

    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
      resizeObserver.disconnect();
    };
  }, [updateScrollbarCompensation]);

  React.useEffect(() => {
    const frameId = requestAnimationFrame(updateScrollbarCompensation);
    return () => cancelAnimationFrame(frameId);
  }, [location.pathname, updateScrollbarCompensation]);

  React.useEffect(() => {
    if (location.pathname.startsWith('/produits/') || location.pathname.startsWith('/produit/')) return;
    setProductShareContext(null);
  }, [location.pathname]);

  const getAbsoluteLink = React.useCallback((path: string) => {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, []);
  const getProductPath = React.useCallback((product: Product, lotCodeOverride?: string | null) => {
    const code = product.productCode ?? product.id;
    const slug = product.slug ?? slugify(product.name);
    const lotSegment = lotCodeOverride || product.activeLotCode;
    if (lotSegment) {
      return `/produits/${slug || 'produit'}-${code}/lot/${lotSegment}`;
    }
    return `/produits/${slug || 'produit'}-${code}`;
  }, []);
  const buildProductSharePayload = React.useCallback(
    (product: Product, context?: ProductShareContext | null): ShareOverlayPayload => {
      const hasPrice = Boolean(product.activeLotCode) && product.price > 0;
      const priceLabel = hasPrice ? formatEurosFromCents(eurosToCents(product.price)) : 'Prix a venir';
      const unitLabel = hasPrice ? ` / ${product.unit}` : '';
      const safeContext: ProductShareContext = {
        product,
        detail: context?.detail ?? null,
        ordersWithProduct: context?.ordersWithProduct ?? [],
        timelineSteps: context?.timelineSteps ?? [],
        sharePath: context?.sharePath ?? undefined,
      };
      return {
        kind: 'product',
        link: getAbsoluteLink(context?.sharePath || getProductPath(product)),
        title: product.name,
        subtitle: `${product.producerName} - ${priceLabel}${unitLabel}`,
        description:
          'Scannez pour decouvrir tous les details du produit, son lieu de production et la repartition de la valeur.',
        details: [
          { label: 'Origine', value: product.producerLocation || 'Origine locale' },
          { label: 'Categorie', value: product.category },
          { label: 'Disponibilite', value: product.inStock ? 'Disponible' : 'Bientot disponible' },
        ],
        productData: safeContext,
      };
    },
    [getAbsoluteLink, getProductPath]
  );
  const buildOrderSharePayload = React.useCallback(
    (order: GroupOrder): ShareOverlayPayload => {
      const deadlineDate = order.deadline instanceof Date ? order.deadline : new Date(order.deadline);
      const pickup =
        order.pickupAddress ||
        [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
        'Lieu precis communique apres paiement';
      const productNames = order.products.slice(0, 3).map((p) => p.name).join(' | ');
      const suffix = order.products.length > 3 ? ' ...' : '';
      const lineup = productNames ? `${productNames}${suffix}` : `${order.products.length} produits`;
      return {
        kind: 'order',
        link: getAbsoluteLink(`/cmd/${order.orderCode ?? order.id}`),
        title: `Commande groupee : ${order.title}`,
        subtitle: `Par ${order.sharerName} - ${order.products.length} produit${order.products.length > 1 ? 's' : ''}`,
        description: `Partagez cette commande groupee et invitez vos voisins a y participer. Scannez pour voir les produits (${lineup}) et les modalites de retrait.`,
        details: [
          { label: 'Organise par', value: order.sharerName },
          { label: 'Cloture', value: deadlineDate.toLocaleDateString('fr-FR') },
          { label: 'Retrait', value: pickup || 'Lieu partage apres paiement' },
        ],
        orderData: { order },
      };
    },
    [getAbsoluteLink]
  );
  const buildProfileSharePayload = React.useCallback(
    (profile: User): ShareOverlayPayload => {
      const profileHandle = profile.handle ?? profile.name.toLowerCase().replace(/\s+/g, '');
      const zoneLabel = [profile.city, profile.postcode].filter(Boolean).join(' ') || profile.address || 'Zone locale';
      const profileTagline = profile.tagline ?? '';
      const subtitle = [profileTagline, zoneLabel].filter(Boolean).join(' - ') || zoneLabel;
      const profileRoleLabel =
        profile.role === 'producer' ? 'Producteur' : profile.role === 'sharer' ? 'Partageur' : 'Participant';
      return {
        kind: 'profile',
        link: getAbsoluteLink(`/profil/${profileHandle}`),
        title: `Profil de ${profile.name}`,
        subtitle,
        description:
          profile.role === 'producer'
            ? 'Scannez pour decouvrir ce producteur, ses produits, son lieu de production et suivre ses nouveautes.'
            : profile.role === 'sharer'
              ? 'Scannez pour rejoindre ses prochaines commandes partagees et suivre les annonces du quartier.'
              : 'Scannez pour suivre ce profil et rester informe des nouvelles commandes et productions.',
        details: [
          { label: 'Role', value: profileRoleLabel },
          { label: 'Zone', value: zoneLabel },
          {
            label: 'Contact',
            value: profile.website || profile.contactEmailPublic || profile.phonePublic || 'Disponible sur Partage',
          },
        ],
        profileData: { profile },
      };
    },
    [getAbsoluteLink]
  );
  const openShareOverlay = React.useCallback((payload: ShareOverlayPayload) => {
    setShareOverlay({ open: true, ...payload });
  }, []);
  const openProductShare = React.useCallback(
    (product: Product, context?: ProductShareContext) => {
      openShareOverlay(buildProductSharePayload(product, context ?? null));
    },
    [buildProductSharePayload, openShareOverlay]
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [postcodeOverlayOpen, setPostcodeOverlayOpen] = React.useState(false);
  const [postcodeOverlayError, setPostcodeOverlayError] = React.useState<string | null>(null);
  const [postcodeSearch, setPostcodeSearch] = React.useState<PostcodeSearchState>({
    postcode: '',
    status: 'idle',
  });
  const [centerLocation, setCenterLocation] = React.useState<PostcodeSearchState>({
    postcode: '',
    status: 'idle',
  });
  const [guestStoredPostcode, setGuestStoredPostcode] = React.useState('');
  const [producerGeoById, setProducerGeoById] = React.useState<Record<string, ProducerGeoRecord>>({});
  const postcodeCoordsCacheRef = React.useRef<Map<string, GeoPoint>>(new Map());
  const [profileSearchResults, setProfileSearchResults] = React.useState<ProfileSearchResult[]>([]);
  const activeTab = React.useMemo(() => getTabFromPath(location.pathname), [location.pathname]);
  const isAuthPage = location.pathname.startsWith('/connexion');
  const isOrderCreation = location.pathname.startsWith('/commande/nouvelle');
  const isAddProductView = location.pathname === '/produit/nouveau';
  const isPostcodeOverlayAllowedRoute = POSTCODE_OVERLAY_ALLOWED_PATHS.has(location.pathname);
  const isProfileSearchTab = activeTab === 'profile' || activeTab === 'messages';
  const readPostcodeCoordsCache = React.useCallback((postcode: string) => {
    return postcodeCoordsCacheRef.current.get(postcode);
  }, []);
  const writePostcodeCoordsCache = React.useCallback((postcode: string, coords: GeoPoint) => {
    const cache = postcodeCoordsCacheRef.current;
    cache.set(postcode, coords);
    if (cache.size > 60) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    if (typeof window === 'undefined') return;
    try {
      const payload = Object.fromEntries(cache.entries());
      window.localStorage.setItem(POSTCODE_COORDS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, []);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(POSTCODE_COORDS_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Record<string, GeoPoint>;
      Object.entries(parsed).forEach(([postcode, coords]) => {
        if (!POSTCODE_REGEX.test(postcode)) return;
        if (!Number.isFinite(coords?.lat) || !Number.isFinite(coords?.lng)) return;
        postcodeCoordsCacheRef.current.set(postcode, { lat: Number(coords.lat), lng: Number(coords.lng) });
      });
    } catch {
      // ignore cache parse errors
    }
  }, []);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedPostcode = normalizePostcode(window.localStorage.getItem(POSTCODE_STORAGE_KEY));
    const nextPostcode = POSTCODE_REGEX.test(storedPostcode) ? storedPostcode : '';
    setGuestStoredPostcode(nextPostcode);

    if (isAuthPage || isRecoveryAuth || user || !isPostcodeOverlayAllowedRoute) {
      setPostcodeOverlayOpen(false);
      setPostcodeOverlayError(null);
      return;
    }

    if (nextPostcode) {
      setPostcodeOverlayOpen(false);
      return;
    }

    const dismissed = window.sessionStorage.getItem(POSTCODE_OVERLAY_DISMISSED_SESSION_KEY) === '1';
    setPostcodeOverlayOpen(!dismissed);
  }, [isAuthPage, isRecoveryAuth, isPostcodeOverlayAllowedRoute, user]);
  React.useEffect(() => {
    if (isAuthPage || isRecoveryAuth || user || !isPostcodeOverlayAllowedRoute) {
      setPostcodeOverlayOpen(false);
      setPostcodeOverlayError(null);
    }
  }, [isAuthPage, isRecoveryAuth, isPostcodeOverlayAllowedRoute, user]);
  const handlePostcodeOverlayClose = React.useCallback(() => {
    setPostcodeOverlayOpen(false);
    setPostcodeOverlayError(null);
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(POSTCODE_OVERLAY_DISMISSED_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, []);
  const handlePostcodeOverlaySubmit = React.useCallback(
    (postcode: string) => {
      const normalized = normalizePostcode(postcode);
      if (!POSTCODE_REGEX.test(normalized)) {
        setPostcodeOverlayError('Veuillez saisir un code postal valide (5 chiffres).');
        return;
      }
      setPostcodeOverlayError(null);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(POSTCODE_STORAGE_KEY, normalized);
          window.sessionStorage.removeItem(POSTCODE_OVERLAY_DISMISSED_SESSION_KEY);
        } catch {
          // ignore storage errors
        }
      }
      setGuestStoredPostcode(normalized);
      setPostcodeOverlayOpen(false);
      navigate(tabRoutes.home);
    },
    [navigate]
  );
  const [filterScope, setFilterScope] = React.useState<SearchScope>('combined');
  const [filterCategories, setFilterCategories] = React.useState<string[]>([]);
  const [filterProducerTags, setFilterProducerTags] = React.useState<string[]>([]);
  const [filterAttributes, setFilterAttributes] = React.useState<string[]>([]);
  const [postcodeRadiusKm, setPostcodeRadiusKm] = React.useState(POSTCODE_RADIUS_DEFAULT_KM);
  const [profileRoleFilters, setProfileRoleFilters] = React.useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    DEMO_MODE ? mockNotifications : []
  );
  const [profileMode, setProfileMode] = React.useState<'view' | 'edit'>('view');
  const profileSaveHandlerRef = React.useRef<(() => void) | null>(null);
  const [canSaveProfile, setCanSaveProfile] = React.useState(false);
  const registerProfileSaveHandler = React.useCallback((handler: (() => void) | null) => {
    profileSaveHandlerRef.current = handler;
    setCanSaveProfile(Boolean(handler));
  }, []);
  const [followingProfiles, setFollowingProfiles] = React.useState<Record<string, boolean>>({});
  const prevRoleRef = React.useRef<User['role'] | null>(null);
  const lastTabRef = React.useRef<string | null>(null);
  const orderBuilderSourceRef = React.useRef<string | null>(null);
  const wasNotificationsOpenRef = React.useRef(false);
  const mapDbNotification = React.useCallback((row: DbNotificationRow): NotificationItem => {
    const data = (row.data as Record<string, unknown> | null) ?? null;
    const orderCode =
      typeof data?.order_code === 'string' && data.order_code.trim() ? data.order_code : null;
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      time: formatRelativeTime(row.created_at),
      unread: !row.read_at,
      orderId: row.order_id ?? null,
      orderCode,
    };
  }, []);
  const notificationsUnreadCount = React.useMemo(
    () => notifications.filter((item) => item.unread).length,
    [notifications]
  );
  const handleNotificationClick = React.useCallback(
    (notification: NotificationItem) => {
      const directCode = notification.orderCode;
      if (directCode) {
        navigate(`/cmd/${directCode}`);
        setNotificationsOpen(false);
        return;
      }
      if (!notification.orderId || !supabaseClient) return;
      supabaseClient
        .from('orders')
        .select('order_code')
        .eq('id', notification.orderId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.warn('Order code fetch error:', error);
            return;
          }
          const orderCode = data?.order_code;
          if (!orderCode) return;
          navigate(`/cmd/${orderCode}`);
          setNotificationsOpen(false);
        });
    },
    [navigate, supabaseClient]
  );

  React.useEffect(() => {
    if (DEMO_MODE) {
      setNotifications(mockNotifications);
      return;
    }
    if (!supabaseClient || !user?.id) {
      setNotifications([]);
      return;
    }
    let active = true;
    const loadNotifications = async () => {
      const { data, error } = await supabaseClient
        .from('notifications')
        .select('id, title, message, created_at, read_at, order_id, data')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!active) return;
      if (error) {
        console.warn('Notifications load error:', error);
        setNotifications([]);
        return;
      }
      const rows = (data as DbNotificationRow[]) ?? [];
      setNotifications(rows.map(mapDbNotification));
    };
    loadNotifications();
    return () => {
      active = false;
    };
  }, [mapDbNotification, supabaseClient, user?.id]);

  React.useEffect(() => {
    if (DEMO_MODE || !supabaseClient || !user?.id) return;
    const channel = supabaseClient
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as DbNotificationRow;
          const mapped = mapDbNotification(row);
          setNotifications((prev) => {
            if (prev.some((item) => item.id === mapped.id)) return prev;
            return [mapped, ...prev].slice(0, 50);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as DbNotificationRow;
          setNotifications((prev) =>
            prev.map((item) => (item.id === row.id ? mapDbNotification(row) : item))
          );
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [mapDbNotification, supabaseClient, user?.id]);

  React.useEffect(() => {
    const wasOpen = wasNotificationsOpenRef.current;
    wasNotificationsOpenRef.current = notificationsOpen;
    if (!wasOpen || notificationsOpen) return;
    if (DEMO_MODE || !supabaseClient || !user?.id) return;
    const unreadIds = notifications.filter((item) => item.unread).map((item) => item.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    supabaseClient
      .from('notifications')
      .update({ read_at: readAt })
      .in('id', unreadIds)
      .eq('profile_id', user.id)
      .then(({ error }) => {
        if (error) console.warn('Notifications read error:', error);
      });
    setNotifications((prev) =>
      prev.map((item) => (unreadIds.includes(item.id) ? { ...item, unread: false } : item))
    );
  }, [notifications, notificationsOpen, supabaseClient, user?.id]);

  const orderCodeFromPath = React.useMemo(() => {
    const match = location.pathname.match(/^\/cmd\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);
  const productCodeFromPath = React.useMemo(() => {
    const match = location.pathname.match(/^\/produits\/([^/]+)/);
    if (match) {
      return parseSlugAndCode(match[1]).productCode;
    }
    const legacyMatch = location.pathname.match(/^\/produit\/([^/]+)/);
    return legacyMatch ? legacyMatch[1] : null;
  }, [location.pathname]);

  const fetchLegalEntity = React.useCallback(
    async (
      profileId: string,
      options?: { preferPrivate?: boolean }
    ): Promise<LegalEntityRow | null> => {
      if (!supabaseClient) return null;
      const fetchFrom = async (table: 'legal_entities' | 'legal_entities_public') => {
        const { data, error } = await supabaseClient
          .from(table)
          .select('*')
          .eq('profile_id', profileId)
          .maybeSingle();
        if (error) {
          console.warn('legal_entities fetch error', error);
          return null;
        }
        return (data as LegalEntityRow | null) ?? null;
      };

      if (options?.preferPrivate) {
        const privateRow = await fetchFrom('legal_entities');
        if (privateRow) return privateRow;
      }
      return fetchFrom('legal_entities_public');
    },
    [supabaseClient]
  );

  const ensureProfile = React.useCallback(
    async (authUser: SupabaseAuthUser): Promise<User> => {
      if (!supabaseClient) {
        return mapSupabaseUserToProfile(authUser);
      }

      const fetchExisting = async () => {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        if (error) {
          console.warn('profiles fetch error', error);
          return null;
        }
        return data as ProfileRow | null;
      };

      const existing = await fetchExisting();
      if (existing) {
        const legal = await fetchLegalEntity(existing.id, { preferPrivate: true });
        return mapProfileRowToUser(existing, authUser, legal);
      }

      const baseHandle = sanitizeHandle(authUser.user_metadata?.handle || authUser.email || authUser.id);
      let attempt = 0;
      let handle = baseHandle;
      while (attempt < 3) {
        const { data, error } = await supabaseClient
          .from('profiles')
            .insert({
              id: authUser.id,
              handle,
              name: authUser.user_metadata?.full_name || authUser.email || handle,
              role: authUser.user_metadata?.role || 'sharer',
              profile_visibility: 'public',
              address_visibility: 'private',
              producer_id: authUser.user_metadata?.producerId,
              profile_image: authUser.user_metadata?.avatar_url,
              phone: authUser.user_metadata?.phone,
              address: authUser.user_metadata?.address,
              address_details: authUser.user_metadata?.address_details ?? authUser.user_metadata?.addressDetails,
              city: authUser.user_metadata?.city,
              postcode: authUser.user_metadata?.postcode,
              account_type: authUser.user_metadata?.account_type || 'individual',
            })
          .select()
          .maybeSingle();

        if (!error && data) {
          const legal = await fetchLegalEntity(authUser.id, { preferPrivate: true });
          return mapProfileRowToUser(data as ProfileRow, authUser, legal);
        }
        if (error && (error as any).code === '23505') {
          attempt += 1;
          handle = `${baseHandle}${Math.floor(Math.random() * 1000)}`;
          continue;
        }
        console.warn('profiles insert error', error);
        break;
      }

      // Fallback to metadata mapping if insertion failed
      return mapSupabaseUserToProfile(authUser);
    },
    [fetchLegalEntity, supabaseClient]
  );

  const fetchProfileByHandle = React.useCallback(
    async (handle: string): Promise<User | null> => {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('handle', handle.toLowerCase())
        .maybeSingle();
      if (error) {
        console.warn('profiles fetch by handle error', error);
        return null;
      }
      if (!data) return null;
      const profileId = (data as ProfileRow).id;
      const legal = await fetchLegalEntity(profileId, { preferPrivate: user?.id === profileId });
      return mapProfileRowToUser(data as ProfileRow, null, legal);
    },
    [fetchLegalEntity, supabaseClient, user?.id]
  );

  const fetchProfileById = React.useCallback(
    async (profileId: string): Promise<User | null> => {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();
      if (error) {
        console.warn('profiles fetch by id error', error);
        return null;
      }
      if (!data) return null;
      const legal = await fetchLegalEntity(profileId, { preferPrivate: user?.id === profileId });
      return mapProfileRowToUser(data as ProfileRow, null, legal);
    },
    [fetchLegalEntity, supabaseClient, user?.id]
  );

  React.useEffect(() => {
    if (!supabaseClient) {
      return;
    }

    supabaseClient.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          ensureProfile(data.session.user)
            .then((profile) => {
              setUser(profile);
              prevRoleRef.current = profile.role;
            })
            .catch(() => {
              setUser(mapSupabaseUserToProfile(data.session!.user));
              prevRoleRef.current = (data.session!.user.user_metadata?.role as User['role']) ?? null;
            });
        }
      })
      .catch(() => null);

    const { data: listener } = supabaseClient.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        ensureProfile(session.user)
          .then((profile) => {
            setUser(profile);
            prevRoleRef.current = profile.role;
          })
          .catch(() => {
            setUser(mapSupabaseUserToProfile(session.user));
            prevRoleRef.current = (session.user.user_metadata?.role as User['role']) ?? null;
          });
      } else {
        setUser(null);
        setDeck([]);
        prevRoleRef.current = null;
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, [ensureProfile, supabaseClient]);

  const viewer = user ?? mockUser;
  const isAuthenticated = Boolean(user);
  const isProfileAuthPage = !isAuthenticated && location.pathname === '/profil';
  const isAuthLayout = isAuthPage || isProfileAuthPage;
  const orderBuilderSource = orderBuilderProducts ?? deck;
  const [orderProducer, setOrderProducer] = React.useState<User | null>(null);

  React.useEffect(() => {
    const sourceProducts = orderBuilderProducts ?? deck;
    const firstProducerId = sourceProducts[0]?.producerId;
    if (!firstProducerId) {
      setOrderProducer(null);
      return;
    }
    const matchesProducerId = (profile: User | null) =>
      Boolean(profile && (profile.id === firstProducerId || profile.producerId === firstProducerId));

    if (matchesProducerId(profileForShare)) {
      setOrderProducer(profileForShare);
      return;
    }
    if (matchesProducerId(user)) {
      setOrderProducer(user);
      return;
    }
    if (!isUuid(firstProducerId)) {
      setOrderProducer(null);
      return;
    }

    let active = true;
    fetchProfileById(firstProducerId).then((profile) => {
      if (!active) return;
      setOrderProducer(profile);
    });

    return () => {
      active = false;
    };
  }, [deck, fetchProfileById, orderBuilderProducts, profileForShare, user]);

  const producerProfileIds = React.useMemo(() => {
    const ids = new Set<string>();
    products.forEach((product) => {
      if (isUuid(product.producerId)) ids.add(product.producerId);
    });
    return Array.from(ids);
  }, [products]);
  React.useEffect(() => {
    let active = true;
    if (!supabaseClient || !producerProfileIds.length) {
      setProducerGeoById({});
      return () => {
        active = false;
      };
    }

    supabaseClient
      .from('profiles')
      .select('id, postcode, city, address_lat, address_lng')
      .in('id', producerProfileIds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('producer location fetch error', error);
          setProducerGeoById({});
          return;
        }
        const mapped: Record<string, ProducerGeoRecord> = {};
        (data as Array<Record<string, unknown>> | null)?.forEach((row) => {
          const id = typeof row.id === 'string' ? row.id : '';
          if (!id) return;
          const postcode = normalizePostcode(typeof row.postcode === 'string' ? row.postcode : '');
          const city = typeof row.city === 'string' ? row.city : undefined;
          const lat = toNumberOrUndefined(row.address_lat);
          const lng = toNumberOrUndefined(row.address_lng);
          mapped[id] = {
            postcode: POSTCODE_REGEX.test(postcode) ? postcode : undefined,
            city,
            coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat: Number(lat), lng: Number(lng) } : undefined,
          };
        });
        setProducerGeoById(mapped);
      });

    return () => {
      active = false;
    };
  }, [producerProfileIds, supabaseClient]);

  const searchParts = React.useMemo(() => parseSearchQueryParts(searchQuery), [searchQuery]);
  const searchPostcode = searchParts.postcode;
  const isPostcodeSearch = Boolean(searchPostcode);
  const trimmedSearchQuery = searchParts.text;
  const normalizedSearch = normalizeText(trimmedSearchQuery);
  const applyTextSearch = Boolean(normalizedSearch);

  React.useEffect(() => {
    if (!isPostcodeSearch || !searchPostcode) {
      setPostcodeSearch((prev) =>
        prev.status === 'idle' && !prev.postcode
          ? prev
          : {
              postcode: '',
              status: 'idle',
            }
      );
      return;
    }

    if (!user && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(POSTCODE_STORAGE_KEY, searchPostcode);
        setGuestStoredPostcode(searchPostcode);
      } catch {
        // ignore storage errors
      }
    }

    const cached = readPostcodeCoordsCache(searchPostcode);
    if (cached) {
      setPostcodeSearch({
        postcode: searchPostcode,
        status: 'resolved',
        coords: cached,
      });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setPostcodeSearch({
      postcode: searchPostcode,
      status: 'loading',
    });
    const timeoutId = setTimeout(() => {
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(searchPostcode)}&limit=1`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error('postcode geocode failed');
          return response.json() as Promise<{
            features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
          }>;
        })
        .then((payload) => {
          if (!active) return;
          const coords = payload.features?.[0]?.geometry?.coordinates;
          const lng = Number(coords?.[0]);
          const lat = Number(coords?.[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const resolved = { lat, lng };
            setPostcodeSearch({
              postcode: searchPostcode,
              status: 'resolved',
              coords: resolved,
            });
            writePostcodeCoordsCache(searchPostcode, resolved);
            return;
          }
          setPostcodeSearch({
            postcode: searchPostcode,
            status: 'failed',
          });
        })
        .catch(() => {
          if (!active) return;
          setPostcodeSearch({
            postcode: searchPostcode,
            status: 'failed',
          });
        });
    }, POSTCODE_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isPostcodeSearch, readPostcodeCoordsCache, searchPostcode, user, writePostcodeCoordsCache]);

  const centerPostcode = React.useMemo(() => {
    if (user) {
      const fromUser = normalizePostcode(user.postcode);
      return POSTCODE_REGEX.test(fromUser) ? fromUser : '';
    }
    return guestStoredPostcode;
  }, [guestStoredPostcode, user]);

  React.useEffect(() => {
    if (!centerPostcode) {
      setCenterLocation((prev) =>
        prev.status === 'idle' && !prev.postcode
          ? prev
          : {
              postcode: '',
              status: 'idle',
            }
      );
      return;
    }

    if (
      user &&
      Number.isFinite(user.addressLat ?? NaN) &&
      Number.isFinite(user.addressLng ?? NaN)
    ) {
      setCenterLocation({
        postcode: centerPostcode,
        status: 'resolved',
        coords: { lat: Number(user.addressLat), lng: Number(user.addressLng) },
      });
      return;
    }

    const cached = readPostcodeCoordsCache(centerPostcode);
    if (cached) {
      setCenterLocation({
        postcode: centerPostcode,
        status: 'resolved',
        coords: cached,
      });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setCenterLocation({
      postcode: centerPostcode,
      status: 'loading',
    });

    const timeoutId = setTimeout(() => {
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(centerPostcode)}&limit=1`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error('center geocode failed');
          return response.json() as Promise<{
            features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
          }>;
        })
        .then((payload) => {
          if (!active) return;
          const coords = payload.features?.[0]?.geometry?.coordinates;
          const lng = Number(coords?.[0]);
          const lat = Number(coords?.[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const resolved = { lat, lng };
            setCenterLocation({
              postcode: centerPostcode,
              status: 'resolved',
              coords: resolved,
            });
            writePostcodeCoordsCache(centerPostcode, resolved);
            return;
          }
          setCenterLocation({
            postcode: centerPostcode,
            status: 'failed',
          });
        })
        .catch(() => {
          if (!active) return;
          setCenterLocation({
            postcode: centerPostcode,
            status: 'failed',
          });
        });
    }, POSTCODE_GEOCODE_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [centerPostcode, readPostcodeCoordsCache, user, writePostcodeCoordsCache]);

  const applyProductFilters = filterScope !== 'producers';
  const applyProducerFilters = filterScope !== 'products';
  const toggleFilterValue = React.useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
      setter((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
    },
    []
  );
  const handleToggleCategory = React.useCallback(
    (id: string) => toggleFilterValue(setFilterCategories, id),
    [toggleFilterValue]
  );
  const handleToggleProducerTag = React.useCallback(
    (id: string) => toggleFilterValue(setFilterProducerTags, id),
    [toggleFilterValue]
  );
  const handleToggleAttribute = React.useCallback(
    (id: string) => toggleFilterValue(setFilterAttributes, id),
    [toggleFilterValue]
  );
  const handleToggleProfileRole = React.useCallback(
    (id: string) => toggleFilterValue(setProfileRoleFilters, id),
    [toggleFilterValue]
  );
  const matchesSearch = React.useCallback(
    (product: Product) => {
      if (!applyTextSearch) return true;
      const haystack = normalizeText(`${product.name} ${product.description} ${product.producerName}`);
      return haystack.includes(normalizedSearch);
    },
    [applyTextSearch, normalizedSearch]
  );

  const productSearchSuggestions = React.useMemo<SearchSuggestion[]>(() => {
    if (!applyTextSearch) return [];

    const producerMap = new Map<
      string,
      { id: string; name: string; location?: string; count: number }
    >();

    products.forEach((product) => {
      const existing = producerMap.get(product.producerId);
      if (existing) {
        existing.count += 1;
        return;
      }
      producerMap.set(product.producerId, {
        id: product.producerId,
        name: product.producerName,
        location: product.producerLocation,
        count: 1,
      });
    });

    const producerMatches = Array.from(producerMap.values())
      .filter((producer) => normalizeText(producer.name).includes(normalizedSearch))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 4)
      .map((producer) => ({
        id: producer.id,
        type: 'producer' as const,
        label: producer.name,
        subtitle: producer.location
          ? `${producer.location} - ${producer.count} produits`
          : `${producer.count} produits`,
      }));

    const productMatches = products
      .filter(matchesSearch)
      .slice(0, 6)
      .map((product) => ({
        id: product.productCode ?? product.id,
        type: 'product' as const,
        label: product.name,
        subtitle: product.producerName,
      }));

    return [...producerMatches, ...productMatches];
  }, [applyTextSearch, matchesSearch, normalizedSearch, products]);

  const centerCoords =
    centerLocation.status === 'resolved' &&
    Number.isFinite(centerLocation.coords?.lat ?? NaN) &&
    Number.isFinite(centerLocation.coords?.lng ?? NaN)
      ? centerLocation.coords
      : null;
  const producerDistanceMetersById = React.useMemo(() => {
    if (!centerCoords) return {};
    const mapped: Record<string, number> = {};
    Object.entries(producerGeoById).forEach(([producerId, geo]) => {
      if (!geo.coords) return;
      mapped[producerId] = distanceMeters(centerCoords, geo.coords);
    });
    return mapped;
  }, [centerCoords, producerGeoById]);
  const getOrderDistanceMeters = React.useCallback(
    (order: GroupOrder) => {
      if (!centerCoords || !order.mapLocation) return Number.POSITIVE_INFINITY;
      return distanceMeters(centerCoords, order.mapLocation);
    },
    [centerCoords]
  );
  const postcodeRadiusMeters = postcodeRadiusKm * 1000;

  const matchesProducerPostcode = React.useCallback(
    (product: Product) => {
      if (!isPostcodeSearch || !searchPostcode) return true;
      const producerGeo = producerGeoById[product.producerId];
      const producerPostcode =
        producerGeo?.postcode ??
        extractPostcode(product.producerLocation) ??
        extractPostcode(producerGeo?.city) ??
        null;
      const shouldUseDistance =
        postcodeSearch.status === 'resolved' &&
        postcodeSearch.postcode === searchPostcode &&
        Number.isFinite(postcodeSearch.coords?.lat ?? NaN) &&
        Number.isFinite(postcodeSearch.coords?.lng ?? NaN);
      if (shouldUseDistance && postcodeSearch.coords && producerGeo?.coords) {
        return distanceMeters(postcodeSearch.coords, producerGeo.coords) <= postcodeRadiusMeters;
      }
      return producerPostcode === searchPostcode;
    },
    [isPostcodeSearch, postcodeRadiusMeters, postcodeSearch, producerGeoById, searchPostcode]
  );

  const matchesOrderPostcode = React.useCallback(
    (order: GroupOrder) => {
      if (!isPostcodeSearch || !searchPostcode) return true;
      const shouldUseDistance =
        postcodeSearch.status === 'resolved' &&
        postcodeSearch.postcode === searchPostcode &&
        Number.isFinite(postcodeSearch.coords?.lat ?? NaN) &&
        Number.isFinite(postcodeSearch.coords?.lng ?? NaN);
      if (shouldUseDistance && postcodeSearch.coords && order.mapLocation) {
        return distanceMeters(postcodeSearch.coords, order.mapLocation) <= postcodeRadiusMeters;
      }
      const fallbackPostcodes = [
        order.pickupPostcode,
        extractPostcode(order.pickupAddress),
        extractPostcode(order.mapLocation?.areaLabel),
      ]
        .map((value) => normalizePostcode(value))
        .filter(Boolean);
      return fallbackPostcodes.includes(searchPostcode);
    },
    [isPostcodeSearch, postcodeRadiusMeters, postcodeSearch, searchPostcode]
  );

  const matchesProductFilters = React.useCallback(
    (product: Product) => {
      if (applyProductFilters) {
        const categorySlug = slugify(product.category);
        if (
          filterCategories.length &&
          !filterCategories.some((category) => categorySlug.includes(category))
        ) {
          return false;
        }

        const productAttrs = getProductAttributes(product);
        if (filterAttributes.length && !filterAttributes.every((attr) => productAttrs.has(attr))) {
          return false;
        }
      }

      if (applyProducerFilters && filterProducerTags.length) {
        const tags = producerTagsMap[product.producerId] ?? ['local'];
        if (!filterProducerTags.every((tag) => tags.includes(tag))) return false;
      }

      return true;
    },
    [applyProductFilters, applyProducerFilters, filterAttributes, filterCategories, filterProducerTags]
  );

  const filteredProducts = React.useMemo(() => {
    let results = products;
    if (applyTextSearch) {
      results = results.filter(matchesSearch);
    }
    if (isPostcodeSearch) {
      results = results.filter(matchesProducerPostcode);
    }
    if (centerCoords) {
      results = results
        .slice()
        .sort((a, b) => {
          const aDistance = producerDistanceMetersById[a.producerId] ?? Number.POSITIVE_INFINITY;
          const bDistance = producerDistanceMetersById[b.producerId] ?? Number.POSITIVE_INFINITY;
          if (aDistance !== bDistance) return aDistance - bDistance;
          return a.name.localeCompare(b.name);
        });
    }
    return results;
  }, [
    applyTextSearch,
    centerCoords,
    isPostcodeSearch,
    matchesProducerPostcode,
    matchesSearch,
    producerDistanceMetersById,
    products,
  ]);

  const filteredProductsWithFilters = React.useMemo(
    () => filteredProducts.filter(matchesProductFilters),
    [filteredProducts, matchesProductFilters]
  );

  const filteredMapOrders = React.useMemo(() => {
    let results: GroupOrder[] = groupOrders;

    if (applyTextSearch) {
      results = groupOrders
        .map((order) => {
          const matchingProducts = order.products.filter(matchesSearch);
          if (!matchingProducts.length) return null;
          return { ...order, products: matchingProducts };
        })
        .filter((order): order is GroupOrder => Boolean(order));
    }

    if (isPostcodeSearch) {
      results = results.filter(matchesOrderPostcode);
    }

    if (centerCoords) {
      results = results
        .slice()
        .sort((a, b) => {
          const aDistance = getOrderDistanceMeters(a);
          const bDistance = getOrderDistanceMeters(b);
          if (aDistance !== bDistance) return aDistance - bDistance;
          return a.title.localeCompare(b.title);
        });
    }

    return results;
  }, [
    applyTextSearch,
    centerCoords,
    getOrderDistanceMeters,
    groupOrders,
    isPostcodeSearch,
    matchesOrderPostcode,
    matchesSearch,
  ]);

  const filteredMapOrdersWithFilters = React.useMemo(
    () => filteredMapOrders.filter((order) => order.products.some(matchesProductFilters)),
    [filteredMapOrders, matchesProductFilters]
  );

  const currentProducerId =
    viewer.role === 'producer' ? viewer.producerId ?? 'current-user' : viewer.producerId ?? '';
  const selectedOrder = React.useMemo(
    () =>
      orderCodeFromPath
        ? groupOrders.find((order) => order.orderCode === orderCodeFromPath || order.id === orderCodeFromPath) ??
          null
        : null,
    [groupOrders, orderCodeFromPath]
  );
  const selectedProduct = React.useMemo(() => {
    if (!productCodeFromPath) return null;
    return (
      products.find(
        (product) =>
          (product.productCode ?? product.id) === productCodeFromPath || product.id === productCodeFromPath
      ) ?? null
    );
  }, [productCodeFromPath, products]);
  const publicOrders = React.useMemo(
    () => groupOrders.filter((order) => order.visibility === 'public' && order.status === 'open'),
    [groupOrders]
  );
  const publicOrdersBySearch = React.useMemo(
    () => filteredMapOrders.filter((order) => order.visibility === 'public' && order.status === 'open'),
    [filteredMapOrders]
  );
  const publicOrdersWithFilters = React.useMemo(
    () => publicOrdersBySearch.filter((order) => order.products.some(matchesProductFilters)),
    [publicOrdersBySearch, matchesProductFilters]
  );

  const authRedirectTo = (location.state as { redirectTo?: string } | null)?.redirectTo;
  const hideAuthTitle = isAuthPage && Boolean(authRedirectTo?.startsWith(tabRoutes.messages));
  const isDiscoverRoute = location.pathname.startsWith('/decouvrir');
  const isGuestDiscover = !isAuthenticated && isDiscoverRoute;

  React.useEffect(() => {
    if (!isGuestDiscover) return;
    if (guestLocationStatus !== 'idle') return;
    requestGuestLocation();
  }, [guestLocationStatus, isGuestDiscover, requestGuestLocation]);


  const redirectToAuth = (path?: string, mode: 'login' | 'signup' = 'login', extras?: AuthRedirectExtras) => {
    const target = path ?? `${location.pathname}${location.search}${location.hash}`;
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('authRedirectTo', target);
      } catch {}
    }
    navigate('/connexion', { state: { redirectTo: target, mode, ...extras } });
  };

  const changeTab = (tab: string) => {
    lastTabRef.current = null;
    const target =
      tab === 'profile' && isAuthenticated && user?.handle
        ? `/profil/${user.handle}`
        : tabRoutes[tab as keyof typeof tabRoutes] ?? tabRoutes.home;
    const needsAuth = tab === 'messages';
    if (needsAuth && !isAuthenticated) {
      redirectToAuth(target);
      return;
    }
    if (tab !== 'profile') {
      setProfileMode('view');
    }
    navigate(target);
  };

  const openOrderView = (orderId: string) => {
    if (!lastTabRef.current) {
      lastTabRef.current = location.pathname;
    }
    const order = groupOrders.find((entry) => entry.id === orderId || entry.orderCode === orderId);
    const orderCode = order?.orderCode ?? orderId;
    navigate(`/cmd/${orderCode}`);
  };
  const resolveOrderCode = React.useCallback(
    (orderId: string) => groupOrders.find((entry) => entry.id === orderId)?.orderCode ?? orderId,
    [groupOrders]
  );

  const openProductView = (
    productId: string,
    context?: { orderCode?: string | null; lotCode?: string | null }
  ) => {
    const product =
      products.find((item) => (item.productCode ?? item.id) === productId) ??
      products.find((item) => item.id === productId);
    const requestedOrderCode = context?.orderCode?.trim() || null;
    const resolvedOrderCode =
      requestedOrderCode
        ? groupOrders.find((entry) => entry.orderCode === requestedOrderCode || entry.id === requestedOrderCode)
            ?.orderCode ?? requestedOrderCode
        : null;
    const lotCode = context?.lotCode?.trim() || null;
    if (product) {
      const basePath = getProductPath(product, lotCode);
      const hasLotContext = Boolean(lotCode || product.activeLotCode);
      if (resolvedOrderCode && hasLotContext) {
        navigate(`${basePath}/cmd/${encodeURIComponent(resolvedOrderCode)}`);
        return;
      }
      navigate(basePath);
      return;
    }
    if (lotCode) {
      const fallbackPath = `/produits/produit-${productId}/lot/${lotCode}`;
      if (resolvedOrderCode) {
        navigate(`${fallbackPath}/cmd/${encodeURIComponent(resolvedOrderCode)}`);
        return;
      }
      navigate(fallbackPath);
      return;
    }
    navigate(`/produits/produit-${productId}`);
  };

  const closeOrderView = () => {
    const fallback =
      lastTabRef.current ?? (viewer.role === 'participant' ? tabRoutes.create : tabRoutes.home);
    lastTabRef.current = null;
    navigate(fallback);
  };

  React.useEffect(() => {
    if (!user) return;
    if (prevRoleRef.current === null) {
      prevRoleRef.current = user.role;
      return;
    }
    if (prevRoleRef.current !== user.role) {
      const target = user.role === 'participant' ? tabRoutes.create : tabRoutes.home;
      navigate(target, { replace: true });
      prevRoleRef.current = user.role;
    }
  }, [user, navigate]);

  const asDeckCard = React.useCallback(
    (product: Product): DeckCard => {
      const existing = deck.find((card) => card.id === product.id);
      return existing ?? { ...product, addedAt: new Date() };
    },
    [deck]
  );

  const resetOrderBuilder = React.useCallback(() => {
    setOrderBuilderProducts(null);
    setOrderBuilderSelection(null);
    orderBuilderSourceRef.current = null;
  }, []);

  const handleAddToDeck = (product: Product) => {
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour sauvegarder des produits.');
      redirectToAuth(location.pathname);
      return;
    }
    if (deck.find((card) => card.id === product.id)) {
      toast.info('Ce produit est deja dans votre selection');
      return;
    }

    const newCard: DeckCard = {
      ...product,
      addedAt: new Date(),
    };
    setDeck([...deck, newCard]);
    toast.success(`${product.name} ajoute a votre selection !`);
  };

  const handleRemoveFromDeck = (productId: string) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    setDeck(deck.filter((card) => card.id !== productId));
    toast.success('Produit retire de votre selection');
  };

  const handleStartOrderFromProduct = (product: Product) => {
    orderBuilderSourceRef.current = location.pathname;
    const relatedProducts = products
      .filter((item) => item.producerId === product.producerId)
      .map(asDeckCard);
    const collection = new Map<string, DeckCard>();
    relatedProducts.forEach((item) => collection.set(item.id, item));
    if (!collection.has(product.id)) {
      collection.set(product.id, asDeckCard(product));
    }
    setOrderBuilderProducts(Array.from(collection.values()));
    setOrderBuilderSelection([product.id]);
    navigate('/commande/nouvelle');
  };

  const handleUpdateOrderVisibility = (orderId: string, visibility: GroupOrder['visibility']) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    setGroupOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, visibility } : order))
    );
  };

  const handleUpdateOrderParticipantSettings = (
    orderId: string,
    updates: Partial<Pick<GroupOrder, 'autoApproveParticipationRequests' | 'allowSharerMessages' | 'autoApprovePickupSlots'>>
  ) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    setGroupOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, ...updates } : order))
    );
  };

  const handleStartPurchase = (
    order: GroupOrder,
    payload: StartPaymentPayload
  ) => {
    const total = Number(payload.total) || 0;
    const weight = Number(payload.weight) || 0;
    const draft: OrderPurchaseDraft = {
      orderId: order.id,
      quantities: payload.quantities,
      total,
      weight,
      baseOrderedWeight: order.orderedWeight ?? 0,
      kind: 'participant',
      useCoopBalance: Boolean(payload.useCoopBalance),
    };
    setPurchaseDraft(draft);
    setRecentPurchase(null);
    if (!isAuthenticated) {
      redirectToAuth(`/cmd/${resolveOrderCode(order.id)}/paiement`);
      return;
    }
    navigate(`/cmd/${resolveOrderCode(order.id)}/paiement`);
  };

  const handleStartClosePayment = (
    order: GroupOrder,
    payload: { amountCents: number; useCoopBalance: boolean; extraQuantities: Record<string, number> }
  ) => {
    const total = centsToEuros(payload.amountCents);
    const draft: OrderPurchaseDraft = {
      orderId: order.id,
      quantities: {},
      total,
      weight: 0,
      baseOrderedWeight: order.orderedWeight ?? 0,
      kind: 'close',
      closeData: {
        useCoopBalance: payload.useCoopBalance,
        extraQuantities: payload.extraQuantities,
      },
    };
    setPurchaseDraft(draft);
    setRecentPurchase(null);
    if (!isAuthenticated) {
      redirectToAuth(`/cmd/${resolveOrderCode(order.id)}/paiement`);
      return;
    }
    navigate(`/cmd/${resolveOrderCode(order.id)}/paiement`);
  };

  const handlePurchaseOrder = (orderId: string, total?: number, weight?: number) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    const addedWeight = weight ?? 0;
    setGroupOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              participants: order.participants + 1,
              totalValue: order.totalValue + (total ?? 0),
              orderedWeight: (order.orderedWeight ?? 0) + addedWeight,
            }
          : order
      )
    );
  };

  const handleConfirmPayment = async (draft: OrderPurchaseDraft) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    const order = groupOrders.find((entry) => entry.id === draft.orderId);
    if (!order) {
      toast.error('Commande introuvable.');
      return;
    }
    if (!user) {
      toast.error('Utilisateur introuvable.');
      return;
    }

    let paidAmountCents = eurosToCents(draft.total);
    let paymentParticipantId: string | null = null;
    let createdPaymentId: string | null = null;
    let participantCreatedInFlow = false;
    const createdOrderItems: Array<{ id: string }> = [];

    try {
      const existingParticipant = await getParticipantByProfile(order.id, user.id);
      const participant =
        existingParticipant ?? (await requestParticipation(order.orderCode ?? order.id, user.id));
      participantCreatedInFlow = !existingParticipant;
      paymentParticipantId = participant.id;
      const productsByCode = new Map(order.products.map((product) => [product.id, product]));

      for (const [productCode, rawQty] of Object.entries(draft.quantities)) {
        const quantityUnits = Math.max(0, Number(rawQty) || 0);
        if (quantityUnits <= 0) continue;
        const product = productsByCode.get(productCode);
        if (!product?.dbId) {
          console.warn('Produit introuvable pour la participation:', productCode);
          continue;
        }
        const item = await addItem({
          orderId: order.id,
          participantId: participant.id,
          productId: product.dbId,
          quantityUnits,
        });
        createdOrderItems.push({ id: item.id });
      }

      // Reprice this participant's lines using the latest order weight.
      const withItems = await getOrderFullByCode(order.orderCode ?? order.id);
      const participantItems = withItems.items.filter((item) => item.participantId === participant.id);
      for (const item of participantItems) {
        await updateOrderItemQuantity(item.id, order.id, participant.id, item.quantityUnits);
      }

      const refreshed = await getOrderFullByCode(order.orderCode ?? order.id);
      const refreshedParticipant = refreshed.participants.find((entry) => entry.id === participant.id);
      if (!refreshedParticipant) {
        throw new Error('Participant introuvable apres recalcul des prix.');
      }
      const alreadyPaidCents = refreshed.payments.reduce((sum, payment) => {
        if (payment.participantId !== refreshedParticipant.id) return sum;
        if (payment.status !== 'paid' && payment.status !== 'authorized') return sum;
        return sum + Math.max(0, (payment.amountCents ?? 0) - (payment.refundedAmountCents ?? 0));
      }, 0);
      const amountDueCents = Math.max(0, refreshedParticipant.totalAmountCents - alreadyPaidCents);
      const useCoopBalance = Boolean(draft.useCoopBalance);
      const coopBalanceCents = await fetchCoopBalance(user.id);
      const coopToConsumeCents = useCoopBalance ? Math.min(coopBalanceCents, amountDueCents) : 0;
      paidAmountCents = Math.max(0, amountDueCents - coopToConsumeCents);

      if (paidAmountCents <= 0) {
        if (coopToConsumeCents > 0) {
          await issueParticipantInvoiceWithCoop({
            orderId: order.id,
            profileId: user.id,
            coopAppliedCents: coopToConsumeCents,
          });
        } else {
          throw new Error('Aucun montant a payer apres recalcul des prix.');
        }
      } else {
        const payment = await createPaymentStub({
          orderId: order.id,
          participantId: participant.id,
          amountCents: paidAmountCents,
          raw: {
            flow_kind: 'participant',
            use_coop_balance: useCoopBalance,
          },
        });
        createdPaymentId = payment.id;
        await finalizePaymentSimulation(payment.id);
      }
    } catch (error) {
      if (createdPaymentId) {
        try {
          await updatePaymentStatus(createdPaymentId, 'failed');
        } catch (markFailedError) {
          console.error('Payment mark failed error:', markFailedError);
        }
      }

      // Roll back cart side effects when payment did not complete.
      if (!createdPaymentId && createdOrderItems.length > 0 && paymentParticipantId) {
        for (const created of createdOrderItems.slice().reverse()) {
          try {
            await removeItem(created.id, order.id, paymentParticipantId);
          } catch (rollbackItemError) {
            console.error('Rollback order item error:', rollbackItemError);
          }
        }
      }

      if (!createdPaymentId && participantCreatedInFlow && paymentParticipantId) {
        try {
          await deleteParticipantIfNoActivity({
            orderId: order.id,
            participantId: paymentParticipantId,
            profileId: user.id,
          });
        } catch (rollbackParticipantError) {
          console.error('Rollback participant error:', rollbackParticipantError);
        }
      }

      console.error('Payment finalize error:', error);
      const message = (error as Error)?.message ?? 'Impossible de finaliser le paiement.';
      toast.error(message);
      return;
    }

    const paidTotalEuros = centsToEuros(paidAmountCents);
    const finalizedDraft: OrderPurchaseDraft = { ...draft, total: paidTotalEuros };
    handlePurchaseOrder(draft.orderId, paidTotalEuros, draft.weight);
    setRecentPurchase(finalizedDraft);
    setPurchaseDraft(null);
    navigate(`/cmd/${resolveOrderCode(draft.orderId)}/partage`);
    toast.success('Paiement confirme (simulation).');
  };

  const handleConfirmClosePayment = async (draft: OrderPurchaseDraft) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    const order = groupOrders.find((entry) => entry.id === draft.orderId);
    if (!order) {
      toast.error('Commande introuvable.');
      return;
    }
    if (!user) {
      toast.error('Utilisateur introuvable.');
      return;
    }
    const closeData = draft.closeData;
    if (!closeData) {
      toast.error('Paiement de clôture incomplet.');
      return;
    }

    try {
      const orderFull = await getOrderFullByCode(order.orderCode ?? order.id);
      const sharerParticipant =
        orderFull.participants.find((participant) => participant.role === 'sharer') ?? null;
      if (!sharerParticipant) {
        toast.error('Partageur introuvable.');
        return;
      }

      const items = orderFull.items ?? [];
      const sharerItems = items.filter((item) => item.participantId === sharerParticipant.id);
      const currentSharerQuantities = sharerItems.reduce((acc, item) => {
        acc[item.productId] = (acc[item.productId] ?? 0) + item.quantityUnits;
        return acc;
      }, {} as Record<string, number>);

      for (const [productId, rawExtra] of Object.entries(closeData.extraQuantities ?? {})) {
        const extraQty = Math.max(0, Number(rawExtra) || 0);
        if (extraQty <= 0) continue;
        const existingQty = currentSharerQuantities[productId] ?? 0;
        const targetQty = existingQty + extraQty;
        const existingItem = sharerItems.find((item) => item.productId === productId);
        if (existingItem) {
          await updateOrderItemQuantity(existingItem.id, order.id, sharerParticipant.id, targetQty);
        } else {
          await addItem({
            orderId: order.id,
            participantId: sharerParticipant.id,
            productId,
            quantityUnits: targetQty,
          });
        }
      }

      const payment = await createPaymentStub({
        orderId: order.id,
        participantId: sharerParticipant.id,
        amountCents: eurosToCents(draft.total),
        raw: {
          flow_kind: 'close',
          use_coop_balance: Boolean(closeData.useCoopBalance),
        },
      });
      await finalizeClosePayment(payment.id);
      await createLockClosePackage(order.id, Boolean(closeData.useCoopBalance));
    } catch (error) {
      console.error('Close payment finalize error:', error);
      const message = (error as Error)?.message ?? 'Impossible de finaliser le paiement.';
      toast.error(message);
      return;
    }

    // Post-close checks are best effort only and must not block UX.
    try {
      let sharerInvoices = await fetchParticipantInvoices(order.id, user.id);
      if (!sharerInvoices.length) {
        await issueSharerInvoiceAfterLock(order.id);
        sharerInvoices = await fetchParticipantInvoices(order.id, user.id);
      }
      if (!sharerInvoices.length) {
        toast.warning('Commande clôturée, mais facture partageur non confirmée immédiatement.');
      }
    } catch (invoiceCheckError) {
      console.error('Close payment invoice check error:', invoiceCheckError);
      toast.warning('Commande clôturée, mais vérification facture indisponible.');
    }

    try {
      await triggerOutgoingEmails();
    } catch (emailError) {
      console.error('Close payment email trigger error:', emailError);
      toast.warning('Facture generee, mais envoi email non declenche automatiquement.');
    }

    setPurchaseDraft(null);
    setRecentPurchase(null);
    navigate(`/cmd/${resolveOrderCode(order.id)}`);
    toast.success('Paiement confirmé et commande clôturée.');
  };

  const handleCreateOrder = (orderData: any) => {
    if (!user) {
      toast.info('Connectez-vous ou creez un compte pour publier une commande.');
      const signupPrefill = {
        address: orderData?.pickupStreet || orderData?.pickupAddress || '',
        addressDetails: orderData?.pickupInfo || orderData?.deliveryInfo || '',
        city: orderData?.pickupCity || '',
        postcode: orderData?.pickupPostcode || '',
      };
      redirectToAuth('/commande/nouvelle', 'signup', { signupPrefill });
      return;
    }
    const now = new Date();
    const firstProduct = orderData.products?.[0];
    const pickupAddress =
      orderData.pickupAddress ||
      [orderData.pickupStreet, [orderData.pickupPostcode, orderData.pickupCity].filter(Boolean).join(' ') || undefined]
        .filter(Boolean)
        .join(', ');
    const shareMode = orderData.shareMode ?? 'products';
    const sharerQuantities =
      shareMode === 'cash' ? {} : (orderData.shareQuantities as Record<string, number> | undefined) ?? {};
    const hasSharerSelection = Object.values(sharerQuantities).some((qty) => qty > 0);
    const getProductWeightKg = (product: Product) => {
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
    const sharerSelectionWeight = hasSharerSelection
      ? (orderData.products ?? []).reduce((sum: number, product: Product) => {
          const qty = sharerQuantities[product.id] ?? 0;
          return sum + getProductWeightKg(product) * qty;
        }, 0)
      : 0;
    const rawEstimatedDeliveryDate =
      orderData.estimatedDeliveryDate instanceof Date
        ? orderData.estimatedDeliveryDate
        : orderData.estimatedDeliveryDate
          ? new Date(orderData.estimatedDeliveryDate)
          : undefined;
    const estimatedDeliveryDate =
      rawEstimatedDeliveryDate && !Number.isNaN(rawEstimatedDeliveryDate.getTime())
        ? rawEstimatedDeliveryDate
        : undefined;
    const pickupWindowWeeks =
      typeof orderData.pickupWindowWeeks === 'number' && orderData.pickupWindowWeeks > 0
        ? orderData.pickupWindowWeeks
        : undefined;

    const newOrder: GroupOrder = {
      id: `order-${Date.now()}`,
      title: orderData.title,
      sharerId: user.id,
      sharerName: user.name,
      products: orderData.products,
      producerId: firstProduct?.producerId ?? currentProducerId,
      producerName: firstProduct?.producerName ?? 'Producteur',
      sharerPercentage: orderData.sharerPercentage,
        sharerQuantities: hasSharerSelection ? sharerQuantities : undefined,
        minWeight: orderData.minWeight,
        maxWeight: orderData.maxWeight,
        orderedWeight: sharerSelectionWeight,
        deliveryFeeCents:
          typeof orderData.deliveryFeeCents === 'number'
            ? orderData.deliveryFeeCents
            : eurosToCents(orderData.pickupDeliveryFee ?? 0),
        estimatedDeliveryDate,
        pickupWindowWeeks,
      deadline: orderData.deadline ?? now,
      pickupStreet: orderData.pickupStreet,
      pickupCity: orderData.pickupCity,
      pickupPostcode: orderData.pickupPostcode,
      pickupAddress,
      pickupSlots: orderData.pickupSlots,
      pickupDeliveryFee: orderData.pickupDeliveryFee ?? 0,
      message: orderData.message,
      status: 'open',
      visibility: orderData.visibility ?? 'public',
      autoApproveParticipationRequests: orderData.autoApproveParticipationRequests ?? false,
      allowSharerMessages: orderData.allowSharerMessages ?? true,
      autoApprovePickupSlots: orderData.autoApprovePickupSlots ?? false,
      totalValue: orderData.totals?.participantTotal ?? 0,
      participants: hasSharerSelection ? 1 : 0,
    };

    setGroupOrders((prev) => [newOrder, ...prev]);
    toast.success('Commande cree avec succes !');
    const usedProductIds = (orderData.products ?? []).map((p: Product) => p.id);
    setDeck(deck.filter((card) => !usedProductIds.includes(card.id)));
    lastTabRef.current = orderBuilderSourceRef.current ?? lastTabRef.current;
    resetOrderBuilder();
    openOrderView(newOrder.id);
  };

  const handleAddProduct = (payload: CreateProductPayload) => {
    if (!user) {
      toast.info('Connectez-vous pour ajouter un produit.');
      redirectToAuth(tabRoutes.create);
      return;
    }
    const productCode = payload.product.productCode ?? `product-${Date.now()}`;
    const targetProfilePath = user.handle ? `/profil/${user.handle}` : tabRoutes.profile;

    const finalizeCreate = (nextProduct: Product, nextDetail: ProductDetail) => {
      const productKey = nextProduct.productCode ?? nextProduct.id;
      setProducts((prev) => [nextProduct, ...prev]);
      setCreatedProductDetails((prev) => ({
        ...prev,
        [productKey]: {
          ...nextDetail,
          productId: productKey,
          name: nextProduct.name,
          category: nextProduct.category,
        },
      }));
      toast.success('Produit ajoute avec succes !');
      setProfileMode('view');
      navigate(targetProfilePath);
    };

    const measurement = payload.product.measurement ?? 'kg';
    const saleUnit = measurement === 'kg' ? 'kg' : 'unit';
    const packaging =
      (payload.product.unit || payload.detail.conditionnementPrincipal || (saleUnit === 'kg' ? 'kg' : 'piece')).trim();
    const producerProfileId =
      [payload.product.producerId, user.producerId, user.id].find(isUuid) ?? null;
    const dbCategory = resolveDbCategory(payload.product.category);
    if (!dbCategory) {
      toast.error("Categorie non prise en charge par la base.");
      return;
    }

    if (!supabaseClient || DEMO_MODE) {
      const fallbackProduct: Product = {
        id: productCode,
        productCode,
        slug: payload.product.slug ?? slugify(payload.product.name || productCode),
        name: payload.product.name,
        description: payload.product.description ?? '',
        price: 0,
        unit: packaging || (saleUnit === 'kg' ? 'kg' : 'piece'),
        quantity: 0,
        category: payload.product.category,
        imageUrl: payload.product.imageUrl ?? '',
        producerId: producerProfileId ?? payload.product.producerId ?? productCode,
        producerName: payload.product.producerName,
        producerLocation: payload.product.producerLocation,
        inStock: false,
        measurement,
        weightKg: payload.product.weightKg,
        vatRate: payload.detail.vatRate ?? payload.product.vatRate,
      };
      finalizeCreate(fallbackProduct, payload.detail);
      return;
    }

    void (async () => {
      try {
        const PRODUCT_IMAGE_BUCKET = 'product-images';
        const JOURNEY_IMAGE_BUCKET = import.meta.env.VITE_PRODUCT_JOURNEY_BUCKET ?? 'product-journey';
        const description = payload.product.description?.trim() || null;
        const producerName = payload.product.producerName?.trim() || user.name || null;
        const producerLocation = payload.product.producerLocation?.trim() || user.city || null;

        const { data: createdProduct, error: createError } = await supabaseClient
          .from('products')
          .insert({
            product_code: productCode,
            slug: payload.product.slug ?? slugify(payload.product.name || productCode),
            name: payload.product.name,
            sale_unit: saleUnit,
            packaging: packaging || (saleUnit === 'kg' ? 'kg' : 'piece'),
            unit_weight_kg: payload.product.weightKg ?? null,
            description,
            category: dbCategory,
            conservation_method: payload.detail.conservationMode ?? null,
            conservation_detail: payload.detail.compositionEtiquette?.conservationDetaillee ?? null,
            conservation_after_opening: payload.detail.compositionEtiquette?.conseilsUtilisation ?? null,
            default_price_cents: null,
            vat_rate: payload.detail.vatRate ?? payload.product.vatRate ?? 0.055,
            producer_profile_id: producerProfileId,
            producer_name: producerName,
            producer_location: producerLocation,
            is_active: true,
          })
          .select('id, product_code')
          .maybeSingle();

        if (createError || !createdProduct?.id) {
          throw createError ?? new Error('Erreur creation produit.');
        }

        const productId = createdProduct.id as string;
        let primaryImageUrl = payload.product.imageUrl?.trim() || '';

        if (payload.imageFile) {
          const file = payload.imageFile;
          const fileType = file.type || 'image/webp';
          const extension = fileType.split('/')[1] || 'webp';
          const targetPath = `${productId}/product-${Date.now()}.${extension}`;
          const { error: uploadError } = await supabaseClient.storage
            .from(PRODUCT_IMAGE_BUCKET)
            .upload(targetPath, file, {
              upsert: false,
              contentType: fileType,
              cacheControl: '3600',
            });
          if (uploadError) {
            throw uploadError;
          }

          const altText = payload.detail.productImage?.alt ?? payload.product.name;
          const { error: imageError } = await supabaseClient.from('product_images').insert({
            product_id: productId,
            path: targetPath,
            alt: altText || null,
            sort_order: 0,
            is_primary: true,
          });
          if (imageError) {
            throw imageError;
          }

          const { data: publicData } = supabaseClient.storage
            .from(PRODUCT_IMAGE_BUCKET)
            .getPublicUrl(targetPath);
          if (publicData?.publicUrl) {
            primaryImageUrl = publicData.publicUrl;
          }
        }

        const ingredientRows = (payload.detail.compositionEtiquette?.ingredients ?? [])
          .map((ingredient) => {
            const name = ingredient.nom?.trim();
            if (!name) return null;
            return {
              product_id: productId,
              name,
              is_allergen: Boolean(ingredient.isAllergen),
              allergen_type: ingredient.isAllergen
                ? (ingredient.allergenType || name).trim() || null
                : null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
        if (ingredientRows.length) {
          const { error: ingredientError } = await supabaseClient
            .from('product_ingredients')
            .insert(ingredientRows);
          if (ingredientError) {
            throw ingredientError;
          }
        }

        const timeline = payload.detail.tracabilite?.timeline ?? [];
        let timelineWithCoords = timeline;
        let createdSteps: Array<{ id: string; step_label: string; sort_order: number }> = [];
        if (timeline.length) {
          const stepRows: Array<Record<string, unknown>> = [];
          const resolvedTimeline: TimelineStep[] = [];

          for (const [index, step] of timeline.entries()) {
            const label = (step.etape || '').trim();
            const locationParts = collectLocationParts(step);
            let lat = toNumberOrUndefined(step.lat);
            let lng = toNumberOrUndefined(step.lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              const query = locationParts.join(', ');
              if (query) {
                const coords = await geocodeAddress(query);
                if (coords) {
                  lat = coords.lat;
                  lng = coords.lng;
                }
              }
            }

            resolvedTimeline.push({
              ...step,
              lat: Number.isFinite(lat) ? (lat as number) : step.lat,
              lng: Number.isFinite(lng) ? (lng as number) : step.lng,
            });

            if (!label) continue;
            stepRows.push({
              product_id: productId,
              step_label: label,
              description: step.description?.trim() || null,
              location: locationParts.length ? locationParts.join(', ') : null,
              location_address: step.address?.trim() || null,
              location_details: step.addressDetails?.trim() || null,
              location_postcode: step.postcode?.trim() || null,
              location_city: step.city?.trim() || null,
              location_country: step.country?.trim() || null,
              location_lat: Number.isFinite(lat) ? lat : null,
              location_lng: Number.isFinite(lng) ? lng : null,
              sort_order: index,
            });
          }

          timelineWithCoords = resolvedTimeline;

          if (stepRows.length) {
            const { data: stepData, error: stepError } = await supabaseClient
              .from('product_journey_steps')
              .insert(stepRows)
              .select('id, step_label, sort_order');
            if (stepError) {
              throw stepError;
            }
            createdSteps = (stepData as Array<{ id: string; step_label: string; sort_order: number }>) ?? [];
          }
        }

        if (payload.journeyImageFiles?.length && createdSteps.length) {
          const sortedSteps = createdSteps.slice().sort((a, b) => a.sort_order - b.sort_order);
          const stepsByLabel = new Map<string, Array<{ id: string; step_label: string; sort_order: number }>>();
          sortedSteps.forEach((step) => {
            const key = normalizeLabelKey(step.step_label);
            if (!stepsByLabel.has(key)) {
              stepsByLabel.set(key, []);
            }
            stepsByLabel.get(key)?.push(step);
          });

          const usedStepIds = new Set<string>();

          for (const entry of payload.journeyImageFiles) {
            const labelKey = normalizeLabelKey(entry.stepLabel);
            const candidates = stepsByLabel.get(labelKey);
            let targetStep = candidates?.shift() ?? sortedSteps.find((step) => !usedStepIds.has(step.id));
            if (!targetStep) continue;
            usedStepIds.add(targetStep.id);

            const fileType = entry.file.type || 'image/webp';
            const extension = fileType.split('/')[1] || 'webp';
            const targetPath = `${productId}/journey-${targetStep.id}-${Date.now()}.${extension}`;
            const { error: uploadError } = await supabaseClient.storage
              .from(JOURNEY_IMAGE_BUCKET)
              .upload(targetPath, entry.file, {
                upsert: false,
                contentType: fileType,
                cacheControl: '3600',
              });
            if (uploadError) {
              throw uploadError;
            }

            const { error: updateError } = await supabaseClient
              .from('product_journey_steps')
              .update({
                evidence_path: targetPath,
                evidence_label: entry.stepLabel || targetStep.step_label,
              })
              .eq('id', targetStep.id);
            if (updateError) {
              throw updateError;
            }
          }
        }

        const localProduct: Product = {
          id: productCode,
          productCode,
          slug: payload.product.slug ?? slugify(payload.product.name || productCode),
          name: payload.product.name,
          description: payload.product.description ?? '',
          price: 0,
          unit: packaging || (saleUnit === 'kg' ? 'kg' : 'piece'),
          quantity: 0,
          category: payload.product.category,
          imageUrl: primaryImageUrl,
          producerId: producerProfileId ?? payload.product.producerId ?? productCode,
          producerName: payload.product.producerName,
          producerLocation: payload.product.producerLocation,
          inStock: false,
          measurement,
          weightKg: payload.product.weightKg,
        };

        const nextDetail: ProductDetail = {
          ...payload.detail,
          tracabilite: payload.detail.tracabilite
            ? {
                ...payload.detail.tracabilite,
                timeline: timelineWithCoords.length
                  ? timelineWithCoords
                  : payload.detail.tracabilite.timeline,
              }
            : payload.detail.tracabilite,
          productId: productCode,
          productImage: primaryImageUrl
            ? {
                url: primaryImageUrl,
                alt: payload.detail.productImage?.alt ?? payload.product.name,
              }
            : payload.detail.productImage,
        };

        finalizeCreate(localProduct, nextDetail);
      } catch (error) {
        console.error('Create product error:', error);
        toast.error('Creation du produit impossible.');
      }
    })();
  };

  const handleUpdateUser = async (userData: Partial<User>) => {
    if (!user) {
      redirectToAuth(tabRoutes.profile);
      return;
    }

    const normalizedRole = normalizeUserRole(userData.role ?? user.role);
    const nextAccountType = userData.accountType ?? user.accountType ?? 'individual';
    if (normalizedRole === 'producer' && nextAccountType === 'auto_entrepreneur') {
      toast.error('Les auto-entreprises ne peuvent pas devenir producteur.');
      return;
    }
    const nextAddressDetails = (userData.addressDetails ?? user.addressDetails ?? '').trim();

    if (!supabaseClient) {
      const updatedUser = {
        ...user,
        ...userData,
        role: normalizedRole,
        addressDetails: nextAddressDetails || undefined,
      };
      if (normalizedRole === 'producer') {
        updatedUser.producerId = updatedUser.producerId ?? 'current-user';
      }
      setUser(updatedUser);
      toast.success('Profil mis a jour localement (Supabase non configure)');
      return;
    }

    const nextHandle = sanitizeHandle(userData.handle ?? user.handle);
    if (!nextHandle) {
      toast.error('Tag invalide.');
      return;
    }

    if (nextHandle !== user.handle) {
      const { data: existing, error: existingError } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('handle', nextHandle)
        .maybeSingle();
      if (existingError) {
        toast.error('Verification du tag impossible.');
        return;
      }
      if (existing && existing.id !== user.id) {
        toast.error('Ce tag est deja utilise. Choisissez-en un autre.');
        return;
      }
    }

    const normalizeValue = (value?: string | null) => (value ?? '').trim();
    const nextAddress = normalizeValue(userData.address ?? user.address);
    const nextCity = normalizeValue(userData.city ?? user.city);
    const nextPostcode = normalizeValue(userData.postcode ?? user.postcode);
    const currentAddress = normalizeValue(user.address);
    const currentCity = normalizeValue(user.city);
    const currentPostcode = normalizeValue(user.postcode);
    const currentAddressDetails = normalizeValue(user.addressDetails);
    const addressChanged =
      nextAddress !== currentAddress ||
      nextCity !== currentCity ||
      nextPostcode !== currentPostcode ||
      nextAddressDetails !== currentAddressDetails;
    const hasCompleteAddress = Boolean(nextAddress && nextCity && nextPostcode);

    let nextAddressLat: number | null = user.addressLat ?? null;
    let nextAddressLng: number | null = user.addressLng ?? null;
    if (!hasCompleteAddress) {
      nextAddressLat = null;
      nextAddressLng = null;
    } else if (
      addressChanged ||
      !Number.isFinite(user.addressLat ?? NaN) ||
      !Number.isFinite(user.addressLng ?? NaN)
    ) {
      const query = [nextAddress, nextAddressDetails, `${nextPostcode} ${nextCity}`]
        .filter(Boolean)
        .join(', ');
      const coords = await geocodeAddress(query);
      if (coords) {
        nextAddressLat = coords.lat;
        nextAddressLng = coords.lng;
      } else {
        nextAddressLat = null;
        nextAddressLng = null;
        toast.error('Adresse introuvable. Verifiez les champs.');
      }
    }

    const payload = {
      name: userData.name ?? user.name,
      handle: nextHandle,
      role: normalizedRole,
      account_type: nextAccountType,
      tagline: userData.tagline ?? user.tagline,
      website: userData.website ?? user.website,
      address: nextAddress,
      address_details: nextAddressDetails || null,
      city: nextCity,
      postcode: nextPostcode,
      address_lat: nextAddressLat,
      address_lng: nextAddressLng,
      phone: userData.phone ?? user.phone,
      phone_public: userData.phonePublic ?? user.phonePublic,
      contact_email_public: userData.contactEmailPublic ?? user.contactEmailPublic,
      offers_on_site_pickup: userData.offersOnSitePickup ?? user.offersOnSitePickup ?? false,
      fresh_products_certified: userData.freshProductsCertified ?? user.freshProductsCertified ?? false,
      social_links: userData.socialLinks ?? user.socialLinks ?? null,
      opening_hours: userData.openingHours ?? user.openingHours ?? null,
      profile_visibility: userData.profileVisibility ?? user.profileVisibility ?? 'public',
      address_visibility: userData.addressVisibility ?? user.addressVisibility ?? 'private',
      producer_id: userData.producerId ?? user.producerId,
    };

    const { data, error } = await supabaseClient
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      toast.error('Mise a jour du profil impossible.');
      return;
    }

    if (userData.addressDetails !== undefined) {
      const { error: authError } = await supabaseClient.auth.updateUser({
        data: { address_details: nextAddressDetails || null },
      });
      if (authError) {
        toast.error("Mise a jour des informations d'adresse impossible.");
      }
    }

    let legalEntityRow: LegalEntityRow | null = null;
    const legalEntityInput = userData.legalEntity;
    const hasLegalEntityUpdates =
      nextAccountType !== 'individual' &&
      legalEntityInput &&
      Object.values(legalEntityInput).some((value) => value !== undefined);
    if (hasLegalEntityUpdates) {
      const mergedLegalEntity = {
        ...(user.legalEntity ?? {}),
        ...Object.fromEntries(
          Object.entries(legalEntityInput ?? {}).filter(([, value]) => value !== undefined)
        ),
      } as Partial<LegalEntity>;
      const legalPayload: Record<string, unknown> = { profile_id: user.id };
      if (mergedLegalEntity.legalName !== undefined) legalPayload.legal_name = mergedLegalEntity.legalName;
      if (mergedLegalEntity.siret !== undefined) legalPayload.siret = mergedLegalEntity.siret;
      if (mergedLegalEntity.vatNumber !== undefined) legalPayload.vat_number = mergedLegalEntity.vatNumber ?? null;
      if (mergedLegalEntity.vatRegime !== undefined) legalPayload.vat_regime = mergedLegalEntity.vatRegime ?? 'unknown';
      if (mergedLegalEntity.entityType !== undefined) legalPayload.entity_type = mergedLegalEntity.entityType;
      if (mergedLegalEntity.producerCategory !== undefined) legalPayload.producer_category = mergedLegalEntity.producerCategory ?? null;
      if (mergedLegalEntity.iban !== undefined) legalPayload.iban = mergedLegalEntity.iban ?? null;
      if (mergedLegalEntity.accountHolderName !== undefined)
        legalPayload.account_holder_name = mergedLegalEntity.accountHolderName ?? null;
      if (mergedLegalEntity.canReceiveSharerCash !== undefined)
        legalPayload.can_receive_sharer_cash = mergedLegalEntity.canReceiveSharerCash ?? false;
      if (mergedLegalEntity.deliveryLeadType !== undefined) legalPayload.delivery_lead_type = mergedLegalEntity.deliveryLeadType ?? null;
      if (mergedLegalEntity.deliveryLeadDays !== undefined) legalPayload.delivery_lead_days = mergedLegalEntity.deliveryLeadDays ?? null;
      if (mergedLegalEntity.deliveryFixedDay !== undefined) legalPayload.delivery_fixed_day = mergedLegalEntity.deliveryFixedDay ?? null;
      if (mergedLegalEntity.chronofreshEnabled !== undefined)
        legalPayload.chronofresh_enabled = mergedLegalEntity.chronofreshEnabled ?? null;
      if (mergedLegalEntity.chronofreshMinWeight !== undefined)
        legalPayload.chronofresh_min_weight = mergedLegalEntity.chronofreshMinWeight ?? null;
      if (mergedLegalEntity.chronofreshMaxWeight !== undefined)
        legalPayload.chronofresh_max_weight = mergedLegalEntity.chronofreshMaxWeight ?? null;
      if (mergedLegalEntity.producerDeliveryEnabled !== undefined)
        legalPayload.producer_delivery_enabled = mergedLegalEntity.producerDeliveryEnabled ?? null;
      if (mergedLegalEntity.producerDeliveryDays !== undefined) {
        legalPayload.producer_delivery_days =
          mergedLegalEntity.producerDeliveryDays && mergedLegalEntity.producerDeliveryDays.length > 0
            ? mergedLegalEntity.producerDeliveryDays
            : null;
      }
      if (mergedLegalEntity.producerDeliveryMinWeight !== undefined)
        legalPayload.producer_delivery_min_weight = mergedLegalEntity.producerDeliveryMinWeight ?? null;
      if (mergedLegalEntity.producerDeliveryMaxWeight !== undefined)
        legalPayload.producer_delivery_max_weight = mergedLegalEntity.producerDeliveryMaxWeight ?? null;
      if (mergedLegalEntity.producerDeliveryRadiusKm !== undefined)
        legalPayload.producer_delivery_radius_km = mergedLegalEntity.producerDeliveryRadiusKm ?? null;
      if (mergedLegalEntity.producerDeliveryFee !== undefined)
        legalPayload.producer_delivery_fee = mergedLegalEntity.producerDeliveryFee ?? null;
      if (mergedLegalEntity.producerPickupEnabled !== undefined)
        legalPayload.producer_pickup_enabled = mergedLegalEntity.producerPickupEnabled ?? null;
      if (mergedLegalEntity.producerPickupDays !== undefined) {
        legalPayload.producer_pickup_days =
          mergedLegalEntity.producerPickupDays && mergedLegalEntity.producerPickupDays.length > 0
            ? mergedLegalEntity.producerPickupDays
            : null;
      }
      if (mergedLegalEntity.producerPickupStartTime !== undefined)
        legalPayload.producer_pickup_start_time = mergedLegalEntity.producerPickupStartTime ?? null;
      if (mergedLegalEntity.producerPickupEndTime !== undefined)
        legalPayload.producer_pickup_end_time = mergedLegalEntity.producerPickupEndTime ?? null;
      if (mergedLegalEntity.producerPickupMinWeight !== undefined)
        legalPayload.producer_pickup_min_weight = mergedLegalEntity.producerPickupMinWeight ?? null;
      if (mergedLegalEntity.producerPickupMaxWeight !== undefined)
        legalPayload.producer_pickup_max_weight = mergedLegalEntity.producerPickupMaxWeight ?? null;

      const { data: legalData, error: legalError } = await supabaseClient
        .from('legal_entities')
        .upsert(legalPayload, { onConflict: 'profile_id' })
        .select()
        .maybeSingle();
      if (legalError) {
        console.error('legal_entities upsert error:', legalError);
        toast.error('Informations legales non mises a jour.');
      } else {
        legalEntityRow = legalData as LegalEntityRow;
      }
    }

    if (data) {
      const mapped = mapProfileRowToUser(data as ProfileRow, null, legalEntityRow);
      const updated = { ...mapped, addressDetails: nextAddressDetails || undefined };
      setUser(updated);
      prevRoleRef.current = updated.role;
      if (location.pathname.startsWith('/profil')) {
        navigate(`/profil/${updated.handle}`, { replace: true });
      }
      toast.success('Profil mis a jour !');
    }
  };

  const handleAvatarUpdated = React.useCallback(
    (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => {
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          avatarPath: payload.avatarPath,
          avatarUpdatedAt: payload.avatarUpdatedAt ?? prev.avatarUpdatedAt,
        };
      });
    },
    []
  );

  const handleEditProfile = () => {
    if (!isAuthenticated) {
      redirectToAuth(tabRoutes.profile);
      return;
    }
    changeTab('profile');
    setProfileMode('edit');
  };

  const handleToggleFollowProfile = (target: User) => {
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour suivre des profils.');
      redirectToAuth(location.pathname);
      return;
    }
    setFollowingProfiles((prev) => {
      const nextState = !prev[target.id];
      const updated = { ...prev, [target.id]: nextState };
      toast.success(
        nextState
          ? `Vous suivez ${target.name}. Notifications en cas de nouvelles commandes ou produits.`
          : `Vous ne suivez plus ${target.name}.`
      );
      return updated;
    });
  };

  const handleMessageUser = (target: User) => {
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour envoyer un message.');
      redirectToAuth(location.pathname);
      return;
    }
    toast.info(`La messagerie arrive bientot. Vous pourrez ecrire a ${target.name} ici.`);
  };

  const openAddProductForm = () => {
    if (!isAuthenticated) {
      redirectToAuth('/produit/nouveau');
      return;
    }
    navigate('/produit/nouveau');
  };

  const handleLogout = async () => {
    try {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (error) {
      toast.error('Impossible de se déconnecter pour le moment.');
    }
    setUser(null);
    setDeck([]);
    prevRoleRef.current = null;
    toast.success('Déconnexion reussie.');
    navigate(tabRoutes.home);
  };

  const handleAuthSuccess = (authUser: SupabaseAuthUser) => {
    ensureProfile(authUser)
      .then((profile) => {
        setUser(profile);
        prevRoleRef.current = profile.role;
      })
      .catch(() => {
        const fallback = mapSupabaseUserToProfile(authUser);
        setUser(fallback);
        prevRoleRef.current = fallback.role;
      });
    setDeck([]);
    setProfileMode('view');
  };

  const handleDemoLogin = () => {
    setUser(mockUser);
    setDeck([]);
    setProfileMode('view');
    prevRoleRef.current = mockUser.role;
    toast.success('Connecte en mode demo');
  };

  const locationLabel = viewer.address?.split(',')[0] ?? 'votre quartier';
  const openProfileByHandle = React.useCallback(
    (handle: string) => {
      if (!handle) return;
      navigate(`/profil/${handle}`);
    },
    [navigate]
  );
  const openProducerProfile = React.useCallback(
    (product: Product) => {
      const handle = product.producerName.toLowerCase().replace(/\s+/g, '');
      openProfileByHandle(handle);
    },
    [openProfileByHandle]
  );
  const openSharerProfile = React.useCallback(
    (sharerName: string) => {
      if (!sharerName) return;
      const handle = sharerName.toLowerCase().replace(/\s+/g, '');
      navigate(`/profil/${handle}`);
    },
    [navigate]
  );
  const handleSearchSuggestionSelect = React.useCallback(
    (suggestion: SearchSuggestion) => {
      setSearchQuery(suggestion.label);
      if (suggestion.type === 'product') {
        openProductView(suggestion.id);
        return;
      }
      if (suggestion.handle) {
        openProfileByHandle(suggestion.handle);
        return;
      }
      const producerProduct = products.find((product) => product.producerId === suggestion.id);
      if (producerProduct) {
        openProducerProfile(producerProduct);
      }
    },
    [openProducerProfile, openProductView, openProfileByHandle, products]
  );
  const handleSearchProductOrders = React.useCallback(
    (product: Product) => {
      setSearchQuery(product.name);
    },
    [setSearchQuery]
  );
  const userLocation = React.useMemo(
    () =>
      viewer.addressLat !== undefined && viewer.addressLng !== undefined
        ? { lat: viewer.addressLat, lng: viewer.addressLng }
        : undefined,
    [viewer.addressLat, viewer.addressLng]
  );
  const userAddressQuery = React.useMemo(() => {
    const cityPart = [viewer.postcode, viewer.city]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    const addressParts = [viewer.address, viewer.addressDetails, cityPart]
      .map((value) => (value ?? '').trim())
      .filter(Boolean);
    return addressParts.length ? addressParts.join(', ') : undefined;
  }, [viewer.address, viewer.addressDetails, viewer.city, viewer.postcode]);
  const discoverLocationLabel = isGuestDiscover
    ? guestLocation
      ? 'Autour de vous'
      : 'Localisation requise'
    : locationLabel;
  const discoverOrders = React.useMemo(() => {
    if (!isGuestDiscover || !guestLocation) return publicOrdersWithFilters;
    return publicOrdersWithFilters.filter((order) => {
      if (!order.mapLocation) return false;
      const radiusMeters = order.mapLocation.radiusMeters;
      const distance = distanceMeters(guestLocation, order.mapLocation);
      return distance <= radiusMeters;
    });
  }, [guestLocation, isGuestDiscover, publicOrdersWithFilters]);
  const discoverProducts = React.useMemo(() => {
    if (!isGuestDiscover || !guestLocation) return filteredProductsWithFilters;
    const maxDistanceKm = 25;
    return filteredProductsWithFilters.filter((product) => {
      const distance = parseDistanceKm(product.producerLocation);
      return distance !== null && distance <= maxDistanceKm;
    });
  }, [filteredProductsWithFilters, guestLocation, isGuestDiscover]);
  const isDiscoverSwipeLocked = isGuestDiscover && guestLocationStatus !== 'granted';
  const canSaveProduct = isAuthenticated && viewer.role !== 'producer';
  const deckSelectionIds = React.useMemo(() => new Set(deck.map((card) => card.id)), [deck]);
  const renderProductGrid = () => {
    return (
      <ProductsLanding
        products={products}
        filteredProducts={filteredProducts}
        orders={groupOrders}
        filteredOrders={filteredMapOrders}
        canSaveProduct={canSaveProduct}
        deck={deck}
        supabaseClient={supabaseClient}
        onAddToDeck={handleAddToDeck}
        onRemoveFromDeck={handleRemoveFromDeck}
        onOpenProduct={openProductView}
        onOpenProducer={openProducerProfile}
        onOpenSharer={openSharerProfile}
        onOpenOrder={openOrderView}
        onStartOrderFromProduct={handleStartOrderFromProduct}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
        postcodeRadiusKm={postcodeRadiusKm}
        onPostcodeRadiusKmChange={setPostcodeRadiusKm}
        producerDistanceMetersById={producerDistanceMetersById}
      />
    );
  };

  const renderDeckContent = () => {
    return (
      <MapView
        orders={filteredMapOrdersWithFilters}
        deck={deck}
        supabaseClient={supabaseClient}
        onAddToDeck={handleAddToDeck}
        onRemoveFromDeck={handleRemoveFromDeck}
        onOpenProduct={openProductView}
        onOpenOrder={openOrderView}
        onOpenProducer={openProducerProfile}
        onOpenSharer={openSharerProfile}
        locationLabel={locationLabel}
        userRole={viewer.role}
        userLocation={userLocation}
        userAddress={userAddressQuery}
      />
    );
  };

  const renderCreateContent = () => {
    return (
      <ClientSwipeView
        products={discoverProducts}
        orders={discoverOrders}
        supabaseClient={supabaseClient}
        onSave={handleAddToDeck}
        onOpenProduct={openProductView}
        onOpenProducer={openProducerProfile}
        onOpenSharer={openSharerProfile}
        onRequestAuth={!isAuthenticated ? () => redirectToAuth(tabRoutes.create, 'login') : undefined}
        locationLabel={discoverLocationLabel}
        swipeLocked={isDiscoverSwipeLocked}
        locationStatus={isGuestDiscover ? guestLocationStatus : undefined}
        onRequestLocation={isGuestDiscover ? requestGuestLocation : undefined}
        onParticipateOrder={openOrderView}
      />
    );
  };

  const getPageTitle = () => {
    if (isAuthPage) return 'Connexion';
    if (location.pathname.startsWith('/commande/nouvelle')) return 'Nouvelle commande';
    if (location.pathname === '/produit/nouveau') return 'Nouveau produit';
    if (activeTab === 'deck') {
      if (viewer.role === 'producer') return 'Commandes en cours';
      return '';
    }
    if (activeTab === 'create') return 'Découvrez les produits proches de vous';
    if (activeTab === 'messages') return 'Messages';
    if (activeTab === 'profile') return '';
    if (location.pathname.startsWith('/produits/') || location.pathname.startsWith('/produit/')) {
      return selectedProduct?.name ?? 'Produit';
    }
    if (location.pathname.startsWith('/cmd/')) return 'Commande';
    return '';
  };

  const pageTitle = getPageTitle();
  const isOrderView = Boolean(selectedOrder && location.pathname.startsWith('/cmd/'));
  const isOrderFlowStep = /\/cmd\/[^/]+\/(recap|paiement|partage|close)/.test(location.pathname);
  const isProductView = Boolean(
    selectedProduct &&
      (location.pathname.startsWith('/produits/') || location.pathname.startsWith('/produit/'))
  );
  const isProfileView = location.pathname.startsWith('/profil');
  const profileShareSource = profileForShare || (isProfileView && user ? user : null);
  const activeProductShareContext = React.useMemo(() => {
    if (!selectedProduct || !productShareContext) return null;
    const selectedKey = selectedProduct.productCode ?? selectedProduct.id;
    const contextKey = productShareContext.product.productCode ?? productShareContext.product.id;
    return selectedKey === contextKey ? productShareContext : null;
  }, [productShareContext, selectedProduct]);

  const buildCurrentSharePayload = React.useCallback(() => {
    if (isOrderView && selectedOrder) return buildOrderSharePayload(selectedOrder);
    if (isProductView && selectedProduct) return buildProductSharePayload(selectedProduct, activeProductShareContext);
    if (isProfileView && profileShareSource) return buildProfileSharePayload(profileShareSource);
    return null;
  }, [
    activeProductShareContext,
    buildOrderSharePayload,
    buildProductSharePayload,
    buildProfileSharePayload,
    isOrderView,
    isProductView,
    isProfileView,
    profileShareSource,
    selectedOrder,
    selectedProduct,
  ]);
  const sharePayload = React.useMemo(() => {
    return buildCurrentSharePayload();
  }, [buildCurrentSharePayload]);
  const isOwnProfileView =
    isAuthenticated &&
    (location.pathname === '/profil' ||
      (!!user?.handle && location.pathname === `/profil/${user.handle}`));
  const isHome = activeTab === 'home';
  const mainPadding = activeTab === 'deck' || isAuthLayout ? 'pb-0' : 'pb-24';
  const shouldUseProfilePadding = hideAuthTitle;
  const mainPaddingTop =
    activeTab === 'deck'
      ? 0
      : isAuthLayout
        ? 64
        : isOrderView
          ? 96
          : isHome && !shouldUseProfilePadding
            ? 64
            : 80; // px values
  const mainPaddingBottom =
    isAuthLayout
      ? '0rem'
      : activeTab === 'deck'
        ? '0rem'
        : activeTab === 'create'
          ? '0rem'
          : isOrderView
            ? '12rem'
            : '10rem';
  const profileHeaderActions =
    activeTab === 'profile' && !isOrderView && isOwnProfileView ? (
      <div className="flex items-center gap-2">
        {profileMode === 'edit' ? (
          <button
            type="button"
            onClick={() => profileSaveHandlerRef.current?.()}
            className="header-action-button header-action-button--primary"
            disabled={!canSaveProfile}
          >
            <Check className="header-action-icon" />
            <span className="header-action-label">Enregistrer</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEditProfile}
            className="header-action-button header-action-button--primary"
          >
            <Pencil className="header-action-icon" />
            <span className="header-action-label">Modifier le profil</span>
          </button>
        )}
      </div>
    ) : null;
  const authButton = isAuthenticated && isOwnProfileView ? (
    <button
      onClick={handleLogout}
      className="header-action-button header-action-button--ghost"
    >
      <LogOut className="header-action-icon" />
      <span className="header-action-label">Déconnexion</span>
    </button>
  ) : null;
  const canShare = isOrderView ? Boolean(selectedOrder) : isProductView ? Boolean(selectedProduct) : isProfileView;

  const shareButton = canShare ? (
    (() => {
      const handleShareClick = () => {
        const fallbackLink = typeof window !== 'undefined' ? window.location.href : '';
        const payload = buildCurrentSharePayload() ?? {
          kind: 'generic' as const,
          link: fallbackLink,
          title: 'Partager cette page',
          subtitle: pageTitle || undefined,
        };
        openShareOverlay(payload);
      };
      return (
        <button
          type="button"
          onClick={handleShareClick}
          className="header-action-button header-action-button--ghost share-action-button"
        >
          <Share2 className="header-action-icon" />
          <span className="header-action-label">Partager</span>
        </button>
      );
    })()
  ) : null;

  const headerActions = (
    <>
      {shareButton}
      {isProductView ? productHeaderActions : null}
      {profileHeaderActions}
      {authButton}
    </>
  );

  const renderProtected = (factory: () => React.ReactNode, redirectPath: string) => {
    if (isAuthenticated) return factory();
    return (
      <AuthWall
        onLogin={() => redirectToAuth(redirectPath, 'login')}
        onSignup={() => redirectToAuth(redirectPath, 'signup')}
        description="Connectez-vous ou creez un compte pour acceder a cette page."
      />
    );
  };

  const OrdersSearchRoute = () => {
    const params = new URLSearchParams(location.search);
    const searchValue = (params.get('search') || '').toLowerCase().trim();
    const filteredOrders = groupOrders.filter((order) => {
      if (!searchValue) return true;
      const matchesTitle = order.title.toLowerCase().includes(searchValue);
      const matchesProduct = order.products.some((p) => p.name.toLowerCase().includes(searchValue));
      return matchesTitle || matchesProduct;
    });

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-[#F1E8D7] p-4">
          <p className="text-sm text-[#374151] font-semibold">Commandes contenant : {params.get('search') || 'Tous'}</p>
          <p className="text-xs text-[#6B7280]">
            URL recommandee /commandes?search=&filter=contientProduit - affichage des cartes commandes + partageur + date limite.
          </p>
        </div>
        {filteredOrders.length === 0 ? (
          <NotFound message="Aucune commande en cours pour ce produit." />
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-xl shadow-sm border border-[#F1E8D7] p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">{order.title}</p>
                  <p className="text-xs text-[#6B7280]">
                    Par {order.sharerName} à Producteur {order.producerName} �{' '}
                    {order.pickupCity || order.pickupPostcode || 'Ville a preciser'}
                  </p>
                </div>
                <button
                  onClick={() => openOrderView(order.id)}
                  className="text-xs px-3 py-2 rounded-lg bg-[#FF6B4A] text-white font-semibold"
                >
                  Participer
                </button>
              </div>
              <p className="text-xs text-[#6B7280]">
                Produits : {order.products.map((p) => p.name).join(', ')} - Date limite{' '}
                {(() => {
                  const deadlineValue = order.deadline as unknown as Date | string | undefined;
                  return deadlineValue instanceof Date ? deadlineValue.toLocaleDateString() : String(deadlineValue ?? '');
                })()}
              </p>
            </div>
          ))
        )}
      </div>
    );
  };

  const OrderRecapRedirect = () => {
    const params = useParams<{ orderCode: string }>();
    const orderCode = params.orderCode;
    if (!orderCode) return <Navigate to={tabRoutes.home} replace />;
    return <Navigate to={`/cmd/${orderCode}/paiement`} replace />;
  };

  const OrderPaymentRoute = () => {
    const params = useParams<{ orderCode: string }>();
    const order = groupOrders.find((o) => o.orderCode === params.orderCode || o.id === params.orderCode);
    const draft = order && purchaseDraft?.orderId === order.id ? purchaseDraft : null;
    const isClosePayment = draft?.kind === 'close';

    const [participantStatus, setParticipantStatus] = React.useState<string | null>(null);
    const [isParticipantLoading, setIsParticipantLoading] = React.useState(true);
    const [participantError, setParticipantError] = React.useState<string | null>(null);

    React.useEffect(() => {
      let isActive = true;
      if (isClosePayment) {
        setParticipantError(null);
        setParticipantStatus(null);
        setIsParticipantLoading(false);
        return () => {
          isActive = false;
        };
      }
      if (!order || !user?.id) {
        setParticipantError(order ? 'Utilisateur introuvable.' : null);
        setIsParticipantLoading(false);
        return () => {
          isActive = false;
        };
      }
      setIsParticipantLoading(true);
      setParticipantError(null);
      setParticipantStatus(null);
      getParticipantByProfile(order.id, user.id)
        .then((participant) => {
          if (!isActive) return;
          setParticipantStatus(participant?.participationStatus ?? null);
        })
        .catch((error) => {
          if (!isActive) return;
          const message =
            (error as Error)?.message ?? 'Impossible de recuperer le participant.';
          setParticipantError(message);
        })
        .finally(() => {
          if (!isActive) return;
          setIsParticipantLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [isClosePayment, order, user?.id]);

    if (!order) return <NotFound message="Commande introuvable." />;
    if (!isAuthenticated) {
      return (
        <AuthWall
          onLogin={() => redirectToAuth(location.pathname, 'login')}
          onSignup={() => redirectToAuth(location.pathname, 'signup')}
          description="Connectez-vous pour régler cette commande."
        />
      );
    }
    if (!draft) return <NotFound message="Aucun paiement en cours pour cette commande." />;

    if (!isClosePayment && participantError) {
      return <NotFound message={participantError} />;
    }
    if (!isClosePayment && isParticipantLoading) {
      return <div className="order-payment-view__loading">Chargement...</div>;
    }
    if (
      !isClosePayment &&
      participantStatus &&
      participantStatus !== 'accepted' &&
      !order.autoApproveParticipationRequests
    ) {
      return <NotFound message="Votre participation doit etre acceptee avant de payer." />;
    }
    if (!isClosePayment && !participantStatus && !order.autoApproveParticipationRequests) {
      return (
        <NotFound message="Votre participation doit etre acceptee avant de payer." />
      );
    }

    return (
      <OrderPaymentView
        order={order}
        draft={draft}
        onBack={() =>
          navigate(
            isClosePayment
              ? `/cmd/${order.orderCode ?? order.id}/close`
              : `/cmd/${order.orderCode ?? order.id}`
          )
        }
        onConfirmPayment={() =>
          isClosePayment ? handleConfirmClosePayment(draft) : handleConfirmPayment(draft)
        }
      />
    );
  };

  const OrderShareRoute = () => {
    const params = useParams<{ orderCode: string }>();
    const order = groupOrders.find((o) => o.orderCode === params.orderCode || o.id === params.orderCode);
    if (!order) return <NotFound message="Commande introuvable." />;
    if (!isAuthenticated) {
      return (
        <AuthWall
          onLogin={() => redirectToAuth(location.pathname, 'login')}
          onSignup={() => redirectToAuth(location.pathname, 'signup')}
          description="Connectez-vous pour partager votre participation."
        />
      );
    }
    const purchase = recentPurchase?.orderId === order.id ? recentPurchase : null;
    if (!purchase) return <NotFound message="Aucune participation recente pour cette commande." />;

    return (
      <OrderShareGainView
        order={order}
        purchase={purchase}
        onShare={() => openShareOverlay(buildOrderSharePayload(order))}
        onClose={closeOrderView}
      />
    );
  };

  const OrderCloseRoute = () => {
    return (
      <OrderCloseView
        currentUser={user}
        onStartClosePayment={(payload) => {
          const order = groupOrders.find((entry) => entry.id === payload.orderId);
          if (!order) {
            toast.error('Commande introuvable.');
            return;
          }
          handleStartClosePayment(order, {
            amountCents: payload.amountCents,
            useCoopBalance: payload.useCoopBalance,
            extraQuantities: payload.extraQuantities,
          });
        }}
      />
    );
  };

  const showProductSearch =
    (activeTab === 'home' || activeTab === 'deck' || activeTab === 'create') &&
    !isOrderView &&
    !isAuthPage &&
    !isOrderCreation &&
    !isAddProductView;
  const showProfileSearch = isProfileSearchTab && !isAuthPage && !isAddProductView;
  const searchPlaceholder = showProfileSearch
    ? 'Rechercher un participant, un partageur ou un producteur...'
    : 'Rechercher un produit ou un producteur...';
  const profileSearchSuggestions = React.useMemo<SearchSuggestion[]>(() => {
    if (!showProfileSearch || !isAuthenticated) return [];
    return profileSearchResults.map((profile) => {
      const subtitle = [profile.postcode, profile.city].filter(Boolean).join(' ') || `@${profile.handle}`;
      return {
        id: profile.id,
        type:
          profile.role === 'participant'
            ? 'participant'
            : profile.role === 'producer'
              ? 'producer'
              : 'sharer',
        label: profile.name,
        subtitle,
        handle: profile.handle,
      };
    });
  }, [isAuthenticated, profileSearchResults, showProfileSearch]);
  const searchSuggestions = showProfileSearch ? profileSearchSuggestions : productSearchSuggestions;
  const showSearch = showProductSearch || showProfileSearch;
  const canShowFilters = showSearch;
  const handleHeaderFiltersToggle = React.useCallback(() => {
    if (!canShowFilters) return;
    setFiltersOpen((prev) => !prev);
  }, [canShowFilters]);

  React.useEffect(() => {
    if (!showProfileSearch || !isAuthenticated) {
      setProfileSearchResults((prev) => (prev.length ? [] : prev));
      return;
    }
    const rawQuery = searchQuery.trim();
    const sanitizedQuery = rawQuery.replace(/[%_,]/g, '');
    const roleFilters = profileRoleFilters.length ? profileRoleFilters : ['participant', 'sharer', 'producer'];
    const normalizedRoleFilters = roleFilters.filter((role) =>
      role === 'participant' || role === 'sharer' || role === 'producer'
    );
    if (!sanitizedQuery || !supabaseClient || normalizedRoleFilters.length === 0) {
      setProfileSearchResults((prev) => (prev.length ? [] : prev));
      return;
    }

    let active = true;
    const timeoutId = setTimeout(() => {
      supabaseClient
        .from('profiles')
        .select('id, handle, name, role, city, postcode, producer_id')
        .in('role', normalizedRoleFilters)
        .eq('profile_visibility', 'public')
        .or(`name.ilike.%${sanitizedQuery}%,handle.ilike.%${sanitizedQuery}%`)
        .limit(6)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            console.warn('profiles search error', error);
            setProfileSearchResults([]);
            return;
          }
          const results = (data ?? [])
            .map((row): ProfileSearchResult | null => {
              const role =
                row.role === 'participant' || row.role === 'sharer' || row.role === 'producer'
                  ? (row.role as UserRole)
                  : null;
              if (!role || !row.handle) return null;
              return {
                id: row.id,
                handle: row.handle,
                name: row.name || row.handle,
                role,
                city: row.city ?? undefined,
                postcode: row.postcode ?? undefined,
                producerId: row.producer_id ?? null,
              };
            })
            .filter((row): row is ProfileSearchResult => row !== null);
          const filteredResults = filterProducerTags.length
            ? results.filter((row) => {
                if (row.role !== 'producer') return false;
                const tags = producerTagsMap[row.producerId ?? ''] ?? ['local'];
                return filterProducerTags.every((tag) => tags.includes(tag));
              })
            : results;
          setProfileSearchResults(filteredResults);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [filterProducerTags, isAuthenticated, profileRoleFilters, searchQuery, showProfileSearch, supabaseClient]);

  React.useEffect(() => {
    if (!canShowFilters) {
      setFiltersOpen(false);
    }
  }, [canShowFilters]);

  return (
    <div className="app-shell min-h-screen bg-[#F9F2E4]">
      <Toaster position="top-center" richColors offset={96} />
      <Header
        showSearch={showSearch}
        searchQuery={searchQuery}
        searchPlaceholder={searchPlaceholder}
        onSearch={setSearchQuery}
        suggestions={searchSuggestions}
        onSelectSuggestion={handleSearchSuggestionSelect}
        onLogoClick={() => changeTab('home')}
        actions={headerActions}
        filtersActive={filtersOpen}
        onToggleFilters={showSearch ? handleHeaderFiltersToggle : undefined}
        notificationsOpen={notificationsOpen}
        onToggleNotifications={() => setNotificationsOpen((prev) => !prev)}
        notificationsUnreadCount={notificationsUnreadCount}
      />

      <main
        className={`max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 ${mainPadding}`}
        style={{ paddingTop: `${mainPaddingTop}px`, paddingBottom: mainPaddingBottom }}
      >
        <FiltersPopover
          open={filtersOpen && canShowFilters && activeTab !== 'home'}
          onClose={() => setFiltersOpen(false)}
          scope={filterScope}
          onScopeChange={setFilterScope}
          categories={filterCategories}
          onToggleCategory={handleToggleCategory}
          producerFilters={filterProducerTags}
          onToggleProducer={handleToggleProducerTag}
          attributes={filterAttributes}
          onToggleAttribute={handleToggleAttribute}
          productOptions={productFilterOptions}
          producerOptions={producerFilterOptions}
          attributeOptions={attributeFilterOptions}
          profileOptions={profileRoleOptions}
          profileValues={profileRoleFilters}
          onToggleProfile={handleToggleProfileRole}
          mode={showProfileSearch ? 'profiles' : 'products'}
          distanceKm={postcodeRadiusKm}
          onDistanceKmChange={setPostcodeRadiusKm}
          minDistanceKm={1}
          maxDistanceKm={50}
        />
        <NotificationsPopover
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
        />
        {isOrderView && !isOrderFlowStep ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">Participez à la commande</h1>
            <p className="text-[#6B7280]"></p>
          </div>
        ) : isProductView && selectedProduct ? (
          <div className="mb-6">
          </div>
        ) : isAuthPage ? (
          hideAuthTitle ? null : (
            <div className="mb-6">
              <h1 className="text-[#1F2937]">{pageTitle}</h1>
            </div>
          )
        ) : isOrderCreation || isAddProductView ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">{pageTitle}</h1>
            <p className="text-[#6B7280]">
              {isOrderCreation
                ? 'Sélectionnez vos produits puis configurez la commande.'
                : 'Ajoutez un nouveau produit à votre profil producteur.'}
            </p>
          </div>
        ) : activeTab !== 'home' && activeTab !== 'deck' && activeTab !== 'profile' ? (
          <div className="mb-6" style={{ textAlign: activeTab === 'create' ? 'center' : undefined }}>
            <h1 className="text-[#1F2937]">{pageTitle}</h1>
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={renderProductGrid()} />
          <Route
            path="/connexion"
            element={
              isAuthenticated && !isRecoveryAuth ? (
                <Navigate to={tabRoutes.home} replace />
              ) : (
                <AuthPage
                  supabaseClient={supabaseClient}
                  onAuthSuccess={handleAuthSuccess}
                  onDemoLogin={handleDemoLogin}
                />
              )
            }
          />
          <Route path="/carte" element={renderDeckContent()} />
          <Route path="/decouvrir" element={renderCreateContent()} />
          <Route path="/comment-ca-fonctionne" element={<HowItWorksView />} />
          <Route path="/qui-sommes-nous" element={<AboutUsView />} />
          <Route path="/messages" element={renderProtected(() => <MessagesView />, tabRoutes.messages)} />
          <Route
            path="/commande/nouvelle"
            element={
              <CreateOrderForm
                products={orderBuilderSource}
                preselectedProductIds={orderBuilderSelection ?? undefined}
                user={user}
                producer={orderProducer}
                supabaseClient={supabaseClient}
                onCreateOrder={handleCreateOrder}
                onCancel={() => {
                  const target = orderBuilderSourceRef.current ?? tabRoutes.home;
                  resetOrderBuilder();
                  navigate(target);
                }}
              />
            }
          />
          <Route
            path="/profil"
            element={
              isAuthenticated ? (
                <ProfileRoute
                  user={user}
                  viewer={viewer}
                  products={products}
                  groupOrders={groupOrders}
                  userOrders={userOrders}
                  deck={deck}
                  deckSelectionIds={deckSelectionIds}
                  canSaveProduct={canSaveProduct}
                  profileMode={profileMode}
                  onProfileModeChange={setProfileMode}
                  followingProfiles={followingProfiles}
                  fetchProfileByHandle={fetchProfileByHandle}
                  setProfileForShare={setProfileForShare}
                  onUpdateUser={handleUpdateUser}
                  onRemoveFromDeck={handleRemoveFromDeck}
                  onAddToDeck={handleAddToDeck}
                  onOpenOrder={openOrderView}
                  onToggleFollow={handleToggleFollowProfile}
                  onMessageUser={handleMessageUser}
                  onStartOrderFromProduct={handleStartOrderFromProduct}
                  onAddProductClick={openAddProductForm}
                  onOpenProduct={openProductView}
                  supabaseClient={supabaseClient}
                  onAvatarUpdated={handleAvatarUpdated}
                  onRegisterSave={registerProfileSaveHandler}
                  forceOwn
                />
              ) : (
                <AuthPage
                  supabaseClient={supabaseClient}
                  onAuthSuccess={handleAuthSuccess}
                  onDemoLogin={handleDemoLogin}
                />
              )
            }
          />
          <Route
            path="/profil/:handle"
            element={
              <ProfileRoute
                user={user}
                viewer={viewer}
                products={products}
                groupOrders={groupOrders}
                userOrders={userOrders}
                deck={deck}
                deckSelectionIds={deckSelectionIds}
                canSaveProduct={canSaveProduct}
                profileMode={profileMode}
                onProfileModeChange={setProfileMode}
                followingProfiles={followingProfiles}
                fetchProfileByHandle={fetchProfileByHandle}
                setProfileForShare={setProfileForShare}
                onUpdateUser={handleUpdateUser}
                onRemoveFromDeck={handleRemoveFromDeck}
                onAddToDeck={handleAddToDeck}
                onOpenOrder={openOrderView}
                onToggleFollow={handleToggleFollowProfile}
                onMessageUser={handleMessageUser}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddProductClick={openAddProductForm}
                onOpenProduct={openProductView}
                supabaseClient={supabaseClient}
                onAvatarUpdated={handleAvatarUpdated}
                onRegisterSave={registerProfileSaveHandler}
              />
            }
          />
          <Route
            path="/produit/nouveau"
            element={renderProtected(
              () => (
                <AddProductForm
                  onAddProduct={handleAddProduct}
                  supabaseClient={supabaseClient}
                  currentUser={user}
                />
              ),
              '/produit/nouveau'
            )}
          />
          <Route
            path="/produits/:productSlug/lot/:lotCode/cmd/:orderCode"
            element={
              <ProductRouteView
                products={products}
                deck={deck}
                groupOrders={groupOrders}
                user={user}
                canSaveProduct={canSaveProduct}
                useDemoProducts={useDemoProducts}
                createdProductDetails={createdProductDetails}
                supabaseClient={supabaseClient}
                onHeaderActionsChange={setProductHeaderActions}
                onOpenProducer={openProducerProfile}
                onOpenRelatedProduct={openProductView}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddToDeck={handleAddToDeck}
                onRemoveFromDeck={handleRemoveFromDeck}
                onShareProduct={openProductShare}
                onShareContextChange={setProductShareContext}
                onSearchProductOrders={handleSearchProductOrders}
              />
            }
          />
          <Route
            path="/produits/:slugAndCode"
            element={
              <ProductRouteView
                products={products}
                deck={deck}
                groupOrders={groupOrders}
                user={user}
                canSaveProduct={canSaveProduct}
                useDemoProducts={useDemoProducts}
                createdProductDetails={createdProductDetails}
                supabaseClient={supabaseClient}
                onHeaderActionsChange={setProductHeaderActions}
                onOpenProducer={openProducerProfile}
                onOpenRelatedProduct={openProductView}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddToDeck={handleAddToDeck}
                onRemoveFromDeck={handleRemoveFromDeck}
                onShareProduct={openProductShare}
                onShareContextChange={setProductShareContext}
                onSearchProductOrders={handleSearchProductOrders}
              />
            }
          />
          <Route
            path="/produits/:slugAndCode/lot/:lotCode"
            element={
              <ProductRouteView
                products={products}
                deck={deck}
                groupOrders={groupOrders}
                user={user}
                canSaveProduct={canSaveProduct}
                useDemoProducts={useDemoProducts}
                createdProductDetails={createdProductDetails}
                supabaseClient={supabaseClient}
                onHeaderActionsChange={setProductHeaderActions}
                onOpenProducer={openProducerProfile}
                onOpenRelatedProduct={openProductView}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddToDeck={handleAddToDeck}
                onRemoveFromDeck={handleRemoveFromDeck}
                onShareProduct={openProductShare}
                onShareContextChange={setProductShareContext}
                onSearchProductOrders={handleSearchProductOrders}
              />
            }
          />
          <Route
            path="/produit/:id"
            element={
              <ProductRouteView
                products={products}
                deck={deck}
                groupOrders={groupOrders}
                user={user}
                canSaveProduct={canSaveProduct}
                useDemoProducts={useDemoProducts}
                createdProductDetails={createdProductDetails}
                supabaseClient={supabaseClient}
                onHeaderActionsChange={setProductHeaderActions}
                onOpenProducer={openProducerProfile}
                onOpenRelatedProduct={openProductView}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddToDeck={handleAddToDeck}
                onRemoveFromDeck={handleRemoveFromDeck}
                onShareProduct={openProductShare}
                onShareContextChange={setProductShareContext}
                onSearchProductOrders={handleSearchProductOrders}
              />
            }
          />
          <Route
            path="/cmd/:orderCode"
            element={
              <OrderRoute
                groupOrders={groupOrders}
                currentUser={user}
                onClose={closeOrderView}
                onOpenParticipantProfile={openSharerProfile}
                onStartPurchase={handleStartPurchase}
                supabaseClient={supabaseClient}
              />
            }
          />
          <Route
            path="/cmd/:orderCode/recap"
            element={<OrderRecapRedirect />}
          />
          <Route
            path="/cmd/:orderCode/paiement"
            element={<OrderPaymentRoute />}
          />
          <Route
            path="/cmd/:orderCode/partage"
            element={<OrderShareRoute />}
          />
          <Route
            path="/cmd/:orderCode/close"
            element={<OrderCloseRoute />}
          />
          <Route path="/commandes" element={<OrdersSearchRoute />} />
          <Route path="*" element={<Navigate to={tabRoutes.home} replace />} />
        </Routes>
      </main>

      <ShareOverlay
        open={shareOverlay.open}
        onClose={() => setShareOverlay((prev) => ({ ...prev, open: false, kind: 'generic' }))}
        kind={shareOverlay.kind}
        link={shareOverlay.link}
        title={shareOverlay.title}
        subtitle={shareOverlay.subtitle}
        description={shareOverlay.description}
        details={shareOverlay.details}
        orderData={shareOverlay.orderData}
        productData={shareOverlay.productData}
        profileData={shareOverlay.profileData}
        supabaseClient={supabaseClient}
      />
      <PostcodeOverlay
        open={postcodeOverlayOpen && isPostcodeOverlayAllowedRoute}
        initialValue={searchPostcode ?? ''}
        loading={postcodeSearch.status === 'loading'}
        error={postcodeOverlayError}
        onClose={handlePostcodeOverlayClose}
        onSubmit={handlePostcodeOverlaySubmit}
      />

      <Navigation activeTab={activeTab} onTabChange={changeTab} userRole={viewer.role} />
    </div>
  );
}








