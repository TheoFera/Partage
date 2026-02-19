import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../../../shared/types';
import './OrderPaymentView.css';
import { eurosToCents, formatEurosFromCents } from '../../../shared/lib/money';
import { getSupabaseClient } from '../../../shared/lib/supabaseClient';

interface OrderPaymentViewProps {
  order: GroupOrder;
  draft: OrderPurchaseDraft;
  onBack: () => void;
  onConfirmPayment: () => void;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

type StancerCreatePaymentIntentResponse = {
  provider_payment_id: string;
  payment_url: string;
};

type StancerConfirmPaymentResponse = {
  status: 'paid' | 'authorized' | 'failed' | 'pending';
};

export function OrderPaymentView({
  order,
  draft,
  onBack,
  onConfirmPayment,
}: OrderPaymentViewProps) {
  const totalWeightAfter = draft.baseOrderedWeight + draft.weight;
  const isClosePayment = draft.kind === 'close';
  const [paymentUrl, setPaymentUrl] = React.useState<string | null>(null);
  const [providerPaymentId, setProviderPaymentId] = React.useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = React.useState(560);
  const [iframeVisible, setIframeVisible] = React.useState(false);
  const hasConfirmedRef = React.useRef(false);

  const storageKey = React.useMemo(() => `stancer_idem_${order.id}`, [order.id]);
  const canUseIframe = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const getIdempotencyKey = React.useCallback(
    (forceNew: boolean) => {
      try {
        if (!forceNew) {
          const existing = sessionStorage.getItem(storageKey);
          if (existing) return existing;
        }
        const generated =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(storageKey, generated);
        return generated;
      } catch (error) {
        console.warn('Unable to access sessionStorage for idempotency key:', error);
        return null;
      }
    },
    [storageKey]
  );

  const openPaymentPage = React.useCallback((url: string) => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      setPaymentError(
        "Impossible d'ouvrir la page de paiement (popup bloquée). Autorisez les popups et réessayez."
      );
    }
  }, []);

  const createStancerPayment = React.useCallback(
    async (forceNew = false) => {
      if (isCreatingPayment || isVerifying) return;
      if (paymentUrl && !forceNew) {
        setIframeVisible(true);
        if (!canUseIframe) {
          openPaymentPage(paymentUrl);
        }
        return;
      }

      setIsCreatingPayment(true);
      setPaymentError(null);
      try {
        const supabase = getSupabaseClient();
        const idempotencyKey = getIdempotencyKey(forceNew);
        const amountCents = eurosToCents(draft.total);
        const returnUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/cmd/${order.orderCode ?? order.id}/paiement`
            : undefined;
        const { data, error } = await supabase.functions.invoke<StancerCreatePaymentIntentResponse>(
          'stancer_create_payment_intent',
          {
            body: {
              order_id: order.id,
              amount_cents: amountCents,
              idempotency_key: idempotencyKey,
              return_url: returnUrl,
            },
          }
        );
        if (error) throw error;
        if (!data?.payment_url || !data?.provider_payment_id) {
          throw new Error('Réponse de paiement incomplète.');
        }

        setPaymentUrl(data.payment_url);
        setProviderPaymentId(data.provider_payment_id);
        setIframeVisible(true);
        setIframeHeight(560);

        if (!canUseIframe) {
          setPaymentError(
            "Le mode iframe est bloqué en HTTP local. Utilisez HTTPS pour l'integration inline, ou ouvrez la page dans un nouvel onglet."
          );
          openPaymentPage(data.payment_url);
        }
      } catch (error) {
        console.error('Stancer payment intent error:', error);
        setPaymentError("Impossible d'initier le paiement. Merci de réessayer.");
      } finally {
        setIsCreatingPayment(false);
      }
    },
    [canUseIframe, draft.total, getIdempotencyKey, isCreatingPayment, isVerifying, openPaymentPage, order.id, order.orderCode, paymentUrl]
  );

  const confirmStancerPayment = React.useCallback(async () => {
    if (hasConfirmedRef.current || isVerifying) return;
    if (!providerPaymentId) {
      setPaymentError('Paiement introuvable. Merci de relancer.');
      return;
    }
    setIsVerifying(true);
    setPaymentError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke<StancerConfirmPaymentResponse>(
        'stancer_confirm_payment',
        {
          body: { provider_payment_id: providerPaymentId },
        }
      );
      if (error) throw error;
      if (!data?.status) throw new Error('Statut de paiement indisponible.');
      if (data.status === 'paid' || data.status === 'authorized') {
        hasConfirmedRef.current = true;
        onConfirmPayment();
        return;
      }
      setPaymentError('Le paiement est en attente ou a échoué. Merci de relancer.');
    } catch (error) {
      console.error('Stancer payment confirm error:', error);
      setPaymentError('Impossible de vérifier le paiement. Merci de réessayer.');
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying, onConfirmPayment, providerPaymentId]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://payment.stancer.com') return;
      let payload: unknown = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { height?: number; status?: string };
      if (typeof data.height === 'number' && Number.isFinite(data.height)) {
        const nextHeight = Math.max(420, Math.round(data.height));
        setIframeHeight(nextHeight);
      }
      if (data.status === 'finished') {
        confirmStancerPayment();
      }
      if (data.status === 'error' || data.status === 'invalid') {
        setPaymentError('Le paiement a été interrompu. Merci de relancer.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [confirmStancerPayment]);

  const handleRetryPayment = React.useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Unable to clear sessionStorage idempotency key:', error);
    }
    setPaymentUrl(null);
    setProviderPaymentId(null);
    setIframeVisible(true);
    createStancerPayment(true);
  }, [createStancerPayment, storageKey]);

  const isBusy = isCreatingPayment || isVerifying;

  return (
    <div className="order-payment-view">
      <button
        type="button"
        onClick={onBack}
        className="order-payment-view__back-button"
      >
        <ArrowLeft className="order-payment-view__icon" />
        Retour
      </button>

      <div className="order-payment-view__intro">
        <h2 className="order-payment-view__title">
          {isClosePayment ? 'Règlement de clôture' : 'Paiement en ligne sécurisé'}
        </h2>
      </div>

      <div className="order-payment-view__grid">
        <div className="order-payment-view__card order-payment-view__card--summary">
          <div className="order-payment-view__eyebrow">
            <Sparkles className="order-payment-view__icon order-payment-view__icon--accent" />
            Résumé de votre commande
          </div>
          <div className="order-payment-view__summary-list">
            <div className="order-payment-view__summary-row">
              <span>Commande</span>
              <span className="order-payment-view__summary-value">{order.title}</span>
            </div>
            <div className="order-payment-view__summary-row">
              <span>{isClosePayment ? 'Reste à payer' : 'Total'}</span>
              <span className="order-payment-view__summary-value">{formatPrice(draft.total)}</span>
            </div>
            {!isClosePayment ? (
              <div className="order-payment-view__summary-row">
                <span>Poids de votre commande</span>
                <span className="order-payment-view__summary-value">{draft.weight.toFixed(2)} kg</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => createStancerPayment(false)}
            className="order-payment-view__confirm-button"
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy
              ? 'Paiement en cours...'
              : isClosePayment
                ? 'Payer et clôturer'
                : 'Payer avec votre carte bancaire'}
          </button>
          {isBusy ? (
            <p className="order-payment-view__confirm-feedback" role="status">
              Paiement en cours. Merci de finaliser votre paiement dans le module.
            </p>
          ) : null}
        </div>
        <div className="order-payment-view__card">
          <div className="order-payment-view__eyebrow">
            <CreditCard className="order-payment-view__icon order-payment-view__icon--accent" />
            Module de paiement
          </div>
          <div className="order-payment-view__text">
            {paymentError && (
              <div className="order-payment-view__error" role="alert">
                {paymentError}
              </div>
            )}
            {iframeVisible && paymentUrl && canUseIframe ? (
              <div className="order-payment-view__payment-frame">
                <iframe
                  src={paymentUrl}
                  title="Paiement Stancer"
                  className="order-payment-view__iframe"
                  style={{ height: iframeHeight }}
                  allow="payment *"
                />
              </div>
            ) : (
              <>
                {!canUseIframe && (
                  <p>
                    En environnement HTTP (localhost), Stancer bloque l&apos;affichage en iframe via CSP. Passez le front en HTTPS pour tester l&apos;integration inline.
                  </p>
                )}
                <div className="order-payment-view__notice">
                  <div className="order-payment-view__notice-label">
                    <ShieldCheck className="order-payment-view__icon order-payment-view__icon--accent" />
                    Paiement sécurisé
                  </div>
                  <p className="order-payment-view__notice-text">
                    Vos informations sont traitées et sécurisées par le prestataire de paiement Stancer.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

