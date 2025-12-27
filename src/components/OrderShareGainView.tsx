import React from 'react';
import { CheckCircle2, Share2, Sparkles, Users } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../types';
import './OrderShareGainView.css';

interface OrderShareGainViewProps {
  order: GroupOrder;
  purchase: OrderPurchaseDraft;
  onShare: () => void;
  onClose: () => void;
}

function formatPrice(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function estimateLogisticsCost(order: GroupOrder) {
  const maxWeight = Math.max(order.maxWeight, 1);
  const base = 6 + maxWeight * 0.55;
  const valueBased = order.totalValue * 0.05;
  return Math.max(base, valueBased, 8);
}

export function OrderShareGainView({
  order,
  purchase,
  onShare,
  onClose,
}: OrderShareGainViewProps) {
  const participantWeight = Math.max(purchase.weight, 0);
  const reportedWeight = Math.max(order.orderedWeight ?? 0, 0);
  const currentWeight = Math.max(purchase.baseOrderedWeight + participantWeight, reportedWeight, 0.1);
  const maxWeight = Math.max(order.maxWeight, currentWeight);
  const remainingCapacity = Math.max(order.maxWeight - currentWeight, 0);
  const logisticsCost = estimateLogisticsCost(order);
  const costPerKgNow = logisticsCost / currentWeight;
  const costPerKgAtMax = logisticsCost / maxWeight;
  // Gain potentiel = part achetee * baisse du cout logistique par kg entre maintenant et la capacite max.
  const potentialGain = Math.max(0, participantWeight * (costPerKgNow - costPerKgAtMax));
  const progress = Math.min(100, (currentWeight / maxWeight) * 100);

  return (
    <div className="order-share-gain-view">
      <div className="order-share-gain-view__card">
        <div className="order-share-gain-view__header">
          <div className="order-share-gain-view__heading">
            <h2 className="order-share-gain-view__title">
              Paiement confirmé, merci !
            </h2>
            <p className="order-share-gain-view__subtitle">
              Plus la commande se remplit, plus les couts logistiques se divisent entre tous.
            </p>
          </div>
          <span className="order-share-gain-view__status-badge">
            <CheckCircle2 className="order-share-gain-view__icon order-share-gain-view__icon--large" />
          </span>
        </div>

        <div className="order-share-gain-view__progress">
          <div className="order-share-gain-view__progress-meta">
            <span>Poids actuel</span>
            <span className="order-share-gain-view__progress-value">
              {currentWeight.toFixed(2)} kg / {order.maxWeight} kg
            </span>
          </div>
          <div className="order-share-gain-view__progress-track">
            <div
              className="order-share-gain-view__progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="order-share-gain-view__progress-note">
            Il reste {remainingCapacity.toFixed(2)} kg pour atteindre la capacite maximale.
          </p>
        </div>

        <div className="order-share-gain-view__metrics">
          <div className="order-share-gain-view__metric-card">
            <div className="order-share-gain-view__metric-label">
              <Users className="order-share-gain-view__icon order-share-gain-view__icon--accent" />
              Votre part
            </div>
            <p className="order-share-gain-view__metric-value">{participantWeight.toFixed(2)} kg</p>
            <p className="order-share-gain-view__metric-note">Votre achat participe a la mutualisation.</p>
          </div>
          <div className="order-share-gain-view__metric-card order-share-gain-view__metric-card--accent">
            <div className="order-share-gain-view__metric-label order-share-gain-view__metric-label--accent">
              <Sparkles className="order-share-gain-view__icon" />
              Gain potentiel
            </div>
            <p className="order-share-gain-view__metric-value">{formatPrice(potentialGain)}</p>
            <p className="order-share-gain-view__metric-note order-share-gain-view__metric-note--accent">Estime si la commande atteint le poids max.</p>
          </div>
          <div className="order-share-gain-view__metric-card">
            <div className="order-share-gain-view__metric-label">
              <Sparkles className="order-share-gain-view__icon order-share-gain-view__icon--accent" />
              Logistique estimee
            </div>
            <p className="order-share-gain-view__metric-value">{formatPrice(logisticsCost)}</p>
            <p className="order-share-gain-view__metric-note">
              Cout partage par kg: {formatPrice(costPerKgNow)} maintenant.
            </p>
          </div>
        </div>

        <div className="order-share-gain-view__info">
          Votre gain de cooperation correspond a la baisse de cout logistique par kg entre le niveau actuel et le
          poids maximal, applique a votre part. Partagez la commande pour activer ce gain.
        </div>

        <div className="order-share-gain-view__actions">
          <button
            type="button"
            onClick={onShare}
            className="order-share-gain-view__share-button"
          >
            <Share2 className="order-share-gain-view__icon" />
            Partager la commande
          </button>
          <button
            type="button"
            onClick={onClose}
            className="order-share-gain-view__close-button"
          >
            Retour aux commandes
          </button>
        </div>
      </div>
    </div>
  );
}
