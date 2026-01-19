import React from 'react';
import { GroupOrder, Product } from '../types';
import { Check, X } from 'lucide-react';
import { ProductGroupContainer, ProductGroupDescriptor } from './ProductsLanding';

interface ClientSwipeViewProps {
  products: Product[];
  orders?: GroupOrder[];
  onSave: (product: Product) => void;
  onOpenProduct?: (productId: string) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenSharer?: (sharerName: string) => void;
  onRequestAuth?: () => void;
  locationLabel?: string;
  swipeLocked?: boolean;
  locationStatus?: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error';
  onRequestLocation?: () => void;
  onParticipateOrder?: (orderId: string) => void;
}

const formatOrderLocation = (
  order: GroupOrder,
  fallback?: string,
  locationLabel?: string
) => {
  const city = order.pickupCity?.trim();
  const postcode = order.pickupPostcode?.trim();
  if (city && postcode) return `${city} ${postcode}`;
  if (city) return city;
  if (postcode) return postcode;
  return fallback || locationLabel || 'Proche de vous';
};

export function ClientSwipeView({
  products,
  orders = [],
  onSave,
  onOpenProduct,
  onOpenProducer,
  onOpenSharer,
  onRequestAuth,
  locationLabel,
  swipeLocked = false,
  locationStatus = 'idle',
  onRequestLocation,
  onParticipateOrder,
}: ClientSwipeViewProps) {
  const [index, setIndex] = React.useState(0);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [swipeDirection, setSwipeDirection] = React.useState<'left' | 'right' | null>(null);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const swipeTimeoutRef = React.useRef<number | null>(null);
  const isSwipeLocked = Boolean(swipeLocked);
  const SWIPE_ANIMATION_MS = 320;
  const SWIPE_TRIGGER_PX = 120;

  const orderGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    return orders
      .filter((order) => order.products.length > 0)
      .map((order) => {
        const sortedProducts = [...order.products].sort((a, b) => a.name.localeCompare(b.name));
        const fallback =
          order.mapLocation?.areaLabel ||
          order.pickupAddress ||
          sortedProducts[0]?.producerLocation ||
          order.producerName;
        const location = formatOrderLocation(order, fallback, locationLabel);
        const productCountLabel =
          sortedProducts.length > 1 ? `${sortedProducts.length} produits` : '1 produit';
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title || order.producerName,
          location,
          tags: [order.sharerName, productCountLabel].filter(Boolean) as string[],
          products: sortedProducts,
          variant: 'order',
          status: order.status,
          sharerName: order.sharerName,
          sharerPercentage: order.sharerPercentage,
          minWeight: order.minWeight,
          maxWeight: order.maxWeight,
          orderedWeight: order.orderedWeight,
          deliveryFeeCents: order.deliveryFeeCents,
          deadline: order.deadline,
          avatarUrl: sortedProducts[0]?.imageUrl,
        };
      });
  }, [locationLabel, orders]);

  const producerGroups = React.useMemo<ProductGroupDescriptor[]>(() => {
    const grouped = new Map<string, Product[]>();
    products.forEach((product) => {
      const key = product.producerId || product.producerName || product.id;
      const list = grouped.get(key) ?? [];
      grouped.set(key, [...list, product]);
    });
    return Array.from(grouped.entries()).map(([key, list]) => {
      const first = list[0];
      return {
        id: key,
        title: first?.producerName || 'Producteur',
        location: first?.producerLocation || locationLabel || 'Proche de vous',
        tags: [],
        products: list,
        variant: 'producer',
        avatarUrl: first?.imageUrl,
      };
    });
  }, [products, locationLabel]);

  const groups = orderGroups.length ? orderGroups : producerGroups;

  const emptyDeck = React.useMemo(() => new Set<string>(), []);

  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-3">
        <p className="text-sm text-[#6B7280]">Aucun produit disponible dans votre zone pour l'instant.</p>
        <p className="text-sm text-[#FF6B4A]">RǸessayez un peu plus tard ou ajustez votre position.</p>
      </div>
    );
  }

  const currentGroup = groups[index % groups.length];

  const moveNext = () => setIndex((prev) => (prev + 1) % groups.length);

  const clearSwipeTimeout = () => {
    if (swipeTimeoutRef.current) {
      window.clearTimeout(swipeTimeoutRef.current);
      swipeTimeoutRef.current = null;
    }
  };

  const triggerSwipe = (direction: 'left' | 'right') => {
    if (isSwipeLocked || isAnimating) return;
    clearSwipeTimeout();
    setSwipeDirection(direction);
    setIsAnimating(true);
    swipeTimeoutRef.current = window.setTimeout(() => {
      swipeTimeoutRef.current = null;
      if (direction === 'right') {
        if (currentGroup.variant === 'order' && onParticipateOrder) {
          onParticipateOrder(currentGroup.orderId ?? currentGroup.id);
        } else {
          currentGroup.products.forEach((product) => onSave(product));
        }
      }
      moveNext();
      setDragOffset({ x: 0, y: 0 });
      setSwipeDirection(null);
      setIsAnimating(false);
    }, SWIPE_ANIMATION_MS);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (isSwipeLocked || isAnimating) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const targetEl = event.target as HTMLElement | null;
    if (targetEl && targetEl.closest('button')) return;
    clearSwipeTimeout();
    dragStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    setIsDragging(true);
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (isSwipeLocked || isAnimating) return;
    if (!dragStartRef.current || dragStartRef.current.id !== event.pointerId) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const clampedY = Math.max(-40, Math.min(40, deltaY));
    setDragOffset({ x: deltaX, y: clampedY });
  };

  const finalizeDrag = (event: React.PointerEvent) => {
    if (isSwipeLocked || isAnimating) return;
    if (!dragStartRef.current || dragStartRef.current.id !== event.pointerId) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    dragStartRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (Math.abs(deltaX) >= SWIPE_TRIGGER_PX) {
      triggerSwipe(deltaX < 0 ? 'left' : 'right');
      return;
    }
    clearSwipeTimeout();
    setIsAnimating(true);
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
    swipeTimeoutRef.current = window.setTimeout(() => {
      swipeTimeoutRef.current = null;
      setIsAnimating(false);
    }, SWIPE_ANIMATION_MS);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    finalizeDrag(event);
  };

  const handlePointerCancel = (event: React.PointerEvent) => {
    if (!dragStartRef.current || dragStartRef.current.id !== event.pointerId) return;
    dragStartRef.current = null;
    setIsDragging(false);
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const isRequestingLocation = locationStatus === 'requesting';
  const lockStatusMessage =
    locationStatus === 'denied'
      ? 'Localisation refusee. Autorisez-la dans votre navigateur.'
      : locationStatus === 'unsupported'
        ? 'Localisation indisponible sur ce navigateur.'
        : locationStatus === 'error'
          ? 'Erreur de localisation. Reessayez.'
          : null;
  const dragRotation = Math.max(-10, Math.min(10, dragOffset.x * 0.05));
  const swipeStyle: React.CSSProperties = {
    transform: swipeDirection
      ? `translateX(${swipeDirection === 'left' ? '-120%' : '120%'}) rotate(${
          swipeDirection === 'left' ? '-6deg' : '6deg'
        })`
      : `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${dragRotation}deg)`,
    opacity: swipeDirection ? 0 : 1,
    transition: isDragging
      ? 'none'
      : `transform ${SWIPE_ANIMATION_MS}ms ease-out, opacity ${SWIPE_ANIMATION_MS}ms ease-out`,
    willChange: 'transform, opacity',
    cursor: isDragging ? 'grabbing' : 'grab',
  };
  const leftHintStrength = Math.max(0, Math.min(1, -dragOffset.x / SWIPE_TRIGGER_PX));
  const rightHintStrength = Math.max(0, Math.min(1, dragOffset.x / SWIPE_TRIGGER_PX));
  const leftButtonScale = 1 + leftHintStrength * 0.08;
  const rightButtonScale = 1 + rightHintStrength * 0.08;
  const leftButtonShadow = `0 12px 26px rgba(15, 23, 42, ${0.12 + leftHintStrength * 0.18})`;
  const rightButtonShadow = `0 12px 26px rgba(255, 107, 74, ${0.2 + rightHintStrength * 0.3})`;
  const leftButtonBorder = '#E5E7EB';

  React.useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current) {
        window.clearTimeout(swipeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6 client-swipe-view">
      <div className="client-swipe-backdrop" aria-hidden="true">
        <div className="client-swipe-backdrop__mask" />
      </div>
      <div
        className="flex justify-center relative client-swipe-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDragStart={(event) => event.preventDefault()}
        style={
          {
            touchAction: 'pan-y',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitUserDrag: 'none',
            msUserSelect: 'none',
          } as React.CSSProperties & { WebkitUserDrag?: string; msUserSelect?: string }
        }
      >
        <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
          <div
            className={`px-3 py-2 rounded-full border text-xs font-semibold ${
              swipeDirection === 'left'
                ? 'bg-[#FFEFE9] text-[#B45309] border-[#FF6B4A]/40'
                : 'bg-white/80 text-[#9CA3AF] border-[#E5E7EB]'
            }`}
            style={{ opacity: 0.4 + leftHintStrength * 0.6 }}
          >
            Passer
          </div>
          <div
            className={`px-3 py-2 rounded-full border text-xs font-semibold ${
              swipeDirection === 'right'
                ? 'bg-[#FFF1E6] text-[#B45309] border-[#FF6B4A]/40'
                : 'bg-white/80 text-[#9CA3AF] border-[#E5E7EB]'
            }`}
            style={{ opacity: 0.4 + rightHintStrength * 0.6 }}
          >
            Participer
          </div>
        </div>
        <div style={swipeStyle}>
          <ProductGroupContainer
            group={currentGroup}
            canSave={false}
            deckIds={emptyDeck}
            onSave={undefined}
            onRemoveFromDeck={undefined}
            onToggleSelection={undefined}
            onCreateOrder={undefined}
            onOpenProduct={(productId) => onOpenProduct?.(productId)}
            onOpenProducer={(product) => onOpenProducer?.(product)}
            onOpenSharer={(sharerName) => onOpenSharer?.(sharerName)}
            onSelectProducerCategory={() => {}}
          />
        </div>
        {isSwipeLocked ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                border: '1px dashed rgba(255, 107, 74, 0.4)',
                borderRadius: 16,
                padding: 20,
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
                textAlign: 'center',
                maxWidth: 360,
                width: '90%',
                background: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#1F2937',
                    margin: 0,
                  }}
                >
                  Activez la localisation dans votre navigateur
                </h3>
                <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
                  Pour decouvrir des produits autour de vous et debloquer le swipe.
                </p>
              </div>
              {onRequestLocation ? (
                <button
                  type="button"
                  onClick={onRequestLocation}
                  disabled={isRequestingLocation}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: isRequestingLocation ? 'not-allowed' : 'pointer',
                    background: isRequestingLocation ? 'rgba(255, 107, 74, 0.4)' : '#FF6B4A',
                    color: '#FFFFFF',
                    boxShadow: '0 8px 18px rgba(255, 107, 74, 0.25)',
                  }}
                >
                  {isRequestingLocation ? 'Demande en cours...' : 'Autoriser la localisation'}
                </button>
              ) : null}
              {onRequestAuth ? (
                <button
                  type="button"
                  onClick={onRequestAuth}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    fontWeight: 600,
                    border: '1px solid #FF6B4A',
                    background: '#FFFFFF',
                    color: '#FF6B4A',
                    cursor: 'pointer',
                  }}
                >
                  Se connecter ou creer un compte
                </button>
              ) : null}
              {lockStatusMessage ? (
                <p style={{ fontSize: 12, color: '#B45309', margin: 0 }}>{lockStatusMessage}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 68,
            padding: '4px 0',
            background: 'transparent',
            boxShadow: 'none',
            border: 'none',
            opacity: isSwipeLocked ? 0.5 : 1,
          }}
        >
          <button
            type="button"
            onClick={isSwipeLocked ? undefined : () => triggerSwipe('left')}
            disabled={isSwipeLocked}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              cursor: isSwipeLocked ? 'not-allowed' : 'pointer',
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: '#FFFFFF',
                border: `1px solid ${leftButtonBorder}`,
                boxShadow: leftButtonShadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                transform: `scale(${leftButtonScale})`,
                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
              }}
            >
              <X className="w-7 h-7" />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#6B7280',
              }}
            >
              Passer
            </span>
          </button>
          <button
            type="button"
            onClick={isSwipeLocked ? undefined : () => triggerSwipe('right')}
            disabled={isSwipeLocked}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              cursor: isSwipeLocked ? 'not-allowed' : 'pointer',
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: '#FF6B4A',
                boxShadow: rightButtonShadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                transform: `scale(${rightButtonScale})`,
                transition: 'transform 160ms ease, box-shadow 160ms ease',
              }}
            >
              <Check className="w-7 h-7" />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#FF6B4A',
              }}
            >
              Participer
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
