import React from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Globe2,
  Info,
  Leaf,
  Lock,
  MapPin,
  Scale,
  ShoppingCart,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { GroupOrder } from '../types';
import { ProductResultCard } from './ProductsLanding';
import { CARD_WIDTH, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../constants/cards';
import { toast } from 'sonner';
import './OrderClientView.css';

interface OrderClientViewProps {
  order: GroupOrder;
  onClose: () => void;
  onVisibilityChange?: (visibility: GroupOrder['visibility']) => void;
  onPurchase?: (payload: { quantities: Record<string, number>; total: number; weight: number }) => void;
  initialQuantities?: Record<string, number>;
  isOwner?: boolean;
}

function formatPrice(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function labelForDay(day: string) {
  const map: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  };
  return map[day] ?? day;
}

function getProductWeightKg(product: GroupOrder['products'][number]) {
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
}

const ORDER_CARD_WIDTH = CARD_WIDTH;

export function OrderClientView({
  order,
  onClose,
  onVisibilityChange,
  onPurchase,
  initialQuantities,
  isOwner = true,
}: OrderClientViewProps) {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const next: Record<string, number> = {};
    order.products.forEach((product) => {
      const initial = initialQuantities?.[product.id] ?? 0;
      next[product.id] = Math.max(0, Number(initial) || 0);
    });
    setQuantities(next);
  }, [order.id, order.products, initialQuantities]);

  const totalCards = React.useMemo(
    () => Object.values(quantities).reduce((sum, qty) => sum + qty, 0),
    [quantities]
  );

  const totalPrice = React.useMemo(
    () =>
      order.products.reduce((sum, product) => {
        const qty = quantities[product.id] ?? 0;
        return sum + product.price * qty;
      }, 0),
    [order.products, quantities]
  );

  const alreadyOrderedWeight = order.orderedWeight ?? 0;

  const selectedWeight = React.useMemo(
    () =>
      order.products.reduce((sum, product) => {
        const qty = quantities[product.id] ?? 0;
        const weightPerUnit = getProductWeightKg(product);
        return sum + weightPerUnit * qty;
      }, 0),
    [order.products, quantities]
  );

  const totalWeightTowardsGoal = alreadyOrderedWeight + selectedWeight;
  const basePercent = order.minWeight > 0 ? (alreadyOrderedWeight / order.minWeight) * 100 : 0;
  const selectionPercent = order.minWeight > 0 ? (selectedWeight / order.minWeight) * 100 : 0;
  const progressPercent = basePercent + selectionPercent;
  const cappedBase = Math.min(basePercent, 100);
  const cappedSelection = Math.max(Math.min(basePercent + selectionPercent, 100) - cappedBase, 0);
  const extraPercent = Math.max(0, progressPercent - 100);
  const remainingWeight = Math.max(order.minWeight - totalWeightTowardsGoal, 0);

  const baseSegmentStyle: React.CSSProperties = {
    width: `${cappedBase}%`,
    boxShadow: '0 6px 16px -8px rgba(34,197,94,0.4)',
    background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
    backgroundColor: '#22c55e',
  };

  const selectionSegmentStyle: React.CSSProperties = {
    width: `${cappedSelection}%`,
    left: `${cappedBase}%`,
    boxShadow: '0 6px 16px -8px rgba(250,204,21,0.6)',
    background: 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)',
    backgroundColor: '#facc15',
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const handleVisibilityToggle = () => {
    if (!isOwner) return;
    const next = order.visibility === 'public' ? 'private' : 'public';
    onVisibilityChange?.(next);
    toast.success(`Commande rendue ${next === 'public' ? 'publique' : 'privée'}`);
  };

  const handlePurchase = () => {
    if (totalCards === 0) {
      toast.info('Ajoutez au moins une carte avant de valider.');
      return;
    }
    const snapshot = { ...quantities };
    onPurchase?.({ quantities: snapshot, total: totalPrice, weight: selectedWeight });
  };

  const pickupAddress =
    order.pickupAddress ||
    [order.pickupStreet, [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
    'Lieu précis communiqué après paiement';

  const pickupLine = order.pickupSlots?.length
    ? order.pickupSlots
        .map((slot) => `${labelForDay(slot.label ?? slot.day)} ${slot.start ?? ''}-${slot.end ?? ''}`)
        .join(' / ')
    : order.message || 'Voir message de retrait';
  const deadlineDate = order.deadline instanceof Date ? order.deadline : new Date(order.deadline);
  const now = React.useMemo(() => new Date(), []);
  const daysLeft = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const hasPassedDeadline = deadlineDate.getTime() < now.getTime();
  const statusLabel =
    order.status === 'completed'
      ? 'Terminee'
      : order.status === 'closed' || hasPassedDeadline
        ? 'Fermee'
        : 'En cours';
  const statusColor =
    order.status === 'completed'
      ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
      : order.status === 'closed' || hasPassedDeadline
        ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
        : 'bg-[#E0F2FE] text-[#075985] border-[#BAE6FD]';

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button
          onClick={onClose}
          className="order-client-view__back-button"
          type="button"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <button
              type="button"
              onClick={handleVisibilityToggle}
              className={`order-client-view__visibility-button ${
                order.visibility === 'public'
                  ? 'order-client-view__visibility-button--public'
                  : 'order-client-view__visibility-button--private'
              }`}
            >
              {order.visibility === 'public' ? <Globe2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {order.visibility === 'public' ? 'Commande publique' : 'Commande privee'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="relative p-6 md:p-8 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-2xl md:text-3xl font-semibold text-[#1F2937] leading-tight">{order.title}</h2>
                  <p className="text-sm text-[#4B5563]">
                    Par {order.sharerName}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                    <Scale className="w-4 h-4 text-[#FF6B4A]" />
                    Capacite
                  </div>
                  <p className="text-[#1F2937] font-semibold text-lg">
                    {order.minWeight} kg - {order.maxWeight} kg
                  </p>
                </div>
                <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                    <CalendarClock className="w-4 h-4 text-[#FF6B4A]" />
                    Cloture
                  </div>
                  <p className="text-[#1F2937] font-semibold text-lg">
                    {deadlineDate.toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {hasPassedDeadline ? 'Echeance depassee' : `Dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                    <MapPin className="w-4 h-4 text-[#FF6B4A]" />
                    Retrait
                  </div>
                  <p className="text-[#1F2937] font-semibold text-lg leading-tight">{pickupLine}</p>
                  <p className="text-xs text-[#6B7280]">{pickupAddress}</p>
                </div>
              </div>

              {order.message && (
                <div className="bg-white border border-[#FFDCC4] rounded-2xl p-4 text-sm text-[#92400E] shadow-sm">
                  <span className="inline-flex items-center gap-2 font-semibold text-[#B45309]">
                    <Info className="w-4 h-4" />
                  </span>
                  <p className="mt-2 leading-relaxed text-[#92400E]">{order.message}</p>
                </div>
              )}
            </div>
          </div>

          <div className="order-client-view__products-section space-y-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="h-px bg-gray-100" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#1F2937]">Choisissez vos produits</h3>
              </div>
            </div>

            {order.products.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-6 text-sm text-[#6B7280] shadow-sm">
                Aucun produit n'est associe a cette commande pour l'instant.
              </div>
            ) : (
              <OrderProductsCarousel
                products={order.products}
                quantities={quantities}
                onDeltaQuantity={handleQuantityChange}
                onDirectQuantity={(productId, value) =>
                  setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, value) }))
                }
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FF6B4A]/10 text-[#FF6B4A] border border-[#FF6B4A]/20">
                  <Users className="w-4 h-4" />
                </span>
                <p className="text-lg font-semibold text-[#1F2937] leading-snug">Progression de la commande : partagez là autour de vous pour qu'elle soit complétée</p>
              </div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#B45309] border border-[#FFDCC4] font-semibold text-sm shadow-sm">
                {progressPercent.toFixed(0)}%
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-medium">
                <span className="text-[#15803d] font-semibold">Déjà achetés : {alreadyOrderedWeight.toFixed(2)} kg</span>
                <span className="text-[#d97706] font-semibold">Votre sélection : {selectedWeight.toFixed(2)} kg</span>
                <span className="text-[#FF6B4A] font-semibold">Objectif : {order.minWeight} kg</span>
              </div>
              <div
                className="relative w-full h-5 rounded-full bg-[#F3F4F6] overflow-hidden border border-[#E5E7EB]"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)' }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] transition-all duration-500 ease-out"
                  style={baseSegmentStyle}
                />
                <div
                  className="absolute top-0 h-full rounded-full bg-gradient-to-r from-[#facc15] to-[#f59e0b] transition-all duration-500 ease-out"
                  style={selectionSegmentStyle}
                />
              </div>
            </div>

            {extraPercent > 0 && (
              <div className="flex items-start gap-3 text-xs text-[#9A3412] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-3 shadow-sm">
                <span className="inline-flex w-2 h-2 mt-1 rounded-full bg-[#FF6B4A]" />
                <span>Les {extraPercent.toFixed(0)}% au-dessus du minimum requis pour lancer la commande vous permettent d'obtenir des avoirs sur des prochaines commandes.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-[#FFF9F3] border border-[#FFDCC4] rounded-2xl p-3 space-y-1 shadow-sm">
                <p className="text-xs text-[#B45309] font-semibold">Poids restant</p>
                <p className="text-xl font-semibold text-[#1F2937]">{remainingWeight.toFixed(2)} kg</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-4">
            <div className="text-sm text-[#6B7280] space-y-1">
              <p>
                Total : <span className="text-[#1F2937] font-semibold">{totalCards}</span>
              </p>
              <p>
                Montant à payer : <span className="text-[#1F2937] font-semibold">{formatPrice(totalPrice)}</span>
              </p>
              <p className="text-xs text-[#6B7280]">
                Poids pris en compte : {totalWeightTowardsGoal.toFixed(2)} kg (dont votre sélection : {selectedWeight.toFixed(2)} kg)
              </p>
            </div>
            <div className="h-px bg-gray-100" />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handlePurchase}
                disabled={totalCards === 0}
                className="order-client-view__purchase-button"
              >
                <ShoppingCart className="w-4 h-4" />
                Participer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderProductsCarousel({
  products,
  quantities,
  onDeltaQuantity,
  onDirectQuantity,
}: {
  products: GroupOrder['products'];
  quantities: Record<string, number>;
  onDeltaQuantity: (productId: string, delta: number) => void;
  onDirectQuantity: (productId: string, value: number) => void;
}) {
  const [startIndex, setStartIndex] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(MIN_VISIBLE_CARDS);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const computeVisible = React.useCallback((width: number) => {
    const available = Math.max(0, width - CONTAINER_SIDE_PADDING * 2 + CARD_GAP);
    const perCard = CARD_WIDTH + CARD_GAP;
    return Math.max(MIN_VISIBLE_CARDS, Math.floor(available / perCard) || 0);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width ?? el.clientWidth;
      const next = computeVisible(width);
      setVisibleCount((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [computeVisible]);

  React.useEffect(() => {
    const maxIndex = Math.max(0, products.length - visibleCount);
    setStartIndex((prev) => Math.min(prev, maxIndex));
  }, [products.length, visibleCount]);

  const useCarousel = products.length > visibleCount;
  const maxIndex = Math.max(0, products.length - visibleCount);

  const containerMinWidth =
    MIN_VISIBLE_CARDS * CARD_WIDTH +
    (MIN_VISIBLE_CARDS - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2;

  const containerStyle: React.CSSProperties = {
    minWidth: `${containerMinWidth}px`,
    width: '100%',
    paddingInline: CONTAINER_SIDE_PADDING,
    position: 'relative',
  };

  const productsToShow = useCarousel
    ? products.slice(startIndex, startIndex + visibleCount)
    : products;

  const canScrollLeft = useCarousel && startIndex > 0;
  const canScrollRight = useCarousel && startIndex < maxIndex;

  const goLeft = () => {
    if (!canScrollLeft) return;
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const goRight = () => {
    if (!canScrollRight) return;
    setStartIndex((prev) => Math.min(prev + 1, maxIndex));
  };

  return (
    <div className="relative" style={containerStyle} ref={containerRef}>
      <div className="flex gap-3" style={{ alignItems: 'stretch', justifyContent: 'flex-start' }}>
        {productsToShow.map((product) => {
          const quantity = quantities[product.id] ?? 0;
          return (
            <div
              key={product.id}
              style={{
                width: `${ORDER_CARD_WIDTH}px`,
                minWidth: `${ORDER_CARD_WIDTH}px`,
                flex: `0 0 ${ORDER_CARD_WIDTH}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <ProductResultCard
                product={product}
                related={[]}
                canSave={false}
                inDeck={false}
                onOpen={() => undefined}
                onOpenProducer={() => undefined}
                showSelectionControl={false}
                cardWidth={ORDER_CARD_WIDTH}
                compact
              />
              <div className="w-full space-y-2" style={{ maxWidth: ORDER_CARD_WIDTH }}>
                <p className="text-[12px] text-[#6B7280] text-center">
                  Environ {getProductWeightKg(product).toFixed(2)} kg par carte
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDeltaQuantity(product.id, -1)}
                    className="order-client-view__quantity-button order-client-view__quantity-button--decrement"
                    aria-label={`Retirer une carte de ${product.name}`}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={(e) => {
                      const value = Math.max(0, Number(e.target.value) || 0);
                      onDirectQuantity(product.id, value);
                    }}
                    className="w-20 text-center border border-gray-200 rounded-lg py-2 focus:outline-none focus:border-[#FF6B4A]"
                    aria-label={`Quantite pour ${product.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => onDeltaQuantity(product.id, 1)}
                    className="order-client-view__quantity-button order-client-view__quantity-button--increment"
                    aria-label={`Ajouter une carte de ${product.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={goLeft}
          aria-label="Défiler vers la gauche"
          className="order-client-view__carousel-button order-client-view__carousel-button--left"
        >
          <ChevronLeft className="w-4 h-4 text-[#FF6B4A] mx-auto" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={goRight}
          aria-label="Défiler vers la droite"
          className="order-client-view__carousel-button order-client-view__carousel-button--right"
        >
          <ChevronRight className="w-4 h-4 text-[#FF6B4A] mx-auto" />
        </button>
      )}
    </div>
  );
}
