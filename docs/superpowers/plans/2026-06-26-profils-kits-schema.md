# Profils & Kits de pose — Schéma MongoDB — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persister les profils et kits de pose (données ODBC Gamesys) en MongoDB à la fin de chaque job traité, pour préparer la gestion de stock.

**Architecture:** Deux nouveaux modèles Mongoose (`StockArticle`, `ConsommationCommande`) + un service `profilsKitsService.js` qui appelle `getDossierDetail` après chaque job et upserte les articles et crée un enregistrement de consommation. Le service est appelé dans `processJob` dans un bloc try/catch indépendant : une défaillance ODBC ne fait jamais échouer le job.

**Tech Stack:** Node.js CommonJS, Mongoose, BullMQ, ODBC via `dossierService.getDossierDetail`, tests Mocha + Chai + sinon + MongoMemoryServer.

## Global Constraints

- CommonJS (`require`/`module.exports`) — pas d'ESM
- Aucune dépendance npm supplémentaire — sinon, chai, mongodb-memory-server déjà présents
- `stockDisponible` initialisé à 0, jamais décrémenté en phase 1
- Le bloc ODBC dans processJob est entouré d'un try/catch : échec silencieux (log warning)
- Commandes de test : `NODE_ENV=dev npm test` ou `npx mocha test/<fichier>.js`

---

## Cartographie des fichiers

| Fichier | Action |
|---------|--------|
| `server/src/models/StockArticle.js` | Créer |
| `server/src/models/ConsommationCommande.js` | Créer |
| `server/src/services/profilsKitsService.js` | Créer |
| `server/src/controllers/jobsController.js` | Modifier — importer + appeler `saveProfilsKits` après `saveDeco` |
| `test/integration/stockArticle.model.test.js` | Créer |
| `test/integration/consommationCommande.model.test.js` | Créer |
| `test/unit/profilsKitsService.test.js` | Créer |

---

### Task 1 : Modèles Mongoose — StockArticle + ConsommationCommande

**Files:**
- Create: `server/src/models/StockArticle.js`
- Create: `server/src/models/ConsommationCommande.js`
- Test: `test/integration/stockArticle.model.test.js`
- Test: `test/integration/consommationCommande.model.test.js`

**Interfaces:**
- Produces:
  - `StockArticle.findOneAndUpdate({ ref }, { $setOnInsert: {...} }, { upsert: true })` — upsert d'article
  - `ConsommationCommande.create({ numCmd, client, dateJob, articles })` — enregistrement de consommation

---

- [ ] **Step 1 : Écrire les tests qui échouent (StockArticle)**

Créer `test/integration/stockArticle.model.test.js` :

```js
const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const StockArticle = require("../../server/src/models/StockArticle");

describe("Modèle StockArticle (intégration)", () => {
  before(async () => { await connect(); });
  after(async () => { await disconnect(); });
  afterEach(async () => { await clearCollections(); });

  it("crée un article avec les champs requis", async () => {
    const doc = await StockArticle.create({
      ref: "KIT001",
      type: "kit",
      libelle: "KIT DE POSE",
    });
    expect(doc.ref).to.equal("KIT001");
    expect(doc.type).to.equal("kit");
    expect(doc.stockDisponible).to.equal(0);
  });

  it("refuse un document sans ref", async () => {
    let err;
    try { await StockArticle.create({ type: "profil" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("refuse un type invalide", async () => {
    let err;
    try { await StockArticle.create({ ref: "X", type: "inconnu" }); }
    catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("upsert $setOnInsert ne modifie pas un article existant", async () => {
    await StockArticle.create({ ref: "P001", type: "profil", libelle: "PROFIL ALU", stockDisponible: 10 });

    await StockArticle.findOneAndUpdate(
      { ref: "P001" },
      { $setOnInsert: { ref: "P001", type: "profil", libelle: "VALEUR IGNOREE", stockDisponible: 0 } },
      { upsert: true, new: true }
    );

    const found = await StockArticle.findOne({ ref: "P001" });
    expect(found.libelle).to.equal("PROFIL ALU");
    expect(found.stockDisponible).to.equal(10);
  });

  it("upsert $setOnInsert crée un nouvel article s'il est absent", async () => {
    await StockArticle.findOneAndUpdate(
      { ref: "NOUVEAU" },
      { $setOnInsert: { ref: "NOUVEAU", type: "kit", libelle: "NOUVEAU KIT" } },
      { upsert: true }
    );

    const found = await StockArticle.findOne({ ref: "NOUVEAU" });
    expect(found).to.not.be.null;
    expect(found.libelle).to.equal("NOUVEAU KIT");
    expect(found.stockDisponible).to.equal(0);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```
npx mocha test/integration/stockArticle.model.test.js
```

Attendu : FAIL — `Cannot find module '../../server/src/models/StockArticle'`

- [ ] **Step 3 : Créer `server/src/models/StockArticle.js`**

```js
const mongoose = require("mongoose");

const stockArticleSchema = new mongoose.Schema(
  {
    ref:             { type: String, required: true, unique: true },
    modele:          { type: String, default: "" },
    libelle:         { type: String, default: "" },
    type:            { type: String, enum: ["profil", "kit"], required: true },
    codeArticle:     { type: String, default: "" },
    famille:         { type: String, default: "" },
    sousFamille:     { type: String, default: "" },
    stockDisponible: { type: Number, default: 0 },
  },
  { timestamps: true }
);

stockArticleSchema.index({ ref: 1 });
stockArticleSchema.index({ type: 1 });

const StockArticle = mongoose.model("StockArticle", stockArticleSchema, "stock_articles");

module.exports = StockArticle;
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```
npx mocha test/integration/stockArticle.model.test.js
```

Attendu : 5 passing

- [ ] **Step 5 : Écrire les tests qui échouent (ConsommationCommande)**

Créer `test/integration/consommationCommande.model.test.js` :

```js
const { expect } = require("chai");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");

describe("Modèle ConsommationCommande (intégration)", () => {
  before(async () => { await connect(); });
  after(async () => { await disconnect(); });
  afterEach(async () => { await clearCollections(); });

  it("crée une consommation avec articles", async () => {
    const doc = await ConsommationCommande.create({
      numCmd: 164629,
      client: "LM",
      dateJob: new Date("2026-06-26"),
      articles: [
        { ref: "P001", type: "profil", libelle: "PROFIL BLANC 255", quantite: 2 },
        { ref: "KIT001", type: "kit", libelle: "KIT DE POSE", quantite: 1 },
      ],
    });

    expect(doc.numCmd).to.equal(164629);
    expect(doc.articles).to.have.length(2);
    expect(doc.articles[0].ref).to.equal("P001");
    expect(doc.articles[1].quantite).to.equal(1);
  });

  it("accepte un client valide", async () => {
    for (const client of ["LM", "CASTO", "BRICO", "ECOM"]) {
      const doc = await ConsommationCommande.create({
        numCmd: 1,
        client,
        articles: [],
      });
      expect(doc.client).to.equal(client);
    }
  });

  it("refuse un client invalide", async () => {
    let err;
    try {
      await ConsommationCommande.create({ numCmd: 1, client: "INCONNU", articles: [] });
    } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.name).to.equal("ValidationError");
  });

  it("le même numCmd peut avoir plusieurs documents (pas d'unicité)", async () => {
    await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });
    await ConsommationCommande.create({ numCmd: 99999, client: "LM", articles: [] });

    const count = await ConsommationCommande.countDocuments({ numCmd: 99999 });
    expect(count).to.equal(2);
  });

  it("dateJob prend la valeur courante par défaut", async () => {
    const before = new Date();
    const doc = await ConsommationCommande.create({ numCmd: 1, client: "LM", articles: [] });
    const after = new Date();

    expect(doc.dateJob.getTime()).to.be.at.least(before.getTime());
    expect(doc.dateJob.getTime()).to.be.at.most(after.getTime());
  });
});
```

- [ ] **Step 6 : Lancer le test pour vérifier qu'il échoue**

```
npx mocha test/integration/consommationCommande.model.test.js
```

Attendu : FAIL — `Cannot find module '../../server/src/models/ConsommationCommande'`

- [ ] **Step 7 : Créer `server/src/models/ConsommationCommande.js`**

```js
const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    ref:      { type: String },
    type:     { type: String, enum: ["profil", "kit"] },
    libelle:  { type: String, default: "" },
    quantite: { type: Number, default: 0 },
  },
  { _id: false }
);

const consommationCommandeSchema = new mongoose.Schema(
  {
    numCmd:  { type: Number, required: true },
    client:  { type: String, enum: ["LM", "CASTO", "BRICO", "ECOM"] },
    dateJob: { type: Date, default: Date.now },
    articles: [articleSchema],
  },
  { timestamps: true }
);

consommationCommandeSchema.index({ numCmd: 1 });
consommationCommandeSchema.index({ dateJob: -1 });

const ConsommationCommande = mongoose.model(
  "ConsommationCommande",
  consommationCommandeSchema,
  "consommations_commandes"
);

module.exports = ConsommationCommande;
```

- [ ] **Step 8 : Lancer les deux tests pour vérifier qu'ils passent**

```
npx mocha test/integration/stockArticle.model.test.js test/integration/consommationCommande.model.test.js
```

Attendu : 10 passing

- [ ] **Step 9 : Commit**

```bash
git add server/src/models/StockArticle.js server/src/models/ConsommationCommande.js test/integration/stockArticle.model.test.js test/integration/consommationCommande.model.test.js
git commit -m "feat: ajouter les modèles StockArticle et ConsommationCommande"
```

---

### Task 2 : Service profilsKitsService

**Files:**
- Create: `server/src/services/profilsKitsService.js`
- Test: `test/unit/profilsKitsService.test.js`

**Interfaces:**
- Consumes:
  - `getDossierDetail({ commande, view })` de `'../gamesys/services/dossierService'` — retourne `{ profileReferences, kitPosesReferences, sousDossiers }`
  - `isProfileLabel(str)` et `isKitPoseLabel(str)` de `'../gamesys/utils/reference'`
  - `StockArticle.findOneAndUpdate(filter, update, opts)` de `'../models/StockArticle'`
  - `ConsommationCommande.create(doc)` de `'../models/ConsommationCommande'`
- Produces:
  - `saveProfilsKits(job)` — `async (job: { cmd: Number, client: String }) => void`

---

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `test/unit/profilsKitsService.test.js` :

```js
const { expect } = require("chai");
const sinon = require("sinon");

// On stub les modules avant de require le service
const dossierService = require("../../server/src/gamesys/services/dossierService");
const StockArticle = require("../../server/src/models/StockArticle");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { saveProfilsKits } = require("../../server/src/services/profilsKitsService");

const GROUPED_WITH_PROFIL = {
  profileReferences: [
    { reference: "P001", articleReference: "P001", modele: "PROFIL BLANC", libelle: "PROFIL BLANC 255", codeTarif: "", famille: "PROFIL", sousFamille: "" },
  ],
  kitPosesReferences: [],
  sousDossiers: [
    {
      enteteDevis: [
        { endv_identif: "PROFIL BLANC 255", endv_quant: 3 },
        { endv_identif: "VISUEL MOSAIQUE", endv_quant: 1 },
      ],
    },
  ],
};

const GROUPED_WITH_KIT = {
  profileReferences: [],
  kitPosesReferences: [
    { reference: "KIT001", articleReference: "KIT001", modele: "KIT POSE", libelle: "KIT DE POSE", codeTarif: "KITPOSE", famille: "KIT", sousFamille: "" },
  ],
  sousDossiers: [
    {
      enteteDevis: [
        { endv_identif: "KIT DE POSE", endv_quant: 2 },
      ],
    },
  ],
};

const GROUPED_EMPTY = {
  profileReferences: [],
  kitPosesReferences: [],
  sousDossiers: [],
};

describe("profilsKitsService.saveProfilsKits()", () => {
  let getDossierDetailStub;
  let stockArticleStub;
  let consommationCreateStub;

  beforeEach(() => {
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail");
    stockArticleStub = sinon.stub(StockArticle, "findOneAndUpdate").resolves({});
    consommationCreateStub = sinon.stub(ConsommationCommande, "create").resolves({});
  });

  afterEach(() => {
    sinon.restore();
  });

  const fakeJob = (cmd = 164629, client = "LM") => ({ cmd, client });

  it("appelle getDossierDetail avec commande=cmd et view=summary", async () => {
    getDossierDetailStub.resolves(GROUPED_EMPTY);

    await saveProfilsKits(fakeJob(164629));

    expect(getDossierDetailStub.calledOnce).to.be.true;
    expect(getDossierDetailStub.firstCall.args[0]).to.deep.equal({
      commande: "164629",
      view: "summary",
    });
  });

  it("ne crée pas de ConsommationCommande si aucun profil ni kit", async () => {
    getDossierDetailStub.resolves(GROUPED_EMPTY);

    await saveProfilsKits(fakeJob());

    expect(consommationCreateStub.called).to.be.false;
    expect(stockArticleStub.called).to.be.false;
  });

  it("upserte un StockArticle pour un profil trouvé", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob());

    expect(stockArticleStub.calledOnce).to.be.true;
    const [filter, update, opts] = stockArticleStub.firstCall.args;
    expect(filter).to.deep.equal({ ref: "P001" });
    expect(update.$setOnInsert.type).to.equal("profil");
    expect(opts.upsert).to.be.true;
  });

  it("crée ConsommationCommande avec quantité issue de l'entête devis (profil)", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_PROFIL);

    await saveProfilsKits(fakeJob(164629, "LM"));

    expect(consommationCreateStub.calledOnce).to.be.true;
    const created = consommationCreateStub.firstCall.args[0];
    expect(created.numCmd).to.equal(164629);
    expect(created.client).to.equal("LM");
    expect(created.articles).to.have.length(1);
    expect(created.articles[0].ref).to.equal("P001");
    expect(created.articles[0].type).to.equal("profil");
    expect(created.articles[0].quantite).to.equal(3);
  });

  it("crée ConsommationCommande avec quantité pour un kit", async () => {
    getDossierDetailStub.resolves(GROUPED_WITH_KIT);

    await saveProfilsKits(fakeJob());

    const created = consommationCreateStub.firstCall.args[0];
    expect(created.articles[0].type).to.equal("kit");
    expect(created.articles[0].quantite).to.equal(2);
  });

  it("ne propage pas une exception si getDossierDetail échoue", async () => {
    getDossierDetailStub.rejects(new Error("ODBC timeout"));

    // Ne doit pas lever d'exception
    let threw = false;
    try { await saveProfilsKits(fakeJob()); }
    catch { threw = true; }
    expect(threw).to.be.false;
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```
npx mocha test/unit/profilsKitsService.test.js
```

Attendu : FAIL — `Cannot find module '../../server/src/services/profilsKitsService'`

- [ ] **Step 3 : Créer `server/src/services/profilsKitsService.js`**

```js
const logger = require("../logger/logger");
// Import via objet module (pas destructuré) pour permettre le stub sinon en test
const dossierService = require("../gamesys/services/dossierService");
const { isProfileLabel, isKitPoseLabel } = require("../gamesys/utils/reference");
const StockArticle = require("../models/StockArticle");
const ConsommationCommande = require("../models/ConsommationCommande");

function sumQtyByLabel(sousDossiers, predicate) {
  return (sousDossiers || [])
    .flatMap((s) => s.enteteDevis || [])
    .filter((e) => predicate(e.endv_identif || ""))
    .reduce((sum, e) => sum + (Number(e.endv_quant) || 0), 0);
}

async function upsertArticle(ref, fields) {
  await StockArticle.findOneAndUpdate(
    { ref },
    {
      $setOnInsert: {
        ref,
        modele: fields.modele || "",
        libelle: fields.libelle || "",
        type: fields.type,
        codeArticle: fields.codeArticle || "",
        famille: fields.famille || "",
        sousFamille: fields.sousFamille || "",
      },
    },
    { upsert: true }
  );
}

async function saveProfilsKits(job) {
  let grouped;
  try {
    grouped = await dossierService.getDossierDetail({ commande: String(job.cmd), view: "summary" });
  } catch (err) {
    logger.warn(`saveProfilsKits: getDossierDetail échoué pour cmd=${job.cmd} : ${err.message}`);
    return;
  }

  const profileReferences = grouped.profileReferences || [];
  const kitPosesReferences = grouped.kitPosesReferences || [];

  if (profileReferences.length === 0 && kitPosesReferences.length === 0) return;

  const profilQty = sumQtyByLabel(grouped.sousDossiers, isProfileLabel);
  const kitQty = sumQtyByLabel(grouped.sousDossiers, isKitPoseLabel);

  const articles = [];

  for (const r of profileReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "profil" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert profil ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "profil", libelle: r.libelle || "", quantite: profilQty });
  }

  for (const r of kitPosesReferences) {
    const ref = r.reference || r.articleReference || r.modele || r.libelle;
    if (!ref) continue;
    try {
      await upsertArticle(ref, { ...r, type: "kit" });
    } catch (err) {
      logger.warn(`saveProfilsKits: upsert kit ref=${ref} échoué : ${err.message}`);
    }
    articles.push({ ref, type: "kit", libelle: r.libelle || "", quantite: kitQty });
  }

  if (articles.length === 0) return;

  try {
    await ConsommationCommande.create({
      numCmd: job.cmd,
      client: job.client,
      dateJob: new Date(),
      articles,
    });
  } catch (err) {
    logger.warn(`saveProfilsKits: création ConsommationCommande échouée pour cmd=${job.cmd} : ${err.message}`);
  }
}

module.exports = { saveProfilsKits };
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```
npx mocha test/unit/profilsKitsService.test.js
```

Attendu : 6 passing

- [ ] **Step 5 : Commit**

```bash
git add server/src/services/profilsKitsService.js test/unit/profilsKitsService.test.js
git commit -m "feat: service saveProfilsKits — persistance profils/kits depuis Gamesys"
```

---

### Task 3 : Intégration dans processJob

**Files:**
- Modify: `server/src/controllers/jobsController.js`

**Interfaces:**
- Consumes: `saveProfilsKits(job)` de `'../services/profilsKitsService'`
- Le bloc s'insère après le try/catch de `saveDeco` (lignes 672–694 actuelles) et avant le bloc `if (isStock)` (ligne 696).

---

- [ ] **Step 1 : Ajouter l'import en haut de `jobsController.js`**

Après la ligne :
```js
const { state } = require("../services/appState");
```
Ajouter :
```js
const { saveProfilsKits } = require("../services/profilsKitsService");
```

- [ ] **Step 2 : Insérer l'appel dans `processJob` après le bloc saveDeco**

Localiser dans `processJob` le bloc (lignes ~692–694) :
```js
  } catch (error) {
    logger.error(`Erreur sauvegarde dossier pour le job ${job.cmd}: ${error.message}`);
  }

  if (isStock) {
```

Insérer **entre** ces deux blocs :
```js
  try {
    await saveProfilsKits(job);
  } catch (err) {
    logger.warn(`Profils/kits non enregistrés pour le job ${job.cmd} : ${err.message}`);
  }
```

Le résultat doit être :
```js
  } catch (error) {
    logger.error(`Erreur sauvegarde dossier pour le job ${job.cmd}: ${error.message}`);
  }

  try {
    await saveProfilsKits(job);
  } catch (err) {
    logger.warn(`Profils/kits non enregistrés pour le job ${job.cmd} : ${err.message}`);
  }

  if (isStock) {
```

- [ ] **Step 3 : Lancer la suite de tests complète**

```
NODE_ENV=dev npm test
```

Attendu : tous les tests existants passent, aucune régression.

- [ ] **Step 4 : Vérification manuelle**

1. Démarrer le serveur : `npm run server`
2. Dans l'interface, traiter un job dont le numéro de commande a des profils ou kits dans Gamesys
3. Vérifier MongoDB :
   - Collection `stock_articles` : l'article est présent avec `stockDisponible: 0`
   - Collection `consommations_commandes` : une entrée avec `numCmd`, `client`, `articles[].quantite` correcte
4. Traiter à nouveau le même job → `stock_articles` inchangé, nouvelle entrée dans `consommations_commandes`
5. Traiter un job dont le numéro de commande n'existe pas dans Gamesys → warning en log, pas d'entrée créée, job terminé normalement

- [ ] **Step 5 : Commit**

```bash
git add server/src/controllers/jobsController.js
git commit -m "feat: appeler saveProfilsKits après chaque job traité"
```

---

## Récapitulatif des vérifications

| Scénario | Résultat attendu |
|----------|-----------------|
| Job avec profils dans Gamesys | `StockArticle` créé, `ConsommationCommande` créée |
| Job sans profils/kits | Aucun document créé, log debug |
| Gamesys indisponible | Warning log, job complété normalement |
| Même ref, 2e job | `StockArticle` inchangé (`$setOnInsert`), 2e `ConsommationCommande` créée |
| `ref` null dans Gamesys | Article ignoré (continue), reste des articles traités |
