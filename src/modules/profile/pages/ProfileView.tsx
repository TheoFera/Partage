import React from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import {
  MapPin,
  Shield,
  Apple,
  CalendarDays,
  Heart,
  ShoppingBag,
  Plus,
  Check,
  Sparkles,
  Globe,
  Lock,
  Link2,
  Mail,
  Phone,
  X,
} from 'lucide-react';
import {
  DeckCard,
  DeliveryDay,
  DeliveryLeadType,
  GroupOrder,
  LegalEntity,
  ProducerLabelDetail,
  Product,
  User,
} from '../../../shared/types';
import {
  filterNotificationEmailPreferencesByRole,
  normalizeNotificationEmailPreferences,
} from '../../../shared/constants/notificationEmailPreferences';
import { Avatar } from '../../../shared/ui/Avatar';
import { AvatarUploader } from '../components/AvatarUploader';
import { LotsPlanningTab } from '../components/LotsPlanningTab';
import { ProductGroupContainer, ProductGroupDescriptor, ProductResultCard } from '../../products/components/ProductGroup';
import { toast } from 'sonner';
import {
  PRODUCER_LABELS_DESCRIPTION_COLUMN,
  PRODUCER_LABELS_TABLE,
  PRODUCER_LABELS_YEAR_COLUMN,
} from '../../../shared/constants/producerLabels';

type TabKey = 'products' | 'orders' | 'selection' | 'lots_planning';
type EditTabKey = 'general' | 'public' | 'notification' | 'structure' | 'sharer' | 'producer_settings';
type LegalDocumentType =
  | 'producer_mandat'
  | 'sharer_autofacturation';
type LegalDocumentStatus = 'draft' | 'uploaded' | 'pending_review' | 'approved' | 'rejected';
type StripeConnectionStatus = 'not_connected' | 'action_required' | 'connected';
type EdgeInvokeErrorLike = {
  context?: unknown;
  message?: string;
};

type LegalDocumentRow = {
  id: string;
  profile_id: string;
  legal_entity_id: string | null;
  doc_type: LegalDocumentType;
  status: LegalDocumentStatus;
  template_version: string;
  generated_pdf_path: string | null;
  signed_pdf_path: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_profile_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type StripeConnectionState = {
  status: StripeConnectionStatus;
  accountId: string | null;
  country: string | null;
  dueCount: number;
  lastSyncedAt: string | null;
  outstandingRequirements: string[];
  readyForOrders: boolean;
  transfersStatus: string | null;
  requirementsStatus: string | null;
  requirementsDisabledReason: string | null;
};

const LEGAL_DOCUMENT_TEMPLATE_VERSION = 'v1';
const PRODUCER_DOC_TYPES: LegalDocumentType[] = [
  'producer_mandat',
];

const isLegalDocumentType = (value: string): value is LegalDocumentType =>
  value === 'producer_mandat' ||
  value === 'sharer_autofacturation';

const getLegalDocumentStatusLabel = (status?: LegalDocumentStatus) => {
  if (!status || status === 'draft') return 'A faire';
  if (status === 'uploaded' || status === 'pending_review') return 'En attente';
  if (status === 'approved') return 'Validé';
  return 'Refusé';
};

const getLegalDocumentStatusClassName = (status?: LegalDocumentStatus) => {
  if (!status || status === 'draft') return 'bg-gray-100 text-[#6B7280]';
  if (status === 'uploaded' || status === 'pending_review') return 'bg-[#FFF7ED] text-[#B45309]';
  if (status === 'approved') return 'bg-[#E6F6F0] text-[#0F5132]';
  return 'bg-[#FEE2E2] text-[#B91C1C]';
};

const getStripeConnectionStatusLabel = (status: StripeConnectionStatus) => {
  if (status === 'connected') return 'Connecté';
  if (status === 'action_required') return 'Action requise';
  return 'Non connecté';
};

const getStripeConnectionStatusClassName = (status: StripeConnectionStatus) => {
  if (status === 'connected') return 'bg-[#E6F6F0] text-[#0F5132]';
  if (status === 'action_required') return 'bg-[#FFF7ED] text-[#B45309]';
  return 'bg-gray-100 text-[#6B7280]';
};

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const STRIPE_V2_API_VERSION = '2026-03-25.preview';

const extractEdgeInvokeErrorMessage = async (error: unknown, fallback: string) => {
  const maybeContext = (error as EdgeInvokeErrorLike | null)?.context;
  if (maybeContext instanceof Response) {
    try {
      const payload = (await maybeContext.clone().json()) as {
        error?: string;
        stripe_message?: string | null;
        details?: {
          error?: {
            message?: string;
          };
        };
      };
      const message = payload?.error ?? payload?.stripe_message ?? payload?.details?.error?.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    } catch {
      try {
        const text = await maybeContext.clone().text();
        if (text.trim()) return text.trim();
      } catch {
        // Ignore response parsing fallback failures.
      }
    }
  }

  const directMessage = (error as { message?: string } | null)?.message;
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage.trim();
  }
  return fallback;
};

const buildInitialStripeConnectionState = (legalEntity?: LegalEntity): StripeConnectionState => {
  const accountId = legalEntity?.stripeAccountId?.trim() || null;
  const onboardingComplete = Boolean(legalEntity?.stripeOnboardingComplete || legalEntity?.stripeReadyForOrders);
  return {
    status:
      legalEntity?.stripeConnectionStatus ??
      (accountId ? (onboardingComplete ? 'connected' : 'action_required') : 'not_connected'),
    accountId,
    country: legalEntity?.stripeAccountCountry?.trim() || legalEntity?.country?.trim() || 'FR',
    dueCount: legalEntity?.stripeRequirementsDueCount ?? 0,
    lastSyncedAt: legalEntity?.stripeLastSyncedAt ?? null,
    outstandingRequirements: legalEntity?.stripeRequirementsCurrentlyDue ?? [],
    readyForOrders: Boolean(legalEntity?.stripeReadyForOrders),
    transfersStatus: legalEntity?.stripeTransfersStatus ?? null,
    requirementsStatus: legalEntity?.stripeRequirementsStatus ?? null,
    requirementsDisabledReason: legalEntity?.stripeRequirementsDisabledReason ?? null,
  };
};

const normalizeStripeRequirementLabel = (value: string) =>
  value
    .split(".")
    .map((segment) => segment.replace(/_/g, " ").trim())
    .filter(Boolean)
    .join(" > ");

const isStripeCompatibleReturnUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    return parsed.hostname === 'localhost';
  } catch {
    return false;
  }
};

const getMissingStripePrefillFields = (params: {
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  legalEntity?: LegalEntity;
}) => {
  const legalEntity = params.legalEntity;
  const checks: Array<[boolean, string]> = [
    [Boolean(legalEntity?.legalName?.trim()), 'Raison sociale'],
    [Boolean(legalEntity?.siret?.trim()), 'SIRET'],
    [Boolean(params.email?.trim()), 'E-mail du compte'],
    [Boolean(params.phone?.trim()), 'Téléphone du profil'],
    [Boolean(params.address?.trim() && params.city?.trim() && params.postcode?.trim()), 'Adresse du profil'],
    [Boolean(legalEntity?.accountHolderName?.trim()), 'Titulaire du compte bancaire'],
    [Boolean(legalEntity?.iban?.trim()), 'IBAN à vérifier sur votre site avant Stripe'],
    [Boolean(legalEntity?.representativeFirstName?.trim()), 'Prénom du représentant légal'],
    [Boolean(legalEntity?.representativeLastName?.trim()), 'Nom du représentant légal'],
    [Boolean(legalEntity?.representativeBirthDate?.trim()), 'Date de naissance du représentant légal'],
    [Boolean(legalEntity?.representativeTitle?.trim()), 'Fonction du représentant légal'],
  ];
  return checks.filter(([isComplete]) => !isComplete).map(([, label]) => label);
};

const getSignedDocumentPath = (docType: LegalDocumentType, profileId: string, docId: string) => {
  if (docType === 'producer_mandat') {
    return `producers/${profileId}/mandat/${docId}.pdf`;
  }
  return `sharers/${profileId}/autofacturation/${docId}.pdf`;
};

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const deliveryDayOptions: Array<{ id: DeliveryDay; label: string }> = [
  { id: 'monday', label: 'Lundi' },
  { id: 'tuesday', label: 'Mardi' },
  { id: 'wednesday', label: 'Mercredi' },
  { id: 'thursday', label: 'Jeudi' },
  { id: 'friday', label: 'Vendredi' },
  { id: 'saturday', label: 'Samedi' },
  { id: 'sunday', label: 'Dimanche' },
];

const defaultLeafletIcon = L.icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultLeafletIcon;

const defaultDeliveryMapCenter = { lat: 46.2276, lng: 2.2137 };

const reduceDeliveryMapStacking = (map: L.Map) => {
  const container = map.getContainer();
  container.style.zIndex = '0';
  const panes = map.getPanes();
  Object.values(panes)
    .filter((pane): pane is HTMLElement => Boolean(pane))
    .forEach((pane) => {
      pane.style.zIndex = '5';
    });
  const controlSelectors = ['.leaflet-top', '.leaflet-bottom', '.leaflet-control'];
  controlSelectors.forEach((selector) => {
    container.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.zIndex = '10';
    });
  });
};

const scheduleLeafletInvalidate = (map: L.Map) => {
  const frames = [0, 1, 2].map(() =>
    window.requestAnimationFrame(() => {
      map.invalidateSize(false);
    })
  );
  return () => {
    frames.forEach((frame) => window.cancelAnimationFrame(frame));
  };
};

const stripDistanceFromLocation = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/\s*[-–—]?\s*\d+(?:[.,]\d+)?\s*km/gi, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
};

const extractPostcodeFromLocation = (value?: string) => {
  if (!value) return undefined;
  const match = value.match(/\b(75\d{3}|\d{5})\b/);
  return match ? match[1] : undefined;
};

const formatParisArrondissementLabel = (postcode?: string | null) => {
  if (!postcode) return null;
  const match = `${postcode}`.match(/75(\d{3})/);
  if (!match) return null;
  const arrondissement = parseInt(match[1].slice(-2), 10);
  if (!Number.isFinite(arrondissement) || arrondissement < 1 || arrondissement > 20) return null;
  return arrondissement === 1 ? 'Paris 1er' : `Paris ${arrondissement}e`;
};

const extractCityFromAddressLike = (value?: string) => {
  if (!value) return '';
  const stripped = stripDistanceFromLocation(value);
  const parts = stripped
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const lastPart = parts.length ? parts[parts.length - 1] : stripped;
  const postcodeCity = lastPart.match(/\b\d{4,5}\s+(.+)/);
  if (postcodeCity) return postcodeCity[1].trim();
  return lastPart.replace(/\b\d{4,5}\b/g, '').trim();
};

const formatProfileOrderLocation = (city?: string | null, postcode?: string | null, fallback?: string) => {
  const normalizedCity = city?.trim();
  const fallbackPostcode = extractPostcodeFromLocation(fallback);
  const parisLabel = formatParisArrondissementLabel(postcode ?? fallbackPostcode);
  if (parisLabel && (!normalizedCity || normalizedCity.toLowerCase() === 'paris')) {
    return parisLabel;
  }
  if (normalizedCity) return normalizedCity;
  const coarseCity = extractCityFromAddressLike(fallback);
  return coarseCity || 'Proche de vous';
};

type OpeningHourSlot = { start: string; end: string };

const findDeliveryDayOption = (day: string) => {
  const normalized = day.trim().toLowerCase();
  if (!normalized) return null;
  const index = deliveryDayOptions.findIndex(
    (option) => option.id === normalized || option.label.toLowerCase() === normalized
  );
  if (index === -1) return null;
  return { option: deliveryDayOptions[index], index };
};

const normalizeOpeningHoursDayKey = (day: string) => findDeliveryDayOption(day)?.option.id;

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

const createEmptyOpeningHoursSlots = (): Record<DeliveryDay, OpeningHourSlot> =>
  deliveryDayOptions.reduce((acc, option) => {
    acc[option.id] = { start: '', end: '' };
    return acc;
  }, {} as Record<DeliveryDay, OpeningHourSlot>);

const producerCategoryOptions: Array<{ id: string; label: string }> = [
  { id: 'eleveur', label: 'Eleveur' },
  { id: 'maraicher', label: 'Maraicher' },
  { id: 'arboriculteur', label: 'Arboriculteur' },
  { id: 'cerealier', label: 'Céréalier' },
  { id: 'producteur_laitier_fromager', label: 'Producteur laitier / fromager' },
  { id: 'apiculteur', label: 'Apiculteur' },
  { id: 'viticulteur_cidriculteur_brasseur', label: 'Viticulteur / Cidriculteur / Brasseur' },
  { id: 'pisciculteur_conchyliculteur', label: 'Pisciculteur / Conchyliculteur' },
  { id: 'autre', label: 'Autre' },
];

const sharerCharterSections = [
  {
    title: 'Je suis fiable',
    items: [
      {
        id: 'deadlines',
        label: "Je respecte les délais annoncés et j’informe rapidement en cas d’imprévu.",
      },
      {
        id: 'communication',
        label: "Je communique clairement les dates, lieux et consignes aux participants.",
      },
    ],
  },
  {
    title: 'Je transporte avec soin',
    items: [
      {
        id: 'collection',
        label: "Je récupère la commande auprès du producteur et je la redistribue.",
      },
      {
        id: 'conservation',
        label: "Je respecte la chaîne du froid et les conditions de conservation.",
      },
    ],
  },
  {
    title: 'Je respecte les règles',
    items: [
      {
        id: 'pricing',
        label: "Je respecte les prix convenus et je ne revends pas.",
      },
      {
        id: 'respect',
        label: "Je reste clair, courtois et fiable à chaque étape.",
      },
    ],
  },
];

const sharerCharterItems = sharerCharterSections.flatMap((section) => section.items);
const DEFAULT_PROFILE_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="80" fill="#E5E7EB" />
      <circle cx="80" cy="64" r="30" fill="#9CA3AF" />
      <ellipse cx="80" cy="118" rx="42" ry="32" fill="#6B7280" />
    </svg>`
  );
const AVATAR_LIGHTBOX_TRANSITION_MS = 220;

interface ProfileViewProps {
  user: User;
  producerProducts: Product[];
  deck: DeckCard[];
  orders: GroupOrder[];
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  onMessageUser?: () => void;
  mode?: 'view' | 'edit';
  onModeChange?: (mode: 'view' | 'edit') => void;
  onUpdateUser: (user: Partial<User>) => void;
  onRemoveFromDeck: (productId: string) => void;
  onAddToDeck?: (product: Product) => void;
  selectionIds?: Set<string>;
  onOpenOrder?: (orderId: string) => void;
  onStartOrderFromProduct?: (product: Product) => void;
  onAddProductClick?: () => void;
  onOpenProduct?: (productId: string) => void;
  onRefreshProducts?: () => Promise<void> | void;
  supabaseClient?: SupabaseClient | null;
  onAvatarUpdated?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
  onRegisterSave?: (handler: (() => void) | null) => void;
}

export function ProfileView({
  user,
  producerProducts,
  deck,
  orders,
  isOwnProfile = true,
  isFollowing,
  onToggleFollow,
  onMessageUser,
  mode: modeProp,
  onModeChange,
  onUpdateUser,
  onRemoveFromDeck,
  onAddToDeck,
  selectionIds,
  onOpenOrder,
  onStartOrderFromProduct,
  onAddProductClick,
  onOpenProduct,
  onRefreshProducts,
  supabaseClient,
  onAvatarUpdated,
  onRegisterSave,
}: ProfileViewProps) {
  const [internalMode, setInternalMode] = React.useState<'view' | 'edit'>('view');
  const mode = modeProp ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const [activeTab, setActiveTab] = React.useState<TabKey>('orders');
  const [preferredEditTab, setPreferredEditTab] = React.useState<EditTabKey | null>(null);
  const [stripePromptDismissed, setStripePromptDismissed] = React.useState(false);
  const profileHandle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, '');
  const profileVisibility = user.profileVisibility ?? 'public';
  const addressVisibility = user.addressVisibility ?? 'private';
  const isProfilePublic = profileVisibility === 'public';
  const canShowAddress = addressVisibility === 'public';
  const postalCityLabel = [user.postcode, user.city].filter(Boolean).join(' ');
  const addressLine = canShowAddress
    ? [user.address || 'Adresse non renseignée', postalCityLabel].filter(Boolean).join(' - ')
    : postalCityLabel;
  const shouldShowAddressLine = Boolean(addressLine);
  const profileTagline = user.tagline ?? '';
  const accountTypeLabel =
    user.accountType === 'auto_entrepreneur'
      ? 'Auto-entreprise'
      : user.accountType === 'company'
      ? 'Entreprise'
      : user.accountType === 'association'
      ? 'Association'
      : user.accountType === 'public_institution'
      ? 'Collectivité / service public'
      : 'Particulier';
  const effectiveAccountType = user.accountType ?? 'individual';
  const isProducerProfile =
    user.role === 'producer' &&
    effectiveAccountType !== 'individual' &&
    effectiveAccountType !== 'auto_entrepreneur';
  const following = Boolean(isFollowing);
  const avatarFallbackSrc = user.profileImage?.trim() || DEFAULT_PROFILE_AVATAR;
  const avatarVersion = user.avatarUpdatedAt ?? user.updatedAt ?? undefined;
  const [avatarLightboxOpen, setAvatarLightboxOpen] = React.useState(false);
  const profileStripeMissingFields = React.useMemo(
    () =>
      getMissingStripePrefillFields({
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        postcode: user.postcode,
        legalEntity: user.legalEntity,
      }),
    [user.address, user.city, user.email, user.legalEntity, user.phone, user.postcode]
  );
  const profileStripeStatus =
    user.legalEntity?.stripeConnectionStatus ??
    (user.legalEntity?.stripeReadyForOrders ? 'connected' : user.legalEntity?.stripeAccountId ? 'action_required' : 'not_connected');
  const stripePromptNeeded =
    isOwnProfile &&
    isProducerProfile &&
    (profileStripeMissingFields.length > 0 || !user.legalEntity?.stripeReadyForOrders);
  const showStripePrompt = mode === 'view' && stripePromptNeeded && !stripePromptDismissed;

  const handleFollowClick = React.useCallback(() => {
    if (!onToggleFollow) {
      toast.info('Fonction de suivi bientôt disponible.');
      return;
    }
    onToggleFollow();
  }, [onToggleFollow]);

  const handleMessageClick = React.useCallback(() => {
    if (onMessageUser) {
      onMessageUser();
    } else {
      toast.info('La messagerie arrive bientôt.');
    }
  }, [onMessageUser]);

  React.useEffect(() => {
    if (stripePromptNeeded) return;
    setStripePromptDismissed(false);
  }, [stripePromptNeeded]);

  const handleOpenStripeStructure = React.useCallback(() => {
    setPreferredEditTab('structure');
    setStripePromptDismissed(true);
    setMode('edit');
  }, [setMode]);

const buildProfileHandle = React.useCallback((value?: string | null) => {
  return value ? value.toLowerCase().replace(/\s+/g, '') : '';
}, []);

const orderSharerIds = React.useMemo(() => {
  const ids = new Set<string>();
  const visible = isOwnProfile ? orders : orders.filter((order) => order.visibility === 'public');
  visible.forEach((order) => {
    const sharerId = (order as any).sharerId ?? (order as any).sharerProfileId;
    if (typeof sharerId === 'string' && sharerId.trim()) ids.add(sharerId);
  });
  return Array.from(ids);
}, [orders, isOwnProfile]);

const [profileMetaById, setProfileMetaById] = React.useState<
  Record<string, { path: string | null; updatedAt: string | null; handle?: string | null }>
>({});

React.useEffect(() => {
  let active = true;

  if (!supabaseClient || orderSharerIds.length === 0) {
    setProfileMetaById({});
    return () => {
      active = false;
    };
  }

  (async () => {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, handle, avatar_path, avatar_updated_at')
      .in('id', orderSharerIds);

    if (!active) return;

    if (error) {
      console.warn('[ProfileView] fetch profile meta error', error);
      setProfileMetaById({});
      return;
    }

    const mapped: Record<string, { path: string | null; updatedAt: string | null; handle?: string | null }> = {};
    (data as Array<Record<string, unknown>> | null)?.forEach((row) => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) return;
      mapped[id] = {
        path: (row.avatar_path as string | null) ?? null,
        updatedAt: (row.avatar_updated_at as string | null) ?? null,
        handle: (row.handle as string | null) ?? null,
      };
    });

    setProfileMetaById(mapped);
  })();

  return () => {
    active = false;
  };
}, [orderSharerIds, supabaseClient]);

  const orderGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    const mergedMap = new Map<string, GroupOrder>();
    const visible = isOwnProfile ? orders : orders.filter((order) => order.visibility === 'public');
    visible.forEach((order) => {
      if (!mergedMap.has(order.id)) mergedMap.set(order.id, order);
    });

    return Array.from(mergedMap.values()).map((order) => {
      const deadlineDate = order.deadline instanceof Date ? order.deadline : new Date(order.deadline);
      const sortedProducts = [...order.products].sort((a, b) => a.name.localeCompare(b.name));
      const locationFallback =
        order.pickupAddress ||
        order.mapLocation?.areaLabel ||
        sortedProducts[0]?.producerLocation ||
        order.producerName ||
        order.sharerName ||
        '';
      const location = formatProfileOrderLocation(order.pickupCity, order.pickupPostcode, locationFallback);
      const locationWithPostcode = order.pickupPostcode ? `${location} ${order.pickupPostcode}` : location;
      const sharerId = (order as any).sharerId ?? (order as any).sharerProfileId ?? '';
      const meta = sharerId ? profileMetaById[sharerId] : undefined;
      const handleFromDb = (meta?.handle ?? '').trim();
      const fallbackHandle = buildProfileHandle(order.sharerName || order.producerName || '');
      const resolvedHandle = handleFromDb || fallbackHandle;
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title,
          location: locationWithPostcode,
          tags: [],
          products: sortedProducts,
          variant: 'order',
          status: order.status,
          statusUpdatedAt: order.statusUpdatedAt,
          sharerName: order.sharerName || order.producerName,
          sharerPercentage: order.sharerPercentage,
          minWeight: order.minWeight,
          maxWeight: order.maxWeight,
          orderedWeight: order.orderedWeight,
          deliveryFeeCents: order.deliveryFeeCents,
          deadline: deadlineDate,
          profileHandle: resolvedHandle || undefined,
          avatarPath: meta?.path ?? null,
          avatarUpdatedAt: meta?.updatedAt ?? null,
          avatarUrl: sortedProducts[0]?.imageUrl,
        };
    });
  }, [orders, isOwnProfile, profileMetaById]);

  const productCount = producerProducts.length;
  const ordersCount = orderGroups.length;
  const selectionCount = deck.length;

  const tabCounts: Record<TabKey, { value: number; meta: string }> = {
    products: { value: productCount, meta: '' },
    orders: { value: ordersCount, meta: '' },
    selection: { value: selectionCount, meta: '' },
    lots_planning: { value: productCount, meta: '' },
  };

  const tabOptions = React.useMemo(
    () =>
      [
        {
          id: 'products' as TabKey,
          label: 'Produits',
          icon: Apple,
          visible: isProducerProfile && (isOwnProfile || productCount > 0),
        },
        {
          id: 'lots_planning' as TabKey,
          label: 'Planning des lots',
          icon: CalendarDays,
          visible: isOwnProfile && isProducerProfile,
        },
        {
          id: 'orders' as TabKey,
          label: 'Commandes',
          icon: ShoppingBag,
          visible: isOwnProfile || ordersCount > 0,
        },
        {
          id: 'selection' as TabKey,
          label: 'Sélection',
          icon: Heart,
          visible: isOwnProfile || selectionCount > 0,
        },
      ].filter((tab) => tab.visible),
    [isProducerProfile, isOwnProfile, productCount, ordersCount, selectionCount]
  );

  React.useEffect(() => {
    const firstVisible = tabOptions[0]?.id;
    if (!tabOptions.find((tab) => tab.id === activeTab) && firstVisible) {
      setActiveTab(firstVisible);
    }
  }, [tabOptions, activeTab]);

  const selectionSet = React.useMemo(() => selectionIds ?? new Set(deck.map((card) => card.id)), [deck, selectionIds]);
  const handleToggleSelection = React.useCallback(
    (product: Product, isSelected?: boolean) => {
      const alreadySelected = typeof isSelected === 'boolean' ? isSelected : selectionSet.has(product.id);
      if (alreadySelected) {
        onRemoveFromDeck(product.id);
        return;
      }
      if (onAddToDeck) {
        onAddToDeck(product);
      }
    },
    [onAddToDeck, onRemoveFromDeck, selectionSet]
  );
  const handleOpenProduct = React.useCallback(
    (productId: string) => {
      if (onOpenProduct) {
        onOpenProduct(productId);
      }
    },
    [onOpenProduct]
  );

  if (mode === 'edit') {
    return (
      <ProfileEditPanel
        user={user}
        onUpdateUser={onUpdateUser}
        onClose={() => {
          setPreferredEditTab(null);
          setMode('view');
        }}
        supabaseClient={supabaseClient ?? null}
        onAvatarUpdated={onAvatarUpdated}
        onRegisterSave={onRegisterSave}
        initialEditTab={preferredEditTab ?? undefined}
      />
    );
  }

  const tabStats = tabOptions.map((tab) => ({
    ...tab,
    value: tabCounts[tab.id]?.value ?? 0,
    meta: tabCounts[tab.id]?.meta ?? tab.label,
  }));
  const showAddProductCta = isOwnProfile && isProducerProfile && Boolean(onAddProductClick);
  const selectionActionsEnabled = Boolean(onAddToDeck || onRemoveFromDeck);
  const canSaveProducts = selectionActionsEnabled;
  const canEditSelection = selectionActionsEnabled;
  const addProductCard = showAddProductCta ? (
    <button type="button" onClick={onAddProductClick} className="profile-add-product-card">
      <span className="profile-add-product-card__icon">
        <Plus className="profile-add-product-card__icon-svg" />
      </span>
      <span className="profile-add-product-card__title">Ajouter un produit</span>
    </button>
  ) : null;

  const renderTabContent = () => {
    const activeTabIsVisible = tabOptions.some((tab) => tab.id === activeTab);
    if (!activeTabIsVisible) {
      return (
        <EmptyState
          title="Aucun contenu"
          subtitle="Ce profil n'a pas encore d'onglet public disponible."
        />
      );
    }

    if (activeTab === 'products') {
      if (producerProducts.length || addProductCard) {
        return (
          <div className="space-y-4">
            <div className="profile-product-grid">
              {producerProducts.map((product) => (
                <ProductResultCard
                  key={product.id}
                  product={product}
                  related={[]}
                  canSave={canSaveProducts}
                  inDeck={selectionSet.has(product.id)}
                  onSave={onAddToDeck}
                  onRemove={onRemoveFromDeck}
                  onToggleSelection={selectionActionsEnabled ? handleToggleSelection : undefined}
                  onCreateOrder={onStartOrderFromProduct}
                  onOpen={handleOpenProduct}
                  showSelectionControl={selectionActionsEnabled}
                />
              ))}
              {addProductCard}
            </div>
            {producerProducts.length ? null : (
              <EmptyState
                title="Aucun produit"
                subtitle="Ajoutez un produit pour afficher votre vitrine."
              />
            )}
          </div>
        );
      }

      return (
        <EmptyState
          title="Aucun produit"
          subtitle="Ajoutez un produit pour afficher votre vitrine."
        />
      );
    }

    if (activeTab === 'orders') {
      return orderGroups.length ? (
        <div className="profile-group-list">
          {orderGroups.map((group) => (
            <div key={`order-${group.id}`} className="profile-group-item">
              <ProductGroupContainer
                group={group}
                supabaseClient={supabaseClient ?? null}
                canSave={canSaveProducts}
                deckIds={selectionSet}
                onSave={onAddToDeck}
                onRemoveFromDeck={onRemoveFromDeck}
                onToggleSelection={selectionActionsEnabled ? handleToggleSelection : undefined}
                onOpenProduct={handleOpenProduct}
                onOpenOrder={onOpenOrder}
                orderActionLabel="Consulter"
                showSelectionControl={selectionActionsEnabled}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucune commande"
          subtitle={
            isOwnProfile
              ? "Participez ou creez une commande pour que cet onglet ne soit pas vide. Cet onglet affiche aussi l'historique de vos commandes."
              : 'Aucune commande visible.'
          }
        />
      );
    }

    if (activeTab === 'selection') {
      return deck.length ? (
        <div className="space-y-4">
          <div className="profile-product-grid">
            {deck.map((card) => (
              <ProductResultCard
                key={card.id}
                product={card}
                related={[]}
                canSave={canEditSelection}
                inDeck={selectionSet.has(card.id)}
                onSave={onAddToDeck}
                onRemove={onRemoveFromDeck}
                onToggleSelection={selectionActionsEnabled ? handleToggleSelection : undefined}
                onCreateOrder={onStartOrderFromProduct}
                onOpen={handleOpenProduct}
                showSelectionControl={selectionActionsEnabled}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState
            title="Aucune sélection"
            subtitle="Sauvegardez un produit depuis les produits ou le swipe pour le retrouver ici."
          />
        </div>
      );
    }

    if (activeTab === 'lots_planning') {
      return (
        <LotsPlanningTab
          products={producerProducts}
          supabaseClient={supabaseClient ?? null}
          onAddProductClick={onAddProductClick}
          onOpenProduct={handleOpenProduct}
          onRefreshProducts={onRefreshProducts}
        />
      );
    }

    return null;
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-16">
      <div className="bg-white text-[#1F2937] rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border border-gray-100 relative space-y-4">
        <div className="relative flex flex-col gap-6">
          <div className="profile-header-main flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:text-left">
              <ProfileAvatarPreview
                supabaseClient={supabaseClient ?? null}
                path={user.avatarPath}
                updatedAt={avatarVersion}
                fallbackSrc={avatarFallbackSrc}
                alt={user.name}
                className="profile-avatar w-24 h-24 md:w-28 md:h-28 rounded-full ring-4 ring-[#FFE8D7] shadow-lg overflow-hidden bg-gradient-to-br from-[#FF6B4A] to-[#FFD166]"
                onOpen={() => setAvatarLightboxOpen(true)}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 md:justify-start">
                  <h2 className="text-2xl md:text-3xl font-semibold">{user.name}</h2>
                </div>
                <p className="text-sm text-[#6B7280]">@{profileHandle}</p>
                <div className="profile-header-badges flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  <span className="px-3 py-1 rounded-full bg-[#FFF1E6] border border-[#FFE0D1] text-xs text-[#B45309]">
                    {user.role === 'producer' ? 'Producteur' : user.role === 'sharer' ? 'Partageur' : 'Participant'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#E0F2FE] border border-[#BFDBFE] text-xs text-[#1D4ED8]">
                    {accountTypeLabel}
                  </span>
                  {user.verified && (
                    <span className="profile-verified-badge">
                      <Check className="profile-verified-badge__icon" />
                      Vérifié
                    </span>
                  )}
                </div>
                {(shouldShowAddressLine || user.website) && (
                  <div className="flex w-full flex-col items-center gap-2 text-sm text-[#6B7280] md:flex-row md:flex-wrap md:items-center md:justify-start md:gap-4">
                    {shouldShowAddressLine && (
                      <div className="profile-contact-row flex w-full items-start justify-center gap-2 text-center md:w-auto md:justify-start md:text-left">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{addressLine}</span>
                      </div>
                    )}
                    {user.website && (
                      <div className="profile-contact-row flex w-full items-start justify-center gap-2 text-center md:w-auto md:justify-start md:text-left">
                        <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
                        <a
                          href={user.website}
                          className="text-[#FF6B4A] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {user.website}
                        </a>
                      </div>
                    )}
                  </div>
                )}
                {user.phonePublic && (
                  <div className="profile-contact-row flex w-full items-start justify-center gap-2 text-sm text-[#6B7280] text-center md:justify-start md:text-left">
                    <Phone className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{user.phonePublic}</span>
                  </div>
                )}
              </div>
            </div>
            {!isOwnProfile && (
              <div className="profile-header-actions w-full flex items-center justify-center gap-3 md:w-auto md:justify-end">
                <button
                  type="button"
                  onClick={handleFollowClick}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    following
                      ? 'bg-[#E6F6F0] border-[#C8EBDD] text-[#0F5132]'
                      : 'bg-[#FF6B4A] border-[#FF6B4A] text-white shadow-sm hover:bg-[#FF5A39]'
                  }`}
                  aria-pressed={following}
                >
                  {following ? 'Suivi' : 'Suivre'}
                </button>
                <button
                  type="button"
                  onClick={handleMessageClick}
                  className="px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 text-[#1F2937] bg-white hover:border-[#FF6B4A] hover:text-[#FF6B4A] transition-colors"
                >
                  Message
                </button>
              </div>
            )}
          </div>
          {profileTagline && (
            <p className="text-sm text-[#374151] text-left w-full md:w-3/5" style={{ whiteSpace: "pre-line" }}>
              {profileTagline}
            </p>
          )}
          {(user.freshProductsCertified || user.socialLinks) && (
            <div className="flex flex-col items-center md:items-start gap-2 text-sm text-[#374151]">
              {user.freshProductsCertified && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E6F6F0] border border-[#C8EBDD] text-[#0F5132] w-fit">
                  <Shield className="w-4 h-4" /> Accreditations produits frais
                </span>
              )}
              {user.socialLinks && Object.values(user.socialLinks).some(Boolean) && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <span className="text-xs uppercase text-[#6B7280]">Réseaux :</span>
                  {Object.entries(user.socialLinks)
                    .filter(([, v]) => Boolean(v))
                    .map(([key, value]) => (
                      <a
                        key={key}
                        href={value as string}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 rounded-full bg-[#F3F4F6] text-[#1F2937] border border-gray-200 text-xs hover:border-[#FF6B4A]"
                      >
                        {key}
                      </a>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="profile-tabs-wrapper" aria-label="Sections du profil">
          <div className="profile-tabs profile-tabs--compact">
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
                  <span className="profile-tab-count">{stat.value}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="profile-tab-content">
          {renderTabContent()}
        </div>
      </div>
      <ProfileAvatarLightbox
        open={avatarLightboxOpen}
        onClose={() => setAvatarLightboxOpen(false)}
        path={user.avatarPath}
        alt={user.name}
        fallbackSrc={avatarFallbackSrc}
        updatedAt={avatarVersion}
        supabaseClient={supabaseClient ?? null}
      />
      <StripeConnectPromptOverlay
        open={showStripePrompt}
        onClose={() => setStripePromptDismissed(true)}
        onPrimaryAction={handleOpenStripeStructure}
        missingFields={profileStripeMissingFields}
        dueCount={user.legalEntity?.stripeRequirementsDueCount ?? 0}
        status={profileStripeStatus}
      />
    </div>
  );
}

type ProfileAvatarPreviewProps = {
  path?: string | null;
  alt: string;
  fallbackSrc: string;
  updatedAt?: string | null;
  supabaseClient?: SupabaseClient | null;
  className: string;
  onOpen?: (() => void) | undefined;
};

function ProfileAvatarPreview({
  path,
  alt,
  fallbackSrc,
  updatedAt,
  supabaseClient,
  className,
  onOpen,
}: ProfileAvatarPreviewProps) {
  const avatarContent = (
    <>
      <Avatar
        supabaseClient={supabaseClient}
        path={path}
        updatedAt={updatedAt}
        fallbackSrc={fallbackSrc}
        alt={alt}
        className="h-full w-full object-cover"
      />
      {onOpen ? (
        <>
          <span aria-hidden="true" className="profile-avatar-trigger__veil" />
        </>
      ) : null}
    </>
  );

  if (!onOpen) {
    return <div className={className}>{avatarContent}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`profile-avatar-trigger ${className}`}
      aria-label={`Voir la photo de profil de ${alt} en grand`}
      aria-haspopup="dialog"
    >
      {avatarContent}
    </button>
  );
}

function ProfileAvatarLightbox({
  open,
  onClose,
  path,
  alt,
  fallbackSrc,
  updatedAt,
  supabaseClient,
}: {
  open: boolean;
  onClose: () => void;
  path?: string | null;
  alt: string;
  fallbackSrc: string;
  updatedAt?: string | null;
  supabaseClient?: SupabaseClient | null;
}) {
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isVisible, setIsVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      if (typeof window === 'undefined') {
        setIsVisible(true);
        return;
      }
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (!shouldRender || typeof window === 'undefined') {
      setIsVisible(false);
      return;
    }

    setIsVisible(false);
    const timeout = window.setTimeout(() => setShouldRender(false), AVATAR_LIGHTBOX_TRANSITION_MS);
    return () => window.clearTimeout(timeout);
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  const handleBackdropMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose]
  );

  if (!shouldRender) return null;

  const content = (
    <div
      className={`profile-avatar-lightbox${isVisible ? ' profile-avatar-lightbox--visible' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo de profil de ${alt}`}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className={`profile-avatar-lightbox__dialog${isVisible ? ' profile-avatar-lightbox__dialog--visible' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="profile-avatar-lightbox__close"
          aria-label="Fermer la photo de profil"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="profile-avatar-lightbox__frame">
          <Avatar
            supabaseClient={supabaseClient}
            path={path}
            updatedAt={updatedAt}
            fallbackSrc={fallbackSrc}
            alt={alt}
            className="h-full w-full object-cover"
          />
        </div>
        <p className="profile-avatar-lightbox__caption">{alt}</p>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="w-12 h-12 rounded-full bg-[#FFD166]/30 text-[#FF6B4A] flex items-center justify-center">
        <Sparkles className="w-6 h-6" />
      </div>
      <p className="text-[#1F2937] font-semibold">{title}</p>
      <p className="text-sm text-[#6B7280] max-w-md">{subtitle}</p>
    </div>
  );
}

function StripeConnectPromptOverlay({
  open,
  onClose,
  onPrimaryAction,
  missingFields,
  dueCount,
  status,
}: {
  open: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
  missingFields: string[];
  dueCount: number;
  status: StripeConnectionStatus;
}) {
  if (!open) return null;

  const statusLabel =
    status === 'connected'
      ? 'Compte prêt'
      : status === 'action_required'
        ? 'Action requise'
        : 'Compte à connecter';

  const content = (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#111827]/55 px-4 py-6">
      <div className="relative w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-[#6B7280] transition-colors hover:border-[#FF6B4A] hover:text-[#FF6B4A]"
          aria-label="Fermer l'invitation Stripe"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 pr-10">
          <span className="inline-flex items-center rounded-full bg-[#FFF1E6] px-3 py-1 text-xs font-semibold text-[#B45309]">
            Producteur à finaliser
          </span>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#1F2937]">Complétez votre structure avant d’encaisser</h2>
            <p className="text-sm leading-6 text-[#6B7280]">
              Votre profil producteur n’est pas encore prêt pour Stripe Connect. Complétez les champs
              structure, vérifiez l’IBAN sur votre site, puis terminez l’onboarding Stripe.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#D9E7F9] bg-[#F8FBFF] px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#6B7280]">Statut Stripe</div>
              <div className="mt-2 text-sm font-semibold text-[#1F2937]">{statusLabel}</div>
            </div>
          </div>

          {missingFields.length > 0 && (
            <div className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] px-4 py-3">
              <p className="text-sm font-semibold text-[#1F2937]">Champs à compléter sur votre site</p>
              <ul className="mt-2 space-y-1 text-sm text-[#6B7280]">
                {missingFields.slice(0, 6).map((field) => (
                  <li key={field}>• {field}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex items-center justify-center rounded-xl bg-[#FF6B4A] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#FF5A39]"
            >
              Compléter ma structure
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-[#1F2937] transition-colors hover:border-[#FF6B4A] hover:text-[#FF6B4A]"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}

function ProfileEditPanel({
  user,
  onUpdateUser,
  onClose,
  supabaseClient,
  onAvatarUpdated,
  onRegisterSave,
  initialEditTab,
}: {
  user: User;
  onUpdateUser: (user: Partial<User>) => void;
  onClose: () => void;
  supabaseClient?: SupabaseClient | null;
  onAvatarUpdated?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
  onRegisterSave?: (handler: (() => void) | null) => void;
  initialEditTab?: EditTabKey;
}) {
  const location = useLocation();
  const defaultHandle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, '');
  const [name, setName] = React.useState(user.name);
  const [address, setAddress] = React.useState(user.address || '');
  const [addressDetails, setAddressDetails] = React.useState(user.addressDetails || '');
  const [handleValue, setHandleValue] = React.useState(defaultHandle);
  const [profileVisibility, setProfileVisibility] = React.useState<User['profileVisibility']>(
    user.profileVisibility ?? 'public'
  );
  const [addressVisibility, setAddressVisibility] = React.useState<User['addressVisibility']>(
    user.addressVisibility ?? 'private'
  );
  const [tagline, setTagline] = React.useState(user.tagline ?? '');
  const [website, setWebsite] = React.useState(user.website ?? '');
  const [phone, setPhone] = React.useState(user.phone ?? '');
  const [city, setCity] = React.useState(user.city ?? '');
  const [postcode, setPostcode] = React.useState(user.postcode ?? '');
  const [accountType, setAccountType] = React.useState<User['accountType']>(
    user.accountType ?? 'individual'
  );
  const [editTab, setEditTab] = React.useState<EditTabKey>(initialEditTab ?? 'general');
  const isProducerSettingsTabActive = editTab === 'producer_settings';
  const [phonePublic, setPhonePublic] = React.useState(user.phonePublic ?? '');
  const [contactEmailPublic, setContactEmailPublic] = React.useState(user.contactEmailPublic ?? '');
  const [notificationEmailPreferences, setNotificationEmailPreferences] = React.useState(() =>
    normalizeNotificationEmailPreferences(user.notificationEmailPreferences)
  );
  const visibleNotificationEmailPreferences = React.useMemo(
    () => filterNotificationEmailPreferencesByRole(user.role),
    [user.role]
  );
  const [offersOnSitePickup, setOffersOnSitePickup] = React.useState<boolean>(Boolean(user.offersOnSitePickup));
  const [freshProductsCertified, setFreshProductsCertified] = React.useState<boolean>(
    Boolean(user.freshProductsCertified)
  );
  const [socialInstagram, setSocialInstagram] = React.useState(user.socialLinks?.instagram ?? '');
  const [socialFacebook, setSocialFacebook] = React.useState(user.socialLinks?.facebook ?? '');
  const [socialTiktok, setSocialTiktok] = React.useState(user.socialLinks?.tiktok ?? '');
  const [openingHoursSlots, setOpeningHoursSlots] = React.useState<Record<DeliveryDay, OpeningHourSlot>>(
    () => {
      const defaults = createEmptyOpeningHoursSlots();
      if (user.openingHours) {
        Object.entries(user.openingHours).forEach(([day, value]) => {
          const normalizedDay = normalizeOpeningHoursDayKey(day);
          if (!normalizedDay) return;
          defaults[normalizedDay] = parseOpeningHoursEntry(value);
        });
      }
      return defaults;
    }
  );
  const [producerLabels, setProducerLabels] = React.useState<ProducerLabelDetail[]>([]);
  const [producerLabelInput, setProducerLabelInput] = React.useState('');
  const [producerLabelDescription, setProducerLabelDescription] = React.useState('');
  const [producerLabelYear, setProducerLabelYear] = React.useState('');
  const [producerLabelsLoading, setProducerLabelsLoading] = React.useState(false);
  const [producerLabelsLoaded, setProducerLabelsLoaded] = React.useState(false);
  const [producerLabelsDirty, setProducerLabelsDirty] = React.useState(false);
  const [legalName, setLegalName] = React.useState(user.legalEntity?.legalName ?? '');
  const [siret, setSiret] = React.useState(user.legalEntity?.siret ?? '');
  const [vatNumber, setVatNumber] = React.useState(user.legalEntity?.vatNumber ?? '');
  const [vatRegime, setVatRegime] = React.useState<LegalEntity['vatRegime']>(
    user.legalEntity?.vatRegime ?? 'unknown'
  );
  const [country, setCountry] = React.useState(user.legalEntity?.country ?? 'FR');
  const [legalForm, setLegalForm] = React.useState(user.legalEntity?.legalForm ?? '');
  const [producerCategory, setProducerCategory] = React.useState(
    user.legalEntity?.producerCategory ?? ''
  );
  const [iban, setIban] = React.useState(user.legalEntity?.iban ?? '');
  const [accountHolderName, setAccountHolderName] = React.useState(
    user.legalEntity?.accountHolderName ?? ''
  );
  const [representativeFirstName, setRepresentativeFirstName] = React.useState(
    user.legalEntity?.representativeFirstName ?? ''
  );
  const [representativeLastName, setRepresentativeLastName] = React.useState(
    user.legalEntity?.representativeLastName ?? ''
  );
  const [representativeEmail, setRepresentativeEmail] = React.useState(
    user.legalEntity?.representativeEmail ?? ''
  );
  const [representativePhone, setRepresentativePhone] = React.useState(
    user.legalEntity?.representativePhone ?? ''
  );
  const [representativeTitle, setRepresentativeTitle] = React.useState(
    user.legalEntity?.representativeTitle ?? ''
  );
  const [representativeBirthDate, setRepresentativeBirthDate] = React.useState(
    user.legalEntity?.representativeBirthDate ?? ''
  );
  const [representativeUseProfileAddress, setRepresentativeUseProfileAddress] = React.useState(
    user.legalEntity?.representativeUseProfileAddress ?? true
  );
  const [representativeAddressLine1, setRepresentativeAddressLine1] = React.useState(
    user.legalEntity?.representativeAddressLine1 ?? ''
  );
  const [representativeAddressLine2, setRepresentativeAddressLine2] = React.useState(
    user.legalEntity?.representativeAddressLine2 ?? ''
  );
  const [representativeCity, setRepresentativeCity] = React.useState(
    user.legalEntity?.representativeCity ?? ''
  );
  const [representativePostcode, setRepresentativePostcode] = React.useState(
    user.legalEntity?.representativePostcode ?? ''
  );
  const [representativeCountry, setRepresentativeCountry] = React.useState(
    user.legalEntity?.representativeCountry ?? 'FR'
  );
  const [deliveryLeadType, setDeliveryLeadType] = React.useState<DeliveryLeadType>(
    user.legalEntity?.deliveryLeadType ?? 'days'
  );
  const [deliveryLeadDays, setDeliveryLeadDays] = React.useState<number>(
    user.legalEntity?.deliveryLeadDays ?? 5
  );
  const [deliveryFixedDay, setDeliveryFixedDay] = React.useState<DeliveryDay>(
    user.legalEntity?.deliveryFixedDay ?? 'monday'
  );
  const [chronofreshEnabled, setChronofreshEnabled] = React.useState<boolean>(
    Boolean(user.legalEntity?.chronofreshEnabled)
  );
  const [chronofreshMinWeight, setChronofreshMinWeight] = React.useState<number>(
    user.legalEntity?.chronofreshMinWeight ?? 0
  );
  const [chronofreshMaxWeight, setChronofreshMaxWeight] = React.useState<number>(
    user.legalEntity?.chronofreshMaxWeight ?? 0
  );
  const [producerDeliveryEnabled, setProducerDeliveryEnabled] = React.useState<boolean>(
    Boolean(user.legalEntity?.producerDeliveryEnabled)
  );
  const [producerDeliveryDays, setProducerDeliveryDays] = React.useState<DeliveryDay[]>(
    user.legalEntity?.producerDeliveryDays ?? []
  );
  const [producerDeliveryMinWeight, setProducerDeliveryMinWeight] = React.useState<number>(
    user.legalEntity?.producerDeliveryMinWeight ?? 0
  );
  const [producerDeliveryMaxWeight, setProducerDeliveryMaxWeight] = React.useState<number>(
    user.legalEntity?.producerDeliveryMaxWeight ?? 0
  );
  const [producerDeliveryRadiusKm, setProducerDeliveryRadiusKm] = React.useState<number>(
    user.legalEntity?.producerDeliveryRadiusKm ?? 0
  );
  const [producerDeliveryFee, setProducerDeliveryFee] = React.useState<number>(
    user.legalEntity?.producerDeliveryFee ?? 0
  );
  const [producerDeliveryUseProfileAddress, setProducerDeliveryUseProfileAddress] = React.useState<boolean>(
    user.legalEntity?.producerDeliveryUseProfileAddress ?? true
  );
  const [producerPickupEnabled, setProducerPickupEnabled] = React.useState<boolean>(
    Boolean(user.legalEntity?.producerPickupEnabled)
  );
  const [producerPickupDays, setProducerPickupDays] = React.useState<DeliveryDay[]>(
    user.legalEntity?.producerPickupDays ?? []
  );
  const [producerPickupStartTime, setProducerPickupStartTime] = React.useState<string>(
    user.legalEntity?.producerPickupStartTime ?? '09:00'
  );
  const [producerPickupEndTime, setProducerPickupEndTime] = React.useState<string>(
    user.legalEntity?.producerPickupEndTime ?? '17:00'
  );
  const [sharerCharterChecks, setSharerCharterChecks] = React.useState<Record<string, boolean>>(() =>
    sharerCharterItems.reduce((acc, item) => {
      acc[item.id] = false;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [producerPickupMinWeight, setProducerPickupMinWeight] = React.useState<number>(
    user.legalEntity?.producerPickupMinWeight ?? 0
  );
  const [producerPickupMaxWeight, setProducerPickupMaxWeight] = React.useState<number>(
    user.legalEntity?.producerPickupMaxWeight ?? 0
  );
  const [legalEntityDbId, setLegalEntityDbId] = React.useState<string | null>(null);
  const [legalDocumentsByType, setLegalDocumentsByType] = React.useState<Partial<Record<LegalDocumentType, LegalDocumentRow>>>({});
  const [legalDocumentsLoading, setLegalDocumentsLoading] = React.useState(false);
  const [downloadingDocType, setDownloadingDocType] = React.useState<LegalDocumentType | null>(null);
  const [uploadingDocType, setUploadingDocType] = React.useState<LegalDocumentType | null>(null);
  const [stripeConnection, setStripeConnection] = React.useState<StripeConnectionState>(() =>
    buildInitialStripeConnectionState(user.legalEntity)
  );
  const [stripeStatusLoading, setStripeStatusLoading] = React.useState(false);
  const [stripeOnboardingLoading, setStripeOnboardingLoading] = React.useState(false);
  const deliveryAddressQuery = React.useMemo(() => {
    const trimmedPostcode = postcode.trim();
    const trimmedCity = city.trim();
    if (!trimmedPostcode || !trimmedCity) return '';
    const trimmedAddress = address.trim();
    return [trimmedAddress, trimmedPostcode, trimmedCity].filter(Boolean).join(' ');
  }, [address, postcode, city]);
  const normalizedDeliveryRadiusKm =
    Number.isFinite(producerDeliveryRadiusKm) && producerDeliveryRadiusKm >= 0 ? producerDeliveryRadiusKm : 0;
  const deliveryMapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const deliveryMapRef = React.useRef<L.Map | null>(null);
  const deliveryMapLayerRef = React.useRef<L.LayerGroup | null>(null);
  const deliveryMapLifecycleCleanupRef = React.useRef<(() => void) | null>(null);
  const deliveryMapInvalidateCleanupRef = React.useRef<(() => void) | null>(null);
  const initialDeliveryCenter = React.useMemo(() => {
    if (Number.isFinite(user.addressLat ?? NaN) && Number.isFinite(user.addressLng ?? NaN)) {
      return { lat: user.addressLat!, lng: user.addressLng! };
    }
    return null;
  }, [user.addressLat, user.addressLng]);
  const initialCustomDeliveryCenter = React.useMemo(() => {
    if (
      Number.isFinite(user.legalEntity?.producerDeliveryCenterLat ?? NaN) &&
      Number.isFinite(user.legalEntity?.producerDeliveryCenterLng ?? NaN)
    ) {
      return {
        lat: Number(user.legalEntity?.producerDeliveryCenterLat),
        lng: Number(user.legalEntity?.producerDeliveryCenterLng),
      };
    }
    return null;
  }, [user.legalEntity?.producerDeliveryCenterLat, user.legalEntity?.producerDeliveryCenterLng]);
  const [producerDeliveryCustomCenter, setProducerDeliveryCustomCenter] = React.useState<{
    lat: number;
    lng: number;
  } | null>(initialCustomDeliveryCenter);
  const deliveryMapCenter = React.useMemo(() => {
    if (producerDeliveryUseProfileAddress) {
      return initialDeliveryCenter;
    }
    return producerDeliveryCustomCenter ?? initialDeliveryCenter;
  }, [initialDeliveryCenter, producerDeliveryCustomCenter, producerDeliveryUseProfileAddress]);
  const [deliveryMapStatus, setDeliveryMapStatus] = React.useState<'idle' | 'loading' | 'resolved' | 'error'>('idle');
  const avatarFallbackSrc = user.profileImage?.trim() || DEFAULT_PROFILE_AVATAR;
  const avatarVersion = user.avatarUpdatedAt ?? user.updatedAt ?? undefined;
  const toggleDeliveryDay = (
    day: DeliveryDay,
    setter: React.Dispatch<React.SetStateAction<DeliveryDay[]>>
  ) => {
    setter((prev) => (prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]));
  };

  const handleOpeningHoursChange = (
    day: DeliveryDay,
    field: 'start' | 'end',
    value: string
  ) => {
    setOpeningHoursSlots((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const normalizeLabelValue = (value: string) => value.trim().toLowerCase();
  const parseProducerLabelYear = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  };
  const parseProducerLabelYearValue = (value: unknown) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return undefined;
  };
  const handleProducerLabelKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleAddProducerLabel();
  };

  const handleAddProducerLabel = () => {
    const nextLabel = producerLabelInput.trim();
    if (!nextLabel) return;
    const normalized = normalizeLabelValue(nextLabel);
    const parsedYear = parseProducerLabelYear(producerLabelYear);
    if (parsedYear === null) {
      toast.error("Annee d'obtention invalide.");
      return;
    }
    const nextDescription = producerLabelDescription.trim();
    setProducerLabels((prev) => {
      if (prev.some((label) => normalizeLabelValue(label.label) === normalized)) return prev;
      return [
        ...prev,
        {
          label: nextLabel,
          description: nextDescription || undefined,
          obtentionYear: parsedYear,
        },
      ];
    });
    setProducerLabelInput('');
    setProducerLabelDescription('');
    setProducerLabelYear('');
    setProducerLabelsDirty(true);
  };

  const handleRemoveProducerLabel = (label: string) => {
    setProducerLabels((prev) => prev.filter((item) => item.label !== label));
    setProducerLabelsDirty(true);
  };

  const hasAddress = Boolean(address.trim() && city.trim() && postcode.trim());
  const canBeProducer =
    accountType === 'company' || accountType === 'association' || accountType === 'public_institution';
  const canRequestSharerAutofacturation = accountType !== 'individual';
  const hasLegalInfo = Boolean(legalName.trim() && siret.trim());
  const producerEligible = canBeProducer && hasLegalInfo;
  const sharerCharterAccepted = sharerCharterItems.every((item) => sharerCharterChecks[item.id]);
  const computedRole: User['role'] = user.role;
  const isOwnProfile = true;
  const isProducerProfile = computedRole === 'producer' && canBeProducer;
  const structureTabVisible = accountType !== 'individual';
  const producerSettingsVisible = accountType !== 'individual' && accountType !== 'auto_entrepreneur';
  const producerSettingsDisabled = !producerEligible;
  const requestedLegalDocumentTypes = React.useMemo(() => {
    const types: LegalDocumentType[] = [];
    if (canBeProducer) {
      types.push(...PRODUCER_DOC_TYPES);
    }
    if (canRequestSharerAutofacturation) {
      types.push('sharer_autofacturation');
    }
    return types;
  }, [canBeProducer, canRequestSharerAutofacturation]);
  const structureDocumentCards = React.useMemo(
    () =>
      [
        canBeProducer
          ? {
              docType: 'producer_mandat' as LegalDocumentType,
              title: 'Mandat producteur (facturation + encaissement)',
              downloadLabel: 'Télécharger le mandat producteur (PDF pré-rempli)',
            }
          : null,
        canRequestSharerAutofacturation
          ? {
              docType: 'sharer_autofacturation' as LegalDocumentType,
              title: 'Autofacturation partageur pro',
              downloadLabel: 'Télécharger l\'accord d\'autofacturation (PDF pré-rempli)',
            }
          : null,
      ].filter((card): card is { docType: LegalDocumentType; title: string; downloadLabel: string } => card !== null),
    [canBeProducer, canRequestSharerAutofacturation]
  );
  const producerDocsApproved = canBeProducer
    ? PRODUCER_DOC_TYPES.every((docType) => legalDocumentsByType[docType]?.status === 'approved')
    : false;
  const producerDocsPendingReview = canBeProducer
    ? PRODUCER_DOC_TYPES.every((docType) => {
        const status = legalDocumentsByType[docType]?.status;
        return status === 'pending_review' || status === 'uploaded' || status === 'approved';
      }) && !producerDocsApproved
    : false;
  const savedStripeLegalFingerprint = React.useMemo(
    () =>
      JSON.stringify({
        accountType: user.accountType ?? 'individual',
        legalName: user.legalEntity?.legalName?.trim() ?? '',
        siret: user.legalEntity?.siret?.trim() ?? '',
        vatNumber: user.legalEntity?.vatNumber?.trim() ?? '',
        vatRegime: user.legalEntity?.vatRegime ?? 'unknown',
        country: user.legalEntity?.country?.trim() ?? 'FR',
        legalForm: user.legalEntity?.legalForm?.trim() ?? '',
        iban: user.legalEntity?.iban?.trim() ?? '',
        accountHolderName: user.legalEntity?.accountHolderName?.trim() ?? '',
        representativeFirstName: user.legalEntity?.representativeFirstName?.trim() ?? '',
        representativeLastName: user.legalEntity?.representativeLastName?.trim() ?? '',
        representativeEmail: user.legalEntity?.representativeEmail?.trim() ?? '',
        representativePhone: user.legalEntity?.representativePhone?.trim() ?? '',
        representativeTitle: user.legalEntity?.representativeTitle?.trim() ?? '',
        representativeBirthDate: user.legalEntity?.representativeBirthDate?.trim() ?? '',
        representativeUseProfileAddress: user.legalEntity?.representativeUseProfileAddress ?? true,
        representativeAddressLine1: user.legalEntity?.representativeAddressLine1?.trim() ?? '',
        representativeAddressLine2: user.legalEntity?.representativeAddressLine2?.trim() ?? '',
        representativeCity: user.legalEntity?.representativeCity?.trim() ?? '',
        representativePostcode: user.legalEntity?.representativePostcode?.trim() ?? '',
        representativeCountry: user.legalEntity?.representativeCountry?.trim() ?? 'FR',
      }),
    [user.accountType, user.legalEntity]
  );
  const draftStripeLegalFingerprint = React.useMemo(
    () =>
      JSON.stringify({
        accountType: accountType ?? 'individual',
        legalName: legalName.trim(),
        siret: siret.trim(),
        vatNumber: vatNumber.trim(),
        vatRegime: vatRegime ?? 'unknown',
        country: country.trim() || 'FR',
        legalForm: legalForm.trim(),
        iban: iban.trim(),
        accountHolderName: accountHolderName.trim(),
        representativeFirstName: representativeFirstName.trim(),
        representativeLastName: representativeLastName.trim(),
        representativeEmail: representativeEmail.trim(),
        representativePhone: representativePhone.trim(),
        representativeTitle: representativeTitle.trim(),
        representativeBirthDate: representativeBirthDate.trim(),
        representativeUseProfileAddress,
        representativeAddressLine1: representativeAddressLine1.trim(),
        representativeAddressLine2: representativeAddressLine2.trim(),
        representativeCity: representativeCity.trim(),
        representativePostcode: representativePostcode.trim(),
        representativeCountry: representativeCountry.trim() || 'FR',
      }),
    [
      accountHolderName,
      accountType,
      country,
      iban,
      legalForm,
      legalName,
      representativeAddressLine1,
      representativeAddressLine2,
      representativeBirthDate,
      representativeCity,
      representativeCountry,
      representativeEmail,
      representativeFirstName,
      representativeLastName,
      representativePhone,
      representativePostcode,
      representativeTitle,
      representativeUseProfileAddress,
      siret,
      vatNumber,
      vatRegime,
    ]
  );
  const stripeLegalInfoNeedsSave = savedStripeLegalFingerprint !== draftStripeLegalFingerprint;
  const savedStripePrefillMissingFields = React.useMemo(
    () =>
      getMissingStripePrefillFields({
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        postcode: user.postcode,
        legalEntity: user.legalEntity,
      }),
    [user.address, user.city, user.email, user.legalEntity, user.phone, user.postcode]
  );
  const stripeReturnUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    const basePath = user.handle ? `/profil/${user.handle}` : '/profil';
    const nextUrl = new URL(basePath, window.location.origin);
    nextUrl.searchParams.set('profileEdit', '1');
    nextUrl.searchParams.set('profileEditTab', 'structure');
    const resolvedUrl = nextUrl.toString();
    return isStripeCompatibleReturnUrl(resolvedUrl) ? resolvedUrl : null;
  }, [user.handle]);
  const stripeRepresentativePrefillReady = React.useMemo(
    () =>
      Boolean(
        representativeFirstName.trim() &&
          representativeLastName.trim() &&
          representativeBirthDate.trim()
      ),
    [representativeBirthDate, representativeFirstName, representativeLastName]
  );
  const createStripeAccountToken = React.useCallback(async () => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      throw new Error('Configurez VITE_STRIPE_PUBLISHABLE_KEY pour l onboarding Stripe des structures francaises.');
    }

    const trimmedContactEmail = (user.email?.trim() || user.contactEmailPublic?.trim() || '').trim();
    const trimmedCountry = (country.trim() || 'FR').toUpperCase();
    const trimmedAddress = address.trim();
    const trimmedAddressDetails = addressDetails.trim();
    const trimmedCity = city.trim();
    const trimmedPostcode = postcode.trim();
    const businessAddress =
      trimmedAddress && trimmedCity && trimmedPostcode
        ? {
            line1: trimmedAddress,
            ...(trimmedAddressDetails ? { line2: trimmedAddressDetails } : {}),
            city: trimmedCity,
            postal_code: trimmedPostcode,
            country: trimmedCountry,
          }
        : undefined;
    const entityType =
      accountType === 'association'
        ? 'non_profit'
        : accountType === 'public_institution'
          ? 'government_entity'
          : 'company';

    // Accounts v2 expects a v2 account token (`accttok_...`), not the legacy Stripe.js v1 account token (`ct_...`).
    const response = await fetch('https://api.stripe.com/v2/core/account_tokens', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Stripe-Version': STRIPE_V2_API_VERSION,
      },
      body: JSON.stringify({
        ...(trimmedContactEmail ? { contact_email: trimmedContactEmail } : {}),
        ...(phone.trim() ? { contact_phone: phone.trim() } : {}),
        display_name: legalName.trim(),
        identity: {
          entity_type: entityType,
          business_details: {
            registered_name: legalName.trim(),
            ...(businessAddress ? { address: businessAddress } : {}),
          },
        },
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: {
        message?: string;
      };
    };

    if (!response.ok) {
      const message =
        typeof result?.error?.message === 'string' && result.error.message.trim()
          ? result.error.message.trim()
          : 'Creation du token Stripe v2 impossible.';
      throw new Error(message);
    }

    const accountToken = typeof result?.id === 'string' ? result.id.trim() : '';
    if (!accountToken) {
      throw new Error('Stripe n a pas retourne de token de compte v2.');
    }

    return accountToken;
  }, [
    accountType,
    address,
    addressDetails,
    city,
    country,
    legalName,
    phone,
    postcode,
    user.contactEmailPublic,
    user.email,
  ]);
  const createStripePersonToken = React.useCallback(
    async (accountId: string) => {
      if (!STRIPE_PUBLISHABLE_KEY) {
        throw new Error('Configurez VITE_STRIPE_PUBLISHABLE_KEY pour le pré-remplissage Stripe.');
      }
      if (!stripeRepresentativePrefillReady) return null;

      const birthDate = new Date(representativeBirthDate);
      if (Number.isNaN(birthDate.getTime())) {
        throw new Error('Date de naissance du représentant légal invalide.');
      }

      const trimmedCountry = (representativeCountry.trim() || country.trim() || 'FR').toUpperCase();
      const repAddressLine1 = representativeUseProfileAddress ? address.trim() : representativeAddressLine1.trim();
      const repAddressLine2 = representativeUseProfileAddress ? addressDetails.trim() : representativeAddressLine2.trim();
      const repCity = representativeUseProfileAddress ? city.trim() : representativeCity.trim();
      const repPostcode = representativeUseProfileAddress ? postcode.trim() : representativePostcode.trim();
      const representativeAddress =
        repAddressLine1 && repCity && repPostcode
          ? {
              line1: repAddressLine1,
              ...(repAddressLine2 ? { line2: repAddressLine2 } : {}),
              city: repCity,
              postal_code: repPostcode,
              country: trimmedCountry,
            }
          : undefined;

      const response = await fetch(
        `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}/person_tokens`,
        {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          'Stripe-Version': STRIPE_V2_API_VERSION,
        },
        body: JSON.stringify({
          given_name: representativeFirstName.trim(),
          surname: representativeLastName.trim(),
          ...(representativeEmail.trim() ? { email: representativeEmail.trim() } : {}),
          ...(representativePhone.trim() ? { phone: representativePhone.trim() } : {}),
          ...(representativeTitle.trim()
            ? {
                relationship: {
                  representative: true,
                  title: representativeTitle.trim(),
                },
              }
            : {
                relationship: {
                  representative: true,
                },
              }),
          date_of_birth: {
            day: birthDate.getDate(),
            month: birthDate.getMonth() + 1,
            year: birthDate.getFullYear(),
          },
          ...(representativeAddress ? { address: representativeAddress } : {}),
        }),
      }
      );

      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        const message =
          typeof result?.error?.message === 'string' && result.error.message.trim()
            ? result.error.message.trim()
            : 'Création du token représentant Stripe impossible.';
        throw new Error(message);
      }

      const token = typeof result?.id === 'string' ? result.id.trim() : '';
      if (!token) {
        throw new Error("Stripe n'a pas retourné de token représentant.");
      }
      return token;
    },
    [
      STRIPE_PUBLISHABLE_KEY,
      address,
      addressDetails,
      city,
      country,
      postcode,
      representativeAddressLine1,
      representativeAddressLine2,
      representativeBirthDate,
      representativeCity,
      representativeCountry,
      representativeEmail,
      representativeFirstName,
      representativeLastName,
      representativePhone,
      representativePostcode,
      representativeTitle,
      representativeUseProfileAddress,
      stripeRepresentativePrefillReady,
    ]
  );

  const applyStripeConnectionPayload = React.useCallback((payload: {
    status?: string | null;
    stripe_account_id?: string | null;
    stripe_account_country?: string | null;
    stripe_connection_status?: string | null;
    stripe_ready_for_orders?: boolean | null;
    stripe_onboarding_complete?: boolean | null;
    stripe_requirements_due_count?: number | null;
    stripe_last_synced_at?: string | null;
    outstanding_requirements?: string[] | null;
    transfers_status?: string | null;
    requirements_status?: string | null;
    requirements_disabled_reason?: string | null;
  }) => {
    const accountId =
      typeof payload.stripe_account_id === 'string' && payload.stripe_account_id.trim()
        ? payload.stripe_account_id.trim()
        : null;
    const onboardingComplete = Boolean(payload.stripe_onboarding_complete);
    const readyForOrders = Boolean(payload.stripe_ready_for_orders);
    const mappedStatus: StripeConnectionStatus =
      payload.status === 'connected' ||
      payload.stripe_connection_status === 'connected' ||
      onboardingComplete ||
      readyForOrders
        ? 'connected'
        : accountId
          ? 'action_required'
          : 'not_connected';

    setStripeConnection({
      status: mappedStatus,
      accountId,
      country:
        typeof payload.stripe_account_country === 'string' && payload.stripe_account_country.trim()
          ? payload.stripe_account_country.trim()
          : null,
      dueCount:
        typeof payload.stripe_requirements_due_count === 'number' && Number.isFinite(payload.stripe_requirements_due_count)
          ? payload.stripe_requirements_due_count
          : 0,
      lastSyncedAt:
        typeof payload.stripe_last_synced_at === 'string' && payload.stripe_last_synced_at.trim()
          ? payload.stripe_last_synced_at
          : null,
      outstandingRequirements: Array.isArray(payload.outstanding_requirements)
        ? payload.outstanding_requirements.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
      readyForOrders,
      transfersStatus:
        typeof payload.transfers_status === 'string' && payload.transfers_status.trim()
          ? payload.transfers_status.trim()
          : null,
      requirementsStatus:
        typeof payload.requirements_status === 'string' && payload.requirements_status.trim()
          ? payload.requirements_status.trim()
          : null,
      requirementsDisabledReason:
        typeof payload.requirements_disabled_reason === 'string' && payload.requirements_disabled_reason.trim()
          ? payload.requirements_disabled_reason.trim()
          : null,
    });
  }, []);

  const refreshStripeConnectionStatus = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!supabaseClient || !canBeProducer) return;

      setStripeStatusLoading(true);
      const { data, error } = await supabaseClient.functions.invoke('stripe_connected_account_status', {
        body: {},
      });
      setStripeStatusLoading(false);

      if (error) {
        if (!options?.silent) {
          toast.error(await extractEdgeInvokeErrorMessage(error, 'Impossible de verifier le statut Stripe.'));
        }
        return;
      }

      const payload = (data as Record<string, unknown> | null) ?? null;
      if (payload && typeof payload.error === 'string') {
        if (!options?.silent) {
          toast.error(payload.error);
        }
        return;
      }

      applyStripeConnectionPayload({
        status: typeof payload?.status === 'string' ? payload.status : null,
        stripe_account_id: typeof payload?.stripe_account_id === 'string' ? payload.stripe_account_id : null,
        stripe_account_country:
          typeof payload?.stripe_account_country === 'string' ? payload.stripe_account_country : null,
        stripe_connection_status:
          typeof payload?.stripe_connection_status === 'string' ? payload.stripe_connection_status : null,
        stripe_ready_for_orders:
          typeof payload?.stripe_ready_for_orders === 'boolean' ? payload.stripe_ready_for_orders : null,
        stripe_onboarding_complete:
          typeof payload?.stripe_onboarding_complete === 'boolean' ? payload.stripe_onboarding_complete : null,
        stripe_requirements_due_count:
          typeof payload?.stripe_requirements_due_count === 'number' ? payload.stripe_requirements_due_count : null,
        stripe_last_synced_at:
          typeof payload?.stripe_last_synced_at === 'string' ? payload.stripe_last_synced_at : null,
        outstanding_requirements: Array.isArray(payload?.outstanding_requirements)
          ? (payload.outstanding_requirements as string[])
          : null,
        transfers_status: typeof payload?.transfers_status === 'string' ? payload.transfers_status : null,
        requirements_status: typeof payload?.requirements_status === 'string' ? payload.requirements_status : null,
        requirements_disabled_reason:
          typeof payload?.requirements_disabled_reason === 'string' ? payload.requirements_disabled_reason : null,
      });
    },
    [applyStripeConnectionPayload, canBeProducer, supabaseClient]
  );

  const handleStartStripeOnboarding = React.useCallback(async () => {
    if (!supabaseClient) {
      toast.error('Supabase non configure.');
      return;
    }
    if (!canBeProducer) {
      toast.info('Ce type de structure ne peut pas etre connecte a Stripe.');
      return;
    }
    if (!hasLegalInfo) {
      toast.info('Renseignez au minimum la raison sociale et le SIRET.');
      return;
    }
    if (stripeLegalInfoNeedsSave) {
      toast.info('Enregistrez vos informations legales avant de lancer Stripe.');
      return;
    }
    if (!stripeReturnUrl) {
      toast.error(
        "Stripe exige une URL de retour en https://, ou en http://localhost uniquement pendant les tests. Ouvrez ce site en https ou via localhost."
      );
      return;
    }

    let accountToken: string | null = null;
    let personToken: string | null = null;
    const isFrenchConnectedAccount =
      (stripeConnection.country?.trim().toUpperCase() ||
        user.legalEntity?.stripeAccountCountry?.trim().toUpperCase() ||
        country.trim().toUpperCase() ||
        'FR') === 'FR';

    if (isFrenchConnectedAccount) {
      try {
        accountToken = await createStripeAccountToken();
      } catch (tokenError) {
        toast.error(await extractEdgeInvokeErrorMessage(tokenError, 'Creation du token Stripe impossible.'));
        return;
      }
    }

    if (isFrenchConnectedAccount && stripeRepresentativePrefillReady && stripeConnection.accountId) {
      try {
        personToken = await createStripePersonToken(stripeConnection.accountId);
      } catch (tokenError) {
        toast.error(await extractEdgeInvokeErrorMessage(tokenError, 'Creation du token representant Stripe impossible.'));
        return;
      }
    }

    setStripeOnboardingLoading(true);
    let invokeResult = await supabaseClient.functions.invoke('stripe_create_connected_account_link', {
      body: {
        return_url: stripeReturnUrl,
        refresh_url: stripeReturnUrl,
        ...(accountToken ? { account_token: accountToken } : {}),
        ...(personToken ? { person_token: personToken } : {}),
      },
    });

    let payload = (invokeResult.data as Record<string, unknown> | null) ?? null;
    if (
      !invokeResult.error &&
      payload?.requires_person_token === true &&
      typeof payload?.stripe_account_id === 'string' &&
      stripeRepresentativePrefillReady
    ) {
      try {
        const deferredPersonToken = await createStripePersonToken(payload.stripe_account_id);
        if (deferredPersonToken) {
          invokeResult = await supabaseClient.functions.invoke('stripe_create_connected_account_link', {
            body: {
              return_url: stripeReturnUrl,
              refresh_url: stripeReturnUrl,
              ...(accountToken ? { account_token: accountToken } : {}),
              person_token: deferredPersonToken,
            },
          });
          payload = (invokeResult.data as Record<string, unknown> | null) ?? null;
        }
      } catch (tokenError) {
        setStripeOnboardingLoading(false);
        toast.error(await extractEdgeInvokeErrorMessage(tokenError, 'Creation du token representant Stripe impossible.'));
        return;
      }
    }
    setStripeOnboardingLoading(false);

    if (invokeResult.error) {
      toast.error(await extractEdgeInvokeErrorMessage(invokeResult.error, 'Creation du lien Stripe impossible.'));
      return;
    }

    if (payload && typeof payload.error === 'string') {
      toast.error(payload.error);
      return;
    }

    applyStripeConnectionPayload({
      status: 'action_required',
      stripe_account_id: typeof payload?.stripe_account_id === 'string' ? payload.stripe_account_id : null,
      stripe_account_country:
        typeof payload?.stripe_account_country === 'string' ? payload.stripe_account_country : stripeConnection.country,
      stripe_connection_status: 'action_required',
      stripe_ready_for_orders: false,
      stripe_onboarding_complete: false,
      stripe_requirements_due_count:
        typeof payload?.stripe_requirements_due_count === 'number' ? payload.stripe_requirements_due_count : stripeConnection.dueCount,
      stripe_last_synced_at:
        typeof payload?.stripe_last_synced_at === 'string' ? payload.stripe_last_synced_at : new Date().toISOString(),
      outstanding_requirements: Array.isArray(payload?.outstanding_requirements)
        ? (payload.outstanding_requirements as string[])
        : stripeConnection.outstandingRequirements,
    });

    const nextUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
    if (!nextUrl) {
      toast.error("Lien d'onboarding Stripe indisponible.");
      return;
    }

    window.location.assign(nextUrl);
  }, [
    applyStripeConnectionPayload,
    canBeProducer,
    hasLegalInfo,
    stripeConnection.country,
    stripeConnection.dueCount,
    stripeConnection.outstandingRequirements,
    stripeRepresentativePrefillReady,
    country,
    createStripeAccountToken,
    createStripePersonToken,
    stripeLegalInfoNeedsSave,
    stripeReturnUrl,
    supabaseClient,
    user.legalEntity?.stripeAccountCountry,
  ]);

  const loadLegalDocuments = React.useCallback(async () => {
    if (!supabaseClient) {
      setLegalEntityDbId(null);
      setLegalDocumentsByType({});
      setLegalDocumentsLoading(false);
      return;
    }

    if (requestedLegalDocumentTypes.length === 0) {
      setLegalEntityDbId(null);
      setLegalDocumentsByType({});
      setLegalDocumentsLoading(false);
      return;
    }

    setLegalDocumentsLoading(true);
    try {
      const [{ data: legalEntityData, error: legalEntityError }, { data: docsData, error: docsError }] =
        await Promise.all([
          supabaseClient.from('legal_entities').select('id').eq('profile_id', user.id).maybeSingle(),
          supabaseClient
            .from('legal_documents')
            .select('*')
            .eq('profile_id', user.id)
            .in('doc_type', requestedLegalDocumentTypes)
            .order('created_at', { ascending: false }),
        ]);

      if (legalEntityError) {
        console.warn('[ProfileView] legal entity fetch error', legalEntityError);
      }
      setLegalEntityDbId((legalEntityData as { id?: string } | null)?.id ?? null);

      if (docsError) {
        console.warn('[ProfileView] legal documents fetch error', docsError);
        setLegalDocumentsByType({});
        return;
      }

      const mapped: Partial<Record<LegalDocumentType, LegalDocumentRow>> = {};
      (docsData as Array<Record<string, unknown>> | null)?.forEach((row) => {
        const docType = typeof row.doc_type === 'string' ? row.doc_type : '';
        if (!isLegalDocumentType(docType)) return;
        if (mapped[docType]) return;
        mapped[docType] = row as unknown as LegalDocumentRow;
      });
      setLegalDocumentsByType(mapped);
    } finally {
      setLegalDocumentsLoading(false);
    }
  }, [requestedLegalDocumentTypes, supabaseClient, user.id]);

  React.useEffect(() => {
    void loadLegalDocuments();
  }, [loadLegalDocuments]);

  React.useEffect(() => {
    let isActive = true;
    if (!producerSettingsVisible || !supabaseClient) {
      setProducerLabelsLoading(false);
      setProducerLabelsLoaded(false);
      return () => {
        isActive = false;
      };
    }

    const loadProducerLabels = async () => {
      setProducerLabelsLoading(true);
      setProducerLabelsLoaded(false);
      try {
        const { data, error } = await supabaseClient
          .from(PRODUCER_LABELS_TABLE)
          .select('*')
          .eq('profile_id', user.id)
          .order('label', { ascending: true });

        if (!isActive) return;
        if (error) {
          toast.error("Impossible de charger les labels d'exploitation.");
          return;
        }
        const nextLabels = (data ?? [])
          .map((row) => {
            const record = row as Record<string, unknown>;
            const labelValue = typeof record.label === 'string' ? record.label.trim() : '';
            if (!labelValue) return null;
            const descriptionValue = record[PRODUCER_LABELS_DESCRIPTION_COLUMN];
            const description =
              typeof descriptionValue === 'string'
                ? descriptionValue.trim()
                : typeof record.description === 'string'
                  ? record.description.trim()
                  : undefined;
            const yearValue = record[PRODUCER_LABELS_YEAR_COLUMN];
            const obtentionYear = parseProducerLabelYearValue(yearValue);
            return {
              label: labelValue,
              description: description || undefined,
              obtentionYear,
            } as ProducerLabelDetail;
          })
          .filter(Boolean) as ProducerLabelDetail[];
        setProducerLabels(nextLabels);
        setProducerLabelsLoaded(true);
        setProducerLabelsDirty(false);
      } finally {
        if (isActive) setProducerLabelsLoading(false);
      }
    };

    void loadProducerLabels();

    return () => {
      isActive = false;
    };
  }, [producerSettingsVisible, supabaseClient, user.id]);

  const saveProducerLabels = async () => {
    if (!supabaseClient || !producerSettingsVisible || !producerEligible) return true;
    if (!producerLabelsLoaded && !producerLabelsDirty) return true;
    const cleaned = producerLabels
      .map((entry) => ({
        label: entry.label.trim(),
        description: entry.description?.trim() || null,
        obtentionYear: entry.obtentionYear ?? null,
      }))
      .filter((entry) => entry.label);
    const { error: deleteError } = await supabaseClient
      .from(PRODUCER_LABELS_TABLE)
      .delete()
      .eq('profile_id', user.id);
    if (deleteError) {
      toast.error("Mise a jour des labels d'exploitation impossible.");
      return false;
    }
    if (cleaned.length) {
      const rows = cleaned.map((entry) => ({
        profile_id: user.id,
        label: entry.label,
        [PRODUCER_LABELS_DESCRIPTION_COLUMN]: entry.description,
        [PRODUCER_LABELS_YEAR_COLUMN]: entry.obtentionYear,
      }));
      const { error: insertError } = await supabaseClient.from(PRODUCER_LABELS_TABLE).insert(rows);
      if (insertError) {
        toast.error("Mise a jour des labels d'exploitation impossible.");
        return false;
      }
    }
    setProducerLabelsDirty(false);
    return true;
  };

  React.useEffect(() => {
    if (producerDeliveryEnabled && isProducerSettingsTabActive) return;
    deliveryMapInvalidateCleanupRef.current?.();
    deliveryMapInvalidateCleanupRef.current = null;
    deliveryMapLifecycleCleanupRef.current?.();
    deliveryMapLifecycleCleanupRef.current = null;
    if (deliveryMapRef.current) {
      deliveryMapRef.current.remove();
      deliveryMapRef.current = null;
      deliveryMapLayerRef.current = null;
    }
  }, [isProducerSettingsTabActive, producerDeliveryEnabled]);

  React.useEffect(() => {
    if (!isProducerSettingsTabActive || !producerDeliveryEnabled || !deliveryMapContainerRef.current || deliveryMapRef.current) {
      return;
    }
    const container = deliveryMapContainerRef.current;
    const map = L.map(container, {
      zoomControl: true,
      attributionControl: false,
    }).setView([defaultDeliveryMapCenter.lat, defaultDeliveryMapCenter.lng], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    reduceDeliveryMapStacking(map);
    deliveryMapRef.current = map;
    const cleanupInvalidate = scheduleLeafletInvalidate(map);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize(false);
          })
        : null;
    resizeObserver?.observe(container);
    const handleWindowResize = () => {
      map.invalidateSize(false);
    };
    window.addEventListener('resize', handleWindowResize);
    deliveryMapLifecycleCleanupRef.current = () => {
      cleanupInvalidate();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
    return () => {
      deliveryMapLifecycleCleanupRef.current?.();
      deliveryMapLifecycleCleanupRef.current = null;
      deliveryMapInvalidateCleanupRef.current?.();
      deliveryMapInvalidateCleanupRef.current = null;
      if (deliveryMapLayerRef.current) {
        deliveryMapLayerRef.current.clearLayers();
        deliveryMapLayerRef.current = null;
      }
      if (deliveryMapRef.current === map) {
        map.remove();
        deliveryMapRef.current = null;
      }
    };
  }, [isProducerSettingsTabActive, producerDeliveryEnabled]);

  React.useEffect(() => {
    if (!producerDeliveryEnabled) return;
    if (producerDeliveryUseProfileAddress) {
      if (initialDeliveryCenter) {
        setDeliveryMapStatus('resolved');
        return;
      }
      setDeliveryMapStatus(deliveryAddressQuery ? 'error' : 'idle');
      return;
    }
    if (deliveryMapCenter) {
      setDeliveryMapStatus('resolved');
      return;
    }
    setDeliveryMapStatus('idle');
  }, [deliveryAddressQuery, deliveryMapCenter, initialDeliveryCenter, producerDeliveryEnabled, producerDeliveryUseProfileAddress]);

  React.useEffect(() => {
    const map = deliveryMapRef.current;
    if (!isProducerSettingsTabActive || !producerDeliveryEnabled || !map) return;

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (producerDeliveryUseProfileAddress || producerSettingsDisabled) return;
      setProducerDeliveryCustomCenter({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
      setDeliveryMapStatus('resolved');
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isProducerSettingsTabActive, producerDeliveryEnabled, producerDeliveryUseProfileAddress, producerSettingsDisabled]);

  React.useEffect(() => {
    if (!isProducerSettingsTabActive || !producerDeliveryEnabled || !deliveryMapRef.current) return;
    if (!deliveryMapLayerRef.current) {
      deliveryMapLayerRef.current = L.layerGroup().addTo(deliveryMapRef.current);
    }
    deliveryMapLayerRef.current.clearLayers();

    if (!deliveryMapCenter) {
    deliveryMapRef.current.setView([defaultDeliveryMapCenter.lat, defaultDeliveryMapCenter.lng], 6);
      deliveryMapRef.current.invalidateSize();
      return;
    }

    const latLng: L.LatLngTuple = [deliveryMapCenter.lat, deliveryMapCenter.lng];
    const marker = L.marker(latLng, {
      draggable: !producerDeliveryUseProfileAddress && !producerSettingsDisabled,
    });
    marker.on('dragend', () => {
      const next = marker.getLatLng();
      setProducerDeliveryCustomCenter({ lat: next.lat, lng: next.lng });
      setDeliveryMapStatus('resolved');
    });
    deliveryMapLayerRef.current.addLayer(marker);

    if (normalizedDeliveryRadiusKm > 0) {
      const circle = L.circle(latLng, {
        radius: normalizedDeliveryRadiusKm * 1000,
        color: '#FF6B4A',
        weight: 2,
        fillColor: '#FF6B4A',
        fillOpacity: 0.15,
      });
      deliveryMapLayerRef.current.addLayer(circle);
      deliveryMapRef.current.fitBounds(circle.getBounds(), { padding: [24, 24] });
    } else {
      deliveryMapRef.current.setView(latLng, 12);
    }

    deliveryMapRef.current.invalidateSize(false);
    deliveryMapInvalidateCleanupRef.current?.();
    deliveryMapInvalidateCleanupRef.current = scheduleLeafletInvalidate(deliveryMapRef.current);
  }, [
    isProducerSettingsTabActive,
    producerDeliveryEnabled,
    deliveryMapCenter,
    normalizedDeliveryRadiusKm,
    producerDeliveryUseProfileAddress,
    producerSettingsDisabled,
  ]);

  React.useEffect(
    () => () => {
      deliveryMapInvalidateCleanupRef.current?.();
      deliveryMapInvalidateCleanupRef.current = null;
      deliveryMapLifecycleCleanupRef.current?.();
      deliveryMapLifecycleCleanupRef.current = null;
      deliveryMapRef.current?.remove();
      deliveryMapRef.current = null;
      deliveryMapLayerRef.current = null;
    },
    []
  );

  const editTabs = React.useMemo(
    () =>
      [
        { id: 'general' as EditTabKey, label: 'Profil général', visible: true },
        { id: 'public' as EditTabKey, label: 'Contacts publics', visible: true },
        { id: 'notification' as EditTabKey, label: 'Notifications', visible: true },
        { id: 'structure' as EditTabKey, label: 'Structure', visible: structureTabVisible },
        { id: 'sharer' as EditTabKey, label: 'Créateur de commande', visible: true },
        { id: 'producer_settings' as EditTabKey, label: 'Réglages producteur', visible: producerSettingsVisible },
      ].filter((tab) => tab.visible),
    [producerSettingsVisible, structureTabVisible]
  );

  React.useEffect(() => {
    if (editTabs.some((tab) => tab.id === editTab)) return;
    setEditTab('general');
  }, [editTab, editTabs]);

  React.useEffect(() => {
    if (!initialEditTab) return;
    if (!editTabs.some((tab) => tab.id === initialEditTab)) return;
    setEditTab(initialEditTab);
  }, [editTabs, initialEditTab]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('profileEditTab');
    if (!requestedTab) return;
    if (!editTabs.some((tab) => tab.id === requestedTab)) return;
    setEditTab(requestedTab as EditTabKey);
  }, [editTabs, location.search]);

  React.useEffect(() => {
    if (editTab !== 'structure' || !supabaseClient || !canBeProducer) return;
    void refreshStripeConnectionStatus({ silent: true });
  }, [canBeProducer, editTab, refreshStripeConnectionStatus, supabaseClient]);

  React.useEffect(() => {
    if (!isOwnProfile || !isProducerProfile || !supabaseClient) return;
    void refreshStripeConnectionStatus({ silent: true });
  }, [isOwnProfile, isProducerProfile, refreshStripeConnectionStatus, supabaseClient]);

  const getDocumentRecord = React.useCallback(
    (docType: LegalDocumentType) => legalDocumentsByType[docType] ?? null,
    [legalDocumentsByType]
  );

  const ensureDocumentRecord = React.useCallback(
    async (docType: LegalDocumentType) => {
      if (!supabaseClient) return null;
      const existing = getDocumentRecord(docType);
      if (existing) return existing;

      const { data, error } = await supabaseClient
        .from('legal_documents')
        .insert({
          profile_id: user.id,
          legal_entity_id: legalEntityDbId,
          doc_type: docType,
          status: 'draft',
          template_version: LEGAL_DOCUMENT_TEMPLATE_VERSION,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          const { data: conflictData } = await supabaseClient
            .from('legal_documents')
            .select('*')
            .eq('profile_id', user.id)
            .eq('doc_type', docType)
            .eq('template_version', LEGAL_DOCUMENT_TEMPLATE_VERSION)
            .in('status', ['draft', 'uploaded', 'pending_review', 'approved'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return (conflictData as LegalDocumentRow | null) ?? null;
        }
        console.warn('[ProfileView] create legal document draft error', error);
        toast.error('Impossible de preparer ce document.');
        return null;
      }

      return (data as LegalDocumentRow | null) ?? null;
    },
    [getDocumentRecord, legalEntityDbId, supabaseClient, user.id]
  );

  const handleDownloadLegalDocument = React.useCallback(
    async (docType: LegalDocumentType) => {
      if (!supabaseClient) {
        toast.error('Supabase non configuré.');
        return;
      }

      setDownloadingDocType(docType);
      const { data, error } = await supabaseClient.functions.invoke('generate_legal_document_pdf', {
        body: {
          doc_type: docType,
          template_version: LEGAL_DOCUMENT_TEMPLATE_VERSION,
        },
      });
      setDownloadingDocType(null);

      if (error) {
        console.warn('[ProfileView] generate legal document error', error);
        toast.error('Impossible de générer le PDF pré-rempli.');
        return;
      }

      const signedUrl = (data as { signedUrl?: string } | null)?.signedUrl;
      if (!signedUrl) {
        toast.error('URL de téléchargement indisponible.');
        return;
      }

      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    },
    [supabaseClient]
  );

  const handleUploadLegalDocument = React.useCallback(
    async (docType: LegalDocumentType, file: File) => {
      if (!supabaseClient) {
        toast.error('Supabase non configuré.');
        return;
      }
      if (!isPdfFile(file)) {
        toast.error('Seuls les fichiers PDF sont acceptés.');
        return;
      }

      const existing = getDocumentRecord(docType);
      if (existing?.status === 'approved') {
        toast.info('Ce document est déjà validé.');
        return;
      }

      setUploadingDocType(docType);
      const record = await ensureDocumentRecord(docType);
      if (!record) {
        setUploadingDocType(null);
        return;
      }

      const path = getSignedDocumentPath(docType, user.id, record.id);
      const { error: uploadError } = await supabaseClient.storage
        .from('signed_documents')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' });

      if (uploadError) {
        console.warn('[ProfileView] signed document upload error', uploadError);
        toast.error('Upload du document signé impossible.');
        setUploadingDocType(null);
        return;
      }

      const { error: updateError } = await supabaseClient
        .from('legal_documents')
        .update({
          legal_entity_id: legalEntityDbId,
          status: 'pending_review',
          signed_pdf_path: path,
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', record.id)
        .eq('profile_id', user.id);

      if (updateError) {
        console.warn('[ProfileView] legal document update error', updateError);
        toast.error('Impossible de soumettre le document pour validation.');
        setUploadingDocType(null);
        return;
      }

      await loadLegalDocuments();
      setUploadingDocType(null);
      toast.success('Document envoyé. Validation en attente.');
    },
    [ensureDocumentRecord, getDocumentRecord, legalEntityDbId, loadLegalDocuments, supabaseClient, user.id]
  );

  const handleSave = async () => {
    const socialLinks: Record<string, string | null> = {
      instagram: socialInstagram.trim() || null,
      facebook: socialFacebook.trim() || null,
      tiktok: socialTiktok.trim() || null,
    };
    const filteredSocials = Object.fromEntries(
      Object.entries(socialLinks).filter(([, v]) => Boolean(v))
    );

    const opening: Record<string, string> = {};
    Object.entries(openingHoursSlots).forEach(([day, slot]) => {
      const { start, end } = slot;
      if (start && end) {
        opening[day] = `${start} - ${end}`;
        return;
      }
      if (start) {
        opening[day] = start;
        return;
      }
      if (end) {
        opening[day] = end;
      }
    });

    if (producerDeliveryEnabled && !producerDeliveryUseProfileAddress && !deliveryMapCenter) {
      toast.error('Definissez un centre de livraison sur la carte.');
      return;
    }

    const normalizeWeight = (value: number) => (Number.isFinite(value) && value > 0 ? value : undefined);
    const normalizeDistance = (value: number) =>
      Number.isFinite(value) && value >= 0 ? value : undefined;
    const normalizeFee = (value: number) => (Number.isFinite(value) && value >= 0 ? value : undefined);
    const deliveryLeadPayload =
      deliveryLeadType === 'fixed_day'
        ? { deliveryLeadType: 'fixed_day' as DeliveryLeadType, deliveryFixedDay }
        : { deliveryLeadType: 'days' as DeliveryLeadType, deliveryLeadDays };

    const shouldPersistProducerSettings = producerSettingsVisible && producerEligible;
    const entityType: LegalEntity['entityType'] =
      accountType === 'association'
        ? 'association'
        : accountType === 'public_institution'
        ? 'public_institution'
        : 'company';
    const hasLegalDraft =
      accountType !== 'individual' &&
      Boolean(
        legalName.trim() ||
          siret.trim() ||
          vatNumber.trim() ||
          legalForm.trim() ||
          iban.trim() ||
          accountHolderName.trim() ||
          representativeFirstName.trim() ||
          representativeLastName.trim() ||
          representativeEmail.trim() ||
          representativePhone.trim() ||
          representativeTitle.trim() ||
          representativeBirthDate.trim() ||
          vatRegime !== 'unknown'
      );
    const baseLegalEntity: Partial<LegalEntity> = {
      legalName: legalName.trim() || undefined,
      siret: siret.trim() || undefined,
      vatNumber: vatNumber.trim() || undefined,
      vatRegime: vatRegime ?? 'unknown',
      entityType,
      country: country.trim() || 'FR',
      legalForm: legalForm.trim() || undefined,
      iban: iban.trim() || undefined,
      accountHolderName: accountHolderName.trim() || undefined,
      representativeFirstName: representativeFirstName.trim() || undefined,
      representativeLastName: representativeLastName.trim() || undefined,
      representativeEmail: representativeEmail.trim() || undefined,
      representativePhone: representativePhone.trim() || undefined,
      representativeTitle: representativeTitle.trim() || undefined,
      representativeBirthDate: representativeBirthDate.trim() || undefined,
      representativeUseProfileAddress,
      representativeAddressLine1: representativeUseProfileAddress ? undefined : representativeAddressLine1.trim() || undefined,
      representativeAddressLine2: representativeUseProfileAddress ? undefined : representativeAddressLine2.trim() || undefined,
      representativeCity: representativeUseProfileAddress ? undefined : representativeCity.trim() || undefined,
      representativePostcode: representativeUseProfileAddress ? undefined : representativePostcode.trim() || undefined,
      representativeCountry: representativeUseProfileAddress ? (country.trim() || 'FR') : representativeCountry.trim() || 'FR',
    };
    const producerSettingsPayload = shouldPersistProducerSettings
      ? {
          producerCategory: producerCategory.trim() || undefined,
          ...deliveryLeadPayload,
          chronofreshEnabled,
          chronofreshMinWeight: chronofreshEnabled ? normalizeWeight(chronofreshMinWeight) : undefined,
          chronofreshMaxWeight: chronofreshEnabled ? normalizeWeight(chronofreshMaxWeight) : undefined,
          producerDeliveryEnabled,
          producerDeliveryDays: producerDeliveryEnabled ? producerDeliveryDays : undefined,
          producerDeliveryMinWeight: producerDeliveryEnabled ? normalizeWeight(producerDeliveryMinWeight) : undefined,
          producerDeliveryMaxWeight: producerDeliveryEnabled ? normalizeWeight(producerDeliveryMaxWeight) : undefined,
          producerDeliveryRadiusKm: normalizeDistance(producerDeliveryRadiusKm),
          producerDeliveryFee: normalizeFee(producerDeliveryFee),
          producerDeliveryUseProfileAddress,
          producerDeliveryCenterLat:
            producerDeliveryUseProfileAddress || !deliveryMapCenter
              ? undefined
              : deliveryMapCenter.lat,
          producerDeliveryCenterLng:
            producerDeliveryUseProfileAddress || !deliveryMapCenter
              ? undefined
              : deliveryMapCenter.lng,
          producerPickupEnabled,
          producerPickupDays: producerPickupEnabled ? producerPickupDays : undefined,
          producerPickupStartTime: producerPickupEnabled ? producerPickupStartTime.trim() : undefined,
          producerPickupEndTime: producerPickupEnabled ? producerPickupEndTime.trim() : undefined,
          producerPickupMinWeight: producerPickupEnabled ? normalizeWeight(producerPickupMinWeight) : undefined,
          producerPickupMaxWeight: producerPickupEnabled ? normalizeWeight(producerPickupMaxWeight) : undefined,
        }
      : {};
    const legalEntityDraft =
      accountType !== 'individual' && (hasLegalDraft || shouldPersistProducerSettings)
        ? { ...baseLegalEntity, ...producerSettingsPayload }
        : undefined;
    const legalEntity = legalEntityDraft ? (legalEntityDraft as LegalEntity) : undefined;

    const labelsSaved = producerSettingsVisible ? await saveProducerLabels() : true;
    if (!labelsSaved) return;
    onUpdateUser({
      name: name.trim() || user.name,
      address: address.trim(),
      addressDetails: addressDetails.trim(),
      city: city.trim(),
      postcode: postcode.trim(),
      phone: phone.trim(),
      accountType,
      handle: handleValue.trim() || defaultHandle,
      profileVisibility,
      addressVisibility,
      tagline: tagline.trim(),
      website: website.trim(),
      phonePublic: phonePublic.trim() || undefined,
      contactEmailPublic: contactEmailPublic.trim() || undefined,
      notificationEmailPreferences,
      offersOnSitePickup,
      ...(shouldPersistProducerSettings ? { freshProductsCertified } : {}),
      socialLinks: Object.keys(filteredSocials).length ? filteredSocials : undefined,
      openingHours: Object.keys(opening).length ? opening : undefined,
      legalEntity,
    });
    onClose();
  };

  const handleSaveRef = React.useRef(handleSave);

  React.useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  React.useEffect(() => {
    if (!onRegisterSave) return;
    const handler = () => handleSaveRef.current();
    onRegisterSave(handler);
    return () => {
      onRegisterSave(null);
    };
  }, [onRegisterSave]);

  const renderEligibilityItem = (label: string, isValid: boolean) => {
    const Icon = isValid ? Check : Lock;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
            isValid ? 'bg-[#E6F6F0] text-[#0F5132]' : 'bg-gray-100 text-[#9CA3AF]'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className={isValid ? 'text-[#1F2937]' : 'text-[#6B7280]'}>{label}</span>
      </div>
    );
  };

  const renderLegalDocumentCard = (card: {
    docType: LegalDocumentType;
    title: string;
    downloadLabel: string;
  }) => {
    const doc = legalDocumentsByType[card.docType];
    const status = doc?.status;
    const isApproved = status === 'approved';
    const isUploading = uploadingDocType === card.docType;
    const isDownloading = downloadingDocType === card.docType;
    const showRejectedReason = status === 'rejected' && Boolean(doc?.rejection_reason?.trim());
    const uploadInputId = `legal-doc-upload-${card.docType}`;

    return (
      <article key={card.docType} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[#1F2937]">{card.title}</h4>
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${getLegalDocumentStatusClassName(status)}`}
          >
            {getLegalDocumentStatusLabel(status)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleDownloadLegalDocument(card.docType)}
          disabled={isDownloading}
          className="w-full rounded-lg border border-[#FF6B4A] px-3 py-2 text-sm font-medium text-[#FF6B4A] transition-colors hover:bg-[#FFF1ED] disabled:opacity-60"
        >
          {isDownloading ? 'Génération du PDF...' : card.downloadLabel}
        </button>

        <input
          id={uploadInputId}
          type="file"
          accept="application/pdf,.pdf"
          disabled={isApproved || isUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void handleUploadLegalDocument(card.docType, file);
          }}
          className="sr-only"
        />
        <label
          htmlFor={uploadInputId}
          className={`block w-full rounded-lg border border-[#FF6B4A] px-3 py-2 text-center text-sm font-medium text-[#FF6B4A] transition-colors ${
            isApproved || isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[#FFF1ED]'
          }`}
        >
          {isUploading ? 'Envoi du PDF...' : 'Déposer le PDF signé'}
        </label>

        {isUploading && <p className="text-xs text-[#B45309]">Envoi en cours...</p>}
        {showRejectedReason && (
          <p className="text-xs text-[#B91C1C]">Motif du refus: {doc?.rejection_reason}</p>
        )}
      </article>
    );
  };

  const renderEditTabContent = () => {
    if (editTab === 'general') {
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Identité et visibilité</h3>
              <p className="text-xs text-[#6B7280]">Nom, identifiant, bio, image et visibilité du profil.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-[#6B7280]">Nom complet</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    placeholder="Nom complet"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-[#6B7280]">Identifiant profil</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#9CA3AF]">@</span>
                    <input
                      type="text"
                      value={handleValue}
                      onChange={(e) => setHandleValue(e.target.value.replace(/\s+/g, ''))}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] text-sm"
                      placeholder="votrepseudo"
                    />
                  </div>
                  <p className="text-xs text-[#9CA3AF]">Utile pour le lien du profil.</p>
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Bio / phrase</label>
                  <textarea
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Quelques mots sur vous..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm text-[#6B7280]">Visibilité du profil</label>
                  <div className="profile-visibility-group flex items-center gap-2">
                    <VisibilityButton
                      label="Public"
                      icon={Globe}
                      active={profileVisibility === 'public'}
                      onClick={() => setProfileVisibility('public')}
                    />
                    <VisibilityButton
                      label="Privé"
                      icon={Lock}
                      active={profileVisibility === 'private'}
                      onClick={() => setProfileVisibility('private')}
                    />
                  </div>
                  <p className="text-xs text-[#9CA3AF]">
                    Le mode privé limite la visibilité de votre profil et de vos informations.
                  </p>
                </div>
              </div>
              <div className="space-y-3 rounded-xl bg-[#F9FAFB] p-4 border border-gray-200">
                <div className="space-y-2">
                  <label className="block text-sm text-[#6B7280]">Photo de profil</label>
                  <AvatarUploader
                    supabaseClient={supabaseClient ?? null}
                    userId={user.id}
                    currentPath={user.avatarPath}
                    onUploadComplete={onAvatarUpdated}
                    fallbackSrc={avatarFallbackSrc}
                    avatarUpdatedAt={avatarVersion}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Coordonnées</h3>
              <p className="text-xs text-[#6B7280]">Pour sécuriser le fonctionnement de la plateforme.</p>
            </div>
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="space-y-3">
                <label className="block text-sm text-[#6B7280]">Adresse *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="12 Rue Caldagues"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                  {address.trim() ? (
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#E6F6F0] border border-[#C8EBDD] text-[#0F5132]">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Informations complementaires à l'adresse</label>
                  <input
                    type="text"
                    value={addressDetails}
                    onChange={(e) => setAddressDetails(e.target.value)}
                    placeholder="Lieu précis, bâtiment, étage, code d'entrée"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-[#6B7280]">Code postal *</label>
                    <input
                      type="text"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      placeholder="75001"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Ville *</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Paris"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Pays *</label>
                    <select
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] bg-white"
                      defaultValue="France"
                      disabled
                    >
                      <option>France</option>
                    </select>
                  </div>
                </div>
                <div className="profile-visibility-group flex items-center gap-2">
                  <VisibilityButton
                    label="Adresse visible"
                    icon={MapPin}
                    active={addressVisibility === 'public'}
                    onClick={() => setAddressVisibility('public')}
                  />
                  <VisibilityButton
                    label="Adresse masquée"
                    icon={Lock}
                    active={addressVisibility === 'private'}
                    onClick={() => setAddressVisibility('private')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm text-[#6B7280]">Téléphone *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    placeholder="06 00 00 00 00"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Vérification d'identité</h3>
              {user.verified && (
                <span className="px-3 py-1 bg-[#E6F6F0] text-[#0F5132] text-xs rounded-full flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Compte vérifié
                </span>
              )}
            </div>
            <div className="space-y-2 text-sm text-[#6B7280]">
              <p>La vérification est nécessaire pour pouvoir créer des commandes ou accéder au statut de producteur.</p>
              <p className="text-xs text-[#9CA3AF]">
                Pour l'instant, la validation est réalisée manuellement par l'équipe : contacter Théo Fera.
              </p>
            </div>
            {!user.verified && (
              <button
                type="button"
                className="w-full py-2 bg-[#28C1A5] text-white rounded-lg hover:bg-[#23A88F] transition-colors"
              >
                Demander la vérification
              </button>
            )}
          </section>
          <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Type de compte</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm text-[#6B7280]">Type de compte</label>
                <select
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(
                      (e.target.value as
                        | 'individual'
                        | 'auto_entrepreneur'
                        | 'company'
                        | 'association'
                        | 'public_institution') ?? 'individual'
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                >
                  <option value="individual">Particulier</option>
                  <option value="auto_entrepreneur">Auto-entreprise</option>
                  <option value="company">Entreprise</option>
                  <option value="association">Association</option>
                  <option value="public_institution">Autre</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      );
    }
    if (editTab === 'public') {
      return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-xl bg-[#F9FAFB] p-4 border border-gray-200">
              <h3 className="text-[#1F2937] font-semibold">Contacts publics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#6B7280]">Téléphone public</label>
                  <input
                    type="text"
                    value={phonePublic}
                    onChange={(e) => setPhonePublic(e.target.value)}
                    placeholder="+33..."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Email public</label>
                  <input
                    type="email"
                    value={contactEmailPublic}
                    onChange={(e) => setContactEmailPublic(e.target.value)}
                    placeholder="contact@votre-site.fr"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[#374151]">
                  <input
                    type="checkbox"
                    checked={offersOnSitePickup}
                    onChange={(e) => setOffersOnSitePickup(e.target.checked)}
                    className="rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                  />
                  Vente à la ferme
                </label>
              </div>
            </div>
            <div className="space-y-3 rounded-xl bg-[#FFF8F3] p-4 border border-[#FFE0D1]">
              <h3 className="text-[#1F2937] font-semibold">Réseaux et liens</h3>
              <div className="space-y-2">
                <label className="block text-sm text-[#6B7280]">Site web</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://votresite.fr"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div className="space-y-2">
                <input
                  type="url"
                  value={socialInstagram}
                  onChange={(e) => setSocialInstagram(e.target.value)}
                  placeholder="Lien Instagram"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
                <input
                  type="url"
                  value={socialFacebook}
                  onChange={(e) => setSocialFacebook(e.target.value)}
                  placeholder="Lien Facebook"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
                <input
                  type="url"
                  value={socialTiktok}
                  onChange={(e) => setSocialTiktok(e.target.value)}
                  placeholder="Lien TikTok"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
                <p className="text-xs text-[#9CA3AF]">Laissez vide si vous ne souhaitez pas afficher ces liens.</p>
              </div>
            </div>
          </div>
        </section>
      );
    }
    if (editTab === 'notification') {
      return (
        <section className="rounded-2xl border border-[#FFE0D1] bg-white p-4 space-y-4 shadow-sm">
          <div className="flex items-start gap-3 rounded-xl bg-[#FFF8F3] border border-[#FFE0D1] p-4">
            <div className="shrink-0 rounded-full bg-[#FF6B4A]/10 p-2 text-[#FF6B4A]">
              <Mail className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[#1F2937] font-semibold">Notifications par e-mail</h3>
              <p className="text-sm text-[#6B7280]">
                Activez/Désactivez les notifications par e-mail.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {visibleNotificationEmailPreferences.map((definition) => {
              const isEnabled = notificationEmailPreferences[definition.type];
              return (
                <label
                  key={definition.type}
                  className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-[#FCFCFD] px-4 py-3 transition-colors hover:border-[#FFD7CA]"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#1F2937]">{definition.label}</p>
                    <p className="text-sm text-[#6B7280]">{definition.description}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-3 pt-0.5">
                    <span className={`text-xs font-medium ${isEnabled ? 'text-[#0F5132]' : 'text-[#6B7280]'}`}>
                      {isEnabled ? 'Active' : 'Desactivee'}
                    </span>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(event) =>
                        setNotificationEmailPreferences((prev) => ({
                          ...prev,
                          [definition.type]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      );
    }
    if (editTab === 'structure') {
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#D7E3FF] bg-[#F6F8FF] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Informations legales</h3>
              <span className="text-xs text-[#6B7280]">
                Ces informations peuvent être complétées progressivement.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm text-[#6B7280]">Raison sociale</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Votre entreprise"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">SIRET</label>
                <input
                  type="text"
                  value={siret}
                  onChange={(e) => setSiret(e.target.value)}
                  placeholder="123 456 789 00012"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">Regime TVA</label>
                <select
                  value={vatRegime ?? 'unknown'}
                  onChange={(e) => setVatRegime(e.target.value as LegalEntity['vatRegime'])}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                >
                  <option value="unknown">Sélectionner un régime</option>
                  <option value="franchise">Franchise de base (TVA non applicable)</option>
                  <option value="assujetti">Assujetti à la TVA</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">Numéro de TVA</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="FRXX999999999"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
                {vatRegime === 'assujetti' && !vatNumber.trim() ? (
                  <p className="mt-2 text-xs text-[#B45309]">
                    Le numéro de TVA est requis pour un régime assujetti.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">Pays de la structure</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] bg-white"
                >
                  <option value="FR">France</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">Forme juridique officielle</label>
                <input
                  type="text"
                  value={legalForm}
                  onChange={(e) => setLegalForm(e.target.value)}
                  placeholder="SAS, SARL, EARL..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-[#6B7280]">Coordonnées bancaires</label>
              <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#6B7280]">Identité du compte</label>
                  <input
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    placeholder="Nom du titulaire"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">IBAN</label>
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="FR76...."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-[#D7E3FF] bg-white p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-[#1F2937]">Représentant légal</h4>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#6B7280]">Prénom</label>
                  <input
                    type="text"
                    value={representativeFirstName}
                    onChange={(e) => setRepresentativeFirstName(e.target.value)}
                    placeholder="Marie"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Nom</label>
                  <input
                    type="text"
                    value={representativeLastName}
                    onChange={(e) => setRepresentativeLastName(e.target.value)}
                    placeholder="Dupont"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Fonction</label>
                  <input
                    type="text"
                    value={representativeTitle}
                    onChange={(e) => setRepresentativeTitle(e.target.value)}
                    placeholder="Gérant, présidente..."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Date de naissance</label>
                  <input
                    type="date"
                    value={representativeBirthDate}
                    onChange={(e) => setRepresentativeBirthDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">E-mail</label>
                  <input
                    type="email"
                    value={representativeEmail}
                    onChange={(e) => setRepresentativeEmail(e.target.value)}
                    placeholder="gerant@votre-structure.fr"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#6B7280]">Téléphone</label>
                  <input
                    type="tel"
                    value={representativePhone}
                    onChange={(e) => setRepresentativePhone(e.target.value)}
                    placeholder="06 00 00 00 00"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#374151]">
                <input
                  type="checkbox"
                  checked={representativeUseProfileAddress}
                  onChange={(e) => setRepresentativeUseProfileAddress(e.target.checked)}
                  className="rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                />
                Utiliser l&apos;adresse du profil pour le représentant légal
              </label>
              {!representativeUseProfileAddress && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-[#6B7280]">Adresse</label>
                    <input
                      type="text"
                      value={representativeAddressLine1}
                      onChange={(e) => setRepresentativeAddressLine1(e.target.value)}
                      placeholder="12 rue des Tilleuls"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Complément</label>
                    <input
                      type="text"
                      value={representativeAddressLine2}
                      onChange={(e) => setRepresentativeAddressLine2(e.target.value)}
                      placeholder="Bâtiment, étage..."
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Ville</label>
                    <input
                      type="text"
                      value={representativeCity}
                      onChange={(e) => setRepresentativeCity(e.target.value)}
                      placeholder="Lyon"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Code postal</label>
                    <input
                      type="text"
                      value={representativePostcode}
                      onChange={(e) => setRepresentativePostcode(e.target.value)}
                      placeholder="69001"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B7280]">Pays</label>
                    <select
                      value={representativeCountry}
                      onChange={(e) => setRepresentativeCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] bg-white"
                    >
                      <option value="FR">France</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#D9E7F9] bg-[#F8FBFF] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <h3 className="text-[#1F2937] font-semibold">Compte Stripe producteur</h3>
                <p className="text-sm text-[#6B7280]">
                  Reliez votre structure à Stripe pour encaisser les paiements.
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${getStripeConnectionStatusClassName(stripeConnection.status)}`}
              >
                {getStripeConnectionStatusLabel(stripeConnection.status)}
              </span>
            </div>

            <div className="rounded-xl border border-[#D7E3FF] bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1F2937]">
                    <Link2 className="h-4 w-4 text-[#2563EB]" />
                    {stripeConnection.accountId ? 'Compte Stripe Connect déjà créé' : 'Compte Stripe Connect à créer'}
                  </div>
                </div>
                {stripeConnection.accountId && (
                  <div className="text-xs text-[#6B7280]">
                    <span className="font-semibold text-[#1F2937]">ID</span>{' '}
                    <span className="font-mono">{stripeConnection.accountId}</span>
                  </div>
                )}
              </div>

              {savedStripePrefillMissingFields.length > 0 && (
                <div className="rounded-lg border border-[#FFE0D1] bg-[#FFF6F0] px-3 py-3 text-xs text-[#B45309]">
                  <p className="font-semibold text-[#1F2937]">Informations à compléter avant de commencer à connecter Stripe</p>
                  <ul className="mt-2 space-y-1 text-[#6B7280]">
                    {savedStripePrefillMissingFields.map((field) => (
                      <li key={field}>• {field}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-[#FCFCFD] px-3 py-2">
                  <div className="text-xs text-[#6B7280]">Votre compte est-il prêt à réaliser et encaisser des commandes ?</div>
                  <div className="mt-1 text-[#1F2937] font-medium">
                    {stripeConnection.readyForOrders ? 'Oui' : 'Non'}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-[#FCFCFD] px-3 py-2">
                  <div className="text-xs text-[#6B7280]">Dernière synchronisation</div>
                  <div className="mt-1 text-[#1F2937] font-medium">
                    {stripeConnection.lastSyncedAt
                      ? new Date(stripeConnection.lastSyncedAt).toLocaleString('fr-FR')
                      : 'Jamais'}
                  </div>
                </div>
              </div>

              {stripeLegalInfoNeedsSave && (
                <div className="rounded-lg border border-[#FFE0D1] bg-[#FFF6F0] px-3 py-2 text-xs text-[#B45309]">
                  Enregistrez d'abord cette section pour que Stripe lise la dernière version de vos informations
                  légales.
                </div>
              )}

              {!hasLegalInfo && (
                <div className="rounded-lg border border-[#FFE0D1] bg-[#FFF6F0] px-3 py-2 text-xs text-[#B45309]">
                  La raison sociale et le SIRET sont requis avant de lancer l'onboarding Stripe.
                </div>
              )}

              

              {stripeConnection.requirementsDisabledReason && (
                <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
                  Stripe a signalé un blocage : {stripeConnection.requirementsDisabledReason}
                </div>
              )}

              {stripeConnection.outstandingRequirements.length > 0 && (
                <div className="rounded-lg border border-[#D9E7F9] bg-[#F8FBFF] px-3 py-3 text-xs text-[#1D4ED8]">
                  <p className="font-semibold text-[#1F2937]">Champs encore demandés par Stripe</p>
                  <ul className="mt-2 space-y-1 text-[#6B7280]">
                    {stripeConnection.outstandingRequirements.map((item) => (
                      <li key={item}>• {normalizeStripeRequirementLabel(item)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleStartStripeOnboarding()}
                  disabled={stripeOnboardingLoading || stripeLegalInfoNeedsSave || !canBeProducer || !hasLegalInfo}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: '#2563EB' }}
                  onMouseEnter={(event) => {
                    if ((event.currentTarget as HTMLButtonElement).disabled) return;
                    event.currentTarget.style.backgroundColor = '#1D4ED8';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = '#2563EB';
                  }}
                >
                  {stripeOnboardingLoading
                    ? 'Ouverture de Stripe...'
                    : stripeConnection.status === 'connected'
                      ? 'Mettre à jour les informations Stripe'
                      : stripeConnection.accountId
                        ? 'Continuer la connection à Stripe'
                        : 'Connecter la structure à Stripe'}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshStripeConnectionStatus()}
                  disabled={stripeStatusLoading || stripeOnboardingLoading || !canBeProducer}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#1F2937] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {stripeStatusLoading ? 'Vérification Stripe...' : 'Actualiser le statut'}
                </button>
              </div>

            </div>
          </section>

          {requestedLegalDocumentTypes.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-[#1F2937] font-semibold">Documents légaux (Pas encore opérationnel)</h3>
                {legalDocumentsLoading && (
                  <span className="text-xs text-[#6B7280]">Chargement...</span>
                )}
              </div>
              {canBeProducer && (
                <div className="rounded-lg border border-[#FFE0D1] bg-[#FFF6F0] px-3 py-2 text-xs text-[#B45309]">
                  {producerDocsApproved
                    ? 'Mandats producteur validés.'
                    : producerDocsPendingReview
                    ? 'Mandats de faturation et d encaissement en attente de validation.'
                    : 'Mandats producteur à signer.'}
                </div>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {structureDocumentCards.map((card) => renderLegalDocumentCard(card))}
              </div>
            </section>
          )}
        </div>
      );
    }
    if (editTab === 'sharer') {
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Horaire par défaut pour la récupération des produits</h3>
              <span className="text-xs text-[#6B7280]">Définissez les horaires proposés aux participants.</span>
            </div>
            <div className="space-y-2">
              {deliveryDayOptions.map((dayOption) => (
                <div key={`opening-${dayOption.id}`} className="flex items-center gap-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#374151]">
                    {dayOption.label}
                  </span>
                  <input
                    type="time"
                    value={openingHoursSlots[dayOption.id].start}
                    onChange={(e) => handleOpeningHoursChange(dayOption.id, 'start', e.target.value)}
                    className="w-28 px-3 py-2 text-sm text-center border border-gray-200 rounded-full focus:outline-none focus:border-[#FF6B4A]"
                  />
                  <span className="text-sm text-[#9CA3AF]">-</span>
                  <input
                    type="time"
                    value={openingHoursSlots[dayOption.id].end}
                    onChange={(e) => handleOpeningHoursChange(dayOption.id, 'end', e.target.value)}
                    className="w-28 px-3 py-2 text-sm text-center border border-gray-200 rounded-full focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              ))}
              <p className="text-xs text-[#9CA3AF]">Laissez vide pour indiquer une fermeture.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Charte du partageur (Pas encore finalisée)</h3>
              {sharerCharterAccepted && (
                <span className="px-3 py-1 bg-[#E6F6F0] text-[#0F5132] text-xs rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Charte validée
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B7280]">
              Vous devez valider chacun de ces engagements pour pouvoir créer des commandes.
            </p>
            <div className="space-y-4">
              {sharerCharterSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <h4 className="text-sm font-semibold text-[#374151]">{section.title}</h4>
                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    {section.items.map((item, index) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 px-4 py-3 text-sm text-[#374151] ${
                          index > 0 ? 'border-t border-gray-200' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(sharerCharterChecks[item.id])}
                          onChange={(e) =>
                            setSharerCharterChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))
                          }
                          className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Eligibilité créateur de commande</h3>
            </div>
            <div className="space-y-2">
              {renderEligibilityItem('Identité vérifiée', Boolean(user.verified))}
              {renderEligibilityItem('Adresse complète (adresse + code postal + ville)', hasAddress)}
            </div>
          </section>
        </div>
      );
    }
    if (editTab === 'producer_settings') {
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Eligibilité producteur</h3>
            </div>
            <div className="space-y-2">
              {renderEligibilityItem('Type de compte éligible (entreprise / association / collectivité)', canBeProducer)}
              {renderEligibilityItem('Raison sociale + SIRET complets', hasLegalInfo)}
            </div>
            {producerSettingsDisabled && (
              <p className="text-xs text-[#B45309]">
                Complétez la structure pour activer les réglages producteur.
              </p>
            )}
          </section>

          <section
            className={`rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm ${
              producerSettingsDisabled ? 'opacity-60' : ''
            }`}
            aria-disabled={producerSettingsDisabled}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Certifications et labels</h3>
              <span className="text-xs text-[#6B7280]">Informations visibles sur votre profil producteur.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-[#6B7280]">Catégorie de producteur</label>
                <select
                  value={producerCategory}
                  onChange={(e) => setProducerCategory(e.target.value)}
                  disabled={producerSettingsDisabled}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {producerCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#374151]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={freshProductsCertified}
                    onChange={(e) => setFreshProductsCertified(e.target.checked)}
                    disabled={producerSettingsDisabled}
                    className="rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                  />
                  Habilitation a partager des produits frais
                </label>
              </div>
            </div>
            {producerLabelsLoading ? (
              <p className="text-xs text-[#6B7280]">Chargement des labels...</p>
            ) : producerLabels.length ? (
              <div className="flex flex-wrap gap-3">
                {producerLabels.map((entry) => (
                  <div
                    key={entry.label}
                    className="flex flex-col gap-1 rounded-xl border border-[#FFE0D1] bg-[#FFF1E6] px-3 py-2 text-xs text-[#B45309]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{entry.label}</span>
                      {entry.obtentionYear ? (
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-[#B45309]">
                          {entry.obtentionYear}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemoveProducerLabel(entry.label)}
                        disabled={producerSettingsDisabled}
                        className={`ml-auto rounded-full border border-[#FBD0B8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#B45309] hover:text-[#FF6B4A] ${
                          producerSettingsDisabled ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                        aria-label={`Retirer le label ${entry.label}`}
                      >
                        Retirer
                      </button>
                    </div>
                    {entry.description ? (
                      <span className="text-[11px] text-[#8C5A2B]">{entry.description}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6B7280]">Aucun label d'exploitation pour l'instant.</p>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                type="text"
                value={producerLabelInput}
                onChange={(e) => setProducerLabelInput(e.target.value)}
                onKeyDown={handleProducerLabelKeyDown}
                placeholder="Nom du label"
                disabled={producerSettingsDisabled}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              />
              <input
                type="text"
                value={producerLabelDescription}
                onChange={(e) => setProducerLabelDescription(e.target.value)}
                onKeyDown={handleProducerLabelKeyDown}
                placeholder="Description (optionnel)"
                disabled={producerSettingsDisabled}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              />
              <input
                type="number"
                value={producerLabelYear}
                onChange={(e) => setProducerLabelYear(e.target.value)}
                onKeyDown={handleProducerLabelKeyDown}
                placeholder="Annee d'obtention"
                min="1900"
                max="2100"
                step="1"
                disabled={producerSettingsDisabled}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddProducerLabel}
                disabled={producerSettingsDisabled || !producerLabelInput.trim()}
                className={`px-4 py-2 rounded-lg border border-[#FF6B4A] text-[#FF6B4A] font-semibold hover:bg-[#FFF1E6] ${
                  producerSettingsDisabled || !producerLabelInput.trim() ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                Ajouter
              </button>
            </div>
            {!supabaseClient && (
              <p className="text-xs text-[#9CA3AF]">
                Supabase non configuré : les labels ne seront pas sauvegardés.
              </p>
            )}
          </section>

          <section
            className={`rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm ${
              producerSettingsDisabled ? 'opacity-60' : ''
            }`}
            aria-disabled={producerSettingsDisabled}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Réglages producteur - Livraison des produits</h3>
              <span className="text-xs text-[#6B7280]">
                Définissez les options proposées aux partageurs pour la livraison et les seuils de poids minimum et maximum d'acceptation.
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <label className="flex items-center gap-2 text-sm text-[#1F2937] font-semibold">
                  <input
                    type="checkbox"
                    checked={chronofreshEnabled}
                    onChange={(e) => setChronofreshEnabled(e.target.checked)}
                    disabled={producerSettingsDisabled}
                  />
                  Expédition Chronofresh
                </label>
                <p className="text-xs text-[#6B7280]">Option gérée par le site : les frais de livraison sont répartis entre les participants à la commande.</p>
                <div className="space-y-2">
                  <label className="block text-xs text-[#6B7280]">indiquez dans quel délai vous vous engagez à avoir livré la commande apres cloture de celle-ci (Chronofresh prend en moyenne 24h pour livrer à partir du moment où il a récupéré la commande)</label>
                  <select
                    value={deliveryLeadType === 'fixed_day' ? 'fixed_day' : `days-${deliveryLeadDays}`}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'fixed_day') {
                        setDeliveryLeadType('fixed_day');
                      } else {
                        const days = Number(value.replace('days-', ''));
                        setDeliveryLeadType('days');
                        if (Number.isFinite(days)) {
                          setDeliveryLeadDays(days);
                        }
                      }
                    }}
                    disabled={producerSettingsDisabled || !chronofreshEnabled}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  >
                    <option value="days-1">J+1</option>
                    <option value="days-2">J+2</option>
                    <option value="days-3">J+3</option>
                    <option value="days-4">J+4</option>
                    <option value="days-5">J+5</option>
                    <option value="days-6">J+6</option>
                    <option value="days-7">J+7</option>
                    <option value="fixed_day">Jour fixe</option>
                  </select>

                  {deliveryLeadType === 'fixed_day' && (
                    <select
                      value={deliveryFixedDay}
                      onChange={(e) => setDeliveryFixedDay(e.target.value as DeliveryDay)}
                      disabled={producerSettingsDisabled || !chronofreshEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    >
                      {deliveryDayOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids min accepté (en kg)</label>
                    <input
                      type="number"
                      value={chronofreshMinWeight}
                      onChange={(e) => setChronofreshMinWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !chronofreshEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids max accepté (en kg)</label>
                    <input
                      type="number"
                      value={chronofreshMaxWeight}
                      onChange={(e) => setChronofreshMaxWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !chronofreshEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <label className="flex items-center gap-2 text-sm text-[#1F2937] font-semibold">
                  <input
                    type="checkbox"
                    checked={producerDeliveryEnabled}
                    onChange={(e) => setProducerDeliveryEnabled(e.target.checked)}
                    disabled={producerSettingsDisabled}
                  />
                  Vous pouvez assurer la livraison selon certaines conditions (à préciser ci-dessous)
                </label>
                <p className="text-xs text-[#6B7280]">Sélectionnez vos jours de livraison dans la semaine.</p>
                <div className="flex flex-wrap gap-2">
                  {deliveryDayOptions.map((option) => {
                    const isActive = producerDeliveryDays.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleDeliveryDay(option.id, setProducerDeliveryDays)}
                        disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                        className={`px-3 py-1 rounded-full border text-xs ${
                          isActive
                            ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                            : 'border-gray-200 text-[#6B7280]'
                        } ${producerSettingsDisabled || !producerDeliveryEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids min accepté (en kg)</label>
                    <input
                      type="number"
                      value={producerDeliveryMinWeight}
                      onChange={(e) => setProducerDeliveryMinWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids max accepté (en kg)</label>
                    <input
                      type="number"
                      value={producerDeliveryMaxWeight}
                      onChange={(e) => setProducerDeliveryMaxWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-[#6B7280]">Indiquez votre zone de livraison (km)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={producerDeliveryRadiusKm}
                      onChange={(e) => setProducerDeliveryRadiusKm(Number(e.target.value))}
                      min="0"
                      step="1"
                      disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      value={producerDeliveryRadiusKm}
                      onChange={(e) => setProducerDeliveryRadiusKm(Number(e.target.value))}
                      min="0"
                      max="100"
                      step="1"
                      disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                      className="flex-1 accent-[#FF6B4A]"
                    />
                    <span className="text-xs text-[#6B7280]">{producerDeliveryRadiusKm.toFixed(0)} km</span>
                  </div>
                </div>

                {producerDeliveryEnabled && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-[#1F2937] font-semibold">Zone de livraison</h4>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#374151]">
                      <input
                        type="checkbox"
                        checked={producerDeliveryUseProfileAddress}
                        onChange={(e) => setProducerDeliveryUseProfileAddress(e.target.checked)}
                        disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                      />
                      Même centre de la zone de livraison que vôtre adresse.
                    </label>
                    {!producerDeliveryUseProfileAddress && (
                      <p className="text-xs text-[#6B7280]">
                        Déplacez le point sur la carte en cliquant pour definir le centre de la zone de livraison.
                      </p>
                    )}
                    <div
                      ref={deliveryMapContainerRef}
                      className="w-full rounded-lg overflow-hidden border border-gray-200"
                      style={{ height: 260, minHeight: 260 }}
                    />
                    {producerDeliveryUseProfileAddress && !deliveryAddressQuery && (
                      <p className="text-xs text-[#9CA3AF]">
                        Renseignez l'adresse, le code postal et la ville dans "Coordonnées" pour positionner la carte.
                      </p>
                    )}
                    {!producerDeliveryUseProfileAddress && !deliveryMapCenter && (
                      <p className="text-xs text-[#9CA3AF]">
                        Aucun centre defini pour le moment. Cliquez sur la carte pour placer le point central.
                      </p>
                    )}
                    {producerDeliveryUseProfileAddress && deliveryAddressQuery && deliveryMapStatus === 'loading' && (
                      <p className="text-xs text-[#9CA3AF]">Recherche de l'adresse...</p>
                    )}
                    {producerDeliveryUseProfileAddress && deliveryAddressQuery && deliveryMapStatus === 'error' && (
                      <p className="text-xs text-[#B45309]">
                        Adresse introuvable. Vérifiez les coordonnées.
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-xs text-[#6B7280]">Frais de livraison par livraison (€)</label>
                  <input
                    type="number"
                    value={producerDeliveryFee}
                    onChange={(e) => setProducerDeliveryFee(Number(e.target.value))}
                    min="0"
                    step="0.01"
                    disabled={producerSettingsDisabled || !producerDeliveryEnabled}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
                <p className="text-[9px]">Indiquez 0€ si vous ne prenez pas de frais pour la livraison.</p>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <label className="flex items-center gap-2 text-sm text-[#1F2937] font-semibold">
                  <input
                    type="checkbox"
                    checked={producerPickupEnabled}
                    onChange={(e) => setProducerPickupEnabled(e.target.checked)}
                    disabled={producerSettingsDisabled}
                  />
                  Retrait possible de la commande directement sur votre exploitation par le créateur de la commande (partageur)
                </label>
                <p className="text-xs text-[#6B7280]">Jours possibles pour venir chercher le produit à votre exploitation.</p>
                <div className="flex flex-wrap gap-2">
                  {deliveryDayOptions.map((option) => {
                    const isActive = producerPickupDays.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleDeliveryDay(option.id, setProducerPickupDays)}
                        disabled={producerSettingsDisabled || !producerPickupEnabled}
                        className={`px-3 py-1 rounded-full border text-xs ${
                          isActive
                            ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                            : 'border-gray-200 text-[#6B7280]'
                        } ${producerSettingsDisabled || !producerPickupEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#6B7280]">Heure debut</label>
                    <input
                      type="time"
                      value={producerPickupStartTime}
                      onChange={(e) => setProducerPickupStartTime(e.target.value)}
                      disabled={producerSettingsDisabled || !producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7280]">Heure fin</label>
                    <input
                      type="time"
                      value={producerPickupEndTime}
                      onChange={(e) => setProducerPickupEndTime(e.target.value)}
                      disabled={producerSettingsDisabled || !producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids min accepté (en kg)</label>
                    <input
                      type="number"
                      value={producerPickupMinWeight}
                      onChange={(e) => setProducerPickupMinWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7280]">Poids max accepté (en kg)</label>
                    <input
                      type="number"
                      value={producerPickupMaxWeight}
                      onChange={(e) => setProducerPickupMaxWeight(Number(e.target.value))}
                      min="0"
                      disabled={producerSettingsDisabled || !producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="profile-edit-header flex items-center justify-between">
        <div>
          <h2 className="text-[#1F2937] text-xl font-semibold">Modifier le profil</h2>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-lg border border-gray-200 text-[#1F2937] hover:border-[#FF6B4A]"
        >
          Retour sans enregistrer
        </button>
      </div>


      <div className="bg-white rounded-xl p-6 shadow-sm space-y-6">
        <div className="profile-edit-hero flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="profile-avatar rounded-full overflow-hidden ring-2 ring-[#FFE8D7] bg-gradient-to-br from-[#FF6B4A] to-[#FFD166] flex items-center justify-center text-xl text-white">
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={user.avatarPath}
                updatedAt={avatarVersion}
                fallbackSrc={avatarFallbackSrc}
                alt={name || user.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xl font-semibold text-[#1F2937]">{name || user.name}</div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-[#FF6B4A]/10 text-[#FF6B4A] text-xs rounded-full">
                  {computedRole === 'producer'
                    ? 'Producteur'
                    : computedRole === 'sharer'
                      ? 'Partageur'
                      : 'Participant'}
                </span>
                {user.verified && (
                  <span className="px-3 py-1 bg-[#28C1A5]/10 text-[#28C1A5] text-xs rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Vérifié
                  </span>
                )}
              </div>
              <p className="text-sm text-[#6B7280]">Edition du profil</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-[#FF6B4A] text-white hover:bg-[#FF5A39] transition-colors"
          >
            Enregistrer
          </button>
        </div>

        <div className="profile-tabs-wrapper" aria-label="Onglets de profil">
          <div className="profile-tabs profile-tabs--edit">
            {editTabs.map((tab) => {
              const isActive = editTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditTab(tab.id)}
                  aria-pressed={isActive}
                  className={`profile-tab${isActive ? ' profile-tab--active' : ''}`}
                >
                  <span className="profile-tab-label">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="profile-tab-content">{renderEditTabContent()}</div>
        </div>
      </div>
    </div>
  );
}

function VisibilityButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${
        active ? 'border-[#FF6B4A] bg-[#FF6B4A]/10 text-[#FF6B4A]' : 'border-gray-200 text-[#6B7280] hover:border-[#FFD166]'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
