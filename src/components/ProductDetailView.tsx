import React from 'react';
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  GripVertical,
  Heart,
  Info,
  Leaf,
  MapPin,
  Package,
  PenLine,
  Percent,
  Plus,
  ShieldCheck,
  Star,
  Thermometer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProductResultCard } from './ProductsLanding';
import './ProductDetailView.css';
import {
  GroupOrder,
  LinkedProduct,
  Product,
  ProductDetail,
  ProductionLot,
  RepartitionPoste,
  TimelineStep,
} from '../types';

interface ProductDetailViewProps {
  product: Product;
  detail: ProductDetail;
  ordersWithProduct: GroupOrder[];
  isOwner: boolean;
  isSaved?: boolean;
  catalog?: Product[];
  onHeaderActionsChange?: (actions: React.ReactNode) => void;
  onOpenProducer?: (product: Product) => void;
  onOpenRelatedProduct?: (productId: string) => void;
  onShare: () => void;
  onCreateOrder: () => void;
  onParticipate: () => void;
  onToggleSave?: (next: boolean) => void;
}

type DetailTabKey = 'circuit' | 'quality' | 'repartition' | 'consumption' | 'transparency';

const TAB_OPTIONS: Array<{ id: DetailTabKey; label: string; icon: React.ElementType }> = [
  { id: 'circuit', label: 'Circuit-court', icon: Leaf },
  { id: 'quality', label: 'Qualité', icon: ShieldCheck },
  { id: 'repartition', label: 'Répartition du prix', icon: Percent },
  { id: 'consumption', label: 'Consommation', icon: Users },
  { id: 'transparency', label: 'Transparence et confiance', icon: Info },
];

const LABEL_DESCRIPTIONS: Record<string, string> = {
  aop: "Appellation d'origine protegee avec cahier des charges strict.",
  igp: 'Indication geographique protegee et traitee en zone delimitee.',
  bio: 'Agriculture biologique certifiee, intrants controles.',
  'label rouge': 'Qualite superieure controlee sur toute la filiere.',
  hve: 'Haute Valeur Environnementale, pratiques durables.',
  'bleu blanc coeur': 'Alimentation specifique et tracabilite nutritionnelle.',
  traçable: 'Chaque lot est trace et documente.',
  'circuit court': "Peu d'intermediaires, relation directe.",
  'frais controle': 'Respect du froid et controles reguliers.',
};

const DEFAULT_STEP_EXPLANATIONS: Record<string, string> = {
  production: 'Fenetre de disponibilite, pratiques de production et savoir-faire.',
  transformation: 'Methode de transformation et gestes cles.',
  abattage: "Etape d'abattage encadree et tracabilisee.",
  conditionnement: 'Conditionnement, etiquetage et preparation des lots.',
  retrait: 'Retrait/livraison, zones de distribution.',
  livraison: 'Retrait/livraison, zones de distribution.',
};

const normalizeKey = (value: string) => value.toLowerCase().trim();

const getLabelDescription = (label: string) => {
  const key = normalizeKey(label);
  return LABEL_DESCRIPTIONS[key] ?? `Cahier des charges a consulter pour "${label}".`;
};

const getPrimaryPickupLabel = (orders: GroupOrder[], fallback?: string) => {
  const primary = orders[0];
  const label =
    [primary?.pickupCity, primary?.pickupPostcode].filter(Boolean).join(' ').trim() ||
    primary?.mapLocation?.areaLabel ||
    primary?.pickupAddress;
  return label || fallback || '';
};

const resolveLocationForStep = (label: string, detail: ProductDetail, pickupLabel?: string) => {
  const normalized = label.toLowerCase();
  if (normalized.includes('production')) return detail.tracabilite?.lieuProduction || detail.originCountry;
  if (normalized.includes('transformation')) return detail.tracabilite?.lieuTransformation || detail.producer.city;
  if (normalized.includes('abattage')) return detail.tracabilite?.lieuAbattage || detail.producer.city;
  if (normalized.includes('conditionnement')) return detail.tracabilite?.lieuTransformation || detail.producer.city;
  if (normalized.includes('retrait') || normalized.includes('livraison')) return pickupLabel;
  return detail.producer.city || detail.originCountry;
};

const buildFallbackTimeline = (detail: ProductDetail, pickupLabel?: string): TimelineStep[] => {
  if (detail.tracabilite?.datesImportantes?.length) {
    return detail.tracabilite.datesImportantes.map((item) => ({
      etape: item.label,
      date: item.date,
      lieu: resolveLocationForStep(item.label, detail, pickupLabel),
    }));
  }

  const steps: TimelineStep[] = [];
  const productionLocation = detail.tracabilite?.lieuProduction || detail.originCountry;
  if (productionLocation) steps.push({ etape: 'Production', lieu: productionLocation });
  const transformationLocation = detail.tracabilite?.lieuTransformation || detail.producer.city;
  if (transformationLocation) steps.push({ etape: 'Transformation', lieu: transformationLocation });
  if (detail.tracabilite?.lieuAbattage) {
    steps.push({ etape: 'Abattage', lieu: detail.tracabilite.lieuAbattage });
  }
  if (transformationLocation) steps.push({ etape: 'Conditionnement', lieu: transformationLocation });
  if (pickupLabel) steps.push({ etape: 'Retrait', lieu: pickupLabel });
  return steps;
};

const getStepExplanation = (step: TimelineStep) => {
  if (step.preuve?.label) return step.preuve.label;
  const normalized = step.etape.toLowerCase();
  const match = Object.keys(DEFAULT_STEP_EXPLANATIONS).find((key) => normalized.includes(key));
  return (match && DEFAULT_STEP_EXPLANATIONS[match]) || 'Informations a renseigner sur cette etape.';
};

const formatValue = (post: RepartitionPoste) => {
  if (post.type === 'percent') return `${post.valeur}%`;
  return `${post.valeur.toFixed(2)} €`;
};

const PIE_COLORS = [
  '#FF6B4A',
  '#FFD166',
  '#4CC9F0',
  '#90BE6D',
  '#F8961E',
  '#577590',
  '#F28482',
  '#8E9AAF',
  '#43AA8B',
  '#277DA1',
];

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
};

const describeWedge = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const arc = describeArc(x, y, radius, startAngle, endAngle);
  return `${arc} L ${x} ${y} Z`;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const ValuePieChart = ({
  slices,
  size = 220,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) => {
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return (
      <div className="pd-chart__empty">
        <p className="pd-chart__empty-text">Renseignez des postes pour afficher le camembert.</p>
      </div>
    );
  }

  const center = 50;
  const radius = 40;
  let currentAngle = 0;
  const computed = slices
    .filter((slice) => Number.isFinite(slice.value) && slice.value > 0)
    .map((slice) => {
      const sliceAngle = (slice.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;
      return { ...slice, startAngle, endAngle, percent: (slice.value / total) * 100 };
    });

  return (
    <div className="pd-chart">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Camembert de repartition de la valeur"
        className="pd-chart__svg"
      >
        {computed.map((slice) => (
          <path
            key={slice.label}
            d={describeWedge(center, center, radius, slice.startAngle, slice.endAngle)}
            fill={slice.color}
          >
            <title>
              {slice.label}: {formatValue({ nom: slice.label, valeur: slice.value, type: 'eur' })} ({formatPercent(slice.percent)})
            </title>
          </path>
        ))}
        <circle cx={center} cy={center} r={24} fill="#FFFFFF" opacity={0.9} />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#111827">
          Total
        </text>
        <text x={center} y={center + 10} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#6B7280">
          {total.toFixed(2)} €
        </text>
      </svg>

      <div className="pd-chart__legend">
        {computed.map((slice) => (
          <div key={`${slice.label}-legend`} className="pd-chart__legend-row">
            <div className="pd-chart__legend-label">
              <span
                aria-hidden="true"
                className="pd-chart__swatch"
                style={{ backgroundColor: slice.color }}
              />
              <span className="pd-chart__label">{slice.label}</span>
            </div>
            <div className="pd-chart__legend-value">
              <span>{formatValue({ nom: slice.label, valeur: slice.value, type: 'eur' })}</span>
              <span className="pd-chart__percent">({formatPercent(slice.percent)})</span>
            </div>
          </div>
        ))}
        <p className="pd-chart__note">Camembert calcule automatiquement a partir des couts saisis.</p>
      </div>
    </div>
  );
};

const lotStatusBadge = (lot: ProductionLot) => {
  if (lot.statut === 'en_cours') return { label: 'En cours', className: 'pd-lot-badge pd-lot-badge--active' };
  if (lot.statut === 'a_venir') return { label: 'A venir', className: 'pd-lot-badge pd-lot-badge--upcoming' };
  return { label: 'Epuise', className: 'pd-lot-badge pd-lot-badge--closed' };
};

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  detail,
  ordersWithProduct,
  isOwner,
  isSaved,
  catalog,
  onHeaderActionsChange,
  onOpenProducer,
  onOpenRelatedProduct,
  onShare,
  onCreateOrder,
  onParticipate,
  onToggleSave,
}) => {
  const [draft, setDraft] = React.useState<ProductDetail>(detail);
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [notifyFollowers, setNotifyFollowers] = React.useState(false);
  const [notificationMessage, setNotificationMessage] = React.useState('');
  const [selectedLotId, setSelectedLotId] = React.useState<string | null>(
    detail.productions?.find((lot) => lot.statut !== 'epuise')?.id ?? null
  );
  const [localPosts, setLocalPosts] = React.useState<RepartitionPoste[]>(detail.repartitionValeur?.postes ?? []);
  const [activeTab, setActiveTab] = React.useState<DetailTabKey>('circuit');
  const [localMeasurement, setLocalMeasurement] = React.useState<Product['measurement']>(product.measurement);
  const [localUnit, setLocalUnit] = React.useState(product.unit);
  const [draggedStepIndex, setDraggedStepIndex] = React.useState<number | null>(null);
  const [dragOverStepIndex, setDragOverStepIndex] = React.useState<number | null>(null);
  const onToggleSaveRef = React.useRef<typeof onToggleSave>(onToggleSave);

  const pickupLabel = React.useMemo(
    () => getPrimaryPickupLabel(ordersWithProduct, detail.producer.city),
    [ordersWithProduct, detail.producer.city]
  );
  const fallbackTimeline = React.useMemo(() => buildFallbackTimeline(detail, pickupLabel), [detail, pickupLabel]);
  const [localTimeline, setLocalTimeline] = React.useState<TimelineStep[]>(fallbackTimeline);

  React.useEffect(() => {
    const posts = detail.repartitionValeur?.postes ?? [];
    setLocalPosts(posts.map((post) => ({ ...post, type: 'eur' })));
  }, [detail.repartitionValeur?.postes]);

  React.useEffect(() => {
    setDraft(detail);
  }, [detail]);

  React.useEffect(() => {
    onToggleSaveRef.current = onToggleSave;
  }, [onToggleSave]);

  React.useEffect(() => {
    setLocalTimeline(detail.tracabilite?.timeline?.length ? detail.tracabilite.timeline : fallbackTimeline);
  }, [detail, fallbackTimeline]);

  React.useEffect(() => {
    setLocalMeasurement(product.measurement);
    setLocalUnit(product.unit);
  }, [product.measurement, product.unit]);

  const display = editMode ? draft : detail;
  const hasOrders = ordersWithProduct.length > 0;
  const summaryOrdersLabel = hasOrders
    ? `${ordersWithProduct.length} commande${ordersWithProduct.length > 1 ? 's' : ''} disponible`
    : 'Aucune commande active';

  const timelineDisplay = editMode
    ? localTimeline
    : detail.tracabilite?.timeline?.length
    ? detail.tracabilite.timeline
    : fallbackTimeline;

  const allBadges = React.useMemo(() => {
    const badges = [...(display.officialBadges ?? []), ...(display.platformBadges ?? [])]
      .map((badge) => badge.trim())
      .filter(Boolean);
    return Array.from(new Set(badges));
  }, [display.officialBadges, display.platformBadges]);

  const locationStats = React.useMemo(() => {
    const counts = new Map<string, number>();
    ordersWithProduct.forEach((order) => {
      const label =
        [order.pickupCity, order.pickupPostcode].filter(Boolean).join(' ').trim() ||
        order.mapLocation?.areaLabel ||
        order.pickupAddress;
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));
  }, [ordersWithProduct]);

  const totalParticipants = React.useMemo(
    () => ordersWithProduct.reduce((acc, order) => acc + (order.participants ?? 0), 0),
    [ordersWithProduct]
  );
  const totalOrderedWeight = React.useMemo(
    () => ordersWithProduct.reduce((acc, order) => acc + (order.orderedWeight ?? 0), 0),
    [ordersWithProduct]
  );

  const tabCounts: Record<DetailTabKey, number> = {
    circuit: timelineDisplay.length + (display.productions?.length ?? 0),
    quality: allBadges.length,
    repartition: localPosts.length,
    consumption: ordersWithProduct.length,
    transparency:
      (display.compositionEtiquette?.ingredients?.length ?? 0) + (display.compositionEtiquette?.allergenes?.length ?? 0),
  };

  const tabStats = TAB_OPTIONS.map((tab) => ({
    ...tab,
    value: tabCounts[tab.id] ?? 0,
  }));

  const toggleFollow = React.useCallback(() => {
    setIsFollowing((prev) => !prev);
    toast.success(!isFollowing ? 'Vous suivez ce produit.' : 'Vous ne suivez plus ce produit.');
  }, [isFollowing]);

  const handleSaveToggle = React.useCallback(() => {
    if (!onToggleSaveRef.current) return;
    onToggleSaveRef.current(!isSaved);
  }, [isSaved]);

  const handleAddPost = () => {
    setLocalPosts((prev) => [...prev, { nom: 'Nouveau poste', valeur: 0, type: 'eur' }]);
  };

  const handlePostChange = (index: number, key: keyof RepartitionPoste, value: string) => {
    setLocalPosts((prev) =>
      prev.map((post, idx) =>
        idx === index
          ? {
              ...post,
              [key]: key === 'valeur' ? Number(value) || 0 : value,
            }
          : post
      )
    );
  };

  const updateTimelineStep = (index: number, patch: Partial<TimelineStep>) => {
    setLocalTimeline((prev) => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
  };

  const updateTimelineProof = (index: number, patch: { label?: string; url?: string }) => {
    setLocalTimeline((prev) =>
      prev.map((step, idx) => {
        if (idx !== index) return step;
        const nextProof = { ...(step.preuve ?? { type: 'lien', label: '', url: '' }), ...patch };
        return { ...step, preuve: nextProof };
      })
    );
  };

  const handleAddTimelineStep = () => {
    setLocalTimeline((prev) => [...prev, { etape: 'Nouvelle etape', lieu: '', date: '' }]);
  };

  const handleRemoveTimelineStep = (index: number) => {
    setLocalTimeline((prev) => prev.filter((_, idx) => idx !== index));
  };

  const reorderTimelineStep = (from: number, to: number) => {
    setLocalTimeline((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleTimelineDragStart =
    (index: number) =>
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      setDraggedStepIndex(index);
    };

  const handleTimelineDragOver =
    (index: number) =>
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverStepIndex(index);
    };

  const handleTimelineDrop =
    (index: number) =>
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
      const data = event.dataTransfer.getData('text/plain');
      const from = draggedStepIndex ?? (data ? Number(data) : null);
      if (from === null || Number.isNaN(from)) {
        setDraggedStepIndex(null);
        setDragOverStepIndex(null);
        return;
      }
      reorderTimelineStep(from, index);
      setDraggedStepIndex(null);
      setDragOverStepIndex(null);
    };

  const handleTimelineDragEnd = () => {
    setDraggedStepIndex(null);
    setDragOverStepIndex(null);
  };

  React.useEffect(() => {
    if (!editMode) return;
    setDraft((prev) => ({
      ...prev,
      repartitionValeur: {
        ...(prev.repartitionValeur || { mode: 'estimatif', uniteReference: 'kg', postes: [] }),
        postes: localPosts,
      },
    }));
  }, [editMode, localPosts]);

  React.useEffect(() => {
    if (!editMode) return;
    setDraft((prev) => ({
      ...prev,
      tracabilite: {
        ...(prev.tracabilite ?? {}),
        timeline: localTimeline,
      },
    }));
  }, [editMode, localTimeline]);

  const totalPosts = localPosts.reduce((acc, post) => acc + (Number.isFinite(post.valeur) ? post.valeur : 0), 0);
  const expectedTotal = detail.repartitionValeur?.totalReference;
  const hasGap =
    typeof expectedTotal === 'number' && expectedTotal > 0 ? Math.abs(totalPosts - expectedTotal) > 0.5 : false;

  const editCTA = (
    <div className="pd-inline-note">
      <Info size={16} />
      <span>Mode éditeur : éditez le produit (actuellement sauvegarde fictive pour le prototype).</span>
    </div>
  );

  const handleSaveEdit = () => {
    setEditMode(false);
    toast.success('Modifications enregistrees (demo).');
    if (notifyFollowers && !notificationMessage.trim()) {
      toast.error('Ajoutez un message de notification pour prevenir les abonnes.');
    }
  };

  const selectedLot = detail.productions?.find((lot) => lot.id === selectedLotId);

  const handleOpenProducer = React.useCallback(() => {
    onOpenProducer?.(product);
  }, [onOpenProducer, product]);

  const measurementValue = editMode ? localMeasurement : product.measurement;
  const unitValue = editMode ? localUnit : product.unit;
  const measurementLabel = measurementValue === 'kg' ? '/ Kg' : '/ unité';
  const displayCategory = display.category || product.category;
  const displayImage = display.productImage?.url || product.imageUrl;
  const displayProducer = display.producer ?? detail.producer;
  const relatedCatalog = React.useMemo(() => {
    const map = new Map<string, Product>();
    (catalog ?? []).forEach((entry) => {
      map.set(entry.id, entry);
      map.set(entry.name, entry);
    });
    return map;
  }, [catalog]);

  const buildLinkedProductCard = (item: LinkedProduct) => {
    const match = relatedCatalog.get(item.id) ?? relatedCatalog.get(item.name);
    if (match) return { product: match, isCatalog: true };
    const fallbackPrice = detail.priceReference?.prixIndicatifUnitaire ?? product.price;
    const fallbackProduct: Product = {
      id: item.id,
      name: item.name,
      description: item.category ?? product.description,
      price: fallbackPrice,
      unit: product.unit,
      quantity: product.quantity,
      category: item.category ?? product.category,
      imageUrl: displayImage || product.imageUrl,
      producerId: displayProducer.id ?? product.producerId,
      producerName: item.producerName ?? displayProducer.name ?? product.producerName,
      producerLocation: item.city ?? displayProducer.city ?? product.producerLocation,
      inStock: true,
      measurement: product.measurement,
    };
    return { product: fallbackProduct, isCatalog: false };
  };

  const circuitTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--split pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
            <div>
              <p className="pd-section-title">Parcours du produit</p>
            </div>
            {editMode ? (
              <button
                type="button"
                onClick={handleAddTimelineStep}
                className="pd-btn pd-btn--ghost pd-btn--dashed"
              >
                <Plus size={16} />
                Ajouter une etape
              </button>
            ) : null}
          </div>

          {timelineDisplay.length ? (
            <div className="pd-timeline">
              <div className="pd-timeline__line" />
              <div className="pd-stack pd-stack--lg pd-timeline__list">
                {timelineDisplay.map((step, index) => {
                  const hasPhoto = Boolean(step.preuve?.url);
                  const periodStart = (step.periodStart || '').trim();
                  const periodEnd = (step.periodEnd || '').trim();
                  const stepMode = step.dateType ?? (periodStart || periodEnd ? 'period' : 'date');
                  const isDragging = draggedStepIndex === index;
                  const isDragOver = dragOverStepIndex === index;
                  const dateLabel =
                    stepMode === 'period'
                      ? periodStart && periodEnd
                        ? `Du ${periodStart} au ${periodEnd}`
                        : periodStart
                        ? `Depuis ${periodStart}`
                        : periodEnd
                        ? `Jusqu'au ${periodEnd}`
                        : 'Periode a preciser'
                      : step.date || 'Date a preciser';
                  return (
                    <div
                      key={`${step.etape}-${index}`}
                      className={`pd-timeline__item${isDragging ? ' pd-timeline__item--dragging' : ''}${
                        isDragOver ? ' pd-timeline__item--over' : ''
                      }`}
                      onDragOver={handleTimelineDragOver(index)}
                      onDrop={handleTimelineDrop(index)}
                    >
                      <span className="pd-timeline__marker" />
                      <div className="pd-timeline__row">
                        <div className="pd-timeline__body pd-stack pd-stack--sm">
                          {editMode ? (
                            <button
                              type="button"
                              className="pd-timeline__handle"
                              draggable
                              onDragStart={handleTimelineDragStart(index)}
                              onDragEnd={handleTimelineDragEnd}
                              aria-label="Reordonner l'etape"
                              title="Glisser pour reordonner"
                            >
                              <GripVertical size={16} />
                              <span>Glisser pour reordonner</span>
                            </button>
                          ) : null}
                          {editMode ? (
                            <div className="pd-stack pd-stack--sm">
                              <div className="pd-grid pd-grid--two pd-gap-sm">
                                <input
                                  className="pd-input"
                                  value={step.etape}
                                  onChange={(e) => updateTimelineStep(index, { etape: e.target.value })}
                                  placeholder="Etape"
                                />
                                <input
                                  className="pd-input"
                                  value={step.lieu || ''}
                                  onChange={(e) => updateTimelineStep(index, { lieu: e.target.value })}
                                  placeholder="Lieu"
                                />
                              </div>
                              <div className="pd-grid pd-grid--three pd-gap-sm">
                                <select
                                  className="pd-select"
                                  value={stepMode}
                                  onChange={(e) => {
                                    const nextMode = e.target.value as 'date' | 'period';
                                    updateTimelineStep(
                                      index,
                                      nextMode === 'period'
                                        ? {
                                            dateType: 'period',
                                            date: '',
                                            periodStart: step.periodStart || '',
                                            periodEnd: step.periodEnd || '',
                                          }
                                        : {
                                            dateType: 'date',
                                            date: step.date || '',
                                            periodStart: '',
                                            periodEnd: '',
                                          }
                                    );
                                  }}
                                >
                                  <option value="date">Date</option>
                                  <option value="period">Periode</option>
                                </select>
                                {stepMode === 'period' ? (
                                  <>
                                    <input
                                      className="pd-input"
                                      value={step.periodStart || ''}
                                      onChange={(e) =>
                                        updateTimelineStep(index, { periodStart: e.target.value, dateType: 'period' })
                                      }
                                      placeholder="Debut"
                                    />
                                    <input
                                      className="pd-input"
                                      value={step.periodEnd || ''}
                                      onChange={(e) =>
                                        updateTimelineStep(index, { periodEnd: e.target.value, dateType: 'period' })
                                      }
                                      placeholder="Fin"
                                    />
                                  </>
                                ) : (
                                  <input
                                    className="pd-input"
                                    value={step.date || ''}
                                    onChange={(e) => updateTimelineStep(index, { date: e.target.value, dateType: 'date' })}
                                    placeholder="Date"
                                  />
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="pd-text-strong">{step.etape}</p>
                              <p className="pd-text-xs pd-text-muted">{step.lieu || 'Lieu a preciser'}</p>
                              <p className="pd-text-xs pd-text-muted">{dateLabel}</p>
                            </div>
                          )}
                          {editMode ? (
                            <input
                              className="pd-input"
                              value={step.preuve?.label || ''}
                              onChange={(e) => updateTimelineProof(index, { label: e.target.value })}
                              placeholder="Phrase d'explication (fenetre de disponibilite, savoir-faire...)"
                            />
                          ) : (
                            <p className="pd-text-body">{getStepExplanation(step)}</p>
                          )}
                          {editMode ? (
                            <div className="pd-row pd-row--wrap pd-row--start pd-gap-sm">
                              <input
                                className="pd-input"
                                value={step.preuve?.url || ''}
                                onChange={(e) => updateTimelineProof(index, { url: e.target.value })}
                                placeholder="Lien photo ou document"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveTimelineStep(index)}
                                className="pd-btn pd-btn--ghost pd-btn--warning"
                              >
                                Retirer
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div className="pd-timeline__media">
                          {hasPhoto ? (
                            <ImageWithFallback
                              src={step.preuve?.url}
                              alt={step.etape}
                              className="pd-media pd-media--image"
                            />
                          ) : (
                            <div className="pd-media pd-media--empty">
                              <Package size={16} />
                              <span>Photo optionnelle</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Aucune etape de tracabilite renseignee.</p>
          )}
        </div>

        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-gap-sm">
            <Package className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Lots (donnees factuelles)</p>
          </div>
          {display.productions?.length ? (
            <div className="pd-stack pd-stack--sm">
              {display.productions.map((lot) => {
                const badge = lotStatusBadge(lot);
                return (
                  <div key={lot.id} className="pd-lot-card pd-stack pd-stack--sm">
                    <div className="pd-row pd-row--between pd-gap-sm">
                      <div className="pd-row pd-gap-sm">
                        <span className={badge.className}>{badge.label}</span>
                        <p className="pd-text-strong">{lot.nomLot}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedLotId(lot.id)}
                        className={`pd-btn pd-btn--xs ${
                          selectedLotId === lot.id ? 'pd-btn--outline-active' : 'pd-btn--outline'
                        }`}
                      >
                        {selectedLotId === lot.id ? 'Selectionne pour creer' : 'Selectionner ce lot'}
                      </button>
                    </div>
                    <div className="pd-grid pd-grid--two pd-gap-sm pd-text-xs pd-text-muted">
                      <p>
                        Disponibilite : {lot.periodeDisponibilite?.debut} {'->'} {lot.periodeDisponibilite?.fin}
                      </p>
                      <p>
                        Quantites : {lot.qteRestante ?? '-'} / {lot.qteTotale ?? '-'}
                      </p>
                      <p>DLC / DDM : {lot.DLC_DDM || lot.DLC_aReceptionEstimee || '-'}</p>
                      <p>Lot #{lot.numeroLot || 'A preciser'}</p>
                    </div>
                    {lot.commentaire ? <p className="pd-text-body">{lot.commentaire}</p> : null}
                    {lot.piecesJointes?.length ? (
                      <div className="pd-row pd-row--wrap pd-gap-xs pd-text-xs">
                        {lot.piecesJointes.map((piece) => (
                          <a
                            key={piece.label}
                            href={piece.url}
                            className="pd-link-pill"
                          >
                            <ExternalLink size={12} />
                            {piece.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <p className="pd-text-xs pd-text-muted">Selectionnez un lot pour le pre-remplissage des commandes.</p>
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Pas encore de lots publies.</p>
          )}
        </div>
      </div>
    </div>
  );

  const qualityTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--wide pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-gap-sm">
            <ShieldCheck className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Labels & caractéristiques du produit</p>
          </div>
          {allBadges.length ? (
            <div className="pd-grid pd-grid--two pd-gap-sm">
              {allBadges.map((badge) => (
                <div key={badge} className="pd-card pd-card--subtle pd-stack pd-stack--xs">
                  <p className="pd-text-strong">{badge}</p>
                  <p className="pd-text-xs pd-text-muted">{getLabelDescription(badge)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Aucun label renseigné pour le moment.</p>
          )}
        </div>

        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-gap-sm">
            <Package className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Exploitation</p>
          </div>
          {display.productionConditions ? (
            <div className="pd-grid pd-grid--two pd-gap-sm">
              {display.productionConditions.modeProduction ? (
                <div className="pd-info-card pd-stack pd-stack--xs">
                  <p className="pd-label">Mode de production</p>
                  <p>{display.productionConditions.modeProduction}</p>
                </div>
              ) : null}
              {display.productionConditions.intrantsPesticides ? (
                <div className="pd-info-card pd-stack pd-stack--xs">
                  <p className="pd-label">Intrants / pesticides</p>
                  <p>
                    {display.productionConditions.intrantsPesticides.utilise ? 'Utilisation declaree' : 'Non utilise'}
                  </p>
                  <p className="pd-text-xs pd-text-muted">{display.productionConditions.intrantsPesticides.details}</p>
                </div>
              ) : null}
              {display.productionConditions.bienEtreAnimal ? (
                <div className="pd-info-card pd-stack pd-stack--xs">
                  <p className="pd-label">Bien-être animal</p>
                  <p>{display.productionConditions.bienEtreAnimal}</p>
                </div>
              ) : null}
              {display.productionConditions.environnement ? (
                <div className="pd-info-card pd-stack pd-stack--xs">
                  <p className="pd-label">Environnement</p>
                  <p>{display.productionConditions.environnement}</p>
                </div>
              ) : null}
              {display.productionConditions.social ? (
                <div className="pd-info-card pd-stack pd-stack--xs">
                  <p className="pd-label">Social</p>
                  <p>{display.productionConditions.social}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Le producteur n'a pas encore renseigné son cahier des charges.</p>
          )}
        </div>
      </div>
    </div>
  );

  const repartitionTab = (
    <div className="pd-tab pd-stack pd-stack--md">
      <div className="pd-card pd-stack pd-stack--md">
        <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
          <div>
            <p className="pd-section-title">Repartition de la valeur</p>
            <p className="pd-text-xs pd-text-muted">
              {detail.repartitionValeur?.postes?.length
                ? `Lecture en ${detail.repartitionValeur.uniteReference} - ${
                    detail.repartitionValeur.mode === 'detaille' ? 'Detaille' : 'Estimatif'
                  }`
                : "Le producteur n'a pas encore renseigné la repartition"}
            </p>
          </div>
          {detail.repartitionValeur?.totalReference ? (
            <span className="pd-chip pd-chip--highlight">
              Total reference {detail.repartitionValeur.totalReference} {detail.repartitionValeur.uniteReference}
            </span>
          ) : null}
        </div>
        {localPosts.length === 0 ? (
          <p className="pd-text-sm pd-text-muted">Le producteur n'a pas encore renseigné la repartition.</p>
        ) : (
          <div className="pd-stack pd-stack--md">
            <ValuePieChart
              slices={localPosts.map((post, idx) => ({
                label: post.nom || `Poste ${idx + 1}`,
                value: Number.isFinite(post.valeur) ? post.valeur : 0,
                color: PIE_COLORS[idx % PIE_COLORS.length],
              }))}
            />
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead className="pd-table__head">
                  <tr>
                    <th className="pd-table__cell">Poste</th>
                    <th className="pd-table__cell">Cout (EUR)</th>
                    <th className="pd-table__cell">Details</th>
                    {editMode ? <th className="pd-table__cell">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {localPosts.map((post, idx) => (
                    <tr key={`${post.nom}-${idx}`} className="pd-table__row">
                      <td className="pd-table__cell">
                        {editMode ? (
                          <input
                            className="pd-input"
                            value={post.nom}
                            onChange={(e) => handlePostChange(idx, 'nom', e.target.value)}
                          />
                        ) : (
                          <span className="pd-text-strong">{post.nom}</span>
                        )}
                      </td>
                      <td className="pd-table__cell">
                        {editMode ? (
                          <div className="pd-row pd-gap-sm">
                            <input
                              type="number"
                              min={0}
                              className="pd-input pd-input--small"
                              value={post.valeur}
                              onChange={(e) => handlePostChange(idx, 'valeur', e.target.value)}
                            />
                            <span className="pd-text-xs pd-text-muted">EUR</span>
                          </div>
                        ) : (
                          <span className="pd-text-body">{formatValue(post)}</span>
                        )}
                      </td>
                      <td className="pd-table__cell pd-text-muted">
                        {editMode ? (
                          <input
                            className="pd-input"
                            value={post.details || ''}
                            onChange={(e) => handlePostChange(idx, 'details', e.target.value)}
                            placeholder="Ex : main d'oeuvre, matiere premiere, logistique..."
                          />
                        ) : (
                          post.details || '-'
                        )}
                      </td>
                      {editMode ? (
                        <td className="pd-table__cell">
                          <button
                            type="button"
                            onClick={() => setLocalPosts((prev) => prev.filter((_, idy) => idy !== idx))}
                            className="pd-link-btn"
                          >
                            Supprimer
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasGap ? (
              <div className="pd-alert pd-alert--warn">
                <Info size={14} />
                <span>
                  Ecart detecte : total {totalPosts.toFixed(2)} vs attendu {expectedTotal}. Ajustez vos postes.
                </span>
              </div>
            ) : null}
            {detail.repartitionValeur?.notePedagogique ? (
              <p className="pd-text-xs pd-text-muted">{detail.repartitionValeur.notePedagogique}</p>
            ) : null}
            {editMode ? (
              <button
                type="button"
                onClick={handleAddPost}
                className="pd-btn pd-btn--ghost pd-btn--dashed"
              >
                <Plus size={16} />
                Ajouter un poste
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const consumptionTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--wide pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-gap-sm">
            <MapPin className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Répartition des lieux d'achats</p>
          </div>
          <div className="pd-map">
            <div className="pd-map__label">
              <MapPin size={16} />
              <span>Carte des achats</span>
            </div>
          </div>
          <div className="pd-row pd-row--wrap pd-gap-sm">
            <div className="pd-stat-card">
              <p className="pd-text-xs pd-text-muted">Commandes actives</p>
              <p className="pd-text-strong">{ordersWithProduct.length}</p>
            </div>
            <div className="pd-stat-card">
              <p className="pd-text-xs pd-text-muted">Participants</p>
              <p className="pd-text-strong">{totalParticipants}</p>
            </div>
            <div className="pd-stat-card">
              <p className="pd-text-xs pd-text-muted">Kg mutualises</p>
              <p className="pd-text-strong">{totalOrderedWeight ? totalOrderedWeight.toFixed(1) : '-'}</p>
            </div>
          </div>
          {locationStats.length ? (
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Villes principales</p>
              <div className="pd-row pd-row--wrap pd-gap-xs">
                {locationStats.map((item) => (
                  <span key={item.label} className="pd-chip">
                    {item.label} ({item.count})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Pas encore de commandes localisees.</p>
          )}
        </div>

        <div className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-gap-sm">
            <Users className="pd-icon pd-icon--accent" />
            <p className="pd-section-title">Indicateurs par lot</p>
          </div>
          {display.productions?.length ? (
            <div className="pd-stack pd-stack--sm">
              {display.productions.map((lot) => {
                const total = lot.qteTotale ?? 0;
                const remaining = lot.qteRestante ?? 0;
                const mutualised = total ? Math.max(total - remaining, 0) : 0;
                return (
                  <div key={`cons-${lot.id}`} className="pd-lot-metrics pd-stack pd-stack--sm">
                    <div className="pd-row pd-row--between pd-text-sm">
                      <span className="pd-text-strong">{lot.nomLot}</span>
                      <span className="pd-text-xs pd-text-muted">{lot.statut.replace('_', ' ')}</span>
                    </div>
                    <div className="pd-grid pd-grid--three pd-gap-sm pd-text-xs pd-text-muted">
                      <div>
                        <p className="pd-label pd-label--tiny">Kg mutualises</p>
                        <p className="pd-text-body">{mutualised || '-'}</p>
                      </div>
                      <div>
                        <p className="pd-label pd-label--tiny">Participants</p>
                        <p className="pd-text-body">{totalParticipants || '-'}</p>
                      </div>
                      <div>
                        <p className="pd-label pd-label--tiny">Commandes</p>
                        <p className="pd-text-body">{ordersWithProduct.length || '-'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Pas encore de lots pour afficher les indicateurs.</p>
          )}
        </div>
      </div>

      <div className="pd-grid pd-grid--two pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Avis & commentaires</p>
          {detail.avis?.listeAvis?.length ? (
            <div className="pd-stack pd-stack--sm">
              <div className="pd-row pd-gap-sm pd-text-sm">
                <Star size={16} className="pd-icon pd-icon--star" />
                <span className="pd-text-strong">{detail.avis.noteMoyenne.toFixed(1)}</span>
                <span className="pd-text-muted">({detail.avis.nbAvis} avis)</span>
              </div>
              {detail.avis.listeAvis.map((avis) => (
                <div key={avis.commentaire} className="pd-review-card pd-stack pd-stack--xs">
                  <div className="pd-row pd-gap-sm pd-text-sm">
                    <CheckCircle2 size={14} className="pd-icon pd-icon--success" />
                    <span className="pd-text-strong">{avis.auteur}</span>
                    <span className="pd-text-xs pd-text-muted">{avis.date}</span>
                    <span className="pd-text-xs pd-text-muted">Note {avis.note}/5</span>
                  </div>
                  <p className="pd-text-body">{avis.commentaire}</p>
                  <button className="pd-link-btn">Marquer utile</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="pd-text-sm pd-text-muted">Pas encore d'avis.</p>
          )}
        </div>

        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Questions / FAQ</p>
          <div className="pd-stack pd-stack--xs">
            <label className="pd-text-sm" htmlFor="question-input">
              Poser une question
            </label>
            <textarea
              id="question-input"
              className="pd-textarea"
              placeholder="Comment ca marche, conditions de retrait..."
            />
            <button className="pd-btn pd-btn--primary">
              Publier la question
            </button>
          </div>
          {detail.questions?.listeQnA?.length ? (
            <div className="pd-stack pd-stack--sm">
              {detail.questions.listeQnA.map((qa, idx) => (
                <div key={`${qa.question}-${idx}`} className="pd-faq-card pd-stack pd-stack--xs">
                  <p className="pd-text-strong">{qa.question}</p>
                  <p className="pd-text-xs pd-text-muted">{qa.date}</p>
                  {qa.reponse ? <p className="pd-text-body">Reponse : {qa.reponse}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const transparencyTab = (
    <div className="pd-tab pd-stack pd-stack--lg">
      <div className="pd-grid pd-grid--two pd-gap-lg">
      
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Conservation & dates</p>
          <div className="pd-stack pd-stack--sm">
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">DLC / DDM</p>
              {editMode ? (
                <input
                  className="pd-input"
                  value={draft.dlcEstimee || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dlcEstimee: e.target.value }))}
                  placeholder="DLC estimee"
                />
              ) : (
                <p className="pd-text-body">DLC estimée : {display.dlcEstimee || '-'}</p>
              )}
              {selectedLot?.DLC_DDM ? (
                <p className="pd-text-xs pd-text-muted">Lot selectionné : {selectedLot.DLC_DDM}</p>
              ) : null}
            </div>
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">Conservation</p>
              <div className="pd-row pd-gap-sm pd-text-sm">
                <Thermometer size={16} />
                {editMode ? (
                  <select
                    className="pd-select"
                    value={draft.conservationMode || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, conservationMode: e.target.value as any }))}
                  >
                    <option value="">A preciser</option>
                    <option value="frais">Frais</option>
                    <option value="ambiant">Ambiant</option>
                    <option value="congele">Congele</option>
                  </select>
                ) : (
                  <span>{display.conservationMode ? `${display.conservationMode} (0-4C si frais)` : 'A preciser'}</span>
                )}
              </div>
              {display.compositionEtiquette?.conservationDetaillee ? (
                <p className="pd-text-xs pd-text-muted">{display.compositionEtiquette.conservationDetaillee}</p>
              ) : null}
            </div>
            <div className="pd-info-card pd-stack pd-stack--xs">
              <p className="pd-label">Apres ouverture</p>
              {editMode ? (
                <textarea
                  className="pd-textarea"
                  value={draft.compositionEtiquette?.conseilsUtilisation || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: { ...(prev.compositionEtiquette ?? {}), conseilsUtilisation: e.target.value },
                    }))
                  }
                  placeholder="Ex : consommer sous 48h apres ouverture."
                />
              ) : (
                <p className="pd-text-body">
                  {display.compositionEtiquette?.conseilsUtilisation || 'Consommer sous 48h apres ouverture.'}
                </p>
              )}
              <p className="pd-text-xs pd-text-muted">
                Congelation :{' '}
                {display.conservationMode === 'congele' ||
                (display.compositionEtiquette?.conservationDetaillee || '').toLowerCase().includes('congel')
                  ? 'oui'
                  : 'non'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pd-grid pd-grid--two pd-gap-lg">
        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Ingrédients & allérgenes</p>
          <div className="pd-stack pd-stack--sm">
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Dénomination de vente</p>
              {editMode ? (
                <input
                  className="pd-input"
                  value={draft.compositionEtiquette?.denominationVente || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: { ...(prev.compositionEtiquette ?? {}), denominationVente: e.target.value },
                    }))
                  }
                />
              ) : (
                <p>{display.compositionEtiquette?.denominationVente || 'A preciser'}</p>
              )}
            </div>
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Ingredients</p>
              {editMode ? (
                <textarea
                  className="pd-textarea"
                  value={(draft.compositionEtiquette?.ingredients || []).map((item) => item.nom).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...(prev.compositionEtiquette ?? {}),
                        ingredients: e.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean)
                          .map((value) => ({ nom: value })),
                      },
                    }))
                  }
                  placeholder="Ex : lait cru, ferments, sel..."
                />
              ) : display.compositionEtiquette?.ingredients?.length ? (
                <div className="pd-row pd-row--wrap pd-gap-xs">
                  {display.compositionEtiquette.ingredients.map((ingredient) => (
                    <span key={ingredient.nom} className="pd-chip">
                      {ingredient.nom}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">Ingredients a preciser.</p>
              )}
            </div>
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Allergenes</p>
              {editMode ? (
                <input
                  className="pd-input pd-input--warn"
                  value={(draft.compositionEtiquette?.allergenes || []).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...(prev.compositionEtiquette ?? {}),
                        allergenes: e.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
              ) : display.compositionEtiquette?.allergenes?.length ? (
                <div className="pd-row pd-row--wrap pd-gap-xs">
                  {display.compositionEtiquette.allergenes.map((allergene) => (
                    <span key={allergene} className="pd-chip pd-chip--warn">
                      {allergene}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="pd-text-sm pd-text-muted">Aucun allergene mentionne.</p>
              )}
            </div>
          </div>
        </div>

        <div className="pd-card pd-stack pd-stack--md">
          <p className="pd-section-title">Nutrition & composition</p>
          <div className="pd-stack pd-stack--sm">
            <div className="pd-stack pd-stack--xs">
              <p className="pd-label">Additifs / aromes</p>
              {editMode ? (
                <input
                  className="pd-input"
                  value={(draft.compositionEtiquette?.additifs || []).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...(prev.compositionEtiquette ?? {}),
                        additifs: e.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
              ) : display.compositionEtiquette?.additifs?.length ? (
                <p>{display.compositionEtiquette.additifs.join(', ')}</p>
              ) : (
                <p className="pd-text-sm pd-text-muted">Aucun additif renseigne.</p>
              )}
            </div>
            {display.compositionEtiquette?.nutrition ? (
              <div className="pd-nutrition">
                <div className="pd-nutrition__header">Nutrition pour 100g</div>
                <div className="pd-grid pd-grid--three pd-gap-sm pd-text-xs">
                  {Object.entries(display.compositionEtiquette.nutrition).map(([key, value]) => (
                    <div key={key} className="pd-row pd-row--between">
                      <span className="pd-text-muted">{key.replace(/_/g, ' ')}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="pd-text-sm pd-text-muted">Valeurs nutritionnelles a renseigner.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === 'circuit') return circuitTab;
    if (activeTab === 'quality') return qualityTab;
    if (activeTab === 'repartition') return repartitionTab;
    if (activeTab === 'consumption') return consumptionTab;
    if (activeTab === 'transparency') return transparencyTab;
    return null;
  };

  const relatedSections = [
    { id: 'producer', title: 'Du meme producteur', items: detail.produitsLies?.autresDuProducteur ?? [] },
    { id: 'formats', title: 'Autres formats', items: detail.produitsLies?.autresFormats ?? [] },
    { id: 'similar', title: 'Similaires', items: detail.produitsLies?.similaires ?? [] },
  ].filter((section) => section.items.length);
  const relatedItems = relatedSections.flatMap((section) =>
    section.items.map((item) => ({ item, sectionId: section.id }))
  );

  const handleOpenLinkedProduct = (productId: string, isCatalog: boolean) => {
    if (!onOpenRelatedProduct) return;
    if (!isCatalog) {
      toast.info('Produit indisponible dans le catalogue.');
      return;
    }
    onOpenRelatedProduct(productId);
  };

  const canToggleSave = Boolean(onToggleSave);
  const headerActions = React.useMemo(() => {
    if (!onHeaderActionsChange) return null;
    return (
      <>
        <button
          type="button"
          onClick={handleSaveToggle}
          className={`header-action-button header-action-button--ghost ${isSaved ? 'pd-btn--save-active' : ''}`}
          disabled={!canToggleSave}
        >
          <Heart className="header-action-icon" />
          <span className="header-action-label">
            {isSaved ? 'Dans ma selection' : 'Ajouter a ma selection'}
          </span>
        </button>
        {isOwner ? (
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className="header-action-button header-action-button--ghost"
          >
            <PenLine className="header-action-icon" />
            <span className="header-action-label">
              {editMode ? 'Quitter le mode edition' : 'Modifier'}
            </span>
          </button>
        ) : null}
      </>
    );
  }, [canToggleSave, editMode, handleSaveToggle, isOwner, isSaved, onHeaderActionsChange]);

  React.useEffect(() => {
    if (!onHeaderActionsChange) return;
    onHeaderActionsChange(headerActions);
  }, [headerActions, onHeaderActionsChange]);

  React.useEffect(() => {
    if (!onHeaderActionsChange) return;
    return () => onHeaderActionsChange(null);
  }, [onHeaderActionsChange]);

  return (
    <div className="pd-view">
      <div className="pd-stack pd-stack--lg">
        {isOwner && editMode ? (
          <div className="pd-card pd-card--soft pd-card--dashed pd-stack pd-stack--sm">
            {editCTA}
            <label className="pd-row pd-row--start pd-gap-sm pd-text-sm">
              <input
                type="checkbox"
                checked={notifyFollowers}
                onChange={(e) => setNotifyFollowers(e.target.checked)}
                className="pd-checkbox"
              />
              <div className="pd-stack pd-stack--xs">
                <span className="pd-text-strong">Notifier les personnes qui suivent ce produit</span>
                <p className="pd-text-sm pd-text-muted">Décochez si vous ne souhaitez pas notifier les personnes qui suivent ce produit.</p>
              </div>
            </label>
            {notifyFollowers ? (
              <div className="pd-stack pd-stack--xs">
                <label className="pd-text-strong" htmlFor="notification-message">
                  Message de notification
                </label>
                <textarea
                  id="notification-message"
                  className="pd-textarea"
                  placeholder="Ex : Nouveau lot disponible / Changement de DLC / Nouveau format..."
                  value={notificationMessage}
                  onChange={(e) => setNotificationMessage(e.target.value)}
                />
                <div className="pd-preview pd-stack pd-stack--xs">
                  <p className="pd-text-strong">Apercu de la notification</p>
                  <p className="pd-text-body">{detail.name}</p>
                  <p>{notificationMessage || 'Message a ajouter pour notifier vos abonnes.'}</p>
                  <p className="pd-link-accent">Lien vers le produit</p>
                </div>
              </div>
            ) : null}
            <div className="pd-row pd-row--wrap pd-gap-sm">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="pd-btn pd-btn--primary pd-btn--pill"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="pd-btn pd-btn--outline pd-btn--pill"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}

        <div className="pd-card pd-card--hero pd-card--tabs pd-stack pd-stack--lg">
          <div className="pd-grid pd-grid--hero pd-gap-lg">
          <div className="pd-stack pd-stack--md">
            <div className="pd-row pd-row--wrap pd-gap-sm">
              <span className="pd-badge pd-badge--category">
                {displayCategory}
              </span>
              {display.officialBadges?.map((badge) => (
                <span key={badge} className="pd-badge pd-badge--official">
                  {badge}
                </span>
              ))}
              {display.platformBadges?.map((badge) => (
                <span key={badge} className="pd-badge pd-badge--platform">
                  {badge}
                </span>
              ))}
            </div>
            {editMode ? (
              <div className="pd-stack pd-stack--sm">
                <input
                  className="pd-input pd-input--title"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  className="pd-input"
                  value={draft.category || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Categorie"
                />
              </div>
            ) : (
              <div className="pd-stack pd-stack--xs">
                <h1 className="pd-title">{display.name}</h1>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenProducer}
              className="pd-producer-button"
              disabled={!onOpenProducer}
            >
              <ImageWithFallback
                src={displayProducer.photo || display.productImage?.url || product.imageUrl}
                alt={displayProducer.name}
                className="pd-avatar"
              />
              <div>
                <div className="pd-row pd-gap-sm">
                  <p className="pd-text-strong pd-producer-name">{displayProducer.name}</p>
                  {displayProducer.badgesProducteur?.includes('Producteur verifie') ? (
                    <span className="pd-chip pd-chip--success">Verifié</span>
                  ) : null}
                </div>
                <p className="pd-row pd-gap-xs pd-text-xs pd-text-muted">
                  <MapPin size={14} className="pd-icon pd-icon--accent" />
                  {displayProducer.city || 'Ville proche'}
                </p>
              </div>
            </button>

            <div className="pd-row pd-row--wrap pd-gap-sm pd-text-sm">
              <span className="pd-price">{product.price.toFixed(2)} €</span>
              <span className="pd-measurement-inline">
                {measurementLabel} ({unitValue})
              </span>
            </div>

            {editMode ? (
              <div className="pd-row pd-row--wrap pd-gap-sm">
                <label className="pd-stack pd-stack--xs" htmlFor="product-measurement">
                  <span className="pd-label">Mesure</span>
                  <select
                    id="product-measurement"
                    className="pd-select"
                    value={localMeasurement}
                    onChange={(e) => setLocalMeasurement(e.target.value as Product['measurement'])}
                  >
                    <option value="kg">Kg</option>
                    <option value="unit">Unité</option>
                  </select>
                </label>
                <label className="pd-stack pd-stack--xs" htmlFor="product-unit">
                  <span className="pd-label">Unité</span>
                  <input
                    id="product-unit"
                    className="pd-input"
                    value={localUnit}
                    onChange={(e) => setLocalUnit(e.target.value)}
                    placeholder="Ex : colis, bouteille"
                  />
                </label>
              </div>
            ) : null}

            {editMode ? (
              <textarea
                className="pd-textarea"
                value={draft.longDescription || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, longDescription: e.target.value }))}
                placeholder="Description detaillée"
                rows={3}
              />
            ) : display.longDescription ? (
              <p className="pd-callout">{display.longDescription}</p>
            ) : null}

            <div className="pd-row pd-row--wrap pd-row--start pd-gap-sm">
              <button
                type="button"
                onClick={onCreateOrder}
                className="pd-btn pd-btn--primary pd-btn--pill"
              >
                Créer une commande avec ce produit
              </button>
              <button
                type="button"
                onClick={onParticipate}
                disabled={!hasOrders}
                className={`pd-btn pd-btn--pill ${hasOrders ? 'pd-btn--outline-primary' : 'pd-btn--disabled'}`}
              >
                Trouver des commandes de ce produit{' '}
                <span className="pd-text-xs pd-text-muted">({summaryOrdersLabel})</span>
              </button>
            </div>
          </div>

          <div className="pd-stack pd-stack--md">
            <div className="pd-media-card">
              <ImageWithFallback src={displayImage} alt={display.name} className="pd-media-image" />
            </div>
            {editMode ? (
              <label className="pd-stack pd-stack--xs" htmlFor="product-image-url">
                <span className="pd-label">Image du produit</span>
                <input
                  id="product-image-url"
                  className="pd-input"
                  value={draft.productImage?.url || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      productImage: {
                        ...(prev.productImage ?? { url: '', alt: prev.name }),
                        url: e.target.value,
                        alt: prev.productImage?.alt ?? prev.name,
                      },
                    }))
                  }
                  placeholder="URL de l'image"
                />
              </label>
            ) : null}
          </div>
          </div>

          <div className="pd-divider" />

          <div className="profile-tabs-wrapper" aria-label="Sections du produit">
            <div className="profile-tabs">
              {tabStats.map((stat) => {
                const isActive = activeTab === stat.id;
                const Icon = stat.icon;
                return (
                  <button
                    key={stat.id}
                    type="button"
                    onClick={() => setActiveTab(stat.id)}
                    aria-pressed={isActive}
                    aria-label={`${stat.label} (${stat.value})`}
                    className={`profile-tab${isActive ? ' profile-tab--active' : ''}`}
                  >
                    <Icon className="profile-tab-icon" />
                    <span className="profile-tab-label">{stat.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="profile-tab-content">{renderTabContent()}</div>
          </div>
        </div>
      </div>

      {relatedItems.length ? (
        <section className="pd-card pd-stack pd-stack--md">
          <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
            <h2 className="pd-section-title">Produits liés proches</h2>
          </div>
          <div className="pd-related-row">
            {relatedItems.map(({ item, sectionId }) => {
              const { product: relatedProduct, isCatalog } = buildLinkedProductCard(item);
              return (
                <ProductResultCard
                  key={`${sectionId}-${item.id}`}
                  product={relatedProduct}
                  related={[]}
                  canSave={false}
                  inDeck={false}
                  onOpen={(productId) => handleOpenLinkedProduct(productId, isCatalog)}
                  showSelectionControl={false}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};
