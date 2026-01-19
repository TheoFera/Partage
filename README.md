# TEST Site Partage

This is a code bundle for TEST Site Partage. The original project is available at https://www.figma.com/design/P9emQ4BFG9AFnHOr58OaXz/TEST-Site-Partage.

## Running the code

1. Run `npm i` to install the dependencies.
2. Run `npm run dev` to start the development server.
3. Copiez `.env.example` vers `.env` et renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` si vous branchez Supabase.

## Routing

L'application utilise `react-router-dom` (BrowserRouter). Les routes principales sont :

- `/` produits, `/carte` deck/carte, `/creer` creation (client/prod/partageur), `/messages`, `/profil` (profil personnel), `/profil/:handle` (profil public), `/produit/:id` (fiche produit), `/commande/:id` (vue commande).

## Supabase

`src/shared/lib/supabaseClient.ts` expose `getSupabaseClient()`/`supabase`. Le client est instancie si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont renseignees dans votre `.env`.

## Mode demo

`src/shared/config/demoMode.ts` centralise `DEMO_MODE` (lecture de `VITE_DEMO_MODE`). Les donnees de demo sont dans `src/data/fixtures/`.

## Structure du dossier `src`

- `src/main.tsx` : point d'entree Vite, monte React dans `#root` et injecte les styles globaux.
- `src/App.tsx` : orchestre les vues en fonction du role utilisateur, controle le deck, les produits et les actions de navigation.
- `src/index.css` : styles base generes depuis la charte Figma.

### Modules (domain-first)

- `src/modules/products/`
  - `pages/` : `ProductsLanding`, `ProductDetailView`, `AddProductForm`, `MapView`, `ClientSwipeView`.
  - `components/` : `ProductGroup`, `ProductImageUploader`.
  - `api/` : `productsProvider`.
  - `constants/` : `productCategories`.
  - `utils/` : `pricing`, `weight`, `codeGenerator`.
- `src/modules/orders/`
  - `pages/` : `CreateOrderForm`, `OrderClientView`, `OrderPaymentView`, `OrderShareGainView`, `OrderProductContextView`.
  - `api/` : `orders`.
  - `utils/` : `orderStatus`.
  - `types.ts` : types metier commandes.
- `src/modules/profile/`
  - `pages/` : `ProfileView`.
  - `components/` : `AvatarUploader`.
- `src/modules/auth/`
  - `pages/` : `AuthPage`.
- `src/modules/messages/`
  - `pages/` : `MessagesView`.
- `src/modules/marketing/`
  - `pages/` : `AboutUsView`, `HowItWorksView`.
  - `styles/` : `InfoPages.css`.

### Shared

- `src/shared/ui/` : composants reutilisables (Header, Navigation, Logo, Avatar, overlays, `ImageWithFallback`).
- `src/shared/lib/` : helpers transverses (money, supabase, imageProcessing, formatPrix).
- `src/shared/constants/` : constantes partagees (cards, producerLabels).
- `src/shared/types/` : types communs a l'application.
- `src/shared/config/` : config runtime (ex: `demoMode`).

### Data

- `src/data/fixtures/` : donnees factices pour le mode demo (mockData, mockProductDetails).

## Carte rapide

Consultable dans `PROJECT_MAP.md` pour un survol concis de l'architecture et des conventions.
