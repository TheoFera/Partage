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
              Son ambition est de contribuer à trouver des solutions face à la crise agricole tout en proposant des
              produits de qualité accessibles à tous, via un modèle de distribution 
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
        Notre diagnostic sur les différents modèles d'approvisionnement direct producteur :
        </p>
        <div className="about-grid about-grid--three">
          <article className="about-card">
            <h3 className="about-card__title">AMAP (Association pour le maintien d'une agriculture paysanne)</h3>
            <ul className="about-list">
              <li>Exige un engagement dans la durée</li>
              <li>Des jours, lieux et horaires de récupération parfois contraignants</li>
              <li>On ne choisit pas toujours le contenu du panier</li>
              <li>Une partie du fonctionnement d'une AMAP repose sur le bénévolat</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Commandes groupées à l'ancienne (entre voisins ou connaissances)</h3>
            <ul className="about-list">
              <li>Il faut connaitre le producteur</li>
              <li>Nécessite d'organiser la prise de commande dans un tableau</li>
              <li>Échanges d’argent en liquide et personnes devant parfois avancer l'argent</li>
              <li>Repose sur la bonne volonté des participants</li>
              <li>Les personnes qui pourraient être intéressées autour de vous ne sont pas au courant</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Achat en ligne sur des sites proposant des produits</h3>
            <ul className="about-list">
              <li>On achète seulement pour soi</li>
              <li>Les frais d’expédition renchérissent parfois les prix ou forcent à commander en gros</li>
              <li>Résultat : on n’achète pas souvent, ou seulement ponctuellement</li>
              <li>On n'entre pas vraiment en lien avec le producteur</li>
              <li>Le producteur doit pouvoir gérer plein de petites commandes</li>
            </ul>
          </article>
        </div>
          <p className="about-section__intro">
            Les forces de « Partage » :
          </p>
        <div className="about-grid about-grid--three">
          <article className="about-card">
            <h3 className="about-card__title">L'avantage d'un achat classique en ligne</h3>
            <ul className="about-list">
              <li>Pas d'engagement sur la durée nécessaire</li>
              <li>De plus grandes plages de récupération des produits et plus proche de chez vous</li>
              <li>On choisit précisement le contenu de sa commande</li>
              <li>Tout le monde y trouve son compte et a un intérêt économique à participer</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">La commande groupée, mais sans la galère</h3>
            <ul className="about-list">
              <li>« Partage » fait pour vous le travail d'identifier de bons producteurs.</li>
              <li>La prise de commande est gérée par le site</li>
              <li>Pas d'échange d'argent entre les participants, tout est géré par le site</li>
              <li>La simplicité permet d'en faire plus souvent</li>
              <li>Vous pouvez facilement partager l'information de votre commande aux gens autour de vous pour qu'ils y participent</li>
            </ul>
          </article>
          <article className="about-card">
            <h3 className="about-card__title">Les bénéfices de la jouer collectif</h3>
            <ul className="about-list">
              <li>On profite des avantages d'acheter en groupe</li>
              <li>On divise les frais d’expédition et on peut acheter dans des petites quantités</li>
              <li>Résultat : on participe à des commandes plus souvent</li>
              <li>On connait tout de son produit et on peut échanger et faire notre retour au producteur</li>
              <li>Le producteur n'a de petites commandes contraignantes à gérer</li>
            </ul>
          </article>
        </div>
      </section>

        <section className="about-section">
        <div className="about-section__header">
          <h2>Ainsi grâce à « Partage » :</h2>
      
          <div className="about-badges">
              <span className="about-badge">
                <Award className="about-badge__icon" aria-hidden="true" />
                Procurez-vous de bons produits de qualité plus simplement et donc plus souvent
              </span>
              <span className="about-badge">
                <Scale className="about-badge__icon" aria-hidden="true" />
                Donner aux prix du sens et rémunérez mieux les producteurs, en plus de leur faciliter la vie
              </span>
              <span className="about-badge">
                <Handshake className="about-badge__icon" aria-hidden="true" />
                Coopérez avec vos amis, vos collègues et vos voisins et trouvez-y un intérêt financier
              </span>
              <span className="about-badge">
                <Search className="about-badge__icon" aria-hidden="true" />
                Faites confiance à ce que vous mangez grâce à des informations vraiment utiles
              </span>
              <span className="about-badge">
                <LinkIcon className="about-badge__icon" aria-hidden="true" />
                Participez à réinventer la distribution alimentaire
              </span>
            </div>
        </div>
       
        <div className="about-subsection">
          <h3>Les informations de traçabilité que vous n'aurez nul part ailleurs :</h3>
          <ul className="about-list about-list--compact">
            <li>L’histoire du produit que vous mangez à chaque étape de son parcours de la fourche à la fourchette</li>
            <li>À quoi correspondent vraiment les labels des produits que vous mangez et des exploitations qui vous fournissent</li>
            <li>La répartition de la valeur sur le produit : qui gagne quoi quand vous payez le produit</li>
            <li>La possibilité d'entrer en contact directement avec le producteur qui vous fournit</li>
            <li>D'autres informations de qualité inédites</li>
          </ul>
          
        <p className="about-section__note">
          L’idée n’est pas d’ajouter du blabla, mais de rendre visibles les informations
          essentielles qui manquent aujourd’hui pour vraiment connaître les produits que l'on consomme
          et acheter en toute connaissance de cause.
        </p>
        </div>

        
          <p className="about-section__intro">
            Acheter de bons produits en direct des producteurs à des prix
            accessibles n'a jamais été aussi simple.
          </p>
      </section>

      <section className="about-cta">
        <h2>Envie de découvrir comment fonctionne « Partage » ?</h2>
        <p className="about-cta__text">
          Tout est expliqué étape par étape, en fonction de ce que vous souhaitez faire, avec les différentes options possibles.
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

