import React from 'react';
import { Link } from 'react-router-dom';
import { Link as LinkIcon, Award, Scale, Handshake, Search } from 'lucide-react';
import './InfoPages.css';
import './HowItWorksView.css';

type CtaVariant = 'primary' | 'secondary' | 'ghost';

const CtaLink = ({
  to,
  variant,
  children,
}: {
  to: string;
  variant: CtaVariant;
  children: React.ReactNode;
}) => (
  <Link className={`how-button how-button--${variant}`} to={to}>
    {children}
  </Link>
);

const scrollToSection = (targetId: string) => {
  if (typeof document === 'undefined') return;
  const target = document.getElementById(targetId);
  if (!target) return;
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
};

export function HowItWorksView() {
  return (
    <div className="info-page how-page">
      <div className="info-page__nav">
        <Link to="/" className="info-page__back">
          ← Retour
        </Link>
        <Link to="/qui-sommes-nous" className="info-page__back info-page__switch">
          Qui sommes-nous ? →
        </Link>
      </div>

      <section className="how-hero">

        

        <div className="how-hero__content">
          <h1 className="how-hero__title">Comment ça fonctionne ?</h1>
          <p className="how-hero__subtitle">
            S'approvisionner directement auprès des producteurs n'a jamais été aussi simple.
          </p>
        </div>

        <div className="how-hero__badges">
          <span className="how-badge">
            <LinkIcon className="how-badge__icon" aria-hidden="true" />
            Circuits-courts
          </span>
          <span className="how-badge">
            <Award className="how-badge__icon" aria-hidden="true" />
            Produits de qualité
          </span>
          <span className="how-badge">
            <Scale className="how-badge__icon" aria-hidden="true" />
            Juste rémunération
          </span>
          <span className="how-badge">
            <Handshake className="how-badge__icon" aria-hidden="true" />
            Coopération
          </span>
          <span className="how-badge">
            <Search className="how-badge__icon" aria-hidden="true" />
            Transparence
          </span>
        </div>

        <div className="how-anchor-card">
          <h2 className="how-anchor-title">Je souhaite... ?</h2>

          <div className="how-anchor-buttons">
            <button
            type="button"
            className="how-anchor-button"
            onClick={() => scrollToSection('participant')}
            aria-controls="participant"
            >
            Participer à des commandes groupées de produits en direct des producteurs
            </button>
            <button
            type="button"
            className="how-anchor-button"
            onClick={() => scrollToSection('partageur')}
            aria-controls="partageur"
            >
            Créer des commandes groupées à partager autour de moi et recevoir en échange une part
            </button>
            <button
            type="button"
            className="how-anchor-button"
            onClick={() => scrollToSection('producteur')}
            aria-controls="producteur"
            >
            Rendre mes produits accessibles via la plateforme en tant que producteur
            </button>
          </div>
        </div>
      </section>

      <section id="participant" className="how-section how-anchor-target">
        <h2 className="how-section__title">Comment participer à une commande ?</h2>

        <div className="how-section__content">
          <article className="how-card">
            <h3 className="how-card__title">1) Je cherche des produits qui m'intéressent</h3>
            <p className="how-card__text">
              Sur le site en allant sur les pages{' '}
              <Link to="/" className="how-inline-link">
                Produits
              </Link>
              ,{' '}
              <Link to="/carte" className="how-inline-link">
                Cartes
              </Link>{' '}
              ou{' '}
              <Link to="/decouvrir" className="how-inline-link">
                Découvrir
              </Link>,{' '}
              je repère des commandes près de chez moi.
            </p>
          </article>

          <div className="how-grid how-grid--two">
            <article className="how-card">
              <h3 className="how-card__title">2) Sur la commande qui m'intéresse, je clique sur « Participer »</h3>
              <img
                className="how-card__image"
                src={`${import.meta.env.BASE_URL}clicparticiper.png`}
                alt="Capture d'ecran du bouton Participer"
                loading="lazy"
              />
              <p className="how-card__text">
                Je sélectionne les quantités souhaitées, puis je procède au réglement.
              </p>
            </article>
            <article className="how-card">
              <h3 className="how-card__title">Et si je ne trouve pas de commande qui me convient ?</h3>
              <p className="how-card__text">
                Vous pouvez la créer vous même !
              </p>
              <button
                type="button"
                className="how-anchor-button"
                onClick={() => scrollToSection('partageur')}
                aria-controls="partageur"
              >
                Je crée une commande et deviens un partageur
            </button>
            </article>
          </div>

          <article className="how-card">
            <h3 className="how-card__title">3) Je partage la commande autour de moi et j'attends qu'elle soit cloturée</h3>
            <p className="how-card__text">
              Plus le nombre de participants est important moins je paierai cher car les frais de livraison seront divisés.
            </p>
            <p className="how-card__text">
              La différence entre ce que j'ai payé et ce que je dois me sera reversé en « gains de coopération »
              que je pourrai utiliser pour une prochaine commande.
            </p>
            <section className="how-closure">
              <h3 className="how-card__title">Quand est-ce que la commande est clôturée ?</h3>
              <ul className="how-closure__list">
                <li className="how-closure__item">
                  <span className="how-closure__dot" aria-hidden="true" />
                  <span>Si la commande a atteints son volume maximum : la commande se clôture tout de suite.</span>
                </li>
                <li className="how-closure__item">
                  <span className="how-closure__dot" aria-hidden="true" />
                  <span>
                    Sinon, à la date de clôture : la commande est validé si les volumes minimum demandés par le producteur sont atteints.
                  </span>
                </li>
                <li className="how-closure__item">
                  <span className="how-closure__dot" aria-hidden="true" />
                  <span>
                    Si les volumes minimums ne sont pas atteints : la commande ne part pas et les participants sont remboursés
                  </span>
                </li>
              </ul>
            </section>
          </article>

          <article className="how-card">
            <h3 className="how-card__title">4) Je reçois une notification lorsque les produits ont été réceptionnés</h3>
            <p className="how-card__text">
              Je réserve un créneau qui me convient sur la plage de disponibilité du partageur .
            </p>
          </article>

          <article className="how-card">
            <h3 className="how-card__title">5) Je récupère ma commande</h3>
            <p className="how-card__text">
              
            </p>
          </article>
        </div>
        <div className="how-section__actions">
          <CtaLink to="/carte" variant="primary">
            Voir les commandes autour de moi
          </CtaLink>
        </div>
      </section>

      <section id="partageur" className="how-section how-anchor-target">
        <h2 className="how-section__title">Comment créer une commande ?</h2>
        <p className="how-section__intro">
          Le partageur crée la commande, réceptionne les produits et sert de points relais pour que
          les participants viennent chercher leur produit.
          En échange il obtient gratuitement une part de la commande qu'il peut librement définir.
        </p>
        <div className="how-section__content">
          <article className="how-card">
            <h3 className="how-card__title">1) Je certifie mon compte</h3>
            <p className="how-card__text">
              Pour devenir partageur, il faut que votre compte soit « vérifié ».
              Pour cela vous devez vérifier votre identité ainsi que signer la charte des partageurs lors de votre première commande.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">2) Je cherche des producteurs qui m'intéressent</h3>
                        <p className="how-card__text">
              Via les pages{' '}
              <Link to="/" className="how-inline-link">
                Produits
              </Link>
              ,{' '}
              <Link to="/carte" className="how-inline-link">
                Cartes
              </Link>{' '}
              ou{' '}
              <Link to="/decouvrir" className="how-inline-link">
                Découvrir
              </Link>{' '}
              je trouves des producteurs dont les produits sont disponbile.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">3) Lorsque j'ai identifié un producteur, je clique sur « Créer », pour lancer la création de la commande</h3>
            <img
                className="how-card__image"
                src={`${import.meta.env.BASE_URL}cliccreer.png`}
                alt="Capture d'ecran du bouton Participer"
                loading="lazy"
            />
            <p className="how-card__text">
            Je dois alors sélectionner :
              <ul className="how-list">
                <li>les produits du producteur que je veux inclure dans la commande</li>
                <li>Le poids minimum ou maximum de la commande </li>
                <li>La date de cloture de la commande</li>
                <li>La part que je veux conserver de la commande</li>
                <li>Les conditions de retrait : périodes de disponibilités pour que les participants sachent quand ils pourront récupérer leurs produits ainsi que le lieu de récupération</li>
                <li>Le mode de livraison des produits, qui peut se faire de 3 façons, faisant varier le calcul des frais de livraison :</li>
                </ul>
            </p>
        <div className="how-grid how-grid--three">
          <article className="how-card">
            <h3 className="how-card__title">Option 1 — Expédition Chronofresh (gérée par le site)</h3>
            <p className="how-card__text">
              Le site gère l’expédition en Chronofresh. C’est pratique si le producteur est loin ou
              si on veut une solution simple.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">Option 2 — Livraison par le producteur (si proposée)</h3>
            <p className="how-card__text">
              Certains producteurs proposent la livraison dans certaines zones. 
              Si cette option est proposée lors de la création de la commande.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">Option 3 — Collecte chez le producteur par le partageur</h3>
            <p className="how-card__text">
              Le partageur peut aller chercher les produits directement chez le producteur.
              Cela évite des frais de livraison.
            </p>
          </article>
        </div>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">4) Je partage la commande et j'attends qu'elle se remplisse</h3>
            <p className="how-card__text">
              Avec l'option « Partager » vous pouvez partager le lien autour de vous ou obtenir une version imprimable de la page avec un QR Code qui redirige vers la page de la commande. Vous pouvez ainsi imprimer cette page et l'afficher pour informer les gens autour de vous.
            </p>
          </article>
          
          <article className="how-card">
            <h3 className="how-card__title">5) Une fois la commande cloturée je reçois les produits et avertis les participants de la réception</h3>
            <p className="how-card__text">
              Lorsque les participants sont avertis de la réception ils peuvent alors prendre rendez-vous pour venir récupérer les produits sur la plage de disponibilité que vous avez définie.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">6) Les participants viennent retirer leurs produits</h3>
            <p className="how-card__text">
              Et en échange le créateur de la commande garde la partie qu'il avait sélectionné.
            </p>
          </article>
        </div>
        
        <div className="how-section__actions">
          <CtaLink to="/commande/nouvelle" variant="primary">
            Créer une commande
          </CtaLink>
        </div>
      </section>

      <section id="producteur" className="how-section how-anchor-target">
        <h2 className="how-section__title">Comment proposer mes produits sur la plateforme ?</h2>
        <p className="how-section__intro">
          Tu gardes la main sur tes produits, tes disponibilités et les conditions pour que chaque
          commande soit simple à préparer.
        </p>
        <div className="how-section__content">
          <article className="how-card">
            <h3 className="how-card__title">1) J’ajoute mes produits et mes lots</h3>
            <p className="how-card__text">
              Je publie mes produits et je gère un système de lots (par exemple : récolte, série,
              disponibilité).
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">2) Je renseigne mes disponibilités</h3>
            <p className="how-card__text">
              Pour chaque produit ou lot, j’indique les périodes de disponibilité et les conditions
              utiles.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">3) Je fixe un seuil minimum</h3>
            <p className="how-card__text">
              Je définis un seuil minimum pour éviter une commande trop petite et protéger mon
              temps de préparation.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">4) Je vois les commandes en cours</h3>
            <p className="how-card__text">
              Je peux suivre les commandes en cours de création et anticiper la préparation au fur
              et à mesure.
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">5) À la clôture, je reçois la commande définitive</h3>
            <p className="how-card__text">
              Quand la commande se clôture, je reçois la liste définitive. Ensuite, j’expédie via
              Chronofresh, je livre si c’est proposé, ou je remets au partageur pour collecte.
            </p>
          </article>
        </div>
        <div className="how-section__actions">
          <CtaLink to="/produit/nouveau" variant="primary">
            Je suis producteur : ajouter mes produits
          </CtaLink>
        </div>
      </section>

      <section className="how-section">
        <h2>Foire aux questions</h2>
        <div className="how-grid how-grid--three">
          <article className="how-card">
            <h3 className="how-card__title">Que se passe t-il si X ?</h3>
            <p className="how-card__text">
              Blablabla
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">Que se passe t-il si X ?</h3>
            <p className="how-card__text">
              Blablabla
            </p>
          </article>
          <article className="how-card">
            <h3 className="how-card__title">Que se passe t-il si X ?</h3>
            <p className="how-card__text">
              Blablabla
            </p>
          </article>
        </div>
      </section>

      <section className="how-cta-final">
              <h2>Envie de découvrir qui se cache derrière « Partage » ?</h2>
              <p className="cta-final__text">
                Nous expliquons qui nous sommes et l'ensemble de notre démarche
              </p>
              <div className="cta-final__actions">
                <Link to="/qui-sommes-nous" className="how-button how-button--primary">
                  Découvrir qui nous sommes
                </Link>
                <Link to="/" className="how-button how-button--ghost">
                  Découvrir les produits
                </Link>
              </div>
            </section>
    </div>
  );
}











