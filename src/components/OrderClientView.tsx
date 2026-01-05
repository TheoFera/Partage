import React from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Globe2,
  Info,
  Lock,
  MapPin,
  Scale,
  SlidersHorizontal,
  ShoppingCart,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { GroupOrder } from '../types';
import { ProductResultCard } from './ProductsLanding';
import { CARD_WIDTH, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../constants/cards';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import './OrderClientView.css';
import { eurosToCents, formatEurosFromCents } from '../lib/money';

interface OrderClientViewProps {
  order: GroupOrder;
  onClose: () => void;
  onVisibilityChange?: (visibility: GroupOrder['visibility']) => void;
  onPurchase?: (payload: { quantities: Record<string, number>; total: number; weight: number }) => void;
  initialQuantities?: Record<string, number>;
  isOwner?: boolean;
  onOpenParticipantProfile?: (participantName: string) => void;
  isAuthenticated?: boolean;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

function labelForDay(day?: string) {
  const map: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  };
  if (!day) return '';
  return map[day] ?? day;
}

type PickupSlot = NonNullable<GroupOrder['pickupSlots']>[number];

function formatPickupSlotLabel(slot: PickupSlot) {
  if (slot.date) {
    const date = new Date(slot.date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
    return slot.date;
  }
  return labelForDay(slot.label ?? slot.day);
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

type ParticipantVisibility = {
  profile: boolean;
  content: boolean;
  weight: boolean;
  amount: boolean;
};

type OrderParticipant = {
  id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  quantities: Record<string, number>;
};

const defaultParticipantVisibility: ParticipantVisibility = {
  profile: false,
  content: false,
  weight: false,
  amount: false,
};

const participantVisibilityOptions: Array<{ key: keyof ParticipantVisibility; label: string }> = [
  { key: 'profile', label: 'Profil des participants' },
  { key: 'content', label: 'Contenu de la commande' },
  { key: 'weight', label: 'Poids de la participation' },
  { key: 'amount', label: 'Montant de la participation' },
];

const mockParticipantProfiles: Array<Pick<OrderParticipant, 'id' | 'name' | 'handle' | 'avatarUrl'>> = [
  {
    id: 'p-1',
    name: 'Aline Morel',
    handle: 'alinemorel',
    avatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80',
  },
  {
    id: 'p-2',
    name: 'Theo Bernard',
    handle: 'theobernard',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80',
  },
  {
    id: 'p-3',
    name: 'Camille Leroy',
    handle: 'camilleleroy',
    avatarUrl:
      'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=160&q=80',
  },
  {
    id: 'p-4',
    name: 'Nina Martin',
    handle: 'ninamartin',
    avatarUrl:
      'https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=160&q=80',
  },
  {
    id: 'p-5',
    name: 'Lucas Petit',
    handle: 'lucaspetit',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80',
  },
  {
    id: 'p-6',
    name: 'Sarah Noel',
    handle: 'sarahnoel',
    avatarUrl:
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=160&q=80',
  },
];

const buildMockParticipants = (order: GroupOrder): OrderParticipant[] => {
  const participants: OrderParticipant[] = [];
  const sharerQuantities = order.sharerQuantities ?? {};
  const hasSharerSelection = Object.values(sharerQuantities).some((qty) => qty > 0);

  if (hasSharerSelection) {
    const quantities: Record<string, number> = {};
    order.products.forEach((product) => {
      quantities[product.id] = Math.max(0, Number(sharerQuantities[product.id]) || 0);
    });
    participants.push({
      id: `${order.id}-sharer`,
      name: `${order.sharerName} (partageur)`,
      quantities,
    });
  }

  const baseCount = Math.min(Math.max(order.participants ?? 0, 0), mockParticipantProfiles.length);
  const targetCount = hasSharerSelection ? Math.max(baseCount - 1, 0) : baseCount;

  const mockParticipants = mockParticipantProfiles.slice(0, targetCount).map((participant, index) => {
    const quantities: Record<string, number> = {};
    order.products.forEach((product, productIndex) => {
      const qty = ((index + 1) * (productIndex + 2)) % 3;
      quantities[product.id] = qty;
    });
    if (order.products.length && Object.values(quantities).every((qty) => qty === 0)) {
      quantities[order.products[0].id] = 1;
    }
    return {
      ...participant,
      quantities,
    };
  });

  return [...participants, ...mockParticipants];
};

export function OrderClientView({
  order,
  onClose,
  onVisibilityChange,
  onPurchase,
  initialQuantities,
  isOwner = true,
  onOpenParticipantProfile,
  isAuthenticated = false,
}: OrderClientViewProps) {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [participantsVisibility, setParticipantsVisibility] = React.useState<ParticipantVisibility>(
    defaultParticipantVisibility
  );
  const [participantsPanelOpen, setParticipantsPanelOpen] = React.useState(false);
  const participantsPanelRef = React.useRef<HTMLDivElement | null>(null);
  const participantsButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const next: Record<string, number> = {};
    order.products.forEach((product) => {
      const initial = initialQuantities?.[product.id] ?? 0;
      next[product.id] = Math.max(0, Number(initial) || 0);
    });
    setQuantities(next);
  }, [order.id, order.products, initialQuantities]);

  React.useEffect(() => {
    setParticipantsVisibility(defaultParticipantVisibility);
    setParticipantsPanelOpen(false);
  }, [order.id]);

  React.useEffect(() => {
    if (!participantsPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setParticipantsPanelOpen(false);
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (participantsPanelRef.current?.contains(target)) return;
      if (participantsButtonRef.current?.contains(target)) return;
      setParticipantsPanelOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [participantsPanelOpen]);

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

  const estimatedDeliveryDate =
    order.estimatedDeliveryDate instanceof Date
      ? order.estimatedDeliveryDate
      : order.estimatedDeliveryDate
        ? new Date(order.estimatedDeliveryDate)
        : null;
  const deliveryDateLabel =
    estimatedDeliveryDate && !Number.isNaN(estimatedDeliveryDate.getTime())
      ? estimatedDeliveryDate.toLocaleDateString('fr-FR')
      : null;
  const pickupSlotsLabel = order.pickupSlots?.length
    ? order.pickupSlots
        .map((slot) => {
          const label = formatPickupSlotLabel(slot);
          const start = slot.start?.trim();
          const end = slot.end?.trim();
          if (start || end) {
            return `${label} ${start || '??'}-${end || '??'}`.trim();
          }
          return label;
        })
        .join(' / ')
    : null;
  const pickupWindowWeeks =
    typeof order.pickupWindowWeeks === 'number' && order.pickupWindowWeeks > 0
      ? order.pickupWindowWeeks
      : null;
  const pickupWindowEndDate =
    estimatedDeliveryDate && pickupWindowWeeks
      ? (() => {
          const end = new Date(
            estimatedDeliveryDate.getFullYear(),
            estimatedDeliveryDate.getMonth(),
            estimatedDeliveryDate.getDate()
          );
          end.setDate(end.getDate() + pickupWindowWeeks * 7);
          return end;
        })()
      : null;
  const pickupDurationLabel = pickupWindowWeeks
    ? `${pickupWindowWeeks} semaine${pickupWindowWeeks > 1 ? 's' : ''}`
    : null;
  const pickupWindowLabel =
    pickupDurationLabel && pickupWindowEndDate
      ? `${pickupDurationLabel} (jusqu'au ${pickupWindowEndDate.toLocaleDateString('fr-FR')})`
      : pickupDurationLabel;
  const pickupLine = deliveryDateLabel
    ? `Livraison estimee : ${deliveryDateLabel}`
    : pickupSlotsLabel
      ? 'Retrait planifie'
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
  const participants = React.useMemo(
    () => buildMockParticipants(order),
    [order.id, order.participants, order.products]
  );
  const participantsWithTotals = React.useMemo(
    () =>
      participants.map((participant) => {
        const totals = order.products.reduce(
          (acc, product) => {
            const qty = participant.quantities[product.id] ?? 0;
            return {
              amount: acc.amount + product.price * qty,
              weight: acc.weight + getProductWeightKg(product) * qty,
            };
          },
          { amount: 0, weight: 0 }
        );
        return {
          ...participant,
          totalAmount: totals.amount,
          totalWeight: totals.weight,
        };
      }),
    [order.products, participants]
  );
  const ownerVisibility: ParticipantVisibility = React.useMemo(
    () => ({ profile: true, content: true, weight: true, amount: true }),
    []
  );
  const viewerVisibility = isOwner ? ownerVisibility : participantsVisibility;
  const hasVisibleColumns = Object.values(viewerVisibility).some(Boolean);
  const canShowParticipants = isOwner || (isAuthenticated && hasVisibleColumns);
  const participantsCountLabel = participantsWithTotals.length
    ? `${participantsWithTotals.length} participant${participantsWithTotals.length > 1 ? 's' : ''}`
    : 'Aucun participant pour le moment';
  const totalWeightAll = React.useMemo(
    () => participantsWithTotals.reduce((sum, participant) => sum + participant.totalWeight, 0),
    [participantsWithTotals]
  );
  const totalAmountAll = React.useMemo(
    () => participantsWithTotals.reduce((sum, participant) => sum + participant.totalAmount, 0),
    [participantsWithTotals]
  );
  const productTotals = React.useMemo(
    () =>
      order.products.map((product) => {
        const totalUnits = participants.reduce(
          (sum, participant) => sum + (participant.quantities[product.id] ?? 0),
          0
        );
        const totalWeight = totalUnits * getProductWeightKg(product);
        return { productId: product.id, totalUnits, totalWeight, measurement: product.measurement };
      }),
    [order.products, participants]
  );
  const shouldShowTotals = viewerVisibility.content || viewerVisibility.weight || viewerVisibility.amount;
  const formatUnitsTotal = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(2);

  const handleParticipantClick = (participant: OrderParticipant) => {
    const target = participant.handle || participant.name;
    if (!target) return;
    onOpenParticipantProfile?.(target);
  };

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

      <div className="order-client-view__layout">
        <div className="order-client-view__main">
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
                  {pickupWindowLabel && (
                    <p className="text-xs text-[#6B7280]">Duree de recuperation : {pickupWindowLabel}</p>
                  )}
                  {pickupSlotsLabel && (
                    <p className="text-xs text-[#6B7280]">Jours possibles : {pickupSlotsLabel}</p>
                  )}
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

        <div className="order-client-view__aside">
          <div className="order-client-view__summary">
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
                Payer
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="order-client-view__participants">
            <div className="order-client-view__participants-header">
              <div>
                <p className="order-client-view__participants-title">Participants a la commande</p>
                <p className="order-client-view__participants-subtitle">{participantsCountLabel}</p>
              </div>
              {isOwner && (
                <div className="order-client-view__participants-controls">
                  <button
                    type="button"
                    ref={participantsButtonRef}
                    onClick={() => setParticipantsPanelOpen((prev) => !prev)}
                    className="order-client-view__participants-visibility-button"
                    aria-expanded={participantsPanelOpen}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    Visibilité des differentes colonnes du tableau pour les participants
                  </button>
                  {participantsPanelOpen && (
                    <div ref={participantsPanelRef} className="order-client-view__participants-panel">
                      {participantVisibilityOptions.map((option) => {
                        const isActive = participantsVisibility[option.key];
                        return (
                          <div key={option.key} className="order-client-view__participants-panel-row">
                            <span className="order-client-view__participants-panel-label">{option.label}</span>
                            <button
                              type="button"
                              className={`order-client-view__participants-panel-toggle ${
                                isActive ? 'order-client-view__participants-panel-toggle--active' : ''
                              }`}
                              aria-pressed={isActive}
                              onClick={() =>
                                setParticipantsVisibility((prev) => ({
                                  ...prev,
                                  [option.key]: !prev[option.key],
                                }))
                              }
                            >
                              {isActive ? 'Visible' : 'Masquée'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!canShowParticipants ? (
              <div className="order-client-view__participants-masked">
                {!isOwner && !isAuthenticated
                  ? 'Connectez-vous pour voir la liste des participants'
                  : 'Liste des participants masquee par le createur de la commande'}
              </div>
            ) : participantsWithTotals.length === 0 ? (
              <div className="order-client-view__participants-empty">Aucun participant pour le moment</div>
            ) : (
              <div className="order-client-view__participants-table-wrapper">
                <table className="order-client-view__participants-table">
                  <thead>
                    <tr>
                      {viewerVisibility.profile && <th>Participant</th>}
                      {viewerVisibility.content &&
                        order.products.map((product) => (
                          <th key={product.id} style={{ minWidth: 120 }}>
                            <span className="order-client-view__participants-table-product">{product.name}</span>
                            {product.unit && (
                              <span className="order-client-view__participants-table-unit">{product.unit}</span>
                            )}
                          </th>
                        ))}
                      {viewerVisibility.weight && <th className="order-client-view__participants-table-number">Poids</th>}
                      {viewerVisibility.amount && (
                        <th className="order-client-view__participants-table-number">Montant</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {participantsWithTotals.map((participant) => (
                      <tr key={participant.id}>
                        {viewerVisibility.profile && (
                          <td>
                            <div className="order-client-view__participant-cell">
                              <button
                                type="button"
                                className="order-client-view__participant-avatar"
                                onClick={() => handleParticipantClick(participant)}
                                aria-label={`Voir le profil de ${participant.name}`}
                              >
                                {participant.avatarUrl ? (
                                  <ImageWithFallback
                                    src={participant.avatarUrl}
                                    alt={participant.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                ) : (
                                  <span className="order-client-view__participant-initials">
                                    {participant.name.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="order-client-view__participant-name"
                                onClick={() => handleParticipantClick(participant)}
                              >
                                {participant.name}
                              </button>
                            </div>
                          </td>
                        )}
                        {viewerVisibility.content &&
                          order.products.map((product) => {
                            const qty = participant.quantities[product.id] ?? 0;
                            return (
                              <td
                                key={product.id}
                                className={`order-client-view__participants-table-center ${
                                  qty === 0 ? 'order-client-view__participants-table-muted' : ''
                                }`}
                              >
                                {qty}
                              </td>
                            );
                          })}
                        {viewerVisibility.weight && (
                          <td className="order-client-view__participants-table-number">
                            {participant.totalWeight.toFixed(2)} kg
                          </td>
                        )}
                        {viewerVisibility.amount && (
                          <td className="order-client-view__participants-table-number">
                            {formatPrice(participant.totalAmount)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {shouldShowTotals && (
                    <tfoot>
                      <tr className="order-client-view__participants-total-row">
                        {viewerVisibility.profile && (
                          <td className="order-client-view__participants-total-label">Total</td>
                        )}
                        {viewerVisibility.content &&
                          order.products.map((product, index) => {
                            const totals = productTotals[index];
                            const content =
                              totals.measurement === 'kg'
                                ? `${totals.totalWeight.toFixed(2)} kg`
                                : formatUnitsTotal(totals.totalUnits);
                            return (
                              <td key={product.id} className="order-client-view__participants-table-center">
                                {content}
                              </td>
                            );
                          })}
                        {viewerVisibility.weight && (
                          <td className="order-client-view__participants-table-number">
                            {totalWeightAll.toFixed(2)} kg
                          </td>
                        )}
                        {viewerVisibility.amount && (
                          <td className="order-client-view__participants-table-number">
                            {formatPrice(totalAmountAll)}
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
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
      <div
        className="flex gap-3"
        style={{ alignItems: 'stretch', justifyContent: useCarousel ? 'flex-start' : 'center' }}
      >
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
                  {getProductWeightKg(product).toFixed(2)} kg
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
