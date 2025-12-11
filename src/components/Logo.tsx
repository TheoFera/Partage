import React from 'react';

export function Logo({ className = '', onClick }: { className?: string; onClick?: () => void }) {
  const Wrapper: React.ElementType = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-center gap-2 ${className}`}
      aria-label={onClick ? 'Aller vers les produits' : undefined}
    >
      <svg viewBox="0 0 200 200" className="w-10 h-10" aria-hidden="true">
        <g
          fill="none"
          stroke="#FF6D4D"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="60" y1="100" x2="140" y2="40" />
          <line x1="60" y1="100" x2="140" y2="160" />
        </g>

        {/* Trois ronds (plus gros) */}
        <g fill="#FF6D4D">
          <circle cx="60" cy="100" r="34" />
          <circle cx="140" cy="40" r="34" />
          <circle cx="140" cy="160" r="34" />
        </g>
      </svg>
      <span
        className="font-['Fredoka'] text-[#FF6B4A] header-logo-text"
        style={{ fontSize: '1.5rem', fontWeight: 600 }}
      >
        Partage
      </span>
    </Wrapper>
  );
}
