import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbLot, Product, ProductionLot } from '../../../shared/types';
import { formatEurosFromCents } from '../../../shared/lib/money';
import { formatUnitWeightLabel } from './weight';

type ProductMeasurement = Product['measurement'];
type LotStatus = ProductionLot['statut'];
type LotReservationUsageStatus = 'active' | 'consumed';

type DbLotReservationUsageRow = {
  lot_id: string;
  reserved_units: number | null;
  reserved_kg: number | null;
  status: LotReservationUsageStatus;
};

export type LotReservationUsageSummary = {
  activeUnits: number;
  activeKg: number;
  consumedUnits: number;
  consumedKg: number;
};

type PersistProductionLotParams = {
  client: SupabaseClient;
  productDbId: string;
  lot: ProductionLot;
  measurement: ProductMeasurement;
  priceCents: number;
  mode: 'create' | 'edit';
};

export const mapDbLotStatus = (status: DbLot['status']): LotStatus => {
  if (status === 'active') return 'en_cours';
  if (status === 'draft') return 'a_venir';
  if (status === 'sold_out') return 'epuise';
  return 'epuise';
};

const toQuantityNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyLotReservationUsageSummary = (): LotReservationUsageSummary => ({
  activeUnits: 0,
  activeKg: 0,
  consumedUnits: 0,
  consumedKg: 0,
});

const toMetadataQuantityNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const resolveLotQuantitySnapshot = (
  lot: DbLot,
  measurement: ProductMeasurement,
  usage?: LotReservationUsageSummary
) => {
  const remainingQuantity = measurement === 'kg' ? toQuantityNumber(lot.stock_kg) : toQuantityNumber(lot.stock_units);
  const metadata = lot.metadata as Record<string, unknown> | null;
  const metadataTotalQuantity = toMetadataQuantityNumber(metadata?.initial_quantity);
  const activeQuantity = measurement === 'kg' ? usage?.activeKg ?? 0 : usage?.activeUnits ?? 0;
  const consumedQuantity = measurement === 'kg' ? usage?.consumedKg ?? 0 : usage?.consumedUnits ?? 0;
  const derivedTotalQuantity = remainingQuantity + activeQuantity + consumedQuantity;
  const totalQuantity = Math.max(
    remainingQuantity,
    metadataTotalQuantity ?? 0,
    Number.isFinite(derivedTotalQuantity) ? derivedTotalQuantity : 0
  );
  return { metadata, remainingQuantity, totalQuantity };
};

export const mapDbLotToProductionLot = (
  lot: DbLot,
  measurement: ProductMeasurement,
  usage?: LotReservationUsageSummary
): ProductionLot => {
  const { metadata, remainingQuantity, totalQuantity } = resolveLotQuantitySnapshot(lot, measurement, usage);
  // Timeline date mapping uses existing lot fields only:
  // start = metadata.sale_period_start -> produced_at -> created_at
  // end = metadata.sale_period_end
  const salePeriodStart =
    metadata && typeof metadata.sale_period_start === 'string' ? metadata.sale_period_start : null;
  const salePeriodEnd =
    metadata && typeof metadata.sale_period_end === 'string' ? metadata.sale_period_end : null;
  const startDate = salePeriodStart ?? lot.produced_at ?? lot.created_at.slice(0, 10);
  const endDate = salePeriodEnd ?? '';
  return {
    id: lot.lot_code,
    lotDbId: lot.id,
    nomLot: lot.lot_comment || lot.lot_reference || lot.lot_code,
    debut: startDate,
    fin: endDate,
    periodeDisponibilite: { debut: startDate, fin: endDate },
    qteTotale: totalQuantity,
    qteRestante: remainingQuantity,
    DLC_DDM: lot.dlc ?? lot.ddm ?? undefined,
    DLC_aReceptionEstimee: lot.dlc ?? lot.ddm ?? undefined,
    commentaire: lot.notes ?? lot.lot_comment ?? undefined,
    numeroLot: lot.lot_reference ?? undefined,
    statut: mapDbLotStatus(lot.status),
  };
};

export const fetchLotReservationUsageByLotId = async (
  client: SupabaseClient,
  lotIds: string[]
): Promise<Record<string, LotReservationUsageSummary>> => {
  const uniqueLotIds = Array.from(new Set(lotIds.filter(Boolean)));
  if (!uniqueLotIds.length) return {};

  const { data, error } = await client
    .from('lot_reservations')
    .select('lot_id, reserved_units, reserved_kg, status')
    .in('lot_id', uniqueLotIds)
    .in('status', ['active', 'consumed']);

  if (error) throw error;

  const usageByLotId: Record<string, LotReservationUsageSummary> = {};
  ((data as DbLotReservationUsageRow[] | null) ?? []).forEach((row) => {
    const current = usageByLotId[row.lot_id] ?? createEmptyLotReservationUsageSummary();
    if (row.status === 'active') {
      current.activeUnits += toQuantityNumber(row.reserved_units);
      current.activeKg += toQuantityNumber(row.reserved_kg);
    } else if (row.status === 'consumed') {
      current.consumedUnits += toQuantityNumber(row.reserved_units);
      current.consumedKg += toQuantityNumber(row.reserved_kg);
    }
    usageByLotId[row.lot_id] = current;
  });

  return usageByLotId;
};

export const mapProductionLotStatusToDb = (status: LotStatus): DbLot['status'] => {
  if (status === 'en_cours') return 'active';
  if (status === 'a_venir') return 'draft';
  return 'sold_out';
};

export const formatProductionLotStatusLabel = (status: LotStatus) => {
  if (status === 'en_cours') return 'En cours';
  if (status === 'a_venir') return 'A venir';
  return 'Epuisé';
};

export const createEmptyProductionLot = (id: string): ProductionLot => ({
  id,
  nomLot: '',
  debut: '',
  fin: '',
  periodeDisponibilite: { debut: '', fin: '' },
  DLC_DDM: '',
  commentaire: '',
  numeroLot: '',
  statut: 'a_venir',
});

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const normalizeProductionLot = (lot: ProductionLot): ProductionLot => {
  const debut = toTrimmedString(lot.debut ?? lot.periodeDisponibilite?.debut ?? '');
  const fin = toTrimmedString(lot.fin ?? lot.periodeDisponibilite?.fin ?? '');
  return {
    ...lot,
    debut,
    fin,
    periodeDisponibilite: { debut, fin },
    nomLot: toTrimmedString(lot.nomLot),
    commentaire: toTrimmedString(lot.commentaire),
    numeroLot: toTrimmedString(lot.numeroLot),
    DLC_DDM: toTrimmedString(lot.DLC_DDM),
  };
};

export const applyProductionLotPatch = (
  previousLot: ProductionLot,
  patch: Partial<ProductionLot>
): ProductionLot => {
  const nextLot = { ...previousLot, ...patch };
  if (patch.debut !== undefined || patch.fin !== undefined) {
    nextLot.periodeDisponibilite = {
      debut: patch.debut ?? previousLot.debut,
      fin: patch.fin ?? previousLot.fin,
    };
  }
  return normalizeProductionLot(nextLot);
};

export const validateProductionLotDraft = (lot: ProductionLot) => {
  const normalizedLot = normalizeProductionLot(lot);
  if (!normalizedLot.nomLot) return 'Ajoutez un nom de lot.';
  if (!normalizedLot.debut) return 'Ajoutez une date de debut.';
  return null;
};

export const resolveProductionLotStartDate = (
  lot: Pick<ProductionLot, 'debut' | 'periodeDisponibilite'>
) => {
  const candidates = [lot.periodeDisponibilite?.debut, lot.debut];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
};

export const resolveProductionLotEndDate = (
  lot: Pick<ProductionLot, 'fin' | 'periodeDisponibilite'>
) => {
  const candidates = [lot.periodeDisponibilite?.fin, lot.fin];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
};

export const resolveProductionLotStartTimestamp = (
  lot: Pick<ProductionLot, 'debut' | 'periodeDisponibilite'>
) => {
  const startDate = resolveProductionLotStartDate(lot);
  const timestamp = Date.parse(startDate);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const resolveProductionLotTimestamp = (
  lot: Pick<ProductionLot, 'debut' | 'fin' | 'periodeDisponibilite' | 'DLC_DDM'>
) => {
  const candidates = [
    resolveProductionLotEndDate(lot),
    resolveProductionLotStartDate(lot),
    lot.DLC_DDM?.trim() || '',
  ];
  for (const value of candidates) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
};

const buildLotPersistencePayload = ({
  lot,
  measurement,
  priceCents,
}: {
  lot: ProductionLot;
  measurement: ProductMeasurement;
  priceCents: number;
}) => {
  const normalizedLot = normalizeProductionLot(lot);
  const resolvedTotalQuantity =
    typeof normalizedLot.qteTotale === 'number'
      ? normalizedLot.qteTotale
      : typeof normalizedLot.qteRestante === 'number'
        ? normalizedLot.qteRestante
        : undefined;
  const resolvedRemainingQuantity =
    typeof normalizedLot.qteRestante === 'number'
      ? normalizedLot.qteRestante
      : resolvedTotalQuantity;
  const boundedTotalQuantity =
    resolvedTotalQuantity === undefined && resolvedRemainingQuantity === undefined
      ? undefined
      : Math.max(resolvedRemainingQuantity ?? 0, resolvedTotalQuantity ?? 0);
  const stockValue = resolvedRemainingQuantity ?? null;
  const basePayload = {
    status: mapProductionLotStatusToDb(normalizedLot.statut),
    stock_units: measurement === 'unit' ? stockValue : null,
    stock_kg: measurement === 'kg' ? stockValue : null,
    lot_comment: normalizedLot.nomLot || null,
    produced_at: normalizedLot.debut || null,
    dlc: normalizedLot.DLC_DDM || null,
    ddm: normalizedLot.DLC_DDM || null,
    lot_reference: normalizedLot.numeroLot || null,
    notes: normalizedLot.commentaire || null,
    metadata: {
      sale_period_start: normalizedLot.debut || null,
      sale_period_end: normalizedLot.fin || null,
      initial_quantity: boundedTotalQuantity ?? null,
    },
  };

  return {
    normalizedLot,
    resolvedTotalQuantity: boundedTotalQuantity,
    resolvedRemainingQuantity,
    basePayload,
    createPayload: {
      ...basePayload,
      price_cents: Math.max(0, Math.round(priceCents)),
    },
  };
};

export const persistProductionLot = async ({
  client,
  productDbId,
  lot,
  measurement,
  priceCents,
  mode,
}: PersistProductionLotParams) => {
  const { normalizedLot, resolvedTotalQuantity, resolvedRemainingQuantity, basePayload, createPayload } =
    buildLotPersistencePayload({
      lot,
      measurement,
      priceCents,
    });

  let resolvedLotDbId = normalizedLot.lotDbId ?? null;
  if (mode === 'edit' && !resolvedLotDbId) {
    const { data: existingLot, error: lookupError } = await client
      .from('lots')
      .select('id')
      .eq('product_id', productDbId)
      .eq('lot_code', normalizedLot.id)
      .maybeSingle();
    if (lookupError || !existingLot?.id) {
      throw lookupError ?? new Error('Lot introuvable.');
    }
    resolvedLotDbId = existingLot.id;
  }

  if (mode === 'edit' && resolvedLotDbId) {
    const { data: updated, error: updateError } = await client
      .from('lots')
      .update(basePayload)
      .eq('id', resolvedLotDbId)
      .select('id, lot_code, lot_reference')
      .maybeSingle();
    if (updateError || !updated?.lot_code) {
      throw updateError ?? new Error('Lot introuvable.');
    }
    return {
      created: false,
      lot: {
        ...normalizedLot,
        qteTotale: resolvedTotalQuantity,
        qteRestante: resolvedRemainingQuantity,
        id: updated.lot_code,
        lotDbId: updated.id,
        numeroLot: updated.lot_reference ?? normalizedLot.numeroLot,
      },
      lotDbId: updated.id,
    };
  }

  const { data: created, error: createError } = await client
    .from('lots')
    .insert({
      product_id: productDbId,
      ...createPayload,
    })
    .select('id, lot_code, lot_reference')
    .maybeSingle();
  if (createError || !created?.lot_code) {
    throw createError ?? new Error('Creation du lot impossible.');
  }

  return {
    created: true,
    lot: {
      ...normalizedLot,
      qteTotale: resolvedTotalQuantity,
      qteRestante: resolvedRemainingQuantity,
      id: created.lot_code,
      lotDbId: created.id,
      numeroLot: created.lot_reference ?? normalizedLot.numeroLot,
    },
    lotDbId: created.id,
  };
};

export const formatLotPriceWithUnit = (product: Pick<Product, 'measurement' | 'unit' | 'weightKg'>, priceCents: number) => {
  const measurementLabel = product.measurement === 'kg' ? '/ Kg' : '/ unité';
  const measurementDetails = [(product.unit || '').trim()];
  const unitWeightLabel =
    product.measurement === 'unit' ? formatUnitWeightLabel(product.weightKg) : '';
  if (unitWeightLabel) measurementDetails.push(unitWeightLabel);
  const measurementDetailsLabel = measurementDetails.filter(Boolean).join(' ');
  const suffix = measurementDetailsLabel ? ` ${measurementLabel} (${measurementDetailsLabel})` : ` ${measurementLabel}`;
  return `${formatEurosFromCents(Math.max(0, Math.round(priceCents)))}${suffix}`;
};

export const getLotSaveErrorMessage = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  if (message.includes('stock_kg must be set and stock_units must be null for kg products')) {
    return "Produit vendu au kg : la base exige une quantite de lot en kg pour enregistrer ce lot. Laisser la quantite vide n'est pas accepte actuellement par la base.";
  }
  if (message.includes('stock_units must be set and stock_kg must be null for unit products')) {
    return "Produit vendu a l'unité : la base exige une quantite de lot en nombre d'unités pour enregistrer ce lot. Laisser la quantité vide n'est pas accepté actuellement par la base.";
  }
  return message || "Impossible d'enregistrer le lot.";
};
