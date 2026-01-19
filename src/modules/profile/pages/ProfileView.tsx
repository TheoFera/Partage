import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MapPin,
  Shield,
  Apple,
  Heart,
  ShoppingBag,
  Plus,
  Check,
  Sparkles,
  Globe,
  Lock,
  Link2,
  Phone,
  Building2,
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
} from '../types';
import { Avatar } from './Avatar';
import { AvatarUploader } from './AvatarUploader';
import { ProductGroupContainer, ProductGroupDescriptor, ProductResultCard } from './ProductsLanding';
import { toast } from 'sonner';
import {
  PRODUCER_LABELS_DESCRIPTION_COLUMN,
  PRODUCER_LABELS_TABLE,
  PRODUCER_LABELS_YEAR_COLUMN,
} from '../data/producerLabels';

type TabKey = 'products' | 'orders' | 'selection';

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

const getOpeningDayLabel = (day: string) => {
  const match = findDeliveryDayOption(day);
  if (match) return match.option.label;
  if (!day) return '';
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
};

const getOpeningDayOrderIndex = (day: string) => findDeliveryDayOption(day)?.index ?? deliveryDayOptions.length;

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

const DEFAULT_PROFILE_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="80" fill="#E5E7EB" />
      <circle cx="80" cy="64" r="30" fill="#9CA3AF" />
      <ellipse cx="80" cy="118" rx="42" ry="32" fill="#6B7280" />
    </svg>`
  );

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
  supabaseClient,
  onAvatarUpdated,
  onRegisterSave,
}: ProfileViewProps) {
  const [internalMode, setInternalMode] = React.useState<'view' | 'edit'>('view');
  const mode = modeProp ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const [activeTab, setActiveTab] = React.useState<TabKey>('orders');
  const profileHandle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, '');
  const profileVisibility = user.profileVisibility ?? 'public';
  const addressVisibility = user.addressVisibility ?? 'public';
  const isProfilePublic = profileVisibility === 'public';
  const canShowAddress = isOwnProfile || addressVisibility === 'public';
  const addressLabel = canShowAddress ? user.address || 'Adresse non renseignée' : 'Adresse masquée';
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
  const following = Boolean(isFollowing);
  const avatarFallbackSrc = user.profileImage?.trim() || DEFAULT_PROFILE_AVATAR;
  const avatarVersion = user.avatarUpdatedAt ?? user.updatedAt ?? undefined;

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
      const location =
        order.pickupAddress ||
        order.mapLocation?.areaLabel ||
        sortedProducts[0]?.producerLocation ||
        order.producerName ||
        order.sharerName ||
        '';
      const sharerId = (order as any).sharerId ?? (order as any).sharerProfileId ?? '';
      const meta = sharerId ? profileMetaById[sharerId] : undefined;
      const handleFromDb = (meta?.handle ?? '').trim();
      const fallbackHandle = buildProfileHandle(order.sharerName || order.producerName || '');
      const resolvedHandle = handleFromDb || fallbackHandle;
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title,
          location,
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
  };

  const tabOptions = React.useMemo(
    () =>
      [
        { id: 'products' as TabKey, label: 'Produits', icon: Apple, visible: isOwnProfile || productCount > 0 },
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
    [isOwnProfile, productCount, ordersCount, selectionCount]
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

  const openingHoursEntries = React.useMemo(() => {
    if (!user.openingHours) return [];
    return Object.entries(user.openingHours).sort(
      (a, b) => getOpeningDayOrderIndex(a[0]) - getOpeningDayOrderIndex(b[0])
    );
  }, [user.openingHours]);

  if (mode === 'edit') {
    return (
      <ProfileEditPanel
        user={user}
        onUpdateUser={onUpdateUser}
        onClose={() => setMode('view')}
        supabaseClient={supabaseClient ?? null}
        onAvatarUpdated={onAvatarUpdated}
        onRegisterSave={onRegisterSave}
      />
    );
  }

  const tabStats = tabOptions.map((tab) => ({
    ...tab,
    value: tabCounts[tab.id]?.value ?? 0,
    meta: tabCounts[tab.id]?.meta ?? tab.label,
  }));
  const showAddProductCta = isOwnProfile && user.role === 'producer' && Boolean(onAddProductClick);
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

    return null;
  };

  return (
    <div className="space-y-8 md:space-y-10 pb-24">
      <div className="bg-white text-[#1F2937] rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 relative space-y-6">
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="profile-header-main flex items-center gap-4">
            <div className="profile-avatar rounded-full ring-4 ring-[#FFE8D7] shadow-lg overflow-hidden bg-gradient-to-br from-[#FF6B4A] to-[#FFD166]">
              <Avatar
                supabaseClient={supabaseClient ?? null}
                path={user.avatarPath}
                updatedAt={avatarVersion}
                fallbackSrc={avatarFallbackSrc}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">{user.name}</h2>
                {user.verified && (
                  <span className="profile-verified-badge">
                    <Check className="profile-verified-badge__icon" />
                    Vérifié
                  </span>
                )}
              </div>
              <p className="text-sm text-[#6B7280]">@{profileHandle}</p>
              {profileTagline && (
                <p className="text-sm text-[#374151]" style={{ whiteSpace: 'pre-line' }}>
                  {profileTagline}
                </p>
              )}
              <div className="profile-contact-row flex items-center gap-2 text-sm text-[#6B7280]">
                <MapPin className="w-4 h-4" />
                <span>{addressLabel}</span>
                {!canShowAddress && <Lock className="w-4 h-4 text-[#9CA3AF]" />}
              </div>
              {(user.city || user.postcode) && (
                <div className="profile-contact-row flex items-center gap-2 text-sm text-[#6B7280]">
                  <Building2 className="w-4 h-4" />
                  <span>{[user.postcode, user.city].filter(Boolean).join(' ')}</span>
                </div>
              )}
              {user.phonePublic && (
                <div className="profile-contact-row flex items-center gap-2 text-sm text-[#6B7280]">
                  <Phone className="w-4 h-4" />
                  <span>{user.phonePublic}</span>
                </div>
              )}
              {(user.website || isOwnProfile) && (
                <div className="profile-contact-row flex items-center gap-2 text-sm text-[#6B7280]">
                  <Link2 className="w-4 h-4" />
                  {user.website ? (
                    <a href={user.website} className="text-[#FF6B4A] hover:underline" target="_blank" rel="noreferrer">
                      {user.website}
                    </a>
                  ) : (
                    <span>Ajoutez votre site web</span>
                  )}
                </div>
              )}
              <div className="profile-badges flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-[#FFF1E6] border border-[#FFE0D1] text-xs text-[#B45309]">
                  {user.role === 'producer' ? 'Producteur' : user.role === 'sharer' ? 'Partageur' : 'Participant'}
                </span>
                <span className="px-3 py-1 rounded-full bg-[#E0F2FE] border border-[#BFDBFE] text-xs text-[#1D4ED8]">
                  {accountTypeLabel}
                </span>
              </div>
            </div>
          </div>
          {!isOwnProfile && (
            <div className="profile-header-actions flex items-center gap-3 sm:ml-auto">
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

        {(user.freshProductsCertified || user.socialLinks || user.openingHours) && (
          <div className="flex flex-col gap-2 text-sm text-[#374151]">
            {user.freshProductsCertified && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E6F6F0] border border-[#C8EBDD] text-[#0F5132] w-fit">
                <Shield className="w-4 h-4" /> Accreditations produits frais
              </span>
            )}
            {user.socialLinks && Object.values(user.socialLinks).some(Boolean) && (
              <div className="flex flex-wrap items-center gap-2">
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
            {openingHoursEntries.length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-[#6B7280]">
                <span className="text-xs uppercase text-[#9CA3AF]">Horaires</span>
                {openingHoursEntries.map(([day, hours]) => (
                  <div key={`${day}-${hours}`} className="flex gap-2">
                    <span className="w-24 font-semibold text-[#374151]">{getOpeningDayLabel(day)}</span>
                    <span>{hours}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="profile-tabs-wrapper" aria-label="Sections du profil">
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
    </div>
  );
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

function ProfileEditPanel({
  user,
  onUpdateUser,
  onClose,
  supabaseClient,
  onAvatarUpdated,
  onRegisterSave,
}: {
  user: User;
  onUpdateUser: (user: Partial<User>) => void;
  onClose: () => void;
  supabaseClient?: SupabaseClient | null;
  onAvatarUpdated?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
  onRegisterSave?: (handler: (() => void) | null) => void;
}) {
  const defaultHandle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, '');
  const [name, setName] = React.useState(user.name);
  const [address, setAddress] = React.useState(user.address || '');
  const [addressDetails, setAddressDetails] = React.useState(user.addressDetails || '');
  const [role, setRole] = React.useState<'producer' | 'sharer' | 'participant'>(user.role);
  const [handleValue, setHandleValue] = React.useState(defaultHandle);
  const [profileVisibility, setProfileVisibility] = React.useState<User['profileVisibility']>(
    user.profileVisibility ?? 'public'
  );
  const [addressVisibility, setAddressVisibility] = React.useState<User['addressVisibility']>(
    user.addressVisibility ?? 'public'
  );
  const [tagline, setTagline] = React.useState(user.tagline ?? '');
  const [website, setWebsite] = React.useState(user.website ?? '');
  const [phone, setPhone] = React.useState(user.phone ?? '');
  const [city, setCity] = React.useState(user.city ?? '');
  const [postcode, setPostcode] = React.useState(user.postcode ?? '');
  const [accountType, setAccountType] = React.useState<User['accountType']>(
    user.accountType ?? 'individual'
  );
  const [phonePublic, setPhonePublic] = React.useState(user.phonePublic ?? '');
  const [contactEmailPublic, setContactEmailPublic] = React.useState(user.contactEmailPublic ?? '');
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
  const [producerCategory, setProducerCategory] = React.useState(
    user.legalEntity?.producerCategory ?? ''
  );
  const [iban, setIban] = React.useState(user.legalEntity?.iban ?? '');
  const [accountHolderName, setAccountHolderName] = React.useState(
    user.legalEntity?.accountHolderName ?? ''
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
  const [producerPickupMinWeight, setProducerPickupMinWeight] = React.useState<number>(
    user.legalEntity?.producerPickupMinWeight ?? 0
  );
  const [producerPickupMaxWeight, setProducerPickupMaxWeight] = React.useState<number>(
    user.legalEntity?.producerPickupMaxWeight ?? 0
  );
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
  const initialDeliveryCenter = React.useMemo(() => {
    if (Number.isFinite(user.addressLat ?? NaN) && Number.isFinite(user.addressLng ?? NaN)) {
      return { lat: user.addressLat!, lng: user.addressLng! };
    }
    return null;
  }, [user.addressLat, user.addressLng]);
  const [deliveryMapCenter, setDeliveryMapCenter] = React.useState<{ lat: number; lng: number } | null>(
    initialDeliveryCenter
  );
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

  React.useEffect(() => {
    let isActive = true;
    if (role !== 'producer' || !supabaseClient) {
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
  }, [role, supabaseClient, user.id]);

  const saveProducerLabels = async () => {
    if (!supabaseClient || role !== 'producer') return true;
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
    if (producerDeliveryEnabled) return;
    if (deliveryMapRef.current) {
      deliveryMapRef.current.remove();
      deliveryMapRef.current = null;
      deliveryMapLayerRef.current = null;
    }
  }, [producerDeliveryEnabled]);

  React.useEffect(() => {
    if (!producerDeliveryEnabled || !deliveryMapContainerRef.current || deliveryMapRef.current) return;
    const map = L.map(deliveryMapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([defaultDeliveryMapCenter.lat, defaultDeliveryMapCenter.lng], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    reduceDeliveryMapStacking(map);
    deliveryMapRef.current = map;
    setTimeout(() => deliveryMapRef.current?.invalidateSize(), 100);
  }, [producerDeliveryEnabled]);

  React.useEffect(() => {
    if (!producerDeliveryEnabled) return;
    if (!deliveryAddressQuery) {
      setDeliveryMapCenter(null);
      setDeliveryMapStatus('idle');
      return;
    }
    if (initialDeliveryCenter) {
      setDeliveryMapCenter(initialDeliveryCenter);
      setDeliveryMapStatus('resolved');
      return;
    }
    setDeliveryMapCenter(null);
    setDeliveryMapStatus('error');
  }, [deliveryAddressQuery, initialDeliveryCenter, producerDeliveryEnabled]);

  React.useEffect(() => {
    if (!producerDeliveryEnabled || !deliveryMapRef.current) return;
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
    const marker = L.marker(latLng);
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

    setTimeout(() => deliveryMapRef.current?.invalidateSize(), 100);
  }, [producerDeliveryEnabled, deliveryMapCenter, normalizedDeliveryRadiusKm]);

  React.useEffect(
    () => () => {
      deliveryMapRef.current?.remove();
      deliveryMapRef.current = null;
      deliveryMapLayerRef.current = null;
    },
    []
  );

  const canBeProducer =
    accountType === 'company' || accountType === 'association' || accountType === 'public_institution';

  const handleSave = async () => {
    const hasAddress = Boolean(address.trim() && city.trim() && postcode.trim());
    const hasIdentity = Boolean(user.verified);
    const hasLegalInfo = accountType !== 'individual' && Boolean(legalName.trim() && siret.trim());
    if (role === 'producer' && !canBeProducer) {
      toast.error('Les auto-entreprises ne peuvent pas devenir producteur.');
      return;
    }

    if (role === 'sharer' && (!hasIdentity || !hasAddress)) {
      toast.error('Pour devenir partageur, vérifiez votre identité et complétez votre adresse.');
      return;
    }
    if (role === 'producer' && !hasLegalInfo) {
      toast.error("Pour devenir producteur, complétez les informations d'entreprise (raison sociale et SIRET).");
      return;
    }

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

    const normalizeWeight = (value: number) => (Number.isFinite(value) && value > 0 ? value : undefined);
    const normalizeDistance = (value: number) =>
      Number.isFinite(value) && value >= 0 ? value : undefined;
    const normalizeFee = (value: number) => (Number.isFinite(value) && value >= 0 ? value : undefined);
    const deliveryLeadPayload =
      deliveryLeadType === 'fixed_day'
        ? { deliveryLeadType: 'fixed_day' as DeliveryLeadType, deliveryFixedDay }
        : { deliveryLeadType: 'days' as DeliveryLeadType, deliveryLeadDays };

    const entityType: LegalEntity['entityType'] =
      accountType === 'association'
        ? 'association'
        : accountType === 'public_institution'
        ? 'public_institution'
        : 'company';

    const legalEntity =
      accountType !== 'individual' && legalName.trim() && siret.trim()
        ? {
            legalName: legalName.trim(),
            siret: siret.trim(),
            vatNumber: vatNumber.trim() || undefined,
            entityType,
            producerCategory: producerCategory.trim() || undefined,
            iban: iban.trim() || undefined,
            accountHolderName: accountHolderName.trim() || undefined,
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
            producerPickupEnabled,
            producerPickupDays: producerPickupEnabled ? producerPickupDays : undefined,
            producerPickupStartTime: producerPickupEnabled ? producerPickupStartTime.trim() : undefined,
            producerPickupEndTime: producerPickupEnabled ? producerPickupEndTime.trim() : undefined,
            producerPickupMinWeight: producerPickupEnabled ? normalizeWeight(producerPickupMinWeight) : undefined,
            producerPickupMaxWeight: producerPickupEnabled ? normalizeWeight(producerPickupMaxWeight) : undefined,
          }
        : undefined;

    const labelsSaved = await saveProducerLabels();
    if (!labelsSaved) return;
    onUpdateUser({
      name: name.trim() || user.name,
      address: address.trim(),
      addressDetails: addressDetails.trim(),
      city: city.trim(),
      postcode: postcode.trim(),
      phone: phone.trim(),
      accountType,
      role,
      handle: handleValue.trim() || defaultHandle,
      profileVisibility,
      addressVisibility,
      tagline: tagline.trim(),
      website: website.trim(),
      phonePublic: phonePublic.trim() || undefined,
      contactEmailPublic: contactEmailPublic.trim() || undefined,
      offersOnSitePickup,
      freshProductsCertified,
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

  return (
    <div className="space-y-6 pb-12">
      <div className="profile-edit-header flex items-center justify-between">
        <div>
          <h2 className="text-[#1F2937] text-xl font-semibold">Modifier le profil</h2>
          <p className="text-sm text-[#6B7280]">Retrouvez les réglages de l ancien profil.</p>
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
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xl font-semibold text-[#1F2937]">{name || user.name}</div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-[#FF6B4A]/10 text-[#FF6B4A] text-xs rounded-full">
                  {role === 'producer' ? 'Producteur' : role === 'sharer' ? 'Partageur' : 'Participant'}
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
                <p className="text-xs text-[#9CA3AF]">Le mode privé limite la visibilité de votre profil et de vos informations.</p>
                {!user.verified && (
                  <button className="w-full py-2 bg-[#28C1A5] text-white rounded-lg hover:bg-[#23A88F] transition-colors">
                    Verifier mon identité
                  </button>
                )}
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
            <h3 className="text-[#1F2937] font-semibold">Coordonnées obligatoires</h3>
            <p className="text-xs text-[#6B7280]">Pour sécuriser le fonctionnement de la plateforme.</p>
          </div>
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#1F2937]">Confirmez vos coordonnées</p>
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

        <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[#1F2937] font-semibold">Type de compte</h3>
            <p className="text-xs text-[#6B7280]">Si vous souhaitez devenir partageur ou utiliser la plateforme de manière professionnelle.</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <RoleButton label="Participant" active={role === 'participant'} onClick={() => setRole('participant')} />
                <RoleButton
                  label="Partageur"
                  active={role === 'sharer'}
                  disabled={!(user.verified && address.trim() && city.trim() && postcode.trim())}
                  onClick={() => {
                    if (user.verified && address.trim() && city.trim() && postcode.trim()) setRole('sharer');
                  }}
                  hint="Vérifiez votre identité et complétez votre adresse pour pouvoir passer partageur."
                />
                <RoleButton
                  label="Producteur"
                  active={role === 'producer'}
                  disabled={!canBeProducer || !legalName.trim() || !siret.trim()}
                  onClick={() => {
                    if (canBeProducer && legalName.trim() && siret.trim()) setRole('producer');
                  }}
                  hint="Auto-entreprise non eligible, raison sociale et SIRET requis."
                />
              </div>
              <p className="text-xs text-[#9CA3AF]">
                Partageur: identite verifiee + adresse complete. Producteur: entreprise/association/collectivite avec raison sociale et SIRET.
              </p>
            </div>
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
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-[#374151]">
              <input
                type="checkbox"
                checked={freshProductsCertified}
                onChange={(e) => setFreshProductsCertified(e.target.checked)}
                className="rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
              />
              Habilitation a partager des produits frais
            </label>
          </div>
        </section>

        {accountType !== 'individual' && (
          <section className="rounded-2xl border border-[#D7E3FF] bg-[#F6F8FF] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Informations légales</h3>
              <span className="text-xs text-[#6B7280]">Ces informations doivent être complétées si vous utilisez la plateforme de manière professionnelle</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm text-[#6B7280]">Raison sociale *</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Votre entreprise"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">SIRET *</label>
                <input
                  type="text"
                  value={siret}
                  onChange={(e) => setSiret(e.target.value)}
                  placeholder="123 456 789 00012"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              {role === 'producer' && (
                <div>
                  <label className="block text-sm text-[#6B7280]">Catégorie de producteur</label>
                  <select
                    value={producerCategory}
                    onChange={(e) => setProducerCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  >
                    <option value="">Sélectionner une categorie</option>
                    {producerCategoryOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
            </div>
            <div className='grid md:grid-cols-1 lg:grid-cols-2 gap-3'>
                <label className="block text-sm text-[#6B7280]">RIB</label>
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
          </section>
        )}

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
              <div className="space-y-2">
                <label className="block text-sm text-[#6B7280]">Horaires</label>
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
                </div>
                <p className="text-xs text-[#9CA3AF]">Laissez vide pour indiquer une fermeture.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[#374151]">
                  <input
                    type="checkbox"
                    checked={offersOnSitePickup}
                    onChange={(e) => setOffersOnSitePickup(e.target.checked)}
                    className="rounded border-gray-300 text-[#FF6B4A] focus:ring-[#FF6B4A]"
                  />
                  Retrait sur place proposé
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

        {role === 'producer' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Labels d'exploitation</h3>
              <span className="text-xs text-[#6B7280]">
                Affiches dans l'onglet Qualite de tous vos produits.
              </span>
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
                        className="ml-auto rounded-full border border-[#FBD0B8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#B45309] hover:text-[#FF6B4A]"
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
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              />
              <input
                type="text"
                value={producerLabelDescription}
                onChange={(e) => setProducerLabelDescription(e.target.value)}
                onKeyDown={handleProducerLabelKeyDown}
                placeholder="Description (optionnel)"
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
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddProducerLabel}
                disabled={!producerLabelInput.trim()}
                className={`px-4 py-2 rounded-lg border border-[#FF6B4A] text-[#FF6B4A] font-semibold hover:bg-[#FFF1E6] ${
                  producerLabelInput.trim() ? '' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                Ajouter
              </button>
            </div>
            {!supabaseClient && (
              <p className="text-xs text-[#9CA3AF]">
                Supabase non configure : les labels ne seront pas sauvegardes.
              </p>
            )}
          </section>
        )}

        {role === 'producer' && (
          <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
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
                  />
                  Expédition Chronofresh
                </label>
                <p className="text-xs text-[#6B7280]">Option gérée par le site : les frais de livraison sont répartis entre les participants à la commande.</p>
                <div className="space-y-2">
                  <label className="block text-xs text-[#6B7280]">indiquez dans quel délai vous vous engagez à avoir livré la commande apres clôture de celle-ci (Chronofresh prend en moyenne 24h pour livrer à partir du moment où il a récupéré la commande)</label>
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
                    disabled={!chronofreshEnabled}
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
                      disabled={!chronofreshEnabled}
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
                      disabled={!chronofreshEnabled}
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
                      disabled={!chronofreshEnabled}
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
                        disabled={!producerDeliveryEnabled}
                        className={`px-3 py-1 rounded-full border text-xs ${
                          isActive
                            ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                            : 'border-gray-200 text-[#6B7280]'
                        } ${producerDeliveryEnabled ? '' : 'opacity-60 cursor-not-allowed'}`}
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
                      disabled={!producerDeliveryEnabled}
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
                      disabled={!producerDeliveryEnabled}
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
                      disabled={!producerDeliveryEnabled}
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
                      disabled={!producerDeliveryEnabled}
                      className="flex-1 accent-[#FF6B4A]"
                    />
                    <span className="text-xs text-[#6B7280]">
                      {producerDeliveryRadiusKm.toFixed(0)} km
                    </span>
                  </div>
                </div>
                

            {producerDeliveryEnabled && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-[#1F2937] font-semibold">Zone de livraison</h4>
                </div>
                <div
                  ref={deliveryMapContainerRef}
                  className="w-full rounded-lg overflow-hidden border border-gray-200"
                  style={{ height: 260, minHeight: 260 }}
                />
                {!deliveryAddressQuery && (
                  <p className="text-xs text-[#9CA3AF]">
                    Renseignez l'adresse, le code postal et la ville dans "Coordonnées" pour positionner la carte.
                  </p>
                )}
                {deliveryAddressQuery && deliveryMapStatus === 'loading' && (
                  <p className="text-xs text-[#9CA3AF]">Recherche de l'adresse...</p>
                )}
                {deliveryAddressQuery && deliveryMapStatus === 'error' && (
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
                    disabled={!producerDeliveryEnabled}
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
                        disabled={!producerPickupEnabled}
                        className={`px-3 py-1 rounded-full border text-xs ${
                          isActive
                            ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                            : 'border-gray-200 text-[#6B7280]'
                        } ${producerPickupEnabled ? '' : 'opacity-60 cursor-not-allowed'}`}
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
                      disabled={!producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7280]">Heure fin</label>
                    <input
                      type="time"
                      value={producerPickupEndTime}
                      onChange={(e) => setProducerPickupEndTime(e.target.value)}
                      disabled={!producerPickupEnabled}
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
                      disabled={!producerPickupEnabled}
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
                      disabled={!producerPickupEnabled}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

      </div>

    </div>
  );
}

function RoleButton({
  label,
  active,
  onClick,
  disabled,
  hint,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`py-2 px-4 rounded-lg border-2 transition-colors ${
        active
          ? 'border-[#FF6B4A] bg-[#FF6B4A]/10 text-[#FF6B4A]'
          : 'border-gray-200 text-[#6B7280] hover:border-[#FFD166]'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
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
