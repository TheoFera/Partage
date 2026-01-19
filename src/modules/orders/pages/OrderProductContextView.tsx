import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Package, Percent, Users } from 'lucide-react';
import { formatEurosFromCents } from '../lib/money';
import { getOrderFullByCode } from '../services/orders';
import { getLotByCode } from '../data/productsProvider';
import { ImageWithFallback } from './figma/ImageWithFallback';
import type { OrderFull } from '../types/orders';

type RouteParams = {
  productSlug: string;
  lotCode: string;
  orderCode: string;
};

type LotData = NonNullable<Awaited<ReturnType<typeof getLotByCode>>>;

export function OrderProductContextView() {
  const { productSlug, lotCode, orderCode } = useParams<RouteParams>();
  const [orderFull, setOrderFull] = React.useState<OrderFull | null>(null);
  const [lotData, setLotData] = React.useState<LotData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orderCode || !lotCode) {
      setError('Parametres manquants pour charger la page.');
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    setError(null);
    Promise.all([getOrderFullByCode(orderCode), getLotByCode(lotCode)])
      .then(([orderResult, lotResult]) => {
        if (!active) return;
        if (!lotResult) {
          setError('Lot introuvable.');
          return;
        }
        setOrderFull(orderResult);
        setLotData(lotResult);
      })
      .catch((loadError) => {
        console.error('Order product context load error:', loadError);
        if (!active) return;
        setError('Impossible de charger le contexte de commande.');
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lotCode, orderCode]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        Chargement du contexte de commande...
      </div>
    );
  }

  if (error || !orderFull || !lotData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-[#6B7280]">
        {error ?? 'Contexte introuvable.'}
      </div>
    );
  }

  const order = orderFull.order;
  const lot =
    lotData.detail.productions?.find((entry) => entry.id === lotCode) ?? null;
  const productDbId = lotData.product.dbId ?? null;
  const orderProduct = productDbId
    ? orderFull.productsOffered.find((entry) => entry.productId === productDbId) ?? null
    : null;
  const productInfo = orderProduct?.product ?? null;
  const sharerParticipant = orderFull.participants.find((participant) => participant.role === 'sharer');
  const sharerName = sharerParticipant?.profileName ?? 'Partageur';
  const producerName = productInfo?.producerName ?? lotData.product.producerName ?? 'Producteur';
  const productName = productInfo?.name ?? lotData.product.name ?? productSlug ?? 'Produit';
  const productUnit = orderProduct?.unitLabel ?? productInfo?.packaging ?? lotData.product.unit ?? '';
  const unitWeightLabel =
    typeof orderProduct?.unitWeightKg === 'number' && orderProduct.unitWeightKg > 0
      ? `${orderProduct.unitWeightKg.toFixed(2)} kg`
      : typeof lotData.product.weightKg === 'number'
        ? `${lotData.product.weightKg.toFixed(2)} kg`
        : null;

  const breakdownRows = [
    { label: 'Base producteur', value: orderProduct?.unitBasePriceCents ?? 0 },
    { label: 'Livraison', value: orderProduct?.unitDeliveryCents ?? 0 },
    { label: 'Partageur', value: orderProduct?.unitSharerFeeCents ?? 0 },
    { label: 'Prix final', value: orderProduct?.unitFinalPriceCents ?? 0, highlight: true },
  ];

  const lotDetails = [
    { label: 'Code lot', value: lotCode ?? '-' },
    { label: 'Statut', value: lot?.statut ?? 'indisponible' },
    { label: 'DLC / DDM', value: lot?.DLC_DDM ?? lot?.DLC_aReceptionEstimee ?? '-' },
    { label: 'Debut dispo', value: lot?.debut ?? '-' },
    { label: 'Fin dispo', value: lot?.fin ?? '-' },
  ];

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          to={`/cmd/${order.orderCode}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#FF6B4A] hover:text-[#FF5A39]"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour a la commande
        </Link>
        <div className="text-xs text-[#6B7280]">Commande {order.orderCode}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-44 h-44 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
              <ImageWithFallback
                src={productInfo?.imageUrl ?? lotData.product.imageUrl}
                alt={productName}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
                <Package className="w-4 h-4 text-[#FF6B4A]" />
                Produit dans la commande
              </div>
              <h1 className="text-2xl text-[#111827] font-semibold">{productName}</h1>
              <div className="text-sm text-[#6B7280] space-y-1">
                <p>Conditionnement: {productUnit || 'A definir'}</p>
                {unitWeightLabel ? <p>Poids unitaire: {unitWeightLabel}</p> : null}
              </div>
              {orderProduct ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1E6] text-[#B45309] px-3 py-1 text-xs font-semibold">
                  Prix commande: {formatEurosFromCents(orderProduct.unitFinalPriceCents)}
                </div>
              ) : (
                <div className="text-xs text-[#B91C1C]">
                  Ce produit ne fait pas partie des offres de cette commande.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-[#F9FAFB] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
              <Users className="w-4 h-4 text-[#FF6B4A]" />
              Parcours
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#111827] font-semibold">
              <span>{producerName}</span>
              <span className="text-[#9CA3AF]">→</span>
              <span>{sharerName}</span>
            </div>
            <div className="text-xs text-[#6B7280]">
              Producteur: {order.producerProfileId} · Partageur: {order.sharerProfileId}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
              <Percent className="w-4 h-4 text-[#FF6B4A]" />
              Repartition du prix
            </div>
            <div className="space-y-2">
              {breakdownRows.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    row.highlight ? 'bg-[#FFF1E6] text-[#B45309] font-semibold' : 'bg-[#F9FAFB] text-[#111827]'
                  }`}
                >
                  <span>{row.label}</span>
                  <span>{formatEurosFromCents(row.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#6B7280]">
              <MapPin className="w-4 h-4 text-[#FF6B4A]" />
              Infos lot
            </div>
            <div className="space-y-2 text-sm text-[#111827]">
              {lotDetails.map((detail) => (
                <div key={detail.label} className="flex items-center justify-between">
                  <span className="text-[#6B7280]">{detail.label}</span>
                  <span className="font-semibold">{detail.value}</span>
                </div>
              ))}
            </div>
            {lot?.commentaire ? (
              <div className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-xl p-3">{lot.commentaire}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
