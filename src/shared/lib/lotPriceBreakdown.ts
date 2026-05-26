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
  "Le producteur fixe son prix de base. La plateforme ajoute ensuite automatiquement sa commission et l'estimation du paiement en ligne.";

export type LotBreakdownSource = NonNullable<RepartitionPoste['source']>;
export type LotBreakdownGroupKey = 'producer' | 'platform' | 'payment_provider';

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
  return { label: 'Prix fixé par le producteur', color: LOT_BREAKDOWN_COLORS.producer };
};

export const sumLotBreakdownCents = (posts: RepartitionPoste[]) =>
  posts.reduce((sum, post) => {
    if (post.type === 'percent') return sum;
    return sum + Math.max(0, eurosToCents(post.valeur));
  }, 0);

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
  const producerSubtotalCents = sumLotBreakdownCents(producerPosts);
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
  const groups = new Map<LotBreakdownGroupKey, number>();
  posts.forEach((post) => {
    if (post.type === 'percent') return;
    const cents = Math.max(0, eurosToCents(post.valeur));
    if (cents <= 0) return;
    const key = getLotBreakdownGroupKey(post);
    groups.set(key, (groups.get(key) ?? 0) + cents);
  });

  return Array.from(groups.entries()).map(([key, valueCents]) => {
    const meta = getLotBreakdownGroupMeta(key);
    return {
      key,
      label: meta.label,
      value: centsToEuros(valueCents),
      color: meta.color,
    };
  });
};
