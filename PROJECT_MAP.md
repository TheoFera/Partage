# Project Map

## Entry
- `src/main.tsx`: React root + router.
- `src/App.tsx`: route wiring, layout, inline helpers.

## Modules (domain-first)
- `src/modules/products/`
  - `pages/`: product landing, detail, add product, map, swipe.
  - `components/`: product group cards and uploaders.
  - `api/`: products provider + supabase fetches.
  - `constants/`, `utils/`, `styles/`.
- `src/modules/orders/`
  - `pages/`: order creation + order flow screens.
  - `api/`: order queries/mutations.
  - `utils/`: order UI helpers.
  - `types.ts`: order types + helpers.
- `src/modules/profile/`
  - `pages/`: profile screen.
  - `components/`: profile-only UI.
- `src/modules/auth/`
  - `pages/`: auth screen.
- `src/modules/messages/`
  - `pages/`: messages screen.
- `src/modules/marketing/`
  - `pages/`: about + how it works.
  - `styles/`: shared info-page styles.

## Shared
- `src/shared/ui/`: reusable UI (Header, Navigation, Avatar, overlays, ImageWithFallback).
- `src/shared/lib/`: cross-domain helpers (money, supabaseClient, imageProcessing).
- `src/shared/constants/`: cross-domain constants (cards, producer labels).
- `src/shared/types/`: app-wide types.
- `src/shared/config/`: runtime config (DEMO_MODE).

## Data
- `src/data/fixtures/`: demo/mock data (used by demo mode).

## Supabase
- `supabase/config.toml`: local Supabase CLI config.
- `supabase/functions/`: edge functions (`finalize-payment`, `process-emails-sortants`).

## Static assets
- `public/`: static assets served by Vite.

## Scaffolding (currently empty)
- `src/components/figma/`: placeholder for Figma exports.
- `src/constants/`, `src/lib/`, `src/services/`, `src/types/`: reserved top-level folders (prefer `src/shared/` or modules).

## Conventions
- Route-level components live in `src/modules/<domain>/pages`.
- Domain-specific logic stays inside its module.
- Shared items are only for cross-domain use.
