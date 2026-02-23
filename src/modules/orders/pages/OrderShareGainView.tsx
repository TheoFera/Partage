import React from 'react';
import { CheckCircle2, Copy, Mail, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { GroupOrder, OrderPurchaseDraft } from '../../../shared/types';
import { centsToEuros, eurosToCents } from '../../../shared/lib/money';
import './OrderShareGainView.css';

interface OrderShareGainViewProps {
  order: GroupOrder;
  purchase: OrderPurchaseDraft;
  onShare: () => void;
  onClose: () => void;
}

const formatKg = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

type DeliveryOptionLike = 'chronofresh' | 'producer_delivery' | 'producer_pickup';

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

const resolveDeliveryOption = (order: GroupOrder): DeliveryOptionLike => {
  const raw = (order as GroupOrder & { deliveryOption?: unknown }).deliveryOption;
  if (raw === 'chronofresh' || raw === 'producer_delivery' || raw === 'producer_pickup') {
    return raw;
  }

  const pickupFeeEuros = Math.max(0, Number(order.pickupDeliveryFee ?? 0));
  const pickupFeeCents = eurosToCents(pickupFeeEuros);
  const deliveryFeeCents = Math.max(0, Number(order.deliveryFeeCents ?? 0));
  if (pickupFeeCents > 0 && Math.abs(deliveryFeeCents - pickupFeeCents) <= 1) {
    return 'producer_pickup';
  }

  const estimatedEffectiveWeightKg = resolveEffectiveWeightKg(
    Math.max(0, Number(order.orderedWeight ?? 0)),
    Math.max(0, Number(order.minWeight ?? 0)),
    order.maxWeight > 0 ? order.maxWeight : null
  );
  const estimatedChronofreshCents = eurosToCents(logisticCostByWeight(estimatedEffectiveWeightKg));
  if (deliveryFeeCents > 0 && Math.abs(deliveryFeeCents - estimatedChronofreshCents) <= 5) {
    return 'chronofresh';
  }

  return 'producer_delivery';
};

function formatDeadline(value: GroupOrder['deadline']) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'À confirmer';
  return date.toLocaleDateString('fr-FR');
}

async function copyTextToClipboard(value: string) {
  if (!value) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fallback below
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function OrderShareGainView({
  order,
  purchase,
  onShare,
  onClose,
}: OrderShareGainViewProps) {
  const participantWeight = Math.max(purchase.weight, 0);
  const reportedWeight = Math.max(order.orderedWeight ?? 0, 0);
  const currentWeightRaw = Math.max(purchase.baseOrderedWeight + participantWeight, reportedWeight, 0);
  const currentWeight = Math.max(currentWeightRaw, 0.1);
  const maxWeight = Math.max(order.maxWeight, currentWeightRaw, 0.1);
  const remainingCapacity = Math.max(order.maxWeight - currentWeightRaw, 0);
  const weightNowKg = currentWeightRaw;
  const weightMaxKg = order.maxWeight > 0 ? Math.max(order.maxWeight, currentWeightRaw) : currentWeightRaw;
  const deliveryOption = resolveDeliveryOption(order);
  const shareFraction = React.useMemo(() => {
    const percentage = Math.max(order.sharerPercentage ?? 0, 0);
    if (percentage <= 0 || percentage >= 100) return 0;
    return percentage / (100 - percentage);
  }, [order.sharerPercentage]);
  const productsById = React.useMemo(
    () => new Map(order.products.map((product) => [product.id, product])),
    [order.products]
  );
  const participantTotalAtWeightCents = React.useCallback(
    (targetWeightKg: number) => {
      const effectiveWeightKg = resolveEffectiveWeightKg(
        targetWeightKg,
        Math.max(order.minWeight ?? 0, 0),
        order.maxWeight > 0 ? order.maxWeight : null
      );
      const deliveryFeeCents =
        deliveryOption === 'chronofresh'
          ? eurosToCents(logisticCostByWeight(effectiveWeightKg))
          : deliveryOption === 'producer_pickup'
            ? eurosToCents(Math.max(order.pickupDeliveryFee ?? 0, 0))
            : Math.max(order.deliveryFeeCents ?? 0, 0);
      const feePerKg = effectiveWeightKg > 0 ? deliveryFeeCents / effectiveWeightKg : 0;

      let totalCents = 0;
      Object.entries(purchase.quantities).forEach(([productId, rawQty]) => {
        const qty = Math.max(0, Number(rawQty) || 0);
        if (qty <= 0) return;

        const product = productsById.get(productId);
        if (!product) return;

        const unitWeightKg = getProductWeightKg(product);
        const baseCents = eurosToCents(product.price);
        const unitDeliveryCents = Math.round(feePerKg * unitWeightKg);
        const unitSharerFeeCents = Math.round((baseCents + unitDeliveryCents) * shareFraction);
        const unitFinalCents = baseCents + unitDeliveryCents + unitSharerFeeCents;
        totalCents += unitFinalCents * qty;
      });

      return Math.round(totalCents);
    },
    [
      deliveryOption,
      order.deliveryFeeCents,
      order.maxWeight,
      order.minWeight,
      order.pickupDeliveryFee,
      productsById,
      purchase.quantities,
      shareFraction,
    ]
  );
  const totalNowCents = participantTotalAtWeightCents(weightNowKg);
  const totalAtMaxCents = participantTotalAtWeightCents(weightMaxKg);
  const potentialCreditCents = Math.max(0, totalNowCents - totalAtMaxCents);
  const potentialCredit = centsToEuros(potentialCreditCents);
  const progress = Math.min(100, (currentWeight / maxWeight) * 100);
  const requiresManualApproval = order.autoApproveParticipationRequests === false;
  const deadlineLabel = formatDeadline(order.deadline);

  const shareUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/cmd/${order.orderCode ?? order.id}`;
  }, [order.id, order.orderCode]);

  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareTitle = `Commande groupée : ${order.title}`;

  const shareMessage = React.useMemo(
    () =>
      `Je viens de rejoindre une commande groupée. Il reste ${formatKg.format(remainingCapacity)} kg pour réduire les frais logistiques : si on atteint ${formatKg.format(maxWeight)} kg, je gagne jusqu’à ${formatEUR.format(potentialCredit)} de crédit sur ma prochaine commande. Rejoins ici : ${shareUrl}`,
    [maxWeight, potentialCredit, remainingCapacity, shareUrl]
  );

  const handleCopyLink = React.useCallback(async () => {
    const copied = await copyTextToClipboard(shareUrl);
    if (copied) {
      toast.success('Lien copié');
      return;
    }
    toast.error('Impossible de copier le lien');
  }, [shareUrl]);

  const handleNativeShare = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      onShare();
      return;
    }
    try {
      await navigator.share({
        title: shareTitle,
        text: shareMessage,
        url: shareUrl || undefined,
      });
    } catch (error) {
      const domError = error as DOMException;
      if (domError?.name === 'AbortError') return;
      onShare();
    }
  }, [onShare, shareMessage, shareTitle, shareUrl]);

  const handleWhatsApp = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }, [shareMessage]);

  const handleMessenger = React.useCallback(async () => {
    if (canUseNativeShare) {
      await handleNativeShare();
      return;
    }
    const copied = await copyTextToClipboard(shareMessage);
    if (copied) {
      toast.success('Message copié');
      return;
    }
    toast.error('Impossible de copier le message');
  }, [canUseNativeShare, handleNativeShare, shareMessage]);

  const handleEmail = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const subject = encodeURIComponent(`Commande groupée : ${order.title}`);
    const body = encodeURIComponent(shareMessage);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [order.title, shareMessage]);

  return (
    <div className="order-share-gain-view">
      <div className="order-share-gain-view__card">
        <div className="order-share-gain-view__header">
          <div className="order-share-gain-view__heading">
            <h2 className="order-share-gain-view__title">Paiement confirmé, merci !</h2>
            {requiresManualApproval ? (
              <p className="order-share-gain-view__manual-note">
                La demande de participation a été enregistrée auprès du créateur de la commande. Vous serez
                remboursé si elle est refusée.
              </p>
            ) : null}
          </div>
        </div>

        <section className="order-share-gain-view__focus-card">
          <p className="order-share-gain-view__focus-eyebrow">
            <Sparkles className="order-share-gain-view__icon order-share-gain-view__icon--accent" />
            Gain de coopération gagnable si la commande atteint son poids maximum
          </p>
          <p className="order-share-gain-view__focus-value">Jusqu’à {formatEUR.format(potentialCredit)}</p>
          <p className="order-share-gain-view__focus-note">
            Les gains de coopération obtenus pourront être utilisés lors de vos prochaines commandes.
          </p>

          <details className="order-share-gain-view__details">
            <summary>Comment ça marche ?</summary>
            <ul>
              <li>Plus la commande est grosse moins les frais de livraison par produit sont importants.</li>
              <li>Ainsi plus la commande se remplit, plus les frais logistiques baissent.</li>
              <li>Nous avons décidé de vous reverser l'intégralité de ces gains logistiques !</li>
              <li>Partagez la commande autour de vous afin qu'elle se remplisse plus rapidement.</li>
              <li>À la clôture de la commande, on recalcule le montant final.</li>
              <li>La différence devient un avoir utilisable sur votre prochaine commande.</li>
            </ul>
          </details>
        </section>

        <section className="order-share-gain-view__progress">
          <p className="order-share-gain-view__progress-main">
            Poids total actuel de la commande (après avoir enregistré votre participation) :{' '}
            <span className="order-share-gain-view__progress-value">
              {formatKg.format(currentWeight)} / {formatKg.format(maxWeight)} kg
            </span>
          </p>
          <p className="order-share-gain-view__progress-sub">Dont vous : +{formatKg.format(participantWeight)} kg</p>
          <div className="order-share-gain-view__progress-track" role="presentation">
            <div className="order-share-gain-view__progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <p className="order-share-gain-view__progress-note">
            Il reste {formatKg.format(remainingCapacity)} kg pour atteindre la capacité maximale.
          </p>
        </section>

        <section className="order-share-gain-view__share">
          <h3 className="order-share-gain-view__section-title">Partager la commande afin qu'elle se remplisse plus rapidement.</h3>
          <div className="order-share-gain-view__share-link-row">
            <input
              type="text"
              value={shareUrl}
              readOnly
              aria-label="Lien de partage"
              className="order-share-gain-view__share-link-input"
            />
            <button type="button" onClick={handleCopyLink} className="order-share-gain-view__copy-button">
              <Copy className="order-share-gain-view__icon" />
              Copier
            </button>
          </div>
          <div className="order-share-gain-view__share-actions">
            <button type="button" onClick={handleWhatsApp} className="order-share-gain-view__shortcut-button">
              <MessageCircle className="order-share-gain-view__icon" />
              WhatsApp
            </button>
            <button type="button" onClick={handleMessenger} className="order-share-gain-view__shortcut-button">
              <Share2 className="order-share-gain-view__icon" />
              Messenger
            </button>
            <button type="button" onClick={handleEmail} className="order-share-gain-view__shortcut-button">
              <Mail className="order-share-gain-view__icon" />
              Email
            </button>
            {canUseNativeShare ? (
              <button
                type="button"
                onClick={handleNativeShare}
                className="order-share-gain-view__shortcut-button order-share-gain-view__shortcut-button--native"
              >
                <Share2 className="order-share-gain-view__icon" />
                Partager…
              </button>
            ) : null}
          </div>
        </section>

        <section className="order-share-gain-view__next-steps">
          <h3 className="order-share-gain-view__section-title">Prochaines étapes</h3>
          <p>
            Date limite de clôture : <strong>{deadlineLabel}</strong>
          </p>
          <button type="button" onClick={onClose} className="order-share-gain-view__close-button">
            Retour aux commandes
          </button>
        </section>
      </div>
    </div>
  );
}
