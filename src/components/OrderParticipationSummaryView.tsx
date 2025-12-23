import React from 'react';
import { ArrowLeft, CalendarClock, MapPin, ReceiptText, Scale, ShoppingCart } from 'lucide-react';
import type { GroupOrder, OrderPurchaseDraft } from '../types';

interface OrderParticipationSummaryViewProps {
  order: GroupOrder;
  draft: OrderPurchaseDraft;
  onBack: () => void;
  onProceedToPayment: () => void;
}

function formatPrice(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function labelForDay(day: string) {
  const map: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  };
  return map[day] ?? day;
}

function getProductWeightKg(product: GroupOrder['products'][number]) {
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

export function OrderParticipationSummaryView({
  order,
  draft,
  onBack,
  onProceedToPayment,
}: OrderParticipationSummaryViewProps) {
  const items = React.useMemo(() => {
    return order.products
      .map((product) => {
        const quantity = draft.quantities[product.id] ?? 0;
        if (quantity <= 0) return null;
        const lineTotal = product.price * quantity;
        const weight = getProductWeightKg(product) * quantity;
        return { product, quantity, lineTotal, weight };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [draft.quantities, order.products]);

  const totalItems = React.useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const totalWeightAfter = draft.baseOrderedWeight + draft.weight;
  const remainingCapacity = Math.max(order.maxWeight - totalWeightAfter, 0);
  const pickupAddress =
    order.pickupAddress ||
    [order.pickupStreet, [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ') ||
    [order.pickupPostcode, order.pickupCity].filter(Boolean).join(' ') ||
    'Lieu precis communique apres paiement';
  const pickupLine = order.pickupSlots?.length
    ? order.pickupSlots
        .map((slot) => `${labelForDay(slot.label ?? slot.day)} ${slot.start ?? ''}-${slot.end ?? ''}`)
        .join(' / ')
    : order.message || 'Voir message de retrait';
  const deadlineDate = order.deadline instanceof Date ? order.deadline : new Date(order.deadline);

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 bg-white text-[#1F2937] shadow-sm hover:border-[#FF6B4A] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour a la selection
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-[#B45309] bg-[#FFF1E6] px-3 py-1 rounded-full">
            Etape 1/3
          </span>
          <h2 className="text-2xl md:text-3xl font-semibold text-[#1F2937]">Verifier votre participation</h2>
          <p className="text-sm text-[#6B7280]">
            Resume des produits choisis avant de passer au paiement.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FFE0D1] bg-white px-4 py-2 text-sm font-semibold text-[#FF6B4A]">
          <ReceiptText className="w-4 h-4" />
          {order.title}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1F2937]">Votre selection</h3>
              <span className="text-xs text-[#6B7280]">{totalItems} carte{totalItems > 1 ? 's' : ''}</span>
            </div>
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-sm text-[#6B7280] text-center">
                Aucune selection en cours.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.product.id} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-none last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#1F2937]">{item.product.name}</p>
                      <p className="text-xs text-[#6B7280]">
                        x{item.quantity} - {formatPrice(item.product.price)} / {item.product.unit}
                      </p>
                      <p className="text-xs text-[#9CA3AF]">Poids estime: {item.weight.toFixed(2)} kg</p>
                    </div>
                    <span className="text-sm font-semibold text-[#1F2937]">{formatPrice(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
              <MapPin className="w-4 h-4 text-[#FF6B4A]" />
              Retrait
            </div>
            <p className="text-sm font-semibold text-[#1F2937]">{pickupLine}</p>
            <p className="text-sm text-[#6B7280]">{pickupAddress}</p>
            <div className="flex items-center gap-2 text-xs text-[#6B7280]">
              <CalendarClock className="w-4 h-4 text-[#FF6B4A]" />
              Cloture: {deadlineDate.toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
              <Scale className="w-4 h-4 text-[#FF6B4A]" />
              Resume
            </div>
            <div className="space-y-2 text-sm text-[#6B7280]">
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span className="font-semibold text-[#1F2937]">{formatPrice(draft.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Poids selectionne</span>
                <span className="font-semibold text-[#1F2937]">{draft.weight.toFixed(2)} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Poids actuel</span>
                <span className="font-semibold text-[#1F2937]">{totalWeightAfter.toFixed(2)} kg</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Capacite restante</span>
                <span className="font-semibold text-[#1F2937]">{remainingCapacity.toFixed(2)} kg</span>
              </div>
            </div>
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={onProceedToPayment}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#FF6B4A] text-white font-semibold px-4 py-3 shadow-sm hover:bg-[#FF5A39] transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                Continuer vers paiement
              </button>
              <button
                type="button"
                onClick={onBack}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 text-[#1F2937] px-4 py-3 bg-white hover:border-[#FF6B4A] transition-colors"
              >
                Modifier la selection
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#FFDCC4] bg-[#FFF7ED] p-4 text-xs text-[#9A3412] space-y-2">
            <p className="font-semibold text-[#B45309]">Paiement provisoire</p>
            <p>
              Cette etape sert de transition avant l'integration de la solution de paiement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
