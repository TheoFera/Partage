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
  Heart,
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
  onRemoveFromDeck?: (productId: string) => void;
  onOpenProduct: (productId: string) => void;
  onOpenProducer?: (product: Product) => void;
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

const CARD_WIDTH = 150;
const CARD_HEIGHT = 230;
const CARD_GAP = 10;
const MAX_VISIBLE_CARDS = 2;
const CONTAINER_SIDE_PADDING = 9;

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
  onRemoveFromDeck,
  onOpenProduct,
  onOpenProducer,
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
        location: stripDistance(product.producerLocation),
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
      const locationRaw =
        order.pickupAddress || sortedProducts[0]?.producerLocation || order.producerName;
      const location = stripDistance(locationRaw);
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
  const showCombined = scope === 'combined';
  const hasProducts = productResults.length > 0;
  const hasProducers = producerResults.length > 0;

  return (
    <div className="space-y-6">
      <section
        className="relative isolate overflow-hidden"
        style={{
          position: 'relative',
          left: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          width: '100vw',
          maxWidth: '100vw',
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
            src="/banniere.jpg"
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
            maxWidth: '1500px',
            margin: '0 auto',
            padding: '122px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '26px',
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
            Bons produits en direct des producteurs.
          </h2>
          <p
            style={{
              fontSize: 'clamp(26px, 4vw, 30px)',
              fontWeight: 600,
              lineHeight: 1.15,
              color: '#0F172A',
              maxWidth: '780px',
              margin: '0 auto',
            }}
          >
            Participez à une commande près de chez vous ou créez la vôtre et gardez en gratuitement une part.
          </p>
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
              label="Caractéristiques"
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
            <div className="px-1 sm:px-3 w-full">
              <div
                className="mx-auto"
                style={{
                  maxWidth: '1200px',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                }}
              >
                {combinedGroups.map((group) => (
                <div
                  key={`${group.variant}-${group.id}`}
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'top',
                    marginRight: '12px',  // espace horizontal entre conteneurs
                    marginBottom: '12px', // espace vertical entre les lignes
                  }}
                >
                  <ProductGroupContainer
                    group={group}
                    canSave={canSaveProduct}
                    deckIds={deckIds}
                    onSave={onAddToDeck}
                    onRemoveFromDeck={onRemoveFromDeck}
                    onToggleSelection={toggleSelection}
                    onCreateOrder={onStartOrderFromProduct}
                    onOpenProduct={onOpenProduct}
                    onOpenOrder={onOpenOrder}
                    onOpenProducer={onOpenProducer}
                  />
                </div>
              ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Aucun résultat"
              subtitle="Ajustez les filtres pour voir producteurs, partageurs et produits correspondants."
            />
          )
        ) : showProducts ? (
          hasProducts ? (
            <div className="px-1 sm:px-3 w-full">
              <div className="flex flex-wrap gap-3 items-stretch w-full justify-start">
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
              className="mx-auto"
              style={{
                maxWidth: '1200px',
                textAlign: 'left',
                whiteSpace: 'normal',
              }}
            >
              {producerGroups.map((group) => (
                <div
                  key={`producer-${group.id}`}
                  className="inline-block align-top mr-4 mb-4"
                >
                  <ProductGroupContainer
                    group={group}
                    canSave={canSaveProduct}
                    deckIds={deckIds}
                    onSave={onAddToDeck}
                    onRemoveFromDeck={onRemoveFromDeck}
                    onToggleSelection={toggleSelection}
                    onCreateOrder={onStartOrderFromProduct}
                    onOpenProduct={onOpenProduct}
                    onOpenProducer={onOpenProducer}
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
  onRemove,
  onToggleSelection,
  onOpenProducer,
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
  onRemove?: (productId: string) => void;
  onToggleSelection?: (product: Product, isSelected: boolean) => void;
  onOpenProducer?: (product: Product) => void;
  onCreateOrder?: (product: Product) => void;
  onOpen: (productId: string) => void;
  compact?: boolean;
  cardWidth?: number;
}) {
  const [heartPulse, setHeartPulse] = React.useState(false);
  const [selected, setSelected] = React.useState(inDeck);
  React.useEffect(() => {
    setSelected(inDeck);
  }, [inDeck]);
  const measurementLabel = product.measurement === 'kg' ? '/ Kg' : "/ unité";
  const width = cardWidth ?? CARD_WIDTH;
  const cardStyle = {
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
    flex: '0 0 auto',
    minHeight: `${CARD_HEIGHT}px`,
    height: `${CARD_HEIGHT}px`,
  };
  const imageStyle = compact ? { height: '125px' } : { height: '150px' };
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
        {canSave && (onToggleSelection || onSave || onRemove) && (
          <button
            type="button"
            onClick={handleHeartClick}
            className={`absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center hover:shadow-md transition-transform duration-200 ease-out ${
              heartPulse ? 'scale-115 ring-2 ring-[#FF6B4A]/60 shadow-lg' : ''
            }`}
            aria-label={selected ? 'Retirer de la sélection' : 'Ajouter à la sélection'}
            aria-pressed={selected}
          >
            <Heart
              className="w-5 h-5 transition-colors"
              stroke={selected ? '#FF6B4A' : '#FF3B1F'}
              fill={selected ? '#FF6B4A' : 'transparent'}
              strokeWidth={1.8}
            />
          </button>
        )}
      </div>
      <div className="p-3.5 space-y-3 flex-1 flex flex-col">
        <div className="space-y-1 min-w-0">
          {headerText && (
            <button
              type="button"
              onClick={() => onOpenProducer?.(product)}
              className="text-xs text-[#6B7280] truncate text-left hover:text-[#FF6B4A] transition-colors"
            >
              {headerText}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(product.id)}
            className="text-left text-base font-semibold text-[#1F2937] hover:text-[#FF6B4A] transition-colors"
          >
            {product.name}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#1F2937] flex-wrap">
          <span className="text-lg font-semibold text-[#FF6B4A]">
            {product.price.toFixed(2)} €
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-gray-200 text-[#374151]">
            {product.unit} - {measurementLabel}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 mt-auto">
          <div className="flex items-center gap-2.5">
            {onCreateOrder && (
              <button
                type="button"
                onClick={() => onCreateOrder(product)}
                className="px-3.5 py-1.5 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors shadow-sm"
              >
                Créer
              </button>
            )}
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
  onRemoveFromDeck,
  onToggleSelection,
  onCreateOrder,
  onOpenProduct,
  onOpenOrder,
  onOpenProducer,
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
}) {
  const useCarousel = group.products.length > MAX_VISIBLE_CARDS;

  // Index de départ des produits visibles dans le carrousel
  const [startIndex, setStartIndex] = React.useState(0);

  // borne pour ne pas dépasser la fin
  const maxIndex = Math.max(0, group.products.length - MAX_VISIBLE_CARDS);

  const canScrollLeft = useCarousel && startIndex > 0;
  const canScrollRight = useCarousel && startIndex < maxIndex;

  const visibleSlots = useCarousel
    ? MAX_VISIBLE_CARDS
    : Math.max(1, group.products.length);

  const containerMinWidth = CARD_WIDTH + CONTAINER_SIDE_PADDING * 2;
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


  const isOrder = group.variant === 'order';
  const firstProduct = group.products[0];

  // Produits effectivement affichés
  const productsToShow = useCarousel
    ? group.products.slice(startIndex, startIndex + MAX_VISIBLE_CARDS)
    : group.products;

  const goLeft = () => {
    if (!canScrollLeft) return;
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const goRight = () => {
    if (!canScrollRight) return;
    setStartIndex((prev) => Math.min(prev + 1, maxIndex));
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#FFE0D1] bg-white shadow-[0_20px_50px_-28px_rgba(255,107,74,0.35)] flex flex-col h-full"
      style={containerStyle}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-[#FFE0D1] bg-white">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-[#6B7280] flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            {group.location}
          </p>
          <h4 className="text-base font-semibold text-[#1F2937] truncate">
            {group.title}
          </h4>
          {isOrder && group.sharerName && (
            <p className="text-xs text-[#6B7280] truncate">
              Par {group.sharerName}
            </p>
          )}
        </div>
        <div className="flex items-stretch sm:items-end gap-2 sm:w-auto">
          {!isOrder && onCreateOrder && firstProduct && (
            <button
              type="button"
              onClick={() => onCreateOrder(firstProduct)}
              className="px-4 py-2 rounded-full bg-[#FF6B4A] text-white text-xs font-semibold hover:bg-[#FF5A39] transition-colors whitespace-nowrap shadow-sm"
            >
              Créer
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
        </div>
      </div>

      {/* Corps : carrousel logique ou liste simple */}
      <div
        className="p-3 sm:p-4 flex-1 flex"
        style={{ paddingInline: CONTAINER_SIDE_PADDING }}
      >
        {useCarousel ? (
          <div className="relative w-full">
            <div
              className="flex gap-2 w-full justify-center"
              style={{ alignItems: 'stretch' }}
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
                compact
                cardWidth={CARD_WIDTH}
              />
            </div>
              ))}
            </div>

            {/* Flèches */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={goLeft}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 shadow-sm rounded-full w-8 h-8 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4 text-[#374151]" />
              </button>
            )}

            {canScrollRight && (
              <button
                type="button"
                onClick={goRight}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 shadow-sm rounded-full w-8 h-8 flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4 text-[#374151]" />
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
