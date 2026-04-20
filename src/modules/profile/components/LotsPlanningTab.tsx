import React from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Loader2, Package, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductionLot } from '../../../shared/types';
import '../../products/pages/ProductDetailView.css';
import {
  applyProductionLotPatch,
  createEmptyProductionLot,
  formatLotPriceWithUnit,
  formatProductionLotStatusLabel,
  getLotSaveErrorMessage,
  normalizeProductionLot,
  validateProductionLotDraft,
} from '../../products/utils/lots';
import { useProducerLotsPlanning } from '../hooks/useProducerLotsPlanning';
import {
  buildPlanningMonths,
  buildPlanningRange,
  buildPlanningRows,
  formatPlanningDateLabel,
  getPlanningOffsetDays,
} from '../utils/lotsPlanning';

type LotsPlanningTabProps = {
  products: Product[];
  supabaseClient?: SupabaseClient | null;
  onAddProductClick?: () => void;
  onOpenProduct?: (productId: string) => void;
  onRefreshProducts?: () => Promise<void> | void;
};

type HoveredLotState = {
  productName: string;
  lotName: string;
  statusLabel: string;
  statusStyle: { backgroundColor: string; borderColor: string; color: string };
  startLabel: string;
  endLabel: string;
  priceLabel: string;
  quantityLabel: string;
  viewportLeft: number;
  viewportY: number;
};

type PlanningConfirmationState =
  | {
      action: 'create' | 'delete';
      title: string;
      message: string;
      confirmLabel: string;
      tone?: 'danger' | 'default';
    }
  | null;

const LEFT_COLUMN_WIDTH = 220;
const LANE_HEIGHT = 28;
const LANE_GAP = 8;
const ROW_PADDING = 12;
const HEADER_HEIGHT = 64;
const ACTION_COLUMN_WIDTH = 56;
const LOT_TEXT_MIN_WIDTH = 104;
const TIMELINE_END_PADDING = 12;
const LOT_TOOLTIP_WIDTH = 288;
const FALLBACK_TIMELINE_VIEWPORT_WIDTH = 720;
const TODAY_LINE_COLOR = '#FF6B4A';
const PRODUCT_ROW_VERTICAL_PADDING = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const planningViewOptions = [
  { id: 'fit', label: 'Ajuster', visibleMonths: null },
  { id: '3m', label: '3 mois', visibleMonths: 3 },
  { id: '6m', label: '6 mois', visibleMonths: 6 },
  { id: '12m', label: '12 mois', visibleMonths: 12 },
] as const;

type PlanningViewId = (typeof planningViewOptions)[number]['id'];

const statusStyles: Record<
  ProductionLot['statut'],
  { backgroundColor: string; borderColor: string; color: string }
> = {
  a_venir: { backgroundColor: '#D1D5DB', borderColor: '#9CA3AF', color: '#1F2937' },
  en_cours: { backgroundColor: '#86EFAC', borderColor: '#22C55E', color: '#14532D' },
  epuise: { backgroundColor: '#FCA5A5', borderColor: '#EF4444', color: '#7F1D1D' },
};

const buildLocalTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const toUtcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

const addDaysUtc = (value: Date, days: number) =>
  toUtcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days);

const endOfMonthUtc = (value: Date) => toUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, 0);

const diffDaysUtc = (start: Date, end: Date) =>
  Math.round(
    (Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) /
      MS_PER_DAY
  );

const getRangeDaysForVisibleMonths = (rangeStart: Date, visibleMonths: number) => {
  let totalDays = 0;
  for (let monthOffset = 0; monthOffset < visibleMonths; monthOffset += 1) {
    const monthStart = toUtcDate(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + monthOffset, 1);
    const monthEnd = endOfMonthUtc(monthStart);
    totalDays += diffDaysUtc(monthStart, monthEnd) + 1;
  }
  return totalDays;
};

const formatPlanningMonthHeader = (date: Date) => {
  const monthLabel = date.toLocaleDateString('fr-FR', { month: 'long' });
  return {
    month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    year: String(date.getFullYear()),
  };
};

const buildLotTooltipLabel = (
  product: Product,
  lot: ProductionLot,
  startDate: string,
  endDate: string,
  priceLabel: string,
  quantityLabel: string
) =>
  [
    product.name,
    lot.nomLot || 'Lot sans nom',
    `Statut : ${formatProductionLotStatusLabel(lot.statut)}`,
    `Début : ${formatPlanningDateLabel(startDate)}`,
    `Fin : ${endDate ? formatPlanningDateLabel(endDate) : 'Non précisée'}`,
    `Prix : ${priceLabel}`,
    `Quantités : ${quantityLabel}`,
  ].join('\n');

const formatLotQuantityLabel = (product: Product, lot: ProductionLot) => {
  const unitLabel = product.measurement === 'kg' ? 'Kg' : 'unité';
  const formatValue = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    if (product.measurement === 'kg') {
      const digits = Number.isInteger(value) ? 0 : 2;
      return value.toFixed(digits).replace('.', ',');
    }
    return String(Math.round(value));
  };
  return `${formatValue(lot.qteTotale)} ${unitLabel} / ${formatValue(lot.qteRestante)} ${unitLabel}`;
};

export function LotsPlanningTab({
  products,
  supabaseClient,
  onAddProductClick,
  onOpenProduct,
  onRefreshProducts,
}: LotsPlanningTabProps) {
  const {
    items,
    loading,
    error,
    savingLotId,
    deletingLotId,
    lotOrderUsageByLotId,
    ensureLotOrderUsage,
    saveLot,
    deleteLot,
  } = useProducerLotsPlanning({
    enabled: true,
    products,
    supabaseClient,
    onRefreshProducts,
  });

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [drawerProductId, setDrawerProductId] = React.useState<string | null>(null);
  const [lotDraft, setLotDraft] = React.useState<ProductionLot | null>(null);
  const [selectedLotId, setSelectedLotId] = React.useState<string | null>(null);
  const [hoveredLot, setHoveredLot] = React.useState<HoveredLotState | null>(null);
  const [planningView, setPlanningView] = React.useState<PlanningViewId>('fit');
  const [timelineViewportWidth, setTimelineViewportWidth] = React.useState(0);
  const [timelineScrollbarHeight, setTimelineScrollbarHeight] = React.useState(0);
  const [productContentHeights, setProductContentHeights] = React.useState<Record<string, number>>({});
  const [confirmationState, setConfirmationState] = React.useState<PlanningConfirmationState>(null);
  const timelineScrollRef = React.useRef<HTMLDivElement | null>(null);
  const didAutoScrollToTodayRef = React.useRef(false);
  const productContentObserversRef = React.useRef(new Map<string, ResizeObserver>());

  const todayIso = React.useMemo(() => buildLocalTodayIso(), []);
  const allLots = React.useMemo(() => items.flatMap((item) => item.lots), [items]);
  const planningRange = React.useMemo(() => buildPlanningRange(allLots), [allLots]);
  const selectedPlanningView = React.useMemo(
    () => planningViewOptions.find((option) => option.id === planningView) ?? planningViewOptions[0],
    [planningView]
  );
  const visibleTimelineWidth = Math.max(
    320,
    timelineViewportWidth > 0 ? timelineViewportWidth : FALLBACK_TIMELINE_VIEWPORT_WIDTH
  );

  const targetVisibleDays = React.useMemo(() => {
    if (!selectedPlanningView.visibleMonths) {
      return planningRange.totalDays;
    }
    return getRangeDaysForVisibleMonths(planningRange.start, selectedPlanningView.visibleMonths);
  }, [planningRange.start, planningRange.totalDays, selectedPlanningView.visibleMonths]);

  const renderRange = React.useMemo(() => {
    if (!selectedPlanningView.visibleMonths || planningRange.totalDays >= targetVisibleDays) {
      return planningRange;
    }
    const end = addDaysUtc(planningRange.start, targetVisibleDays - 1);
    return {
      start: planningRange.start,
      end,
      totalDays: targetVisibleDays,
    };
  }, [planningRange, selectedPlanningView.visibleMonths, targetVisibleDays]);

  const planningMonths = React.useMemo(() => buildPlanningMonths(renderRange), [renderRange]);
  const rows = React.useMemo(
    () => buildPlanningRows(items, renderRange.end),
    [items, renderRange.end]
  );

  const targetDayWidth = React.useMemo(() => {
    return visibleTimelineWidth / Math.max(1, targetVisibleDays);
  }, [targetVisibleDays, visibleTimelineWidth]);

  const timelineWidth = Math.max(visibleTimelineWidth, Math.ceil(renderRange.totalDays * targetDayWidth));
  const effectiveDayWidth = timelineWidth / Math.max(1, renderRange.totalDays);
  const timelineMonthWidths = React.useMemo(
    () =>
      planningMonths.map((month, monthIndex) => {
        const monthStart = month.offsetDays * effectiveDayWidth;
        const nextMonthOffset =
          monthIndex < planningMonths.length - 1
            ? planningMonths[monthIndex + 1].offsetDays * effectiveDayWidth
            : timelineWidth;
        return Math.max(0, nextMonthOffset - monthStart);
      }),
    [effectiveDayWidth, planningMonths, timelineWidth]
  );
  const todayLineLeft = getPlanningOffsetDays(renderRange, todayIso) * effectiveDayWidth;
  const clampedTodayLineLeft = Math.min(Math.max(0, todayLineLeft), Math.max(0, timelineWidth - 2));
  const monthBoundaryOffsets = React.useMemo(
    () =>
      planningMonths
        .slice(1)
        .map((month) => month.offsetDays * effectiveDayWidth),
    [effectiveDayWidth, planningMonths]
  );
  const getPlanningRowHeight = React.useCallback(
    (laneCount: number) =>
      laneCount * LANE_HEIGHT + Math.max(0, laneCount - 1) * LANE_GAP + ROW_PADDING * 2,
    []
  );
  const baseRowHeights = React.useMemo(
    () => rows.map((row) => getPlanningRowHeight(row.laneCount)),
    [getPlanningRowHeight, rows]
  );
  const rowHeights = React.useMemo(
    () =>
      rows.map((row, rowIndex) =>
        Math.max(
          baseRowHeights[rowIndex],
          (productContentHeights[row.product.id] ?? 0) + PRODUCT_ROW_VERTICAL_PADDING
        )
      ),
    [baseRowHeights, productContentHeights, rows]
  );
  const timelineBodyHeight = React.useMemo(
    () => rowHeights.reduce((total, height) => total + height, 0),
    [rowHeights]
  );
  const layoutBodyHeight = timelineBodyHeight + timelineScrollbarHeight;
  const totalTimelineHeight = HEADER_HEIGHT + timelineBodyHeight;

  const activePlanningItem = React.useMemo(
    () => items.find((item) => item.product.id === drawerProductId) ?? null,
    [drawerProductId, items]
  );
  const activeDrawerLot = React.useMemo(() => {
    if (!lotDraft) return null;
    if (drawerMode === 'create') return lotDraft;
    return activePlanningItem?.lots.find(
      (item) => item.lot.id === lotDraft.id || item.lotDbId === lotDraft.lotDbId
    )?.lot ?? lotDraft;
  }, [activePlanningItem, drawerMode, lotDraft]);
  const activeDrawerLotId = activeDrawerLot?.id ?? null;
  const activeDrawerLotHasOrders =
    activeDrawerLotId && drawerMode === 'edit' ? lotOrderUsageByLotId[activeDrawerLotId] : undefined;
  const canDeleteDrawerLot = Boolean(
    activeDrawerLot &&
      drawerMode === 'edit' &&
      (activeDrawerLot.statut === 'a_venir' ||
        (activeDrawerLot.statut === 'en_cours' && activeDrawerLotHasOrders === false))
  );

  const closeDrawer = React.useCallback(() => {
    setDrawerOpen(false);
    setDrawerMode('create');
    setDrawerProductId(null);
    setLotDraft(null);
    setSelectedLotId(null);
    setConfirmationState(null);
  }, []);

  React.useEffect(() => {
    if (!drawerOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer, drawerOpen]);

  React.useEffect(() => {
    if (
      !drawerOpen ||
      drawerMode !== 'edit' ||
      !activeDrawerLotId ||
      !activeDrawerLot?.lotDbId ||
      activeDrawerLot.statut !== 'en_cours'
    ) {
      return;
    }
    void ensureLotOrderUsage({ lotId: activeDrawerLotId, lotDbId: activeDrawerLot.lotDbId });
  }, [activeDrawerLot, activeDrawerLotId, drawerMode, drawerOpen, ensureLotOrderUsage]);

  const updateProductContentHeight = React.useCallback((productId: string, height: number) => {
    setProductContentHeights((previousHeights) => {
      const nextHeight = Math.ceil(height);
      if (previousHeights[productId] === nextHeight) {
        return previousHeights;
      }
      return {
        ...previousHeights,
        [productId]: nextHeight,
      };
    });
  }, []);

  const setProductContentNode = React.useCallback(
    (productId: string) => (node: HTMLDivElement | null) => {
      const existingObserver = productContentObserversRef.current.get(productId);
      if (existingObserver) {
        existingObserver.disconnect();
        productContentObserversRef.current.delete(productId);
      }

      if (!node) {
        return;
      }

      updateProductContentHeight(productId, node.getBoundingClientRect().height);

      if (typeof ResizeObserver === 'undefined') {
        return;
      }

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        updateProductContentHeight(productId, entry.contentRect.height);
      });

      observer.observe(node);
      productContentObserversRef.current.set(productId, observer);
    },
    [updateProductContentHeight]
  );

  React.useEffect(
    () => () => {
      productContentObserversRef.current.forEach((observer) => observer.disconnect());
      productContentObserversRef.current.clear();
    },
    []
  );

  React.useEffect(() => {
    const currentProductIds = new Set(rows.map((row) => row.product.id));
    setProductContentHeights((previousHeights) => {
      const nextEntries = Object.entries(previousHeights).filter(([productId]) =>
        currentProductIds.has(productId)
      );
      if (nextEntries.length === Object.keys(previousHeights).length) {
        return previousHeights;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [rows]);

  React.useEffect(() => {
    didAutoScrollToTodayRef.current = false;
  }, [renderRange.start.toISOString(), renderRange.end.toISOString(), planningView, timelineViewportWidth]);

  React.useEffect(() => {
    const node = timelineScrollRef.current;
    if (!node || didAutoScrollToTodayRef.current) return;
    const overflowWidth = node.scrollWidth - node.clientWidth;
    if (overflowWidth <= 1) return;
    node.scrollLeft = Math.max(0, Math.min(overflowWidth, clampedTodayLineLeft - node.clientWidth * 0.45));
    didAutoScrollToTodayRef.current = true;
  }, [clampedTodayLineLeft, timelineWidth, planningView, timelineViewportWidth]);

  React.useEffect(() => {
    const node = timelineScrollRef.current;
    if (!node) return undefined;

    const updateViewportWidth = () => {
      const computedStyle = window.getComputedStyle(node);
      const borderHeight =
        Number.parseFloat(computedStyle.borderTopWidth || '0') +
        Number.parseFloat(computedStyle.borderBottomWidth || '0');
      setTimelineViewportWidth(node.clientWidth);
      setTimelineScrollbarHeight(Math.max(0, node.offsetHeight - node.clientHeight - borderHeight));
    };

    updateViewportWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportWidth);
      return () => window.removeEventListener('resize', updateViewportWidth);
    }

    const observer = new ResizeObserver(() => {
      updateViewportWidth();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const openCreateDrawer = React.useCallback((product: Product) => {
    setDrawerMode('create');
    setDrawerProductId(product.id);
    setLotDraft(createEmptyProductionLot(`temp-${Date.now()}`));
    setSelectedLotId(null);
    setDrawerOpen(true);
  }, []);

  const openEditDrawer = React.useCallback((product: Product, lot: ProductionLot) => {
    setDrawerMode('edit');
    setDrawerProductId(product.id);
    try {
      setLotDraft(normalizeProductionLot(lot));
    } catch (error) {
      console.error('Lots planning normalizeProductionLot error:', error);
      setLotDraft({
        ...createEmptyProductionLot(lot.id || `fallback-${Date.now()}`),
        ...lot,
        nomLot: typeof lot.nomLot === 'string' ? lot.nomLot : '',
        debut: typeof lot.debut === 'string' ? lot.debut : '',
        fin: typeof lot.fin === 'string' ? lot.fin : '',
        commentaire: typeof lot.commentaire === 'string' ? lot.commentaire : '',
        numeroLot: typeof lot.numeroLot === 'string' ? lot.numeroLot : '',
        DLC_DDM: typeof lot.DLC_DDM === 'string' ? lot.DLC_DDM : '',
      });
    }
    setSelectedLotId(lot.lotDbId || lot.id);
    setDrawerOpen(true);
  }, []);

  const hideHoveredLot = React.useCallback(() => {
    setHoveredLot(null);
  }, []);

  const handleOpenProduct = React.useCallback(
    (productId: string) => {
      if (onOpenProduct) {
        onOpenProduct(productId);
      }
    },
    [onOpenProduct]
  );

  const showHoveredLot = React.useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
      product: Product,
      lot: ProductionLot,
      startDate: string,
      endDate: string,
      priceLabel: string,
      quantityLabel: string
    ) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.left + rect.width;
      const desiredLeft = rect.left + rect.width / 2 - LOT_TOOLTIP_WIDTH / 2;
      const maxLeft = Math.max(12, viewportWidth - LOT_TOOLTIP_WIDTH - 12);
      const viewportLeft = Math.min(Math.max(desiredLeft, 12), maxLeft);
      setHoveredLot({
        productName: product.name,
        lotName: lot.nomLot || 'Lot sans nom',
        statusLabel: formatProductionLotStatusLabel(lot.statut),
        statusStyle: statusStyles[lot.statut],
        startLabel: formatPlanningDateLabel(startDate),
        endLabel: endDate ? formatPlanningDateLabel(endDate) : 'Non précisée',
        priceLabel,
        quantityLabel,
        viewportLeft,
        viewportY: rect.top - 12,
      });
    },
    []
  );

  const scrollTimelineBy = React.useCallback((delta: number) => {
    const node = timelineScrollRef.current;
    if (!node) return;
    const overflowWidth = node.scrollWidth - node.clientWidth;
    if (overflowWidth <= 1) return;
    node.scrollLeft += delta;
  }, []);

  React.useEffect(() => {
    const node = timelineScrollRef.current;
    if (!node) return undefined;

    const handleWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 1) return;
      const overflowWidth = node.scrollWidth - node.clientWidth;
      if (overflowWidth <= 1) return;

      event.preventDefault();
      scrollTimelineBy(delta);
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', handleWheel);
    };
  }, [scrollTimelineBy]);

  const handleTimelineKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = timelineScrollRef.current;
    if (!node) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollTimelineBy(120);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollTimelineBy(-120);
      return;
    }

    if (event.key === 'PageDown') {
      event.preventDefault();
      scrollTimelineBy(node.clientWidth * 0.85);
      return;
    }

    if (event.key === 'PageUp') {
      event.preventDefault();
      scrollTimelineBy(-node.clientWidth * 0.85);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      node.scrollLeft = 0;
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      node.scrollLeft = node.scrollWidth;
    }
  }, [scrollTimelineBy]);

  const handleDraftChange = React.useCallback((patch: Partial<ProductionLot>) => {
    setLotDraft((previousLot) => {
      if (!previousLot) return previousLot;
      return applyProductionLotPatch(previousLot, patch);
    });
  }, []);

  const performSave = React.useCallback(async () => {
    if (!lotDraft || !activePlanningItem) return;
    const validationMessage = validateProductionLotDraft(lotDraft);
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      const persistedLot = await saveLot({
        productId: activePlanningItem.product.id,
        lot: lotDraft,
        mode: drawerMode,
      });
      toast.success(drawerMode === 'edit' ? 'Lot mis a jour.' : 'Lot ajoute.');
      setLotDraft(persistedLot);
      closeDrawer();
    } catch (saveError) {
      console.error('Profile lots planning save error:', saveError);
      toast.error(getLotSaveErrorMessage(saveError));
    }
  }, [activePlanningItem, closeDrawer, drawerMode, lotDraft, saveLot]);

  const handleSave = React.useCallback(() => {
    if (!lotDraft || !activePlanningItem) return;
    if (drawerMode === 'create') {
      setConfirmationState({
        action: 'create',
        title: 'Créer ce nouveau lot ?',
        message: `Êtes-vous sûr de vouloir créer ce nouveau lot pour le produit ${activePlanningItem.product.name} ?`,
        confirmLabel: 'Créer le lot',
      });
      return;
    }
    void performSave();
  }, [activePlanningItem, drawerMode, lotDraft, performSave]);

  const performDelete = React.useCallback(async () => {
    if (!activePlanningItem || !activeDrawerLot) return;
    try {
      await deleteLot({ productId: activePlanningItem.product.id, lot: activeDrawerLot });
      toast.success('Lot supprimé.');
      closeDrawer();
    } catch (deleteError) {
      console.error('Profile lots planning delete error:', deleteError);
      const message =
        deleteError instanceof Error && deleteError.message
          ? deleteError.message
          : "Impossible de supprimer le lot.";
      toast.error(message);
    }
  }, [activeDrawerLot, activePlanningItem, closeDrawer, deleteLot]);

  const handleRequestDelete = React.useCallback(() => {
    if (!activeDrawerLot || !canDeleteDrawerLot) return;
    setConfirmationState({
      action: 'delete',
      title: 'Supprimer ce lot ?',
      message: 'Voulez-vous vraiment supprimer ce lot ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
  }, [activeDrawerLot, canDeleteDrawerLot]);

  const handleConfirmAction = React.useCallback(async () => {
    if (!confirmationState) return;
    if (confirmationState.action === 'create') {
      setConfirmationState(null);
      await performSave();
      return;
    }
    setConfirmationState(null);
    await performDelete();
  }, [confirmationState, performDelete, performSave]);

  if (!products.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <p className="text-base font-semibold text-[#1F2937]">Créer un produit d'abord avant de pouvoir gérer les lots</p>
          {onAddProductClick ? (
            <button
              type="button"
              onClick={onAddProductClick}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-[#1F2937] transition hover:border-[#FF6B4A] hover:text-[#FF6B4A]"
            >
              <Plus className="h-4 w-4" />
              Créer un produit
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`grid gap-4 ${drawerOpen && lotDraft ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : ''}`}>
        <div className="space-y-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-2 self-start rounded-full border border-gray-200 bg-[#FAFAFA] p-1">
              <span className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
                Vue
              </span>
              {planningViewOptions.map((option) => {
                const isActive = planningView === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPlanningView(option.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-white text-[#1F2937] shadow-sm ring-1 ring-gray-200'
                        : 'text-[#6B7280] hover:text-[#1F2937]'
                    }`}
                    aria-pressed={isActive}
                    aria-label={`Afficher le planning sur une vue ${option.label.toLowerCase()}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
              {error}
            </div>
          ) : null}

          {loading && !items.length ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA]">
              <div className="flex items-center gap-3 text-sm text-[#6B7280]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du planning...
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              <div
                className="grid min-w-0"
                style={{
                  gridTemplateColumns: `${LEFT_COLUMN_WIDTH}px minmax(0,1fr) ${ACTION_COLUMN_WIDTH}px`,
                  gridTemplateRows: `${HEADER_HEIGHT}px ${layoutBodyHeight}px`,
                }}
              >
                <div
                  className="flex items-center border-b border-r border-gray-200 bg-[#FAFAFA] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]"
                  style={{ gridColumn: '1', gridRow: '1', height: HEADER_HEIGHT }}
                >
                  Produits
                </div>

                <div
                  ref={timelineScrollRef}
                  tabIndex={0}
                  onKeyDown={handleTimelineKeyDown}
                  aria-label="Planning des lots, défilement horizontal"
                  className="min-w-0 border-b border-gray-200"
                  style={{
                    gridColumn: '2',
                    gridRow: '1 / span 2',
                    height: HEADER_HEIGHT + layoutBodyHeight,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x',
                    overscrollBehaviorX: 'contain',
                    scrollbarWidth: 'thin',
                  }}
                >
                  <div
                    className="relative"
                    style={{ width: timelineWidth, minWidth: timelineWidth, height: totalTimelineHeight }}
                  >
                    {monthBoundaryOffsets.map((offset, index) => (
                      <div
                        key={`month-boundary-${index}`}
                        className="pointer-events-none absolute top-0"
                        style={{
                          left: offset,
                          width: 0,
                          height: totalTimelineHeight,
                          zIndex: 20,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            borderLeft: '1px solid #D1D5DB',
                          }}
                        />
                      </div>
                    ))}

                    <div
                      className="pointer-events-none absolute top-0"
                      style={{
                        left: clampedTodayLineLeft,
                        width: 0,
                        height: totalTimelineHeight,
                        zIndex: 90,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          borderLeft: `3px solid ${TODAY_LINE_COLOR}`,
                          boxShadow: '0 0 0 1px rgba(255,107,74,0.18), 0 0 14px rgba(255,107,74,0.28)',
                        }}
                      />
                    </div>

                    <div className="flex items-stretch border-b border-gray-200 bg-[#FAFAFA]" style={{ height: HEADER_HEIGHT }}>
                      {planningMonths.map((month, monthIndex) => {
                        const monthHeader = formatPlanningMonthHeader(month.start);
                        return (
                          <div
                            key={month.key}
                            className="flex shrink-0 flex-col items-center justify-center border-r border-gray-200 px-3 py-2 text-center text-[#374151]"
                            style={{ width: timelineMonthWidths[monthIndex] }}
                          >
                            <span className="text-sm font-bold leading-tight">{monthHeader.month}</span>
                            <span className="text-sm font-bold leading-tight">{monthHeader.year}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-white">
                      {rows.map((row, rowIndex) => {
                        const rowHeight = rowHeights[rowIndex];
                        const rowVerticalOffset = Math.max(0, (rowHeight - baseRowHeights[rowIndex]) / 2);

                        return (
                          <div
                            key={`planning-timeline-row-${row.product.id}`}
                            className="relative overflow-hidden bg-white"
                            style={{
                              height: rowHeight,
                              borderTop: rowIndex === 0 ? 'none' : '1px solid #E5E7EB',
                            }}
                          >
                            {row.lots.map((timelineLot) => {
                              const startOffsetDays = getPlanningOffsetDays(renderRange, timelineLot.startDate);
                              const effectiveEndDate =
                                timelineLot.endDate || renderRange.end.toISOString().slice(0, 10);
                              const endOffsetDays = getPlanningOffsetDays(renderRange, effectiveEndDate);
                              const left = Math.max(0, startOffsetDays * effectiveDayWidth);
                              const rawWidth = Math.max(
                                effectiveDayWidth * 2,
                                (endOffsetDays - startOffsetDays + 1) * effectiveDayWidth
                              );
                              const width = Math.min(
                                rawWidth,
                                Math.max(effectiveDayWidth * 2, timelineWidth - left - TIMELINE_END_PADDING)
                              );
                              const top =
                                rowVerticalOffset +
                                ROW_PADDING +
                                timelineLot.laneIndex * (LANE_HEIGHT + LANE_GAP);
                              const lotPriceLabel = formatLotPriceWithUnit(row.product, timelineLot.priceCents);
                              const lotQuantityLabel = formatLotQuantityLabel(row.product, timelineLot.lot);
                              const isSelected = selectedLotId === (timelineLot.lot.lotDbId || timelineLot.lot.id);
                              const statusStyle = statusStyles[timelineLot.lot.statut];

                              return (
                                <button
                                  key={`${row.product.id}-${timelineLot.lot.id}`}
                                  type="button"
                                  onMouseEnter={(event) =>
                                    showHoveredLot(
                                      event,
                                      row.product,
                                      timelineLot.lot,
                                      timelineLot.startDate,
                                      timelineLot.endDate,
                                      lotPriceLabel,
                                      lotQuantityLabel
                                    )
                                  }
                                  onMouseLeave={hideHoveredLot}
                                  onFocus={(event) =>
                                    showHoveredLot(
                                      event,
                                      row.product,
                                      timelineLot.lot,
                                      timelineLot.startDate,
                                      timelineLot.endDate,
                                      lotPriceLabel,
                                      lotQuantityLabel
                                    )
                                  }
                                  onBlur={hideHoveredLot}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openEditDrawer(row.product, timelineLot.lot);
                                  }}
                                  className={`absolute z-10 flex cursor-pointer items-center overflow-hidden rounded-full border px-3 text-left text-sm font-medium shadow-sm transition hover:brightness-[0.98] focus:outline-none focus:ring-2 focus:ring-[#FF6B4A] ${
                                    isSelected ? 'ring-2 ring-[#FF6B4A] ring-offset-1' : ''
                                  }`}
                                  style={{
                                    left,
                                    top,
                                    width,
                                    height: LANE_HEIGHT,
                                    backgroundColor: statusStyle.backgroundColor,
                                    borderColor: statusStyle.borderColor,
                                    color: statusStyle.color,
                                  }}
                                >
                                  {width >= LOT_TEXT_MIN_WIDTH ? (
                                    <span className="truncate">{timelineLot.lot.nomLot || 'Lot sans nom'}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div
                  className="border-b border-l border-gray-200 bg-[#FAFAFA]"
                  style={{ gridColumn: '3', gridRow: '1', height: HEADER_HEIGHT }}
                />

                <div
                  className="border-r border-gray-200 bg-white"
                  style={{ gridColumn: '1', gridRow: '2', height: layoutBodyHeight, paddingBottom: timelineScrollbarHeight }}
                >
                  {rows.map((row, rowIndex) => (
                    <div
                      key={`planning-product-row-${row.product.id}`}
                      className="flex items-center min-w-0 px-4 py-4"
                      style={{
                        height: rowHeights[rowIndex],
                        borderTop: rowIndex === 0 ? 'none' : '1px solid #E5E7EB',
                      }}
                    >
                      <div ref={setProductContentNode(row.product.id)} className="min-w-0 w-full space-y-1">
                        {onOpenProduct ? (
                          <button
                            type="button"
                            onClick={() => handleOpenProduct(row.product.id)}
                            className="block w-full whitespace-normal break-words text-left font-semibold text-[#1F2937] transition hover:text-[#FF6B4A] focus:outline-none focus:text-[#FF6B4A]"
                          >
                            {row.product.name}
                          </button>
                        ) : (
                          <p className="whitespace-normal break-words font-semibold text-[#1F2937]">{row.product.name}</p>
                        )}
                        <p className="text-xs text-[#6B7280]">
                          {row.lots.length ? `${row.lots.length} lot${row.lots.length > 1 ? 's' : ''}` : 'Aucun lot planifié'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="border-l border-gray-200 bg-white"
                  style={{ gridColumn: '3', gridRow: '2', height: layoutBodyHeight, paddingBottom: timelineScrollbarHeight }}
                >
                  {rows.map((row, rowIndex) => (
                    <div
                      key={`planning-action-row-${row.product.id}`}
                      className="flex items-center justify-center px-2"
                      style={{
                        height: rowHeights[rowIndex],
                        borderTop: rowIndex === 0 ? 'none' : '1px solid #E5E7EB',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openCreateDrawer(row.product)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#6B7280] shadow-sm transition hover:bg-[#FFF1ED] hover:text-[#FF6B4A] focus:bg-[#FFF1ED] focus:text-[#FF6B4A] focus:outline-none"
                        aria-label={`Ajouter un lot pour ${row.product.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {drawerOpen && lotDraft ? (
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="relative pd-card pd-card--soft pd-card--dashed pd-stack pd-stack--md">
              <div className="pd-row pd-row--between pd-row--wrap pd-gap-sm">
                <div className="pd-row pd-gap-sm">
                  <Package className="pd-icon pd-icon--accent" />
                  <div className="pd-stack pd-stack--xs">
                    <p className="pd-section-title">Gestion des lots</p>
                    <p className="pd-text-xs pd-text-muted">
                      {drawerMode === 'edit'
                        ? "Modifiez les informations du lot sélectionné avant d'enregistrer."
                        : "Renseignez les informations du nouveau lot avant de l'enregistrer."}
                    </p>
                  </div>
                </div>
                <div className="pd-row pd-row--wrap pd-gap-sm">
                  {canDeleteDrawerLot ? (
                    <button
                      type="button"
                      onClick={handleRequestDelete}
                      className="pd-btn pd-btn--outline pd-btn--pill"
                      disabled={deletingLotId === activeDrawerLotId || savingLotId === lotDraft.id}
                    >
                      {deletingLotId === activeDrawerLotId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Supprimer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSave}
                    className="pd-btn pd-btn--primary pd-btn--pill"
                    disabled={!lotDraft || savingLotId === lotDraft.id || deletingLotId === activeDrawerLotId}
                  >
                    {savingLotId === lotDraft?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="pd-btn pd-btn--outline pd-btn--pill"
                    disabled={savingLotId === lotDraft.id || deletingLotId === activeDrawerLotId}
                  >
                    Fermer
                  </button>
                </div>
              </div>
              <div className="pd-text-xs pd-text-muted">
                {activePlanningItem ? `Produit : ${activePlanningItem.product.name}` : 'Lot'}
              </div>
              <div className="pd-grid pd-grid--two pd-gap-sm">
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Nom du lot</span>
                  <input
                    className="pd-input"
                    value={lotDraft.nomLot}
                    onChange={(event) => handleDraftChange({ nomLot: event.target.value })}
                    placeholder="Ex : Récolte de printemps 2026"
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Code du lot plateforme</span>
                  <input
                    className="pd-input"
                    value={lotDraft.lotDbId ? lotDraft.id : 'Généré automatiquement après le 1er enregistrement'}
                    readOnly
                    disabled
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Référence lot producteur (facultative)</span>
                  <input
                    className="pd-input"
                    value={lotDraft.numeroLot || ''}
                    onChange={(event) => handleDraftChange({ numeroLot: event.target.value })}
                    placeholder="Ex : MB-0325"
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Statut</span>
                  <select
                    className="pd-select"
                    value={lotDraft.statut}
                    onChange={(event) =>
                      handleDraftChange({ statut: event.target.value as ProductionLot['statut'] })
                    }
                  >
                    <option value="a_venir">A venir</option>
                    <option value="en_cours">En cours</option>
                    <option value="epuise">Epuisé</option>
                  </select>
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Début de la période de vente du lot</span>
                  <input
                    type="date"
                    className="pd-input"
                    value={lotDraft.debut || ''}
                    onChange={(event) => handleDraftChange({ debut: event.target.value })}
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Fin de la période de vente du lot (facultative)</span>
                  <input
                    type="date"
                    className="pd-input"
                    value={lotDraft.fin || ''}
                    onChange={(event) => handleDraftChange({ fin: event.target.value })}
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Quantité totale (en unité ou Kg)</span>
                  <input
                    type="number"
                    className="pd-input"
                    value={lotDraft.qteTotale ?? ''}
                    onChange={(event) =>
                      handleDraftChange({
                        qteTotale: event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="pd-stack pd-stack--xs">
                  <span className="pd-label">Quantité restante (en unité ou Kg) (facultative)</span>
                  <input
                    type="number"
                    className="pd-input"
                    value={lotDraft.qteRestante ?? ''}
                    onChange={(event) =>
                      handleDraftChange({
                        qteRestante: event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="pd-stack pd-stack--xs">
                <span className="pd-label">Commentaire</span>
                <textarea
                  className="pd-textarea"
                  value={lotDraft.commentaire || ''}
                  onChange={(event) => handleDraftChange({ commentaire: event.target.value })}
                  rows={3}
                />
              </label>
              {confirmationState ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-white/82 p-4 backdrop-blur-[1px]">
                  <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-[#1F2937]">{confirmationState.title}</p>
                      <p className="text-sm text-[#6B7280]">{confirmationState.message}</p>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmationState(null)}
                        className="pd-btn pd-btn--outline pd-btn--pill"
                        disabled={savingLotId === lotDraft.id || deletingLotId === activeDrawerLotId}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmAction()}
                        className={`pd-btn pd-btn--pill ${
                          confirmationState.tone === 'danger' ? 'pd-btn--outline' : 'pd-btn--primary'
                        }`}
                        disabled={savingLotId === lotDraft.id || deletingLotId === activeDrawerLotId}
                      >
                        {(savingLotId === lotDraft.id && confirmationState.action === 'create') ||
                        (deletingLotId === activeDrawerLotId && confirmationState.action === 'delete') ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {confirmationState.confirmLabel}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        {hoveredLot && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="pointer-events-none fixed rounded-2xl p-4"
                style={{
                  left: hoveredLot.viewportLeft,
                  top: hoveredLot.viewportY,
                  width: LOT_TOOLTIP_WIDTH,
                  transform: 'translateY(-100%)',
                  background: '#FFFFFF',
                  backgroundColor: '#FFFFFF',
                  backgroundClip: 'padding-box',
                  zIndex: 2147483647,
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 20px 48px rgba(17,24,39,0.18), 0 4px 12px rgba(17,24,39,0.10)',
                  isolation: 'isolate',
                  mixBlendMode: 'normal',
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                  filter: 'none',
                  willChange: 'transform',
                }}
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.12em] text-[#6B7280]">{hoveredLot.productName}</p>
                    <p className="text-base font-semibold text-[#1F2937]">{hoveredLot.lotName}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-[#F9FAFB] px-3 py-2.5">
                    <span
                      className="inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold leading-none"
                      style={{
                        backgroundColor: hoveredLot.statusStyle.backgroundColor,
                        borderColor: hoveredLot.statusStyle.borderColor,
                        color: hoveredLot.statusStyle.color,
                      }}
                    >
                      {hoveredLot.statusLabel}
                    </span>
                    <span className="text-sm font-semibold text-[#374151]">
                      {hoveredLot.priceLabel}
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                      <dt className="w-20 shrink-0 text-[#6B7280]">Période</dt>
                      <dd className="flex flex-1 items-center justify-center whitespace-nowrap text-xs font-medium text-[#1F2937]">
                        <span>{hoveredLot.startLabel}</span>
                        <ArrowRight className="h-2.5 w-4.5 shrink-0 text-[#9CA3AF]" />
                        <span>{hoveredLot.endLabel}</span>
                      </dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <dt className="w-20 shrink-0 text-[#6B7280]">Quantités</dt>
                      <dd className="flex-1 text-center font-medium text-[#1F2937]">{hoveredLot.quantityLabel}</dd>
                    </div>
                  </dl>
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    </>
  );
}
