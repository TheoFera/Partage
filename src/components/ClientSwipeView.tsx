import React from 'react';
import { GroupOrder, Product } from '../types';
import { Check, X } from 'lucide-react';
import { ProductGroupContainer, ProductGroupDescriptor } from './ProductsLanding';

interface ClientSwipeViewProps {
  products: Product[];
  orders?: GroupOrder[];
  onSave: (product: Product) => void;
  locationLabel?: string;
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
  locationLabel,
}: ClientSwipeViewProps) {
  const [index, setIndex] = React.useState(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerStartRef = React.useRef<{ x: number; y: number; id?: number } | null>(null);

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
          orderId: order.id,
          title: order.title || order.producerName,
          location,
          tags: [order.sharerName, productCountLabel].filter(Boolean) as string[],
          products: sortedProducts,
          variant: 'order',
          sharerName: order.sharerName,
          minWeight: order.minWeight,
          maxWeight: order.maxWeight,
          orderedWeight: order.orderedWeight,
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
  const movePrev = () => setIndex((prev) => (prev - 1 + groups.length) % groups.length);

  const handleSave = () => {
    currentGroup.products.forEach((product) => onSave(product));
    moveNext();
  };

  const handleSkip = () => {
    moveNext();
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(deltaX) < 30 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      moveNext();
    } else {
      movePrev();
    }
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const targetEl = event.target as HTMLElement | null;
    if (targetEl && targetEl.closest('button')) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    if (pointerStartRef.current.id !== undefined && pointerStartRef.current.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    pointerStartRef.current = null;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      moveNext();
    } else {
      movePrev();
    }
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
  };

  return (
    <div className="space-y-8">
      <div
        className="flex justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: 'pan-y' }}
      >
        <ProductGroupContainer
          group={currentGroup}
          canSave={false}
          deckIds={emptyDeck}
          onSave={undefined}
          onRemoveFromDeck={undefined}
          onToggleSelection={undefined}
          onCreateOrder={undefined}
          onOpenProduct={() => {}}
          onOpenProducer={() => {}}
          onOpenSharer={() => {}}
          onSelectProducerCategory={() => {}}
        />
      </div>

      <div className="flex items-center justify-around">
        <button
          type="button"
          onClick={handleSkip}
          className="flex flex-col items-center gap-1 text-[#6B7280]"
        >
          <div className="w-14 h-14 bg-white rounded-full shadow-lg flex items-center justify-center">
            <X className="w-6 h-6" />
          </div>
          <span className="text-xs">Passer</span>
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex flex-col items-center gap-1 text-[#FF6B4A]"
        >
          <div className="w-14 h-14 bg-[#FF6B4A]/20 text-[#FF6B4A] rounded-full shadow-lg flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
          <span className="text-xs">J'aime</span>
        </button>
      </div>
    </div>
  );
}
