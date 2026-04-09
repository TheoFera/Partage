type ParseLocalizedQuantityInputOptions = {
  allowDecimal: boolean;
};

const KG_UNIT = 'kg';

const normalizeRawQuantity = (raw: string) => raw.replace(/[\s\u00A0]+/g, '').trim();

export const isKgMeasurement = (measurement?: string | null) => measurement === KG_UNIT;

export const isKgUnitLabel = (unitLabel?: string | null) => unitLabel?.trim().toLowerCase() === KG_UNIT;

export const formatQuantityInputValue = (value: number, allowDecimal: boolean) => {
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
  if (!allowDecimal) {
    return String(Math.max(0, Math.trunc(normalized)));
  }
  if (Number.isInteger(normalized)) return String(normalized);
  return String(normalized).replace('.', ',');
};

export const parseLocalizedQuantityInput = (
  raw: string,
  options: ParseLocalizedQuantityInputOptions
): number | null => {
  const normalized = normalizeRawQuantity(raw);
  if (!normalized) return 0;

  const decimalNormalized = normalized.replace(',', '.');
  if (!/^\d*(?:\.\d*)?$/.test(decimalNormalized) || decimalNormalized === '.') {
    return null;
  }

  const parsed = Number(decimalNormalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (!options.allowDecimal && !Number.isInteger(parsed)) return null;

  return options.allowDecimal ? parsed : Math.trunc(parsed);
};

export const resolveOrderItemQuantityValue = (params: {
  measurement?: 'kg' | 'unit' | null;
  unitLabel?: string | null;
  quantityUnits?: number | null;
  lineWeightKg?: number | null;
  unitWeightKg?: number | null;
}) => {
  const quantityUnits = Math.max(0, Number(params.quantityUnits ?? 0));
  if (isKgMeasurement(params.measurement) || isKgUnitLabel(params.unitLabel)) {
    const lineWeightKg = Number(params.lineWeightKg ?? NaN);
    if (Number.isFinite(lineWeightKg) && lineWeightKg >= 0) return lineWeightKg;
    const unitWeightKg = Math.max(0, Number(params.unitWeightKg ?? 0));
    return unitWeightKg * quantityUnits;
  }
  return quantityUnits;
};
