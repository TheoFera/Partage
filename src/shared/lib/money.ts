export const centsToEuros = (cents: number | null | undefined): number => {
  if (cents === null || cents === undefined) return 0;
  const value = Number(cents);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value) / 100;
};

export const eurosToCents = (euros: number | string | null | undefined): number => {
  if (euros === null || euros === undefined) return 0;
  const value =
    typeof euros === 'string'
      ? Number(euros.trim().replace(',', '.'))
      : Number(euros);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
};

const euroFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatEurosFromCents = (cents: number | null | undefined): string => {
  const value = centsToEuros(cents);
  return euroFormatter.format(value);
};
