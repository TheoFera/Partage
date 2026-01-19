export const formatUnitWeightLabel = (weightKg?: number | null) => {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0) {
    return '';
  }
  if (weightKg < 1) {
    const grams = Math.round(weightKg * 1000);
    return `${grams}g`;
  }
  const kgValue = Math.round(weightKg * 100) / 100;
  return `${Number(kgValue.toFixed(2)).toString()} Kg`;
};
