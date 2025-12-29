export type UserRole = 'producer' | 'sharer' | 'participant';
export type DeliveryLeadType = 'days' | 'fixed_day';
export type DeliveryDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  handle?: string;
  accountType?: 'individual' | 'company' | 'association' | 'public_institution';
  profileImage?: string;
  profileVisibility?: 'public' | 'private';
  addressVisibility?: 'public' | 'private';
  tagline?: string;
  website?: string;
  address?: string;
  addressDetails?: string;
  city?: string;
  postcode?: string;
  phone?: string;
  phonePublic?: string;
  contactEmailPublic?: string;
  addressLat?: number;
  addressLng?: number;
  offersOnSitePickup?: boolean;
  freshProductsCertified?: boolean;
  socialLinks?: Record<string, string | null>;
  openingHours?: Record<string, string>;
  verified?: boolean;
  businessStatus?: string;
  producerId?: string;
  legalEntity?: LegalEntity;
}

export interface LegalEntity {
  legalName: string;
  siret: string;
  vatNumber?: string;
  entityType: 'company' | 'association' | 'public_institution';
  deliveryLeadType?: DeliveryLeadType;
  deliveryLeadDays?: number;
  deliveryFixedDay?: DeliveryDay;
  chronofreshEnabled?: boolean;
  chronofreshMinWeight?: number;
  chronofreshMaxWeight?: number;
  producerDeliveryEnabled?: boolean;
  producerDeliveryDays?: DeliveryDay[];
  producerDeliveryMinWeight?: number;
  producerDeliveryMaxWeight?: number;
  producerPickupEnabled?: boolean;
  producerPickupDays?: DeliveryDay[];
  producerPickupStartTime?: string;
  producerPickupEndTime?: string;
  producerPickupMinWeight?: number;
  producerPickupMaxWeight?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  quantity: number;
  category: string;
  imageUrl: string;
  producerId: string;
  producerName: string;
  producerLocation: string;
  inStock: boolean;
  measurement: 'unit' | 'kg';
  weightKg?: number;
}

export interface DeckCard extends Product {
  addedAt: Date;
}

export interface GroupOrder {
  id: string;
  title: string;
  sharerId: string;
  sharerName: string;
  products: Product[];
  producerId: string;
  producerName: string;
  sharerPercentage: number;
  sharerQuantities?: Record<string, number>;
  minWeight: number;
  maxWeight: number;
  orderedWeight?: number;
  estimatedDeliveryDate?: Date;
  pickupWindowWeeks?: number;
  deadline: Date;
  pickupStreet?: string;
  pickupCity?: string;
  pickupPostcode?: string;
  pickupAddress: string;
  message: string;
  status: 'open' | 'closed' | 'completed';
  visibility: 'public' | 'private';
  totalValue: number;
  participants: number;
  pickupSlots?: Array<{
    day?: string;
    date?: string;
    start?: string;
    end?: string;
    label?: string;
  }>;
  mapLocation?: {
    lat: number;
    lng: number;
    radiusMeters: number;
    areaLabel: string;
  };
}

export interface OrderPurchaseDraft {
  orderId: string;
  quantities: Record<string, number>;
  total: number;
  weight: number;
  baseOrderedWeight: number;
}

export type ConservationMode = 'frais' | 'ambiant' | 'congele';

export interface ProductVariant {
  id: string;
  label: string;
  poidsNet: string;
  conditionnement: string;
  uniteVente: 'kg' | 'piece' | 'lot' | string;
  codeEAN?: string;
}

export interface PriceReference {
  devise: 'EUR' | string;
  prixIndicatifUnitaire: number;
  unite: 'kg' | 'piece' | 'lot' | string;
  prixIndicatifAuKg?: number;
  mention?: string;
}

export interface EvidenceLink {
  type: 'pdf' | 'lien';
  label: string;
  url: string;
}

export interface ProductionConditions {
  modeProduction?: string;
  intrantsPesticides?: {
    utilise: boolean;
    details?: string;
    explicationPedagogique?: string;
  };
  bienEtreAnimal?: string;
  social?: string;
  environnement?: string;
  preuves?: EvidenceLink[];
}

export interface Ingredient {
  nom: string;
  produitLieId?: string;
}

export interface NutritionFacts {
  energie?: string;
  matieresGrasses?: string;
  acidesGrasSatures?: string;
  glucides?: string;
  sucres?: string;
  fibres?: string;
  proteines?: string;
  sel?: string;
  [key: string]: string | undefined;
}

export interface CompositionEtiquette {
  denominationVente?: string;
  ingredients?: Ingredient[];
  allergenes?: string[];
  nutrition?: NutritionFacts;
  additifs?: string[];
  conseilsUtilisation?: string;
  conservationDetaillee?: string;
}

export interface TraceDocument {
  type: 'pdf' | 'lien';
  label: string;
  url: string;
}

export interface TimelineStep {
  etape: string;
  lieu?: string;
  date?: string;
  dateType?: 'date' | 'period';
  periodStart?: string;
  periodEnd?: string;
  preuve?: TraceDocument;
}

export interface Tracabilite {
  paysOrigine?: string;
  lieuProduction?: string;
  lieuTransformation?: string;
  lieuAbattage?: string;
  datesImportantes?: { label: string; date: string }[];
  preuves?: TraceDocument[];
  timeline?: TimelineStep[];
}

export interface ProductionLot {
  id: string;
  nomLot: string;
  debut: string;
  fin: string;
  periodeDisponibilite?: { debut: string; fin: string };
  qteTotale?: number;
  qteRestante?: number;
  DLC_DDM?: string;
  DLC_aReceptionEstimee?: string;
  commentaire?: string;
  numeroLot?: string;
  piecesJointes?: TraceDocument[];
  statut: 'a_venir' | 'en_cours' | 'epuise';
}

export interface RepartitionPoste {
  nom: string;
  valeur: number;
  type: 'eur' | 'percent';
  details?: string;
}

export interface RepartitionValeur {
  mode: 'estimatif' | 'detaille';
  uniteReference: 'kg' | 'piece' | 'lot';
  totalReference?: number;
  postes: RepartitionPoste[];
  notePedagogique?: string;
}

export interface AvisEntry {
  auteur: string;
  note: number;
  date: string;
  commentaire: string;
}

export interface Avis {
  noteMoyenne: number;
  nbAvis: number;
  listeAvis: AvisEntry[];
}

export interface QuestionEntry {
  question: string;
  reponse?: string;
  date: string;
}

export interface Questions {
  activer: boolean;
  listeQnA: QuestionEntry[];
}

export interface LinkedProduct {
  id: string;
  name: string;
  category?: string;
  producerName?: string;
  city?: string;
  badges?: string[];
}

export interface ProduitsLies {
  autresFormats?: LinkedProduct[];
  autresDuProducteur?: LinkedProduct[];
  similaires?: LinkedProduct[];
}

export interface ResumePictos {
  origineZone?: string;
  paysOrigine?: string;
  modeConservation?: ConservationMode;
  dlcAReceptionEstimee?: string;
  formatConditionnement?: string;
  portions?: string;
  chaineDuFroid?: boolean;
  chaineAnimal?: {
    naissance?: string;
    elevage?: string;
    abattage?: string;
    transformation?: string;
  };
}

export interface ProductDetail {
  productId: string;
  name: string;
  category?: string;
  shortDescription?: string;
  longDescription?: string;
  productImage?: { url: string; alt: string; etiquetteUrl?: string };
  producer: {
    id: string;
    name: string;
    city: string;
    photo?: string;
    badgesProducteur?: string[];
    shortStory?: string;
    liens?: EvidenceLink[];
  };
  conservationMode?: ConservationMode;
  portions?: string;
  originCountry?: string;
  zones?: string[];
  dlcEstimee?: string;
  conditionnementPrincipal?: string;
  formats?: ProductVariant[];
  priceReference?: PriceReference;
  officialBadges?: string[];
  platformBadges?: string[];
  productionConditions?: ProductionConditions;
  compositionEtiquette?: CompositionEtiquette;
  tracabilite?: Tracabilite;
  productions?: ProductionLot[];
  repartitionValeur?: RepartitionValeur;
  avis?: Avis;
  questions?: Questions;
  produitsLies?: ProduitsLies;
  resumePictos?: ResumePictos;
}
