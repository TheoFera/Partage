import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Link as LinkIcon, Award, Scale, Handshake, Search } from 'lucide-react';
import './InfoPages.css';
import './AboutUsView.css';

export function AboutUsView() {
  return (
    <div className="info-page about-page">
      <div className="info-page__nav">
        <Link to="/" className="info-page__back">
          ← Retour
        </Link>
        <Link to="/comment-ca-fonctionne" className="info-page__back info-page__switch">
          Comment ça fonctionne ? →
        </Link>
      </div>

      <section className="about-hero">
        <div className="about-hero__layout">
          <div className="about-hero__content">
            <h1 className="about-hero__title">Qui sommes-nous ?</h1>
            <p className="about-hero__subtitle">
              Le site « Partage » est une plateforme de mise en relation des producteurs et consommateurs
              fondé en 2025 par Théo Fera, professionnel de l'alimentaire.
            </p>
            <p className="about-hero__subtitle"> 
              Son ambition est de participer à trouver des solutions face à la crise agricole et 
              à la transformation de nos modes de consommations alimentaires en proposant un nouveau modèle de distribution, 
              plus direct et collaboratif.
            </p>
            
            <div className="about-hero__actions">
            <a
              href="https://www.linkedin.com/in/th%C3%A9o-fera-283a8b17b/"
              className="about-button about-button--primary about-button--icon"
              target="_blank"
              rel="noreferrer"
              aria-label="LinkedIn de Théo"
              title="LinkedIn de Théo"
            >
              <Linkedin className="about-button__icon" />
            </a>
            <button
              type="button"
              className="about-button about-button--ghost about-button--icon"
              disabled
              aria-disabled="true"
              aria-label="Facebook de Partage (bientôt disponible)"
              title="Facebook de Partage (bientôt disponible)"
            >
              <Facebook className="about-button__icon" />
            </button>
            <button
              type="button"
              className="about-button about-button--ghost about-button--icon"
              disabled
              aria-disabled="true"
              aria-label="Instagram de Partage (bientôt disponible)"
              title="Instagram de Partage (bientôt disponible)"
            >
              <Instagram className="about-button__icon" />
            </button>
          </div>
          </div>
          <div className="about-hero__image-wrapper">
            <img
              className="about-hero__image"
              src={`${import.meta.env.BASE_URL}theo.jpg`}
              alt="Portrait de Théo Fera"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="about-section__header">
          <h2>Le parcours de Théo jusqu'à la création de « Partage »</h2>
          <p className="about-section__text">
            Après avoir étudié et travaillé dans l’industrie agroalimentaire et la grande distribution
            et après m'être intéressé au modèle des magasins proposant des produits en direct du producteur, 
            ou à des modèles alternatifs comme les AMAP, j'ai acquis la conviction qu'il fallait trouver de nouveaux
            modèles de distribution si on voulait transformer notre mode de production et consommation alimentaire actuel.
          </p>
          <p className="about-section__text">
            Avec des amis nous réalisions déjà de temps à autre des commandes groupées auprès de producteurs,
            mais ce n'était pas toujours simple et il manquait un moyen plus évident d'organiser ça au quotidien.
          </p>
        </div>
      </section>

      <section className="about-section">
        <p className="about-section__intro">
        Notre diagnostic sur les différents modèles :
        </p>
        <div className="about-grid about-grid--three">
          <article className="about-card">
            <h3 className="about-card__title">AMAP (Association pour le maintien d'une agriculture paysanne)</h3>
            <ul className="about-list">
              <li>Exige un engagement dans la durée</li>
              <li>Des jours et horaires de récupération parfois contraignantes</li>
              <li>On ne choisit pas le contenu de son panier</li>
              <li>Repose sur le bénévolat</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Commandes groupées à l'ancienne (entre voisins ou connaissances)</h3>
            <ul className="about-list">
              <li>Il faut connaitre le producteur</li>
              <li>Nécessite d'organiser la prise de commande dans un tableau</li>
              <li>Échanges d’argent en liquide et personnes devant parfois avancer l'argent</li>
              <li>Repose sur la bonne volonté des participants</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Achat en ligne sur des sites de producteur</h3>
            <ul className="about-list">
              <li>On achète seulement pour soi</li>
              <li>Les frais d’expédition engendrent des prix chers ou poussent à commander en gros</li>
              <li>Résultat : on n’achète pas souvent, ou seulement ponctuellement</li>
              <li>On n'entre pas vraiment en lien avec le producteur</li>
            </ul>
          </article>
        </div>
      </section>

      
          <div className="about-badges">
              <span className="about-badge">
                <LinkIcon className="about-badge__icon" aria-hidden="true" />
                Circuits-courts
              </span>
              <span className="about-badge">
                <Award className="about-badge__icon" aria-hidden="true" />
                Produits de qualité
              </span>
              <span className="about-badge">
                <Scale className="about-badge__icon" aria-hidden="true" />
                Juste rémunèration
              </span>
              <span className="about-badge">
                <Handshake className="about-badge__icon" aria-hidden="true" />
                Coopération
              </span>
              <span className="about-badge">
                <Search className="about-badge__icon" aria-hidden="true" />
                Transparence
              </span>
            </div>

        <section className="about-section">
        <div className="about-section__header">
          <h2>Les objectifs que « Partage » s'est fixé</h2>
          <p className="about-section__intro">
            Acheter de bons produits en direct des producteurs, à des prix
            accessibles, avec une organisation simple.
          </p>
        </div>
        <div className="about-grid about-grid--three">
          <article className="about-card">
            <h3 className="about-card__title">Acheter en petites quantités</h3>
            <p className="about-card__text">
              Pouvoir commander ce dont on a besoin, sans devoir ‘faire un gros panier’ juste pour
              rentabiliser des frais.
            </p>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">La commande groupée, mais sans la galère</h3>
            <p className="about-card__text">
              Retrouver l’efficacité des commandes groupées, tout en évitant l’organisation
              compliquée, les relances et les échanges d’argent entre personnes.
            </p>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Une transparence beaucoup plus profonde</h3>
            <p className="about-card__text">
              On ne connaît pas assez nos produits aujourd’hui. Partage veut permettre de comprendre
              dans la plus grande intimité ce qu’on mange, et de choisir en pleine connaissance.
            </p>
          </article>
        </div>
        <div className="about-subsection">
          <h3>Les informations de traçabilité que vous n'aurez nul part ailleurs :</h3>
          <ul className="about-list about-list--compact">
            <li>L’histoire du produit que vous mangez à chaque étape de son parcours de la fourche à la fourchette</li>
            <li>À quoi correspondent vraiment les labels des produits que vous mangez et des exploitations qui vous fournissent</li>
            <li>La répartition de la valeur sur le produit : qui gagne quoi quand vous payez le produit</li>
            <li>Le plaisir de partager les produits avec </li>
            <li>La possibilité d'entrer en contact directement avec le producteur qui vous fournit</li>
            <li>Des informations de qualité inédites</li>
          </ul>
        </div>
        <p className="about-section__note">
          L’idée n’est pas d’ajouter du blabla, mais de rendre visibles les informations
          essentielles qui manquent aujourd’hui.
        </p>
      </section>

      <section className="about-section">
        <h2>Ce qu’on veut rendre possible</h2>
        <ul className="about-list">
          <li>Acheter local plus souvent, sans contrainte</li>
          <li>Faciliter la vie des producteurs, sans micro-gestion</li>
          <li>Rendre les commandes groupées naturelles et simples</li>
          <li>Donner accès à des prix accessibles grâce au collectif</li>
          <li>Mieux choisir grâce à une information vraiment utile</li>
        </ul>
      </section>

      <section className="about-cta">
        <h2>Envie de découvrir le fonctionnement ?</h2>
        <p className="about-cta__text">
          Tout est expliqué étape par étape, avec les rôles et les options possibles.
        </p>
        <div className="about-cta__actions">
          <Link to="/comment-ca-fonctionne" className="about-button about-button--primary">
            Voir comment ça fonctionne
          </Link>
          <Link to="/" className="about-button about-button--ghost">
            Découvrir les produits
          </Link>
        </div>
      </section>
    </div>
  );
}

