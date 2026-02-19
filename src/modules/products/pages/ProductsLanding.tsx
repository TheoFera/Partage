import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { DeckCard, GroupOrder, Product } from '../../../shared/types';
import { FiltersPopover } from '../../../shared/ui/FiltersPopover';
import {
  ProductGroupContainer,
  ProductResultCard,
  type ProductGroupDescriptor,
  hasValidLotPrice,
} from '../components/ProductGroup';
import '../styles/ProductsLanding.css';
import { CARD_WIDTH } from '../../../shared/constants/cards';
import { Sparkles, ChevronDown } from 'lucide-react';

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
  onOpenProduct: (
    productId: string,
    context?: { orderCode?: string | null; lotCode?: string | null }
  ) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenOrder: (orderId: string) => void;
  onStartOrderFromProduct?: (product: Product) => void;
  onOpenSharer?: (sharerName: string) => void;
  onSelectProducerCategory?: (tag: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  postcodeRadiusKm?: number;
  onPostcodeRadiusKmChange?: (value: number) => void;
  producerDistanceMetersById?: Record<string, number>;
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

const producerTagsMap: Record<string, string[]> = {
  'current-user': ['maraicher'],
  p2: ['apiculteur'],
  p3: ['viticulteur-cidriculteur-brasseur'],
  p4: ['eleveur'],
  p5: ['autre'],
};

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
  postcodeRadiusKm,
  onPostcodeRadiusKmChange,
  producerDistanceMetersById,
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
    return rows.sort((a, b) => {
      const aDistance = producerDistanceMetersById?.[a.id];
      const bDistance = producerDistanceMetersById?.[b.id];
      const aHasDistance = Number.isFinite(aDistance ?? NaN);
      const bHasDistance = Number.isFinite(bDistance ?? NaN);
      if (aHasDistance && bHasDistance && aDistance !== bDistance) {
        return (aDistance as number) - (bDistance as number);
      }
      if (aHasDistance !== bHasDistance) return aHasDistance ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [producerDistanceMetersById, producerResults]);
  const [profileMetaById, setProfileMetaById] = React.useState<
    Record<
      string,
      { path: string | null; updatedAt: string | null; handle?: string | null; name?: string | null }
    >
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
      .select('id, handle, avatar_path, avatar_updated_at, name')
      .in('id', profileIds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('Producer avatars load error:', error);
          setProfileMetaById({});
          return;
        }
        const mapped: Record<
          string,
          { path: string | null; updatedAt: string | null; handle?: string | null; name?: string | null }
        > = {};
        (data as Array<Record<string, unknown>> | null)?.forEach((row) => {
          const id = typeof row.id === 'string' ? row.id : '';
          if (!id) return;
          mapped[id] = {
            path: (row.avatar_path as string | null) ?? null,
            updatedAt: (row.avatar_updated_at as string | null) ?? null,
            handle: (row.handle as string | null) ?? null,
            name: (row.name as string | null) ?? null,
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
      const profileMeta = profileMetaById[producer.id];
      const resolvedProducerName = profileMeta?.name?.trim() || producer.name;
      const resolvedProducts = producer.products.map((product) =>
        resolvedProducerName && product.producerName !== resolvedProducerName
          ? { ...product, producerName: resolvedProducerName }
          : product
      );
      return {
        id: producer.id,
        title: resolvedProducerName,
        location: producer.postcode ? `${producer.location} ${producer.postcode}` : producer.location,
        tags: producer.tags,
        products: resolvedProducts,
        variant: 'producer',
        profileHandle: profileMeta?.handle ?? undefined,
        avatarPath: profileMeta?.path ?? null,
        avatarUpdatedAt: profileMeta?.updatedAt ?? null,
      };
    });
  }, [producerProductRows, profileMetaById]);

  const orderGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return ordersResults.map((order) => {
      const producerProfile = profileMetaById[order.producerId];
      const resolvedProducerName = producerProfile?.name?.trim() || order.producerName;
      const sortedProducts = order.products
        .filter(hasValidLotPrice)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((product) =>
          resolvedProducerName && product.producerName !== resolvedProducerName
            ? { ...product, producerName: resolvedProducerName }
            : product
        );
      const sharerAvatar = profileMetaById[order.sharerId];
      const locationFallback =
        order.pickupAddress ||
        order.mapLocation?.areaLabel ||
        sortedProducts[0]?.producerLocation ||
        resolvedProducerName;
      const location = formatCityLabel(order.pickupCity, order.pickupPostcode, locationFallback);
      const locationWithPostcode = order.pickupPostcode
        ? `${location} ${order.pickupPostcode}`
        : location;
      const productCountLabel =
        sortedProducts.length > 1 ? `${sortedProducts.length} produits` : '1 produit';
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title || resolvedProducerName,
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
        distanceKm={postcodeRadiusKm}
        onDistanceKmChange={onPostcodeRadiusKmChange}
        minDistanceKm={1}
        maxDistanceKm={50}
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

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center space-y-2">
      <Sparkles className="w-6 h-6 text-[#FF6B4A] mx-auto" />
      <p className="font-semibold text-[#1F2937]">{title}</p>
      <p className="text-sm text-[#6B7280]">{subtitle}</p>
    </div>
  );
}

