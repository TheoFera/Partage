import React from 'react';
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
import { DeckCard, DeliveryDay, DeliveryLeadType, GroupOrder, Product, User } from '../types';
import { Avatar } from './Avatar';
import { AvatarUploader } from './AvatarUploader';
import { ProductGroupContainer, ProductGroupDescriptor, ProductResultCard } from './ProductsLanding';
import { toast } from 'sonner';

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

const statusLabels: Record<GroupOrder['status'], string> = {
  open: 'Ouverte',
  closed: 'Fermée',
  completed: 'Terminée',
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
    user.accountType === 'company'
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
      return {
        id: order.id,
        orderId: order.id,
        title: order.title,
        location,
        tags: [],
        products: sortedProducts,
        variant: 'order',
        sharerName: order.sharerName || order.producerName,
        minWeight: order.minWeight,
        maxWeight: order.maxWeight,
        orderedWeight: order.orderedWeight,
        deadline: deadlineDate,
        avatarUrl: sortedProducts[0]?.imageUrl,
      };
    });
  }, [orders, isOwnProfile]);

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

  if (mode === 'edit') {
    return (
      <ProfileEditPanel
        user={user}
        onUpdateUser={onUpdateUser}
        onClose={() => setMode('view')}
        supabaseClient={supabaseClient ?? null}
        onAvatarUpdated={onAvatarUpdated}
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
                canSave={canSaveProducts}
                deckIds={selectionSet}
                onSave={onAddToDeck}
                onRemoveFromDeck={onRemoveFromDeck}
                onToggleSelection={selectionActionsEnabled ? handleToggleSelection : undefined}
                onOpenProduct={handleOpenProduct}
                onOpenOrder={onOpenOrder}
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
            {user.openingHours && Object.keys(user.openingHours).length > 0 && (
              <div className="flex flex-col gap-1 text-sm text-[#6B7280]">
                <span className="text-xs uppercase text-[#9CA3AF]">Horaires</span>
                {Object.entries(user.openingHours).map(([day, hours]) => (
                  <div key={day} className="flex gap-2">
                    <span className="w-24 font-semibold text-[#374151] capitalize">{day}</span>
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
}: {
  user: User;
  onUpdateUser: (user: Partial<User>) => void;
  onClose: () => void;
  supabaseClient?: SupabaseClient | null;
  onAvatarUpdated?: (payload: { avatarPath: string; avatarUpdatedAt?: string | null }) => void;
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
  const [openingHoursText, setOpeningHoursText] = React.useState(
    user.openingHours
      ? Object.entries(user.openingHours)
          .map(([day, value]) => `${day}:${value}`)
          .join('\n')
      : ''
  );
  const [legalName, setLegalName] = React.useState(user.legalEntity?.legalName ?? '');
  const [siret, setSiret] = React.useState(user.legalEntity?.siret ?? '');
  const [vatNumber, setVatNumber] = React.useState(user.legalEntity?.vatNumber ?? '');
  const [legalEntityType, setLegalEntityType] =
    React.useState<'company' | 'association' | 'public_institution'>(
      (user.legalEntity?.entityType as any) ?? 'company'
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
  const avatarFallbackSrc = user.profileImage?.trim() || DEFAULT_PROFILE_AVATAR;
  const avatarVersion = user.avatarUpdatedAt ?? user.updatedAt ?? undefined;
  const toggleDeliveryDay = (
    day: DeliveryDay,
    setter: React.Dispatch<React.SetStateAction<DeliveryDay[]>>
  ) => {
    setter((prev) => (prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]));
  };

  const handleSave = () => {
    const hasAddress = Boolean(address.trim() && city.trim() && postcode.trim());
    const hasIdentity = Boolean(user.verified);
    const hasLegalInfo = accountType !== 'individual' && Boolean(legalName.trim() && siret.trim());

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
    openingHoursText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [day, hours] = line.split(':');
        if (day && hours) {
          opening[day.toLowerCase()] = hours.trim();
        }
      });

    const normalizeWeight = (value: number) => (Number.isFinite(value) && value > 0 ? value : undefined);
    const deliveryLeadPayload =
      deliveryLeadType === 'fixed_day'
        ? { deliveryLeadType: 'fixed_day' as DeliveryLeadType, deliveryFixedDay }
        : { deliveryLeadType: 'days' as DeliveryLeadType, deliveryLeadDays };

    const legalEntity =
      accountType !== 'individual' && legalName.trim() && siret.trim()
        ? {
            legalName: legalName.trim(),
            siret: siret.trim(),
            vatNumber: vatNumber.trim() || undefined,
            entityType: (legalEntityType as 'company' | 'association' | 'public_institution') ?? 'company',
            ...deliveryLeadPayload,
            chronofreshEnabled,
            chronofreshMinWeight: chronofreshEnabled ? normalizeWeight(chronofreshMinWeight) : undefined,
            chronofreshMaxWeight: chronofreshEnabled ? normalizeWeight(chronofreshMaxWeight) : undefined,
            producerDeliveryEnabled,
            producerDeliveryDays: producerDeliveryEnabled ? producerDeliveryDays : undefined,
            producerDeliveryMinWeight: producerDeliveryEnabled ? normalizeWeight(producerDeliveryMinWeight) : undefined,
            producerDeliveryMaxWeight: producerDeliveryEnabled ? normalizeWeight(producerDeliveryMaxWeight) : undefined,
            producerPickupEnabled,
            producerPickupDays: producerPickupEnabled ? producerPickupDays : undefined,
            producerPickupStartTime: producerPickupEnabled ? producerPickupStartTime.trim() : undefined,
            producerPickupEndTime: producerPickupEnabled ? producerPickupEndTime.trim() : undefined,
            producerPickupMinWeight: producerPickupEnabled ? normalizeWeight(producerPickupMinWeight) : undefined,
            producerPickupMaxWeight: producerPickupEnabled ? normalizeWeight(producerPickupMaxWeight) : undefined,
          }
        : undefined;

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

  return (
    <div className="space-y-6 pb-12">
      <div className="profile-edit-header flex items-center justify-between">
        <div>
          <h2 className="text-[#1F2937] text-xl font-semibold">Modifier le profil</h2>
          <p className="text-sm text-[#6B7280]">Retrouvez les reglages de l ancien profil.</p>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-lg border border-gray-200 text-[#1F2937] hover:border-[#FF6B4A]"
        >
          Retour
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
                <p className="text-xs text-[#9CA3AF]">Utilise pour le lien du profil.</p>
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
                <label className="block text-sm text-[#6B7280]">VisibilitǸ du profil</label>
                <div className="profile-visibility-group flex items-center gap-2">
                  <VisibilityButton
                    label="Public"
                    icon={Globe}
                    active={profileVisibility === 'public'}
                    onClick={() => setProfileVisibility('public')}
                  />
                  <VisibilityButton
                    label="PrivǸ"
                    icon={Lock}
                    active={profileVisibility === 'private'}
                    onClick={() => setProfileVisibility('private')}
                  />
                </div>
                <p className="text-xs text-[#9CA3AF]">Le mode prive limite la visibilitǸ de votre profil et de vos informations.</p>
                {!user.verified && (
                  <button className="w-full py-2 bg-[#28C1A5] text-white rounded-lg hover:bg-[#23A88F] transition-colors">
                    Verifier mon identitǸ
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

        <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[#1F2937] font-semibold">Role et type de compte</h3>
            <p className="text-xs text-[#6B7280]">Choisissez le role pour debloquer les actions correspondantes.</p>
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
                  hint="Vérifiez votre identité et complétez votre adresse pour passer partageur."
                />
                <RoleButton
                  label="Producteur"
                  active={role === 'producer'}
                  disabled={accountType === 'individual' || !legalName.trim() || !siret.trim()}
                  onClick={() => {
                    if (accountType !== 'individual' && legalName.trim() && siret.trim()) setRole('producer');
                  }}
                  hint="Renseignez votre entreprise (type != particulier, raison sociale et SIRET)."
                />
              </div>
              <p className="text-xs text-[#9CA3AF]">
                Partageur: identité vérifiée + adresse complète. Producteur: compte non particulier avec raison sociale et SIRET.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-[#6B7280]">Type de compte</label>
              <select
                value={accountType}
                onChange={(e) =>
                  setAccountType(
                    (e.target.value as 'individual' | 'company' | 'association' | 'public_institution') ?? 'individual'
                  )
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
              >
                <option value="individual">Particulier</option>
                <option value="company">Entreprise</option>
                <option value="association">Association</option>
                <option value="public_institution">Collectivité / service public</option>
              </select>
              <p className="text-xs text-[#9CA3AF]">Determine si les sections entreprise sont affichees.</p>
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

        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[#1F2937] font-semibold">Coordonnees obligatoires</h3>
            <p className="text-xs text-[#6B7280]">Pour sécuriser les echanges et votre visibilité locale.</p>
          </div>
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#1F2937]">Confirmez vos coordonnees</p>
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
                  <label className="block text-sm text-[#6B7280]">Pays</label>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
              <div className="space-y-2">
                <label className="block text-sm text-[#6B7280]">Téléphone (obligatoire)</label>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-xl bg-[#F9FAFB] p-4 border border-gray-200">
              <h3 className="text-[#1F2937] font-semibold">Contacts publics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#6B7280]">Telephone public</label>
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
                <label className="block text-sm text-[#6B7280]">Horaires (ex: lundi:08h-12h)</label>
                <textarea
                  value={openingHoursText}
                  onChange={(e) => setOpeningHoursText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] resize-none"
                />
                <p className="text-xs text-[#9CA3AF]">Une ligne par jour, format jour:plage horaire.</p>
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
          <section className="rounded-2xl border border-[#FFE0D1] bg-[#FFF6F0] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Reglages producteur - Livraison</h3>
              <span className="text-xs text-[#6B7280]">
                Definissez les options proposees aux partageurs et les seuils de poids.
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
                  Expedition Chronofresh
                </label>
                <p className="text-xs text-[#6B7280]">Option geree par le site.</p>
                <div className="space-y-2">
                  <label className="block text-xs text-[#6B7280]">Delai de livraison apres cloture (Chronofresh)</label>
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
                    <label className="block text-xs text-[#6B7280]">Poids min (kg)</label>
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
                    <label className="block text-xs text-[#6B7280]">Poids max (kg)</label>
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
                  Livraison par le producteur
                </label>
                <p className="text-xs text-[#6B7280]">Selectionnez les jours disponibles.</p>
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
                    <label className="block text-xs text-[#6B7280]">Poids min (kg)</label>
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
                    <label className="block text-xs text-[#6B7280]">Poids max (kg)</label>
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
              </div>

              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <label className="flex items-center gap-2 text-sm text-[#1F2937] font-semibold">
                  <input
                    type="checkbox"
                    checked={producerPickupEnabled}
                    onChange={(e) => setProducerPickupEnabled(e.target.checked)}
                  />
                  Retrait par le partageur
                </label>
                <p className="text-xs text-[#6B7280]">Jours possibles pour venir chercher.</p>
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
                    <label className="block text-xs text-[#6B7280]">Poids min (kg)</label>
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
                    <label className="block text-xs text-[#6B7280]">Poids max (kg)</label>
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

        {accountType !== 'individual' && (
          <section className="rounded-2xl border border-[#D7E3FF] bg-[#F6F8FF] p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[#1F2937] font-semibold">Informations légales</h3>
              <span className="text-xs text-[#6B7280]">Visible pour les comptes entreprise / association / public</span>
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
                <label className="block text-sm text-[#6B7280]">TVA (optionnel)</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="FRXX999999999"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#6B7280]">Type de structure</label>
                <select
                  value={legalEntityType}
                  onChange={(e) =>
                    setLegalEntityType(
                      (e.target.value as 'company' | 'association' | 'public_institution') ?? 'company'
                    )
                  }
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                >
                  <option value="company">Entreprise</option>
                  <option value="association">Association</option>
                  <option value="public_institution">Collectivité / service public</option>
                </select>
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
