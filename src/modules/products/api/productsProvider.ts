import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { centsToEuros } from '../lib/money';
import { fetchLotByLotCode } from '../lib/pricing';
import { mockProducts } from './mockData';
import { buildDefaultProductDetail, mockProductDetails } from './mockProductDetails';
import {
  PRODUCER_LABELS_DESCRIPTION_COLUMN,
  PRODUCER_LABELS_TABLE,
  PRODUCER_LABELS_YEAR_COLUMN,
} from './producerLabels';
import type {
  Avis,
  DbLot,
  DbLotInput,
  DbLotTraceStep,
  DbProduct,
  DbProductImage,
  DbProductIngredient,
  DbProductJourneyStep,
  DbLotLabel,
  DbLotPriceBreakdown,
  DbProductQuestion,
  DbProductReview,
  DbProducerLabel,
  Product,
  ProductDetail,
  ProductListingRow,
  ProducerLabelDetail,
  ProductionLot,
  RepartitionPoste,
  RepartitionValeur,
  TimelineStep,
} from '../types';

export const DEMO_MODE = (() => {
  const raw = import.meta.env.VITE_DEMO_MODE;
  if (raw === undefined || raw === null) return true;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return true;
})();

const PRODUCT_IMAGE_BUCKET = 'product-images';
const JOURNEY_IMAGE_BUCKET = import.meta.env.VITE_PRODUCT_JOURNEY_BUCKET ?? 'product-journey';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const slugify = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const toNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getSupabaseOrNull = (): SupabaseClient | null => {
  try {
    return getSupabaseClient();
  } catch (error) {
    console.warn('Supabase non configure pour les produits:', error);
    return null;
  }
};

const buildImageUrl = (client: SupabaseClient | null, path?: string | null, bucket = PRODUCT_IMAGE_BUCKET) => {
  if (!client || !path) return '';
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? '';
};

const withDemoFields = (product: Product): Product => ({
  ...product,
  productCode: product.productCode ?? product.id,
  slug: product.slug ?? slugify(product.name),
});

const getDemoProducts = () => mockProducts.map(withDemoFields);

const resolveProducerName = (name?: string | null) => name?.trim() || 'Producteur';

const resolveProducerLocation = (location?: string | null) => location?.trim() || 'Local';

const mapListingRowToProduct = (row: ProductListingRow, client: SupabaseClient | null): Product => {
  const measurement = row.sale_unit === 'kg' ? 'kg' : 'unit';
  const quantity = measurement === 'kg' ? toNumber(row.active_lot_stock_kg) : toNumber(row.active_lot_stock_units);
  const inStock = Boolean(row.active_lot_code) && quantity > 0;
  const priceCents = row.active_lot_price_cents ?? 0;
  const imageUrl = buildImageUrl(client, row.primary_image_path);

  return {
    id: row.product_code,
    productCode: row.product_code,
    dbId: row.product_id,
    slug: row.slug,
    activeLotCode: row.active_lot_code ?? undefined,
    activeLotId: row.active_lot_id ?? undefined,
    name: row.name,
    description: row.description ?? '',
    price: centsToEuros(priceCents),
    unit: measurement === 'kg' ? 'kg' : row.packaging,
    quantity,
    category: row.category,
    imageUrl,
    producerId: row.producer_profile_id ?? row.product_code,
    producerName: resolveProducerName(row.producer_name),
    producerLocation: resolveProducerLocation(row.producer_location),
    inStock,
    measurement,
    weightKg: row.unit_weight_kg ?? undefined,
  };
};

const mapLotStatus = (status: DbLot['status']): ProductionLot['statut'] => {
  if (status === 'active') return 'en_cours';
  if (status === 'draft') return 'a_venir';
  if (status === 'sold_out') return 'epuise';
  return 'epuise';
};

const mapLotsToProductions = (lots: DbLot[], measurement: Product['measurement']): ProductionLot[] =>
  lots.map((lot) => {
    const quantity = measurement === 'kg' ? toNumber(lot.stock_kg) : toNumber(lot.stock_units);
    const startDate = lot.produced_at ?? lot.created_at.slice(0, 10);
    const endDate = lot.ddm ?? lot.dlc ?? startDate;
    return {
      id: lot.lot_code,
      lotDbId: lot.id,
      nomLot: lot.lot_comment || lot.lot_reference || lot.lot_code,
      debut: startDate,
      fin: endDate,
      periodeDisponibilite: { debut: startDate, fin: endDate },
      qteTotale: quantity,
      qteRestante: quantity,
      DLC_DDM: lot.dlc ?? lot.ddm ?? undefined,
      DLC_aReceptionEstimee: lot.dlc ?? lot.ddm ?? undefined,
      commentaire: lot.notes ?? lot.lot_comment ?? undefined,
      numeroLot: lot.lot_reference ?? undefined,
      statut: mapLotStatus(lot.status),
    };
  });

const pickLatestActiveLot = (lots: DbLot[]) => {
  const activeLots = lots.filter((lot) => lot.status === 'active');
  if (!activeLots.length) return null;
  return activeLots
    .slice()
    .sort((a, b) => {
      const aDate = Date.parse(a.produced_at ?? a.created_at);
      const bDate = Date.parse(b.produced_at ?? b.created_at);
      return bDate - aDate;
    })[0];
};

const resolveJourneyEvidence = (client: SupabaseClient | null, step: DbProductJourneyStep) => {
  const url = buildImageUrl(client, step.evidence_path ?? undefined, JOURNEY_IMAGE_BUCKET);
  if (!url) return undefined;
  return { type: 'lien' as const, label: step.evidence_label ?? 'Image', url };
};

const formatStepLocation = (step: DbProductJourneyStep) => {
  const parts = [
    step.location_address,
    step.location_details,
    step.location_country,
    step.location_postcode,
    step.location_city,
    step.location,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
};

const mapJourneySteps = (
  journeySteps: DbProductJourneyStep[],
  client: SupabaseClient | null
): TimelineStep[] =>
  journeySteps
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((step) => ({
      journeyStepId: step.id,
      etape: step.step_label,
      description: step.description ?? undefined,
      address: step.location_address ?? undefined,
      addressDetails: step.location_details ?? undefined,
      country: step.location_country ?? undefined,
      postcode: step.location_postcode ?? undefined,
      city: step.location_city ?? undefined,
      lat: step.location_lat ?? undefined,
      lng: step.location_lng ?? undefined,
      lieu: formatStepLocation(step) ?? step.location ?? undefined,
      preuve: resolveJourneyEvidence(client, step),
    }));

const mapLotTraceSteps = (
  steps: DbLotTraceStep[],
  journeySteps: DbProductJourneyStep[],
  client: SupabaseClient | null
): TimelineStep[] => {
  if (!steps.length) return [];
  const journeyMap = new Map(journeySteps.map((step) => [step.id, step] as const));
  return steps
    .slice()
    .sort((a, b) => {
      const aDate = Date.parse(a.occurred_at ?? a.period_start ?? a.created_at);
      const bDate = Date.parse(b.occurred_at ?? b.period_start ?? b.created_at);
      return aDate - bDate;
    })
    .map((step) => {
      const journey = step.product_step_id ? journeyMap.get(step.product_step_id) : undefined;
      const journeyEvidence = journey ? resolveJourneyEvidence(client, journey) : undefined;
      const periodStart = step.period_start ?? undefined;
      const periodEnd = step.period_end ?? undefined;
      const hasPeriod = Boolean(periodStart && periodEnd);
      const singleDate = hasPeriod
        ? undefined
        : step.occurred_at ?? periodStart ?? periodEnd ?? undefined;
      return {
        journeyStepId: step.product_step_id ?? undefined,
        etape: journey?.step_label ?? step.step_label ?? 'Etape',
        description: journey?.description ?? undefined,
        address: journey?.location_address ?? undefined,
        addressDetails: journey?.location_details ?? undefined,
        country: journey?.location_country ?? undefined,
        postcode: journey?.location_postcode ?? undefined,
        city: journey?.location_city ?? undefined,
        lat: journey?.location_lat ?? undefined,
        lng: journey?.location_lng ?? undefined,
        lieu: step.location ?? (journey ? formatStepLocation(journey) : undefined) ?? journey?.location ?? undefined,
        date: singleDate,
        dateType: hasPeriod ? 'period' : singleDate ? 'date' : undefined,
        periodStart: periodStart ?? (singleDate ? singleDate : undefined),
        periodEnd,
        preuve: step.evidence_url
          ? {
              type: 'lien',
              label: step.evidence_label ?? 'Preuve',
              url: step.evidence_url,
            }
          : journeyEvidence,
      };
    });
};

const mapPriceBreakdown = (
  breakdown: DbLotPriceBreakdown[],
  lotPriceCents: number | null,
  unitReference: RepartitionValeur['uniteReference']
): RepartitionValeur | undefined => {
  if (!breakdown.length) return undefined;
  const postes: RepartitionPoste[] = breakdown
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => {
      return {
        id: entry.id,
        lotId: entry.lot_id,
        partiePrenante: entry.stakeholder ?? undefined,
        stakeholderKey: entry.stakeholder_key ?? undefined,
        platformCostCode: entry.platform_cost_code ?? undefined,
        source: entry.source ?? 'producer',
        nom: entry.label,
        valeur: centsToEuros(entry.value_cents ?? 0),
        type: 'eur',
        sortOrder: entry.sort_order,
      };
    });

  return {
    mode: 'detaille',
    uniteReference: unitReference,
    totalReference:
      lotPriceCents !== null && lotPriceCents !== undefined
        ? centsToEuros(lotPriceCents)
        : undefined,
    postes,
  };
};

const mapReviewsToAvis = (reviews: DbProductReview[]): Avis | undefined => {
  if (!reviews.length) return undefined;
  const entries = reviews.map((review) => ({
    auteur: review.author_name ?? 'Client',
    note: review.rating,
    date: review.created_at.slice(0, 10),
    commentaire: review.comment ?? '',
  }));
  const avg = entries.reduce((acc, entry) => acc + entry.note, 0) / entries.length;
  return {
    noteMoyenne: Number(avg.toFixed(2)),
    nbAvis: entries.length,
    listeAvis: entries,
  };
};

const mapQuestions = (questions: DbProductQuestion[]) => {
  if (!questions.length) return undefined;
  return {
    activer: true,
    listeQnA: questions.map((question) => ({
      question: question.question,
      reponse: question.answer ?? undefined,
      date: question.asked_at.slice(0, 10),
    })),
  };
};

const mapLabels = (labels: DbLotLabel[]) => {
  const official: string[] = [];
  const platform: string[] = [];
  const pushLabel = (label: { label: string; label_type: string | null }) => {
    const value = label.label.trim();
    if (!value) return;
    if (label.label_type && label.label_type.toLowerCase() === 'official') {
      official.push(value);
      return;
    }
    platform.push(value);
  };
  labels.forEach(pushLabel);
  return {
    officialBadges: official.length ? Array.from(new Set(official)) : undefined,
    platformBadges: platform.length ? Array.from(new Set(platform)) : undefined,
  };
};

const mapProductLabelDetails = (labels: DbLotLabel[]) => {
  const official: ProducerLabelDetail[] = [];
  const platform: ProducerLabelDetail[] = [];
  labels.forEach((label) => {
    const labelValue = label.label.trim();
    if (!labelValue) return;
    const labelRecord = label as unknown as Record<string, unknown>;
    const descriptionValue = labelRecord[PRODUCER_LABELS_DESCRIPTION_COLUMN];
    const description =
      typeof descriptionValue === 'string' ? descriptionValue.trim() : label.description?.trim() || undefined;
    const yearValue = labelRecord[PRODUCER_LABELS_YEAR_COLUMN];
    const obtentionYear = toOptionalNumber(yearValue);
    const entry = { label: labelValue, description, obtentionYear };
    if (label.label_type && label.label_type.toLowerCase() === 'official') {
      official.push(entry);
      return;
    }
    platform.push(entry);
  });

  return {
    officialBadgeDetails: official.length ? official : undefined,
    platformBadgeDetails: platform.length ? platform : undefined,
  };
};

const mapProducerLabelDetails = (labels: DbProducerLabel[]) => {
  const mapped = labels
    .map((label) => {
      const labelValue = label.label.trim();
      if (!labelValue) return null;
      const labelRecord = label as unknown as Record<string, unknown>;
      const descriptionValue = labelRecord[PRODUCER_LABELS_DESCRIPTION_COLUMN];
      const description =
        typeof descriptionValue === 'string' ? descriptionValue.trim() : label.description?.trim() || undefined;
      const yearValue = labelRecord[PRODUCER_LABELS_YEAR_COLUMN];
      const obtentionYear = toOptionalNumber(yearValue);
      return {
        label: labelValue,
        description,
        obtentionYear,
      };
    })
    .filter(Boolean);

  return mapped.length ? (mapped as Array<{ label: string; description?: string; obtentionYear?: number }>) : undefined;
};

const mapIngredients = (ingredients: DbProductIngredient[]) => {
  if (!ingredients.length) return undefined;
  const allergenes = Array.from(
    new Set(
      ingredients
        .filter((ingredient) => ingredient.is_allergen)
        .map((ingredient) => ingredient.allergen_type || ingredient.name)
        .filter(Boolean)
    )
  ) as string[];

  return {
    denominationVente: undefined,
    ingredients: ingredients.map((ingredient) => ({
      nom: ingredient.name,
      produitLieId: ingredient.linked_product_url ?? undefined,
      isAllergen: ingredient.is_allergen,
      allergenType: ingredient.allergen_type ?? undefined,
    })),
    allergenes: allergenes.length ? allergenes : undefined,
  };
};

const mapProductDetail = (params: {
  product: Product;
  productRow: DbProduct;
  images: DbProductImage[];
  lots: DbLot[];
  journeySteps: DbProductJourneyStep[];
  lotLabels: DbLotLabel[];
  producerLabels: DbProducerLabel[];
  reviews: DbProductReview[];
  questions: DbProductQuestion[];
  ingredients: DbProductIngredient[];
  lotTraceSteps: DbLotTraceStep[];
  lotInputs: DbLotInput[];
  priceBreakdown: DbLotPriceBreakdown[];
  selectedLot: DbLot | null;
  client: SupabaseClient | null;
}): ProductDetail => {
  const {
    product,
    productRow,
    images,
    lots,
    journeySteps,
    lotLabels,
    producerLabels,
    reviews,
    questions,
    ingredients,
    lotTraceSteps,
    priceBreakdown,
    selectedLot,
    client,
  } = params;

  const primaryImage = images
    .slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)[0];
  const imageUrl = buildImageUrl(client, primaryImage?.path) || product.imageUrl;

  const conservation = productRow.conservation_method?.toLowerCase() ?? '';
  const conservationMode = conservation.includes('frais')
    ? 'frais'
    : conservation.includes('congel')
      ? 'congele'
      : conservation.includes('ambiant')
        ? 'ambiant'
        : undefined;

  const lotId = selectedLot?.id ?? null;
  const scopedLotLabels = lotId ? lotLabels.filter((label) => label.lot_id === lotId) : lotLabels;
  const fallbackLotLabels =
    scopedLotLabels.length || !lotId
      ? scopedLotLabels
      : lotLabels.filter((label) => !label.lot_id);

  const mappedLabels = mapLabels(fallbackLotLabels);
  const productLabelDetails = mapProductLabelDetails(fallbackLotLabels);
  const producerLabelDetails = mapProducerLabelDetails(producerLabels);
  const mappedIngredients = mapIngredients(ingredients);

  const priceReference = selectedLot
    ? {
        devise: 'EUR',
        prixIndicatifUnitaire: centsToEuros(selectedLot.price_cents),
        unite: product.measurement === 'kg' ? 'kg' : 'piece',
        prixIndicatifAuKg:
          product.measurement === 'unit' && product.weightKg
            ? Number((centsToEuros(selectedLot.price_cents) / product.weightKg).toFixed(2))
            : undefined,
      }
    : undefined;

  const journeyTimeline = mapJourneySteps(journeySteps, client);
  const lotTimeline = mapLotTraceSteps(lotTraceSteps, journeySteps, client);

  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    shortDescription: product.description,
    longDescription: productRow.description ?? product.description,
    productImage: imageUrl
      ? {
          url: imageUrl,
          alt: primaryImage?.alt ?? product.name,
        }
      : undefined,
    producer: {
      id: product.producerId,
      name: product.producerName,
      city: product.producerLocation,
    },
    conservationMode: conservationMode as ProductDetail['conservationMode'],
    conditionnementPrincipal: productRow.packaging,
    formats: [
      {
        id: `${productRow.product_code}-format-1`,
        label: productRow.packaging,
        poidsNet: product.measurement === 'kg' ? '1 kg' : productRow.packaging,
        conditionnement: productRow.packaging,
        uniteVente: product.measurement === 'kg' ? 'kg' : 'piece',
      },
    ],
    priceReference,
    officialBadges: mappedLabels.officialBadges,
    platformBadges: mappedLabels.platformBadges,
    officialBadgeDetails: productLabelDetails.officialBadgeDetails,
    platformBadgeDetails: productLabelDetails.platformBadgeDetails,
    producerLabels: producerLabelDetails,
    compositionEtiquette: mappedIngredients
      ? {
          ...mappedIngredients,
          denominationVente: product.name,
          conseilsUtilisation: productRow.conservation_after_opening ?? undefined,
          conservationDetaillee: productRow.conservation_detail ?? undefined,
        }
      : undefined,
    tracabilite:
      journeyTimeline.length || lotTimeline.length
        ? {
            timeline: journeyTimeline.length ? journeyTimeline : undefined,
            lotTimeline: lotTimeline.length ? lotTimeline : undefined,
            datesImportantes: lotTimeline
              .filter((step) => step.date)
              .map((step) => ({ label: step.etape, date: step.date as string })),
          }
        : undefined,
    productions: mapLotsToProductions(lots, product.measurement),
    repartitionValeur: mapPriceBreakdown(
      priceBreakdown,
      selectedLot?.price_cents ?? null,
      product.measurement === 'kg' ? 'kg' : 'piece'
    ),
    avis: mapReviewsToAvis(reviews),
    questions: mapQuestions(questions),
    resumePictos: {
      modeConservation: conservationMode as ProductDetail['conservationMode'],
      formatConditionnement: productRow.packaging,
    },
  };
};

const mapProductRowToProduct = (row: DbProduct, selectedLot: DbLot | null, client: SupabaseClient | null, images: DbProductImage[]): Product => {
  const measurement = row.sale_unit === 'kg' ? 'kg' : 'unit';
  const primaryImage = images
    .slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)[0];
  const imageUrl = buildImageUrl(client, primaryImage?.path);
  const quantity = measurement === 'kg' ? toNumber(selectedLot?.stock_kg) : toNumber(selectedLot?.stock_units);
  const priceCents = selectedLot?.price_cents ?? 0;

  return {
    id: row.product_code,
    productCode: row.product_code,
    dbId: row.id,
    slug: row.slug,
    activeLotCode: selectedLot?.lot_code ?? undefined,
    activeLotId: selectedLot?.id ?? undefined,
    name: row.name,
    description: row.description ?? '',
    price: centsToEuros(priceCents),
    unit: measurement === 'kg' ? 'kg' : row.packaging,
    quantity,
    category: row.category,
    imageUrl: imageUrl || '',
    producerId: row.producer_profile_id ?? row.product_code,
    producerName: resolveProducerName(row.producer_name),
    producerLocation: resolveProducerLocation(row.producer_location),
    inStock: Boolean(selectedLot && quantity > 0),
    measurement,
    weightKg: row.unit_weight_kg ?? undefined,
  };
};

const getDemoProductDetailByCode = (productCode: string) => {
  const demoProducts = getDemoProducts();
  const product = demoProducts.find((item) => (item.productCode ?? item.id) === productCode);
  if (!product) return null;
  const detail = mockProductDetails[product.id] ?? buildDefaultProductDetail(product);
  return { product, detail };
};

const getDemoLotDetailByCode = (lotCode: string) => {
  const demoProducts = getDemoProducts();
  for (const product of demoProducts) {
    const detail = mockProductDetails[product.id] ?? buildDefaultProductDetail(product);
    const hasLot = detail.productions?.some((lot) => lot.id === lotCode);
    if (hasLot) {
      return { product, detail, lotCode };
    }
  }
  return null;
};

export const listProducts = async (): Promise<{ products: Product[]; isDemo: boolean }> => {
  if (DEMO_MODE) {
    return { products: getDemoProducts(), isDemo: true };
  }
  const client = getSupabaseOrNull();
  if (!client) {
    return { products: [], isDemo: false };
  }

  const { data, error } = await client.from('v_products_listing').select('*');
  if (error) {
    console.warn('Supabase products listing error:', error);
    return { products: [], isDemo: false };
  }

  if (!data || data.length === 0) {
    return { products: [], isDemo: false };
  }

  const products = (data as ProductListingRow[]).map((row) => mapListingRowToProduct(row, client));
  return { products, isDemo: false };
};

export const getProductByCode = async (
  productCode: string
): Promise<{ product: Product; detail: ProductDetail; activeLotCode?: string | null } | null> => {
  if (!productCode) return null;
  if (DEMO_MODE) {
    return getDemoProductDetailByCode(productCode);
  }

  const client = getSupabaseOrNull();
  if (!client) return null;

  const { data: productRow, error: productError } = await client
    .from('products')
    .select('*')
    .eq('product_code', productCode)
    .maybeSingle();

  if (productError || !productRow) {
    return null;
  }

  const producerProfileId = (productRow as DbProduct).producer_profile_id;
  const productId = (productRow as DbProduct).id;
  const [
    imagesResult,
    lotsResult,
    journeyResult,
    reviewsResult,
    questionsResult,
    ingredientsResult,
    producerLabelsResult,
  ] = await Promise.all([
    client.from('product_images').select('*').eq('product_id', productId),
    client.from('lots').select('*').eq('product_id', productId),
    client.from('product_journey_steps').select('*').eq('product_id', productId),
    client.from('product_reviews').select('*').eq('product_id', productId),
    client.from('product_questions').select('*').eq('product_id', productId),
    client.from('product_ingredients').select('*').eq('product_id', productId),
    producerProfileId
      ? client.from(PRODUCER_LABELS_TABLE).select('*').eq('profile_id', producerProfileId)
      : Promise.resolve({ data: [] }),
  ]);

  const lots = (lotsResult.data as DbLot[]) ?? [];
  const producerLabels = (producerLabelsResult.data as DbProducerLabel[]) ?? [];
  const selectedLot = pickLatestActiveLot(lots);
  const lotLabelsResult = selectedLot
    ? await client.from('lot_labels').select('*').eq('lot_id', selectedLot.id)
    : { data: [] };

  const [lotTraceResult, lotInputsResult, priceBreakdownResult] = selectedLot
    ? await Promise.all([
        client.from('lot_trace_steps').select('*').eq('lot_id', selectedLot.id),
        client.from('lot_inputs').select('*').eq('lot_id', selectedLot.id),
        client.from('lot_price_breakdown').select('*').eq('lot_id', selectedLot.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const product = mapProductRowToProduct(
    productRow as DbProduct,
    selectedLot,
    client,
    (imagesResult.data as DbProductImage[]) ?? []
  );

  const detail = mapProductDetail({
    product,
    productRow: productRow as DbProduct,
    images: (imagesResult.data as DbProductImage[]) ?? [],
    lots,
    journeySteps: (journeyResult.data as DbProductJourneyStep[]) ?? [],
    lotLabels: (lotLabelsResult.data as DbLotLabel[]) ?? [],
    producerLabels,
    reviews: (reviewsResult.data as DbProductReview[]) ?? [],
    questions: (questionsResult.data as DbProductQuestion[]) ?? [],
    ingredients: (ingredientsResult.data as DbProductIngredient[]) ?? [],
    lotTraceSteps: (lotTraceResult.data as DbLotTraceStep[]) ?? [],
    lotInputs: (lotInputsResult.data as DbLotInput[]) ?? [],
    priceBreakdown: (priceBreakdownResult.data as DbLotPriceBreakdown[]) ?? [],
    selectedLot,
    client,
  });

  return { product, detail, activeLotCode: selectedLot?.lot_code ?? null };
};

export const getLotByCode = async (
  lotCode: string
): Promise<{ product: Product; detail: ProductDetail; lotCode?: string | null } | null> => {
  if (!lotCode) return null;
  if (DEMO_MODE) {
    return getDemoLotDetailByCode(lotCode);
  }

  const client = getSupabaseOrNull();
  if (!client) return null;

  let lotRow: DbLot | null = null;
  try {
    lotRow = await fetchLotByLotCode(client, lotCode);
  } catch (error) {
    console.warn('Supabase lot load error:', error);
    return null;
  }

  if (!lotRow) {
    return null;
  }

  const { data: productRow, error: productError } = await client
    .from('products')
    .select('*')
    .eq('id', (lotRow as DbLot).product_id)
    .maybeSingle();

  if (productError || !productRow) return null;

  const producerProfileId = (productRow as DbProduct).producer_profile_id;
  const productId = (productRow as DbProduct).id;
  const [
    imagesResult,
    lotsResult,
    journeyResult,
    reviewsResult,
    questionsResult,
    ingredientsResult,
    lotLabelsResult,
    priceBreakdownResult,
    lotTraceResult,
    lotInputsResult,
    producerLabelsResult,
  ] = await Promise.all([
    client.from('product_images').select('*').eq('product_id', productId),
    client.from('lots').select('*').eq('product_id', productId),
    client.from('product_journey_steps').select('*').eq('product_id', productId),
    client.from('product_reviews').select('*').eq('product_id', productId),
    client.from('product_questions').select('*').eq('product_id', productId),
    client.from('product_ingredients').select('*').eq('product_id', productId),
    client.from('lot_labels').select('*').eq('lot_id', (lotRow as DbLot).id),
    client.from('lot_price_breakdown').select('*').eq('lot_id', (lotRow as DbLot).id),
    client.from('lot_trace_steps').select('*').eq('lot_id', (lotRow as DbLot).id),
    client.from('lot_inputs').select('*').eq('lot_id', (lotRow as DbLot).id),
    producerProfileId
      ? client.from(PRODUCER_LABELS_TABLE).select('*').eq('profile_id', producerProfileId)
      : Promise.resolve({ data: [] }),
  ]);

  const product = mapProductRowToProduct(
    productRow as DbProduct,
    lotRow as DbLot,
    client,
    (imagesResult.data as DbProductImage[]) ?? []
  );

  const producerLabels = (producerLabelsResult.data as DbProducerLabel[]) ?? [];
  const detail = mapProductDetail({
    product,
    productRow: productRow as DbProduct,
    images: (imagesResult.data as DbProductImage[]) ?? [],
    lots: (lotsResult.data as DbLot[]) ?? [],
    journeySteps: (journeyResult.data as DbProductJourneyStep[]) ?? [],
    lotLabels: (lotLabelsResult.data as DbLotLabel[]) ?? [],
    producerLabels,
    reviews: (reviewsResult.data as DbProductReview[]) ?? [],
    questions: (questionsResult.data as DbProductQuestion[]) ?? [],
    ingredients: (ingredientsResult.data as DbProductIngredient[]) ?? [],
    lotTraceSteps: (lotTraceResult.data as DbLotTraceStep[]) ?? [],
    lotInputs: (lotInputsResult.data as DbLotInput[]) ?? [],
    priceBreakdown: (priceBreakdownResult.data as DbLotPriceBreakdown[]) ?? [],
    selectedLot: lotRow as DbLot,
    client,
  });

  return { product, detail, lotCode: lotRow.lot_code };
};
