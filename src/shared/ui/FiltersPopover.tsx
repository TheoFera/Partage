import React from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, Users, Leaf, ChevronDown } from 'lucide-react';
import './FiltersPopover.css';

type SearchScope = 'products' | 'producers' | 'combined';
type FilterMode = 'products' | 'profiles';

type FilterOption = {
  id: string;
  label: string;
};

interface FiltersPopoverProps {
  open: boolean;
  onClose: () => void;
  mode?: FilterMode;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  categories: string[];
  onToggleCategory: (id: string) => void;
  producerFilters: string[];
  onToggleProducer: (id: string) => void;
  attributes: string[];
  onToggleAttribute: (id: string) => void;
  productOptions: FilterOption[];
  producerOptions: FilterOption[];
  attributeOptions: FilterOption[];
  profileOptions?: FilterOption[];
  profileValues?: string[];
  onToggleProfile?: (id: string) => void;
  distanceKm?: number;
  onDistanceKmChange?: (value: number) => void;
  minDistanceKm?: number;
  maxDistanceKm?: number;
}

export function FiltersPopover({
  open,
  onClose,
  mode = 'products',
  scope,
  onScopeChange,
  categories,
  onToggleCategory,
  producerFilters,
  onToggleProducer,
  attributes,
  onToggleAttribute,
  productOptions,
  producerOptions,
  attributeOptions,
  profileOptions = [],
  profileValues = [],
  onToggleProfile,
  distanceKm,
  onDistanceKmChange,
  minDistanceKm = 1,
  maxDistanceKm = 50,
}: FiltersPopoverProps) {
  const filterAnchor =
    typeof document !== 'undefined' ? document.getElementById('filters-anchor') : null;
  const isProfileMode = mode === 'profiles';
  const handleToggleProfile = onToggleProfile ?? (() => {});
  const clampedDistanceKm =
    typeof distanceKm === 'number'
      ? Math.min(maxDistanceKm, Math.max(minDistanceKm, distanceKm))
      : minDistanceKm;
  const distanceProgressPercent =
    maxDistanceKm > minDistanceKm
      ? ((clampedDistanceKm - minDistanceKm) / (maxDistanceKm - minDistanceKm)) * 100
      : 0;

  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // ✅ Fermer avec Echap
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // ✅ Fermer quand on clique en dehors (sans overlay)
  React.useEffect(() => {
    if (!open) return;
    if (!filterAnchor) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      const pop = popoverRef.current;

      // si pas de target, on ne fait rien
      if (!target) return;

      // clic dans le popover => ne ferme pas
      if (pop && pop.contains(target)) return;

      // clic dans l'ancre (bouton, etc.) => ne ferme pas
      if (filterAnchor.contains(target)) return;

      // sinon => ferme
      onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, onClose, filterAnchor]);

  // Important : si l'ancre n'existe pas, ton ancien code ne peut pas afficher la fenêtre.
  if (!open || !filterAnchor) return null;

  return createPortal(
    <div
      id="filters-popover"
      ref={popoverRef}
      style={{
        position: 'absolute',
        right: 0,
        marginTop: 8,
        width: 'min(68vw, 320px)',
        borderRadius: 16,
        border: '1px solid #E5E7EB',
        background: '#FFFFFF',
        opacity: 1,
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        mixBlendMode: 'normal',
        isolation: 'isolate',
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxHeight: '70vh',
        overflowY: 'auto',
        zIndex: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>Filtres</p>
      </div>

      {!isProfileMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ScopeToggle active={scope === 'combined'} label="Tous" onClick={() => onScopeChange('combined')} />
          <ScopeToggle active={scope === 'products'} label="Produits" onClick={() => onScopeChange('products')} />
          <ScopeToggle active={scope === 'producers'} label="Producteurs" onClick={() => onScopeChange('producers')} />
        </div>
      )}

      {!isProfileMode && typeof distanceKm === 'number' && onDistanceKmChange ? (
        <div
          style={{
            borderRadius: 12,
            border: '1px solid #E5E7EB',
            background: '#FFFFFF',
            padding: '10px 12px',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#374151' }}>Distance autour du code postal</p>
            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{distanceKm} km</span>
          </div>
          <input
            className="filters-popover__distance-range"
            type="range"
            min={minDistanceKm}
            max={maxDistanceKm}
            step={1}
            value={distanceKm}
            onChange={(event) => onDistanceKmChange(Number(event.target.value))}
            style={
              {
                width: '100%',
                '--range-progress': `${distanceProgressPercent}%`,
              } as React.CSSProperties & { '--range-progress': string }
            }
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
            <span>{minDistanceKm} km</span>
            <span>{maxDistanceKm} km</span>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {isProfileMode ? (
          <FilterGroup
            label="Filtres Profils"
            icon={<SlidersHorizontal style={{ width: 16, height: 16 }} />}
            options={profileOptions}
            activeValues={profileValues}
            onToggle={handleToggleProfile}
          />
        ) : (
          <FilterGroup
            label="Filtres produits"
            icon={<SlidersHorizontal style={{ width: 16, height: 16 }} />}
            options={productOptions}
            activeValues={categories}
            onToggle={onToggleCategory}
          />
        )}
        <FilterGroup
          label="Filtres producteurs"
          icon={<Users style={{ width: 16, height: 16 }} />}
          options={producerOptions}
          activeValues={producerFilters}
          onToggle={onToggleProducer}
        />
        {!isProfileMode && (
          <FilterGroup
            label="Caractéristiques"
            icon={<Leaf style={{ width: 16, height: 16 }} />}
            options={attributeOptions}
            activeValues={attributes}
            onToggle={onToggleAttribute}
          />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: 9999,
            background: '#FF6B4A',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Appliquer
        </button>
      </div>
    </div>,
    filterAnchor
  );
}

function ScopeToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 12,
        border: `1px solid ${active ? '#FF6B4A' : '#E5E7EB'}`,
        fontSize: 14,
        fontWeight: 600,
        background: active ? '#FF6B4A' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#374151',
        boxShadow: active ? '0 6px 14px rgba(255, 107, 74, 0.2)' : 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({
  label,
  icon,
  options,
  activeValues,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  options: Array<{ id: string; label: string }>;
  activeValues: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedCount = activeValues.length;
  const summary = selectedCount
    ? `${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}`
    : 'Tous';

  return (
    <div style={{ borderRadius: 12, border: '1px solid #E5E7EB', background: '#FFFFFF' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{summary}</p>
          </div>
        </div>
        <ChevronDown
          style={{
            width: 16,
            height: 16,
            color: '#6B7280',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #E5E7EB', padding: '8px 12px' }}>
          <div style={{ maxHeight: 208, overflowY: 'auto', paddingRight: 4, display: 'grid', gap: 8 }}>
            {options.map((option) => {
              const checked = activeValues.includes(option.id);
              return (
                <label
                  key={option.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(option.id)}
                    style={{ height: 16, width: 16, accentColor: '#FF6B4A' }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
