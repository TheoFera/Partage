import type { GroupOrder, Product, User } from '../types';

export type SocialPreviewMeta = {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
};

type SocialPreviewOptions = {
  origin?: string;
  imagePath?: string;
  urlPath?: string;
};

export const DEFAULT_SOCIAL_PREVIEW_IMAGE_PATH = '/social-preview-partage-v1.svg';
export const SITE_SOCIAL_PREVIEW_TITLE = 'Partage | Commandez ensemble, achetez en direct';
export const SITE_SOCIAL_PREVIEW_DESCRIPTION =
  'Entre amis, entre collègues, entre voisins, crée ou participe à des commandes groupées.';

const PROFILE_ROLE_DESCRIPTIONS: Record<User['role'], string> = {
  producer: 'Découvrez ce producteur et ses produits directement sur Partage.',
  sharer: 'Découvrez ce partageur et ses commandes groupées sur Partage.',
  participant: 'Découvrez ce profil sur Partage.',
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const resolveOrigin = (origin?: string) => {
  if (origin) return trimTrailingSlash(origin);
  if (typeof window !== 'undefined' && window.location.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return '';
};

const toAbsoluteUrl = (target: string, origin?: string) => {
  if (/^https?:\/\//i.test(target)) return target;
  const normalizedTarget = target.startsWith('/') ? target : `/${target}`;
  const resolvedOrigin = resolveOrigin(origin);
  return resolvedOrigin ? `${resolvedOrigin}${normalizedTarget}` : normalizedTarget;
};

const resolveImageUrl = (options?: SocialPreviewOptions) =>
  toAbsoluteUrl(options?.imagePath ?? DEFAULT_SOCIAL_PREVIEW_IMAGE_PATH, options?.origin);

const formatDateFr = (value?: string | Date | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('fr-FR');
};

const fallbackProfileHandle = (profile: Pick<User, 'handle' | 'name'>) =>
  profile.handle?.trim() || slugify(profile.name || 'profil');

export const sitePreviewMeta = (options: SocialPreviewOptions = {}): SocialPreviewMeta => ({
  title: SITE_SOCIAL_PREVIEW_TITLE,
  description: SITE_SOCIAL_PREVIEW_DESCRIPTION,
  imageUrl: resolveImageUrl(options),
  url: toAbsoluteUrl(options.urlPath ?? '/', options.origin),
});

export const orderPreviewMeta = (
  order: Pick<GroupOrder, 'id' | 'orderCode' | 'title' | 'deadline'>,
  options: SocialPreviewOptions = {}
): SocialPreviewMeta => {
  const safeTitle = order.title?.trim();
  const deadlineLabel = formatDateFr(order.deadline);
  return {
    title: safeTitle ? `Commande groupée : ${safeTitle}` : 'Commande groupée sur Partage',
    description: deadlineLabel
      ? `Rejoignez une commande organisée sur Partage. Consultez les produits proposés et participez avant la clôture du ${deadlineLabel}.`
      : 'Découvrez cette commande partagée et participez directement sur Partage.',
    imageUrl: resolveImageUrl(options),
    url: toAbsoluteUrl(options.urlPath ?? `/cmd/${order.orderCode ?? order.id}`, options.origin),
  };
};

export const productPreviewMeta = (
  product: Pick<Product, 'id' | 'name' | 'productCode' | 'slug'>,
  options: SocialPreviewOptions = {}
): SocialPreviewMeta => {
  const safeName = product.name?.trim();
  const productCode = product.productCode ?? product.id;
  const productSlug = product.slug?.trim() || slugify(product.name || 'produit');
  return {
    title: safeName ? `${safeName} | Partage` : 'Produit | Partage',
    description: safeName
      ? 'Découvrez ce produit sur Partage. Consultez sa présentation, son prix si disponible et sa disponibilité directement en ligne.'
      : 'Découvrez ce produit directement sur Partage.',
    imageUrl: resolveImageUrl(options),
    url: toAbsoluteUrl(options.urlPath ?? `/produits/${productSlug || 'produit'}-${productCode}`, options.origin),
  };
};

export const profilePreviewMeta = (
  profile: Pick<User, 'name' | 'handle' | 'role'>,
  options: SocialPreviewOptions = {}
): SocialPreviewMeta => {
  const safeName = profile.name?.trim();
  const roleDescription = PROFILE_ROLE_DESCRIPTIONS[profile.role] ?? PROFILE_ROLE_DESCRIPTIONS.participant;
  return {
    title: safeName ? `${safeName} sur Partage` : 'Profil sur Partage',
    description: roleDescription,
    imageUrl: resolveImageUrl(options),
    url: toAbsoluteUrl(options.urlPath ?? `/profil/${fallbackProfileHandle(profile)}`, options.origin),
  };
};

const upsertMetaTag = (selector: string, attributes: Record<string, string>) => {
  if (typeof document === 'undefined') return;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

export const applySocialPreviewMeta = (meta: SocialPreviewMeta) => {
  if (typeof document === 'undefined') return;
  document.title = meta.title;

  upsertMetaTag('meta[name="description"]', {
    name: 'description',
    content: meta.description,
  });
  upsertMetaTag('meta[property="og:title"]', {
    property: 'og:title',
    content: meta.title,
  });
  upsertMetaTag('meta[property="og:description"]', {
    property: 'og:description',
    content: meta.description,
  });
  upsertMetaTag('meta[property="og:image"]', {
    property: 'og:image',
    content: meta.imageUrl,
  });
  upsertMetaTag('meta[property="og:url"]', {
    property: 'og:url',
    content: meta.url,
  });
  upsertMetaTag('meta[property="og:type"]', {
    property: 'og:type',
    content: 'website',
  });
  upsertMetaTag('meta[property="og:site_name"]', {
    property: 'og:site_name',
    content: 'Partage',
  });
  upsertMetaTag('meta[property="og:locale"]', {
    property: 'og:locale',
    content: 'fr_FR',
  });
  upsertMetaTag('meta[name="twitter:card"]', {
    name: 'twitter:card',
    content: 'summary_large_image',
  });
  upsertMetaTag('meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: meta.title,
  });
  upsertMetaTag('meta[name="twitter:description"]', {
    name: 'twitter:description',
    content: meta.description,
  });
  upsertMetaTag('meta[name="twitter:image"]', {
    name: 'twitter:image',
    content: meta.imageUrl,
  });
};
