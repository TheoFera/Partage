# TEST Site Partage

This is a code bundle for TEST Site Partage. The original project is available at https://www.figma.com/design/P9emQ4BFG9AFnHOr58OaXz/TEST-Site-Partage.

## Running the code

1. Run `npm i` to install the dependencies.
2. Run `npm run dev` to start the development server.
3. Creez un fichier `.env` et renseignez `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_STRIPE_PUBLISHABLE_KEY` si vous branchez Supabase (optionnel: `VITE_DEMO_MODE=true`).

## Routing

L'application utilise `react-router-dom` (BrowserRouter). Les routes principales sont :

- `/` produits, `/carte` deck/carte, `/creer` creation (client/prod/partageur), `/messages`, `/profil` (profil personnel), `/profil/:handle` (profil public), `/produit/:id` (fiche produit), `/commande/:id` (vue commande).

## Supabase

`src/shared/lib/supabaseClient.ts` expose `getSupabaseClient()`/`supabase`. Le client est instancie si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont renseignees dans votre `.env`.

Le dossier `supabase/` contient la config CLI (`config.toml`) et les Edge Functions utilisees par l'app (`supabase/functions/finalize-payment`, `supabase/functions/process-emails-sortants`, `supabase/functions/stripe_create_checkout_session`, `supabase/functions/stripe_checkout_session_status`).
Pour Stripe, configurez aussi les secrets Edge Functions `STRIPE_SECRET_KEY` (obligatoire) et `STRIPE_API_BASE` (optionnel, par defaut `https://api.stripe.com/v1`).

### Billing / factures (runbook)

- Script SQL de fiabilisation: `supabase/billing_close_invoice_fix.sql`.
- Ce patch garantit la generation de facture partageur a la cloture, meme sans paiement CB, sur la base des lignes produits.
- L'envoi email/PDF est volontairement non-bloquant: une facture peut etre creee meme si le dispatcher email est mal configure.
- Pour diagnostiquer la configuration des secrets billing, executer:
  - `select * from public.billing_email_config_healthcheck();`
- Si `SUPABASE_SERVICE_ROLE_KEY` n'est pas un JWT valide (`dot_count != 2`), `process-emails-sortants` peut repondre `401 Invalid JWT`.

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

### Supabase

- `supabase/` : configuration et fonctions edge (voir section Supabase).

### Data

- `src/data/fixtures/` : donnees factices pour le mode demo (mockData, mockProductDetails).

## Carte rapide

Consultable dans `PROJECT_MAP.md` pour un survol concis de l'architecture et des conventions.
