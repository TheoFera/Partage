import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { Product, GroupOrder, DeckCard } from '../types';
import { Avatar } from './Avatar';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { FiltersPopover } from './FiltersPopover';
import './ProductsLanding.css';
import { eurosToCents, formatEurosFromCents } from '../lib/money';
import { formatUnitWeightLabel } from '../lib/weight';
import { getOrderStatusLabel, getOrderStatusProgress } from '../lib/orderStatus';
import {
  Sparkles,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  Heart,
} from 'lucide-react';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_GAP,
  MAX_VISIBLE_CARDS,
  MIN_VISIBLE_CARDS,
  CONTAINER_SIDE_PADDING,
} from '../constants/cards';
import { DEMO_MODE } from '../data/productsProvider';

type SearchScope = 'products' | 'producers' | 'combined';

interface ProductsLandingProps {
  products: Product[];
  filteredProducts: Product[];
  orders: GroupOrder[];
  filteredOrders: GroupOrder[];
  canSaveProduct: boolean;
  deck: DeckCard[];
  supabaseClient?: SupabaseClient | null;
  onAddToDeck?: (product: Product) => void;
  onRemoveFromDeck?: (productId: string) => void;
  onOpenProduct: (productId: string) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenOrder: (orderId: string) => void;
  onStartOrderFromProduct?: (product: Product) => void;
  onOpenSharer?: (sharerName: string) => void;
  onSelectProducerCategory?: (tag: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

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
const hasValidLotPrice = (product: Product) =>
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

export function ProductsLanding({
  products,
  filteredProducts,
  filteredOrders,
  canSaveProduct,
  deck,
  supabaseClient,
  onAddToDeck,
  onRemoveFromDeck,
  onOpenProduct,
  onOpenProducer,
  onOpenOrder,
  onOpenSharer,
  onSelectProducerCategory,
  onStartOrderFromProduct,
  filtersOpen,
  onToggleFilters,
}: ProductsLandingProps) {
  const [scope, setScope] = React.useState<SearchScope>('combined');
  const [categories, setCategories] = React.useState<string[]>([]);
  const [producerFilters, setProducerFilters] = React.useState<string[]>([]);
  const [attributes, setAttributes] = React.useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [localOnly, setLocalOnly] = React.useState(false);
  const handleSelectProducerCategory = React.useCallback(
    (tag: string) =>
      setProducerFilters((prev) => (prev.includes(tag) ? prev : [...prev, tag])),
    []
  );
  const categoryClick = onSelectProducerCategory ?? handleSelectProducerCategory;

  const deckIds = React.useMemo(() => new Set(deck.map((card) => card.id)), [deck]);
  const showSelectionControls = Boolean(onAddToDeck || onRemoveFromDeck);
  const toggleSelection = React.useCallback(
    (product: Product, isSelected: boolean) => {
      if (isSelected) {
        onRemoveFromDeck?.(product.id);
      } else {
        onAddToDeck?.(product);
      }
    },
    [onAddToDeck, onRemoveFromDeck]
  );

  const relatedByProducer = React.useMemo(() => {
    const map = new Map<string, Product[]>();
    products.forEach((product) => {
      const list = map.get(product.producerId) ?? [];
      map.set(product.producerId, [...list, product]);
    });
    return map;
  }, [products]);

  const productResults = React.useMemo(() => {
    return filteredProducts.filter((product) => {
      if (!hasValidLotPrice(product)) return false;
      const categorySlug = slugify(product.category);
      if (categories.length && !categories.some((cat) => categorySlug.includes(cat))) return false;

      const productAttrs = getProductAttributes(product);
      if (attributes.length && !attributes.every((attr) => productAttrs.has(attr))) return false;

      if (inStockOnly && !product.inStock) return false;
      if (localOnly) {
        const distance = parseDistanceKm(product.producerLocation);
        if (distance !== null && distance > 25) return false;
      }

      return true;
    });
  }, [filteredProducts, categories, attributes, inStockOnly, localOnly]);

  const producerResults = React.useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        location: string;
        postcode?: string;
        tags: string[];
        products: Product[];
      }
    >();

    productResults.forEach((product) => {
      const tags = producerTagsMap[product.producerId] ?? ['local'];
      const postcode = extractPostcode(product.producerLocation);
      const existing = grouped.get(product.producerId) ?? {
        id: product.producerId,
        name: product.producerName,
        location: formatCityLabel(undefined, postcode, product.producerLocation),
        postcode,
        tags,
        products: [],
      };
      grouped.set(product.producerId, {
        ...existing,
        products: [...existing.products, product],
      });
    });

    return Array.from(grouped.values()).filter((producer) => {
      if (!producerFilters.length) return true;
      return producerFilters.every((tag) => producer.tags.includes(tag));
    });
  }, [productResults, producerFilters]);

  const ordersResults = React.useMemo(() => {
    return filteredOrders.filter((order) => {
      if (order.status !== 'open') return false;
      const orderHasMatch = order.products.some((product) => {
        if (!hasValidLotPrice(product)) return false;
        const categorySlug = slugify(product.category);
        if (categories.length && !categories.some((cat) => categorySlug.includes(cat))) return false;

        const productAttrs = getProductAttributes(product);
        if (attributes.length && !attributes.every((attr) => productAttrs.has(attr))) return false;

        if (inStockOnly && !product.inStock) return false;
        if (localOnly) {
          const distance = parseDistanceKm(product.producerLocation);
          if (distance !== null && distance > 25) return false;
        }

        return true;
      });
      return orderHasMatch;
    });
  }, [filteredOrders, categories, attributes, inStockOnly, localOnly]);

  const producerProductRows = React.useMemo(() => {
    const rows = producerResults.map((producer) => ({
      ...producer,
      products: producer.products.sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [producerResults]);
  const [profileMetaById, setProfileMetaById] = React.useState<
    Record<string, { path: string | null; updatedAt: string | null; handle?: string | null }>
  >({});
  const producerProfileIds = React.useMemo(() => {
    const ids = new Set<string>();
    producerProductRows.forEach((producer) => {
      if (isUuid(producer.id)) ids.add(producer.id);
    });
    return Array.from(ids);
  }, [producerProductRows]);
  const sharerProfileIds = React.useMemo(() => {
    const ids = new Set<string>();
    ordersResults.forEach((order) => {
      if (isUuid(order.sharerId)) ids.add(order.sharerId);
    });
    return Array.from(ids);
  }, [ordersResults]);
  const profileIds = React.useMemo(
    () => Array.from(new Set([...producerProfileIds, ...sharerProfileIds])),
    [producerProfileIds, sharerProfileIds]
  );

  React.useEffect(() => {
    let active = true;
    if (!supabaseClient || !profileIds.length) {
      setProfileMetaById({});
      return () => {
        active = false;
      };
    }

    supabaseClient
      .from('profiles')
      .select('id, handle, avatar_path, avatar_updated_at')
      .in('id', profileIds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('Producer avatars load error:', error);
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
      });

    return () => {
      active = false;
    };
  }, [profileIds, supabaseClient]);

  const producerGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return producerProductRows.map((producer) => {
      const avatar = profileMetaById[producer.id];
      return {
        id: producer.id,
        title: producer.name,
        location: producer.postcode ? `${producer.location} ${producer.postcode}` : producer.location,
        tags: producer.tags,
        products: producer.products,
        variant: 'producer',
        profileHandle: avatar?.handle ?? undefined,
        avatarPath: avatar?.path ?? null,
        avatarUpdatedAt: avatar?.updatedAt ?? null,
      };
    });
  }, [producerProductRows, profileMetaById]);

  const orderGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return ordersResults.map((order) => {
      const sortedProducts = order.products
        .filter(hasValidLotPrice)
        .sort((a, b) => a.name.localeCompare(b.name));
      const sharerAvatar = profileMetaById[order.sharerId];
      const locationFallback =
        order.pickupAddress || order.mapLocation?.areaLabel || sortedProducts[0]?.producerLocation || order.producerName;
      const location = formatCityLabel(order.pickupCity, order.pickupPostcode, locationFallback);
      const locationWithPostcode = order.pickupPostcode
        ? `${location} ${order.pickupPostcode}`
        : location;
      const productCountLabel =
        sortedProducts.length > 1 ? `${sortedProducts.length} produits` : '1 produit';
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title || order.producerName,
          location: locationWithPostcode,
          tags: [order.sharerName, productCountLabel].filter(Boolean) as string[],
          products: sortedProducts,
          variant: 'order',
          status: order.status,
          statusUpdatedAt: order.statusUpdatedAt,
          profileHandle: profileMetaById[order.sharerId]?.handle ?? undefined,
          sharerName: order.sharerName,
          sharerPercentage: order.sharerPercentage,
          minWeight: order.minWeight,
          maxWeight: order.maxWeight,
          orderedWeight: order.orderedWeight,
          deliveryFeeCents: order.deliveryFeeCents,
          deadline: order.deadline,
          avatarPath: sharerAvatar?.path ?? null,
          avatarUpdatedAt: sharerAvatar?.updatedAt ?? null,
          avatarUrl: sortedProducts[0]?.imageUrl,
        };
    });
  }, [ordersResults, profileMetaById]);

  const showProducts = scope === 'products';
  const showCombined = scope === 'combined';
  const hasProducts = productResults.length > 0;
  const hasProducers = producerResults.length > 0;
  const orderSectionRef = React.useRef<HTMLDivElement | null>(null);
  const producerSectionRef = React.useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToSection = React.useCallback((target: HTMLElement | null) => {
    if (typeof window === 'undefined' || !target) return;
    const header = document.querySelector('.app-header');
    const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    const targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, []);

  const scrollToOrderSection = React.useCallback(
    () => scrollToSection(orderSectionRef.current),
    [scrollToSection]
  );

  const scrollToProducerSection = React.useCallback(
    () => scrollToSection(producerSectionRef.current),
    [scrollToSection]
  );

  const scrollToResultsSection = React.useCallback(
    () => scrollToSection(resultsSectionRef.current),
    [scrollToSection]
  );

  const renderGroupCards = (groups: ProductGroupDescriptor[]) => (
    <div className="px-1 sm:px-3 w-full">
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
          whiteSpace: 'normal',
        }}
      >
        {groups.map((group) => (
          <div
            key={`${group.variant}-${group.id}`}
            style={{
              display: 'inline-block',
              verticalAlign: 'top',
              marginRight: '12px',
              marginBottom: '12px',
              textAlign: 'left',
            }}
          >
            <ProductGroupContainer
              group={group}
              canSave={canSaveProduct}
              deckIds={deckIds}
              supabaseClient={supabaseClient}
              onSave={onAddToDeck}
              onRemoveFromDeck={onRemoveFromDeck}
              onToggleSelection={toggleSelection}
              onCreateOrder={onStartOrderFromProduct}
              onOpenProduct={onOpenProduct}
              onOpenOrder={onOpenOrder}
              onOpenProducer={onOpenProducer}
              onOpenSharer={onOpenSharer}
              onSelectProducerCategory={categoryClick}
              showSelectionControl={showSelectionControls}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const toggleHeroCategoryFilters = React.useCallback((filters: string[]) => {
    setCategories((prev) => {
      const hasAll = filters.every((filterId) => prev.includes(filterId));
      if (hasAll) {
        return prev.filter((value) => !filters.includes(value));
      }
      const next = [...prev];
      filters.forEach((filterId) => {
        if (!next.includes(filterId)) {
          next.push(filterId);
        }
      });
      return next;
    });
  }, [setCategories]);

  return (
    <div className="space-y-6">
      <FiltersPopover
        open={filtersOpen}
        onClose={onToggleFilters}
        scope={scope}
        onScopeChange={setScope}
        categories={categories}
        onToggleCategory={(id) =>
          setCategories((prev) => (prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]))
        }
        producerFilters={producerFilters}
        onToggleProducer={(id) =>
          setProducerFilters((prev) =>
            prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]
          )
        }
        attributes={attributes}
        onToggleAttribute={(id) =>
          setAttributes((prev) => (prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]))
        }
        productOptions={productFilterOptions}
        producerOptions={producerFilterOptions}
        attributeOptions={attributeFilterOptions}
      />
      <div
        className="products-landing__hero-wrap"
        style={{
          position: 'relative',
          left: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          width: '100vw',
          overflowX: 'hidden',
          zIndex: 1,
        }}
      >
        <section
          className="relative isolate"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            minHeight: '480px',
            color: '#111827',
            overflow: 'hidden',
          }}
        >
        <div
          className="absolute inset-0"
          style={{ inset: 0, position: 'absolute' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}banniere.jpg`}
            alt="Champs maraichers avec producteurs et animaux en plein air"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              display: 'block',
            }}
            loading="lazy"
          />
          <div
            className="absolute inset-0"
            style={{
              inset: 0,
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 100%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0.4) 0%)',
            }}
          />
        </div>

        <div
          className="relative text-center"
          style={{
            position: 'relative',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '122px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '26px',
            zIndex: 2,
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#0F172A',
              margin: 0,
            }}
          >
            Moins d’intermédiaires,{' '}
            <span style={{ whiteSpace: 'nowrap' }}>plus de qualité</span>
          </h2>
          <p
            style={{
              fontSize: 'clamp(26px, 4vw, 30px)',
              fontWeight: 620,
              lineHeight: 1.15,
              color: '#0F172A',
              maxWidth: '1080px',
              margin: '0 auto',
            }}
          >
            Participe à des commandes ou{' '}
            <span style={{ whiteSpace: 'nowrap' }}>crée la tienne et reçoit une part</span>
          </p>

          <div className="products-landing__quick-links">
            <Link
              to="/comment-ca-fonctionne"
              className="products-landing__quick-link products-landing__quick-link--primary"
            >
              <span className="products-landing__quick-link-icon products-landing__category-icon" aria-hidden="true">
                ⚙️
              </span>
              Comment ça fonctionne ?
            </Link>
            <Link to="/qui-sommes-nous" className="products-landing__quick-link">
              <span className="products-landing__quick-link-icon products-landing__category-icon" aria-hidden="true">
                👥
              </span>
              Qui sommes-nous ?
            </Link>
          </div>
        </div>
        <div className="products-landing__hero-bottom-gradient" aria-hidden="true" />
      </section>
      </div>

      <section
        className="products-landing__category-bar"
        aria-label="Filtres rapides"
      >
        <div className="products-landing__category-bar-inner">
          {heroCategoryFilters.map((category) => {
            const isActive = category.filters.every((filterId) => categories.includes(filterId));
            return (
              <button
                type="button"
                key={category.id}
                className={`products-landing__category-button${isActive ? ' products-landing__category-button--active' : ''}`}
                onClick={() => {
                  const shouldScroll = !isActive;
                  toggleHeroCategoryFilters(category.filters);
                  if (shouldScroll) {
                    scrollToResultsSection();
                  }
                }}
                aria-pressed={isActive}
                aria-label={category.label}
              >
                <span className="products-landing__category-icon" aria-hidden="true">
                  {category.icon}
                </span>
                <span className="products-landing__category-label">{category.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        id="products-landing-results"
        className="space-y-4"
        ref={resultsSectionRef}
      >
        {showCombined ? (
          <>
            <section
              id="products-landing-orders"
              ref={orderSectionRef}
              className="space-y-4"
            >
              <button
                type="button"
                className="products-landing__section-intro modern-intro"
                onClick={scrollToOrderSection}
                aria-controls="products-landing-orders"
                aria-label="Aller aux commandes disponibles"
              >
                <ChevronDown className="modern-intro__chevron" aria-hidden="true" />
                <span className="modern-intro__count">{orderGroups.length}</span>
                <span className="modern-intro__text"> commandes en cours</span>
                <ChevronDown className="modern-intro__chevron" aria-hidden="true" />
              </button>
              {orderGroups.length ? (
                renderGroupCards(orderGroups)
              ) : (
                <EmptyState
                  title="Aucune commande disponible"
                  subtitle="Ajustez les filtres pour retrouver des commandes auxquelles participer."
                />
              )}
            </section>

            <section
              id="products-landing-producers"
              ref={producerSectionRef}
              className="space-y-4"
            >
              <button
                type="button"
                className="products-landing__section-intro modern-intro"
                onClick={scrollToProducerSection}
                aria-controls="products-landing-producers"
                aria-label="Aller aux producteurs disponibles"
              >
                <ChevronDown className="modern-intro__chevron" aria-hidden="true" />
                <span className="modern-intro__count">{producerGroups.length}</span>
                <span className="modern-intro__text"> producteurs disponibles</span>
                <ChevronDown className="modern-intro__chevron" aria-hidden="true" />
              </button>
              {producerGroups.length ? (
                renderGroupCards(producerGroups)
              ) : (
                <EmptyState
                  title="Aucun producteur trouvé"
                  subtitle="Ajustez les filtres pour voir producteurs et produits correspondants."
                />
              )}
            </section>
          </>
        ) : showProducts ? (
          hasProducts ? (
            <div className="px-1 sm:px-3 w-full">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'stretch',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                {productResults.map((product) => (
                  <ProductResultCard
                    key={product.id}
                    product={product}
                    related={
                      relatedByProducer
                        .get(product.producerId)
                        ?.filter((p) => p.id !== product.id) ?? []
                    }
                    canSave={canSaveProduct}
                    inDeck={deckIds.has(product.id)}
                    onSave={onAddToDeck}
                    onRemove={onRemoveFromDeck}
                    onToggleSelection={toggleSelection}
                    onOpenProducer={onOpenProducer}
                    onCreateOrder={onStartOrderFromProduct}
                    onOpen={onOpenProduct}
                    showSelectionControl={showSelectionControls}
                    compact
                    cardWidth={CARD_WIDTH}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Aucun produit trouvé"
              subtitle="Ajustez les filtres ou changez de zone pour voir plus de résultats."
            />
          )
        ) : hasProducers ? (
          <div className="px-1 sm:px-3 w-full">
            <div
              style={{
                maxWidth: '1200px',
                margin: '0 auto',
                textAlign: 'center',
                whiteSpace: 'normal',
              }}
            >
              {producerGroups.map((group) => (
                <div
                  key={`producer-${group.id}`}
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'top',
                    marginRight: '12px',
                    marginBottom: '12px',
                    textAlign: 'left',
                  }}
                >
                  <ProductGroupContainer
                    group={group}
                    canSave={canSaveProduct}
                    deckIds={deckIds}
                    supabaseClient={supabaseClient}
                    onSave={onAddToDeck}
                    onRemoveFromDeck={onRemoveFromDeck}
                    onToggleSelection={toggleSelection}
                    onCreateOrder={onStartOrderFromProduct}
                    onOpenProduct={onOpenProduct}
                    onOpenProducer={onOpenProducer}
                    onOpenSharer={onOpenSharer}
                    onSelectProducerCategory={categoryClick}
                    showSelectionControl={showSelectionControls}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Aucun producteur trouvé"
            subtitle="Ajustez les filtres ou changez de zone pour voir plus de résultats."
          />
        )}
      </section>
    </div>
  );
}

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
  onOpenProduct: (productId: string) => void;
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
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const isOrder = group.variant === 'order';
  const firstProduct = group.products[0];
  const orderAvatarFallback = DEFAULT_PROFILE_AVATAR;
  const hasAvatar = true;
  const orderActionText = orderActionLabel ?? 'Participer';

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

  const hostLabel = isOrder
    ? group.sharerName || firstProduct?.producerName || group.title
    : getProducerCategoryLabel(group.tags);
  const shouldShowHostLabel = Boolean(hostLabel);

  // Produits effectivement affichés
  const productsToShow = useCarousel
    ? group.products.slice(startIndex, startIndex + MAX_VISIBLE_CARDS)
    : group.products;

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
        style={{ padding: CONTAINER_SIDE_PADDING }}
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
            className="relative w-full"
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
              className="flex gap-2 w-full justify-center"
              style={{ alignItems: 'stretch', userSelect: 'none' }}
            >
              {productsToShow.map((product) => (
                <div
                  key={product.id}
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
                  onOpen={onOpenProduct}
                  showSelectionControl={showSelectionControl}
                  compact
                  cardWidth={CARD_WIDTH}
                  priceLabelOverride={orderPriceLabels?.[product.id]}
                />
            </div>
              ))}
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
                  onOpen={onOpenProduct}
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

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center space-y-2">
      <Sparkles className="w-6 h-6 text-[#FF6B4A] mx-auto" />
      <p className="font-semibold text-[#1F2937]">{title}</p>
      <p className="text-sm text-[#6B7280]">{subtitle}</p>
    </div>
  );
}

