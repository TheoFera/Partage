import React from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  Heart,
  Info,
  MapPin,
  Package,
  PenLine,
  Plus,
  Share2,
  Star,
  Thermometer,
} from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { GroupOrder, Product, ProductDetail, ProductionLot, RepartitionPoste } from '../types';

interface ProductDetailViewProps {
  product: Product;
  detail: ProductDetail;
  ordersWithProduct: GroupOrder[];
  isOwner: boolean;
  isSaved?: boolean;
  onShare: () => void;
  onCreateOrder: () => void;
  onParticipate: () => void;
  onToggleSave?: (next: boolean) => void;
}

const SectionCard = ({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const sectionId = title.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="border border-[#F1E8D7] rounded-xl bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={sectionId}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-start justify-between gap-3 px-4 sm:px-6 py-4 text-left"
      >
        <div className="flex-1 space-y-1">
          <p className="text-base font-semibold text-[#1F2937]">{title}</p>
          {summary ? <p className="text-sm text-[#6B7280]">{summary}</p> : null}
        </div>
        <span className="text-[#6B7280]">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>
      {open ? (
        <div id={sectionId} className="border-t border-[#F1E8D7] px-4 sm:px-6 py-5">
          {children}
        </div>
      ) : null}
    </div>
  );
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
      <div className="h-[220px] rounded-xl border border-dashed border-[#F1E8D7] bg-[#FFF6EB] flex items-center justify-center">
        <p className="text-sm text-[#6B7280]">Renseignez des postes pour afficher le camembert.</p>
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
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Camembert de repartition de la valeur"
        className="shrink-0"
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
          {total.toFixed(2)} EUR
        </text>
      </svg>

      <div className="flex-1 space-y-2">
        {computed.map((slice) => (
          <div key={`${slice.label}-legend`} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-[#1F2937] font-semibold truncate">{slice.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[#6B7280]">
              <span>{formatValue({ nom: slice.label, valeur: slice.value, type: 'eur' })}</span>
              <span className="text-xs">({formatPercent(slice.percent)})</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-[#6B7280]">
          Camembert calcule automatiquement a partir des couts saisis dans le tableau.
        </p>
      </div>
    </div>
  );
};

const lotStatusBadge = (lot: ProductionLot) => {
  if (lot.statut === 'en_cours') return { label: 'En cours', className: 'bg-emerald-50 text-emerald-700' };
  if (lot.statut === 'a_venir') return { label: 'A venir', className: 'bg-amber-50 text-amber-700' };
  return { label: 'Epuise', className: 'bg-gray-100 text-gray-600' };
};

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  detail,
  ordersWithProduct,
  isOwner,
  isSaved,
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

  React.useEffect(() => {
    const posts = detail.repartitionValeur?.postes ?? [];
    setLocalPosts(posts.map((post) => ({ ...post, type: 'eur' })));
  }, [detail.repartitionValeur?.postes]);

  React.useEffect(() => {
    setDraft(detail);
  }, [detail]);

  const display = editMode ? draft : detail;

  const hasOrders = ordersWithProduct.length > 0;
  const summaryOrdersLabel = hasOrders
    ? `${ordersWithProduct.length} commande${ordersWithProduct.length > 1 ? 's' : ''} disponible`
    : 'Aucune commande active';

  const toggleFollow = () => {
    setIsFollowing((prev) => !prev);
    toast.success(!isFollowing ? 'Vous suivez ce produit.' : 'Vous ne suivez plus ce produit.');
  };

  const handleSaveToggle = () => {
    if (!onToggleSave) return;
    onToggleSave(!isSaved);
  };

  const handleAddPost = () => {
    setLocalPosts((prev) => [
      ...prev,
      { nom: 'Nouveau poste', valeur: 0, type: 'eur' },
    ]);
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

  const totalPosts = localPosts.reduce((acc, post) => acc + (Number.isFinite(post.valeur) ? post.valeur : 0), 0);
  const expectedTotal = detail.repartitionValeur?.totalReference;
  const hasGap =
    typeof expectedTotal === 'number' && expectedTotal > 0
      ? Math.abs(totalPosts - expectedTotal) > 0.5
      : false;

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

  const editCTA = (
    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
      <Info size={16} />
      <span>Mode propriétaire : editez inline, sauvegarde fictive pour le prototype.</span>
    </div>
  );

  const handleSaveEdit = () => {
    setEditMode(false);
    toast.success('Modifications enregistrées (demo).');
    if (notifyFollowers && !notificationMessage.trim()) {
      toast.error('Ajoutez un message de notification pour prevenir les abonnes.');
    }
  };

  const selectedLot = detail.productions?.find((lot) => lot.id === selectedLotId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#F1E8D7] p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-[#FFF1E6] text-[#B45309] text-xs font-semibold">
                  {display.category || product.category}
                </span>
                {display.officialBadges?.map((badge) => (
                  <span key={badge} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    {badge}
                  </span>
                ))}
                {display.platformBadges?.map((badge) => (
                  <span key={badge} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                    {badge}
                  </span>
                ))}
              </div>
              {editMode ? (
                <div className="space-y-2">
                  <input
                    className="w-full border border-[#F1E8D7] rounded-lg p-2 text-lg font-semibold text-[#1F2937]"
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm text-[#374151]"
                    value={draft.category || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="Categorie"
                  />
                  <input
                    className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm text-[#374151]"
                    value={draft.shortDescription || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    placeholder="Description courte"
                  />
                </div>
              ) : (
                <>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-[#1F2937] leading-tight">{display.name}</h1>
                  <p className="text-sm text-[#374151]">{display.shortDescription || product.description}</p>
                </>
              )}
            </div>
            <div className="hidden md:flex flex-col gap-2">
              <button
                type="button"
                onClick={toggleFollow}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm ${
                  isFollowing
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white border border-gray-200 text-[#374151]'
                }`}
              >
                <Bell size={16} />
                {isFollowing ? 'Deja suivi' : 'Suivre'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <ImageWithFallback
                src={detail.producer.photo || detail.productImage?.url || product.imageUrl}
                alt={detail.producer.name}
                className="w-12 h-12 rounded-full object-cover bg-[#F1E8D7]"
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#1F2937]">{detail.producer.name}</p>
                  {detail.producer.badgesProducteur?.includes('Producteur verifie') ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Verifie</span>
                  ) : null}
                </div>
                <p className="text-xs text-[#6B7280] flex items-center gap-1">
                  <MapPin size={14} className="text-[#FF6B4A]" />
                  {detail.producer.city || 'Ville proche'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detail.producer.liens?.map((link) => (
                <a
                  key={link.label}
                  className="inline-flex items-center gap-1 text-xs text-[#FF6B4A] hover:underline"
                  href={link.url}
                >
                  {link.label}
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </div>

          {detail.producer.shortStory ? (
            <p className="text-sm text-[#374151] bg-[#FFF6EB] border border-[#F1E8D7] rounded-lg p-3">
              {detail.producer.shortStory}
            </p>
          ) : null}

          <div className="flex flex-col lg:flex-row gap-2 items-start">
            <button
              type="button"
              onClick={onCreateOrder}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#FF6B4A] text-white text-sm font-semibold shadow-sm hover:bg-[#FF5A39] transition-colors"
            >
              Créer une commande avec ce produit
            </button>
            <button
              type="button"
              onClick={onParticipate}
              disabled={!hasOrders}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition-colors ${
                hasOrders
                  ? 'bg-white text-[#FF6B4A] border border-[#FF6B4A]'
                  : 'bg-white text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              Trouver des commandes de ce produit{' '}
              <span className="text-[11px] text-[#6B7280]">({summaryOrdersLabel})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleFollow}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                isFollowing
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-white border border-gray-200 text-[#374151]'
              }`}
            >
              <Bell size={16} />
              {isFollowing ? 'Deja suivi' : 'Suivre'}
            </button>
            <button
              type="button"
              onClick={handleSaveToggle}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                isSaved ? 'bg-[#FFF1E6] border-[#FF6B4A] text-[#B45309]' : 'bg-white border-gray-200 text-[#374151]'
              }`}
            >
              <Heart size={16} />
              {isSaved ? 'Dans ma sélection' : 'Ajouter à ma selection'}
            </button>
            {isOwner ? (
              <button
                type="button"
                onClick={() => setEditMode((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-[#1F2937]/10 text-[#1F2937]"
              >
                <PenLine size={16} />
                {editMode ? 'Quitter le mode edition' : 'Modifier'}
              </button>
            ) : null}
          </div>

          {isOwner && editMode ? (
            <div className="border border-dashed border-[#FF6B4A]/50 rounded-xl bg-[#FFF6EB] p-4 space-y-3">
              {editCTA}
              <label className="flex items-start gap-3 text-sm text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={notifyFollowers}
                  onChange={(e) => setNotifyFollowers(e.target.checked)}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <span className="font-semibold">Notifier les personnes qui suivent ce produit</span>
                  <p className="text-[#6B7280] text-sm">
                    Decochez pour les micro-changements. Suggestion automatique si un lot passe en vente.
                  </p>
                </div>
              </label>
              {notifyFollowers ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#1F2937]" htmlFor="notification-message">
                    Message de notification
                  </label>
                  <textarea
                    id="notification-message"
                    className="w-full border border-[#F1E8D7] rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/40"
                    placeholder="Ex : Nouveau lot disponible / Changement de DLC / Nouveau format..."
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                  />
                  <div className="text-xs text-[#6B7280] bg-white border border-[#F1E8D7] rounded-lg p-3">
                    <p className="font-semibold text-[#1F2937] mb-1">Apercu de la notification que recevront vos abonnés</p>
                    <p className="text-[#1F2937]">{detail.name}</p>
                    <p>{notificationMessage || 'Message à ajouter pour notifier vos abonnés.'}</p>
                    <p className="text-[#FF6B4A]">Lien vers le produit</p>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-4 py-2 rounded-lg bg-[#FF6B4A] text-white font-semibold shadow-sm hover:bg-[#FF5A39]"
                >
                  Sauvegarder
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-[#374151] font-semibold"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-[#F1E8D7] overflow-hidden">
            <div className="relative">
              <ImageWithFallback
                src={detail.productImage?.url || product.imageUrl}
                alt={detail.productImage?.alt || product.name}
                className="w-full h-64 sm:h-80 object-cover"
              />
              {detail.productImage?.etiquetteUrl ? (
                <a
                  href={detail.productImage.etiquetteUrl}
                  className="absolute bottom-4 right-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 text-sm text-[#1F2937] shadow-sm"
                >
                  <Package size={16} />
                  Voir l'étiquette
                </a>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#F1E8D7] p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-[#FF6B4A]" />
              <p className="text-sm text-[#1F2937] font-semibold">En un coup d'oeil</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#F9F2E4]">
                <p className="text-xs text-[#6B7280] uppercase">Origine</p>
                {editMode ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.origineZone || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, resumePictos: { ...prev.resumePictos, origineZone: e.target.value } }))
                      }
                      placeholder="Zone ou region"
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.paysOrigine || draft.originCountry || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: { ...prev.resumePictos, paysOrigine: e.target.value },
                          originCountry: e.target.value,
                        }))
                      }
                      placeholder="Pays d'origine"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1F2937]">
                      {display.resumePictos?.origineZone || display.zones?.[0] || 'Origine locale'}
                    </p>
                    <p className="text-xs text-[#6B7280]">{display.resumePictos?.paysOrigine || display.originCountry}</p>
                  </>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[#F9F2E4]">
                <p className="text-xs text-[#6B7280] uppercase">Conservation</p>
                {editMode ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.modeConservation || draft.conservationMode || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: { ...prev.resumePictos, modeConservation: e.target.value as any },
                          conservationMode: e.target.value as any,
                        }))
                      }
                      placeholder="Conservation (frais/ambiant/congele)"
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.dlcAReceptionEstimee || draft.dlcEstimee || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: { ...prev.resumePictos, dlcAReceptionEstimee: e.target.value },
                          dlcEstimee: e.target.value,
                        }))
                      }
                      placeholder="DLC estimée"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1F2937] capitalize">
                      {display.resumePictos?.modeConservation || display.conservationMode || 'A preciser'}
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      DLC estimée : {display.resumePictos?.dlcAReceptionEstimee || display.dlcEstimee || '-'}
                    </p>
                  </>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[#F9F2E4]">
                <p className="text-xs text-[#6B7280] uppercase">Format / Conditionnement</p>
                {editMode ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.formatConditionnement || draft.conditionnementPrincipal || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: { ...prev.resumePictos, formatConditionnement: e.target.value },
                          conditionnementPrincipal: e.target.value,
                        }))
                      }
                      placeholder="Format / conditionnement"
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.portions || draft.portions || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: { ...prev.resumePictos, portions: e.target.value },
                          portions: e.target.value,
                        }))
                      }
                      placeholder="Portions / usages"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1F2937]">
                      {display.resumePictos?.formatConditionnement || display.conditionnementPrincipal || product.unit}
                    </p>
                    <p className="text-xs text-[#6B7280]">Portions : {display.resumePictos?.portions || display.portions || 'A preciser'}</p>
                  </>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[#F9F2E4]">
                <p className="text-xs text-[#6B7280] uppercase">Chaine</p>
                {editMode ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-[#1F2937]">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.resumePictos?.chaineDuFroid)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            resumePictos: { ...prev.resumePictos, chaineDuFroid: e.target.checked },
                          }))
                        }
                      />
                      Chaine du froid
                    </label>
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.chaineAnimal?.naissance || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: {
                            ...prev.resumePictos,
                            chaineAnimal: { ...(prev.resumePictos?.chaineAnimal || {}), naissance: e.target.value },
                          },
                        }))
                      }
                      placeholder="Naissance"
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                      value={draft.resumePictos?.chaineAnimal?.elevage || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          resumePictos: {
                            ...prev.resumePictos,
                            chaineAnimal: { ...(prev.resumePictos?.chaineAnimal || {}), elevage: e.target.value },
                          },
                        }))
                      }
                      placeholder="Elevage"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1F2937]">
                      {display.resumePictos?.chaineDuFroid ? 'Chaine du froid' : 'Ambiant / stabilise'}
                    </p>
                    {display.resumePictos?.chaineAnimal ? (
                      <p className="text-xs text-[#6B7280]">
                        Naissance {display.resumePictos.chaineAnimal.naissance} - Elevage {display.resumePictos.chaineAnimal.elevage} -{' '}
                        {display.resumePictos.chaineAnimal.abattage || 'Abattage N/A'} - Transformation{' '}
                        {display.resumePictos.chaineAnimal.transformation}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SectionCard
        title="Description & usages"
        summary={detail.shortDescription || 'Description longue, conseils degustation, idées recettes'}
        defaultOpen
      >
        <div className="space-y-3 text-sm text-[#374151] leading-relaxed">
          {editMode ? (
            <textarea
              className="w-full border border-[#F1E8D7] rounded-lg p-3 text-sm"
              rows={4}
              value={draft.longDescription || ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, longDescription: e.target.value }))}
            />
          ) : (
            <p>{display.longDescription || product.description}</p>
          )}
          {detail.compositionEtiquette?.conseilsUtilisation ? (
            <div className="p-3 rounded-lg bg-[#F9F2E4] border border-[#F1E8D7]">
              <p className="text-xs uppercase text-[#6B7280]">Conseils degustation</p>
              {editMode ? (
                <textarea
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                  value={draft.compositionEtiquette?.conseilsUtilisation || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: { ...prev.compositionEtiquette, conseilsUtilisation: e.target.value },
                    }))
                  }
                />
              ) : (
                <p className="text-sm text-[#1F2937]">{display.compositionEtiquette?.conseilsUtilisation}</p>
              )}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Formats & infos pratiques"
        summary={`Formats disponibles : ${display.formats?.length || 1} - Achat via commande (participer / creer)`}
        defaultOpen
      >
        <div className="space-y-3">
          {display.formats?.map((format, idx) => (
            <div
              key={format.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-[#F1E8D7] rounded-lg p-3"
            >
              <div>
                {editMode ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm font-semibold text-[#1F2937]"
                      value={format.label}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          formats: (prev.formats || []).map((f, fIdx) => (fIdx === idx ? { ...f, label: e.target.value } : f)),
                        }))
                      }
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-xs text-[#374151]"
                      value={format.poidsNet}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          formats: (prev.formats || []).map((f, fIdx) => (fIdx === idx ? { ...f, poidsNet: e.target.value } : f)),
                        }))
                      }
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-xs text-[#374151]"
                      value={format.conditionnement}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          formats: (prev.formats || []).map((f, fIdx) =>
                            fIdx === idx ? { ...f, conditionnement: e.target.value } : f
                          ),
                        }))
                      }
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-xs text-[#374151]"
                      value={format.uniteVente}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          formats: (prev.formats || []).map((f, fIdx) => (fIdx === idx ? { ...f, uniteVente: e.target.value as any } : f)),
                        }))
                      }
                    />
                    <input
                      className="w-full border border-[#F1E8D7] rounded-lg p-2 text-xs text-[#374151]"
                      value={format.codeEAN || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          formats: (prev.formats || []).map((f, fIdx) => (fIdx === idx ? { ...f, codeEAN: e.target.value } : f)),
                        }))
                      }
                      placeholder="Code EAN"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#1F2937]">{format.label}</p>
                    <p className="text-xs text-[#6B7280]">
                      {format.poidsNet} - {format.conditionnement} - Unite : {format.uniteVente}
                    </p>
                    {format.codeEAN ? <p className="text-xs text-[#6B7280]">EAN : {format.codeEAN}</p> : null}
                  </>
                )}
              </div>
              <span className="text-xs text-[#6B7280]">Info uniquement - commande via Participer / Creer</span>
            </div>
          )) || <p className="text-sm text-[#6B7280]">Formats a preciser.</p>}
        </div>
      </SectionCard>

      <SectionCard
        title="Repartition de la valeur"
        summary={
          detail.repartitionValeur?.postes?.length
            ? `Lecture en ${detail.repartitionValeur.uniteReference} - ${detail.repartitionValeur.mode === 'detaille' ? 'Detaille' : 'Estimatif'}`
            : "Le producteur n'a pas encore renseigne la repartition"
        }
      >
        {localPosts.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Le producteur n'a pas encore renseigné la repartition.</p>
        ) : (
          <div className="space-y-4">
            <ValuePieChart
              slices={localPosts.map((post, idx) => ({
                label: post.nom || `Poste ${idx + 1}`,
                value: Number.isFinite(post.valeur) ? post.valeur : 0,
                color: PIE_COLORS[idx % PIE_COLORS.length],
              }))}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-xs uppercase text-[#6B7280]">
                  <tr>
                    <th className="py-2 pr-3">Poste</th>
                    <th className="py-2 pr-3">Cout (EUR)</th>
                    <th className="py-2 pr-3">Details</th>
                    {editMode ? <th className="py-2">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {localPosts.map((post, idx) => (
                    <tr key={post.nom} className="border-t border-[#F1E8D7]">
                      <td className="py-2 pr-3">
                        {editMode ? (
                          <input
                            className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                            value={post.nom}
                            onChange={(e) => handlePostChange(idx, 'nom', e.target.value)}
                          />
                        ) : (
                          <span className="font-semibold text-[#1F2937]">{post.nom}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              className="w-28 border border-[#F1E8D7] rounded-lg p-2 text-sm"
                              value={post.valeur}
                              onChange={(e) => handlePostChange(idx, 'valeur', e.target.value)}
                            />
                            <span className="text-xs text-[#6B7280]">EUR</span>
                          </div>
                        ) : (
                          <span className="text-[#1F2937]">{formatValue(post)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-[#6B7280]">
                        {editMode ? (
                          <input
                            className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm text-[#374151]"
                            value={post.details || ''}
                            onChange={(e) => handlePostChange(idx, 'details', e.target.value)}
                            placeholder="Ex : main d'oeuvre, matiere premiere, logistique..."
                          />
                        ) : (
                          post.details || '-'
                        )}
                      </td>
                      {editMode ? (
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setLocalPosts((prev) => prev.filter((_, idy) => idy !== idx))}
                            className="text-xs text-[#FF6B4A] hover:underline"
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
              <div className="flex items-center gap-2 text-xs text-[#B45309] bg-[#FFF1E6] border border-[#FF6B4A]/40 rounded-lg p-3">
                <Info size={14} />
                <span>
                  Écart détecté : total {totalPosts.toFixed(2)} vs attendu {expectedTotal}. Ajustez vos postes.
                </span>
              </div>
            ) : null}
            {detail.repartitionValeur?.notePedagogique ? (
              <p className="text-xs text-[#6B7280]">{detail.repartitionValeur.notePedagogique}</p>
            ) : null}
            {editMode ? (
              <button
                type="button"
                onClick={handleAddPost}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-[#374151]"
              >
                <Plus size={16} />
                Ajouter un poste
              </button>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Composition & etiquette"
        summary={`Denomination : ${detail.compositionEtiquette?.denominationVente || 'A preciser'}`}
      >
        <div className="space-y-3 text-sm text-[#374151]">
          <p>
            <span className="font-semibold">Denomination de vente : </span>
            {editMode ? (
              <input
                className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                value={draft.compositionEtiquette?.denominationVente || ''}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    compositionEtiquette: { ...prev.compositionEtiquette, denominationVente: e.target.value },
                  }))
                }
              />
            ) : (
              detail.compositionEtiquette?.denominationVente || 'A preciser'
            )}
          </p>
          {detail.compositionEtiquette?.ingredients ? (
            <p>
              <span className="font-semibold">Ingrédients : </span>
              {editMode ? (
                <textarea
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                  value={(draft.compositionEtiquette?.ingredients || []).map((i) => i.nom).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...prev.compositionEtiquette,
                        ingredients: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                          .map((nom) => ({ nom })),
                      },
                    }))
                  }
                  placeholder="Ingrédients separes par des virgules"
                />
              ) : (
                detail.compositionEtiquette.ingredients.map((item, idx) => (
                  <span key={item.nom}>
                    {item.nom}
                    {idx < (detail.compositionEtiquette?.ingredients?.length ?? 0) - 1 ? ', ' : ''}
                  </span>
                ))
              )}
            </p>
          ) : null}
          {detail.compositionEtiquette?.allergenes?.length ? (
            <p>
              <span className="font-semibold">Allergènes : </span>
              {editMode ? (
                <input
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm text-[#B45309]"
                  value={(draft.compositionEtiquette?.allergenes || []).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...prev.compositionEtiquette,
                        allergenes: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
              ) : (
                <span className="text-[#B45309]">{detail.compositionEtiquette.allergenes.join(', ')}</span>
              )}
            </p>
          ) : null}
          {detail.compositionEtiquette?.additifs?.length ? (
            <p>
              <span className="font-semibold">Additifs / aromes : </span>
              {editMode ? (
                <input
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                  value={(draft.compositionEtiquette?.additifs || []).join(', ')}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: {
                        ...prev.compositionEtiquette,
                        additifs: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
              ) : (
                detail.compositionEtiquette.additifs.join(', ')
              )}
            </p>
          ) : null}
          {detail.compositionEtiquette?.nutrition ? (
            <div className="border border-[#F1E8D7] rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-[#F9F2E4] text-xs font-semibold text-[#1F2937]">Nutrition pour 100g</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 text-xs text-[#1F2937]">
                {Object.entries(detail.compositionEtiquette.nutrition).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="capitalize text-[#6B7280]">{key.replace(/_/g, ' ')}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {detail.compositionEtiquette?.conservationDetaillee ? (
            <p>
              <span className="font-semibold">Conservation detaillée : </span>
              {editMode ? (
                <textarea
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                  value={draft.compositionEtiquette?.conservationDetaillee || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      compositionEtiquette: { ...prev.compositionEtiquette, conservationDetaillee: e.target.value },
                    }))
                  }
                />
              ) : (
                detail.compositionEtiquette.conservationDetaillee
              )}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Conservation & dates"
        summary={`DLC/DDM : ${detail.dlcEstimee || 'A préciser'} - Conservation ${detail.conservationMode || 'A préciser'}`}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-[#F1E8D7] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">DLC / DDM</p>
            {editMode ? (
              <input
                className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm text-[#1F2937]"
                value={draft.dlcEstimee || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, dlcEstimee: e.target.value }))}
                placeholder="DLC estimée"
              />
            ) : (
              <p className="text-sm text-[#1F2937]">DLC estimée : {detail.dlcEstimee || '-'}</p>
            )}
            {selectedLot?.DLC_DDM ? (
              <p className="text-xs text-[#6B7280]">Lot selectionné : {selectedLot.DLC_DDM}</p>
            ) : null}
          </div>
          <div className="border border-[#F1E8D7] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">Conservation</p>
            <div className="flex items-center gap-2 text-sm text-[#1F2937]">
              <Thermometer size={16} />
              {editMode ? (
                <input
                  className="w-full border border-[#F1E8D7] rounded-lg p-2 text-sm"
                  value={draft.conservationMode || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, conservationMode: e.target.value as any }))}
                  placeholder="Conservation"
                />
              ) : (
                <span>{detail.conservationMode ? `${detail.conservationMode} (0-4C si frais)` : 'A preciser'}</span>
              )}
            </div>
            {detail.compositionEtiquette?.conservationDetaillee ? (
              <p className="text-xs text-[#6B7280] mt-1">{detail.compositionEtiquette.conservationDetaillee}</p>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Origine & tracabilite"
        summary={`Production : ${detail.tracabilite?.lieuProduction || 'A preciser'} - Transformation : ${
          detail.tracabilite?.lieuTransformation || 'A preciser'
        }`}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm text-[#374151]">
            <span className="px-3 py-1 rounded-full bg-[#F9F2E4] text-[#1F2937]">
              Pays d'origine :{' '}
              {editMode ? (
                <input
                  className="ml-1 border border-[#F1E8D7] rounded-lg p-1 text-sm"
                  value={draft.tracabilite?.paysOrigine || draft.originCountry || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      tracabilite: { ...prev.tracabilite, paysOrigine: e.target.value },
                      originCountry: e.target.value,
                    }))
                  }
                />
              ) : (
                detail.tracabilite?.paysOrigine || detail.originCountry || 'A preciser'
              )}
            </span>
            {detail.tracabilite?.lieuProduction ? (
              <span className="px-3 py-1 rounded-full bg-[#F9F2E4] text-[#1F2937]">
                Production :{' '}
                {editMode ? (
                  <input
                    className="ml-1 border border-[#F1E8D7] rounded-lg p-1 text-sm"
                    value={draft.tracabilite?.lieuProduction || ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        tracabilite: { ...prev.tracabilite, lieuProduction: e.target.value },
                      }))
                    }
                  />
                ) : (
                  detail.tracabilite.lieuProduction
                )}
              </span>
            ) : null}
            {detail.tracabilite?.lieuTransformation ? (
              <span className="px-3 py-1 rounded-full bg-[#F9F2E4] text-[#1F2937]">
                Transformation :{' '}
                {editMode ? (
                  <input
                    className="ml-1 border border-[#F1E8D7] rounded-lg p-1 text-sm"
                    value={draft.tracabilite?.lieuTransformation || ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        tracabilite: { ...prev.tracabilite, lieuTransformation: e.target.value },
                      }))
                    }
                  />
                ) : (
                  detail.tracabilite.lieuTransformation
                )}
              </span>
            ) : null}
          </div>
          {detail.tracabilite?.timeline ? (
            <div className="space-y-2">
              {detail.tracabilite.timeline.map((step) => (
                <div key={step.etape} className="flex items-start gap-3">
                  <div className="pt-1">
                    <Circle size={10} className="text-[#FF6B4A]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2937]">{step.etape}</p>
                    <p className="text-xs text-[#6B7280]">{step.lieu}</p>
                    <p className="text-xs text-[#6B7280]">{step.date}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {detail.tracabilite?.preuves?.length ? (
            <div className="flex flex-wrap gap-2">
              {detail.tracabilite.preuves.map((preuve) => (
                <a
                  key={preuve.label}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#F1E8D7] text-sm text-[#374151]"
                  href={preuve.url}
                >
                  <ExternalLink size={14} />
                  {preuve.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Conditions de production"
        summary={detail.productionConditions?.modeProduction || 'Mode de production à preciser'}
      >
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-[#374151]">
          <div className="border border-[#F1E8D7] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">Mode de production</p>
            <p className="text-sm text-[#1F2937]">{detail.productionConditions?.modeProduction || 'A preciser'}</p>
          </div>
          <div className="border border-[#F1E8D7] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">Intrants / pesticides</p>
            <p className="text-sm text-[#1F2937]">
              {detail.productionConditions?.intrantsPesticides?.utilise ? 'Utilisation declarée' : 'Non utilise'}
            </p>
            <p className="text-xs text-[#6B7280]">{detail.productionConditions?.intrantsPesticides?.details}</p>
          </div>
          {detail.productionConditions?.bienEtreAnimal ? (
            <div className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-xs text-[#6B7280] uppercase">Bien-être animal</p>
              <p className="text-sm text-[#1F2937]">{detail.productionConditions.bienEtreAnimal}</p>
            </div>
          ) : null}
          {detail.productionConditions?.social ? (
            <div className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-xs text-[#6B7280] uppercase">Social</p>
              <p className="text-sm text-[#1F2937]">{detail.productionConditions.social}</p>
            </div>
          ) : null}
          {detail.productionConditions?.environnement ? (
            <div className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-xs text-[#6B7280] uppercase">Environnement</p>
              <p className="text-sm text-[#1F2937]">{detail.productionConditions.environnement}</p>
            </div>
          ) : null}
        </div>
        {detail.productionConditions?.preuves?.length ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {detail.productionConditions.preuves.map((preuve) => (
              <a
                key={preuve.label}
                href={preuve.url}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#F1E8D7] text-sm text-[#374151]"
              >
                <ExternalLink size={14} />
                {preuve.label}
              </a>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Productions / lots"
        summary={
          detail.productions?.length
            ? `${detail.productions.filter((lot) => lot.statut === 'en_cours').length} lot(s) en cours`
            : 'Aucun lot renseigne'
        }
      >
        {detail.productions?.length ? (
          <div className="space-y-3">
            {detail.productions.map((lot) => {
              const badge = lotStatusBadge(lot);
              return (
                <div key={lot.id} className="border border-[#F1E8D7] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                      <p className="text-sm font-semibold text-[#1F2937]">{lot.nomLot}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLotId(lot.id)}
                      className={`text-xs px-3 py-1 rounded-lg border ${
                        selectedLotId === lot.id ? 'border-[#FF6B4A] text-[#FF6B4A]' : 'border-gray-200 text-[#374151]'
                      }`}
                    >
                      {selectedLotId === lot.id ? 'Selectionne pour créer' : 'Selectionner ce lot'}
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs text-[#6B7280]">
                    <p>
                      Disponibilité : {lot.periodeDisponibilite?.debut} {'->'} {lot.periodeDisponibilite?.fin}
                    </p>
                    <p>
                      Quantites : {lot.qteRestante ?? '-'} / {lot.qteTotale ?? '-'}
                    </p>
                    <p>DLC / DDM : {lot.DLC_DDM || lot.DLC_aReceptionEstimee || '-'}</p>
                    <p>Lot #{lot.numeroLot || 'A preciser'}</p>
                  </div>
                  {lot.commentaire ? <p className="text-sm text-[#374151]">{lot.commentaire}</p> : null}
                  {lot.piecesJointes?.length ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {lot.piecesJointes.map((piece) => (
                        <a
                          key={piece.label}
                          href={piece.url}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#F1E8D7] text-[#374151]"
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
            <p className="text-xs text-[#6B7280]">Sélectionnez un lot pour le pré-remplissage de la création de commande.</p>
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">Pas encore de lots publiés.</p>
        )}
      </SectionCard>

      <SectionCard title="Avis & commentaires" summary={`${detail.avis?.noteMoyenne || '-'} - ${detail.avis?.nbAvis || 0} avis`}>
        {detail.avis?.listeAvis?.length ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-[#1F2937]">
              <Star size={16} className="text-amber-500" />
              <span className="font-semibold">{detail.avis.noteMoyenne.toFixed(1)}</span>
              <span className="text-[#6B7280]">({detail.avis.nbAvis} avis)</span>
            </div>
            {detail.avis.listeAvis.map((avis) => (
              <div key={avis.commentaire} className="border border-[#F1E8D7] rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-[#1F2937]">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="font-semibold">{avis.auteur}</span>
                  <span className="text-xs text-[#6B7280]">{avis.date}</span>
                  <span className="text-xs text-[#6B7280]">Note {avis.note}/5</span>
                </div>
                <p className="text-sm text-[#374151] mt-1">{avis.commentaire}</p>
                <button className="text-xs text-[#FF6B4A] mt-2">Marquer utile</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">Pas encore d'avis.</p>
        )}
      </SectionCard>

      <SectionCard title="Questions / FAQ" summary={`Questions actives : ${detail.questions?.listeQnA?.length || 0}`}>
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm text-[#1F2937]" htmlFor="question-input">
              Poser une question
            </label>
            <textarea
              id="question-input"
              className="w-full border border-[#F1E8D7] rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/40"
              placeholder="Comment ca marche, conditions de retrait..."
            />
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF6B4A] text-white text-sm">
              Publier la question
            </button>
          </div>
          {detail.questions?.listeQnA?.map((qa, idx) => (
            <div key={`${qa.question}-${idx}`} className="border border-[#F1E8D7] rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-[#1F2937]">{qa.question}</p>
              <p className="text-xs text-[#6B7280]">{qa.date}</p>
              {qa.reponse ? <p className="text-sm text-[#374151]">Réponse : {qa.reponse}</p> : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Produits liés" summary="Produits du même producteur ou similaires">
        <div className="grid sm:grid-cols-3 gap-3">
          {detail.produitsLies?.autresFormats?.map((item) => (
            <div key={`fmt-${item.id}`} className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#1F2937]">{item.name}</p>
              <p className="text-xs text-[#6B7280]">{item.category}</p>
              <p className="text-xs text-[#6B7280]">{item.city}</p>
            </div>
          ))}
          {detail.produitsLies?.autresDuProducteur?.map((item) => (
            <div key={`prod-${item.id}`} className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#1F2937]">{item.name}</p>
              <p className="text-xs text-[#6B7280]">{item.category}</p>
              <p className="text-xs text-[#6B7280]">{item.city}</p>
            </div>
          ))}
          {detail.produitsLies?.similaires?.map((item) => (
            <div key={`sim-${item.id}`} className="border border-[#F1E8D7] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#1F2937]">{item.name}</p>
              <p className="text-xs text-[#6B7280]">{item.category}</p>
              <p className="text-xs text-[#6B7280]">{item.city}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};
