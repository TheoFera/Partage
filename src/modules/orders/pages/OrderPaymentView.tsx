import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../types';
import './OrderPaymentView.css';
import { eurosToCents, formatEurosFromCents } from '../lib/money';

interface OrderPaymentViewProps {
  order: GroupOrder;
  draft: OrderPurchaseDraft;
  onBack: () => void;
  onConfirmPayment: () => void;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

export function OrderPaymentView({
  order,
  draft,
  onBack,
  onConfirmPayment,
}: OrderPaymentViewProps) {
  const totalWeightAfter = draft.baseOrderedWeight + draft.weight;

  return (
    <div className="order-payment-view">
      <button
        type="button"
        onClick={onBack}
        className="order-payment-view__back-button"
      >
        <ArrowLeft className="order-payment-view__icon" />
        Retour a la selection
      </button>

      <div className="order-payment-view__intro">
        <h2 className="order-payment-view__title">Paiement provisoire</h2>
        <p className="order-payment-view__subtitle">
          Cette page simule le paiement avant l'integration de l'API.
        </p>
      </div>

      <div className="order-payment-view__grid">
        <div className="order-payment-view__card">
          <div className="order-payment-view__eyebrow">
            <CreditCard className="order-payment-view__icon order-payment-view__icon--accent" />
            Module de paiement
          </div>
          <div className="order-payment-view__text">
            <p>
              Ici se trouvera l'interface de paiement (carte bancaire, wallet, virement).
            </p>
            <div className="order-payment-view__notice">
              <div className="order-payment-view__notice-label">
                <ShieldCheck className="order-payment-view__icon order-payment-view__icon--accent" />
                Paiement securise
              </div>
              <p className="order-payment-view__notice-text">
                Vos informations seront traitees par le prestataire de paiement.
              </p>
            </div>
          </div>
        </div>

        <div className="order-payment-view__card order-payment-view__card--summary">
          <div className="order-payment-view__eyebrow">
            <Sparkles className="order-payment-view__icon order-payment-view__icon--accent" />
            Resume de votre commande
          </div>
          <div className="order-payment-view__summary-list">
            <div className="order-payment-view__summary-row">
              <span>Commande</span>
              <span className="order-payment-view__summary-value">{order.title}</span>
            </div>
            <div className="order-payment-view__summary-row">
              <span>Total</span>
              <span className="order-payment-view__summary-value">{formatPrice(draft.total)}</span>
            </div>
            <div className="order-payment-view__summary-row">
              <span>Poids selectionne</span>
              <span className="order-payment-view__summary-value">{draft.weight.toFixed(2)} kg</span>
            </div>
            <div className="order-payment-view__summary-row">
              <span>Poids apres paiement</span>
              <span className="order-payment-view__summary-value">{totalWeightAfter.toFixed(2)} kg</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onConfirmPayment}
            className="order-payment-view__confirm-button"
          >
            Confirmer et simuler le paiement
          </button>
        </div>
      </div>
    </div>
  );
}
