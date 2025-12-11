import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { CreateOrderForm } from './components/CreateOrderForm';
import { ProfileView } from './components/ProfileView';
import { MessagesView } from './components/MessagesView';
import { AddProductForm } from './components/AddProductForm';
import { ClientSwipeView } from './components/ClientSwipeView';
import { ProductsLanding } from './components/ProductsLanding';
import { MapView } from './components/MapView';
import { OrderClientView } from './components/OrderClientView';
import { AuthPage } from './components/AuthPage';
import { mockProducts, mockUser, mockGroupOrders } from './data/mockData';
import { Product, DeckCard, User, GroupOrder, UserRole, LegalEntity } from './types';
import { getSupabaseClient } from './lib/supabaseClient';
import { toast, Toaster } from 'sonner';

const tabRoutes = {
  home: '/',
  deck: '/carte',
  create: '/creer',
  messages: '/messages',
  profile: '/profil',
} as const;

const getTabFromPath = (pathname: string) => {
  if (pathname.startsWith('/carte')) return 'deck';
  if (pathname.startsWith('/creer')) return 'create';
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
};

type LegalEntityRow = {
  id: string;
  profile_id: string;
  legal_name: string;
  siret: string;
  vat_number: string | null;
  entity_type: string;
};

const mapLegalRowToEntity = (row: LegalEntityRow): LegalEntity => ({
  legalName: row.legal_name,
  siret: row.siret,
  vatNumber: row.vat_number ?? undefined,
  entityType: (row.entity_type as LegalEntity['entityType']) ?? 'company',
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
    profileVisibility: (row.profile_visibility as User['profileVisibility']) ?? 'public',
    addressVisibility: (row.address_visibility as User['addressVisibility']) ?? 'private',
    tagline: row.tagline ?? undefined,
    website: row.website ?? undefined,
    address: row.address ?? undefined,
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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = React.useCallback(
    (product: Product) => {
      if (!normalizedSearch) return true;
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        product.producerName.toLowerCase().includes(normalizedSearch)
      );
    },
    [normalizedSearch]
  );

  const filteredProducts = React.useMemo(
    () => (normalizedSearch ? products.filter(matchesSearch) : products),
    [matchesSearch, normalizedSearch, products]
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
  const publicOrderProducts = React.useMemo(() => {
    const seen = new Set<string>();
    const pool: Product[] = [];
    groupOrders
      .filter((order) => order.visibility === 'public' && order.status === 'open')
      .forEach((order) => {
        order.products.forEach((product) => {
          if (seen.has(product.id)) return;
          seen.add(product.id);
          pool.push(product);
        });
      });
    return pool;
  }, [groupOrders]);

  const activeTab = React.useMemo(() => getTabFromPath(location.pathname), [location.pathname]);
  const isAuthPage = location.pathname.startsWith('/connexion');


  const redirectToAuth = (path?: string, mode: 'login' | 'signup' = 'login') => {
    const target = path ?? location.pathname;
    navigate('/connexion', { state: { redirectTo: target, mode } });
  };

  const changeTab = (tab: string) => {
    lastTabRef.current = null;
    const target =
      tab === 'profile' && isAuthenticated && user?.handle
        ? `/profil/${user.handle}`
        : tabRoutes[tab as keyof typeof tabRoutes] ?? tabRoutes.home;
    const needsAuth = tab === 'deck' || tab === 'create' || tab === 'messages';
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
    if (!isAuthenticated) {
      redirectToAuth(`/commande/${orderId}`);
      return;
    }
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
    if (!isAuthenticated) {
      redirectToAuth(location.pathname);
      return;
    }
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

  const handleCreateOrder = (orderData: any) => {
    if (!user) {
      toast.info('Connectez-vous pour publier une commande.');
      redirectToAuth('/commande/nouvelle');
      return;
    }
    const now = new Date();
    const firstProduct = orderData.products?.[0];
    const newOrder: GroupOrder = {
      id: `order-${Date.now()}`,
      title: orderData.title,
      sharerId: user.id,
      sharerName: user.name,
      products: orderData.products,
      producerId: firstProduct?.producerId ?? currentProducerId,
      producerName: firstProduct?.producerName ?? 'Producteur',
      sharerPercentage: orderData.sharerPercentage,
      minWeight: orderData.minWeight,
      maxWeight: orderData.maxWeight,
      orderedWeight: 0,
      deadline: orderData.deadline ?? now,
      pickupAddress: orderData.pickupAddress,
      pickupSlots: orderData.pickupSlots,
      message: orderData.message,
      status: 'open',
      visibility: orderData.visibility ?? 'public',
      totalValue: orderData.totals?.participantTotal ?? 0,
      participants: 1,
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

    if (!supabaseClient) {
      const updatedUser = { ...user, ...userData, role: normalizedRole };
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

    let legalEntityRow: LegalEntityRow | null = null;
    if ((payload.account_type ?? user.accountType) !== 'individual' && userData.legalEntity?.legalName && userData.legalEntity.siret) {
      const legalPayload = {
        profile_id: user.id,
        legal_name: userData.legalEntity.legalName,
        siret: userData.legalEntity.siret,
        vat_number: userData.legalEntity.vatNumber ?? null,
        entity_type: userData.legalEntity.entityType ?? 'company',
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
      setUser(mapped);
      prevRoleRef.current = mapped.role;
      if (location.pathname.startsWith('/profil')) {
        navigate(`/profil/${mapped.handle}`, { replace: true });
      }
      toast.success('Profil mis a jour !');
    }
  };

  const handleEditProfile = () => {
    if (!isAuthenticated) {
      redirectToAuth(tabRoutes.profile);
      return;
    }
    changeTab('profile');
    setProfileMode('edit');
  };

  const handleShareProfile = () => {
    if (!user) {
      redirectToAuth(tabRoutes.profile);
      return;
    }
    const profileHandle = user.handle ?? user.name.toLowerCase().replace(/\s+/g, '');
    const shareUrl = `${window.location.origin}/profil/${profileHandle}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => null);
    toast.success('Lien du profil copie !');
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
      toast.error('Impossible de se deconnecter pour le moment.');
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
  const openProducerProfile = React.useCallback(
    (product: Product) => {
      const handle = product.producerName.toLowerCase().replace(/\s+/g, '');
      navigate(`/profil/${handle}`);
    },
    [navigate]
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
  const canSaveProduct = isAuthenticated && viewer.role !== 'producer';
  const deckSelectionIds = React.useMemo(() => new Set(deck.map((card) => card.id)), [deck]);
  const swipeProducts = publicOrderProducts;
  const renderProductGrid = () => {
    return (
      <ProductsLanding
        products={products}
        filteredProducts={filteredProducts}
        orders={groupOrders}
        filteredOrders={filteredMapOrders}
        canSaveProduct={canSaveProduct}
        deck={deck}
        onAddToDeck={canSaveProduct ? handleAddToDeck : undefined}
        onRemoveFromDeck={handleRemoveFromDeck}
        onOpenProduct={openProductView}
        onOpenProducer={openProducerProfile}
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
        orders={filteredMapOrders}
        deck={deck}
        onRemoveFromDeck={handleRemoveFromDeck}
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
        products={swipeProducts}
        onSave={handleAddToDeck}
        locationLabel={locationLabel}
      />
    );
  };

  const getPageTitle = () => {
    if (isAuthPage) return 'Connexion';
    if (location.pathname.startsWith('/commande/nouvelle')) return 'Nouvelle commande';
    if (location.pathname === '/produit/nouveau') return 'Nouveau produit';
    if (activeTab === 'deck') {
      if (viewer.role === 'producer') return 'Commandes en cours';
      return 'Carte';
    }
    if (activeTab === 'create') return 'Decouvrir';
    if (activeTab === 'messages') return 'Messages';
    if (activeTab === 'profile') return 'Mon Profil';
    if (location.pathname.startsWith('/produit/')) return selectedProduct?.name ?? 'Produit';
    if (location.pathname.startsWith('/commande/')) return 'Commande';
    return '';
  };

  const pageTitle = getPageTitle();
  const isOrderCreation = location.pathname.startsWith('/commande/nouvelle');
  const isAddProductView = location.pathname === '/produit/nouveau';
  const isOrderView = Boolean(selectedOrder && location.pathname.startsWith('/commande/'));
  const isProductView = Boolean(selectedProduct && location.pathname.startsWith('/produit/'));
  const isOwnProfileView =
    isAuthenticated &&
    (location.pathname === '/profil' ||
      (!!user?.handle && location.pathname === `/profil/${user.handle}`));
  const isHome = activeTab === 'home';
  const mainPadding = 'pb-24';
  const mainPaddingTop = isOrderView ? 96 : isHome ? 64 : 80; // px values
  const mainPaddingBottom = isOrderView ? '12rem' : '10rem';
  const profileHeaderActions =
    activeTab === 'profile' && !isOrderView && isOwnProfileView ? (
      <div className="flex items-center gap-2">
        <button
          onClick={handleEditProfile}
          className="px-3 py-2 rounded-full bg-[#FF6B4A] text-white text-sm font-semibold shadow-sm hover:bg-[#FF5A39] transition-colors"
        >
          Modifier le profil
        </button>
        <button
          onClick={handleShareProfile}
          className="px-3 py-2 rounded-full bg-white border border-[#FF6B4A] text-[#FF6B4A] text-sm font-semibold hover:bg-[#FFF1E6] transition-colors"
        >
          Partager
        </button>
      </div>
    ) : null;

  const authButton = isAuthenticated ? (
    <button
      onClick={handleLogout}
      className="px-3 py-2 rounded-full border border-gray-200 bg-white text-[#1F2937] text-sm font-semibold hover:border-[#FF6B4A] transition-colors"
    >
      Se deconnecter
    </button>
  ) : (
    <button
      onClick={() => redirectToAuth(location.pathname)}
      className="px-3 py-2 rounded-full bg-[#FF6B4A] text-white text-sm font-semibold shadow-sm hover:bg-[#FF5A39] transition-colors"
    >
      Se connecter
    </button>
  );

  const headerActions = (
    <>
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

  const ProfileRoute = ({ isOwn }: { isOwn?: boolean }) => {
    const params = useParams<{ handle?: string }>();
    const [fetchedProfile, setFetchedProfile] = React.useState<User | null>(null);
    const [loadingProfile, setLoadingProfile] = React.useState(false);

    const profileHandle = user?.handle ?? viewer.handle ?? viewer.name.toLowerCase().replace(/\s+/g, '');
    const resolvedIsOwn =
      Boolean(user) &&
      (typeof isOwn === 'boolean' ? isOwn : !params.handle || params.handle === profileHandle);

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

    const profileUser: User = resolvedIsOwn
      ? (user as User)
      : fetchedProfile || {
          ...viewer,
          handle: params.handle ?? viewer.handle,
          profileVisibility: 'public',
          addressVisibility: 'private',
        };

    React.useEffect(() => {
      if (!resolvedIsOwn) return;
      const targetHandle = profileUser.handle;
      if (targetHandle && location.pathname !== `/profil/${targetHandle}`) {
        navigate(`/profil/${targetHandle}`, { replace: true });
      }
    }, [location.pathname, navigate, profileUser.handle, resolvedIsOwn]);

    const producerProductsForProfile = React.useMemo(() => {
      const byId = profileUser.producerId
        ? products.filter((product) => product.producerId === profileUser.producerId)
        : [];
      if (byId.length) return byId;
      return products.filter((product) => product.producerName === profileUser.name);
    }, [products, profileUser.name, profileUser.producerId]);

    const sharerOrdersForProfile = React.useMemo(
      () => groupOrders.filter((order) => order.sharerId === profileUser.id),
      [groupOrders, profileUser.id]
    );

    const producerOrdersForProfile = React.useMemo(() => {
      const byId = profileUser.producerId
        ? groupOrders.filter((order) => order.producerId === profileUser.producerId)
        : [];
      if (byId.length) return byId;
      return groupOrders.filter((order) => order.producerName === profileUser.name);
    }, [groupOrders, profileUser.name, profileUser.producerId]);

    const mergedOrdersForProfile = React.useMemo(() => {
      const source =
        profileUser.role === 'producer'
          ? [...producerOrdersForProfile, ...sharerOrdersForProfile]
          : [...sharerOrdersForProfile];
      const unique = new Map<string, GroupOrder>();
      source.forEach((order) => {
        if (!unique.has(order.id)) unique.set(order.id, order);
      });
      return Array.from(unique.values());
    }, [producerOrdersForProfile, profileUser.role, sharerOrdersForProfile]);

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

    if (shouldShowNotFound) {
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
        onModeChange={resolvedIsOwn ? setProfileMode : undefined}
        onShareProfile={resolvedIsOwn ? handleShareProfile : undefined}
        onUpdateUser={resolvedIsOwn ? handleUpdateUser : () => {}}
        onRemoveFromDeck={handleRemoveFromDeck}
        onAddToDeck={canSaveProduct ? handleAddToDeck : undefined}
        selectionIds={deckSelectionIds}
        onOpenOrder={openOrderView}
        isFollowing={isFollowing}
        onToggleFollow={!resolvedIsOwn ? () => handleToggleFollowProfile(profileUser) : undefined}
        onMessageUser={!resolvedIsOwn ? () => handleMessageUser(profileUser) : undefined}
        onStartOrderFromProduct={handleStartOrderFromProduct}
        onAddProductClick={resolvedIsOwn && profileUser.role === 'producer' ? openAddProductForm : undefined}
        onOpenProduct={openProductView}
      />
    );
  };

  const ProductRoute = () => {
    const params = useParams<{ id: string }>();
    const product = products.find((p) => p.id === params.id);
    if (!product) return <NotFound message="Produit introuvable." />;
    const inDeck = deck.some((card) => card.id === product.id);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <img src={product.imageUrl} alt={product.name} className="w-full h-80 object-cover" />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-2xl text-[#1F2937] font-semibold mb-1">{product.name}</h2>
            <p className="text-[#6B7280]">{product.producerName}</p>
          </div>
          <p className="text-[#374151]">{product.description}</p>
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold text-[#FF6B4A]">
              {product.price.toFixed(2)} EUR
            </span>
            <span className="text-sm text-[#6B7280]">/ {product.unit}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1 rounded-full bg-[#FFF1E6] text-[#FF6B4A]">
              {product.category}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {product.producerLocation}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleStartOrderFromProduct(product)}
              className="px-4 py-2 rounded-lg bg-[#FF6B4A] text-white text-sm font-semibold shadow-sm hover:bg-[#FF5A39] transition-colors"
            >
              Creer une commande
            </button>
            {canSaveProduct && (
              <button
                onClick={() => (inDeck ? handleRemoveFromDeck(product.id) : handleAddToDeck(product))}
                className="px-4 py-2 rounded-lg border border-[#FF6B4A] text-[#FF6B4A] text-sm font-semibold shadow-sm hover:bg-[#FFF1E6] transition-colors"
              >
                {inDeck ? 'Retirer de ma selection' : 'Ajouter a ma selection'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const OrderRoute = () => {
    const params = useParams<{ id: string }>();
    const order = groupOrders.find((o) => o.id === params.id);
    if (!order) return <NotFound message="Commande introuvable." />;

    return (
      <OrderClientView
        order={order}
        onClose={closeOrderView}
        onVisibilityChange={(visibility) => handleUpdateOrderVisibility(order.id, visibility)}
        onPurchase={(payload) => handlePurchaseOrder(order.id, payload?.total, payload?.weight)}
        isOwner={Boolean(user && order.sharerId === user.id)}
      />
    );
  };

  const showSearch =
    (activeTab === 'home' || activeTab === 'deck') &&
    !isOrderView &&
    !isAuthPage &&
    !isOrderCreation &&
    !isAddProductView;

  React.useEffect(() => {
    if (!showSearch) {
      setFiltersOpen(false);
    }
  }, [showSearch]);

  return (
    <div className="min-h-screen bg-[#F9F2E4] overflow-x-visible">
      <Toaster position="top-center" richColors offset={96} />
      <Header
        showSearch={showSearch}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        onLogoClick={() => changeTab('home')}
        actions={headerActions}
        filtersActive={filtersOpen}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
      />

      <main
        className={`max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 ${mainPadding}`}
        style={{ paddingTop: `${mainPaddingTop}px`, paddingBottom: mainPaddingBottom }}
      >
        {isOrderView ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">Vue participant</h1>
            <p className="text-[#6B7280]">Ajustez les quantités, partagez et changez la visibilité.</p>
          </div>
        ) : isProductView && selectedProduct ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">{selectedProduct.name}</h1>
            <p className="text-[#6B7280]">{selectedProduct.producerName}</p>
          </div>
        ) : isAuthPage ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">{pageTitle || 'Connexion'}</h1>
            <p className="text-[#6B7280]">Accédez à votre compte ou créez-en un pour continuer.</p>
          </div>
        ) : isOrderCreation || isAddProductView ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">{pageTitle}</h1>
            <p className="text-[#6B7280]">
              {isOrderCreation
                ? 'Selectionnez vos produits puis configurez la commande.'
                : 'Ajoutez une reference produit a votre vitrine.'}
            </p>
          </div>
        ) : activeTab !== 'home' ? (
          <div className="mb-6">
            <h1 className="text-[#1F2937]">{pageTitle}</h1>
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={renderProductGrid()} />
          <Route
            path="/connexion"
            element={
              isAuthenticated ? (
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
          <Route path="/carte" element={renderProtected(renderDeckContent, tabRoutes.deck)} />
          <Route path="/creer" element={renderProtected(renderCreateContent, tabRoutes.create)} />
          <Route path="/messages" element={renderProtected(() => <MessagesView />, tabRoutes.messages)} />
          <Route
            path="/commande/nouvelle"
            element={
              isAuthenticated ? (
                <CreateOrderForm
                  products={orderBuilderProducts ?? deck}
                  preselectedProductIds={orderBuilderSelection ?? undefined}
                  onCreateOrder={handleCreateOrder}
                  onCancel={() => {
                    const target = orderBuilderSourceRef.current ?? tabRoutes.home;
                    resetOrderBuilder();
                    navigate(target);
                  }}
                />
              ) : (
                <AuthWall
                  onLogin={() => redirectToAuth('/commande/nouvelle', 'login')}
                  onSignup={() => redirectToAuth('/commande/nouvelle', 'signup')}
                  description="Connectez-vous pour creer une commande groupee."
                />
              )
            }
          />
          <Route
            path="/profil"
            element={
              isAuthenticated ? (
                <ProfileRoute isOwn />
              ) : (
                <AuthPage
                  supabaseClient={supabaseClient}
                  onAuthSuccess={handleAuthSuccess}
                  onDemoLogin={handleDemoLogin}
                />
              )
            }
          />
          <Route path="/profil/:handle" element={<ProfileRoute />} />
          <Route
            path="/produit/nouveau"
            element={renderProtected(() => <AddProductForm onAddProduct={handleAddProduct} />, '/produit/nouveau')}
          />
          <Route path="/produit/:id" element={<ProductRoute />} />
          <Route
            path="/commande/:id"
            element={
              isAuthenticated ? (
                <OrderRoute />
              ) : (
                <AuthWall
                  onLogin={() => redirectToAuth(location.pathname, 'login')}
                  onSignup={() => redirectToAuth(location.pathname, 'signup')}
                  description="Connectez-vous pour consulter les details de cette commande."
                />
              )
            }
          />
          <Route path="*" element={<Navigate to={tabRoutes.home} replace />} />
        </Routes>
      </main>

      <Navigation activeTab={activeTab} onTabChange={changeTab} userRole={viewer.role} />
    </div>
  );
}
