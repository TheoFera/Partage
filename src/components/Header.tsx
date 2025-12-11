import React from 'react';
import { Logo } from './Logo';
import { Bell, Search, SlidersHorizontal } from 'lucide-react';

interface HeaderProps {
  showSearch?: boolean;
  searchQuery?: string;
  onSearch?: (query: string) => void;
  onLogoClick?: () => void;
  actions?: React.ReactNode;
  filtersActive?: boolean;
  onToggleFilters?: () => void;
}

export function Header({
  showSearch = false,
  searchQuery = '',
  onSearch,
  onLogoClick,
  actions,
  filtersActive,
  onToggleFilters,
}: HeaderProps) {
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearch?.(e.target.value);
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] z-50">
      <div className="max-w-screen-xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4 md:gap-4 w-full min-w-0">
          <Logo onClick={onLogoClick} className={onLogoClick ? 'cursor-pointer' : ''} />

          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div
                className="flex items-center gap-2"
                style={{ flex: '0 1 580px', minWidth: '20px', maxWidth: '400px' }}
              >
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                  <input
                    type="text"
                    placeholder="Rechercher un produit..."
                    value={searchQuery}
                    onChange={handleSearch}
                    className="w-full pl-10 pr-4 py-2 bg-[#F9FAFB] border border-gray-200 rounded-full focus:outline-none focus:border-[#FF6B4A] transition-colors"
                  />
                </div>
                {onToggleFilters && (
                  <button
                    type="button"
                    onClick={onToggleFilters}
                    className={`header-filter-button shrink-0 flex items-center justify-center gap-2 px-3 h-10 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
                      filtersActive
                        ? 'bg-[#FF6B4A] border-[#FF6B4A] text-white shadow-sm'
                        : 'bg-white border-gray-200 text-[#374151] hover:border-[#FF6B4A]/70'
                    }`}
                    style={{ lineHeight: 1.1 }}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="header-filter-label">Filtres</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-2 ml-auto">
            {actions}
            <button className="p-2 hover:bg-[#F9FAFB] rounded-full transition-colors">
              <Bell className="w-6 h-6 text-[#6B7280]" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
