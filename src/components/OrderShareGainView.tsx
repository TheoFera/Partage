import React from 'react';
import { CheckCircle2, Share2, Sparkles, Users } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../types';

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
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-[#B45309] bg-[#FFF1E6] px-3 py-1 rounded-full">
              Etape 3/3
            </span>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#1F2937]">
              Paiement confirme, merci !
            </h2>
            <p className="text-sm text-[#6B7280]">
              Plus la commande se remplit, plus les couts logistiques se divisent entre tous.
            </p>
          </div>
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
            <CheckCircle2 className="w-6 h-6" />
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Poids actuel</span>
            <span className="font-semibold text-[#1F2937]">
              {currentWeight.toFixed(2)} kg / {order.maxWeight} kg
            </span>
          </div>
          <div className="relative w-full h-3 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FF6B4A] to-[#F97316]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[#6B7280]">
            Il reste {remainingCapacity.toFixed(2)} kg pour atteindre la capacite maximale.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280]">
              <Users className="w-4 h-4 text-[#FF6B4A]" />
              Votre part
            </div>
            <p className="text-xl font-semibold text-[#1F2937]">{participantWeight.toFixed(2)} kg</p>
            <p className="text-xs text-[#9CA3AF]">Votre achat participe a la mutualisation.</p>
          </div>
          <div className="rounded-2xl border border-[#FFE0D1] bg-[#FFF7ED] p-4 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase text-[#B45309]">
              <Sparkles className="w-4 h-4" />
              Gain potentiel
            </div>
            <p className="text-xl font-semibold text-[#1F2937]">{formatPrice(potentialGain)}</p>
            <p className="text-xs text-[#B45309]">Estime si la commande atteint le poids max.</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase text-[#6B7280]">
              <Sparkles className="w-4 h-4 text-[#FF6B4A]" />
              Logistique estimee
            </div>
            <p className="text-xl font-semibold text-[#1F2937]">{formatPrice(logisticsCost)}</p>
            <p className="text-xs text-[#9CA3AF]">
              Cout partage par kg: {formatPrice(costPerKgNow)} maintenant.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-[#F9FAFB] p-4 text-sm text-[#6B7280]">
          Votre gain de cooperation correspond a la baisse de cout logistique par kg entre le niveau actuel et le
          poids maximal, applique a votre part. Partagez la commande pour activer ce gain.
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onShare}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#FF6B4A] text-white font-semibold px-4 py-3 shadow-sm hover:bg-[#FF5A39] transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Partager la commande
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 text-[#1F2937] px-4 py-3 bg-white hover:border-[#FF6B4A] transition-colors"
          >
            Retour aux commandes
          </button>
        </div>
      </div>
    </div>
  );
}
