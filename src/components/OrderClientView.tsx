import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  ShieldCheck,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { User, Product } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProductResultCard } from './ProductsLanding';
import { Avatar } from './Avatar';
import { CARD_WIDTH, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../constants/cards';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import './OrderClientView.css';
import { eurosToCents, formatEurosFromCents } from '../lib/money';
import { getOrderStatusLabel, getOrderStatusProgress } from '../lib/orderStatus';
import {
  addItem,
  approveParticipation,
  createPaymentStub,
  getOrderFullByCode,
  rejectParticipation,
  requestParticipation,
  setParticipantPickupSlot,
  updateParticipantsVisibility,
  updateOrderParticipantSettings,
  updateOrderStatus,
  updateOrderVisibility,
} from '../services/orders';
import { centsToEuros, type OrderFull, type OrderStatus } from '../types/orders';

interface OrderClientViewProps {
  onClose: () => void;
  currentUser?: User | null;
  onOpenParticipantProfile?: (participantName: string) => void;
  onStartPayment?: (payload: { quantities: Record<string, number>; total: number; weight: number }) => void;
  supabaseClient?: SupabaseClient | null;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

function labelForDay(day?: string | null) {
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

type PickupSlot = {
  day?: string | null;
  date?: string | null;
  label?: string | null;
  start?: string | null;
  end?: string | null;
};

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

function formatPickupSlotTime(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : trimmed;
}

function getProductWeightKg(product: { weightKg?: number; unit?: string; measurement?: 'unit' | 'kg' }) {
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

const DEFAULT_PROFILE_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="80" fill="#E5E7EB" />
      <circle cx="80" cy="64" r="30" fill="#9CA3AF" />
      <ellipse cx="80" cy="118" rx="42" ry="32" fill="#6B7280" />
    </svg>`
  );

const resolveOrderEffectiveWeightKg = (
  orderedWeightKg: number,
  minWeightKg: number,
  maxWeightKg: number | null
) => {
  const current = Math.max(0, orderedWeightKg ?? 0);
  const min = Math.max(0, minWeightKg ?? 0);
  if (typeof maxWeightKg === 'number' && maxWeightKg > 0) {
    return Math.min(Math.max(current, min), maxWeightKg);
  }
  return Math.max(current, min);
};

const ORDER_DELIVERY_OPTION_LABELS = {
  chronofresh: 'Chronofresh',
  producer_delivery: 'Livraison producteur',
  producer_pickup: 'Retrait par le partageur',
} as const;

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
  totalWeight: number;
  totalAmount: number;
  pickupCode: string | null;
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

const emptyOrder: OrderFull['order'] = {
  id: '',
  orderCode: '',
  createdBy: '',
  sharerProfileId: '',
  producerProfileId: '',
  title: '',
  visibility: 'public',
  status: 'open',
  deadline: null,
  message: null,
  autoApproveParticipationRequests: false,
  allowSharerMessages: true,
  autoApprovePickupSlots: false,
  minWeightKg: 0,
  maxWeightKg: null,
  orderedWeightKg: 0,
  deliveryOption: 'producer_pickup',
  deliveryStreet: null,
  deliveryInfo: null,
  deliveryCity: null,
  deliveryPostcode: null,
  deliveryAddress: null,
  deliveryLat: null,
  deliveryLng: null,
  estimatedDeliveryDate: null,
  pickupStreet: null,
  pickupInfo: null,
  pickupCity: null,
  pickupPostcode: null,
  pickupAddress: null,
  pickupLat: null,
  pickupLng: null,
  usePickupDate: false,
  pickupDate: null,
  pickupWindowWeeks: null,
  pickupDeliveryFeeCents: 0,
  sharerPercentage: 0,
  shareMode: 'products',
  sharerQuantities: {},
  currency: 'EUR',
  baseTotalCents: 0,
  deliveryFeeCents: 0,
  participantTotalCents: 0,
  sharerShareCents: 0,
  effectiveWeightKg: 0,
  participantsVisibility: defaultParticipantVisibility,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const emptyOrderFull: OrderFull = {
  order: emptyOrder,
  productsOffered: [],
  pickupSlots: [],
  participants: [],
  items: [],
  payments: [],
  profiles: {},
};

export function OrderClientView({
  onClose,
  currentUser,
  onOpenParticipantProfile,
  onStartPayment,
  supabaseClient,
}: OrderClientViewProps) {
  const navigate = useNavigate();
  const { orderCode } = useParams<{ orderCode: string }>();
  const [orderFull, setOrderFull] = React.useState<OrderFull | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isWorking, setIsWorking] = React.useState(false);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [participantsVisibility, setParticipantsVisibility] = React.useState<ParticipantVisibility>(
    defaultParticipantVisibility
  );
  const [participantsPanelOpen, setParticipantsPanelOpen] = React.useState(false);
  const participantsPanelRef = React.useRef<HTMLDivElement | null>(null);
  const participantsButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const isAuthenticated = Boolean(currentUser);

  const loadOrder = React.useCallback(async () => {
    if (!orderCode) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getOrderFullByCode(orderCode);
      setOrderFull(data);
      const next: Record<string, number> = {};
      data.productsOffered.forEach((entry) => {
        const key = entry.product?.code ?? entry.productId;
        if (!key) return;
        next[key] = Math.max(0, Number(next[key]) || 0);
      });
      setQuantities(next);
      setParticipantsVisibility(data.order.participantsVisibility);
      setParticipantsPanelOpen(false);
    } catch (error) {
      console.error('Order load error:', error);
      setLoadError('Impossible de charger la commande.');
    } finally {
      setIsLoading(false);
    }
  }, [orderCode]);

  React.useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const orderFullValue = orderFull ?? emptyOrderFull;
  const order = orderFullValue.order;
  const products = orderFullValue.productsOffered.map((entry) => {
    const info = entry.product;
    const productKey = info?.code ?? entry.productId;
    const measurement: Product['measurement'] =
      info?.measurement ?? (entry.unitLabel === 'kg' ? 'kg' : 'unit');
    const unitLabel = entry.unitLabel ?? info?.packaging ?? '';
    const unitWeightKg = entry.unitWeightKg ?? info?.unitWeightKg ?? null;
    const unitBasePriceCents =
      Number.isFinite(entry.unitBasePriceCents ?? NaN) ? entry.unitBasePriceCents : entry.unitFinalPriceCents;
    return {
      id: productKey,
      productCode: info?.code ?? productKey,
      dbId: entry.productId,
      name: info?.name ?? 'Produit',
      description: info?.description ?? '',
      price: centsToEuros(unitBasePriceCents),
      unit: unitLabel,
      quantity: 0,
      category: '',
      imageUrl: info?.imageUrl ?? '',
      producerId: info?.producerProfileId ?? '',
      producerName: info?.producerName ?? 'Producteur',
      producerLocation: info?.producerLocation ?? '',
      inStock: true,
      measurement,
      weightKg: unitWeightKg ?? undefined,
    };
  });

const profiles = orderFullValue.profiles ?? {};

const sharerProfileId = order.sharerProfileId;
const sharerProfileMeta = sharerProfileId ? profiles[sharerProfileId] : undefined;

const sharerParticipant = orderFullValue.participants.find((p) => p.role === 'sharer');

const sharerName =
  sharerProfileMeta?.name ??
  sharerParticipant?.profileName ??
  'Partageur';

const sharerProfileHandle =
  sharerProfileMeta?.handle ??
  sharerParticipant?.profileHandle ??
  null;

const sharerAvatarPath =
  sharerProfileMeta?.avatarPath ??
  sharerParticipant?.avatarPath ??
  null;

const sharerAvatarUpdatedAt =
  sharerProfileMeta?.avatarUpdatedAt ??
  sharerParticipant?.avatarUpdatedAt ??
  null;


  const isOwner = Boolean(
    currentUser &&
      (currentUser.id === order.sharerProfileId || currentUser.id === order.createdBy)
  );
  const isProducer = Boolean(
    currentUser &&
      (currentUser.id === order.producerProfileId ||
        currentUser.producerId === order.producerProfileId)
  );
  const canShowPickupCodes = isOwner || isProducer;
  const myParticipant = currentUser
    ? orderFullValue.participants.find((participant) => participant.profileId === currentUser.id)
    : undefined;
  const producerProfileMeta =
    order.producerProfileId && order.producerProfileId !== ''
      ? profiles[order.producerProfileId]
      : undefined;
  const producerName =
    producerProfileMeta?.name ??
    orderFullValue.productsOffered[0]?.product?.producerName ??
    'Producteur';
  const buildProfileHandle = (value?: string | null) =>
    value ? value.toLowerCase().replace(/\s+/g, '') : '';
  const handleAvatarNavigation = (handle?: string | null, fallbackName?: string | null) => {
    const fallback = buildProfileHandle(fallbackName);
    const target = (handle ?? '').trim() || fallback;
    if (!target) return;
    navigate(`/profil/${encodeURIComponent(target)}`);
  };
  const producerProfileHandle = producerProfileMeta?.handle ?? null;
  const producerAvatarPath = producerProfileMeta?.avatarPath ?? null;
  const producerAvatarUpdatedAt = producerProfileMeta?.avatarUpdatedAt ?? null;
  const updateOrderLocal = (updates: Partial<typeof order>) => {
    setOrderFull((prev) => (prev ? { ...prev, order: { ...prev.order, ...updates } } : prev));
  };

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

  const autoApproveParticipationRequests = Boolean(order.autoApproveParticipationRequests);
  const allowSharerMessages = order.allowSharerMessages ?? true;
  const autoApprovePickupSlots = Boolean(order.autoApprovePickupSlots);

  const shouldShowParticipationRequestButton =
    !isOwner && !myParticipant && !autoApproveParticipationRequests;

  const orderEffectiveWeightKg = React.useMemo(
    () => resolveOrderEffectiveWeightKg(order.orderedWeightKg ?? 0, order.minWeightKg, order.maxWeightKg),
    [order.maxWeightKg, order.minWeightKg, order.orderedWeightKg]
  );
  const unitPriceCentsById = React.useMemo(() => {
    const deliveryFeeCents = Number.isFinite(order.deliveryFeeCents ?? NaN) ? order.deliveryFeeCents : 0;
    const feePerKg = orderEffectiveWeightKg > 0 ? deliveryFeeCents / orderEffectiveWeightKg : 0;
    const shareFraction =
      order.sharerPercentage > 0 && order.sharerPercentage < 100
        ? order.sharerPercentage / (100 - order.sharerPercentage)
        : 0;
    return products.reduce((acc, product) => {
      const unitWeightKg = getProductWeightKg(product);
      const basePriceCents = eurosToCents(product.price);
      const unitDeliveryCents = Math.round(feePerKg * unitWeightKg);
      const basePlusDelivery = basePriceCents + unitDeliveryCents;
      const unitSharerFeeCents = Math.round(basePlusDelivery * shareFraction);
      acc[product.id] = basePlusDelivery + unitSharerFeeCents;
      return acc;
    }, {} as Record<string, number>);
  }, [order.deliveryFeeCents, order.sharerPercentage, orderEffectiveWeightKg, products]);
  const unitPriceLabelsById = React.useMemo(() => {
    return products.reduce((acc, product) => {
      const unitPriceCents = unitPriceCentsById[product.id];
      if (Number.isFinite(unitPriceCents ?? NaN)) {
        acc[product.id] = formatEurosFromCents(unitPriceCents);
      }
      return acc;
    }, {} as Record<string, string>);
  }, [products, unitPriceCentsById]);
  const totalPriceCents = React.useMemo(
    () =>
      products.reduce((sum, product) => {
        const qty = quantities[product.id] ?? 0;
        const unitPriceCents = unitPriceCentsById[product.id] ?? eurosToCents(product.price);
        return sum + unitPriceCents * qty;
      }, 0),
    [products, quantities, unitPriceCentsById]
  );
  const totalPrice = centsToEuros(totalPriceCents);

  const alreadyOrderedWeight = order.orderedWeightKg ?? 0;

  const selectedWeight = React.useMemo(
    () =>
      products.reduce((sum, product) => {
        const qty = quantities[product.id] ?? 0;
        const weightPerUnit = getProductWeightKg(product);
        return sum + weightPerUnit * qty;
      }, 0),
    [products, quantities]
  );

  const totalWeightTowardsGoal = alreadyOrderedWeight + selectedWeight;
  const basePercent = order.minWeightKg > 0 ? (alreadyOrderedWeight / order.minWeightKg) * 100 : 0;
  const selectionPercent = order.minWeightKg > 0 ? (selectedWeight / order.minWeightKg) * 100 : 0;
  const progressPercent = basePercent + selectionPercent;
  const cappedBase = Math.min(basePercent, 100);
  const cappedSelection = Math.max(Math.min(basePercent + selectionPercent, 100) - cappedBase, 0);
  const extraPercent = Math.max(0, progressPercent - 100);
  const remainingWeight = Math.max(order.minWeightKg - totalWeightTowardsGoal, 0);
  const isMinimumReached = order.minWeightKg <= 0 || alreadyOrderedWeight >= order.minWeightKg;
  const participantTotalsCents = React.useMemo(
    () =>
      orderFullValue.participants.reduce(
        (sum, participant) => (participant.role === 'participant' ? sum + participant.totalAmountCents : sum),
        0
      ),
    [orderFullValue.participants]
  );
  const participantWeightKg = React.useMemo(
    () =>
      orderFullValue.participants.reduce(
        (sum, participant) => (participant.role === 'participant' ? sum + participant.totalWeightKg : sum),
        0
      ),
    [orderFullValue.participants]
  );
  const sharerProductsCents = sharerParticipant?.totalAmountCents ?? 0;
  const sharerPercentage = Math.max(order.sharerPercentage ?? 0, 0);
  const sharerShareCents = Math.max(0, Math.round(participantTotalsCents * (sharerPercentage / 100)));
  const sharerDeficitCents = Math.max(0, sharerProductsCents - sharerShareCents);
  const sharerGainCents = Math.max(0, sharerShareCents - sharerProductsCents);
  const sharerWeightKg = sharerParticipant?.totalWeightKg ?? 0;
  const maxWeightKg = typeof order.maxWeightKg === 'number' ? order.maxWeightKg : null;
  const estimatedParticipantValuePerKg =
    participantWeightKg > 0 ? participantTotalsCents / participantWeightKg : 0;
  const maxParticipantWeightKg =
    maxWeightKg !== null ? Math.max(maxWeightKg - sharerWeightKg, participantWeightKg, 0) : participantWeightKg;
  const maxParticipantTotalsCents = Math.round(maxParticipantWeightKg * estimatedParticipantValuePerKg);
  const maxSharerShareCents = Math.round(maxParticipantTotalsCents * (sharerPercentage / 100));
  const canReachFullCoverage =
    sharerDeficitCents > 0 && maxWeightKg !== null && maxSharerShareCents >= sharerProductsCents;

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
    setIsWorking(true);
    updateOrderVisibility(order.id, next)
      .then(() => {
        updateOrderLocal({ visibility: next });
        toast.success(`Commande rendue ${next === 'public' ? 'publique' : 'privee'}`);
        if (next === 'public' && participantsVisibility.profile) {
          const nextVisibility = { ...participantsVisibility, profile: false };
          setParticipantsVisibility(nextVisibility);
          updateOrderLocal({ participantsVisibility: nextVisibility });
          updateParticipantsVisibility(order.id, nextVisibility).catch((error) => {
            console.error('Participants visibility error:', error);
            toast.error('Impossible de mettre a jour la visibilite.');
          });
        }
      })
      .catch((error) => {
        console.error('Visibility update error:', error);
        toast.error('Impossible de changer la visibilite.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAutoApproveParticipationRequests = (value: boolean) => {
    if (!isOwner || value === autoApproveParticipationRequests) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { autoApproveParticipationRequests: value })
      .then(() => {
        updateOrderLocal({ autoApproveParticipationRequests: value });
        toast.success(
          value
            ? 'Les demandes seront validees automatiquement.'
            : 'Les demandes necessitent desormais une validation manuelle.'
        );
      })
      .catch((error) => {
        console.error('Participation settings error:', error);
        toast.error('Impossible de mettre a jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAllowSharerMessages = (value: boolean) => {
    if (!isOwner || value === allowSharerMessages) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { allowSharerMessages: value })
      .then(() => {
        updateOrderLocal({ allowSharerMessages: value });
        toast.success(
          value
            ? 'Les participants potentiels peuvent vous ecrire a nouveau.'
            : 'Les messages des participants potentiels ont ete desactives.'
        );
      })
      .catch((error) => {
        console.error('Sharer messages error:', error);
        toast.error('Impossible de mettre a jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const updateAutoApprovePickupSlots = (value: boolean) => {
    if (!isOwner || value === autoApprovePickupSlots) return;
    setIsWorking(true);
    updateOrderParticipantSettings(order.id, { autoApprovePickupSlots: value })
      .then(() => {
        updateOrderLocal({ autoApprovePickupSlots: value });
        toast.success(
          value
            ? 'Les demandes de rendez-vous seront validees automatiquement.'
            : 'Les demandes de rendez-vous devront etre validees manuellement.'
        );
      })
      .catch((error) => {
        console.error('Pickup slot settings error:', error);
        toast.error('Impossible de mettre a jour ce parametre.');
      })
      .finally(() => setIsWorking(false));
  };

  const handleCloseOrder = () => {
    if (!isOwner || isWorking || order.status === 'locked') return;
    setIsWorking(true);
    updateOrderStatus(order.id, 'locked')
      .then((updatedStatus) => {
        updateOrderLocal({ status: updatedStatus });
        toast.success('Commande cloturee.');
      })
      .catch((error) => {
        console.error('Order status update error:', error);
        toast.error('Impossible de cloturer la commande.');
      })
      .finally(() => setIsWorking(false));
  };

  const handleStatusUpdate = (nextStatus: OrderStatus, successMessage: string) => {
    if (isWorking) return;
    setIsWorking(true);
    updateOrderStatus(order.id, nextStatus)
      .then((updatedStatus) => {
        updateOrderLocal({ status: updatedStatus });
        toast.success(successMessage);
      })
      .catch((error) => {
        console.error('Order status update error:', error);
        toast.error('Impossible de mettre a jour le statut de la commande.');
      })
      .finally(() => setIsWorking(false));
  };

  const statusActions = React.useMemo(() => {
    const actions: Array<{
      id: string;
      label: string;
      nextStatus: OrderStatus;
      successMessage: string;
    }> = [];
    if (isProducer) {
      if (order.status === 'locked') {
        actions.push({
          id: 'producer-confirmed',
          label: 'Confirmer la commande',
          nextStatus: 'confirmed',
          successMessage: 'Commande confirmée.',
        });
      } else if (order.status === 'confirmed') {
        actions.push({
          id: 'producer-preparing',
          label: 'Démarrer la préparation',
          nextStatus: 'preparing',
          successMessage: 'Préparation demarrée.',
        });
      } else if (order.status === 'preparing') {
        actions.push({
          id: 'producer-prepared',
          label: 'Commencer à livrer',
          nextStatus: 'prepared',
          successMessage: 'La commande est désormais en train de se faire livrer.',
        });
      }
    }
    if (isOwner) {
      if (order.status === 'prepared') {
        actions.push({
          id: 'owner-delivered',
          label: 'Commande livrée',
          nextStatus: 'delivered',
          successMessage: 'La commande a bien été réceptionnée.',
        });
      } else if (order.status === 'delivered') {
        actions.push({
          id: 'owner-distributed',
          label: 'Commande distribuée',
          nextStatus: 'distributed',
          successMessage: 'Les participants ont récupéré leur commande.',
        });
      } else if (order.status === 'distributed') {
        actions.push({
          id: 'owner-finished',
          label: 'Terminer la commande',
          nextStatus: 'finished',
          successMessage: 'Commande terminée.',
        });
      }
    }
    return actions;
  }, [isOwner, isProducer, order.status]);

  const handlePurchase = async () => {
    if (totalCards === 0) {
      toast.info('Ajoutez au moins une carte avant de valider.');
      return;
    }
    if (onStartPayment) {
      onStartPayment({
        quantities: { ...quantities },
        total: totalPrice,
        weight: selectedWeight,
      });
      return;
    }
    if (!isAuthenticated || !currentUser) {
      toast.info('Connectez-vous pour participer.');
      return;
    }

    setIsWorking(true);
    try {
      let participant = myParticipant;
      if (!participant) {
        if (!autoApproveParticipationRequests) {
          toast.info('Votre participation doit etre acceptee avant de payer.');
          return;
        }
        const createdParticipant = await requestParticipation(order.orderCode, currentUser.id);
        const enrichedParticipant = {
          ...createdParticipant,
          profileName: currentUser.name ?? null,
          profileHandle: currentUser.handle ?? null,
        };
        participant = enrichedParticipant;
        setOrderFull((prev) => {
          if (!prev) return prev;
          const others = prev.participants.filter((p) => p.profileId !== currentUser.id);
          return { ...prev, participants: [...others, enrichedParticipant] };
        });
      }

      if (!participant) {
        toast.info('Votre participation doit etre acceptee avant de payer.');
        return;
      }

      if (participant.participationStatus !== 'accepted') {
        toast.info('Votre participation doit etre acceptee avant de payer.');
        return;
      }

      for (const product of products) {
        const qty = quantities[product.id] ?? 0;
        if (qty <= 0 || !product.dbId) continue;
        await addItem({
          orderId: order.id,
          participantId: participant.id,
          productId: product.dbId,
          quantityUnits: qty,
        });
      }

      const refreshed = await getOrderFullByCode(order.orderCode);
      setOrderFull(refreshed);
      const refreshedParticipant = refreshed.participants.find((p) => p.id === participant.id);
      if (refreshedParticipant) {
        await createPaymentStub({
          orderId: order.id,
          participantId: refreshedParticipant.id,
          amountCents: refreshedParticipant.totalAmountCents,
        });
      }
      toast.success('Paiement initie (stub).');
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Impossible de finaliser la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRequestParticipation = async () => {
    if (!currentUser) return;
    setIsWorking(true);
    try {
      await requestParticipation(order.orderCode, currentUser.id);
      await loadOrder();
      toast.success('Demande de participation envoyee.');
    } catch (error) {
      console.error('Participation request error:', error);
      toast.error('Impossible de demander la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleApproveParticipant = async (participantId: string) => {
    setIsWorking(true);
    try {
      const updatedParticipant = await approveParticipation(participantId);
      setOrderFull((prev) => {
        if (!prev) return prev;
        const participants = prev.participants.map((participant) =>
          participant.id === updatedParticipant.id ? { ...participant, ...updatedParticipant } : participant
        );
        return { ...prev, participants };
      });
      toast.success('Participation acceptee.');
    } catch (error) {
      console.error('Approve participant error:', error);
      toast.error('Impossible de valider la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRejectParticipant = async (participantId: string) => {
    setIsWorking(true);
    try {
      await rejectParticipation(participantId);
      await loadOrder();
      toast.success('Participation refusee.');
    } catch (error) {
      console.error('Reject participant error:', error);
      toast.error('Impossible de refuser la participation.');
    } finally {
      setIsWorking(false);
    }
  };

  const handlePickupSlotSelect = async (slotId: string) => {
    if (!myParticipant) return;
    setIsWorking(true);
    try {
      await setParticipantPickupSlot({
        orderId: order.id,
        participantId: myParticipant.id,
        pickupSlotId: slotId,
      });
      await loadOrder();
      toast.success('Creneau enregistre.');
    } catch (error) {
      console.error('Pickup slot error:', error);
      toast.error('Impossible de selectionner ce creneau.');
    } finally {
      setIsWorking(false);
    }
  };

  const pickupAddress =
    order.pickupAddress ||
    [order.pickupStreet, [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
    'Lieu précis communiqué aprÃ¨s paiement';

  const deliveryAddress =
    [order.deliveryStreet, [order.deliveryPostcode, order.deliveryCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    order.deliveryAddress ||
    'Adresse non renseignee';
  const deliveryInfo = order.deliveryInfo?.trim() || '';
  const pickupInfo = order.pickupInfo?.trim() || '';
  const deliveryModeLabel = ORDER_DELIVERY_OPTION_LABELS[order.deliveryOption] ?? 'Livraison';

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
  const pickupSlots = React.useMemo(
    () =>
      orderFullValue.pickupSlots.map((slot) => {
        const label = formatPickupSlotLabel({
          day: slot.day,
          date: slot.slotDate,
          label: slot.label,
        });
        const start = formatPickupSlotTime(slot.startTime);
        const end = formatPickupSlotTime(slot.endTime);
        const timeLabel = start || end ? `${start || '??'} - ${end || '??'}` : 'Horaire a definir';
        return {
          id: slot.id,
          label,
          timeLabel,
          enabled: slot.enabled,
        };
      }),
    [orderFullValue.pickupSlots]
  );
  const hasPickupSlots = pickupSlots.length > 0;
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
  const deliveryDetailLines = React.useMemo(() => {
    const lines = [`Adresse de livraison : ${deliveryAddress}`];
    if (deliveryInfo) lines.push(`Infos livraison : ${deliveryInfo}`);
    if (order.deliveryOption === 'producer_pickup') {
      if (pickupAddress) lines.push(`Adresse de retrait : ${pickupAddress}`);
      if (pickupInfo) lines.push(`Infos retrait : ${pickupInfo}`);
      if (pickupWindowLabel) lines.push(`Fenetre de retrait : ${pickupWindowLabel}`);
    } else if (deliveryDateLabel) {
      lines.push(`Livraison estimee : ${deliveryDateLabel}`);
    }
    return lines;
  }, [
    deliveryAddress,
    deliveryInfo,
    deliveryDateLabel,
    order.deliveryOption,
    pickupAddress,
    pickupInfo,
    pickupWindowLabel,
  ]);
  const pickupLine = deliveryDateLabel
    ? `Livraison estimee : ${deliveryDateLabel}`
    : hasPickupSlots
      ? 'Retrait planifie'
      : order.message || 'Voir message de retrait';
  const deadlineDate = order.deadline ?? new Date();
  const now = React.useMemo(() => new Date(), []);
  const daysLeft = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const hasPassedDeadline = deadlineDate.getTime() < now.getTime();
  const statusLabel = getOrderStatusLabel(order.status);
  const statusTone =
    order.status === 'finished'
      ? 'success'
      : order.status === 'cancelled' || order.status === 'locked'
        ? 'danger'
        : order.status === 'open'
          ? 'info'
          : order.status === 'draft'
            ? 'muted'
            : 'warning';
  const statusColor =
    statusTone === 'success'
      ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
      : statusTone === 'danger'
        ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
        : statusTone === 'warning'
          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
          : statusTone === 'muted'
            ? 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]'
            : 'bg-[#E0F2FE] text-[#075985] border-[#BAE6FD]';
  const statusProgress = getOrderStatusProgress(order.status);
  const canViewStatusProgress =
    order.status !== 'open' &&
    (isProducer || isOwner || Boolean(myParticipant?.participationStatus === 'accepted'));
  const showStatusProgress = canViewStatusProgress && statusProgress !== null;
  const statusProgressPercent = statusProgress ? Math.round(statusProgress.ratio * 100) : 0;
  const statusProgressLabel = statusProgress ? `Etape ${statusProgress.step}/${statusProgress.total}` : '';
  const productCodeByDbId = React.useMemo(() => {
    const entries = orderFullValue.productsOffered.map((entry) => [
      entry.productId,
      entry.product?.code ?? entry.productId,
    ] as const);
    return new Map(entries);
  }, [orderFullValue.productsOffered]);
  const participants = React.useMemo(() => {
    return orderFullValue.participants.map((participant) => {
      const quantities: Record<string, number> = {};
      products.forEach((product) => {
        quantities[product.id] = 0;
      });
      const items = orderFullValue.items.filter((item) => item.participantId === participant.id);
      items.forEach((item) => {
        const code = productCodeByDbId.get(item.productId);
        if (!code) return;
        quantities[code] = (quantities[code] ?? 0) + item.quantityUnits;
      });
      const displayName =
        participant.role === 'sharer'
          ? `${participant.profileName ?? 'Partageur'} (partageur)`
          : participant.profileName ?? 'Participant';
      return {
        id: participant.id,
        name: displayName,
        handle: participant.profileHandle ?? undefined,
        avatarUrl: undefined,
        quantities,
        totalAmount: centsToEuros(participant.totalAmountCents),
        totalWeight: participant.totalWeightKg,
        pickupCode: participant.pickupCode ?? null,
      };
    });
  }, [orderFullValue.items, orderFullValue.participants, productCodeByDbId, products]);
  const participantsWithTotals = participants;
  const pendingParticipants = orderFullValue.participants.filter(
    (participant) => participant.participationStatus === 'requested'
  );
  const ownerVisibility: ParticipantVisibility = React.useMemo(
    () => ({ profile: true, content: true, weight: true, amount: true }),
    []
  );
  const baseParticipantVisibility = React.useMemo(
    () => ({
      profile: order.visibility === 'public' ? false : participantsVisibility.profile,
      content: participantsVisibility.content,
      weight: participantsVisibility.weight,
      amount: participantsVisibility.amount,
    }),
    [order.visibility, participantsVisibility]
  );
  const producerParticipantVisibility = React.useMemo(
    () => ({
      profile: false,
      content: true,
      weight: true,
      amount: participantsVisibility.amount,
    }),
    [participantsVisibility.amount]
  );
  const viewerVisibility = isOwner
    ? ownerVisibility
    : isProducer
      ? producerParticipantVisibility
      : baseParticipantVisibility;
  const isProfileVisibilityLocked = order.visibility === 'public';
  const hasVisibleColumns = Object.values(viewerVisibility).some(Boolean);
  const canShowParticipants = isOwner || (isAuthenticated && hasVisibleColumns);
  const shouldShowPickupCodeColumn = canShowPickupCodes;
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
      products.map((product) => {
        const totalUnits = participants.reduce(
          (sum, participant) => sum + (participant.quantities[product.id] ?? 0),
          0
        );
        const totalWeight = totalUnits * getProductWeightKg(product);
        return { productId: product.id, totalUnits, totalWeight, measurement: product.measurement };
      }),
    [products, participants]
  );
  const shouldShowTotals = viewerVisibility.content || viewerVisibility.weight || viewerVisibility.amount;
  const formatUnitsTotal = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(2);

  const handleParticipantClick = (participant: OrderParticipant) => {
    const target = participant.handle || participant.name;
    if (!target) return;
    onOpenParticipantProfile?.(target);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        Chargement de la commande...
      </div>
    );
  }

  if (loadError || !orderFull) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        {loadError ?? 'Commande introuvable.'}
      </div>
    );
  }

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
            <>
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
                {order.visibility === 'public' ? 'Commande publique' : 'Commande privée'}
              </button>
              <button
                type="button"
                onClick={() => updateAutoApproveParticipationRequests(!autoApproveParticipationRequests)}
                className={`order-client-view__visibility-button ${
                  autoApproveParticipationRequests
                    ? 'order-client-view__visibility-button--public'
                    : 'order-client-view__visibility-button--private'
                }`}
                aria-pressed={autoApproveParticipationRequests}
                title="Validation directe ou au cas par cas des demandes de participation"
              >
                <span className="block text-[11px] text-center leading-tight break-words max-w-[220px]">
                  Validation des participants {autoApproveParticipationRequests ? 'automatique' : 'manuelle'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateAllowSharerMessages(!allowSharerMessages)}
                className={`order-client-view__visibility-button ${
                  allowSharerMessages
                    ? 'order-client-view__visibility-button--public'
                    : 'order-client-view__visibility-button--private'
                }`}
                aria-pressed={allowSharerMessages}
                title="Autoriser ou ne pas autoriser les messages entrants des potentiels participants"
              >
                <span className="block text-[11px] text-center leading-tight break-words max-w-[220px]">
                  Messages {allowSharerMessages ? 'acceptés' : 'désactivés'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateAutoApprovePickupSlots(!autoApprovePickupSlots)}
                className={`order-client-view__visibility-button ${
                  autoApprovePickupSlots
                    ? 'order-client-view__visibility-button--public'
                    : 'order-client-view__visibility-button--private'
                }`}
                aria-pressed={autoApprovePickupSlots}
                title="Validation directe ou au cas par cas des demandes de rendez-vous pour la récupération des produits"
              >
                <span className="block text-[11px] text-center leading-tight break-words max-w-[220px]">
                  Validation des rendez-vous {autoApprovePickupSlots ? 'automatique' : 'manuelle'}
                </span>
              </button>
            </>
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
                  <div className="flex flex-col gap-2 text-sm text-[#4B5563] sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAvatarNavigation(sharerProfileHandle, sharerName)}
                        aria-label={`Voir le profil de ${sharerName}`}
                        className="h-10 w-10 rounded-full border border-gray-200 bg-white overflow-hidden p-0 cursor-pointer"
                      >
                        <Avatar
                          supabaseClient={supabaseClient ?? null}
                          path={sharerAvatarPath}
                          updatedAt={sharerAvatarUpdatedAt}
                          fallbackSrc={DEFAULT_PROFILE_AVATAR}
                          alt={sharerName}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAvatarNavigation(producerProfileHandle, producerName)}
                        aria-label={`Voir le profil de ${producerName}`}
                        className="h-10 w-10 rounded-full border border-gray-200 bg-white overflow-hidden p-0 cursor-pointer"
                      >
                        <Avatar
                          supabaseClient={supabaseClient ?? null}
                          path={producerAvatarPath}
                          updatedAt={producerAvatarUpdatedAt}
                          fallbackSrc={DEFAULT_PROFILE_AVATAR}
                          alt={producerName}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    </div>
                    <p className="leading-snug text-[#4B5563]">
                      <span className="font-semibold text-[#1F2937]">{sharerName}</span> se procure des produits
                      chez <span className="font-semibold text-[#1F2937]">{producerName}</span> : participez avec lui
                      à la commande
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                    <Scale className="w-4 h-4 text-[#FF6B4A]" />
                    Capacite
                  </div>
                  <p className="text-[#1F2937] font-semibold text-lg">
                    {order.minWeightKg} kg - {order.maxWeightKg ?? 0} kg
                  </p>
                </div>
                <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                    <CalendarClock className="w-4 h-4 text-[#FF6B4A]" />
                    Date de clôture
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
                  {hasPickupSlots && (
                    <div className="order-client-view__pickup-slots">
                      <div className="order-client-view__pickup-slots-header">
                        <span className="order-client-view__pickup-slots-title">Creneaux disponibles</span>
                        <span className="order-client-view__pickup-slots-count">{pickupSlots.length}</span>
                      </div>
                      <div className="order-client-view__pickup-slots-grid">
                        {pickupSlots.map((slot) => (
                          <div
                            key={slot.id}
                            className={`order-client-view__pickup-slot ${
                              slot.enabled ? '' : 'order-client-view__pickup-slot--disabled'
                            }`}
                          >
                            <div>
                              <p className="order-client-view__pickup-slot-date">{slot.label}</p>
                              <p className="order-client-view__pickup-slot-time">{slot.timeLabel}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-[#6B7280]">{pickupAddress}</p>
                </div>
                {isProducer && (
                  <div className="bg-white/70 border border-gray-100 rounded-2xl p-4 space-y-2 shadow-sm">
                    <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280] tracking-wide">
                      <Globe2 className="w-4 h-4 text-[#FF6B4A]" />
                      Livraison
                    </div>
                    <p className="text-[#1F2937] font-semibold text-lg leading-tight">{deliveryModeLabel}</p>
                    {deliveryDetailLines.map((line, index) => (
                      <p key={`delivery-${index}`} className="text-xs text-[#6B7280]">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
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

          {!isProducer && (
            <div className="order-client-view__products-section space-y-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="h-px bg-gray-100" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#1F2937]">Choisissez vos produits</h3>
                </div>
              </div>

              {products.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-sm text-[#6B7280] shadow-sm">
                  Aucun produit n'est associe a cette commande pour l'instant.
                </div>
              ) : (
                <OrderProductsCarousel
                  products={products}
                  quantities={quantities}
                  onDeltaQuantity={handleQuantityChange}
                  onDirectQuantity={(productId, value) =>
                    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, value) }))
                  }
                  unitPriceLabelsById={unitPriceLabelsById}
                />
              )}
            </div>
          )}
        </div>

        <div className="order-client-view__aside">
          <div className="order-client-view__summary">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FF6B4A]/10 text-[#FF6B4A] border border-[#FF6B4A]/20">
                  <Users className="w-4 h-4" />
                </span>
                <p className="text-lg font-semibold text-[#1F2937] leading-snug">
                  {showStatusProgress
                    ? 'Progression de la commande'
                    : "Progression de la commande"}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#B45309] border border-[#FFDCC4] font-semibold text-sm shadow-sm">
                {showStatusProgress ? `${statusProgressPercent}%` : `${progressPercent.toFixed(0)}%`}
              </span>
            </div>

            {showStatusProgress && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-medium">
                  <span className="text-[#FF6B4A] font-semibold">{statusProgressLabel}</span>
                  <span className="text-[#1F2937] font-semibold">Statut : {statusLabel}</span>
                </div>
                <div className="order-client-view__status-progress-track">
                  <div
                    className="order-client-view__status-progress-fill"
                    style={{ width: `${statusProgressPercent}%` }}
                  />
                </div>
                {statusActions.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {statusActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="order-client-view__purchase-button"
                        onClick={() => handleStatusUpdate(action.nextStatus, action.successMessage)}
                        disabled={isWorking}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-[#6B7280]">
                  Étapes : open - locked - confirmed - preparing - prepared - delivered - distributed - finished
                </p>
              </div>
            )}

            {!showStatusProgress && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] font-medium">
                  <span className="text-[#15803d] font-semibold">Déjà achetés : {alreadyOrderedWeight.toFixed(2)} kg</span>
                  <span className="text-[#d97706] font-semibold">Votre sélection : {selectedWeight.toFixed(2)} kg</span>
                  <span className="text-[#FF6B4A] font-semibold">Objectif : {order.minWeightKg} kg</span>
                </div>
                <div className="order-client-view__progress-track">
                  <div
                    className="order-client-view__progress-fill order-client-view__progress-fill--base"
                    style={baseSegmentStyle}
                  />
                  <div
                    className="order-client-view__progress-fill order-client-view__progress-fill--selection"
                    style={selectionSegmentStyle}
                  />
                </div>
              </div>
            )}

            {!showStatusProgress && extraPercent > 0 && (
              <div className="flex items-start gap-3 text-xs text-[#9A3412] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-3 shadow-sm">
                <span className="inline-flex w-2 h-2 mt-1 rounded-full bg-[#FF6B4A]" />
                <span>Les {extraPercent.toFixed(0)}% au-dessus du minimum requis pour lancer la commande vous permettent d'obtenir des avoirs sur des prochaines commandes.</span>
              </div>
            )}

            {!showStatusProgress && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-[#FFF9F3] border border-[#FFDCC4] rounded-2xl p-3 space-y-1 shadow-sm">
                  <p className="text-xs text-[#B45309] font-semibold">Poids restant</p>
                  <p className="text-xl font-semibold text-[#1F2937]">{remainingWeight.toFixed(2)} kg</p>
                </div>
              </div>
            )}
            {isOwner && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-[#6B7280] font-medium">Part du partageur accumulée :</span>
                  <span className="text-[#1F2937] font-semibold">{formatEurosFromCents(sharerShareCents)}</span>
                </div>
                {sharerProductsCents > sharerShareCents ? (
                  <>
                    <p className="text-xs text-[#9A3412] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-2">
                      Vous allez devoir compléter {formatEurosFromCents(sharerDeficitCents)} pour clôturer la commande
                      et obtenir vos produits car votre part gagnée n&apos;est pas suffisante.
                    </p>
                    {canReachFullCoverage && (
                      <p className="text-xs text-[#92400E] bg-[#FFF7ED] border border-[#FFDCC4] rounded-2xl px-3 py-2">
                        Continuez de partager la commande autour de vous pour obtenir une part suffisante qui vous
                        permettra de vous faire rembourser l&apos;intégralité des produits.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl px-3 py-2">
                    La part du partageur obtenue est supérieure à la valeur de vos produits, ainsi vous allez obtenir
                    vos produits gratuitement ainsi que {formatEurosFromCents(sharerGainCents)} de gain de coopération.
                  </p>
                )}
                <button
                  type="button"
                  className="order-client-view__purchase-button order-client-view__close-button"
                  disabled={!isMinimumReached || isWorking}
                  onClick={handleCloseOrder}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Clôturer
                </button>
                <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`px-2.5 py-1 rounded-full border ${statusColor}`}>Statut de la commande : {statusLabel}</span>
                  </div>
              </div>
            )}
          </div>

            {!isProducer && (
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
            {shouldShowParticipationRequestButton && (
              <button
                type="button"
                onClick={handleRequestParticipation}
                disabled={isWorking}
                className="w-full py-2 rounded-xl border border-[#FF6B4A] text-[#FF6B4A] font-semibold hover:bg-[#FFF1E6] transition-colors disabled:opacity-60"
              >
                Demander a participer
              </button>
            )}
            {!isOwner && myParticipant?.participationStatus === 'requested' && (
              <div className="text-xs text-[#6B7280] bg-[#FFF7ED] border border-[#FFDCC4] rounded-xl px-3 py-2">
                Votre demande est en attente de validation.
              </div>
            )}
            <div className="h-px bg-gray-100" />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handlePurchase}
                disabled={totalCards === 0 || isWorking}
                className="order-client-view__purchase-button"
              >
                <ShoppingCart className="w-4 h-4" />
                Payer
              </button>
            </div>
            </div>
            )}
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
                        const isLocked = isProfileVisibilityLocked && option.key === 'profile';
                        const isActive = isLocked ? false : participantsVisibility[option.key];
                        return (
                          <div key={option.key} className="order-client-view__participants-panel-row">
                            <span className="order-client-view__participants-panel-label">{option.label}</span>
                            <button
                              type="button"
                              className={`order-client-view__participants-panel-toggle ${
                                isActive ? 'order-client-view__participants-panel-toggle--active' : ''
                              }`}
                              aria-pressed={isActive}
                              disabled={isLocked}
                              onClick={() => {
                                if (isLocked) return;
                                const next = { ...participantsVisibility, [option.key]: !isActive };
                                if (isProfileVisibilityLocked) {
                                  next.profile = false;
                                }
                                setParticipantsVisibility(next);
                                setIsWorking(true);
                                updateParticipantsVisibility(order.id, next)
                                  .then(() => updateOrderLocal({ participantsVisibility: next }))
                                  .catch((error) => {
                                    console.error('Participants visibility error:', error);
                                    toast.error('Impossible de mettre a jour la visibilite.');
                                  })
                                  .finally(() => setIsWorking(false));
                              }}
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

            {!canShowPickupCodes && myParticipant && (
              <div className="order-client-view__pickup-code-card">
                {myParticipant.pickupCode ? (
                  <p className="order-client-view__pickup-code-label">
                    Ton code de retrait :
                    <span className="order-client-view__pickup-code">{myParticipant.pickupCode}</span>
                  </p>
                ) : (
                  <p className="order-client-view__pickup-code-label">
                    Ton inscription doit être acceptée pour obtenir un code.
                  </p>
                )}
              </div>
            )}

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
                        products.map((product) => (
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
                      {shouldShowPickupCodeColumn && (
                        <th className="order-client-view__participants-table-number">Code</th>
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
                          products.map((product) => {
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
                        {shouldShowPickupCodeColumn && (
                          <td className="order-client-view__participants-table-number">
                            {participant.pickupCode ?? 'En attente'}
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
                          products.map((product, index) => {
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
                        {shouldShowPickupCodeColumn && (
                          <td className="order-client-view__participants-table-number" />
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {isOwner && pendingParticipants.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#FFDCC4] bg-[#FFF7ED] p-4 text-sm space-y-3">
                <p className="font-semibold text-[#B45309]">Demandes en attente</p>
                {pendingParticipants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between gap-3">
                    <span className="text-[#92400E]">
                      {participant.profileName ?? 'Participant'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full bg-white border border-[#FF6B4A] text-[#FF6B4A] text-xs"
                        onClick={() => handleApproveParticipant(participant.id)}
                        disabled={isWorking}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full bg-white border border-gray-200 text-[#6B7280] text-xs"
                        onClick={() => handleRejectParticipant(participant.id)}
                        disabled={isWorking}
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
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
  unitPriceLabelsById,
}: {
  products: Product[];
  quantities: Record<string, number>;
  onDeltaQuantity: (productId: string, delta: number) => void;
  onDirectQuantity: (productId: string, value: number) => void;
  unitPriceLabelsById: Record<string, string>;
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
                priceLabelOverride={unitPriceLabelsById[product.id]}
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








