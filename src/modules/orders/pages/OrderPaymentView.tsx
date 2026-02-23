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
  onConfirmPayment: (payload?: OrderPaymentConfirmationPayload) => void | Promise<void>;
}

function formatPrice(value: number) {
  return formatEurosFromCents(eurosToCents(value));
}

export type OrderPaymentConfirmationPayload = {
  provider: 'stripe';
  providerPaymentId: string;
  raw?: Record<string, unknown>;
};

type StripeCreateCheckoutSessionResponse = {
  provider_payment_id: string;
  client_secret: string;
};

type EdgeInvokeErrorLike = {
  context?: unknown;
};

type StripeCreateCheckoutSessionErrorBody = {
  error?: string;
  stripe_message?: string | null;
  status?: number;
  details?: unknown;
};

type StripeCheckoutSessionStatusResponse = {
  provider_payment_id: string;
  status: 'paid' | 'authorized' | 'failed' | 'pending';
  stripe_status: string | null;
  payment_status: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_intent_id: string | null;
};

type EmbeddedCheckoutInstance = {
  mount: (selector: string) => void;
  unmount?: () => void;
  destroy?: () => void;
};

type StripeInstance = {
  initEmbeddedCheckout: (options: {
    fetchClientSecret: () => Promise<string>;
    onComplete?: () => void | Promise<void>;
  }) => Promise<EmbeddedCheckoutInstance>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

const STRIPE_JS_URL = 'https://js.stripe.com/v3/';
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
let stripeScriptPromise: Promise<void> | null = null;

const ensureStripeJs = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stripe n est pas disponible hors navigateur.'));
  }
  if (window.Stripe) return Promise.resolve();
  if (stripeScriptPromise) return stripeScriptPromise;

  stripeScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Chargement Stripe impossible.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = STRIPE_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Chargement Stripe impossible.'));
    document.head.appendChild(script);
  });

  return stripeScriptPromise;
};

export function OrderPaymentView({
  order,
  draft,
  onBack,
  onConfirmPayment,
}: OrderPaymentViewProps) {
  const isClosePayment = draft.kind === 'close';
  const selectedItems = React.useMemo(() => {
    if (Array.isArray(draft.lineItems) && draft.lineItems.length > 0) {
      return draft.lineItems
        .map((item) => {
          const quantity = Math.max(0, Number(item.quantity) || 0);
          if (!item.productCode || quantity <= 0) return null;
          const lineTotalCents = Math.max(0, Math.round(Number(item.lineTotalCents) || 0));
          return {
            key: item.productCode,
            label: item.label || item.productCode,
            quantity,
            lineTotalCents,
          };
        })
        .filter(Boolean) as Array<{ key: string; label: string; quantity: number; lineTotalCents: number }>;
    }
    return [] as Array<{ key: string; label: string; quantity: number; lineTotalCents: number }>;
  }, [draft.lineItems]);
  const selectedItemsSubtotalCents = React.useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.lineTotalCents, 0),
    [selectedItems]
  );
  const totalDueCents = React.useMemo(() => eurosToCents(draft.total), [draft.total]);
  const coopAppliedCents = React.useMemo(
    () => Math.max(0, selectedItemsSubtotalCents - totalDueCents),
    [selectedItemsSubtotalCents, totalDueCents]
  );

  const [checkoutClientSecret, setCheckoutClientSecret] = React.useState<string | null>(null);
  const [providerPaymentId, setProviderPaymentId] = React.useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isCheckoutMounting, setIsCheckoutMounting] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [checkoutReady, setCheckoutReady] = React.useState(false);
  const hasConfirmedRef = React.useRef(false);
  const checkoutRef = React.useRef<EmbeddedCheckoutInstance | null>(null);
  const checkoutContainerId = React.useMemo(() => `stripe-checkout-${order.id}`, [order.id]);
  const initialSessionId = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('session_id');
  }, []);

  const storageKey = React.useMemo(() => `stripe_idem_${order.id}`, [order.id]);

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

  React.useEffect(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Unable to clear stale sessionStorage idempotency key:', error);
    }
  }, [storageKey]);

  const disposeCheckout = React.useCallback(() => {
    const checkout = checkoutRef.current;
    if (!checkout) return;
    try {
      if (typeof checkout.destroy === 'function') {
        checkout.destroy();
      } else if (typeof checkout.unmount === 'function') {
        checkout.unmount();
      }
    } catch (error) {
      console.warn('Stripe checkout cleanup error:', error);
    }
    checkoutRef.current = null;
    setCheckoutReady(false);
  }, []);

  const clearCheckoutQueryFromUrl = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.search) return;
    window.history.replaceState({}, '', `${url.pathname}${url.hash}`);
  }, []);

  const verifyStripePayment = React.useCallback(
    async (forcedSessionId?: string) => {
      if (hasConfirmedRef.current || isVerifying) return;
      const sessionId = forcedSessionId ?? providerPaymentId;
      if (!sessionId) {
        setPaymentError('Session de paiement introuvable. Merci de relancer.');
        return;
      }

      setIsVerifying(true);
      setPaymentError(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.functions.invoke<StripeCheckoutSessionStatusResponse>(
          'stripe_checkout_session_status',
          {
            body: { provider_payment_id: sessionId },
          }
        );
        if (error) throw error;
        if (!data?.status) throw new Error('Statut de paiement indisponible.');

        if (data.status === 'paid' || data.status === 'authorized') {
          await onConfirmPayment({
            provider: 'stripe',
            providerPaymentId: data.provider_payment_id || sessionId,
            raw: {
              stripe_status: data.stripe_status,
              payment_status: data.payment_status,
              customer_email: data.customer_email,
              customer_phone: data.customer_phone,
              payment_intent_id: data.payment_intent_id,
            },
          });
          hasConfirmedRef.current = true;
          try {
            sessionStorage.removeItem(storageKey);
          } catch (error) {
            console.warn('Unable to clear sessionStorage idempotency key after confirmation:', error);
          }
          clearCheckoutQueryFromUrl();
          return;
        }

        setPaymentError('Le paiement est en attente ou a echoue. Merci de relancer.');
      } catch (error) {
        console.error('Stripe payment confirm error:', error);
        setPaymentError('Impossible de verifier le paiement. Merci de reessayer.');
      } finally {
        setIsVerifying(false);
      }
    },
    [clearCheckoutQueryFromUrl, isVerifying, onConfirmPayment, providerPaymentId, storageKey]
  );

  const createStripeCheckoutSession = React.useCallback(
    async (forceNew = false) => {
      if (isCreatingPayment || isVerifying) return;
      if (checkoutClientSecret && providerPaymentId && !forceNew) {
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
            ? `${window.location.origin}/cmd/${order.orderCode ?? order.id}/paiement?session_id={CHECKOUT_SESSION_ID}`
            : undefined;

        const { data, error } = await supabase.functions.invoke<StripeCreateCheckoutSessionResponse>(
          'stripe_create_checkout_session',
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
        if (!data?.client_secret || !data?.provider_payment_id) {
          throw new Error('Reponse de paiement incomplete.');
        }

        disposeCheckout();
        setProviderPaymentId(data.provider_payment_id);
        setCheckoutClientSecret(data.client_secret);
      } catch (error) {
        console.error('Stripe checkout session error:', error);
        let detailedMessage: string | null = null;
        const maybeContext = (error as EdgeInvokeErrorLike | null)?.context;
        if (maybeContext instanceof Response) {
          try {
            const payload =
              (await maybeContext.clone().json()) as StripeCreateCheckoutSessionErrorBody;
            const msg = payload?.stripe_message ?? payload?.error;
            if (typeof msg === 'string' && msg.trim()) {
              detailedMessage = msg.trim();
            }
          } catch {
            try {
              const text = await maybeContext.clone().text();
              if (text.trim()) detailedMessage = text.trim();
            } catch {
              // Ignore parse fallback failure.
            }
          }
        }
        setPaymentError(
          detailedMessage
            ? `Impossible d initier le paiement. ${detailedMessage}`
            : 'Impossible d initier le paiement. Merci de reessayer.'
        );
      } finally {
        setIsCreatingPayment(false);
      }
    },
    [
      checkoutClientSecret,
      disposeCheckout,
      draft.total,
      getIdempotencyKey,
      isCreatingPayment,
      isVerifying,
      order.id,
      order.orderCode,
      providerPaymentId,
    ]
  );

  React.useEffect(() => {
    if (!checkoutClientSecret || !providerPaymentId) return;
    if (checkoutRef.current) return;

    let cancelled = false;
    setIsCheckoutMounting(true);
    setCheckoutReady(false);
    setPaymentError(null);

    const mountCheckout = async () => {
      try {
        if (!STRIPE_PUBLISHABLE_KEY) {
          throw new Error('Configurez VITE_STRIPE_PUBLISHABLE_KEY.');
        }
        await ensureStripeJs();
        if (cancelled) return;
        if (!window.Stripe) {
          throw new Error('Stripe.js non disponible.');
        }
        const stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
        const checkout = await stripe.initEmbeddedCheckout({
          fetchClientSecret: async () => checkoutClientSecret,
          onComplete: () => verifyStripePayment(providerPaymentId),
        });
        if (cancelled) {
          if (typeof checkout.destroy === 'function') checkout.destroy();
          return;
        }
        checkout.mount(`#${checkoutContainerId}`);
        checkoutRef.current = checkout;
        setCheckoutReady(true);
      } catch (error) {
        console.error('Stripe checkout mount error:', error);
        void verifyStripePayment(providerPaymentId);
        setPaymentError('Impossible de charger le module de paiement Stripe. Merci de reessayer.');
      } finally {
        if (!cancelled) {
          setIsCheckoutMounting(false);
        }
      }
    };

    void mountCheckout();

    return () => {
      cancelled = true;
    };
  }, [checkoutClientSecret, checkoutContainerId, providerPaymentId, verifyStripePayment]);

  React.useEffect(() => {
    return () => {
      disposeCheckout();
    };
  }, [disposeCheckout]);

  React.useEffect(() => {
    if (!initialSessionId) return;
    clearCheckoutQueryFromUrl();
  }, [clearCheckoutQueryFromUrl, initialSessionId]);

  React.useEffect(() => {
    if (!initialSessionId) return;
    if (!providerPaymentId) {
      setProviderPaymentId(initialSessionId);
    }
    void verifyStripePayment(initialSessionId);
  }, [initialSessionId, providerPaymentId, verifyStripePayment]);

  const handleRetryPayment = React.useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Unable to clear sessionStorage idempotency key:', error);
    }
    hasConfirmedRef.current = false;
    disposeCheckout();
    setCheckoutClientSecret(null);
    setProviderPaymentId(null);
    setCheckoutReady(false);
    setPaymentError(null);
    void createStripeCheckoutSession(true);
  }, [createStripeCheckoutSession, disposeCheckout, storageKey]);

  const isBusy = isCreatingPayment || isVerifying || isCheckoutMounting;
  const hasCheckoutSession = Boolean(checkoutClientSecret && providerPaymentId);

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
          {isClosePayment ? 'Réglement de clôture' : 'Paiement en ligne sécurisé'}
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
              <span>Participation a la commande</span>
              <span className="order-payment-view__summary-value">{order.title}</span>
            </div>
            {selectedItems.map((item) => (
              <div key={item.key} className="order-payment-view__summary-row">
                <span>
                  {item.label} x {item.quantity}
                </span>
                <span className="order-payment-view__summary-value">
                  {formatEurosFromCents(item.lineTotalCents)}
                </span>
              </div>
            ))}
            {coopAppliedCents > 0 ? (
              <div className="order-payment-view__summary-row">
                <span>Avoir coop</span>
                <span className="order-payment-view__summary-value">
                  -{formatEurosFromCents(coopAppliedCents)}
                </span>
              </div>
            ) : null}
            <div className="order-payment-view__summary-row">
              <span>{isClosePayment ? 'Reste a payer' : 'Total'}</span>
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
            onClick={() => createStripeCheckoutSession(false)}
            className="order-payment-view__confirm-button"
            disabled={isBusy}
            aria-busy={isBusy}
          >
            {isBusy
              ? 'Paiement en cours...'
              : hasCheckoutSession
                ? 'Reprendre le paiement'
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
            {hasCheckoutSession ? (
              <div className="order-payment-view__payment-frame">
                <div
                  id={checkoutContainerId}
                  className="order-payment-view__embedded-checkout"
                  aria-busy={isCheckoutMounting}
                />
              </div>
            ) : (
              <div className="order-payment-view__notice">
                <div className="order-payment-view__notice-label">
                  <ShieldCheck className="order-payment-view__icon order-payment-view__icon--accent" />
                  Paiement sécurisé
                </div>
                <p className="order-payment-view__notice-text">
                  Vos informations sont traitées et sécurisées par le prestataire de paiement Stripe.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
