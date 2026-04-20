import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eurosToCents } from '../../../shared/lib/money';
import type {
  DbLot,
  DbLotLabel,
  DbLotPriceBreakdown,
  Product,
  ProductionLot,
  RepartitionPoste,
} from '../../../shared/types';
import { mapDbLotToProductionLot, persistProductionLot } from '../../products/utils/lots';
import { fetchLotBreakdown, saveProducerLotBreakdown } from '../../products/utils/pricing';
import type { ProducerLotsPlanningLot } from '../utils/lotsPlanning';

type PlanningProductLots = {
  product: Product;
  productDbId: string | null;
  lots: Omit<ProducerLotsPlanningLot, 'laneIndex'>[];
};

type SavePlanningLotParams = {
  productId: string;
  lot: ProductionLot;
  mode: 'create' | 'edit';
};

type EnsureLotOrderUsageParams = {
  lotId: string;
  lotDbId?: string | null;
};

type DeletePlanningLotParams = {
  productId: string;
  lot: ProductionLot;
};

type UseProducerLotsPlanningParams = {
  enabled: boolean;
  products: Product[];
  supabaseClient?: SupabaseClient | null;
  onRefreshProducts?: () => Promise<void> | void;
};

const resolveLatestLotPriceCents = (lots: Omit<ProducerLotsPlanningLot, 'laneIndex'>[], fallbackPriceEuros: number) => {
  const fallbackPriceCents = Math.max(0, eurosToCents(fallbackPriceEuros || 0));
  if (!lots.length) return fallbackPriceCents;
  const latest = lots
    .slice()
    .sort((a, b) => {
      const aStart = Date.parse(a.startDate || '');
      const bStart = Date.parse(b.startDate || '');
      return (Number.isFinite(bStart) ? bStart : 0) - (Number.isFinite(aStart) ? aStart : 0);
    })[0];
  return typeof latest?.priceCents === 'number' ? latest.priceCents : fallbackPriceCents;
};

const resolveLatestPlanningLot = (lots: Omit<ProducerLotsPlanningLot, 'laneIndex'>[]) => {
  if (!lots.length) return null;
  return lots
    .slice()
    .sort((a, b) => {
      const aStart = Date.parse(a.startDate || '');
      const bStart = Date.parse(b.startDate || '');
      return (Number.isFinite(bStart) ? bStart : 0) - (Number.isFinite(aStart) ? aStart : 0);
    })[0] ?? null;
};

const mapBreakdownRowsToPosts = (rows: DbLotPriceBreakdown[]): RepartitionPoste[] =>
  rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => ({
      id: entry.id,
      lotId: entry.lot_id,
      partiePrenante: entry.stakeholder ?? undefined,
      stakeholderKey: entry.stakeholder_key ?? undefined,
      platformCostCode: entry.platform_cost_code ?? undefined,
      source: entry.source ?? 'producer',
      nom: entry.label,
      valeur: (entry.value_cents ?? 0) / 100,
      type: 'eur',
      sortOrder: entry.sort_order,
    }));

const resolveBreakdownPriceCents = (rows: DbLotPriceBreakdown[]) => {
  const producerRows = rows.filter((row) => row.source !== 'platform');
  if (!producerRows.length) return null;
  return producerRows.reduce((total, row) => total + Math.max(0, row.value_cents ?? 0), 0);
};

export function useProducerLotsPlanning({
  enabled,
  products,
  supabaseClient,
  onRefreshProducts,
}: UseProducerLotsPlanningParams) {
  const [items, setItems] = React.useState<PlanningProductLots[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savingLotId, setSavingLotId] = React.useState<string | null>(null);
  const [deletingLotId, setDeletingLotId] = React.useState<string | null>(null);
  const [lotOrderUsageByLotId, setLotOrderUsageByLotId] = React.useState<Record<string, boolean>>({});

  const load = React.useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!supabaseClient) {
      setItems(products.map((product) => ({ product, productDbId: product.dbId ?? null, lots: [] })));
      setError('Supabase non configure.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dbIdByProductId = new Map<string, string | null>();
      const missingProductCodes: string[] = [];

      products.forEach((product) => {
        const productDbId = product.dbId?.trim() || null;
        if (productDbId) {
          dbIdByProductId.set(product.id, productDbId);
          return;
        }
        dbIdByProductId.set(product.id, null);
        const productCode = product.productCode?.trim() || product.id?.trim();
        if (productCode) missingProductCodes.push(productCode);
      });

      if (missingProductCodes.length) {
        const { data: productRows, error: productLookupError } = await supabaseClient
          .from('products')
          .select('id, product_code')
          .in('product_code', Array.from(new Set(missingProductCodes)));
        if (productLookupError) throw productLookupError;
        const resolvedByCode = new Map<string, string>();
        ((productRows as Array<{ id: string; product_code: string }>) ?? []).forEach((row) => {
          if (row.product_code?.trim()) resolvedByCode.set(row.product_code.trim(), row.id);
        });
        products.forEach((product) => {
          if (dbIdByProductId.get(product.id)) return;
          const productCode = product.productCode?.trim() || product.id?.trim();
          if (!productCode) return;
          dbIdByProductId.set(product.id, resolvedByCode.get(productCode) ?? null);
        });
      }

      const productDbIds = Array.from(new Set(Array.from(dbIdByProductId.values()).filter(Boolean) as string[]));
      const lotsByProductDbId = new Map<string, DbLot[]>();
      if (productDbIds.length) {
        const { data: lotsData, error: lotsError } = await supabaseClient
          .from('lots')
          .select(
            'id, lot_code, lot_reference, product_id, status, price_cents, stock_units, stock_kg, lot_comment, produced_at, dlc, ddm, notes, metadata, created_at, updated_at'
          )
          .in('product_id', productDbIds);
        if (lotsError) throw lotsError;
        ((lotsData as DbLot[]) ?? []).forEach((lot) => {
          const current = lotsByProductDbId.get(lot.product_id) ?? [];
          current.push(lot);
          lotsByProductDbId.set(lot.product_id, current);
        });
      }

      setItems(
        products.map((product) => {
          const productDbId = dbIdByProductId.get(product.id) ?? null;
          const dbLots = productDbId ? lotsByProductDbId.get(productDbId) ?? [] : [];
          return {
            product,
            productDbId,
            lots: dbLots.map((dbLot) => {
              const lot = mapDbLotToProductionLot(dbLot, product.measurement);
              return {
                productId: product.id,
                productDbId,
                product,
                lot,
                lotDbId: dbLot.id,
                priceCents: dbLot.price_cents,
                startDate: lot.periodeDisponibilite?.debut || lot.debut,
                endDate: lot.periodeDisponibilite?.fin || lot.fin,
              };
            }),
          };
        })
      );
    } catch (loadError) {
      console.error('Producer lots planning load error:', loadError);
      setItems(products.map((product) => ({ product, productDbId: product.dbId ?? null, lots: [] })));
      setError('Impossible de charger les lots.');
    } finally {
      setLoading(false);
    }
  }, [enabled, products, supabaseClient]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const ensureLotOrderUsage = React.useCallback(
    async ({ lotId, lotDbId }: EnsureLotOrderUsageParams) => {
      if (lotOrderUsageByLotId[lotId] !== undefined) {
        return lotOrderUsageByLotId[lotId];
      }
      if (!supabaseClient || !lotDbId) {
        setLotOrderUsageByLotId((previousState) =>
          previousState[lotId] !== undefined ? previousState : { ...previousState, [lotId]: false }
        );
        return false;
      }

      const { data, error: orderItemsError } = await supabaseClient
        .from('order_items')
        .select('id')
        .eq('lot_id', lotDbId)
        .limit(1);
      if (orderItemsError) throw orderItemsError;
      const hasOrders = Boolean(data?.length);
      setLotOrderUsageByLotId((previousState) => ({ ...previousState, [lotId]: hasOrders }));
      return hasOrders;
    },
    [lotOrderUsageByLotId, supabaseClient]
  );

  const saveLot = React.useCallback(
    async ({ productId, lot, mode }: SavePlanningLotParams) => {
      if (!supabaseClient) {
        throw new Error('Supabase non configure.');
      }

      const targetItem = items.find((item) => item.product.id === productId);
      if (!targetItem?.productDbId) {
        throw new Error('Produit introuvable.');
      }

      const referenceLot = mode === 'create' ? resolveLatestPlanningLot(targetItem.lots) : null;
      const fallbackPriceCents = resolveLatestLotPriceCents(targetItem.lots, targetItem.product.price);
      let priceCents = fallbackPriceCents;
      let referenceLotLabels: DbLotLabel[] = [];
      let referenceLotBreakdownRows: DbLotPriceBreakdown[] = [];

      if (mode === 'create' && referenceLot?.lotDbId) {
        const [{ data: labelsData, error: labelsError }, breakdownRows] = await Promise.all([
          supabaseClient.from('lot_labels').select('*').eq('lot_id', referenceLot.lotDbId),
          fetchLotBreakdown(supabaseClient, referenceLot.lotDbId),
        ]);
        if (labelsError) throw labelsError;
        referenceLotLabels = (labelsData as DbLotLabel[]) ?? [];
        referenceLotBreakdownRows = breakdownRows;
        const breakdownPriceCents = resolveBreakdownPriceCents(referenceLotBreakdownRows);
        if (typeof breakdownPriceCents === 'number') {
          priceCents = breakdownPriceCents;
        }
      }

      setSavingLotId(lot.id);
      try {
        const { lot: persistedLot } = await persistProductionLot({
          client: supabaseClient,
          productDbId: targetItem.productDbId,
          lot,
          measurement: targetItem.product.measurement,
          priceCents,
          mode,
        });

        if (mode === 'create' && persistedLot.lotDbId) {
          const cleanedLabels = referenceLotLabels
            .map((label) => ({
              product_id: targetItem.productDbId,
              lot_id: persistedLot.lotDbId,
              label: label.label,
              description: label.description,
              label_type: label.label_type,
              obtained_year: label.obtained_year ?? null,
            }))
            .filter((label) => label.label.trim().length);

          if (cleanedLabels.length) {
            const { error: insertLabelsError } = await supabaseClient.from('lot_labels').insert(cleanedLabels);
            if (insertLabelsError) throw insertLabelsError;
          }

          if (referenceLotBreakdownRows.length) {
            await saveProducerLotBreakdown(
              supabaseClient,
              persistedLot.lotDbId,
              mapBreakdownRowsToPosts(referenceLotBreakdownRows),
              {
                defaultStakeholder: 'Producteur',
                defaultStakeholderKey: 'producer',
              }
            );
          }
        }

        setItems((previousItems) =>
          previousItems.map((item) => {
            if (item.product.id !== productId) return item;
            const nextLotItem: Omit<ProducerLotsPlanningLot, 'laneIndex'> = {
              productId: item.product.id,
              productDbId: item.productDbId,
              product: item.product,
              lot: persistedLot,
              lotDbId: persistedLot.lotDbId ?? null,
              priceCents,
              startDate: persistedLot.periodeDisponibilite?.debut || persistedLot.debut,
              endDate: persistedLot.periodeDisponibilite?.fin || persistedLot.fin,
            };
            if (mode === 'edit') {
              return {
                ...item,
                lots: item.lots.map((existingLot) =>
                  existingLot.lot.id === lot.id || existingLot.lotDbId === lot.lotDbId ? nextLotItem : existingLot
                ),
              };
            }
            return {
              ...item,
              lots: [...item.lots, nextLotItem],
            };
          })
        );

        await Promise.resolve(onRefreshProducts?.());
        return persistedLot;
      } finally {
        setSavingLotId(null);
      }
    },
    [items, onRefreshProducts, supabaseClient]
  );

  const deleteLot = React.useCallback(
    async ({ productId, lot }: DeletePlanningLotParams) => {
      const targetItem = items.find((item) => item.product.id === productId);
      if (!targetItem) {
        throw new Error('Produit introuvable.');
      }

      const lotId = lot.id;
      const lotDbId = lot.lotDbId ?? null;
      const removeLocalLot = () => {
        setItems((previousItems) =>
          previousItems.map((item) =>
            item.product.id !== productId
              ? item
              : {
                  ...item,
                  lots: item.lots.filter((existingLot) => existingLot.lot.id !== lotId),
                }
          )
        );
        setLotOrderUsageByLotId((previousState) => {
          if (previousState[lotId] === undefined) return previousState;
          const nextState = { ...previousState };
          delete nextState[lotId];
          return nextState;
        });
      };

      if (!lotDbId) {
        removeLocalLot();
        await Promise.resolve(onRefreshProducts?.());
        return;
      }

      if (!supabaseClient) {
        throw new Error('Supabase non configure.');
      }

      setDeletingLotId(lotId);
      try {
        const hasOrders = await ensureLotOrderUsage({ lotId, lotDbId });
        if (hasOrders) {
          throw new Error('Ce lot est déjà utilisé dans une commande.');
        }

        const deleteForLot = async (table: string) => {
          const { error: deleteError } = await supabaseClient.from(table).delete().eq('lot_id', lotDbId);
          if (deleteError) throw deleteError;
        };

        await deleteForLot('lot_labels');
        await deleteForLot('lot_price_breakdown');
        await deleteForLot('lot_trace_steps');
        await deleteForLot('lot_inputs');

        const { error: deleteLotError } = await supabaseClient.from('lots').delete().eq('id', lotDbId);
        if (deleteLotError) throw deleteLotError;

        removeLocalLot();
        await Promise.resolve(onRefreshProducts?.());
      } finally {
        setDeletingLotId(null);
      }
    },
    [ensureLotOrderUsage, items, onRefreshProducts, supabaseClient]
  );

  return {
    items,
    loading,
    error,
    savingLotId,
    deletingLotId,
    lotOrderUsageByLotId,
    ensureLotOrderUsage,
    reload: load,
    saveLot,
    deleteLot,
  };
}
