import React from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import type { SupabaseClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import { DeckCard, GroupOrder, Product } from '../../../shared/types';
import { ProductGroupContainer, ProductGroupDescriptor } from '../components/ProductGroup';
import { ORDER_LOCATION_DISPLAY_RADIUS_M } from '../../../shared/constants/locationPrivacy';
import {
  CARD_WIDTH,
  CARD_GAP,
  MAX_VISIBLE_CARDS,
  MIN_VISIBLE_CARDS,
  CONTAINER_SIDE_PADDING,
} from '../../../shared/constants/cards';

const defaultIcon = L.icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const selectedMarkerSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="44" viewBox="0 0 28 44">' +
  '<path d="M14 0C6.3 0 0 6.2 0 14c0 10.5 14 30 14 30s14-19.5 14-30C28 6.2 21.7 0 14 0z" fill="#FF6B4A"/>' +
  '<circle cx="14" cy="14" r="6" fill="#fff"/>' +
  '</svg>';
const selectedMarkerIcon = L.icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(selectedMarkerSvg)}`,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [28, 44],
  iconAnchor: [14, 44],
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

const defaultCenter = { lat: 48.8566, lng: 2.3522 };
const SIDEBAR_HORIZONTAL_PADDING = 12;
const SIDEBAR_EXTRA_WIDTH = 8;
const DESKTOP_SIDEBAR_TOP_OFFSET = 64;
const DESKTOP_SIDEBAR_BOTTOM_OFFSET = 72;
const MOBILE_SIDEBAR_TOP_OFFSET = 64;
const MOBILE_SIDEBAR_BOTTOM_OFFSET = 68;
const MOBILE_TOGGLE_HEIGHT = 24;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => Boolean(value && UUID_REGEX.test(value));

type MapOrderPoint = {
  id: string;
  title: string;
  sharerName: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  products: Product[];
  areaLabel?: string;
};

interface MapViewProps {
  orders: GroupOrder[];
  deck: DeckCard[];
  onAddToDeck?: (product: Product) => void;
  onRemoveFromDeck: (productId: string) => void;
  onOpenProduct?: (
    productId: string,
    context?: { orderCode?: string | null; lotCode?: string | null }
  ) => void;
  onOpenOrder: (orderId: string) => void;
  onOpenProducer: (product: Product) => void;
  onOpenSharer: (sharerName: string) => void;
  locationLabel: string;
  userRole: 'producer' | 'sharer' | 'participant';
  userLocation?: { lat: number; lng: number };
  userAddress?: string;
  supabaseClient?: SupabaseClient | null;
}

function computeCenter(points: MapOrderPoint[]) {
  if (!points.length) return defaultCenter;
  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lng += point.lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };
}

const getGroupContainerWidth = (productCount: number) => {
  const visibleSlots =
    productCount > MAX_VISIBLE_CARDS
      ? MAX_VISIBLE_CARDS
      : Math.max(MIN_VISIBLE_CARDS, productCount);
  return (
    visibleSlots * CARD_WIDTH +
    (visibleSlots - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2
  );
};

export function MapView({
  orders,
  deck,
  onAddToDeck,
  onRemoveFromDeck,
  onOpenProduct,
  onOpenOrder,
  onOpenProducer,
  onOpenSharer,
  locationLabel: _locationLabel,
  userRole,
  userLocation,
  userAddress,
  supabaseClient,
}: MapViewProps) {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layersRef = React.useRef<L.LayerGroup | null>(null);
  const markersRef = React.useRef<Map<string, L.Marker>>(new Map());
  const selectedOrderRef = React.useRef<GroupOrder | null>(null);
  const mobileItemRef = React.useRef<HTMLDivElement | null>(null);
  const [resolvedCenter, setResolvedCenter] = React.useState<{ lat: number; lng: number } | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<GroupOrder | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [mobileContainerHeight, setMobileContainerHeight] = React.useState<number | null>(null);
  const [profileMetaById, setProfileMetaById] = React.useState<
    Record<string, { path: string | null; updatedAt: string | null; handle?: string | null; name?: string | null }>
  >({});

  const mapOrders = React.useMemo<MapOrderPoint[]>(() => {
    return orders
      .filter((order) => order.visibility === 'public' && order.status === 'open' && order.mapLocation)
      .map((order) => ({
        id: order.id,
        title: order.title,
        sharerName: order.sharerName,
        lat: order.mapLocation!.lat,
        lng: order.mapLocation!.lng,
        radiusMeters: order.mapLocation?.radiusMeters ?? ORDER_LOCATION_DISPLAY_RADIUS_M,
        products: order.products,
        areaLabel: order.mapLocation?.areaLabel,
      }));
  }, [orders]);

  const mapCenter = React.useMemo(() => {
    if (resolvedCenter) return resolvedCenter;
    if (mapOrders.length) return computeCenter(mapOrders);
    return defaultCenter;
  }, [mapOrders, resolvedCenter?.lat, resolvedCenter?.lng]);

  const profileIds = React.useMemo(() => {
    const ids = new Set<string>();
    orders.forEach((order) => {
      if (isUuid(order.sharerId)) ids.add(order.sharerId);
      if (isUuid(order.producerId)) ids.add(order.producerId);
    });
    return Array.from(ids);
  }, [orders]);

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
          console.warn('Map profile avatars load error:', error);
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

  React.useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  React.useEffect(() => {
    if (userLocation) {
      setResolvedCenter(userLocation);
      return;
    }
    setResolvedCenter(null);
  }, [userLocation?.lat, userLocation?.lng]);

  React.useEffect(() => {
    if (!userLocation) {
      setResolvedCenter(null);
    }
  }, [userAddress, userLocation]);

  const deckIds = React.useMemo(() => new Set(deck.map((card) => card.id)), [deck]);
  const canSave = userRole !== 'producer';
  const toggleSelection = React.useCallback(
    (product: Product, isSelected: boolean) => {
      if (isSelected) {
        onRemoveFromDeck(product.id);
        return;
      }
      onAddToDeck?.(product);
    },
    [onAddToDeck, onRemoveFromDeck]
  );

  const selectedGroup: ProductGroupDescriptor | null = React.useMemo(() => {
    if (!selectedOrder) return null;
    const sharerMeta = profileMetaById[selectedOrder.sharerId];
    const producerMeta = profileMetaById[selectedOrder.producerId];
    const resolvedProducerName = producerMeta?.name?.trim() || selectedOrder.producerName;
    const productCountLabel =
      selectedOrder.products.length > 1
        ? `${selectedOrder.products.length} produits`
        : '1 produit';
    return {
      id: selectedOrder.id,
      orderId: selectedOrder.orderCode ?? selectedOrder.id,
      title: selectedOrder.title || resolvedProducerName,
      location:
        selectedOrder.mapLocation?.areaLabel ||
        selectedOrder.pickupCity ||
        selectedOrder.pickupPostcode ||
        'Commande locale',
      tags: [selectedOrder.sharerName, productCountLabel].filter(Boolean) as string[],
      products: selectedOrder.products,
      variant: 'order',
      status: selectedOrder.status,
      sharerName: selectedOrder.sharerName,
      sharerPercentage: selectedOrder.sharerPercentage,
      minWeight: selectedOrder.minWeight,
      maxWeight: selectedOrder.maxWeight,
      orderedWeight: selectedOrder.orderedWeight,
      deliveryFeeCents: selectedOrder.deliveryFeeCents,
      deadline: selectedOrder.deadline,
      profileHandle: sharerMeta?.handle ?? undefined,
      avatarPath: sharerMeta?.path ?? null,
      avatarUpdatedAt: sharerMeta?.updatedAt ?? null,
      avatarUrl: selectedOrder.products[0]?.imageUrl,
    };
  }, [profileMetaById, selectedOrder]);

  const overlayGroups: ProductGroupDescriptor[] = React.useMemo(() => {
    const all = mapOrders
      .map((point) => {
        const order = orders.find((o) => o.id === point.id);
        if (!order) return null;
        const sharerMeta = profileMetaById[order.sharerId];
        const producerMeta = profileMetaById[order.producerId];
        const resolvedProducerName = producerMeta?.name?.trim() || order.producerName;
        const productCountLabel =
          order.products.length > 1 ? `${order.products.length} produits` : '1 produit';
        return {
          id: order.id,
          orderId: order.orderCode ?? order.id,
          title: order.title || resolvedProducerName,
          location:
            order.mapLocation?.areaLabel ||
            order.pickupCity ||
            order.pickupPostcode ||
            'Commande locale',
          tags: [order.sharerName, productCountLabel].filter(Boolean) as string[],
          products: order.products,
          variant: 'order' as const,
          status: order.status,
          sharerName: order.sharerName,
          sharerPercentage: order.sharerPercentage,
          minWeight: order.minWeight,
          maxWeight: order.maxWeight,
          orderedWeight: order.orderedWeight,
          deliveryFeeCents: order.deliveryFeeCents,
          deadline: order.deadline,
          profileHandle: sharerMeta?.handle ?? undefined,
          avatarPath: sharerMeta?.path ?? null,
          avatarUpdatedAt: sharerMeta?.updatedAt ?? null,
          avatarUrl: order.products[0]?.imageUrl,
        } as ProductGroupDescriptor;
      })
      .filter(Boolean) as ProductGroupDescriptor[];

    if (!selectedGroup) return all;
    const others = all.filter((g) => g.id !== selectedGroup.id);
    return [selectedGroup, ...others];
  }, [mapOrders, orders, profileMetaById, selectedGroup]);

  const groupedOverlay = React.useMemo(() => {
    if (!selectedGroup) {
      return { selected: [] as ProductGroupDescriptor[], others: overlayGroups };
    }
    const selected = overlayGroups.find((group) => group.id === selectedGroup.id);
    const others = overlayGroups.filter((group) => group.id !== selectedGroup.id);
    return {
      selected: selected ? [selected] : [],
      others,
    };
  }, [overlayGroups, selectedGroup?.id]);

  const sidebarBaseWidth = React.useMemo(() => {
    if (!overlayGroups.length) {
      return getGroupContainerWidth(MIN_VISIBLE_CARDS);
    }
    return Math.max(
      ...overlayGroups.map((group) => getGroupContainerWidth(group.products.length))
    );
  }, [overlayGroups]);

  const sidebarWidth = React.useMemo(
    () => sidebarBaseWidth + SIDEBAR_HORIZONTAL_PADDING * 2 + SIDEBAR_EXTRA_WIDTH,
    [sidebarBaseWidth]
  );

  const renderSectionHeader = (title: string, withTopMargin = false) => (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginTop: withTopMargin ? 12 : 4,
        marginBottom: 8,
        padding: '0 6px',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid rgba(255,107,74,0.35)'
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#111827',
          }}
        >
          {title}
        </span>
      </span>
      <span
        style={{
          flex: 1,
          height: 2,
          background: 'linear-gradient(90deg, rgba(255,107,74,0.35) 0%, rgba(15,23,42,0) 70%)',
        }}
      />
    </div>
  );

  React.useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        worldCopyJump: true,
        attributionControl: false,
      }).setView([mapCenter.lat, mapCenter.lng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current);

      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }

    if (!layersRef.current) {
      layersRef.current = L.layerGroup().addTo(mapRef.current);
    }

    layersRef.current.clearLayers();
    markersRef.current.clear();

    mapOrders.forEach((point) => {
      const latLng: [number, number] = [point.lat, point.lng];
      const isSelected = selectedOrderRef.current?.id === point.id;

      const circle = L.circle(latLng, {
        radius: point.radiusMeters,
        color: '#FF6B4A',
        weight: 1.5,
        fillColor: '#FF6B4A',
        fillOpacity: 0.14,
      });

      const marker = L.marker(latLng, {
        title: point.title,
        icon: isSelected ? selectedMarkerIcon : defaultIcon,
      }).on('click', () => {
        const order = orders.find((o) => o.id === point.id);
        setSelectedOrder(order ?? null);
        setSidebarOpen(true);
      });

      layersRef.current?.addLayer(circle);
      layersRef.current?.addLayer(marker);
      markersRef.current.set(point.id, marker);
    });

    if (mapRef.current && mapOrders.length && !resolvedCenter) {
      const bounds = L.latLngBounds(mapOrders.map((point) => [point.lat, point.lng] as [number, number]));
      mapRef.current.fitBounds(bounds.pad(0.3));
    } else {
      mapRef.current?.setView([mapCenter.lat, mapCenter.lng], 13);
    }

    setTimeout(() => mapRef.current?.invalidateSize(), 150);

    return () => {
      layersRef.current?.clearLayers();
      markersRef.current.clear();
    };
  }, [mapOrders, mapCenter.lat, mapCenter.lng, resolvedCenter?.lat, resolvedCenter?.lng, orders]);

  React.useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.setIcon(id === selectedOrder?.id ? selectedMarkerIcon : defaultIcon);
    });
  }, [selectedOrder?.id]);

  React.useEffect(
    () => () => {
      mapRef.current?.remove();
    },
    []
  );

  const measureMobileHeight = React.useCallback(() => {
    if (!isMobile) return;
    const element = mobileItemRef.current;
    if (!element) return;
    const nextHeight = Math.round(element.getBoundingClientRect().height);
    setMobileContainerHeight((prev) => (prev && Math.abs(prev - nextHeight) < 1 ? prev : nextHeight));
  }, [isMobile]);

  React.useEffect(() => {
    if (!isMobile) return;
    const frame = window.requestAnimationFrame(measureMobileHeight);
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, measureMobileHeight, overlayGroups.length, sidebarOpen, selectedGroup?.id]);

  React.useEffect(() => {
    if (!isMobile) return;
    const handleResize = () => measureMobileHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, measureMobileHeight]);

  const sidebar =
    overlayGroups.length > 0
      ? createPortal(
          <>
            {isMobile ? (
              <div
                id="side-bar"
                style={{
                  position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom: MOBILE_SIDEBAR_BOTTOM_OFFSET,
                  zIndex: 40,
                  transform: sidebarOpen
                    ? 'translateY(0)'
                    : `translateY(calc(100% - ${MOBILE_TOGGLE_HEIGHT}px))`,
                  transition: 'transform 300ms ease-out',
                  pointerEvents: 'auto',
                  background: 'transparent',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  aria-label={sidebarOpen ? 'Fermer la sidebar' : 'Ouvrir la sidebar'}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 58,
                    height: MOBILE_TOGGLE_HEIGHT,
                    background: 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)',
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 10px 24px rgba(15,23,42,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 45,
                    padding: 0,
                    pointerEvents: 'auto',
                  }}
                >
                  <img
                    src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 18 15 12 9 6'/></svg>"
                    alt=""
                    style={{
                      width: 14,
                      height: 14,
                      transform: sidebarOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                      transition: 'transform 300ms ease',
                    }}
                  />
                </button>

                <div
                  className="map-sidebar"
                  style={{
                    marginTop: MOBILE_TOGGLE_HEIGHT,
                    padding: `${SIDEBAR_HORIZONTAL_PADDING}px`,
                    background: '#FFFFFF',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                    border: '1px solid rgba(229,231,235,0.9)',
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#C6B8A8 #FFFFFF',
                    height: mobileContainerHeight ? `${mobileContainerHeight}px` : undefined,
                    maxHeight: `calc(100vh - ${MOBILE_SIDEBAR_TOP_OFFSET + MOBILE_SIDEBAR_BOTTOM_OFFSET + MOBILE_TOGGLE_HEIGHT}px)`,
                    pointerEvents: sidebarOpen ? 'auto' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <style>
                    {`
                      .map-sidebar::-webkit-scrollbar {
                        width: 10px;
                      }
                      .map-sidebar::-webkit-scrollbar-track {
                        background: #FFFFFF;
                        border-radius: 0;
                      }
                      .map-sidebar::-webkit-scrollbar-thumb {
                        background-color: #C6B8A8;
                        border-radius: 0;
                        border: 0;
                      }
                      .map-sidebar::-webkit-scrollbar-thumb:hover {
                        background-color: #B7A391;
                      }
                    `}
                  </style>
                  {(() => {
                    const hasSelected = groupedOverlay.selected.length > 0;
                    const firstSectionTitle = hasSelected ? 'Votre sélection' : 'Autres produits disponibles';
                    const firstSectionGroups = hasSelected ? groupedOverlay.selected : groupedOverlay.others;
                    const secondSectionGroups = hasSelected ? groupedOverlay.others : [];

                    const renderMobileGroup = (group: ProductGroupDescriptor, ref?: React.Ref<HTMLDivElement>) => (
                      <div
                        key={group.id}
                        ref={ref ?? null}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <ProductGroupContainer
                          group={group}
                          canSave={canSave}
                          deckIds={deckIds}
                          supabaseClient={supabaseClient}
                          onSave={onAddToDeck}
                          onRemoveFromDeck={onRemoveFromDeck}
                          onToggleSelection={toggleSelection}
                          onCreateOrder={undefined}
                          onOpenProduct={(productId, context) => onOpenProduct?.(productId, context)}
                          onOpenOrder={onOpenOrder}
                          onOpenProducer={onOpenProducer}
                          onOpenSharer={onOpenSharer}
                          onSelectProducerCategory={() => {}}
                          selected={group.id === selectedGroup?.id}
                        />
                      </div>
                    );

                    const renderMobileSection = (
                      title: string,
                      groups: ProductGroupDescriptor[],
                      attachRef: boolean,
                      withTopMargin: boolean
                    ) => {
                      if (!groups.length) return null;
                      const [first, ...rest] = groups;
                      return (
                        <div
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div
                            ref={attachRef ? mobileItemRef : null}
                            style={{
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            {renderSectionHeader(title, withTopMargin)}
                            {renderMobileGroup(first)}
                          </div>
                          {rest.map((group) => renderMobileGroup(group))}
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderMobileSection(firstSectionTitle, firstSectionGroups, true, false)}
                        {hasSelected &&
                          renderMobileSection('Autres produits disponibles', secondSectionGroups, false, true)}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div
                id="side-bar"
                className="map-sidebar"
                style={{
                  position: 'fixed',
                  top: DESKTOP_SIDEBAR_TOP_OFFSET,
                  bottom: DESKTOP_SIDEBAR_BOTTOM_OFFSET,
                  left: sidebarOpen ? 0 : -sidebarWidth,
                  width: sidebarWidth,
                  height: `calc(100vh - ${DESKTOP_SIDEBAR_TOP_OFFSET + DESKTOP_SIDEBAR_BOTTOM_OFFSET}px)`,
                  background: '#FFFFFF',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                  borderRadius: 0,
                  overflowX: 'hidden',
                  overflowY: 'auto',
                  padding: 0,
                  zIndex: 40,
                  transition: 'left 300ms ease-out',
                  border: '1px solid rgba(229,231,235,0.9)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#C6B8A8 #FFFFFF',
                  pointerEvents: sidebarOpen ? 'auto' : 'none',
                }}
              >
                <div
                  style={{
                    padding: `${SIDEBAR_HORIZONTAL_PADDING}px`,
                  }}
                >
                  <style>
                    {`
                      .map-sidebar::-webkit-scrollbar {
                        width: 10px;
                      }
                      .map-sidebar::-webkit-scrollbar-track {
                        background: #FFFFFF;
                        border-radius: 0;
                      }
                      .map-sidebar::-webkit-scrollbar-thumb {
                        background-color: #C6B8A8;
                        border-radius: 0;
                        border: 0;
                      }
                      .map-sidebar::-webkit-scrollbar-thumb:hover {
                        background-color: #B7A391;
                      }
                    `}
                  </style>
                  {groupedOverlay.selected.length > 0 && (
                    <>
                      {renderSectionHeader('Votre sélection')}
                      {groupedOverlay.selected.map((group) => (
                        <div key={group.id} style={{ marginBottom: 12 }}>
                          <ProductGroupContainer
                            group={group}
                            canSave={canSave}
                            deckIds={deckIds}
                            supabaseClient={supabaseClient}
                            onSave={onAddToDeck}
                            onRemoveFromDeck={onRemoveFromDeck}
                            onToggleSelection={toggleSelection}
                            onCreateOrder={undefined}
                            onOpenProduct={(productId, context) => onOpenProduct?.(productId, context)}
                            onOpenOrder={onOpenOrder}
                            onOpenProducer={onOpenProducer}
                            onOpenSharer={onOpenSharer}
                            onSelectProducerCategory={() => {}}
                            selected={group.id === selectedGroup?.id}
                          />
                        </div>
                      ))}
                    </>
                  )}
                  {groupedOverlay.others.length > 0 && (
                    <>
                      {renderSectionHeader(
                        'Autres produits disponibles',
                        groupedOverlay.selected.length > 0
                      )}
                      {groupedOverlay.others.map((group) => (
                        <div key={group.id} style={{ marginBottom: 12 }}>
                          <ProductGroupContainer
                            group={group}
                            canSave={canSave}
                            deckIds={deckIds}
                            supabaseClient={supabaseClient}
                            onSave={onAddToDeck}
                            onRemoveFromDeck={onRemoveFromDeck}
                            onToggleSelection={toggleSelection}
                            onCreateOrder={undefined}
                            onOpenProduct={(productId, context) => onOpenProduct?.(productId, context)}
                            onOpenOrder={onOpenOrder}
                            onOpenProducer={onOpenProducer}
                            onOpenSharer={onOpenSharer}
                            onSelectProducerCategory={() => {}}
                            selected={group.id === selectedGroup?.id}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
            {isMobile ? null : (
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? 'Fermer la sidebar' : 'Ouvrir la sidebar'}
                style={{
                  position: 'fixed',
                  left: sidebarOpen ? sidebarWidth : 0,
                  top: '46.5%',
                  width: 24,
                  height: 58,
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)',
                  borderTopRightRadius: 18,
                  borderBottomRightRadius: 18,
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 10px 24px rgba(15,23,42,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 45,
                  padding: 0,
                  transition: 'left 300ms ease-out',
                }}
              >
                <img
                  src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 18 15 12 9 6'/></svg>"
                  alt=""
                  style={{
                    width: 14,
                    height: 14,
                    transform: sidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 300ms ease',
                  }}
                />
              </button>
            )}
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div
        style={{
          position: 'relative',
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
          height: '100vh',
          minHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        <div
          ref={mapContainerRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
          }}
        />
      </div>
      {sidebar}
    </>
  );
}
