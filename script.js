(function () {
  // Produits (prix incluent déjà 10 % de la plateforme)
  const products = [
    {
      id: "foie",
      name: "Foie gras mi-cuit 120 g",
      price: 13.75,
      weightKg: 0.12,
      subtitle: "Bocal 120 g",
      tags: ["Produit phare", "Fêtes"]
    },
    {
      id: "rillettes",
      name: "Rillettes 250 g",
      price: 3.96,
      weightKg: 0.25,
      subtitle: "Bocal 250 g",
      tags: ["Apéritif", "À tartiner"]
    },
    {
      id: "pate",
      name: "Pâté paysan 180 g",
      price: 5.28,
      weightKg: 0.18,
      subtitle: "Bocal 180 g",
      tags: ["Campagne", "Terrine"]
    }
  ];

  const state = {
    selectedIds: new Set(),
    lastScenario: null
  };

  function formatEuro(v) {
    if (!isFinite(v)) return "-";
    return v.toFixed(2).replace(".", ",") + " €";
  }

  function formatDate(value) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    const [y, m, d] = parts;
    return d + "/" + m + "/" + y;
  }

  /**
   * Coût logistique total en fonction du poids (kg).
   * Fonction continue : C(w) ≈ 7 + 8 * sqrt(w), puis arrondie au multiple de 5 €,
   * avec un minimum de 15 €. Cela donne une progression de plus en plus lente
   * et un coût au kilo décroissant.
   */
  function logisticCostByWeight(weightKg) {
    if (!weightKg || weightKg <= 0) return 0;
    const raw = 7 + 8 * Math.sqrt(weightKg);
    const rounded = Math.max(15, 5 * Math.round(raw / 5));
    return rounded;
  }

  function getSelectedProducts() {
    const arr = [];
    state.selectedIds.forEach((id) => {
      const p = products.find((pp) => pp.id === id);
      if (p) arr.push(p);
    });
    return arr;
  }

  /* CARTES */

  function createCard(product, inDeck) {
    const card = document.createElement("div");
    card.className = "card-product";
    card.dataset.productId = product.id;

    const tags = product.tags && product.tags.length ? product.tags.join(" • ") : "Produit";

    card.innerHTML = `
      <div class="card-header">
        <span class="card-chip">Ferme Menaoude</span>
        <span class="card-badge">${inDeck ? "Deck" : "Table"}</span>
      </div>
      <div class="card-image">Image du produit</div>
      <div class="card-body">
        <div class="card-title">${product.name}</div>
        <div>${product.subtitle}</div>
        <div class="card-price">${formatEuro(product.price)}</div>
        <span class="card-tag">${tags}</span>
      </div>
    `;

    if (inDeck) {
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", product.id);
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
      });
    } else {
      const actions = document.createElement("div");
      actions.className = "card-remove";
      actions.innerHTML = `<button type="button" data-remove="${product.id}">Retirer</button>`;
      card.appendChild(actions);

      actions.querySelector("button").addEventListener("click", () => {
        state.selectedIds.delete(product.id);
        card.remove();
        updateDropZoneAppearance();
        computeScenario();
      });
    }

    return card;
  }

  function buildDeck() {
    const deck = document.getElementById("deck");
    deck.innerHTML = "";
    products.forEach((p) => {
      const card = createCard(p, true);
      deck.appendChild(card);
    });
  }

  function addProductToTable(productId) {
    if (state.selectedIds.has(productId)) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    state.selectedIds.add(productId);

    const tableCards = document.getElementById("tableCards");
    const card = createCard(product, false);
    tableCards.appendChild(card);

    updateDropZoneAppearance();
    computeScenario();
  }

  function updateDropZoneAppearance() {
    const dropZone = document.getElementById("dropZone");
    const tableCards = document.getElementById("tableCards");
    if (state.selectedIds.size === 0) {
      dropZone.classList.add("empty");
      tableCards.innerHTML = "";
    } else {
      dropZone.classList.remove("empty");
    }
  }

  /* SCÉNARIO (UN SEUL, AVEC PART VARIABLE) */

  function computeScenario() {
    const selected = getSelectedProducts();
    const recapGlobal = document.getElementById("recapGlobal");
    const recapBody = document.getElementById("recapProductsBody");
    const recapEmpty = document.getElementById("recapEmpty");
    const weightError = document.getElementById("weightError");
    const shareInput = document.getElementById("sharePercent");
    const shareLabel = document.getElementById("sharePercentLabel");

    recapGlobal.innerHTML = "";
    recapBody.innerHTML = "";

    const sharePercent = Number(shareInput.value) || 0;
    shareLabel.textContent = sharePercent.toString();

    let shareFraction = sharePercent / 100;
    if (shareFraction >= 0.8) shareFraction = 0.8; // sécurité
    const factorShare = shareFraction > 0 ? 1 / (1 - shareFraction) : 1;

    const minWeightInput = document.getElementById("minWeightKg");
    const maxWeightInput = document.getElementById("maxWeightKg");

    let minWeight = Number(minWeightInput.value) || 0;
    let maxWeight = Number(maxWeightInput.value) || 0;

    if (minWeight < 0) minWeight = 0;
    if (maxWeight < 0) maxWeight = 0;

    weightError.classList.add("hidden");
    if (minWeight <= 0) {
      weightError.classList.remove("hidden");
    }

    if (selected.length === 0 || minWeight <= 0) {
      recapEmpty.classList.remove("hidden");
      state.lastScenario = null;
      return;
    }

    recapEmpty.classList.add("hidden");

    // Somme des poids de tous les produits de la commande (1 unité chacun)
    const totalWeightProducts = selected.reduce(
      (sum, p) => sum + (p.weightKg || 0),
      0
    );

    if (totalWeightProducts <= 0) {
      recapEmpty.classList.remove("hidden");
      state.lastScenario = null;
      return;
    }

    // Poids utilisé pour la logistique : max entre poids des produits et poids minimum saisi
    let effectiveWeight = totalWeightProducts;
    if (minWeight > effectiveWeight) effectiveWeight = minWeight;

    const logTotal = logisticCostByWeight(effectiveWeight);
    const logPerKg = logTotal / effectiveWeight;

    let totalShareBase = 0;
    const perProductScenario = [];

    selected.forEach((p) => {
      const logPerUnit = logPerKg * (p.weightKg || 0);
      const basePlusLog = p.price + logPerUnit;
      const clientPrice = basePlusLog * factorShare;
      const sharePerUnit = clientPrice - basePlusLog;

      totalShareBase += sharePerUnit; // pour 1 unité de chaque produit

      recapBody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${p.name}</td>
            <td class="num">${formatEuro(p.price)}</td>
            <td class="num">${formatEuro(logPerUnit)}</td>
            <td class="num">${formatEuro(sharePerUnit)}</td>
            <td class="num">${formatEuro(clientPrice)}</td>
          </tr>
        `
      );

      perProductScenario.push({
        id: p.id,
        name: p.name,
        basePrice: p.price,
        clientPrice,
        logPerUnit,
        sharePerUnit
      });
    });

    // Ajuster la part totale en fonction du poids effectif vs poids des produits (1 unité chacun)
    const weightScale =
      totalWeightProducts > 0 ? effectiveWeight / totalWeightProducts : 1;
    const totalShareEffective = totalShareBase * weightScale;

    recapGlobal.innerHTML = `
      <div class="recap-card">
        <h3>Vue d’ensemble</h3>
        <p>Poids produits (1 unité) : <strong>${totalWeightProducts.toFixed(
          2
        )} kg</strong></p>
        <p>Poids minimum saisi : <strong>${minWeight.toFixed(2)} kg</strong></p>
        <p>Poids pris pour la logistique : <strong>${effectiveWeight.toFixed(
          2
        )} kg</strong></p>
        <p>Coût logistique total : <strong>${formatEuro(logTotal)}</strong></p>
        <p>Part partageur : <strong>${sharePercent}%</strong></p>
        <p>Valeur estimée de la part (pour ce poids) : <strong>${formatEuro(
          totalShareEffective
        )}</strong></p>
        <p class="recap-muted">Prix client = produit + logistique + part du partageur.</p>
      </div>
    `;

    const title =
      (document.getElementById("orderTitle").value || "").trim() ||
      "Commande groupée – Ferme Menaoude";
    const deadline = document.getElementById("deadline").value;
    const message = (document.getElementById("clientMessage").value || "").trim();

    state.lastScenario = {
      title,
      deadline,
      message,
      sharePercent,
      shareFraction,
      totalWeightProducts,
      minWeight,
      maxWeight,
      effectiveWeight,
      logTotal,
      logPerKg,
      perProductScenario,
      totalShareEffective
    };
  }

  /* VUE CLIENT */

  function showClientScreen() {
    if (!state.lastScenario) {
      alert("Pose au moins une carte et indique un poids minimum.");
      return;
    }

    const builderScreen = document.getElementById("builder-screen");
    const clientScreen = document.getElementById("client-screen");
    const builderHeader = document.getElementById("builder-header");
    const s = state.lastScenario;

    const clientTitle = document.getElementById("clientTitle");
    const clientSubtitle = document.getElementById("clientSubtitle");
    const clientMessageBox = document.getElementById("clientMessageBox");
    const clientProducts = document.getElementById("clientProducts");

    clientTitle.textContent = s.title;

    let subtitle = "";
    if (s.deadline) {
      subtitle += "Jusqu’au " + formatDate(s.deadline);
    }
    if (s.minWeight > 0) {
      if (subtitle) subtitle += " · ";
      subtitle += "Poids minimum : " + s.minWeight.toFixed(1) + " kg";
    }
    if (s.maxWeight > 0) {
      subtitle += " · max : " + s.maxWeight.toFixed(1) + " kg";
    }
    if (subtitle) subtitle += " · ";
    subtitle += "Part partageur : " + s.sharePercent.toFixed(0) + " %";

    clientSubtitle.textContent = subtitle;

    if (s.message) {
      clientMessageBox.textContent = s.message;
      clientMessageBox.classList.remove("hidden");
    } else {
      clientMessageBox.classList.add("hidden");
    }

    clientProducts.innerHTML = "";
    s.perProductScenario.forEach((p) => {
      const card = document.createElement("div");
      card.className = "client-card";
      card.innerHTML = `
        <h3>${p.name}</h3>
        <p class="price-line">Prix par carte : ${formatEuro(p.clientPrice)}</p>
        <p class="note">Inclut logistique et part du partageur.</p>
        <label>
          Quantité souhaitée
          <input type="number" min="0" step="1" value="0" />
        </label>
      `;
      clientProducts.appendChild(card);
    });

    builderScreen.classList.add("hidden");
    builderHeader.classList.add("hidden");
    clientScreen.classList.remove("hidden");
  }

  function backToBuilder() {
    document.getElementById("client-screen").classList.add("hidden");
    document.getElementById("builder-screen").classList.remove("hidden");
    document.getElementById("builder-header").classList.remove("hidden");
  }

  function shareOrder() {
    if (!state.lastScenario) return;
    const s = state.lastScenario;
    const text =
      'Rejoins ma commande groupée "' +
      s.title +
      '" sur Partage' +
      (s.deadline ? " avant le " + formatDate(s.deadline) : "") +
      ".";

    const url = window.location.href;

    if (navigator.share) {
      navigator
        .share({
          title: s.title,
          text: text,
          url: url
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          alert("Lien copié dans le presse-papiers.");
        })
        .catch(() => {
          alert("Impossible de copier automatiquement. Copie l’adresse de la page.");
        });
    } else {
      alert("Copie l’adresse de cette page pour la partager.");
    }
  }

  /* DROP ZONE */

  function setupDropZone() {
    const dropZone = document.getElementById("dropZone");

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("is-over");
    });

    dropZone.addEventListener("dragleave", (e) => {
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove("is-over");
      }
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("is-over");
      const productId = e.dataTransfer.getData("text/plain");
      if (productId) addProductToTable(productId);
    });
  }

  /* DECK BAS */

  function setupDeckDrawer() {
    const drawer = document.getElementById("deckDrawer");
    const toggle = document.getElementById("deckToggle");
    const arrow = document.getElementById("deckArrow");

    toggle.addEventListener("click", () => {
      const isOpen = drawer.classList.toggle("open");
      arrow.textContent = isOpen ? "▼" : "▲";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildDeck();
    setupDropZone();
    setupDeckDrawer();
    updateDropZoneAppearance();

    document
      .getElementById("sharePercent")
      .addEventListener("input", computeScenario);
    document
      .getElementById("minWeightKg")
      .addEventListener("input", computeScenario);
    document
      .getElementById("maxWeightKg")
      .addEventListener("input", computeScenario);
    document
      .getElementById("orderTitle")
      .addEventListener("input", computeScenario);
    document
      .getElementById("deadline")
      .addEventListener("input", computeScenario);
    document
      .getElementById("clientMessage")
      .addEventListener("input", computeScenario);

    document.getElementById("btnGenerate").addEventListener("click", () => {
      computeScenario();
      showClientScreen();
    });

    document.getElementById("btnBackBuilder").addEventListener("click", backToBuilder);
    document.getElementById("btnShare").addEventListener("click", shareOrder);

    computeScenario();
  });
})();
