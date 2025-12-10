import React from 'react';
import { Product, GroupOrder, DeckCard } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';
import {
  SlidersHorizontal,
  Sparkles,
  Users,
  MapPin,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Leaf,
} from 'lucide-react';

type SearchScope = 'products' | 'producers' | 'combined';

interface ProductsLandingProps {
  products: Product[];
  filteredProducts: Product[];
  orders: GroupOrder[];
  filteredOrders: GroupOrder[];
  canSaveProduct: boolean;
  deck: DeckCard[];
  onAddToDeck?: (product: Product) => void;
  onOpenProduct: (productId: string) => void;
  onOpenOrder: (orderId: string) => void;
  onStartOrderFromProduct?: (product: Product) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

type ProductGroupVariant = 'producer' | 'order';

interface ProductGroupDescriptor {
  id: string;
  title: string;
  location: string;
  tags: string[];
  products: Product[];
  variant: ProductGroupVariant;
  orderId?: string;
  sharerName?: string;
}

const CARD_WIDTH = 240;
const CARD_HEIGHT = 380;
const CARD_GAP = 12;
const MAX_VISIBLE_CARDS = 3;
const CONTAINER_SIDE_PADDING = 24;
const CONTAINER_FLEX_BASIS = 340;

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
  { id: 'cosmetiques', label: 'Cosmétiques' },
  { id: 'beaute-bien-etre', label: 'Beauté & Bien-être' },
];

const attributeFilterOptions = [
  { id: 'bio', label: 'Bio' },
  { id: 'sans-nitrite', label: 'Sans nitrite' },
  { id: 'circuit-court', label: 'Circuit court' },
  { id: 'vrac', label: 'Vrac' },
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

const FilterPill = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
      active
        ? 'bg-[#FF6B4A]/10 border-[#FF6B4A] text-[#B45309]'
        : 'bg-white border-gray-200 text-[#374151] hover:border-[#FF6B4A]/50'
    }`}
  >
    {label}
  </button>
);

export function ProductsLanding({
  products,
  filteredProducts,
  filteredOrders,
  canSaveProduct,
  deck,
  onAddToDeck,
  onOpenProduct,
  onOpenOrder,
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

  const deckIds = React.useMemo(() => new Set(deck.map((card) => card.id)), [deck]);

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
        tags: string[];
        products: Product[];
      }
    >();

    productResults.forEach((product) => {
      const tags = producerTagsMap[product.producerId] ?? ['local'];
      const existing = grouped.get(product.producerId) ?? {
        id: product.producerId,
        name: product.producerName,
        location: product.producerLocation,
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
      const orderHasMatch = order.products.some((product) => {
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

  const producerGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return producerProductRows.map((producer) => ({
      id: producer.id,
      title: producer.name,
      location: producer.location,
      tags: producer.tags,
      products: producer.products,
      variant: 'producer',
    }));
  }, [producerProductRows]);

  const orderGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return ordersResults.map((order) => {
      const sortedProducts = [...order.products].sort((a, b) => a.name.localeCompare(b.name));
      const location =
        order.pickupAddress || sortedProducts[0]?.producerLocation || order.producerName;
      const productCountLabel =
        sortedProducts.length > 1 ? `${sortedProducts.length} produits` : '1 produit';
      return {
        id: order.id,
        orderId: order.id,
        title: order.title || order.producerName,
        location,
        tags: [order.sharerName, productCountLabel].filter(Boolean) as string[],
        products: sortedProducts,
        variant: 'order',
        sharerName: order.sharerName,
      };
    });
  }, [ordersResults]);

  const combinedGroups = React.useMemo(
    () => [...orderGroups, ...producerGroups],
    [orderGroups, producerGroups],
  );

  const showProducts = scope === 'products';
  const showProducers = scope === 'producers';
  const showCombined = scope === 'combined';
  const hasProducts = productResults.length > 0;
  const hasProducers = producerResults.length > 0;

  return (
    <div className="space-y-6">
      <section className="relative rounded-3xl border border-[#FFE0D1] bg-white p-4 sm:p-6 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-center">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl text-[#1F2937] font-semibold">
              Cherchez des produits qui vous intéressent et rejoignez une commande existante ou lancez la votre s'il n'y en a pas autour.
            </h2>
          </div>
        </div>
      </section>

      {filtersOpen && (
        <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-6 -mt-12 relative z-10 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <ScopeToggle active={scope === 'combined'} label="Tous" onClick={() => setScope('combined')} />
              <ScopeToggle active={scope === 'products'} label="Produits" onClick={() => setScope('products')} />
              <ScopeToggle active={scope === 'producers'} label="Producteurs" onClick={() => setScope('producers')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <FilterGroup
              label="Filtres produits"
              icon={<SlidersHorizontal className="w-4 h-4" />}
              options={productFilterOptions}
              activeValues={categories}
              onToggle={(id) =>
                setCategories((prev) => (prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]))
              }
            />
            <FilterGroup
              label="Filtres producteurs"
              icon={<Users className="w-4 h-4" />}
              options={producerFilterOptions}
              activeValues={producerFilters}
              onToggle={(id) =>
                setProducerFilters((prev) => (prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]))
              }
            />
            <FilterGroup
              label="Caracteristiques"
              icon={<Leaf className="w-4 h-4" />}
              options={attributeFilterOptions}
              activeValues={attributes}
              onToggle={(id) =>
                setAttributes((prev) => (prev.includes(id) ? prev.filter((val) => val !== id) : [...prev, id]))
              }
            />
          </div>
          <div className="ml-auto">
              <button
                type="button"
                onClick={onToggleFilters}
                className="text-sm text-[#FF6B4A] font-semibold hover:text-[#FF5A39]"
              >
                Fermer
              </button>
            </div>
        </section>
      )}
      <section className="space-y-4">
        {showCombined ? (
          combinedGroups.length ? (
            <div className="grid gap-4 px-1 sm:px-3 items-start w-full grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
              {combinedGroups.map((group) => (
                <ProductGroupContainer
                  key={`${group.variant}-${group.id}`}
                  group={group}
                  canSave={canSaveProduct}
                  deckIds={deckIds}
                  onSave={onAddToDeck}
                  onCreateOrder={onStartOrderFromProduct}
                  onOpenProduct={onOpenProduct}
                  onOpenOrder={onOpenOrder}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun resultat"
              subtitle="Ajustez les filtres pour voir producteurs, partageurs et produits correspondants."
            />
          )
        ) : showProducts ? (
          hasProducts ? (
            <div className="grid gap-3 items-stretch px-1 sm:px-3 w-full grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              {productResults.map((product) => (
                <ProductResultCard
                  key={product.id}
                  product={product}
                  related={
                    relatedByProducer.get(product.producerId)?.filter((p) => p.id !== product.id) ?? []
                  }
                  canSave={canSaveProduct}
                  inDeck={deckIds.has(product.id)}
                  onSave={onAddToDeck}
                  onCreateOrder={onStartOrderFromProduct}
                  onOpen={onOpenProduct}
                  compact
                  cardWidth={CARD_WIDTH}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun produit trouve"
              subtitle="Ajustez les filtres ou changez de zone pour voir plus de resultats."
            />
          )
        ) : hasProducers ? (
          <div className="grid gap-4 px-1 sm:px-3 items-stretch w-full grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
            {producerGroups.map((group) => (
              <ProductGroupContainer
                key={`producer-${group.id}`}
                group={group}
                canSave={canSaveProduct}
                deckIds={deckIds}
                onSave={onAddToDeck}
                onCreateOrder={onStartOrderFromProduct}
                onOpenProduct={onOpenProduct}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aucun producteur trouve"
            subtitle="Essayez un autre filtre (agroforesterie, bio, circuit court)."
          />
        )}
      </section>
    </div>
  );
}

function ScopeToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
        active
          ? 'bg-[#FF6B4A] border-[#FF6B4A] text-white shadow-sm'
          : 'bg-white border-gray-200 text-[#374151] hover:border-[#FF6B4A]/60'
      }`}
    >
      {label}
    </button>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-sm transition-colors inline-flex items-center gap-2 ${
        active
          ? 'bg-[#E6F6F0] border-[#C8EBDD] text-[#0F5132]'
          : 'bg-white border-gray-200 text-[#374151] hover:border-[#FF6B4A]/60'
      }`}
    >
      <SlidersHorizontal className="w-4 h-4" />
      {label}
    </button>
  );
}

function FilterGroup({
  label,
  icon,
  options,
  activeValues,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  options: Array<{ id: string; label: string }>;
  activeValues: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-[#374151]">
        <span className="w-8 h-8 rounded-full bg-[#F9FAFB] border border-gray-200 flex items-center justify-center">
          {icon}
        </span>
        <p className="font-semibold">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <FilterPill
            key={option.id}
            label={option.label}
            active={activeValues.includes(option.id)}
            onClick={() => onToggle(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProductResultCard({
  product,
  related: _related,
  canSave,
  inDeck,
  onSave,
  onCreateOrder,
  onOpen,
  compact = false,
  cardWidth = CARD_WIDTH,
}: {
  product: Product;
  related: Product[];
  canSave: boolean;
  inDeck: boolean;
  onSave?: (product: Product) => void;
  onCreateOrder?: (product: Product) => void;
  onOpen: (productId: string) => void;
  compact?: boolean;
  cardWidth?: number;
}) {
  const measurementLabel = product.measurement === 'kg' ? 'Au kilo' : "A l'unite";
  const productAttrs = Array.from(getProductAttributes(product));
  const width = cardWidth ?? CARD_WIDTH;
  const cardStyle = {
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
    flex: '0 0 auto',
    minHeight: `${CARD_HEIGHT}px`,
    height: `${CARD_HEIGHT}px`,
  };
  const imageStyle = compact ? { height: '140px' } : { height: '180px' };

  return (
    <div
      className="bg-white rounded-2xl border border-[#F1E3DA] shadow-[0_12px_30px_-18px_rgba(31,41,55,0.35)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow flex-shrink-0 h-full"
      style={cardStyle}
    >
      <div className="relative w-full overflow-hidden" style={imageStyle}>
        <ImageWithFallback
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3.5 space-y-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-[#6B7280] flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {product.producerName} - {product.producerLocation}
            </p>
            <h4 className="text-base font-semibold text-[#1F2937] truncate">{product.name}</h4>
          </div>
          {canSave && onSave && (
            <button
              type="button"
              onClick={() => onSave(product)}
              disabled={inDeck}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shadow-sm ${
                inDeck
                  ? 'bg-[#28C1A5] text-white cursor-default'
                  : 'bg-[#FF6B4A] text-white hover:bg-[#FF5A39]'
              }`}
            >
              {inDeck ? 'Ajoute' : 'Ajouter'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-[#1F2937] flex-wrap">
          <span className="text-lg font-semibold text-[#FF6B4A]">
            {product.price.toFixed(2)} EUR
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-gray-200 text-[#374151]">
            {product.unit} - {measurementLabel}
          </span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              product.inStock
                ? 'bg-[#E6F6F0] border-[#C8EBDD] text-[#0F5132]'
                : 'bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280]'
            }`}
          >
            {product.inStock ? 'En stock' : 'Rupture'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FFF1E6] border border-[#FFE0D1] text-[#B45309]">
            {product.category}
          </span>
          {productAttrs.map((attr) => (
            <span
              key={attr}
              className="text-[11px] px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-gray-200 text-[#374151]"
            >
              {attr.replace('-', ' ')}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 mt-auto">
          <div className="flex items-center gap-2.5">
            {onCreateOrder && (
              <button
                type="button"
                onClick={() => onCreateOrder(product)}
                className="px-3.5 py-1.5 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors shadow-sm"
              >
                Creer
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpen(product.id)}
              className="inline-flex items-center gap-2 text-lg font-semibold text-[#FF6B4A] hover:text-[#FF5A39]"
            >
              Voir la fiche
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductGroupContainer({
  group,
  canSave,
  deckIds,
  onSave,
  onCreateOrder,
  onOpenProduct,
  onOpenOrder,
}: {
  group: ProductGroupDescriptor;
  canSave: boolean;
  deckIds: Set<string>;
  onSave?: (product: Product) => void;
  onCreateOrder?: (product: Product) => void;
  onOpenProduct: (productId: string) => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const useCarousel = group.products.length > MAX_VISIBLE_CARDS;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(useCarousel);
  const visibleSlots = useCarousel ? MAX_VISIBLE_CARDS : Math.max(1, group.products.length);
  const containerWidth =
    visibleSlots * CARD_WIDTH + (visibleSlots - 1) * CARD_GAP + CONTAINER_SIDE_PADDING * 2;
  const containerMinWidth = CARD_WIDTH + CONTAINER_SIDE_PADDING * 2;

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 8);
  };

  const scrollByCards = (direction: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = direction * (CARD_WIDTH + CARD_GAP) * 2;
    el.scrollBy({ left: delta, behavior: 'smooth' });
    window.requestAnimationFrame(updateScrollState);
  };

  React.useEffect(() => {
    updateScrollState();
  }, [group.products.length]);

  const isOrder = group.variant === 'order';
  const firstProduct = group.products[0];

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[#FFE0D1] bg-gradient-to-b from-white via-white to-[#FFF8F3] shadow-[0_20px_50px_-28px_rgba(255,107,74,0.35)] flex flex-col h-full"
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        flex: `1 1 ${CONTAINER_FLEX_BASIS}px`,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-[#FFE0D1] bg-white">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-[#6B7280] flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            {group.location}
          </p>
          <h4 className="text-base font-semibold text-[#1F2937] truncate">{group.title}</h4>
          {isOrder && group.sharerName && (
            <p className="text-xs text-[#6B7280] truncate">Par {group.sharerName}</p>
          )}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
          {!isOrder && onCreateOrder && firstProduct && (
            <button
              type="button"
              onClick={() => onCreateOrder(firstProduct)}
              className="px-4 py-2 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors whitespace-nowrap shadow-sm"
            >
              Creer
            </button>
          )}
          {isOrder && onOpenOrder && (
            <button
              type="button"
              onClick={() => onOpenOrder(group.orderId ?? group.id)}
              className="px-4 py-2 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors whitespace-nowrap shadow-sm"
            >
              Participer
            </button>
          )}
          <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
            {group.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full bg-white/90 border border-gray-200 text-[#374151] text-xs shadow-[0_2px_6px_rgba(0,0,0,0.04)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-4 flex-1 flex">
        {useCarousel ? (
          <div className="relative w-full">
            <div
              ref={scrollRef}
              onScroll={updateScrollState}
              className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth px-1 sm:px-0"
              style={{ alignItems: 'stretch' }}
            >
              {group.products.map((product) => (
                <div
                  key={product.id}
                  className="snap-start"
                  style={{ width: `${CARD_WIDTH}px`, minWidth: `${CARD_WIDTH}px`, flex: `0 0 ${CARD_WIDTH}px` }}
                >
                  <ProductResultCard
                    product={product}
                    related={[]}
                    canSave={canSave}
                    inDeck={deckIds.has(product.id)}
                    onSave={onSave}
                    onOpen={onOpenProduct}
                    compact
                    cardWidth={CARD_WIDTH}
                  />
                </div>
              ))}
            </div>
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 shadow-sm rounded-full w-8 h-8 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4 text-[#374151]" />
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 shadow-sm rounded-full w-8 h-8 flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4 text-[#374151]" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 sm:gap-4 pb-1 w-full" style={{ alignItems: 'stretch' }}>
            {group.products.map((product) => (
              <ProductResultCard
                key={product.id}
                product={product}
                related={[]}
                canSave={canSave}
                inDeck={deckIds.has(product.id)}
                onSave={onSave}
                onOpen={onOpenProduct}
                compact
                cardWidth={CARD_WIDTH}
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







