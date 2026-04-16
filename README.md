# TEST Site Partage

This is a code bundle for TEST Site Partage. The original project is available at https://www.figma.com/design/P9emQ4BFG9AFnHOr58OaXz/TEST-Site-Partage.

## Running the code

1. Run `npm i` to install the dependencies.
2. Run `npm run dev` to start the development server.
3. Creez un fichier `.env` et renseignez `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_STRIPE_PUBLISHABLE_KEY` si vous branchez Supabase.

## Routing

L'application utilise `react-router-dom` (BrowserRouter). Les routes principales sont :

- `/` produits, `/carte` deck/carte, `/creer` creation (client/prod/partageur), `/messages`, `/profil` (profil personnel), `/profil/:handle` (profil public), `/produit/:id` (fiche produit), `/commande/:id` (vue commande).

## Supabase

`src/shared/lib/supabaseClient.ts` expose `getSupabaseClient()`/`supabase`. Le client est instancie si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont renseignees dans votre `.env`.

Le dossier `supabase/` contient la config CLI (`config.toml`) et les Edge Functions utilisees par l'app (`supabase/functions/finalize-payment`, `supabase/functions/process-emails-sortants`, `supabase/functions/process-notification-emails`, `supabase/functions/stripe_create_checkout_session`, `supabase/functions/stripe_checkout_session_status`, `supabase/functions/stripe_create_connected_account_link`, `supabase/functions/stripe_connected_account_status`).
Pour Stripe, configurez aussi les secrets Edge Functions `STRIPE_SECRET_KEY` (obligatoire), `STRIPE_API_BASE` (optionnel, par defaut `https://api.stripe.com/v1`), `STRIPE_API_BASE_V2` (optionnel, par defaut `https://api.stripe.com`), `STRIPE_CHECKOUT_UI_MODE` (optionnel, par defaut `embedded_page`) et `STRIPE_CONNECTED_ACCOUNT_COUNTRY` (optionnel, par defaut `FR`).

### Billing / factures (runbook)

- Script SQL de fiabilisation: `supabase/billing_close_invoice_fix.sql`.
- Ce patch garantit la generation de facture partageur a la cloture, meme sans paiement CB, sur la base des lignes produits.
- L'envoi email/PDF est volontairement non-bloquant: une facture peut etre creee meme si le dispatcher email est mal configure.
- Pour diagnostiquer la configuration des secrets billing, executer:
  - `select * from public.billing_email_config_healthcheck();`
- Si `SUPABASE_SERVICE_ROLE_KEY` n'est pas un JWT valide (`dot_count != 2`), `process-emails-sortants` peut repondre `401 Invalid JWT`.

### Notifications e-mail

- Migration SQL: `supabase/scripts/2026-04-16_notification_email_pipeline.sql`.
- La pipeline notification est separee de la pipeline facture:
  - table outbox: `public.notification_emails_outbox`
  - fonction SQL: `public.call_process_notification_emails()`
  - Edge Function: `supabase/functions/process-notification-emails`
- Secrets / variables a configurer pour `process-notification-emails`:
  - `NOTIFICATION_EMAIL_INTERNAL_SECRET`
  - `BREVO_API_KEY`
  - `BREVO_SENDER_EMAIL=nepasrepondre@partagetonpanier.fr`
  - `BREVO_SENDER_NAME=Partage ton panier`
  - `APP_BASE_URL`
  - `LOGO_PUBLIC_URL`

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

### Supabase

- `supabase/` : configuration et fonctions edge (voir section Supabase).

## Carte rapide

Consultable dans `PROJECT_MAP.md` pour un survol concis de l'architecture et des conventions.
