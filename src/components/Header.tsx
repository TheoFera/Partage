import React from 'react';
import { Logo } from './Logo';
import { Bell, Search, SlidersHorizontal } from 'lucide-react';

export type SearchSuggestion = {
  id: string;
  label: string;
  type: 'product' | 'producer';
  subtitle?: string;
};

interface HeaderProps {
  showSearch?: boolean;
  searchQuery?: string;
  onSearch?: (query: string) => void;
  suggestions?: SearchSuggestion[];
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void;
  onLogoClick?: () => void;
  actions?: React.ReactNode;
  filtersActive?: boolean;
  onToggleFilters?: () => void;
  notificationsOpen?: boolean;
  onToggleNotifications?: () => void;
}

export function Header({
  showSearch = false,
  searchQuery = '',
  onSearch,
  suggestions = [],
  onSelectSuggestion,
  onLogoClick,
  actions,
  filtersActive,
  onToggleFilters,
  notificationsOpen,
  onToggleNotifications,
}: HeaderProps) {
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onSearch?.(value);
    if (value.trim()) {
      setSuggestionsOpen(true);
    } else {
      setSuggestionsOpen(false);
    }
  };
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const trimmedQuery = searchQuery.trim();
  const hasQuery = trimmedQuery.length > 0;
  const producerSuggestions = suggestions.filter((suggestion) => suggestion.type === 'producer');
  const productSuggestions = suggestions.filter((suggestion) => suggestion.type === 'product');
  const showSuggestions = hasQuery && suggestionsOpen;
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
      setSuggestionsOpen(false);
      return;
    }
    onSearch?.(suggestion.label);
    setSuggestionsOpen(false);
  };
  const handleSearchFocus = () => {
    if (hasQuery) setSuggestionsOpen(true);
  };
  const bellButtonClassName = `p-2 rounded-full transition-colors ${
    notificationsOpen ? 'bg-[#FFF1E6]' : 'hover:bg-[#F9FAFB]'
  }`;
  const searchWrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!showSuggestions) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSuggestionsOpen(false);
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      const wrapper = searchWrapperRef.current;
      if (!target || !wrapper) return;
      if (wrapper.contains(target)) return;
      setSuggestionsOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [showSuggestions]);

  return (
    <header className="app-header fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] z-50">
      <div className="max-w-screen-xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4 md:gap-4 w-full min-w-0">
          <Logo onClick={onLogoClick} className={onLogoClick ? 'cursor-pointer' : ''} />

          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div
                className="flex items-center gap-2"
                style={{ flex: '0 1 580px', minWidth: '20px', maxWidth: '400px' }}
              >
                <div className="relative flex-1 min-w-[140px]" ref={searchWrapperRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="text"
                    placeholder="Rechercher un produit ou un producteur..."
                    value={searchQuery}
                    onChange={handleSearch}
                    onFocus={handleSearchFocus}
                    className="w-full pl-10 pr-4 py-2 bg-[#F9FAFB] border border-gray-200 rounded-full focus:outline-none focus:border-[#FF6B4A] transition-colors"
                  />
                  {showSuggestions && (
                    <div className="header-search-suggestions">
                      <div className="header-search-suggestions__title">Propositions</div>
                      <div className="header-search-suggestions__list">
                        {producerSuggestions.length > 0 && (
                          <div className="header-search-suggestions__section">
                            <div className="header-search-suggestions__section-title">Producteurs</div>
                            {producerSuggestions.map((suggestion) => (
                              <button
                                key={`producer-${suggestion.id}`}
                                type="button"
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="header-search-suggestions__item"
                              >
                                <div className="header-search-suggestions__item-text">
                                  <p className="header-search-suggestions__item-title">
                                    {suggestion.label}
                                  </p>
                                  {suggestion.subtitle && (
                                    <p className="header-search-suggestions__item-subtitle">
                                      {suggestion.subtitle}
                                    </p>
                                  )}
                                </div>
                                <span className="header-search-suggestions__item-tag">Profil</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {productSuggestions.length > 0 && (
                          <div className="header-search-suggestions__section">
                            <div className="header-search-suggestions__section-title">Produits</div>
                            {productSuggestions.map((suggestion) => (
                              <button
                                key={`product-${suggestion.id}`}
                                type="button"
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="header-search-suggestions__item"
                              >
                                <div className="header-search-suggestions__item-text">
                                  <p className="header-search-suggestions__item-title">
                                    {suggestion.label}
                                  </p>
                                  {suggestion.subtitle && (
                                    <p className="header-search-suggestions__item-subtitle">
                                      {suggestion.subtitle}
                                    </p>
                                  )}
                                </div>
                                <span className="header-search-suggestions__item-tag">Produit</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!producerSuggestions.length && !productSuggestions.length && (
                          <div className="header-search-suggestions__empty">
                            Aucune proposition pour cette recherche.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {onToggleFilters && (
                  <div className="relative shrink-0 overflow-visible" id="filters-anchor">
                    <button
                      type="button"
                      onClick={onToggleFilters}
                      aria-expanded={filtersActive}
                      aria-controls="filters-popover"
                      className={`header-filter-button flex items-center justify-center gap-2 px-3 h-10 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
                        filtersActive
                          ? 'bg-[#FF6B4A] border-[#FF6B4A] text-white shadow-sm'
                          : 'bg-white border-gray-200 text-[#374151] hover:border-[#FF6B4A]/70'
                      }`}
                      style={{ lineHeight: 1.1 }}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      <span className="header-filter-label">Filtres</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-2 ml-auto">
            {actions}
            <div className="relative shrink-0 overflow-visible" id="notifications-anchor">
              <button
                type="button"
                onClick={onToggleNotifications}
                aria-expanded={notificationsOpen}
                aria-controls="notifications-popover"
                className={bellButtonClassName}
              >
                <Bell className={`w-6 h-6 ${notificationsOpen ? 'text-[#FF6B4A]' : 'text-[#6B7280]'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
