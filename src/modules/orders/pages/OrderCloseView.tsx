import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Minus, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Order, OrderFull, OrderParticipant } from '../types';
import {
  addItem,
  createLockClosePackage,
  fetchParticipantInvoices,
  issueSharerInvoiceAfterLock,
  getOrderFullByCode,
  triggerOutgoingEmails,
  updateOrderItemQuantity,
  fetchCoopBalance,
} from '../api/orders';
import { eurosToCents, formatEurosFromCents } from '../../../shared/lib/money';
import './OrderCloseView.css';

const logisticCostByWeight = (weightKg: number) => {
  if (!weightKg || weightKg <= 0) return 0;
  const raw = 7 + 8 * Math.sqrt(weightKg);
  return Math.max(15, 5 * Math.round(raw / 5));
};

const resolveEffectiveWeightKg = (totalWeight: number, minWeight: number, maxWeight: number | null) => {
  if (maxWeight !== null && maxWeight > 0) {
    return Math.min(Math.max(totalWeight, Math.max(minWeight, 0)), maxWeight);
  }
  return Math.max(totalWeight, Math.max(minWeight, 0));
};

type ClosePaymentPayload = {
  orderId: string;
  orderCode: string;
  amountCents: number;
  useCoopBalance: boolean;
  extraQuantities: Record<string, number>;
};

export function OrderCloseView({
  currentUser,
  onStartClosePayment,
}: {
  currentUser: { id: string } | null;
  onStartClosePayment?: (payload: ClosePaymentPayload) => void;
}) {
  const navigate = useNavigate();
  const { orderCode } = useParams<{ orderCode: string }>();
  const [orderFull, setOrderFull] = React.useState<OrderFull | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isWorking, setIsWorking] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [extraQuantities, setExtraQuantities] = React.useState<Record<string, number>>({});
  const [coopBalanceCents, setCoopBalanceCents] = React.useState(0);
  const [useCoopBalance, setUseCoopBalance] = React.useState(true);

  const loadOrder = React.useCallback(async () => {
    if (!orderCode) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getOrderFullByCode(orderCode);
      setOrderFull(data);
      if (currentUser?.id) {
        const balance = await fetchCoopBalance(currentUser.id);
        setCoopBalanceCents(balance);
      }
    } catch (error) {
      console.error('Close view load error:', error);
      setLoadError('Impossible de charger la commande.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, orderCode]);

  React.useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const order = orderFull?.order ?? null;
  const isOwner = Boolean(order && currentUser?.id && order.sharerProfileId === currentUser.id);
  const sharerParticipant = orderFull?.participants.find((participant) => participant.role === 'sharer') ?? null;
  const productsOffered = orderFull?.productsOffered ?? [];
  const items = orderFull?.items ?? [];

  React.useEffect(() => {
    if (!order) return;
    if (order.status !== 'open') {
      navigate(`/cmd/${order.orderCode ?? order.id}`, { replace: true });
    }
  }, [navigate, order]);

  const itemsByParticipant = React.useMemo(() => {
    return items.reduce((acc, item) => {
      if (!acc[item.participantId]) acc[item.participantId] = [];
      acc[item.participantId].push(item);
      return acc;
    }, {} as Record<string, typeof items>);
  }, [items]);

  const productMetaById = React.useMemo(() => {
    const map = new Map<string, { unitBasePriceCents: number; unitWeightKg: number }>();
    productsOffered.forEach((entry) => {
      const unitWeightKg = entry.unitWeightKg ?? entry.product?.unitWeightKg ?? 0;
      const unitBasePriceCents = entry.unitBasePriceCents ?? entry.unitFinalPriceCents ?? 0;
      map.set(entry.productId, {
        unitBasePriceCents,
        unitWeightKg,
      });
    });
    return map;
  }, [productsOffered]);

  const sharerItems = React.useMemo(() => {
    if (!sharerParticipant) return [];
    return items.filter((item) => item.participantId === sharerParticipant.id);
  }, [items, sharerParticipant]);

  const currentSharerQuantities = React.useMemo(() => {
    return sharerItems.reduce((acc, item) => {
      acc[item.productId] = (acc[item.productId] ?? 0) + item.quantityUnits;
      return acc;
    }, {} as Record<string, number>);
  }, [sharerItems]);

  const mergedSharerQuantities = React.useMemo(() => {
    return productsOffered.reduce((acc, entry) => {
      const baseQty = currentSharerQuantities[entry.productId] ?? 0;
      const extra = extraQuantities[entry.productId] ?? 0;
      acc[entry.productId] = baseQty + Math.max(0, extra);
      return acc;
    }, {} as Record<string, number>);
  }, [currentSharerQuantities, extraQuantities, productsOffered]);

  const totalWeightKg = React.useMemo(() => {
    const otherItemsWeight = items.reduce((sum, item) => {
      const unitWeight = item.unitWeightKg ?? productMetaById.get(item.productId)?.unitWeightKg ?? 0;
      const baseQty = item.quantityUnits;
      const isSharerItem = sharerParticipant && item.participantId === sharerParticipant.id;
      if (isSharerItem) {
        return sum;
      }
      return sum + unitWeight * baseQty;
    }, 0);

    const sharerWeight = productsOffered.reduce((sum, entry) => {
      const qty = mergedSharerQuantities[entry.productId] ?? 0;
      const unitWeight = productMetaById.get(entry.productId)?.unitWeightKg ?? 0;
      return sum + unitWeight * qty;
    }, 0);

    return otherItemsWeight + sharerWeight;
  }, [items, mergedSharerQuantities, productMetaById, productsOffered, sharerParticipant]);

  const canAddExtraUnit = React.useCallback(
    (productId: string) => {
      if (!order || typeof order.maxWeightKg !== 'number' || order.maxWeightKg <= 0) return true;
      const unitWeightKg = productMetaById.get(productId)?.unitWeightKg ?? 0;
      if (unitWeightKg <= 0) return true;
      return totalWeightKg + unitWeightKg <= order.maxWeightKg + 1e-6;
    },
    [order, productMetaById, totalWeightKg]
  );

  const effectiveWeightKg = React.useMemo(() => {
    if (!order) return 0;
    return resolveEffectiveWeightKg(
      totalWeightKg,
      order.minWeightKg ?? 0,
      typeof order.maxWeightKg === 'number' ? order.maxWeightKg : null
    );
  }, [order, totalWeightKg]);

  const deliveryFeeCents = React.useMemo(() => {
    if (!order) return 0;
    if (order.deliveryOption === 'producer_pickup') {
      return Math.max(0, order.pickupDeliveryFeeCents ?? 0);
    }
    if (order.deliveryOption === 'producer_delivery') {
      return Math.max(0, order.deliveryFeeCents ?? 0);
    }
    return eurosToCents(logisticCostByWeight(effectiveWeightKg));
  }, [effectiveWeightKg, order]);

  const shareFraction = React.useMemo(() => {
    if (!order) return 0;
    const percentage = Math.max(order.sharerPercentage ?? 0, 0);
    if (percentage <= 0 || percentage >= 100) return 0;
    return percentage / (100 - percentage);
  }, [order]);

  const feePerKg = effectiveWeightKg > 0 ? deliveryFeeCents / effectiveWeightKg : 0;

  const recomputeUnitFinalCents = React.useCallback(
    (productId: string) => {
      const meta = productMetaById.get(productId);
      if (!meta) return 0;
      const unitDelivery = Math.round(feePerKg * meta.unitWeightKg);
      const unitSharerFee = Math.round((meta.unitBasePriceCents + unitDelivery) * shareFraction);
      return meta.unitBasePriceCents + unitDelivery + unitSharerFee;
    },
    [feePerKg, productMetaById, shareFraction]
  );

  const finalTotalsByParticipant = React.useMemo(() => {
    const totals = new Map<string, number>();
    orderFull?.participants.forEach((participant) => {
      totals.set(participant.id, 0);
    });

    items.forEach((item) => {
      const unitFinal = recomputeUnitFinalCents(item.productId);
      const qty = item.quantityUnits;
      const currentTotal = totals.get(item.participantId) ?? 0;
      totals.set(item.participantId, currentTotal + unitFinal * qty);
    });

    if (sharerParticipant) {
      let sharerTotal = 0;
      productsOffered.forEach((entry) => {
        const qty = mergedSharerQuantities[entry.productId] ?? 0;
        if (qty <= 0) return;
        const unitFinal = recomputeUnitFinalCents(entry.productId);
        sharerTotal += unitFinal * qty;
      });
      totals.set(sharerParticipant.id, sharerTotal);
    }

    return totals;
  }, [items, mergedSharerQuantities, orderFull?.participants, productsOffered, recomputeUnitFinalCents, sharerParticipant]);

  const paidTotalsByParticipant = React.useMemo(() => {
    const totals = new Map<string, number>();
    orderFull?.participants.forEach((participant) => {
      if (participant.role !== 'participant') return;
      totals.set(participant.id, Math.max(0, participant.totalAmountCents ?? 0));
    });
    return totals;
  }, [orderFull?.participants]);

  const participantGains = React.useMemo(() => {
    const sharerId = sharerParticipant?.id ?? null;
    return (
      orderFull?.participants
        .filter((participant) => !sharerId || participant.id !== sharerId)
        .map((participant) => {
          const paid = paidTotalsByParticipant.get(participant.id) ?? 0;
          const finalTotal = finalTotalsByParticipant.get(participant.id) ?? 0;
          const gain = Math.max(0, paid - finalTotal);
          return {
            participant,
            paid,
            finalTotal,
            gain,
          };
        }) ?? []
    );
  }, [finalTotalsByParticipant, orderFull?.participants, paidTotalsByParticipant, sharerParticipant?.id]);

  const sharerProductsFinalCents = sharerParticipant
    ? finalTotalsByParticipant.get(sharerParticipant.id) ?? 0
    : 0;
  const baseSharerShareCents = order?.sharerShareCents ?? 0;
  const pickupShareBonusCents =
    order?.deliveryOption === 'producer_pickup' ? Math.max(0, order.pickupDeliveryFeeCents ?? 0) : 0;
  const sharerShareCents = baseSharerShareCents + pickupShareBonusCents;
  const sharerOrderGainCents = Math.max(0, sharerShareCents - sharerProductsFinalCents);
  const computeCloseSettlement = React.useCallback(
    (balanceCents: number) => {
      const requiredAfterShareCents = Math.max(0, sharerProductsFinalCents - sharerShareCents);
      const usableCoopCents = useCoopBalance ? Math.max(0, balanceCents) : 0;
      const appliedCoopCents = Math.min(usableCoopCents, requiredAfterShareCents);
      const remainingToPayCents = Math.max(0, requiredAfterShareCents - appliedCoopCents);
      return {
        coopAppliedCents: appliedCoopCents,
        sharerRemainingToPayCents: remainingToPayCents,
      };
    },
    [sharerProductsFinalCents, sharerShareCents, useCoopBalance]
  );

  const { coopAppliedCents, sharerRemainingToPayCents } = React.useMemo(
    () => computeCloseSettlement(coopBalanceCents),
    [computeCloseSettlement, coopBalanceCents]
  );

  const canSubmit = Boolean(order && sharerParticipant && isOwner);
  const primaryActionLabel =
    sharerRemainingToPayCents > 0 ? 'Payer et clôturer' : 'Clôturer la commande';

  const handleExtraChange = (productId: string, delta: number) => {
    setExtraQuantities((prev) => {
      if (delta > 0 && !canAddExtraUnit(productId)) {
        return prev;
      }
      const current = prev[productId] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const applyExtraQuantities = async (activeOrder: Order, activeSharer: OrderParticipant) => {
    for (const entry of productsOffered) {
      const extra = extraQuantities[entry.productId] ?? 0;
      if (extra <= 0) continue;
      const existingQty = currentSharerQuantities[entry.productId] ?? 0;
      const targetQty = existingQty + extra;
      const existingItem = sharerItems.find((item) => item.productId === entry.productId);
      if (existingItem) {
        await updateOrderItemQuantity(existingItem.id, activeOrder.id, activeSharer.id, targetQty);
      } else {
        await addItem({
          orderId: activeOrder.id,
          participantId: activeSharer.id,
          productId: entry.productId,
          lotId: entry.product?.activeLotId ?? null,
          quantityUnits: targetQty,
        });
      }
    }
  };

  const handlePrimaryAction = async () => {
    if (!order || !sharerParticipant || !currentUser?.id) return;
    if (!canSubmit || isWorking) return;

    let freshCoopBalanceCents = coopBalanceCents;
    try {
      freshCoopBalanceCents = await fetchCoopBalance(currentUser.id);
      if (freshCoopBalanceCents !== coopBalanceCents) {
        setCoopBalanceCents(freshCoopBalanceCents);
      }
    } catch (error) {
      console.error('Close view coop balance refresh error:', error);
      toast.error('Impossible de verifier votre solde de gains. Merci de reessayer.');
      return;
    }

    const freshSettlement = computeCloseSettlement(freshCoopBalanceCents);

    try {
      if (freshSettlement.sharerRemainingToPayCents > 0) {
        if (!onStartClosePayment) {
          toast.error('Le paiement est requis avant la clôture.');
          return;
        }
        if (
          freshSettlement.sharerRemainingToPayCents !== sharerRemainingToPayCents ||
          freshSettlement.coopAppliedCents !== coopAppliedCents
        ) {
          toast.info('Montants actualises avec votre solde de gains le plus recent.');
        }
        onStartClosePayment({
          orderId: order.id,
          orderCode: order.orderCode ?? order.id,
          amountCents: freshSettlement.sharerRemainingToPayCents,
          useCoopBalance,
          extraQuantities: { ...extraQuantities },
        });
        return;
      }

      setIsWorking(true);
      await applyExtraQuantities(order, sharerParticipant);
      await createLockClosePackage(order.id, useCoopBalance);

      toast.success('Commande cloturee et recapitulatif genere.');
      navigate(`/cmd/${order.orderCode ?? order.id}`, { replace: true });
    } catch (error) {
      console.error('Close order error:', error);
      const message = (error as Error)?.message ?? 'Impossible de cloturer la commande.';
      toast.error(message);
      setIsWorking(false);
      return;
    }

    // Post-close checks are best effort only and must not block UX.
    try {
      let sharerInvoices = await fetchParticipantInvoices(order.id, currentUser.id);
      if (!sharerInvoices.length) {
        await issueSharerInvoiceAfterLock(order.id);
        sharerInvoices = await fetchParticipantInvoices(order.id, currentUser.id);
      }
      if (!sharerInvoices.length) {
        toast.warning('Commande cloturee, mais facture partageur non confirmee immediatement.');
      }
    } catch (invoiceCheckError) {
      console.error('Close order invoice check error:', invoiceCheckError);
      toast.warning('Commande cloturee, mais verification facture indisponible.');
    }

    try {
      await triggerOutgoingEmails();
    } catch (emailError) {
      console.error('Outgoing email trigger error:', emailError);
      toast.warning('Facture generee, mais envoi email non declenche automatiquement.');
    }
  };

  if (isLoading) {
    return <div className="order-close-view__loading">Chargement...</div>;
  }

  if (loadError || !order) {
    return <div className="order-close-view__loading">{loadError ?? 'Commande introuvable.'}</div>;
  }

  if (!isOwner) {
    return <div className="order-close-view__loading">Cette page est réservée au partageur.</div>;
  }
  if (order.status !== 'open') {
    return null;
  }

  return (
    <div className="order-close-view">
      <button type="button" className="order-close-view__back" onClick={() => navigate(`/cmd/${order.orderCode ?? order.id}`)}>
        <ArrowLeft className="order-close-view__icon" />
        Retour
      </button>

      <div className="order-close-view__header">
        <div>
          <h1>Récapitulatif avant clôture</h1>
          <p>Vérifiez vos quantités finales et les gains de coopération avant de clôturer.</p>
        </div>
        <button
          type="button"
          className="order-close-view__confirm"
          onClick={handlePrimaryAction}
          disabled={!canSubmit || isWorking}
        >
          <ShieldCheck className="order-close-view__icon" />
          {primaryActionLabel}
        </button>
      </div>

      <div className="order-close-view__grid">
        <div className="order-close-view__card">
          <div className="order-close-view__card-title">
            <Sparkles className="order-close-view__icon order-close-view__icon--accent" />
            Vos produits
          </div>
          <div className="order-close-view__products">
            {productsOffered.map((entry) => {
              const qty = mergedSharerQuantities[entry.productId] ?? 0;
              const extra = extraQuantities[entry.productId] ?? 0;
              const unitFinal = recomputeUnitFinalCents(entry.productId);
              return (
                <div key={entry.productId} className="order-close-view__product-row">
                  <div className="order-close-view__product-info">
                    <p className="order-close-view__product-name">{entry.product?.name ?? 'Produit'}</p>
                    <p className="order-close-view__product-price">
                      Prix final : {formatEurosFromCents(unitFinal)}
                    </p>
                  </div>
                  <div className="order-close-view__quantity">
                    <button
                      type="button"
                      className="order-close-view__qty-btn"
                      onClick={() => handleExtraChange(entry.productId, -1)}
                      disabled={extra <= 0}
                    >
                      <Minus />
                    </button>
                    <span className="order-close-view__qty-value">{qty}</span>
                    <button
                      type="button"
                      className="order-close-view__qty-btn"
                      onClick={() => handleExtraChange(entry.productId, 1)}
                      disabled={!canAddExtraUnit(entry.productId)}
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="order-close-view__card order-close-view__card--summary">
          <div className="order-close-view__card-title">Bilan comptable partageur</div>
          <div className="order-close-view__summary-row">
            <span>Prix de vos produits</span>
            <span>{formatEurosFromCents(sharerProductsFinalCents)}</span>
          </div>
          <div className="order-close-view__summary-row">
            <span>Votre part partageur</span>
            <span>-{formatEurosFromCents(Math.min(sharerShareCents, sharerProductsFinalCents))}</span>
          </div>
          {coopBalanceCents > 0 ? (
            <div className="order-close-view__summary-row order-close-view__summary-row--toggle">
              <label className="order-close-view__toggle">
                <input
                  type="checkbox"
                  checked={useCoopBalance && coopBalanceCents > 0}
                  onChange={(event) => setUseCoopBalance(event.target.checked)}
                  disabled={coopBalanceCents <= 0}
                />
                <span>Utiliser vos gains</span>
              </label>
              <span className="order-close-view__summary-value">-{formatEurosFromCents(coopAppliedCents)}</span>
            </div>
          ) : null}
          <div className="order-close-view__summary-row order-close-view__summary-row--strong">
            <span>Reste à payer</span>
            <span>{formatEurosFromCents(sharerRemainingToPayCents)}</span>
          </div>
        </div>

        <div className="order-close-view__card">
          <div className="order-close-view__card-title">
            <CheckCircle2 className="order-close-view__icon order-close-view__icon--accent" />
            Gains de coopération obtenus
          </div>
          <div className="order-close-view__gains">
            {sharerParticipant ? (
              <div className="order-close-view__gain-row order-close-view__gain-row--highlight">
                <div>
                  <p className="order-close-view__gain-name">
                    {sharerParticipant?.profileName ?? sharerParticipant?.profileHandle ?? 'Partageur'}
                  </p>
                  <p className="order-close-view__gain-detail">Obtenus sur cette commande</p>
                </div>
                <span className="order-close-view__gain-value">{formatEurosFromCents(sharerOrderGainCents)}</span>
              </div>
            ) : null}
            {participantGains.map(({ participant, paid, finalTotal, gain }) => (
              <div key={participant.id} className="order-close-view__gain-row">
                <div>
                  <p className="order-close-view__gain-name">
                    {participant.profileName ?? participant.profileHandle ?? 'Participant'}
                  </p>
                  <p className="order-close-view__gain-detail">
                    Payé ({formatEurosFromCents(paid)}) - Prix final ({formatEurosFromCents(finalTotal)})
                  </p>
                </div>
                <span className="order-close-view__gain-value">{formatEurosFromCents(gain)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}






