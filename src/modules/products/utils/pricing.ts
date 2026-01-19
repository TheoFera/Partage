import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbLot, DbLotPriceBreakdown, RepartitionPoste } from '../types';
import { eurosToCents } from './money';

export const fetchLotByLotCode = async (
  client: SupabaseClient,
  lotCode: string
): Promise<DbLot | null> => {
  if (!lotCode) return null;
  const { data, error } = await client.from('lots').select('*').eq('lot_code', lotCode).maybeSingle();
  if (error) throw error;
  return (data as DbLot) ?? null;
};

export const fetchLotBreakdown = async (
  client: SupabaseClient,
  lotId: string
): Promise<DbLotPriceBreakdown[]> => {
  if (!lotId) return [];
  const { data, error } = await client
    .from('lot_price_breakdown')
    .select('*')
    .eq('lot_id', lotId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as DbLotPriceBreakdown[]) ?? [];
};

export const saveProducerLotBreakdown = async (
  client: SupabaseClient,
  lotId: string,
  draftLines: RepartitionPoste[],
  options?: { defaultStakeholder?: string; defaultStakeholderKey?: string }
): Promise<{ breakdown: DbLotPriceBreakdown[]; lot: DbLot | null }> => {
  const defaultStakeholder = options?.defaultStakeholder ?? 'Producteur';
  const defaultStakeholderKey = options?.defaultStakeholderKey ?? 'producer';
  const producerLines = draftLines.filter((line) => line.source !== 'platform');

  const { data: existingRows, error: existingError } = await client
    .from('lot_price_breakdown')
    .select('id')
    .eq('lot_id', lotId)
    .eq('source', 'producer');
  if (existingError) throw existingError;
  const existingIds = new Set(((existingRows as Array<{ id: string }>) ?? []).map((row) => row.id));

  const existingSortOrders = producerLines
    .map((line) => (Number.isFinite(line.sortOrder) ? (line.sortOrder as number) : null))
    .filter((value): value is number => value !== null);
  let nextSortOrder = existingSortOrders.length ? Math.max(...existingSortOrders) + 1 : 0;

  const mapped = producerLines
    .map((line) => {
      const label = line.nom.trim();
      if (!label) return null;
      const sortOrder =
        Number.isFinite(line.sortOrder) ? (line.sortOrder as number) : nextSortOrder++;
      const stakeholder = line.partiePrenante?.trim() || defaultStakeholder;
      const payload: {
        id?: string;
        lot_id: string;
        label: string;
        value_type: 'cents';
        value_cents: number;
        sort_order: number;
        source: 'producer';
        stakeholder: string;
        stakeholder_key: string;
        platform_cost_code: null;
      } = {
        lot_id: lotId,
        label,
        value_type: 'cents',
        value_cents: eurosToCents(line.valeur),
        sort_order: sortOrder,
        source: 'producer',
        stakeholder,
        stakeholder_key: line.stakeholderKey?.trim() || defaultStakeholderKey,
        platform_cost_code: null,
      };
      if (line.id) payload.id = line.id;
      return payload;
    })
    .filter(Boolean) as Array<{
      id?: string;
      lot_id: string;
      label: string;
      value_type: 'cents';
      value_cents: number;
      sort_order: number;
      source: 'producer';
      stakeholder: string;
      stakeholder_key: string;
      platform_cost_code: null;
    }>;

  const draftIds = new Set(mapped.map((line) => line.id).filter(Boolean) as string[]);
  const toDelete = Array.from(existingIds).filter((id) => !draftIds.has(id));

  if (mapped.length) {
    const { error: upsertError } = await client
      .from('lot_price_breakdown')
      .upsert(mapped, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  if (toDelete.length) {
    const { error: deleteError } = await client.from('lot_price_breakdown').delete().in('id', toDelete);
    if (deleteError) throw deleteError;
  }

  const [breakdown, lotResult] = await Promise.all([
    fetchLotBreakdown(client, lotId),
    client.from('lots').select('*').eq('id', lotId).maybeSingle(),
  ]);
  if (lotResult.error) throw lotResult.error;

  return {
    breakdown,
    lot: (lotResult.data as DbLot) ?? null,
  };
};
