import React from 'react';
import { CheckCircle2, Copy, Mail, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { GroupOrder, OrderPurchaseDraft } from '../../../shared/types';
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

function estimateLogisticsCost(order: GroupOrder) {
  const maxWeight = Math.max(order.maxWeight, 1);
  const base = 6 + maxWeight * 0.55;
  const valueBased = order.totalValue * 0.05;
  return Math.max(base, valueBased, 8);
}

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
  const currentWeight = Math.max(
    purchase.baseOrderedWeight + participantWeight,
    reportedWeight,
    0.1
  );
  const maxWeight = Math.max(order.maxWeight, currentWeight);
  const remainingCapacity = Math.max(order.maxWeight - currentWeight, 0);
  const logisticsCost = estimateLogisticsCost(order);
  const costPerKgNow = logisticsCost / currentWeight;
  const costPerKgAtMax = logisticsCost / maxWeight;
  const potentialCredit = Math.max(0, participantWeight * (costPerKgNow - costPerKgAtMax));
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
            Gains de coopération gagnables si la commande atteint son poids maximum
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
