import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eurosToCents } from '../../../shared/lib/money';
import type { DbLot, Product, ProductionLot } from '../../../shared/types';
import { mapDbLotToProductionLot, persistProductionLot } from '../../products/utils/lots';
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

  const saveLot = React.useCallback(
    async ({ productId, lot, mode }: SavePlanningLotParams) => {
      if (!supabaseClient) {
        throw new Error('Supabase non configure.');
      }

      const targetItem = items.find((item) => item.product.id === productId);
      if (!targetItem?.productDbId) {
        throw new Error('Produit introuvable.');
      }

      const priceCents = resolveLatestLotPriceCents(targetItem.lots, targetItem.product.price);
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

  return {
    items,
    loading,
    error,
    savingLotId,
    reload: load,
    saveLot,
  };
}
