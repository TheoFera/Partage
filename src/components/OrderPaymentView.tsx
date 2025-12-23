import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../types';

interface OrderPaymentViewProps {
  order: GroupOrder;
  draft: OrderPurchaseDraft;
  onBack: () => void;
  onConfirmPayment: () => void;
}

function formatPrice(value: number) {
  return `${value.toFixed(2)} EUR`;
}

export function OrderPaymentView({
  order,
  draft,
  onBack,
  onConfirmPayment,
}: OrderPaymentViewProps) {
  const totalWeightAfter = draft.baseOrderedWeight + draft.weight;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 bg-white text-[#1F2937] shadow-sm hover:border-[#FF6B4A] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au resume
      </button>

      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-[#B45309] bg-[#FFF1E6] px-3 py-1 rounded-full">
          Etape 2/3
        </span>
        <h2 className="text-2xl md:text-3xl font-semibold text-[#1F2937]">Paiement provisoire</h2>
        <p className="text-sm text-[#6B7280]">
          Cette page simule le paiement avant l'integration de l'API.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
            <CreditCard className="w-4 h-4 text-[#FF6B4A]" />
            Module de paiement
          </div>
          <div className="space-y-3 text-sm text-[#6B7280]">
            <p>
              Ici se trouvera l'interface de paiement (carte bancaire, wallet, virement).
            </p>
            <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F9FAFB] p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                <ShieldCheck className="w-4 h-4 text-[#FF6B4A]" />
                Paiement securise
              </div>
              <p className="text-xs">
                Vos informations seront traitees par le prestataire de paiement.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
            <Sparkles className="w-4 h-4 text-[#FF6B4A]" />
            Resume de votre commande
          </div>
          <div className="space-y-2 text-sm text-[#6B7280]">
            <div className="flex items-center justify-between">
              <span>Commande</span>
              <span className="font-semibold text-[#1F2937]">{order.title}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span className="font-semibold text-[#1F2937]">{formatPrice(draft.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Poids selectionne</span>
              <span className="font-semibold text-[#1F2937]">{draft.weight.toFixed(2)} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Poids apres paiement</span>
              <span className="font-semibold text-[#1F2937]">{totalWeightAfter.toFixed(2)} kg</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onConfirmPayment}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#FF6B4A] text-white font-semibold px-4 py-3 shadow-sm hover:bg-[#FF5A39] transition-colors"
          >
            Confirmer et simuler le paiement
          </button>
        </div>
      </div>
    </div>
  );
}
