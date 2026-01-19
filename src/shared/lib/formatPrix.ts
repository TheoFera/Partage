import { centsToEuros } from './money';

export const formatPrixEuro = (valueInCents?: number | null): number => centsToEuros(valueInCents);
