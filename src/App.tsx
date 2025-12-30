import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { LogOut, Pencil, Share2 } from 'lucide-react';
import { Header, type SearchSuggestion } from './components/Header';
import { Navigation } from './components/Navigation';
import { CreateOrderForm } from './components/CreateOrderForm';
import { ProfileView } from './components/ProfileView';
import { MessagesView } from './components/MessagesView';
import { AddProductForm } from './components/AddProductForm';
import { ClientSwipeView } from './components/ClientSwipeView';
import { FiltersPopover } from './components/FiltersPopover';
import { NotificationsPopover } from './components/NotificationsPopover';
import { ProductsLanding } from './components/ProductsLanding';
import { HowItWorksView } from './components/HowItWorksView';
import { AboutUsView } from './components/AboutUsView';
import { MapView } from './components/MapView';
import { OrderClientView } from './components/OrderClientView';
import { OrderPaymentView } from './components/OrderPaymentView';
import { OrderShareGainView } from './components/OrderShareGainView';
import { AuthPage } from './components/AuthPage';
import { ShareOverlay } from './components/ShareOverlay';
import { mockProducts, mockUser, mockGroupOrders } from './data/mockData';
import { ProductDetailView } from './components/ProductDetailView';
import { buildDefaultProductDetail, mockProductDetails } from './data/mockProductDetails';
import { Product, DeckCard, User, GroupOrder, UserRole, LegalEntity, OrderPurchaseDraft } from './types';
import { getSupabaseClient } from './lib/supabaseClient';
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

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const slugify = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, '-');

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
  entity_type: string;
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

const mapLegalRowToEntity = (row: LegalEntityRow): LegalEntity => ({
  legalName: row.legal_name,
  siret: row.siret,
  vatNumber: row.vat_number ?? undefined,
  entityType: (row.entity_type as LegalEntity['entityType']) ?? 'company',
  deliveryLeadType: (row.delivery_lead_type as LegalEntity['deliveryLeadType']) ?? undefined,
  deliveryLeadDays: row.delivery_lead_days ?? undefined,
  deliveryFixedDay: (row.delivery_fixed_day as LegalEntity['deliveryFixedDay']) ?? undefined,
  chronofreshEnabled: row.chronofresh_enabled ?? undefined,
  chronofreshMinWeight: row.chronofresh_min_weight ?? undefined,
  chronofreshMaxWeight: row.chronofresh_max_weight ?? undefined,
  producerDeliveryEnabled: row.producer_delivery_enabled ?? undefined,
  producerDeliveryDays: row.producer_delivery_days ?? undefined,
  producerDeliveryMinWeight: row.producer_delivery_min_weight ?? undefined,
  producerDeliveryMaxWeight: row.producer_delivery_max_weight ?? undefined,
  producerPickupEnabled: row.producer_pickup_enabled ?? undefined,
  producerPickupDays: row.producer_pickup_days ?? undefined,
  producerPickupStartTime: row.producer_pickup_start_time ?? undefined,
  producerPickupEndTime: row.producer_pickup_end_time ?? undefined,
  producerPickupMinWeight: row.producer_pickup_min_weight ?? undefined,
  producerPickupMaxWeight: row.producer_pickup_max_weight ?? undefined,
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
  forceOwn?: boolean;
};

const ProfileRoute: React.FC<ProfileRouteProps> = ({
  user,
  viewer,
  products,
  groupOrders,
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

  const producerProductsForProfile = React.useMemo(() => {
    const byId = profileUser?.producerId
      ? products.filter((product) => product.producerId === profileUser.producerId)
      : [];
    if (byId.length) return byId;
    return products.filter((product) => product.producerName === profileUser?.name);
  }, [products, profileUser?.name, profileUser?.producerId]);

  const sharerOrdersForProfile = React.useMemo(
    () => groupOrders.filter((order) => order.sharerId === profileUser?.id),
    [groupOrders, profileUser?.id]
  );

  const producerOrdersForProfile = React.useMemo(() => {
    const byId = profileUser?.producerId
      ? groupOrders.filter((order) => order.producerId === profileUser.producerId)
      : [];
    if (byId.length) return byId;
    return groupOrders.filter((order) => order.producerName === profileUser?.name);
  }, [groupOrders, profileUser?.name, profileUser?.producerId]);

  const mergedOrdersForProfile = React.useMemo(() => {
    const source =
      profileUser?.role === 'producer'
        ? [...producerOrdersForProfile, ...sharerOrdersForProfile]
        : [...sharerOrdersForProfile];
    const unique = new Map<string, GroupOrder>();
    source.forEach((order) => {
      if (!unique.has(order.id)) unique.set(order.id, order);
    });
    return Array.from(unique.values());
  }, [producerOrdersForProfile, profileUser?.role, sharerOrdersForProfile]);

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
    />
  );
};

type ProductRouteViewProps = {
  products: Product[];
  deck: DeckCard[];
  groupOrders: GroupOrder[];
  user: User | null;
  canSaveProduct: boolean;
  onHeaderActionsChange: React.Dispatch<React.SetStateAction<React.ReactNode | null>>;
  onOpenProducer: (product: Product) => void;
  onOpenRelatedProduct: (productId: string) => void;
  onStartOrderFromProduct: (product: Product) => void;
  onAddToDeck: (product: Product) => void;
  onRemoveFromDeck: (productId: string) => void;
  onShareProduct: (product: Product) => void;
};

const ProductRouteView: React.FC<ProductRouteViewProps> = ({
  products,
  deck,
  groupOrders,
  user,
  canSaveProduct,
  onHeaderActionsChange,
  onOpenProducer,
  onOpenRelatedProduct,
  onStartOrderFromProduct,
  onAddToDeck,
  onRemoveFromDeck,
  onShareProduct,
}) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = React.useMemo(() => products.find((item) => item.id === params.id), [products, params.id]);
  const detail = React.useMemo(
    () => (product ? mockProductDetails[product.id] ?? buildDefaultProductDetail(product) : null),
    [product]
  );

  if (!product || !detail) {
    return <NotFound message="Produit introuvable." />;
  }

  const inDeck = deck.some((card) => card.id === product.id);
  const ordersForProduct = React.useMemo(
    () =>
      groupOrders.filter((order) =>
        order.products.some((item) => item.id === product.id || item.name === product.name)
      ),
    [groupOrders, product.id, product.name]
  );
  const isOwner = Boolean(user && (user.producerId === product.producerId || user.id === product.producerId));

  const handleParticipate = React.useCallback(() => {
    if (!ordersForProduct.length) {
      toast.info('Aucune commande active pour ce produit.');
    }
    const search = new URLSearchParams();
    search.set('search', product.name);
    search.set('filter', 'contientProduit');
    navigate(`/commandes?${search.toString()}`);
  }, [navigate, ordersForProduct.length, product.name]);

  const handleToggleSave = React.useCallback(
    (next: boolean) => {
      if (next) {
        onAddToDeck(product);
      } else {
        onRemoveFromDeck(product.id);
      }
    },
    [onAddToDeck, onRemoveFromDeck, product]
  );

  return (
    <ProductDetailView
      product={product}
      detail={detail}
      ordersWithProduct={ordersForProduct}
      isOwner={isOwner}
      isSaved={inDeck}
      catalog={products}
      onHeaderActionsChange={onHeaderActionsChange}
      onOpenProducer={onOpenProducer}
      onOpenRelatedProduct={onOpenRelatedProduct}
      onShare={() => onShareProduct(product)}
      onCreateOrder={() => onStartOrderFromProduct(product)}
      onParticipate={handleParticipate}
      onToggleSave={canSaveProduct ? handleToggleSave : undefined}
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
  const [products, setProducts] = React.useState<Product[]>(mockProducts);
  const [groupOrders, setGroupOrders] = React.useState<GroupOrder[]>(mockGroupOrders);
  const [deck, setDeck] = React.useState<DeckCard[]>([]);
  const [orderBuilderProducts, setOrderBuilderProducts] = React.useState<DeckCard[] | null>(null);
  const [orderBuilderSelection, setOrderBuilderSelection] = React.useState<string[] | null>(null);
  const [purchaseDraft, setPurchaseDraft] = React.useState<OrderPurchaseDraft | null>(null);
  const [recentPurchase, setRecentPurchase] = React.useState<OrderPurchaseDraft | null>(null);
  const [productHeaderActions, setProductHeaderActions] = React.useState<React.ReactNode | null>(null);
  const [shareOverlay, setShareOverlay] = React.useState<{
    open: boolean;
    link: string;
    title: string;
    subtitle?: string;
    description?: string;
    details?: { label: string; value: string }[];
  }>({ open: false, link: '', title: '' });
  const [profileForShare, setProfileForShare] = React.useState<User | null>(null);
  const [guestLocation, setGuestLocation] = React.useState<GeoPoint | null>(null);
  const [guestLocationStatus, setGuestLocationStatus] = React.useState<
    'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error'
  >('idle');
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
  const getAbsoluteLink = React.useCallback((path: string) => {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, []);
  const buildProductSharePayload = React.useCallback(
    (product: Product) => ({
      link: getAbsoluteLink(`/produit/${product.id}`),
      title: product.name,
      subtitle: `${product.producerName} - ${product.price.toFixed(2)} € / ${product.unit}`,
      description:
        'Scannez pour decouvrir tous les details du produit, son lieu de production et la repartition de la valeur.',
      details: [
        { label: 'Origine', value: product.producerLocation || 'Origine locale' },
        { label: 'Categorie', value: product.category },
        { label: 'Disponibilite', value: product.inStock ? 'Disponible' : 'Bientot disponible' },
      ],
    }),
    [getAbsoluteLink]
  );
  const buildOrderSharePayload = React.useCallback(
    (order: GroupOrder) => {
      const deadlineDate = order.deadline instanceof Date ? order.deadline : new Date(order.deadline);
      const pickup =
        order.pickupAddress ||
        [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
        'Lieu precis communique apres paiement';
      const productNames = order.products.slice(0, 3).map((p) => p.name).join(' | ');
      const suffix = order.products.length > 3 ? ' ...' : '';
      const lineup = productNames ? `${productNames}${suffix}` : `${order.products.length} produits`;
      return {
        link: getAbsoluteLink(`/commande/${order.id}`),
        title: `Commande groupee : ${order.title}`,
        subtitle: `Par ${order.sharerName} - ${order.products.length} produit${order.products.length > 1 ? 's' : ''}`,
        description: `Partagez cette commande groupee et invitez vos voisins a y participer. Scannez pour voir les produits (${lineup}) et les modalites de retrait.`,
        details: [
          { label: 'Organise par', value: order.sharerName },
          { label: 'Cloture', value: deadlineDate.toLocaleDateString('fr-FR') },
          { label: 'Retrait', value: pickup || 'Lieu partage apres paiement' },
        ],
      };
    },
    [getAbsoluteLink]
  );
  const buildProfileSharePayload = React.useCallback(
    (profile: User) => {
      const profileHandle = profile.handle ?? profile.name.toLowerCase().replace(/\s+/g, '');
      const zoneLabel = [profile.city, profile.postcode].filter(Boolean).join(' ') || profile.address || 'Zone locale';
      const profileTagline = profile.tagline ?? '';
      const subtitle = [profileTagline, zoneLabel].filter(Boolean).join(' - ') || zoneLabel;
      const profileRoleLabel =
        profile.role === 'producer' ? 'Producteur' : profile.role === 'sharer' ? 'Partageur' : 'Participant';
      return {
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
      };
    },
    [getAbsoluteLink]
  );
  const openShareOverlay = React.useCallback(
    (payload: { link: string; title: string; subtitle?: string; description?: string; details?: { label: string; value: string }[] }) => {
      console.log('openShareOverlay', payload);
      setShareOverlay({ open: true, ...payload });
    },
    []
  );
  const openProductShare = React.useCallback(
    (product: Product) => {
      openShareOverlay(buildProductSharePayload(product));
    },
    [buildProductSharePayload, openShareOverlay]
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [profileSearchResults, setProfileSearchResults] = React.useState<ProfileSearchResult[]>([]);
  const activeTab = React.useMemo(() => getTabFromPath(location.pathname), [location.pathname]);
  const isAuthPage = location.pathname.startsWith('/connexion');
  const isOrderCreation = location.pathname.startsWith('/commande/nouvelle');
  const isAddProductView = location.pathname === '/produit/nouveau';
  const isProfileSearchTab = activeTab === 'profile' || activeTab === 'messages';
  const [filterScope, setFilterScope] = React.useState<SearchScope>('combined');
  const [filterCategories, setFilterCategories] = React.useState<string[]>([]);
  const [filterProducerTags, setFilterProducerTags] = React.useState<string[]>([]);
  const [filterAttributes, setFilterAttributes] = React.useState<string[]>([]);
  const [profileRoleFilters, setProfileRoleFilters] = React.useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [profileMode, setProfileMode] = React.useState<'view' | 'edit'>('view');
  const [followingProfiles, setFollowingProfiles] = React.useState<Record<string, boolean>>({});
  const prevRoleRef = React.useRef<User['role'] | null>(null);
  const lastTabRef = React.useRef<string | null>(null);
  const orderBuilderSourceRef = React.useRef<string | null>(null);

  const orderIdFromPath = React.useMemo(() => {
    const match = location.pathname.match(/^\/commande\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);
  const productIdFromPath = React.useMemo(() => {
    const match = location.pathname.match(/^\/produit\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const fetchLegalEntity = React.useCallback(
    async (profileId: string): Promise<LegalEntityRow | null> => {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from('legal_entities')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) {
        console.warn('legal_entities fetch error', error);
        return null;
      }
      return (data as LegalEntityRow | null) ?? null;
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
        const legal = await fetchLegalEntity(existing.id);
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
          const legal = await fetchLegalEntity(authUser.id);
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
      const legal = await fetchLegalEntity((data as ProfileRow).id);
      return mapProfileRowToUser(data as ProfileRow, null, legal);
    },
    [fetchLegalEntity, supabaseClient]
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
  const orderBuilderSource = orderBuilderProducts ?? deck;
  const orderProducer = React.useMemo(() => {
    const sourceProducts = orderBuilderProducts ?? deck;
    const firstProducerId = sourceProducts[0]?.producerId;
    if (!firstProducerId) return null;
    if (profileForShare && profileForShare.producerId === firstProducerId) return profileForShare;
    if (user && user.producerId === firstProducerId) return user;
    return null;
  }, [deck, orderBuilderProducts, profileForShare, user]);

  const normalizedSearch = normalizeText(searchQuery.trim());
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
      if (!normalizedSearch) return true;
      const haystack = normalizeText(`${product.name} ${product.description} ${product.producerName}`);
      return haystack.includes(normalizedSearch);
    },
    [normalizedSearch]
  );

  const productSearchSuggestions = React.useMemo<SearchSuggestion[]>(() => {
    if (!normalizedSearch) return [];

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
        id: product.id,
        type: 'product' as const,
        label: product.name,
        subtitle: product.producerName,
      }));

    return [...producerMatches, ...productMatches];
  }, [matchesSearch, normalizedSearch, products]);

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

  const filteredProducts = React.useMemo(
    () => (normalizedSearch ? products.filter(matchesSearch) : products),
    [matchesSearch, normalizedSearch, products]
  );

  const filteredProductsWithFilters = React.useMemo(
    () => filteredProducts.filter(matchesProductFilters),
    [filteredProducts, matchesProductFilters]
  );

  const filteredMapOrders = React.useMemo(() => {
    if (!normalizedSearch) return groupOrders;

    return groupOrders
      .map((order) => {
        const matchingProducts = order.products.filter(matchesSearch);
        if (!matchingProducts.length) return null;
        return { ...order, products: matchingProducts };
      })
      .filter((order): order is GroupOrder => Boolean(order));
  }, [groupOrders, matchesSearch, normalizedSearch]);

  const filteredMapOrdersWithFilters = React.useMemo(
    () => filteredMapOrders.filter((order) => order.products.some(matchesProductFilters)),
    [filteredMapOrders, matchesProductFilters]
  );

  const currentProducerId =
    viewer.role === 'producer' ? viewer.producerId ?? 'current-user' : viewer.producerId ?? '';
  const selectedOrder = React.useMemo(
    () => (orderIdFromPath ? groupOrders.find((order) => order.id === orderIdFromPath) ?? null : null),
    [groupOrders, orderIdFromPath]
  );
  const selectedProduct = React.useMemo(
    () =>
      productIdFromPath ? products.find((product) => product.id === productIdFromPath) ?? null : null,
    [productIdFromPath, products]
  );
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
    navigate(`/commande/${orderId}`);
  };

  const openProductView = (productId: string) => {
    navigate(`/produit/${productId}`);
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

  const handleStartPurchase = (
    order: GroupOrder,
    payload: { quantities: Record<string, number>; total: number; weight: number }
  ) => {
    const total = Number(payload.total) || 0;
    const weight = Number(payload.weight) || 0;
    const draft: OrderPurchaseDraft = {
      orderId: order.id,
      quantities: payload.quantities,
      total,
      weight,
      baseOrderedWeight: order.orderedWeight ?? 0,
    };
    setPurchaseDraft(draft);
    setRecentPurchase(null);
    if (!isAuthenticated) {
      redirectToAuth(`/commande/${order.id}/paiement`);
      return;
    }
    navigate(`/commande/${order.id}/paiement`);
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

  const handleConfirmPayment = (draft: OrderPurchaseDraft) => {
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
    handlePurchaseOrder(draft.orderId, draft.total, draft.weight);
    setRecentPurchase(draft);
    setPurchaseDraft(null);
    navigate(`/commande/${draft.orderId}/partage`);
    toast.success('Paiement confirme (simulation).');
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
      estimatedDeliveryDate,
      pickupWindowWeeks,
      deadline: orderData.deadline ?? now,
      pickupStreet: orderData.pickupStreet,
      pickupCity: orderData.pickupCity,
      pickupPostcode: orderData.pickupPostcode,
      pickupAddress,
      pickupSlots: orderData.pickupSlots,
      message: orderData.message,
      status: 'open',
      visibility: orderData.visibility ?? 'public',
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

  const handleAddProduct = (productData: Omit<Product, 'id'>) => {
    if (!user) {
      toast.info('Connectez-vous pour ajouter un produit.');
      redirectToAuth(tabRoutes.create);
      return;
    }
    const newProduct: Product = {
      ...productData,
      id: `product-${Date.now()}`,
    };
    setProducts([newProduct, ...products]);
    toast.success('Produit ajoute avec succes !');
    setProfileMode('view');
    const targetProfilePath = user.handle ? `/profil/${user.handle}` : tabRoutes.profile;
    navigate(targetProfilePath);
  };

  const handleUpdateUser = async (userData: Partial<User>) => {
    if (!user) {
      redirectToAuth(tabRoutes.profile);
      return;
    }

    const normalizedRole = normalizeUserRole(userData.role ?? user.role);
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

      const payload = {
        name: userData.name ?? user.name,
        handle: nextHandle,
        role: normalizedRole,
        account_type: userData.accountType ?? user.accountType ?? 'individual',
        tagline: userData.tagline ?? user.tagline,
        website: userData.website ?? user.website,
        address: userData.address ?? user.address,
        address_details: nextAddressDetails || null,
        city: userData.city ?? user.city,
        postcode: userData.postcode ?? user.postcode,
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
      if ((payload.account_type ?? user.accountType) !== 'individual' && userData.legalEntity?.legalName && userData.legalEntity.siret) {
        const legalPayload = {
          profile_id: user.id,
          legal_name: userData.legalEntity.legalName,
          siret: userData.legalEntity.siret,
          vat_number: userData.legalEntity.vatNumber ?? null,
          entity_type: userData.legalEntity.entityType ?? 'company',
          delivery_lead_type: userData.legalEntity.deliveryLeadType ?? null,
          delivery_lead_days: userData.legalEntity.deliveryLeadDays ?? null,
          delivery_fixed_day: userData.legalEntity.deliveryFixedDay ?? null,
          chronofresh_enabled: userData.legalEntity.chronofreshEnabled ?? null,
          chronofresh_min_weight: userData.legalEntity.chronofreshMinWeight ?? null,
          chronofresh_max_weight: userData.legalEntity.chronofreshMaxWeight ?? null,
          producer_delivery_enabled: userData.legalEntity.producerDeliveryEnabled ?? null,
          producer_delivery_days:
            userData.legalEntity.producerDeliveryDays && userData.legalEntity.producerDeliveryDays.length > 0
              ? userData.legalEntity.producerDeliveryDays
              : null,
          producer_delivery_min_weight: userData.legalEntity.producerDeliveryMinWeight ?? null,
          producer_delivery_max_weight: userData.legalEntity.producerDeliveryMaxWeight ?? null,
          producer_pickup_enabled: userData.legalEntity.producerPickupEnabled ?? null,
          producer_pickup_days:
            userData.legalEntity.producerPickupDays && userData.legalEntity.producerPickupDays.length > 0
              ? userData.legalEntity.producerPickupDays
              : null,
          producer_pickup_start_time: userData.legalEntity.producerPickupStartTime ?? null,
          producer_pickup_end_time: userData.legalEntity.producerPickupEndTime ?? null,
          producer_pickup_min_weight: userData.legalEntity.producerPickupMinWeight ?? null,
          producer_pickup_max_weight: userData.legalEntity.producerPickupMaxWeight ?? null,
        };
      const { data: legalData, error: legalError } = await supabaseClient
        .from('legal_entities')
        .upsert(legalPayload, { onConflict: 'profile_id' })
        .select()
        .maybeSingle();
      if (legalError) {
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
    toast.success('Deconnexion reussie.');
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
  const userLocation = React.useMemo(
    () =>
      viewer.addressLat !== undefined && viewer.addressLng !== undefined
        ? { lat: viewer.addressLat, lng: viewer.addressLng }
        : undefined,
    [viewer.addressLat, viewer.addressLng]
  );
  const userAddressQuery = React.useMemo(() => {
    if (viewer.address?.trim()) return viewer.address;
    const cityQuery = [viewer.postcode, viewer.city].filter(Boolean).join(' ');
    return cityQuery || undefined;
  }, [viewer.address, viewer.city, viewer.postcode]);
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
        onAddToDeck={handleAddToDeck}
        onRemoveFromDeck={handleRemoveFromDeck}
        onOpenProduct={openProductView}
        onOpenProducer={openProducerProfile}
        onOpenSharer={openSharerProfile}
        onOpenOrder={openOrderView}
        onStartOrderFromProduct={handleStartOrderFromProduct}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
      />
    );
  };

  const renderDeckContent = () => {
    return (
      <MapView
        orders={filteredMapOrdersWithFilters}
        deck={deck}
        onAddToDeck={handleAddToDeck}
        onRemoveFromDeck={handleRemoveFromDeck}
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
    if (location.pathname.startsWith('/produit/')) return selectedProduct?.name ?? 'Produit';
    if (location.pathname.startsWith('/commande/')) return 'Commande';
    return '';
  };

  const pageTitle = getPageTitle();
  const isOrderView = Boolean(selectedOrder && location.pathname.startsWith('/commande/'));
  const isOrderFlowStep = /\/commande\/[^/]+\/(recap|paiement|partage)/.test(location.pathname);
  const isProductView = Boolean(selectedProduct && location.pathname.startsWith('/produit/'));
  const isProfileView = location.pathname.startsWith('/profil');
  const profileShareSource = profileForShare || (isProfileView && user ? user : null);
  const buildCurrentSharePayload = React.useCallback(() => {
    if (isOrderView && selectedOrder) return buildOrderSharePayload(selectedOrder);
    if (isProductView && selectedProduct) return buildProductSharePayload(selectedProduct);
    if (isProfileView && profileShareSource) return buildProfileSharePayload(profileShareSource);
    return null;
  }, [
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
  const mainPadding = activeTab === 'deck' ? 'pb-0' : 'pb-24';
  const shouldUseProfilePadding = hideAuthTitle;
  const mainPaddingTop =
    activeTab === 'deck' ? 0 : isOrderView ? 96 : isHome && !shouldUseProfilePadding ? 64 : 80; // px values
  const mainPaddingBottom = activeTab === 'deck' ? '0rem' : activeTab === 'create' ? '0rem' : isOrderView ? '12rem' : '10rem';
  const profileHeaderActions =
    activeTab === 'profile' && !isOrderView && isOwnProfileView ? (
      <div className="flex items-center gap-2">
        <button
          onClick={handleEditProfile}
          className="header-action-button header-action-button--primary"
        >
          <Pencil className="header-action-icon" />
          <span className="header-action-label">Modifier le profil</span>
        </button>
      </div>
    ) : null;
  const authButton = isAuthenticated && isOwnProfileView ? (
    <button
      onClick={handleLogout}
      className="header-action-button header-action-button--ghost"
    >
      <LogOut className="header-action-icon" />
      <span className="header-action-label">Deconnexion</span>
    </button>
  ) : null;
  const canShare = isOrderView ? Boolean(selectedOrder) : isProductView ? Boolean(selectedProduct) : isProfileView;

  const shareButton = canShare ? (
    (() => {
      const handleShareClick = () => {
        const fallbackLink = typeof window !== 'undefined' ? window.location.href : '';
        const payload = buildCurrentSharePayload() ?? {
          link: fallbackLink,
          title: 'Partager cette page',
          subtitle: pageTitle || undefined,
        };
        console.log('handleShareClick payload', payload);
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

  const OrderRoute = () => {
    const params = useParams<{ id: string }>();
    const order = groupOrders.find((o) => o.id === params.id);
    if (!order) return <NotFound message="Commande introuvable." />;
    const draftQuantities = purchaseDraft?.orderId === order.id ? purchaseDraft.quantities : undefined;

    return (
      <OrderClientView
        order={order}
        onClose={closeOrderView}
        onVisibilityChange={(visibility) => handleUpdateOrderVisibility(order.id, visibility)}
        onPurchase={(payload) => handleStartPurchase(order, payload)}
        initialQuantities={draftQuantities}
        isOwner={Boolean(user && order.sharerId === user.id)}
        onOpenParticipantProfile={openSharerProfile}
        isAuthenticated={isAuthenticated}
      />
    );
  };

  const OrderRecapRedirect = () => {
    const params = useParams<{ id: string }>();
    const orderId = params.id;
    if (!orderId) return <Navigate to={tabRoutes.home} replace />;
    return <Navigate to={`/commande/${orderId}/paiement`} replace />;
  };

  const OrderPaymentRoute = () => {
    const params = useParams<{ id: string }>();
    const order = groupOrders.find((o) => o.id === params.id);
    if (!order) return <NotFound message="Commande introuvable." />;
    if (!isAuthenticated) {
      return (
        <AuthWall
          onLogin={() => redirectToAuth(location.pathname, 'login')}
          onSignup={() => redirectToAuth(location.pathname, 'signup')}
          description="Connectez-vous pour regler cette commande."
        />
      );
    }
    const draft = purchaseDraft?.orderId === order.id ? purchaseDraft : null;
    if (!draft) return <NotFound message="Aucun paiement en cours pour cette commande." />;

    return (
      <OrderPaymentView
        order={order}
        draft={draft}
        onBack={() => navigate(`/commande/${order.id}`)}
        onConfirmPayment={() => handleConfirmPayment(draft)}
      />
    );
  };

  const OrderShareRoute = () => {
    const params = useParams<{ id: string }>();
    const order = groupOrders.find((o) => o.id === params.id);
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
            .map((row) => {
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
                city: row.city,
                postcode: row.postcode,
                producerId: row.producer_id ?? null,
              };
            })
            .filter((row): row is ProfileSearchResult => Boolean(row));
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
        />
        <NotificationsPopover
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          notifications={mockNotifications}
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
              />
            }
          />
          <Route
            path="/produit/nouveau"
            element={renderProtected(() => <AddProductForm onAddProduct={handleAddProduct} />, '/produit/nouveau')}
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
                onHeaderActionsChange={setProductHeaderActions}
                onOpenProducer={openProducerProfile}
                onOpenRelatedProduct={openProductView}
                onStartOrderFromProduct={handleStartOrderFromProduct}
                onAddToDeck={handleAddToDeck}
                onRemoveFromDeck={handleRemoveFromDeck}
                onShareProduct={openProductShare}
              />
            }
          />
          <Route
            path="/commande/:id"
            element={<OrderRoute />}
          />
          <Route
            path="/commande/:id/recap"
            element={<OrderRecapRedirect />}
          />
          <Route
            path="/commande/:id/paiement"
            element={<OrderPaymentRoute />}
          />
          <Route
            path="/commande/:id/partage"
            element={<OrderShareRoute />}
          />
          <Route path="/commandes" element={<OrdersSearchRoute />} />
          <Route path="*" element={<Navigate to={tabRoutes.home} replace />} />
        </Routes>
      </main>

      <ShareOverlay
        open={shareOverlay.open}
        onClose={() => setShareOverlay((prev) => ({ ...prev, open: false }))}
        link={shareOverlay.link}
        title={shareOverlay.title}
        subtitle={shareOverlay.subtitle}
        description={shareOverlay.description}
        details={shareOverlay.details}
      />

      <Navigation activeTab={activeTab} onTabChange={changeTab} userRole={viewer.role} />
    </div>
  );
}







