import { Product, ProductDetail } from '../types';

export const mockProductDetails: Record<string, ProductDetail> = {
  '2': {
    productId: '2',
    name: 'Fromage de chevre frais',
    category: 'Fromages & Cremerie',
    shortDescription: 'Fromage artisanal au lait cru, moule a la louche.',
    longDescription:
      'Fromage de chevre frais, texture fondante, legerement lactee avec une pointe acidulee. Lait cru collecte quotidiennement, caillage lent, egouttage gravitaire. Ideal cru en salade, sur tartine, ou ajoute en fin de cuisson sur une pizza.',
    productImage: {
      url: 'https://images.unsplash.com/photo-1654184750621-1110fe5afcdc?auto=format&fit=crop&w=1600&q=80',
      alt: 'Fromage de chevre frais artisanal',
      etiquetteUrl:
        'https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80',
    },
    producer: {
      id: 'p2',
      name: 'La Chevrerie du Bois',
      city: 'Lyon (3e)',
      photo:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      badgesProducteur: ['Producteur verifie'],
      shortStory: 'Lait cru de nos chevres Alpine en paturage 8 mois par an.',
      liens: [{ type: 'lien', label: 'Profil producteur', url: '/profil/la-chevrerie' }],
    },
    conservationMode: 'frais',
    portions: '2-3 portions',
    originCountry: 'France',
    zones: ['Auvergne-Rhone-Alpes', 'Rhone'],
    dlcEstimee: '7 jours apres reception',
    conditionnementPrincipal: 'Sachet 150g en saumure',
    formats: [
      { id: 'chevre-150', label: 'Palet frais 150g', poidsNet: '150g', conditionnement: 'Sachet saumure', uniteVente: 'piece', codeEAN: '1234567890123' },
      { id: 'chevre-250', label: 'Palet frais 250g', poidsNet: '250g', conditionnement: 'Sachet saumure', uniteVente: 'piece' },
      { id: 'chevre-1kg', label: 'Bac frais 1kg', poidsNet: '1 kg', conditionnement: 'Bac alimentaire', uniteVente: 'kg' },
    ],
    priceReference: {
      devise: 'EUR',
      prixIndicatifUnitaire: 3.9,
      unite: 'piece',
      prixIndicatifAuKg: 26,
      mention: 'Prix indicatif, depend des commandes',
    },
    officialBadges: ['AOP'],
    platformBadges: ['Traçable', 'Circuit court', 'Frais controle'],
    productionConditions: {
      modeProduction: 'Paturage extensif, foin ferme en hiver',
      intrantsPesticides: {
        utilise: false,
        details: 'Prairies sans traitements de synthese, rotations longues.',
        explicationPedagogique: 'Herbe riche, pas de pesticides: lait plus aromatique et stable.',
      },
      bienEtreAnimal: 'Acces prairie 8 mois/an, batiments ventiles, suivi veto trimestriel.',
      social: 'Equipe de 4 salaries en CDI, formation interne.',
      environnement: 'Alimentation locale (foin de la ferme + cereales locales), eau de source.',
      preuves: [
        { type: 'pdf', label: 'Certificat AOP 2025', url: '#' },
        { type: 'lien', label: 'Analyses lait Q1 2025', url: '#' },
      ],
    },
    compositionEtiquette: {
      denominationVente: 'Fromage de chevre frais au lait cru',
      ingredients: [
        { nom: 'Lait cru de chevre' },
        { nom: 'Ferments lactiques' },
        { nom: 'Presure' },
        { nom: 'Sel' },
      ],
      allergenes: ['Lait'],
      nutrition: {
        energie: '1090 kJ / 264 kcal',
        matieresGrasses: '17 g',
        acidesGrasSatures: '12 g',
        glucides: '1 g',
        sucres: '1 g',
        proteines: '14 g',
        sel: '0,8 g',
      },
      additifs: ['Aucun additif ni arome'],
      conseilsUtilisation: 'Sortir 20 min avant degustation. Consommer sous 48h apres ouverture.',
      conservationDetaillee: '0-4C. Ne pas congeler. Maintenir dans sa saumure.',
    },
    tracabilite: {
      paysOrigine: 'France',
      lieuProduction: 'Ferme du Bois (Rhone)',
      lieuTransformation: 'Lyon (3e)',
      datesImportantes: [
        { label: 'Production', date: '2025-03-02' },
        { label: 'Transformation', date: '2025-03-03' },
        { label: 'Conditionnement', date: '2025-03-03' },
        { label: 'Livraison', date: '2025-03-05' },
      ],
      timeline: [
        { etape: 'Production', lieu: 'Ferme du Bois (Rhone)', date: '02/03/2025' },
        { etape: 'Transformation', lieu: 'Lyon (3e)', date: '03/03/2025' },
        { etape: 'Conditionnement', lieu: 'Lyon (3e)', date: '03/03/2025' },
        { etape: 'Livraison / Retrait', lieu: 'Lyon et agglomeration', date: '05/03/2025' },
      ],
      preuves: [{ type: 'lien', label: 'Analyses lait 2025', url: '#' }],
    },
    productions: [
      {
        id: 'lot-mars-s1',
        nomLot: 'Mars S1',
        debut: '2025-03-05',
        fin: '2025-03-15',
        periodeDisponibilite: { debut: '2025-03-05', fin: '2025-03-15' },
        qteTotale: 500,
        qteRestante: 180,
        DLC_DDM: '2025-03-12',
        DLC_aReceptionEstimee: '2025-03-12',
        commentaire: 'Ideal frais, texture dense.',
        numeroLot: 'MB-0325',
        piecesJointes: [{ type: 'lien', label: 'Fiche lot', url: '#' }],
        statut: 'en_cours',
      },
      {
        id: 'lot-mars-s2',
        nomLot: 'Mars S2',
        debut: '2025-03-16',
        fin: '2025-03-30',
        periodeDisponibilite: { debut: '2025-03-16', fin: '2025-03-30' },
        qteTotale: 600,
        qteRestante: 600,
        DLC_DDM: '2025-03-20',
        DLC_aReceptionEstimee: '2025-03-20',
        commentaire: 'Affinage leger possible sur demande.',
        numeroLot: 'MB-0325-2',
        piecesJointes: [{ type: 'pdf', label: 'Certificat sanitaire', url: '#' }],
        statut: 'a_venir',
      },
    ],
    repartitionValeur: {
      mode: 'estimatif',
      uniteReference: 'kg',
      totalReference: 14,
      postes: [
        { nom: 'Production', valeur: 6.5, type: 'eur', details: 'Alimentation, soins, temps eleveur' },
        { nom: 'Transformation', valeur: 2.5, type: 'eur', details: "Main d'oeuvre fromagerie" },
        { nom: 'Conditionnement', valeur: 1, type: 'eur', details: 'Sachets, bac, etiquettes' },
        { nom: 'Logistique', valeur: 1.2, type: 'eur', details: 'Froid, carburant, livraisons' },
        { nom: 'Plateforme', valeur: 1.8, type: 'eur', details: 'Outils, service client' },
        { nom: 'Autres', valeur: 1, type: 'eur', details: 'Taxes, imprevus, marge securite' },
      ],
      notePedagogique: 'Ordres de grandeur fournis par le producteur. Peut varier selon volumes.',
    },
    avis: {
      noteMoyenne: 4.6,
      nbAvis: 128,
      listeAvis: [
        {
          auteur: 'Camille L.',
          note: 5,
          date: '2025-02-18',
          commentaire: 'Texture cremeuse, parfait en salade. Livraison nickel.',
        },
        {
          auteur: 'Romain P.',
          note: 4,
          date: '2025-02-12',
          commentaire: 'Gout frais et lacte. Je prefere apres 24h de frigo.',
        },
      ],
    },
    questions: {
      activer: true,
      listeQnA: [
        {
          question: 'Comment se passe la livraison sur Lyon ?',
          reponse: 'Points relais refrigeres ou retrait ferme le vendredi.',
          date: '2025-02-10',
        },
        {
          question: 'Peut-on congeler ?',
          reponse: 'Non, la texture serait alteree. A consommer frais.',
          date: '2025-02-02',
        },
      ],
    },
    produitsLies: {
      autresFormats: [
        { id: 'chevre-250', name: 'Fromage frais 250g', category: 'Fromages frais', producerName: 'La Chevrerie du Bois', city: 'Lyon' },
        { id: 'chevre-1kg', name: 'Bac 1kg restauration', category: 'Fromages frais', producerName: 'La Chevrerie du Bois', city: 'Lyon' },
      ],
      autresDuProducteur: [
        { id: '8', name: 'Tomme affinee 6 mois', category: 'Fromages & Cremerie', producerName: 'La Chevrerie du Bois', city: 'Lyon' },
      ],
      similaires: [
        { id: 'burrata', name: 'Burrata artisanale', category: 'Fromages frais', producerName: 'Caseificio Verde', city: 'Bourg-en-Bresse' },
      ],
    },
    resumePictos: {
      origineZone: 'Rhone',
      paysOrigine: 'France',
      modeConservation: 'frais',
      dlcAReceptionEstimee: '7 jours',
      formatConditionnement: 'Sachet 150g',
      portions: '2-3',
      chaineDuFroid: true,
      chaineAnimal: {
        naissance: 'France',
        elevage: 'France',
        abattage: 'Non concerne',
        transformation: 'Lyon (3e)',
      },
    },
  },
};

const producerCityById: Record<string, string> = {
  'current-user': 'Paris 1er',
  p2: 'Lyon (3e)',
  p3: 'Grenoble',
  p4: 'Annecy',
  p5: 'Tours',
};

const producerStoryById: Record<string, string> = {
  'current-user': 'Production familiale, cueilli a maturite et prepare a la main.',
  p2: 'Fromagerie artisanale, lait cru collecte localement.',
  p3: 'Vergers en altitude, varietes selectionnees pour le gout.',
  p4: 'Ruchers en zone bocagere, extraction a froid.',
  p5: 'Fournee lente, fermentations longues, farine locale.',
};

const producerBadgesById: Record<string, string[]> = {
  'current-user': ['Producteur verifie'],
  p2: ['Producteur verifie'],
  p3: ['Saisonnier'],
  p4: ['Circuit court'],
  p5: ['Artisanal'],
};

const hashSeed = (value: string) => value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

const pickOne = <T,>(items: T[], seed: number) => items[seed % items.length];

const inferConservation = (category: string) => {
  const lowered = category.toLowerCase();
  if (lowered.includes('fromage') || lowered.includes('cremerie') || lowered.includes('viande') || lowered.includes('poisson')) {
    return 'frais' as const;
  }
  if (lowered.includes('glace') || lowered.includes('surgel')) return 'congele' as const;
  return 'ambiant' as const;
};

const inferIngredients = (productName: string) => {
  const lowered = productName.toLowerCase();
  if (lowered.includes('miel')) return ['Miel'];
  if (lowered.includes('pain') || lowered.includes('baguette')) return ['Farine de ble', 'Eau', 'Levain', 'Sel'];
  if (lowered.includes('fromage')) return ['Lait', 'Ferments lactiques', 'Presure', 'Sel'];
  if (lowered.includes('jus')) return ['Fruits', 'Eau'];
  return [productName];
};

const inferAllergens = (productName: string) => {
  const lowered = productName.toLowerCase();
  const allergens: string[] = [];
  if (lowered.includes('pain') || lowered.includes('baguette')) allergens.push('Gluten');
  if (lowered.includes('fromage') || lowered.includes('lait')) allergens.push('Lait');
  return allergens;
};

const buildCostPosts = (total: number) => {
  const parts = [
    { nom: 'Matiere premiere', ratio: 0.42, details: 'Approvisionnement et matiere premiere' },
    { nom: "Main d'oeuvre", ratio: 0.23, details: 'Temps de production et controle' },
    { nom: 'Transformation', ratio: 0.12, details: 'Atelier, energie, maintenance' },
    { nom: 'Conditionnement', ratio: 0.08, details: 'Emballages, etiquetage' },
    { nom: 'Logistique', ratio: 0.09, details: 'Transport et chaine du froid si besoin' },
    { nom: 'Plateforme', ratio: 0.06, details: 'Outils, support, mise en relation' },
  ];

  const values = parts.map((item) => Math.max(0, Number((total * item.ratio).toFixed(2))));
  const sumValues = values.reduce((acc, v) => acc + v, 0);
  const gap = Number((total - sumValues).toFixed(2));
  if (values.length) {
    values[values.length - 1] = Number((values[values.length - 1] + gap).toFixed(2));
  }

  return parts.map((item, index) => ({
    nom: item.nom,
    valeur: values[index],
    type: 'eur' as const,
    details: item.details,
  }));
};

export const buildDefaultProductDetail = (product: Product): ProductDetail => {
  const seed = hashSeed(product.id + product.name + product.producerId);
  const city = producerCityById[product.producerId] || 'Ville non renseignee';
  const originCountry = pickOne(['France', 'Italie', 'Espagne'], seed);
  const region = pickOne(['Ile-de-France', 'Auvergne-Rhone-Alpes', 'Centre-Val de Loire', 'Occitanie'], seed + 3);
  const departement = pickOne(['Rhone', 'Isere', 'Haute-Savoie', 'Indre-et-Loire', 'Paris'], seed + 5);
  const conservationMode = inferConservation(product.category);
  const chaineDuFroid = conservationMode === 'frais' || conservationMode === 'congele';
  const baseTotal = Number((Math.max(6, product.price * (product.measurement === 'kg' ? 2.5 : 3.2))).toFixed(2));
  const posts = buildCostPosts(baseTotal);

  const formats =
    product.measurement === 'kg'
      ? [
          {
            id: `${product.id}-1kg`,
            label: 'Format 1 kg',
            poidsNet: '1 kg',
            conditionnement: 'Sachet alimentaire',
            uniteVente: 'kg',
          },
          {
            id: `${product.id}-2kg`,
            label: 'Format 2 kg',
            poidsNet: '2 kg',
            conditionnement: 'Sachet alimentaire',
            uniteVente: 'kg',
          },
        ]
      : [
          {
            id: `${product.id}-x1`,
            label: 'Format x1',
            poidsNet: product.unit,
            conditionnement: 'Sachet ou boite',
            uniteVente: 'piece',
          },
          {
            id: `${product.id}-x3`,
            label: 'Format x3',
            poidsNet: `3 x ${product.unit}`,
            conditionnement: 'Lot',
            uniteVente: 'lot',
          },
        ];

  const ingredients = inferIngredients(product.name).map((nom) => ({ nom }));
  const allergens = inferAllergens(product.name);

  const today = new Date('2025-03-01T00:00:00.000Z');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (days: number) => new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    shortDescription: product.description,
    longDescription: 'Informations detaillees de test (fictive) pour valider le rendu.',
    productImage: { url: product.imageUrl, alt: product.name },
    producer: {
      id: product.producerId,
      name: product.producerName,
      city,
      photo: undefined,
      badgesProducteur: producerBadgesById[product.producerId] || ['Producteur'],
      shortStory: producerStoryById[product.producerId] || 'Histoire courte a completer.',
      liens: [{ type: 'lien', label: 'Voir le profil', url: `/profil/${product.producerId}` }],
    },
    conservationMode,
    portions: product.measurement === 'kg' ? '4-6 portions' : '1-2 portions',
    originCountry,
    zones: [region, departement],
    dlcEstimee: conservationMode === 'ambiant' ? 'DDM 3 mois' : 'DLC 7 jours',
    conditionnementPrincipal: product.unit,
    formats,
    officialBadges: product.description.toLowerCase().includes('bio') ? ['BIO'] : [],
    platformBadges: [chaineDuFroid ? 'Chaine du froid' : 'Sans froid', 'Traçable', 'Infos producteur'],
    productionConditions: {
      modeProduction: pickOne(['Ferme familiale', 'Artisanal', 'Cooperative locale'], seed + 7),
      intrantsPesticides: {
        utilise: product.description.toLowerCase().includes('bio') ? false : pickOne([false, false, true], seed + 9),
        details: "Details fictifs: pratiques declarees par le producteur.",
        explicationPedagogique: "Info simple: ces elements de transparence aident a comparer sans simplifier a l'exces.",
      },
      bienEtreAnimal: product.category.toLowerCase().includes('viande') ? 'Bien-etre animal: suivi et espace.' : undefined,
      social: 'Conditions sociales: equipe stable, formation interne.',
      environnement: 'Environnement: emballages reduits, optimisation transport.',
      preuves: [
        { type: 'pdf', label: 'Attestation (exemple)', url: '#' },
        { type: 'lien', label: 'Analyse (exemple)', url: '#' },
      ],
    },
    compositionEtiquette: {
      denominationVente: product.name,
      ingredients,
      allergenes: allergens.length ? allergens : undefined,
      additifs: ['Sans additifs'],
      conseilsUtilisation: 'Conseil: degustation a temperature adaptee, idees recettes dans la section description.',
      conservationDetaillee: chaineDuFroid
        ? 'Conserver au frais. Ne pas rompre la chaine du froid.'
        : "Conserver au sec, a l'abri de la chaleur.",
    },
    tracabilite: {
      paysOrigine: originCountry,
      lieuProduction: `${region}`,
      lieuTransformation: city,
      datesImportantes: [
        { label: 'Production', date: iso(addDays(2)) },
        { label: 'Transformation', date: iso(addDays(3)) },
        { label: 'Conditionnement', date: iso(addDays(4)) },
      ],
      timeline: [
        { etape: 'Production', lieu: region, date: iso(addDays(2)) },
        { etape: 'Transformation', lieu: city, date: iso(addDays(3)) },
        { etape: 'Conditionnement', lieu: city, date: iso(addDays(4)) },
        { etape: 'Livraison / Retrait', lieu: city, date: iso(addDays(6)) },
      ],
      preuves: [{ type: 'lien', label: 'Document de tracabilite (exemple)', url: '#' }],
    },
    productions: [
      {
        id: `${product.id}-lot-a`,
        nomLot: 'Lot en cours',
        debut: iso(addDays(5)),
        fin: iso(addDays(15)),
        periodeDisponibilite: { debut: iso(addDays(5)), fin: iso(addDays(15)) },
        qteTotale: Math.max(20, product.quantity),
        qteRestante: Math.max(0, Math.round(product.quantity * 0.4)),
        DLC_DDM: iso(addDays(conservationMode === 'ambiant' ? 90 : 12)),
        DLC_aReceptionEstimee: iso(addDays(conservationMode === 'ambiant' ? 90 : 12)),
        commentaire: 'Commentaire producteur (exemple).',
        numeroLot: `LOT-${product.id}-${seed % 9000}`,
        piecesJointes: [{ type: 'lien', label: 'Fiche lot', url: '#' }],
        statut: 'en_cours',
      },
      {
        id: `${product.id}-lot-b`,
        nomLot: 'Lot a venir',
        debut: iso(addDays(20)),
        fin: iso(addDays(35)),
        periodeDisponibilite: { debut: iso(addDays(20)), fin: iso(addDays(35)) },
        qteTotale: Math.max(30, product.quantity),
        qteRestante: Math.max(30, product.quantity),
        DLC_DDM: iso(addDays(conservationMode === 'ambiant' ? 120 : 30)),
        DLC_aReceptionEstimee: iso(addDays(conservationMode === 'ambiant' ? 120 : 30)),
        commentaire: 'Nouveau lot planifie (exemple).',
        numeroLot: `LOT-${product.id}-${(seed + 111) % 9000}`,
        piecesJointes: [{ type: 'pdf', label: 'Certificat (exemple)', url: '#' }],
        statut: 'a_venir',
      },
    ],
    repartitionValeur: {
      mode: 'detaille',
      uniteReference: product.measurement === 'kg' ? 'kg' : 'piece',
      totalReference: baseTotal,
      postes: posts,
      notePedagogique: 'Ces montants sont des ordres de grandeur. Le camembert se base sur les couts saisis.',
    },
    avis: {
      noteMoyenne: 4.3,
      nbAvis: 17 + (seed % 40),
      listeAvis: [
        { auteur: 'Camille', note: 5, date: '2025-02-18', commentaire: 'Tres bon produit, conforme aux infos.' },
        { auteur: 'Romain', note: 4, date: '2025-02-11', commentaire: 'Bonne qualite, pratique en commande groupee.' },
      ],
    },
    questions: {
      activer: true,
      listeQnA: [
        { question: 'Comment ca marche pour commander ?', reponse: 'Participez a une commande ou creez-en une.', date: '2025-02-10' },
        { question: 'Quelle est la duree de conservation ?', reponse: 'Voir la section Conservation & dates.', date: '2025-02-05' },
      ],
    },
    produitsLies: {
      autresFormats: formats.slice(0, 2).map((f) => ({ id: f.id, name: f.label, category: product.category, producerName: product.producerName, city })),
      autresDuProducteur: [
        { id: `p-${product.producerId}-1`, name: 'Autre produit du producteur', category: product.category, producerName: product.producerName, city },
      ],
      similaires: [
        { id: `sim-${product.id}`, name: 'Produit similaire', category: product.category, producerName: 'Producteur partenaire', city: pickOne(['Nantes', 'Bordeaux', 'Lille'], seed + 12) },
      ],
    },
    resumePictos: {
      origineZone: region,
      paysOrigine: originCountry,
      modeConservation: conservationMode,
      dlcAReceptionEstimee: conservationMode === 'ambiant' ? 'DDM 3 mois' : 'DLC 7 jours',
      formatConditionnement: product.unit,
      portions: product.measurement === 'kg' ? '4-6' : '1-2',
      chaineDuFroid,
    },
  };
};
