import type { Product, ProductionLot } from '../../../shared/types';

export type ProducerLotsPlanningLot = {
  productId: string;
  productDbId: string | null;
  product: Product;
  lot: ProductionLot;
  lotDbId: string | null;
  priceCents: number;
  startDate: string;
  endDate: string;
  laneIndex: number;
};

type UnplacedProducerLotsPlanningLot = Omit<ProducerLotsPlanningLot, 'laneIndex'>;

export type ProducerLotsPlanningRow = {
  product: Product;
  productDbId: string | null;
  lots: ProducerLotsPlanningLot[];
  laneCount: number;
};

export type PlanningRange = {
  start: Date;
  end: Date;
  totalDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtcDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day));

export const parseIsoDateUtc = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return toUtcDate(year, month, day);
};

export const formatMonthLabel = (value: Date) =>
  new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);

export const formatPlanningDateLabel = (value?: string | null) => {
  const parsed = parseIsoDateUtc(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
};

const startOfMonthUtc = (value: Date) => toUtcDate(value.getUTCFullYear(), value.getUTCMonth(), 1);

const endOfMonthUtc = (value: Date) => toUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, 0);

const addMonthsUtc = (value: Date, months: number) =>
  toUtcDate(value.getUTCFullYear(), value.getUTCMonth() + months, 1);

const diffDaysUtc = (start: Date, end: Date) =>
  Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / MS_PER_DAY);

export const buildPlanningRange = (lots: Array<Pick<ProducerLotsPlanningLot, 'startDate' | 'endDate'>>, today = new Date()): PlanningRange => {
  const todayUtc = toUtcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const parsedStarts = lots.map((lot) => parseIsoDateUtc(lot.startDate)).filter(Boolean) as Date[];
  const parsedEnds = lots
    .map((lot) => parseIsoDateUtc(lot.endDate || lot.startDate))
    .filter(Boolean) as Date[];

  const minSource = parsedStarts.length
    ? parsedStarts.reduce((min, current) => (current < min ? current : min))
    : todayUtc;
  const maxSource = parsedEnds.length
    ? parsedEnds.reduce((max, current) => (current > max ? current : max))
    : todayUtc;

  const anchorStart = todayUtc < minSource ? todayUtc : minSource;
  const anchorEnd = todayUtc > maxSource ? todayUtc : maxSource;
  const start = startOfMonthUtc(addMonthsUtc(anchorStart, -1));
  const end = endOfMonthUtc(addMonthsUtc(anchorEnd, 1));
  return {
    start,
    end,
    totalDays: diffDaysUtc(start, end) + 1,
  };
};

export const buildPlanningMonths = (range: PlanningRange) => {
  const months: Array<{ key: string; label: string; start: Date; days: number; offsetDays: number }> = [];
  let cursor = startOfMonthUtc(range.start);
  while (cursor <= range.end) {
    const monthStart = cursor < range.start ? range.start : cursor;
    const monthEnd = endOfMonthUtc(cursor) > range.end ? range.end : endOfMonthUtc(cursor);
    months.push({
      key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      label: formatMonthLabel(cursor),
      start: monthStart,
      days: diffDaysUtc(monthStart, monthEnd) + 1,
      offsetDays: diffDaysUtc(range.start, monthStart),
    });
    cursor = addMonthsUtc(cursor, 1);
  }
  return months;
};

const resolveLaneEnd = (lot: Pick<ProducerLotsPlanningLot, 'endDate'>, rangeEnd: Date) =>
  parseIsoDateUtc(lot.endDate) ?? rangeEnd;

export const buildPlanningRows = (
  products: Array<{ product: Product; productDbId: string | null; lots: UnplacedProducerLotsPlanningLot[] }>,
  rangeEnd: Date
): ProducerLotsPlanningRow[] =>
  products.map(({ product, productDbId, lots }) => {
    const laneEndDates: Date[] = [];
    const sortedLots = [...lots].sort((a, b) => {
      const aStart = parseIsoDateUtc(a.startDate) ?? rangeEnd;
      const bStart = parseIsoDateUtc(b.startDate) ?? rangeEnd;
      const startDiff = aStart.getTime() - bStart.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = resolveLaneEnd(a, rangeEnd).getTime() - resolveLaneEnd(b, rangeEnd).getTime();
      if (endDiff !== 0) return endDiff;
      return a.lot.nomLot.localeCompare(b.lot.nomLot);
    });

    const placedLots = sortedLots.map((lot) => {
      const lotStart = parseIsoDateUtc(lot.startDate) ?? rangeEnd;
      const lotEnd = resolveLaneEnd(lot, rangeEnd);
      // Reuse the earliest lane that is already free for this start date,
      // so non-overlapping lots stay on the same visual row.
      let laneIndex = -1;
      let earliestReusableEnd: Date | null = null;
      laneEndDates.forEach((currentEnd, currentLaneIndex) => {
        if (currentEnd > lotStart) return;
        if (!earliestReusableEnd || currentEnd < earliestReusableEnd) {
          earliestReusableEnd = currentEnd;
          laneIndex = currentLaneIndex;
        }
      });
      if (laneIndex === -1) {
        laneIndex = laneEndDates.length;
        laneEndDates.push(lotEnd);
      } else {
        laneEndDates[laneIndex] = lotEnd;
      }
      return { ...lot, laneIndex };
    });

    return {
      product,
      productDbId,
      lots: placedLots,
      laneCount: Math.max(1, laneEndDates.length || 1),
    };
  });

export const getPlanningOffsetDays = (range: PlanningRange, dateValue: string) => {
  const date = parseIsoDateUtc(dateValue);
  if (!date) return 0;
  return diffDaysUtc(range.start, date);
};
