import { centsToEuros, eurosToCents } from './money';
import type { RepartitionPoste } from '../types';

export const DEFAULT_PLATFORM_FEE_PERCENT = 10;
export const DEFAULT_PAYMENT_PROVIDER_FEE_PERCENT = 3.5;

export const LOT_BREAKDOWN_COLORS = {
  producer: '#2F9E44',
  platform: '#FF6B4A',
  payment_provider: '#533AFD',
} as const;

export const LOT_BREAKDOWN_NOTE =
  "Le producteur fixe son prix de base. La plateforme ajoute ensuite automatiquement sa commission. Le coût estimatif du paiement en ligne est calculé sur le total prix producteur + commission plateforme, puis déduit de la part du producteur sans diminuer la commission de la plateforme.";

export type LotBreakdownSource = NonNullable<RepartitionPoste['source']>;
export type LotBreakdownGroupKey = 'producer' | 'platform' | 'payment_provider';

type LotBreakdownTotals = {
  producerGrossCents: number;
  producerNetCents: number;
  platformFeeCents: number;
  paymentProviderFeeCents: number;
  consumerTotalCents: number;
};

const roundCentsFromPercent = (baseCents: number, percent: number) =>
  Math.max(0, Math.round(baseCents * (percent / 100)));

export const isLockedLotBreakdownSource = (source?: RepartitionPoste['source']) =>
  source === 'platform' || source === 'payment_provider';

export const isLockedLotBreakdownPost = (post: RepartitionPoste) => isLockedLotBreakdownSource(post.source);

export const getLotBreakdownGroupKey = (post: RepartitionPoste): LotBreakdownGroupKey => {
  const stakeholderKey = String(post.stakeholderKey ?? '').trim().toLowerCase();
  if (post.source === 'payment_provider' || stakeholderKey === 'payment_provider') {
    return 'payment_provider';
  }
  if (post.source === 'platform' || stakeholderKey === 'platform') {
    return 'platform';
  }
  return 'producer';
};

export const getLotBreakdownGroupMeta = (key: LotBreakdownGroupKey) => {
  if (key === 'platform') {
    return { label: 'Plateforme Partage', color: LOT_BREAKDOWN_COLORS.platform };
  }
  if (key === 'payment_provider') {
    return { label: 'Prestataire de paiement', color: LOT_BREAKDOWN_COLORS.payment_provider };
  }
  return { label: 'Part producteur', color: LOT_BREAKDOWN_COLORS.producer };
};

const sumPostValuesCents = (posts: RepartitionPoste[]) =>
  posts.reduce((sum, post) => {
    if (post.type === 'percent') return sum;
    return sum + Math.max(0, eurosToCents(post.valeur));
  }, 0);

export const computeLotBreakdownTotals = (posts: RepartitionPoste[]): LotBreakdownTotals => {
  const producerPosts = posts.filter((post) => getLotBreakdownGroupKey(post) === 'producer');
  const platformPosts = posts.filter((post) => getLotBreakdownGroupKey(post) === 'platform');
  const paymentProviderPosts = posts.filter((post) => getLotBreakdownGroupKey(post) === 'payment_provider');
  const producerGrossCents = sumPostValuesCents(producerPosts);
  const platformFeeCents = sumPostValuesCents(platformPosts);
  const paymentProviderFeeCents = sumPostValuesCents(paymentProviderPosts);
  const producerNetCents = Math.max(0, producerGrossCents - paymentProviderFeeCents);
  const consumerTotalCents = producerGrossCents + platformFeeCents;

  return {
    producerGrossCents,
    producerNetCents,
    platformFeeCents,
    paymentProviderFeeCents,
    consumerTotalCents,
  };
};

export const sumLotBreakdownCents = (posts: RepartitionPoste[]) => computeLotBreakdownTotals(posts).consumerTotalCents;

const distributeCentsProportionally = (totalCents: number, weights: number[]) => {
  if (totalCents <= 0 || !weights.length) {
    return weights.map(() => 0);
  }
  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return safeWeights.map((_, index) => (index === 0 ? totalCents : 0));
  }

  const scaled = safeWeights.map((weight, index) => {
    const raw = (totalCents * weight) / totalWeight;
    const floorValue = Math.floor(raw);
    return {
      index,
      value: floorValue,
      remainder: raw - floorValue,
    };
  });
  let remaining = totalCents - scaled.reduce((sum, entry) => sum + entry.value, 0);
  scaled
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      return left.index - right.index;
    })
    .forEach((entry) => {
      if (remaining <= 0) return;
      scaled[entry.index].value += 1;
      remaining -= 1;
    });

  return scaled.map((entry) => entry.value);
};

export const buildReadonlyLotBreakdownPosts = (posts: RepartitionPoste[]) => {
  const producerPosts = posts.filter((post) => getLotBreakdownGroupKey(post) === 'producer');
  if (!producerPosts.length) return posts;

  const totals = computeLotBreakdownTotals(posts);
  if (totals.paymentProviderFeeCents <= 0 || totals.producerGrossCents <= 0) {
    return posts;
  }

  const producerNetValues = distributeCentsProportionally(
    totals.producerNetCents,
    producerPosts.map((post) => Math.max(0, eurosToCents(post.valeur))),
  );
  let producerIndex = 0;

  return posts.map((post) => {
    if (getLotBreakdownGroupKey(post) !== 'producer' || post.type === 'percent') {
      return post;
    }
    const valueCents = producerNetValues[producerIndex] ?? 0;
    producerIndex += 1;
    return {
      ...post,
      valeur: centsToEuros(valueCents),
    };
  });
};

export const synchronizeLotBreakdownPosts = (
  posts: RepartitionPoste[],
  options?: {
    platformFeePercent?: number;
    paymentProviderFeePercent?: number;
  }
) => {
  const producerPosts = posts.filter((post) => !isLockedLotBreakdownPost(post));
  const existingPlatformPost = posts.find((post) => post.source === 'platform');
  const existingPaymentProviderPost = posts.find((post) => post.source === 'payment_provider');
  const platformFeePercent = options?.platformFeePercent ?? DEFAULT_PLATFORM_FEE_PERCENT;
  const paymentProviderFeePercent =
    options?.paymentProviderFeePercent ?? DEFAULT_PAYMENT_PROVIDER_FEE_PERCENT;
  const producerSubtotalCents = sumPostValuesCents(producerPosts);
  const nextSortOrderBase = producerPosts.reduce((max, post, index) => {
    const sortOrder = Number.isFinite(post.sortOrder) ? Number(post.sortOrder) : index;
    return Math.max(max, sortOrder);
  }, -1);

  const nextPosts = producerPosts.map((post, index) => ({
    ...post,
    source: post.source ?? 'producer',
    sortOrder: Number.isFinite(post.sortOrder) ? Number(post.sortOrder) : index,
  }));

  if (producerSubtotalCents <= 0) {
    return nextPosts;
  }

  const platformFeeCents = roundCentsFromPercent(producerSubtotalCents, platformFeePercent);
  const paymentProviderBaseCents = producerSubtotalCents + platformFeeCents;
  const paymentProviderFeeCents = roundCentsFromPercent(
    paymentProviderBaseCents,
    paymentProviderFeePercent
  );

  if (platformFeeCents > 0) {
    nextPosts.push({
      ...existingPlatformPost,
      partiePrenante: 'Plateforme Partage',
      stakeholderKey: 'platform',
      platformCostCode: 'platform_commission',
      source: 'platform',
      nom: 'Commission plateforme',
      valeur: centsToEuros(platformFeeCents),
      type: 'eur',
      details: existingPlatformPost?.details,
      sortOrder:
        Number.isFinite(existingPlatformPost?.sortOrder) && Number(existingPlatformPost?.sortOrder) > nextSortOrderBase
          ? Number(existingPlatformPost?.sortOrder)
          : nextSortOrderBase + 1,
    });
  }

  if (paymentProviderFeeCents > 0) {
    nextPosts.push({
      ...existingPaymentProviderPost,
      partiePrenante: 'Prestataire de paiement',
      stakeholderKey: 'payment_provider',
      platformCostCode: 'payment_provider_estimate',
      source: 'payment_provider',
      nom: 'Paiement en ligne estimatif',
      valeur: centsToEuros(paymentProviderFeeCents),
      type: 'eur',
      details: existingPaymentProviderPost?.details,
      sortOrder:
        Number.isFinite(existingPaymentProviderPost?.sortOrder) &&
        Number(existingPaymentProviderPost?.sortOrder) > nextSortOrderBase + 1
          ? Number(existingPaymentProviderPost?.sortOrder)
          : nextSortOrderBase + 2,
    });
  }

  return nextPosts;
};

export const buildLotBreakdownSlices = (posts: RepartitionPoste[]) => {
  const totals = computeLotBreakdownTotals(posts);
  const entries: Array<{ key: LotBreakdownGroupKey; valueCents: number }> = [
    { key: 'producer', valueCents: totals.producerNetCents },
    { key: 'platform', valueCents: totals.platformFeeCents },
    { key: 'payment_provider', valueCents: totals.paymentProviderFeeCents },
  ].filter((entry) => entry.valueCents > 0);

  return entries.map(({ key, valueCents }) => {
    const meta = getLotBreakdownGroupMeta(key);
    return {
      key,
      label: meta.label,
      value: centsToEuros(valueCents),
      color: meta.color,
    };
  });
};
