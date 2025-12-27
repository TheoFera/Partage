import React from 'react';
import { DeckCard } from '../types';
import { Calendar, MapPin, Package, Percent, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD_WIDTH, CARD_HEIGHT, CARD_GAP, MIN_VISIBLE_CARDS, CONTAINER_SIDE_PADDING } from '../constants/cards';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface CreateOrderFormProps {
  products: DeckCard[];
  onCreateOrder: (order: any) => void;
  preselectedProductIds?: string[];
  onCancel?: () => void;
}

type PickupSlot = {
  day: string;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
};

const defaultSlots: PickupSlot[] = [
  { day: 'monday', label: 'Lundi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'tuesday', label: 'Mardi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'wednesday', label: 'Mercredi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'thursday', label: 'Jeudi', enabled: false, start: '17:00', end: '19:00' },
  { day: 'friday', label: 'Vendredi', enabled: true, start: '17:30', end: '19:30' },
  { day: 'saturday', label: 'Samedi', enabled: true, start: '10:00', end: '12:00' },
  { day: 'sunday', label: 'Dimanche', enabled: false, start: '10:00', end: '12:00' },
];

export function CreateOrderForm({ products, onCreateOrder, preselectedProductIds, onCancel }: CreateOrderFormProps) {
  const [selectedProducts, setSelectedProducts] = React.useState<string[]>(preselectedProductIds ?? []);
  const [title, setTitle] = React.useState('');
  const [visibility, setVisibility] = React.useState<'public' | 'private'>('public');
  const [sharerPercentage, setSharerPercentage] = React.useState(10);
  const [minWeight, setMinWeight] = React.useState(5);
  const [maxWeight, setMaxWeight] = React.useState(20);
  const [deadline, setDeadline] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [pickupStreet, setPickupStreet] = React.useState('');
  const [pickupCity, setPickupCity] = React.useState('');
  const [pickupPostcode, setPickupPostcode] = React.useState('');
  const [pickupSlots, setPickupSlots] = React.useState<PickupSlot[]>(defaultSlots);

  const shareFraction = Math.min(Math.max(sharerPercentage / 100, 0), 0.8);

  const selectedProductsData = products.filter((p) => selectedProducts.includes(p.id));
  const totalWeightProducts = selectedProductsData.reduce((sum, p) => sum + (p.weightKg ?? 1), 0);
  const safeMinWeight = Math.max(0, minWeight);
  const effectiveWeight = Math.max(totalWeightProducts, safeMinWeight);
  const safeMaxWeight = Math.max(0, maxWeight);
  const completeWeight =
    safeMaxWeight > 0 ? Math.max(safeMaxWeight, totalWeightProducts, safeMinWeight) : effectiveWeight;

  const logisticCostByWeight = (weightKg: number) => {
    if (!weightKg || weightKg <= 0) return 0;
    const raw = 7 + 8 * Math.sqrt(weightKg);
    return Math.max(15, 5 * Math.round(raw / 5));
  };

  const logTotal = effectiveWeight > 0 ? logisticCostByWeight(effectiveWeight) : 0;
  const logPerKg = effectiveWeight > 0 ? logTotal / effectiveWeight : 0;
  const logPerKgComplete = completeWeight > 0 ? logisticCostByWeight(completeWeight) / completeWeight : 0;

  const perProductRows = selectedProductsData.map((p) => {
    const weight = p.weightKg ?? 1;
    const logPerUnit = logPerKg * weight;
    const basePlusLog = p.price + logPerUnit;
    const participantPrice = basePlusLog * (shareFraction > 0 ? 1 / (1 - shareFraction) : 1);
    const sharePerUnit = participantPrice - basePlusLog;
    const logPerUnitComplete = logPerKgComplete * weight;
    const basePlusLogComplete = p.price + logPerUnitComplete;
    const participantPriceComplete =
      basePlusLogComplete * (shareFraction > 0 ? 1 / (1 - shareFraction) : 1);
    const priceType = p.measurement === 'kg' ? 'Au kilo' : 'À la pièce';

    return {
      id: p.id,
      name: p.name,
      basePrice: p.price,
      logPerUnit,
      sharePerUnit,
      participantPrice,
      participantPriceComplete,
      priceType,
    };
  });

  const totalShareBase = perProductRows.reduce((sum, r) => sum + r.sharePerUnit, 0);
  const weightScale = totalWeightProducts > 0 ? effectiveWeight / totalWeightProducts : 1;
  const totalShareEffective = totalShareBase * weightScale;
  const shareMultiplier = shareFraction > 0 ? shareFraction / (1 - shareFraction) : 0;
  const shareRangeWeight = safeMinWeight > 0 ? safeMinWeight : effectiveWeight;
  const pricePerKgCandidates = selectedProductsData
    .map((p) => {
      if (p.measurement === 'kg') return p.price;
      const unitWeight = p.weightKg ?? 1;
      return unitWeight > 0 ? p.price / unitWeight : p.price;
    })
    .filter((price) => Number.isFinite(price) && price > 0);
  const minPricePerKg = pricePerKgCandidates.length > 0 ? Math.min(...pricePerKgCandidates) : 0;
  const maxPricePerKg = pricePerKgCandidates.length > 0 ? Math.max(...pricePerKgCandidates) : 0;
  const logPerKgAtThreshold =
    shareRangeWeight > 0 ? logisticCostByWeight(shareRangeWeight) / shareRangeWeight : 0;
  const minShareAtThreshold =
    shareRangeWeight > 0
      ? (minPricePerKg + logPerKgAtThreshold) * shareMultiplier * shareRangeWeight
      : 0;
  const maxShareAtThreshold =
    shareRangeWeight > 0
      ? (maxPricePerKg + logPerKgAtThreshold) * shareMultiplier * shareRangeWeight
      : 0;
  const summaryRows = [
    {
      key: 'priceType',
      label: 'Type prix',
      className: 'is-center',
      render: (row: (typeof perProductRows)[number]) => row.priceType,
    },
    {
      key: 'basePrice',
      label: 'Prix de base',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) => `${row.basePrice.toFixed(2)} €`,
    },
    {
      key: 'logPerUnit',
      label: 'Livraison',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) => `${row.logPerUnit.toFixed(2)} €`,
    },
    {
      key: 'sharePerUnit',
      label: 'Partageur',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) => `${row.sharePerUnit.toFixed(2)} €`,
    },
    {
      key: 'participantPrice',
      label: 'Prix final au seuil minimum',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) => `${row.participantPrice.toFixed(2)} €`,
    },
    {
      key: 'participantPriceComplete',
      label: 'Prix final si commande complète',
      className: 'is-right',
      render: (row: (typeof perProductRows)[number]) => `${row.participantPriceComplete.toFixed(2)} €`,
    },
  ];

  const groupedByProducer = products.reduce((acc, card) => {
    const producerId = card.producerId;
    if (!acc[producerId]) {
      acc[producerId] = {
        producerName: card.producerName,
        products: [],
      };
    }
    acc[producerId].products.push(card);
    return acc;
  }, {} as Record<string, { producerName: string; products: DeckCard[] }>);

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  React.useEffect(() => {
    if (preselectedProductIds && preselectedProductIds.length > 0) {
      setSelectedProducts((prev) => {
        const validPrev = prev.filter((id) => products.some((p) => p.id === id));
        const next = [...preselectedProductIds, ...validPrev];
        return Array.from(new Set(next));
      });
    } else {
      setSelectedProducts((prev) => prev.filter((id) => products.some((p) => p.id === id)));
    }
  }, [preselectedProductIds, products]);

  const toggleSlot = (day: string) => {
    setPickupSlots((prev) => prev.map((slot) => (slot.day === day ? { ...slot, enabled: !slot.enabled } : slot)));
  };

  const updateSlotTime = (day: string, key: 'start' | 'end', value: string) => {
    setPickupSlots((prev) => prev.map((slot) => (slot.day === day ? { ...slot, [key]: value } : slot)));
  };

  const selectionCardWidth = CARD_WIDTH;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProducts.length === 0) {
      alert('Veuillez sélectionner au moins un produit');
      return;
    }

    const activeSlots = pickupSlots
      .filter((slot) => slot.enabled)
      .map((slot) => ({ day: slot.day, label: slot.label, start: slot.start, end: slot.end }));

    const pickupAddress = [pickupStreet, [pickupPostcode, pickupCity].filter(Boolean).join(' ') || undefined]
      .filter(Boolean)
      .join(', ');

    onCreateOrder({
      title,
      products: selectedProductsData,
      visibility,
      sharerPercentage,
      minWeight,
      maxWeight,
      deadline: deadline ? new Date(deadline) : null,
      message,
      pickupStreet,
      pickupCity,
      pickupPostcode,
      pickupAddress,
      pickupSlots: activeSlots,
      totals: {
        baseTotal: perProductRows.reduce((sum, r) => sum + r.basePrice, 0),
        logTotal,
        participantTotal: perProductRows.reduce((sum, r) => sum + r.participantPrice, 0),
        share: totalShareEffective,
        effectiveWeight,
      },
    });
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-24 h-24 rounded-full bg-[#FF6B4A]/20 flex items-center justify-center mb-4">
          <Package className="w-12 h-12 text-[#FF6B4A]" />
        </div>
        <h3 className="text-[#1F2937] mb-2">Votre sélection est vide</h3>
        <p className="text-[#6B7280] text-center max-w-sm">
          Utilisez le bouton "Créer" depuis les pages "Produits".
        </p>
      </div>
    );
  }

  const renderPickupLine = () => {
    const active = pickupSlots.filter((slot) => slot.enabled);
    if (active.length === 0) return 'Non précisé';
    return active
      .map((slot) => `${slot.label} ${slot.start || '??'}-${slot.end || '??'}`)
      .join(' · ');
  };

  return (
    <form onSubmit={handleSubmit} className="pb-6">
      <div className="create-order-layout gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-[#1F2937] mb-4">
              Sélectionnez les produits de {Object.entries(groupedByProducer)[0]?.[1]?.producerName ?? ''} a inclure dans la commande
            </h3>

            <div className="space-y-6">
      {Object.entries(groupedByProducer).map(([producerId, group]) => (
        <div key={producerId} className="space-y-2">
          <p className="text-sm text-[#6B7280]" style={{ fontWeight: 500 }}>
            
          </p>
                  <ProducerProductCarousel
                    products={group.products}
                    selectedProducts={selectedProducts}
                    onToggleSelection={(productId, wasSelected) => {
                      setSelectedProducts((prev) =>
                        wasSelected ? prev.filter((id) => id !== productId) : [...prev, productId]
                      );
                    }}
                    cardWidth={selectionCardWidth}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-[#1F2937] mb-2">Paramètres de la commande</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Nom de la commande</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Foie gras - Quartier centre"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Date de cloture de la commande</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#6B7280] mb-2">Visibilité de la commande</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`flex-1 min-w-[160px] px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                    visibility === 'public'
                      ? 'border-[#28C1A5] bg-[#28C1A5]/10 text-[#0F5132]'
                      : 'border-gray-200 text-[#1F2937] hover:border-[#FFD166]'
                  }`}
                >
                  Commande publique
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`flex-1 min-w-[160px] px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                    visibility === 'private'
                      ? 'border-[#FF6B4A] bg-[#FF6B4A]/10 text-[#B45309]'
                      : 'border-gray-200 text-[#1F2937] hover:border-[#FFD166]'
                  }`}
                >
                  Commande privée
                </button>
              </div>
              <p className="text-xs text-[#6B7280] mt-2">
                Les commandes privées ne sont trouvables que par le lien de la commande.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Part partageur (%)</label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="number"
                    value={sharerPercentage}
                    onChange={(e) => setSharerPercentage(Number(e.target.value))}
                    min="0"
                    max="100"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Poids minimum de la commande</label>
                <input
                  type="number"
                  value={minWeight}
                  onChange={(e) => setMinWeight(Number(e.target.value))}
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Poids maximum de la commande</label>
                <input
                  type="number"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(Number(e.target.value))}
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-sm text-[#6B7280]">Adresse de retrait</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="text"
                    value={pickupStreet}
                    onChange={(e) => setPickupStreet(e.target.value)}
                    placeholder="Ex. 15 Rue de la Republique"
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={pickupCity}
                      onChange={(e) => setPickupCity(e.target.value)}
                      placeholder="Ville"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={pickupPostcode}
                      onChange={(e) => setPickupPostcode(e.target.value)}
                      placeholder="Code postal"
                      pattern="\\d{4,5}"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-[#6B7280]">
                  L&apos;adresse précise n'est communiquée aux participants qu'après paiement.
                </p>
              </div>

              <div>
                <label className="block text-sm text-[#6B7280] mb-2">Message participants</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ex. Retrait chez moi, à l'adresse enregistrée."
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A] resize-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-[#1F2937] text-base font-semibold">Retrait</h3>
                <p className="text-sm text-[#6B7280]">Choisissez les jours et créneaux pour récupérer les commandes.</p>
              </div>
              <div className="text-sm text-[#6B7280]">
                Créneaux actifs : <span className="text-[#FF6B4A] font-semibold">{renderPickupLine()}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                {pickupSlots.map((slot) => (
                  <div key={slot.day} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSlot(slot.day)}
                      className={`px-3 py-1 rounded-full border text-sm ${
                        slot.enabled
                          ? 'border-[#FF6B4A] bg-[#FFF1ED] text-[#FF6B4A]'
                          : 'border-gray-200 text-[#6B7280]'
                      }`}
                    >
                      {slot.label}
                    </button>
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateSlotTime(slot.day, 'start', e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                        disabled={!slot.enabled}
                      />
                      <span>—</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateSlotTime(slot.day, 'end', e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B4A]"
                        disabled={!slot.enabled}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#F9FAFB] rounded-xl border border-gray-200 p-4 text-sm text-[#6B7280] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF6B4A]" />
                  <span>Activez les jours où vous pouvez distribuer la commande.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#28C1A5]" />
                  <span>Précisez une plage horaire par jour pour éviter les confusions.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="create-order-summary">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm w-full">
            <h3 className="text-[#1F2937] mb-4">Récapitulatif</h3>
            {selectedProducts.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Ajoutez des produits pour voir le récapitulatif.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 text-sm text-[#1F2937]">
                  <p>
                    Poids minimum de la commande :{' '}
                    <span style={{ fontWeight: 600 }}>{effectiveWeight.toFixed(2)} kg</span>
                  </p>
                  <p>
                    Coût livraison total : <span style={{ fontWeight: 600 }}>{logTotal.toFixed(2)} €</span>
                  </p>
                  <p>
                    Part partageur : <span style={{ fontWeight: 600 }}>{sharerPercentage}%</span>
                    {' '}(
                    <span style={{ fontWeight: 600 }}>
                      {minShareAtThreshold.toFixed(2)} € jusqu'&agrave; {maxShareAtThreshold.toFixed(2)} €
                    </span>
                    )
                  </p>
                  <p>
                  </p>

                </div>
                <div className="create-order-summary-table-wrapper is-vertical">
                  <table className="create-order-summary-table is-vertical">
                    <thead className="create-order-summary-table-head">
                      <tr className="create-order-summary-table-row">
                        <th className="create-order-summary-table-cell" scope="col">
                          Produit
                        </th>
                        {perProductRows.map((row) => (
                          <th key={row.id} className="create-order-summary-table-cell is-center" scope="col">
                            {row.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((summaryRow) => (
                        <tr key={summaryRow.key} className="create-order-summary-table-row">
                          <th className="create-order-summary-table-cell" scope="row">
                            {summaryRow.label}
                          </th>
                          {perProductRows.map((row) => (
                            <td
                              key={row.id}
                              className={`create-order-summary-table-cell ${summaryRow.className}`.trim()}
                              data-label={row.name}
                            >
                              {summaryRow.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[#6B7280]">
                    Créneaux : {renderPickupLine()}.
                  </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="submit"
          disabled={selectedProducts.length === 0}
          className="w-full sm:flex-1 py-3 bg-[#FF6B4A] text-white rounded-xl hover:bg-[#FF5A39] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-lg"
        >
          Créer la commande
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#1F2937] hover:border-[#FF6B4A] transition-colors"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function ProducerProductCarousel({
  products,
  selectedProducts,
  onToggleSelection,
  cardWidth,
}: {
  products: DeckCard[];
  selectedProducts: string[];
  onToggleSelection: (productId: string, wasSelected: boolean) => void;
  cardWidth: number;
}) {
  const [startIndex, setStartIndex] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(MIN_VISIBLE_CARDS);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const computeVisible = React.useCallback((width: number) => {
    const available = Math.max(0, width - CONTAINER_SIDE_PADDING * 2 + CARD_GAP);
    const perCard = CARD_WIDTH + CARD_GAP;
    return Math.max(MIN_VISIBLE_CARDS, Math.floor(available / perCard) || 0);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width ?? el.clientWidth;
      const next = computeVisible(width);
      setVisibleCount((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [computeVisible]);

  React.useEffect(() => {
    const maxIndex = Math.max(0, products.length - visibleCount);
    setStartIndex((prev) => Math.min(prev, maxIndex));
  }, [products.length, visibleCount]);

  const useCarousel = products.length > visibleCount;
  const maxIndex = Math.max(0, products.length - visibleCount);

  const containerMinWidth =
    MIN_VISIBLE_CARDS * CARD_WIDTH +
    (MIN_VISIBLE_CARDS - 1) * CARD_GAP +
    CONTAINER_SIDE_PADDING * 2;

  const containerStyle: React.CSSProperties = {
    minWidth: `${containerMinWidth}px`,
    width: '100%',
    paddingInline: CONTAINER_SIDE_PADDING,
    position: 'relative',
  };

  const productsToShow = useCarousel
    ? products.slice(startIndex, startIndex + visibleCount)
    : products;

  const canScrollLeft = useCarousel && startIndex > 0;
  const canScrollRight = useCarousel && startIndex < maxIndex;

  const goLeft = () => {
    if (!canScrollLeft) return;
    setStartIndex((prev) => Math.max(prev - 1, 0));
  };

  const goRight = () => {
    if (!canScrollRight) return;
    setStartIndex((prev) => Math.min(prev + 1, maxIndex));
  };

  return (
    <div className="relative" style={containerStyle} ref={containerRef}>
      <div
        className="flex gap-3"
        style={{
          alignItems: 'stretch',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        {productsToShow.map((product) => {
          const isSelected = selectedProducts.includes(product.id);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onToggleSelection(product.id, isSelected)}
              style={{
                width: `${cardWidth}px`,
                minWidth: `${cardWidth}px`,
                flex: `0 0 ${cardWidth}px`,
                minHeight: `${CARD_HEIGHT}px`,
                height: `${CARD_HEIGHT}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                border: '2px solid',
                borderColor: isSelected ? '#FF6B4A' : '#e5e7eb',
                borderRadius: 16,
                background: '#fff',
                boxShadow: isSelected
                  ? '0 14px 30px rgba(255,107,74,0.3)'
                  : '0 12px 26px rgba(17,24,39,0.06)',
                padding: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease',
              }}
            >
              <div style={{ width: '100%', height: '105px', background: '#f3f4f6', flexShrink: 0 }}>
                <ImageWithFallback
                  src={product.imageUrl}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div style={{ padding: '10px 12px', textAlign: 'left', display: 'grid', gap: 6, flex: 1 }}>
                <p style={{ margin: 0, color: '#6B7280', fontSize: 12, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.producerName}
                </p>
                <p style={{ margin: 0, color: '#111827', fontWeight: 700, fontSize: 15, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#FF6B4A', fontWeight: 700, fontSize: 15 }}>
                    {product.price.toFixed(2)} €
                  </span>
                  <span style={{ fontSize: 11, color: '#374151' }}>
                    / {product.measurement === 'kg' ? 'Kg' : 'Unité'} ({product.unit})
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={goLeft}
          aria-label="Défiler vers la gauche"
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border transition"
          style={{
            borderColor: '#FF6B4A',
            background: '#FF6B4A',
            boxShadow: '0 12px 26px rgba(255,107,74,0.35)',
            width: 39,
            height: 39,
          }}
        >
          <ChevronLeft className="text-white mx-auto" style={{ width: 20, height: 20 }} />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={goRight}
          aria-label="Défiler vers la droite"
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border transition"
          style={{
            borderColor: '#FF6B4A',
            background: '#FF6B4A',
            boxShadow: '0 12px 26px rgba(255,107,74,0.35)',
            width: 39,
            height: 39,
          }}
        >
          <ChevronRight className="text-white mx-auto" style={{ width: 20, height: 20 }} />
        </button>
      )}
    </div>
  );
}


