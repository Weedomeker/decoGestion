# Synthèse commandes → accélération des backfills de démarrage — Plan d'implémentation

> **Pour les exécutants agentiques :** SOUS-COMPÉTENCE REQUISE : `superpowers:executing-plans` (exécution inline avec checkpoints). Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

**Objectif :** remplacer les allers-retours ODBC commande-par-commande des tâches de démarrage par une seule requête ensembliste (`fetchSyntheseCommandes`, POC déjà validé) mise en cache dans une `Map`, et éviter le travail redondant à chaque redémarrage.

**Architecture :** `dossierService.fetchSyntheseCommandes` ramène en 1 requête (~300 ms, testé 7 j / 30 j) prix, dates, magasin, profils/kits par commande. `syntheseCommandesService.chargerSyntheseCommandes` en fait une `Map<numCmd, synthèse>`. Les phases de backfill Deco (`decoLivraisonDates`, `decoPrix`, `decoCommandeInfo`) reçoivent cette Map en paramètre optionnel : quand la donnée y est, aucun appel Gamesys ; sinon repli sur le `fetchDossier*` existant (couverture inchangée par construction). Un watermark Mongo réduit `sinceDate` au delta depuis le dernier run réussi.

**Stack :** Node CommonJS, Mongoose, node-odbc (pool), Mocha + Chai + Sinon.

**Spec :** conversation du 2026-09-01 (analyse + POC dans `dossierService.fetchSyntheseCommandes`, `server/src/services/syntheseCommandesService.js`, `server/scripts/probeSyntheseCommandes.js`). Réf. `docs/gamesys suivis commandes.sql`.

## Contraintes globales

- **Clause `ent_statut_commande < 900` conservée** (décision utilisateur 2026-09-01) — les commandes soldées/annulées restent hors synthèse ; le repli `fetchDossier*` les couvre.
- **Une seule connexion ODBC réutilisée** par phase, jamais `getDossierDetail` en boucle (cf. `[[feedback_odbc_backfill_resource_limits]]`).
- **Base Mongo « Test » en dev** (`NODE_ENV=development`) — cf. `[[feedback_mongodb_test_db_dev]]`. Lancer les tests avec `NODE_ENV=development`.
- **Ne pas lancer `npm run format`** — formater à la main les seuls fichiers touchés (cf. `[[feedback_npm_run_format_reformate_tout]]`).
- Commandes tests : `NODE_ENV=development npx mocha "test/unit/**/*.test.js" --ignore "test/unit/queueService.test.js" --timeout 10000 --exit`
- Repli identité fonctionnelle : après wiring, un `numCmd` absent de la synthèse doit produire **exactement** le même résultat qu'avant (repli `fetchDossier*`).

---

## Task 1 : enrichir la synthèse (`formatPlaqueGamesys` + résolution client catalogue)

**Files :**
- Modify : `server/src/gamesys/services/dossierService.js` (`buildSyntheseCommandesSql`, `mapSyntheseRow`)
- Modify : `server/src/services/syntheseCommandesService.js` (`chargerSyntheseCommandes`)
- Test : `test/unit/syntheseCommandesService.test.js`
- Vérif manuelle : `server/scripts/probeSyntheseCommandes.js`

**Interfaces :**
- Produces : `fetchSyntheseCommandes(connection, { sinceDate, seulementLivrables })` → `Array<{ numCmd:number, client:string|null, codeClientGamesys, refClient, offreGamesys, magasin, ville, dateCommande:Date|null, dateDepartUsinePrev:Date|null, dateLivraisonSouhaitee:Date|null, prixTotal:number|null, surMesure:boolean, nombreProfil:number, nombreKitPose:number, formatsPlaque:Array, formatPlaqueGamesys:string|null }>`
- Produces : `chargerSyntheseCommandes({ sinceDate, clients?, seulementLivrables?, resoudreClientsViaCatalogue?, connection? })` → `Promise<Map<number, synthèse>>`

- [ ] **Étape 1.1 — SQL : joindre `fd_dossier` pour `dos_supp_1_ft`.**
  Dans `buildSyntheseCommandesSql`, ajouter dans le `SELECT` (après `date_livraison_souhaitee`) :
  ```sql
  MAX(NULLIF(TRIM(dos_supp_1_ft), '')) AS format_plaque_gamesys,
  ```
  et dans les `LEFT JOIN` (après `ff_livraison`) :
  ```sql
  LEFT JOIN public.fd_dossier ON dos_no_cmde = endv_no_commande
  ```
  Ne PAS ajouter `dos_supp_1_ft` au `GROUP BY` (il est sous agrégat `MAX`).

- [ ] **Étape 1.2 — `mapSyntheseRow` : exposer le champ.**
  Ajouter dans l'objet retourné :
  ```js
  formatPlaqueGamesys: row.format_plaque_gamesys || null,
  ```

- [ ] **Étape 1.3 — `chargerSyntheseCommandes` : option `resoudreClientsViaCatalogue`.**
  Signature : `async function chargerSyntheseCommandes({ sinceDate, clients, seulementLivrables = false, resoudreClientsViaCatalogue = false, connection } = {})`.
  Après avoir obtenu `lignes` (et avant la boucle de construction de Map), si `resoudreClientsViaCatalogue` :
  ```js
  let clientParNumCmd = null;
  if (resoudreClientsViaCatalogue) {
    try {
      const recentes = await dossierService.listCommandesRecentes({ sinceDate });
      clientParNumCmd = new Map();
      for (const c of recentes) {
        const n = parseInt(c.cmd, 10);
        if (n && !Number.isNaN(n) && c.client) clientParNumCmd.set(n, c.client);
      }
    } catch (err) {
      logger.warn(`chargerSyntheseCommandes: résolution client via catalogue échouée : ${err.message}`);
    }
  }
  ```
  Dans la boucle, avant le test `!ligne.client` :
  ```js
  if (!ligne.client && clientParNumCmd) {
    const recupere = clientParNumCmd.get(ligne.numCmd);
    if (recupere) ligne.client = recupere;
  }
  ```
  `listCommandesRecentes` doit être appelé sans connexion partagée (il gère la sienne).

- [ ] **Étape 1.4 — Tests.** Dans `test/unit/syntheseCommandesService.test.js`, ajouter au `describe` existant :
  ```js
  it("résout le client des comptes non préfixés via listCommandesRecentes quand demandé", async () => {
    fetchStub.resolves([{ numCmd: 5, client: null, magasin: "X" }]);
    const listStub = sinon.stub(dossierService, "listCommandesRecentes").resolves([{ cmd: "5", client: "ECOM" }]);
    const map = await chargerSyntheseCommandes({ sinceDate: new Date(), resoudreClientsViaCatalogue: true });
    expect(map.get(5).client).to.equal("ECOM");
    expect(listStub.calledOnce).to.be.true;
  });

  it("n'appelle pas listCommandesRecentes quand resoudreClientsViaCatalogue est absent/false", async () => {
    fetchStub.resolves([{ numCmd: 5, client: null }]);
    const listStub = sinon.stub(dossierService, "listCommandesRecentes").resolves([]);
    const map = await chargerSyntheseCommandes({ sinceDate: new Date() });
    expect(listStub.called).to.be.false;
    expect(map.size).to.equal(0); // client null => ligne ignorée
  });

  it("continue si listCommandesRecentes échoue (client reste null, ligne ignorée)", async () => {
    fetchStub.resolves([{ numCmd: 5, client: null }]);
    sinon.stub(dossierService, "listCommandesRecentes").rejects(new Error("ODBC"));
    const map = await chargerSyntheseCommandes({ sinceDate: new Date(), resoudreClientsViaCatalogue: true });
    expect(map.size).to.equal(0);
  });
  ```

- [ ] **Étape 1.5 — Lancer les tests.** `NODE_ENV=development npx mocha test/unit/syntheseCommandesService.test.js --timeout 10000 --exit` → tout PASS (11 cas).

- [ ] **Étape 1.6 — Vérif base réelle.** `NODE_ENV=development node server/scripts/probeSyntheseCommandes.js --days=7` puis `--days=30`. Attendu : `format_plaque_gamesys` non nul sur les lignes visuel de l'aperçu ; requête toujours < ~600 ms ; « lignes sans client mappable » inchangé (la résolution catalogue est côté service, hors probe). Si la jointure `fd_dossier` fait exploser le temps (fan-out sous-dossiers), repli : retirer l'étape 1.1 et garder `fetchDossierFormatPlaque` en repli permanent pour ce seul champ (noter dans le commentaire de `buildSyntheseCommandesSql`).

- [ ] **Étape 1.7 — Commit.**
  ```bash
  git add server/src/gamesys/services/dossierService.js server/src/services/syntheseCommandesService.js test/unit/syntheseCommandesService.test.js
  git commit -m "feat(synthese): formatPlaqueGamesys + résolution client via catalogue"
  ```

---

## Task 2 : batcher les `.exists()` Mongo en boucle

**Files :**
- Modify : `server/src/services/decoGamesysStubSyncService.js:23-33`
- Modify : `server/src/services/gamesysConsommationSyncService.js:15-25`
- Test : `test/unit/decoGamesysStubSyncService.test.js`, `test/unit/gamesysConsommationSyncService.test.js`

**Interfaces :** aucune signature publique modifiée. `Deco.exists` / `ConsommationCommande.exists` (N appels) → `Deco.find({ numCmd: { $in } }, { numCmd: 1 })` (1 appel).

- [ ] **Étape 2.1 — `decoGamesysStubSyncService` : remplacer la boucle `.exists()`.**
  Remplacer le bloc `for (const candidat of candidats) { ... Deco.exists({ numCmd }) ... }` par :
  ```js
  const numCmdParCandidat = candidats
    .map((c) => ({ candidat: c, numCmd: parseInt(c.cmd, 10) }))
    .filter((x) => x.numCmd && !Number.isNaN(x.numCmd));

  const numCmds = [...new Set(numCmdParCandidat.map((x) => x.numCmd))];
  const dejaEnBase = new Set(
    (await Deco.find({ numCmd: { $in: numCmds } }, { numCmd: 1 }).lean()).map((d) => d.numCmd),
  );

  for (const { candidat, numCmd } of numCmdParCandidat) {
    if (dejaEnBase.has(numCmd)) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push({ ...candidat, numCmd });
  }
  ```
  (Les candidats à `cmd` non numérique restent comptés dans `resume.candidats = candidats.length` fixé plus haut ; ils sont simplement exclus de `numCmdParCandidat` — comportement identique à l'actuel `continue`.)

- [ ] **Étape 2.2 — `gamesysConsommationSyncService` : idem.**
  Remplacer le `for (const candidate of candidats) { ... ConsommationCommande.exists({ numCmd }) ... }` par :
  ```js
  const avecNumCmd = candidats
    .map((c) => ({ candidate: c, numCmd: parseInt(c.cmd, 10) }))
    .filter((x) => x.numCmd && !Number.isNaN(x.numCmd));

  const numCmds = [...new Set(avecNumCmd.map((x) => x.numCmd))];
  const dejaEnBase = new Set(
    (await ConsommationCommande.find({ numCmd: { $in: numCmds } }, { numCmd: 1 }).lean()).map((d) => d.numCmd),
  );

  for (const { candidate } of avecNumCmd) {
    if (dejaEnBase.has(parseInt(candidate.cmd, 10))) {
      resume.dejaExistants += 1;
      continue;
    }
    aTraiter.push(candidate);
  }
  ```

- [ ] **Étape 2.3 — Adapter les tests existants.**
  Dans les deux fichiers de test, là où `existsStub = sinon.stub(Deco, "exists")` (resp. `ConsommationCommande`), remplacer par un stub de `find` renvoyant un objet avec `.lean()` :
  ```js
  findStub = sinon.stub(Deco, "find").returns({ lean: sinon.stub().resolves([]) }); // aucun doc déjà en base
  // cas "déjà présent" :
  findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 167648 }]) });
  ```
  Vérifier que les assertions `dejaExistants` / `crees` / `getDbConnection non appelé quand tout est déjà en base` passent toujours.

- [ ] **Étape 2.4 — Tests.** Les 2 fichiers → PASS. Puis suite unitaire complète → PASS.

- [ ] **Étape 2.5 — Commit.**
  ```bash
  git add server/src/services/decoGamesysStubSyncService.js server/src/services/gamesysConsommationSyncService.js test/unit/decoGamesysStubSyncService.test.js test/unit/gamesysConsommationSyncService.test.js
  git commit -m "perf(sync): batch des checks d'existence Mongo (1 \$in au lieu de N exists)"
  ```

---

## Task 3 : watermark de dernier passage

**Files :**
- Create : `server/src/models/BackfillWatermark.js`
- Create : `server/src/services/backfillWatermarkService.js`
- Create : `test/unit/backfillWatermarkService.test.js`
- Modify : `server/server.js:233-268` (blocs backfill + stub sync)

**Interfaces :**
- Produces : `resolveSinceDate({ cle, fenetreDefautJours, margeJours = 1 })` → `Promise<Date>` — renvoie `max(now - fenetreDefautJours, dernierRun - margeJours)`.
- Produces : `marquerRun(cle)` → `Promise<void>` — upsert `{ _id: cle, ranAt: new Date() }`.

- [ ] **Étape 3.1 — Modèle.** `server/src/models/BackfillWatermark.js` :
  ```js
  const mongoose = require("mongoose");

  const schema = new mongoose.Schema(
    { _id: { type: String }, ranAt: { type: Date, required: true } },
    { timestamps: true, versionKey: false },
  );

  module.exports = mongoose.model("BackfillWatermark", schema, "backfill_watermarks");
  ```

- [ ] **Étape 3.2 — Service.** `server/src/services/backfillWatermarkService.js` :
  ```js
  const logger = require("../logger/logger");
  const BackfillWatermark = require("../models/BackfillWatermark");

  const JOUR_MS = 24 * 60 * 60 * 1000;

  // sinceDate = borne la plus RÉCENTE entre (now - fenêtre défaut) et (dernier run - marge).
  // Au 1er run (pas de watermark) => fenêtre défaut pleine. Aux runs suivants => petit delta.
  async function resolveSinceDate({ cle, fenetreDefautJours, margeJours = 1 }) {
    const parDefaut = new Date(Date.now() - fenetreDefautJours * JOUR_MS);
    try {
      const doc = await BackfillWatermark.findById(cle).lean();
      if (!doc || !doc.ranAt) return parDefaut;
      const depuisDernierRun = new Date(doc.ranAt.getTime() - margeJours * JOUR_MS);
      return depuisDernierRun > parDefaut ? depuisDernierRun : parDefaut;
    } catch (err) {
      logger.warn(`backfillWatermark: lecture ${cle} échouée, fenêtre défaut : ${err.message}`);
      return parDefaut;
    }
  }

  async function marquerRun(cle) {
    try {
      await BackfillWatermark.updateOne({ _id: cle }, { $set: { ranAt: new Date() } }, { upsert: true });
    } catch (err) {
      logger.warn(`backfillWatermark: écriture ${cle} échouée : ${err.message}`);
    }
  }

  module.exports = { resolveSinceDate, marquerRun };
  ```

- [ ] **Étape 3.3 — Tests.** `test/unit/backfillWatermarkService.test.js` :
  ```js
  const { expect } = require("chai");
  const sinon = require("sinon");
  const BackfillWatermark = require("../../server/src/models/BackfillWatermark");
  const { resolveSinceDate, marquerRun } = require("../../server/src/services/backfillWatermarkService");

  describe("backfillWatermarkService", () => {
    afterEach(() => sinon.restore());

    it("renvoie la fenêtre défaut quand aucun watermark", async () => {
      sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves(null) });
      const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 5 });
      const attendu = Date.now() - 5 * 24 * 3600 * 1000;
      expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
    });

    it("renvoie (dernier run - marge) quand plus récent que la fenêtre défaut", async () => {
      const ranAt = new Date(Date.now() - 2 * 24 * 3600 * 1000); // il y a 2 j
      sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves({ ranAt }) });
      const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 30, margeJours: 1 });
      const attendu = ranAt.getTime() - 24 * 3600 * 1000;
      expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
    });

    it("ne remonte jamais avant la fenêtre défaut même si le dernier run est très ancien", async () => {
      const ranAt = new Date(Date.now() - 90 * 24 * 3600 * 1000);
      sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().resolves({ ranAt }) });
      const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 5 });
      const attendu = Date.now() - 5 * 24 * 3600 * 1000;
      expect(Math.abs(since.getTime() - attendu)).to.be.lessThan(5000);
    });

    it("fenêtre défaut si la lecture Mongo lève", async () => {
      sinon.stub(BackfillWatermark, "findById").returns({ lean: sinon.stub().rejects(new Error("db")) });
      const since = await resolveSinceDate({ cle: "k", fenetreDefautJours: 3 });
      expect(since).to.be.instanceOf(Date);
    });

    it("marquerRun fait un upsert et n'échoue pas si Mongo lève", async () => {
      const upd = sinon.stub(BackfillWatermark, "updateOne").rejects(new Error("db"));
      await marquerRun("k");
      expect(upd.calledOnceWith({ _id: "k" }, { $set: { ranAt: sinon.match.date } }, { upsert: true })).to.be.true;
    });
  });
  ```

- [ ] **Étape 3.4 — Câbler dans `server.js`.**
  En tête : `const { resolveSinceDate, marquerRun } = require("./src/services/backfillWatermarkService");`
  Bloc « Backfill prix/livraison récents » — remplacer le calcul de `sinceDate` et ajouter `marquerRun` :
  ```js
  setTimeout(async () => {
    try {
      const sinceDate = await resolveSinceDate({
        cle: "startupDecoData",
        fenetreDefautJours: PRIX_BACKFILL_LOOKBACK_DAYS,
      });
      await backfillRecentDecoData({ sinceDate });
      await marquerRun("startupDecoData");
      logger.info(`Backfill prix/livraison récents (depuis ${sinceDate.toISOString().slice(0, 10)}) terminé.`);
    } catch (error) {
      logger.warn(`Backfill prix/livraison récents échoué : ${error.message}`);
    }
  }, PRIX_BACKFILL_INITIAL_DELAY_MS);
  ```
  Bloc « Sync stubs Deco depuis Gamesys » — idem avec `cle: "startupStubSync"`, `fenetreDefautJours: DECO_STUB_SYNC_LOOKBACK_DAYS`, `marquerRun("startupStubSync")` après succès.
  Ne PAS toucher `syncConsommationsHistorique` (récurrent 24 h, fenêtre glissante volontaire).

- [ ] **Étape 3.5 — Tests + vérif démarrage.** Suite unitaire → PASS. Puis `NODE_ENV=development npm run server`, vérifier dans les logs : 1er démarrage = fenêtre pleine ; 2e démarrage < 2 min après = `depuis <hier>` et backfill quasi instantané.

- [ ] **Étape 3.6 — Commit.**
  ```bash
  git add server/src/models/BackfillWatermark.js server/src/services/backfillWatermarkService.js test/unit/backfillWatermarkService.test.js server/server.js
  git commit -m "perf(startup): watermark de dernier passage sur les backfills one-shot"
  ```

---

## Task 4 : `backfillDecoLivraisonDates` consomme la synthèse

**Files :**
- Modify : `server/src/services/decoLivraisonDatesBackfillService.js`
- Test : `test/unit/decoLivraisonDatesBackfillService.test.js`

**Interfaces :**
- Consumes : `Map<number, { dateLivraisonSouhaitee:Date|null, magasin:string|null, ville:string|null, client:string|null }>` (from `chargerSyntheseCommandes`).
- Produces : `backfillDecoLivraisonDates({ concurrency?, dryRun?, sinceDate?, synthese? })` — `synthese` optionnel ; comportement identique à aujourd'hui si absent.

- [ ] **Étape 4.1 — Test « utilise la synthèse sans appeler Gamesys ».**
  ```js
  it("applique dateLivraisonSouhaitee/mag depuis la synthèse sans appeler fetchDossierLivraisonDates", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 10, client: "LM" }]) });
    const synthese = new Map([[10, { dateLivraisonSouhaitee: new Date("2026-09-23"), magasin: "M", ville: "V", client: "LM" }]]);
    updateManyStub.resolves({ modifiedCount: 1 });
    const resume = await backfillDecoLivraisonDates({ sinceDate: new Date(), synthese });
    expect(fetchDossierLivraisonDatesStub.called).to.be.false;
    expect(resume.misAJour).to.equal(1);
    // mag = ville pour LM
    expect(updateManyStub.firstCall.args[1].$set).to.include({ mag: "V" });
  });

  it("retombe sur fetchDossierLivraisonDates quand le numCmd est absent de la synthèse", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 99, client: "LM" }]) });
    const synthese = new Map();
    fetchDossierLivraisonDatesStub.resolves({ dateLivraisonSouhaitee: new Date("2026-09-01"), ville: "W" });
    updateManyStub.resolves({ modifiedCount: 1 });
    await backfillDecoLivraisonDates({ sinceDate: new Date(), synthese });
    expect(fetchDossierLivraisonDatesStub.calledOnce).to.be.true;
  });
  ```
  (Adapter les noms de stubs à ceux déjà en place dans le fichier ; ajouter `updateManyStub` si absent.)

- [ ] **Étape 4.2 — Implémentation.**
  Signature : `async function backfillDecoLivraisonDates({ concurrency = 5, dryRun = false, sinceDate = null, synthese = null } = {})`.
  Extraire la logique « calculer `{ dateLivraisonSouhaitee, mag }` pour un numCmd » et, dans le `limit(async () => { ... })`, brancher d'abord la synthèse :
  ```js
  let dateLivraisonSouhaitee = null;
  let mag = null;
  const s = synthese && synthese.get(numCmd);
  if (s) {
    dateLivraisonSouhaitee = s.dateLivraisonSouhaitee || null;
    mag = client === "ECOM" ? s.magasin || s.ville : s.ville || s.magasin;
  } else {
    const r = await dossierService.fetchDossierLivraisonDates(connection, numCmd);
    dateLivraisonSouhaitee = r.dateLivraisonSouhaitee || null;
    mag = client === "ECOM" ? r.magasin || r.ville : r.ville || r.magasin || r.villeRef || r.magasinRef;
  }
  ```
  Le reste (`if (!dateLivraisonSouhaitee && !mag) { introuvables++ ; return; }`, construction `$set` + `updateMany`) inchangé.
  La connexion ODBC reste ouverte en tête (repli) — acceptable. *Refinement possible (non bloquant) : ne l'ouvrir que si au moins un numCmd manque dans la synthèse.*

- [ ] **Étape 4.3 — Tests fichier → PASS.**

- [ ] **Étape 4.4 — Commit.**
  ```bash
  git add server/src/services/decoLivraisonDatesBackfillService.js test/unit/decoLivraisonDatesBackfillService.test.js
  git commit -m "perf(backfill): decoLivraisonDates lit la synthèse commandes avant Gamesys"
  ```

---

## Task 5 : `backfillDecoPrix` consomme la synthèse

**Files :**
- Modify : `server/src/services/decoPrixBackfillService.js`
- Test : `test/unit/decoPrixBackfillService.test.js`

**Interfaces :**
- Consumes : `Map<number, { prixTotal:number|null }>`.
- Produces : `backfillDecoPrix({ concurrency?, dryRun?, sinceDate?, synthese? })`.

- [ ] **Étape 5.1 — Test.**
  ```js
  it("applique prixTotal depuis la synthèse sans appeler fetchDossierPrixTotal", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 10 }]) });
    const synthese = new Map([[10, { prixTotal: 488.73 }]]);
    updateManyStub.resolves({ modifiedCount: 2 });
    const resume = await backfillDecoPrix({ sinceDate: new Date(), synthese });
    expect(fetchDossierPrixTotalStub.called).to.be.false;
    expect(resume.misAJour).to.equal(2);
  });

  it("retombe sur fetchDossierPrixTotal si numCmd absent de la synthèse", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 99 }]) });
    fetchDossierPrixTotalStub.resolves(12.5);
    updateManyStub.resolves({ modifiedCount: 1 });
    await backfillDecoPrix({ sinceDate: new Date(), synthese: new Map() });
    expect(fetchDossierPrixTotalStub.calledOnce).to.be.true;
  });

  it("compte introuvable quand la synthèse a le numCmd mais prixTotal null", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 10 }]) });
    const resume = await backfillDecoPrix({ sinceDate: new Date(), synthese: new Map([[10, { prixTotal: null }]]) });
    expect(resume.introuvables).to.equal(1);
    expect(fetchDossierPrixTotalStub.called).to.be.false;
  });
  ```

- [ ] **Étape 5.2 — Implémentation.**
  Signature : `... synthese = null } = {}`. Dans le `limit(async () => { ... })` :
  ```js
  let prixTotal;
  if (synthese && synthese.has(numCmd)) {
    prixTotal = synthese.get(numCmd).prixTotal;
  } else {
    prixTotal = await dossierService.fetchDossierPrixTotal(connection, numCmd);
  }
  if (prixTotal == null) { resume.introuvables += 1; return; }
  ```
  Reste inchangé.

- [ ] **Étape 5.3 — Tests → PASS.**

- [ ] **Étape 5.4 — Commit.**
  ```bash
  git add server/src/services/decoPrixBackfillService.js test/unit/decoPrixBackfillService.test.js
  git commit -m "perf(backfill): decoPrix lit la synthèse commandes avant Gamesys"
  ```

---

## Task 6 : `backfillDecoCommandeInfo` consomme la synthèse

**Files :**
- Modify : `server/src/services/decoCommandeInfoBackfillService.js`
- Test : `test/unit/decoCommandeInfoBackfillService.test.js`

**Interfaces :**
- Consumes : `Map<number, { dateCommande:Date|null, codeClientGamesys, refClient, nombreProfil, nombreKitPose, formatPlaqueGamesys:string|null }>`.
- Produces : `backfillDecoCommandeInfo({ concurrency?, dryRun?, sinceDate?, synthese? })`.

- [ ] **Étape 6.1 — Test.**
  ```js
  it("applique dateCommande/refClient/profils/formatPlaque depuis la synthèse sans appel Gamesys", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 10 }]) });
    const synthese = new Map([[10, {
      dateCommande: new Date("2026-09-01"), codeClientGamesys: "LM004", refClient: "R",
      nombreProfil: 1, nombreKitPose: 2, formatPlaqueGamesys: "1260 x 2600",
    }]]);
    updateManyStub.resolves({ modifiedCount: 1 });
    const resume = await backfillDecoCommandeInfo({ sinceDate: new Date(), synthese });
    expect(fetchDossierCommandeInfoStub.called).to.be.false;
    expect(fetchDossierFormatPlaqueStub.called).to.be.false;
    const $set = updateManyStub.firstCall.args[1].$set;
    expect($set).to.include({ refClient: "R", nombreProfil: 1, formatPlaqueGamesys: "1260 x 2600" });
    expect($set.dateCommande).to.be.instanceOf(Date);
    expect(resume.misAJour).to.equal(1);
  });

  it("retombe sur les fetchDossier* si numCmd absent de la synthèse", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 99 }]) });
    fetchDossierCommandeInfoStub.resolves({ dateCommande: new Date(), codeClient: "LM", refClient: "R", nombreProfil: 0, nombreKitPose: 0 });
    fetchDossierFormatPlaqueStub.resolves("1000 x 2000");
    updateManyStub.resolves({ modifiedCount: 1 });
    await backfillDecoCommandeInfo({ sinceDate: new Date(), synthese: new Map() });
    expect(fetchDossierCommandeInfoStub.calledOnce).to.be.true;
  });

  it("compte introuvable si la synthèse a le numCmd mais dateCommande null (donnée commande absente)", async () => {
    findStub.returns({ lean: sinon.stub().resolves([{ numCmd: 10 }]) });
    const resume = await backfillDecoCommandeInfo({ sinceDate: new Date(), synthese: new Map([[10, { dateCommande: null }]]) });
    expect(resume.introuvables).to.equal(1);
  });
  ```

- [ ] **Étape 6.2 — Implémentation.**
  Signature : `... synthese = null } = {}`. Dans le `limit` :
  ```js
  let commandeInfo;
  let formatPlaqueGamesys;
  const s = synthese && synthese.get(numCmd);
  if (s) {
    if (s.dateCommande == null) { resume.introuvables += 1; return; }
    commandeInfo = {
      dateCommande: s.dateCommande,
      codeClient: s.codeClientGamesys ?? null,
      refClient: s.refClient ?? null,
      nombreProfil: s.nombreProfil ?? 0,
      nombreKitPose: s.nombreKitPose ?? 0,
      prixTotal: s.prixTotal ?? null,
    };
    formatPlaqueGamesys = s.formatPlaqueGamesys ?? null;
  } else {
    commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, numCmd);
    if (commandeInfo == null) { resume.introuvables += 1; return; }
    formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, numCmd);
  }
  const { modifiedCount } = await Deco.updateMany(
    { numCmd, dateCommande: { $exists: false } },
    { $set: { ...commandeInfo, formatPlaqueGamesys } },
  );
  ```
  ⚠️ Vérifier la forme exacte de l'objet écrit aujourd'hui (`fetchDossierCommandeInfo` renvoie `{ dateCommande, codeClient, refClient, nombreProfil, nombreKitPose, prixTotal }`) — le `$set` doit garder les mêmes clés (`codeClient`, pas `codeClientGamesys`).

- [ ] **Étape 6.3 — Tests → PASS.**

- [ ] **Étape 6.4 — Commit.**
  ```bash
  git add server/src/services/decoCommandeInfoBackfillService.js test/unit/decoCommandeInfoBackfillService.test.js
  git commit -m "perf(backfill): decoCommandeInfo lit la synthèse commandes avant Gamesys"
  ```

---

## Task 7 : `backfillRecentDecoData` charge la synthèse une fois et la propage

**Files :**
- Modify : `server/src/services/startupPrixBackfillService.js`
- Test : `test/unit/startupPrixBackfillService.test.js`

**Interfaces :**
- Consumes : `chargerSyntheseCommandes({ sinceDate, resoudreClientsViaCatalogue: true })` (Task 1), `backfillDeco{LivraisonDates,Prix,CommandeInfo}({ ..., synthese })` (Tasks 4-6).
- Produces : `backfillRecentDecoData({ sinceDate, concurrency?, dryRun? })` — signature inchangée ; retour enrichi d'une clé `synthese` (`{ commandes: <taille Map> }` ou `null` si échec).

- [ ] **Étape 7.1 — Test.**
  ```js
  it("charge la synthèse une fois et la passe aux étapes decoLivraisonDates/decoPrix/decoCommandeInfo", async () => {
    const fakeMap = new Map([[1, { prixTotal: 10 }]]);
    const chargerStub = sinon.stub(syntheseCommandesService, "chargerSyntheseCommandes").resolves(fakeMap);
    await backfillRecentDecoData({ sinceDate: new Date() });
    expect(chargerStub.calledOnce).to.be.true;
    expect(backfillDecoLivraisonDatesStub.firstCall.args[0].synthese).to.equal(fakeMap);
    expect(backfillDecoPrixStub.firstCall.args[0].synthese).to.equal(fakeMap);
    expect(backfillDecoCommandeInfoStub.firstCall.args[0].synthese).to.equal(fakeMap);
  });

  it("continue sans synthèse (synthese: null passé) si chargerSyntheseCommandes échoue", async () => {
    sinon.stub(syntheseCommandesService, "chargerSyntheseCommandes").rejects(new Error("ODBC"));
    const resultats = await backfillRecentDecoData({ sinceDate: new Date() });
    expect(backfillDecoPrixStub.firstCall.args[0].synthese).to.equal(null);
    expect(resultats.synthese).to.equal(null);
  });
  ```
  Ajouter `const syntheseCommandesService = require("../../server/src/services/syntheseCommandesService");` et les stubs `chargerSyntheseCommandes` dans le `beforeEach`. Les tests existants (« propage sinceDate/concurrency/dryRun », « concurrency=3 par défaut », etc.) doivent être mis à jour pour tolérer la clé `synthese` supplémentaire dans les args — utiliser `sinon.match` plutôt que `calledWith` strict si besoin.

- [ ] **Étape 7.2 — Implémentation.**
  ```js
  const syntheseCommandesService = require("./syntheseCommandesService");

  async function backfillRecentDecoData({ sinceDate, concurrency = 3, dryRun = false } = {}) {
    const synthese = await runStep("chargerSyntheseCommandes", () =>
      syntheseCommandesService.chargerSyntheseCommandes({ sinceDate, resoudreClientsViaCatalogue: true }),
    ); // renvoie null si échec (runStep catch)

    const consommationPrix = await runStep("backfillConsommationPrix", () =>
      consommationPrixBackfillService.backfillConsommationPrix({ sinceDate, concurrency, dryRun }),
    );
    const pkOnlyPrixTotal = await runStep("backfillPkOnlyPrixTotal", () =>
      pkOnlyPrixBackfillService.backfillPkOnlyPrixTotal({ sinceDate, dryRun }),
    );
    const decoLivraisonDates = await runStep("backfillDecoLivraisonDates", () =>
      decoLivraisonDatesBackfillService.backfillDecoLivraisonDates({ sinceDate, concurrency, dryRun, synthese }),
    );
    const decoPrix = await runStep("backfillDecoPrix", () =>
      decoPrixBackfillService.backfillDecoPrix({ sinceDate, concurrency, dryRun, synthese }),
    );
    const decoPrixVisuel = await runStep("backfillDecoPrixVisuel", () =>
      decoPrixVisuelBackfillService.backfillDecoPrixVisuel({ sinceDate, dryRun }),
    );
    const decoCommandeInfo = await runStep("backfillDecoCommandeInfo", () =>
      decoCommandeInfoBackfillService.backfillDecoCommandeInfo({ sinceDate, concurrency, dryRun, synthese }),
    );

    return {
      synthese: synthese ? { commandes: synthese.size } : null,
      consommationPrix, pkOnlyPrixTotal, decoLivraisonDates, decoPrix, decoPrixVisuel, decoCommandeInfo,
    };
  }
  ```
  Note : `runStep` logue déjà `JSON.stringify(resume)` — pour la synthèse ça logue une `Map` (`{}`). Acceptable, ou envelopper : `() => chargerSyntheseCommandes(...).then((m) => { logger.info(...); return m; })`. Garder simple : laisser `runStep`, la ligne de log de `chargerSyntheseCommandes` elle-même (Task POC) donne déjà la taille.

- [ ] **Étape 7.3 — Tests → PASS (fichier + suite complète).**

- [ ] **Étape 7.4 — Commit.**
  ```bash
  git add server/src/services/startupPrixBackfillService.js test/unit/startupPrixBackfillService.test.js
  git commit -m "perf(startup): backfillRecentDecoData charge la synthèse une fois et la propage"
  ```

---

## Task 8 : `syncDecoStubsDepuisGamesys` consomme la synthèse

**Files :**
- Modify : `server/src/services/decoGamesysStubSyncService.js`
- Modify : `server/server.js` (bloc stub sync — charger la synthèse et la passer)
- Test : `test/unit/decoGamesysStubSyncService.test.js`

**Interfaces :**
- Consumes : `Map<number, synthèse>` (avec `dateCommande, codeClientGamesys, refClient, nombreProfil, nombreKitPose, prixTotal, dateLivraisonSouhaitee, magasin, ville, formatPlaqueGamesys, dibond via formatsPlaque/formatPlaqueGamesys)`.
- Produces : `syncDecoStubsDepuisGamesys({ sinceDate, concurrency?, dryRun?, synthese? })`.

- [ ] **Étape 8.1 — Test.**
  ```js
  it("utilise la synthèse pour commandeInfo/formatPlaque/livraison sans les fetchDossier* correspondants", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    findStub.returns({ lean: sinon.stub().resolves([]) }); // rien en base (Task 2)
    sinon.stub(dossierService, "fetchSousDossiersVisuels").resolves([]);
    const synthese = new Map([[167648, {
      dateCommande: new Date("2026-08-20"), codeClientGamesys: "LM019", refClient: "R",
      nombreProfil: 6, nombreKitPose: 5, prixTotal: 1250.5,
      dateLivraisonSouhaitee: new Date("2026-09-23"), magasin: "M", ville: "V",
      formatPlaqueGamesys: "1510 x 2600",
    }]]);
    const resume = await syncDecoStubsDepuisGamesys({ sinceDate, synthese });
    expect(fetchCommandeInfoStub.called).to.be.false;
    expect(fetchFormatPlaqueStub.called).to.be.false;
    expect(fetchLivraisonDatesStub.called).to.be.false;
    expect(resume.crees).to.equal(1);
    const [, update] = findOneAndUpdateStub.firstCall.args;
    expect(update.$setOnInsert).to.include({ refClient: "R", nombreProfil: 6, prixTotal: 1250.5 });
  });

  it("retombe sur les fetchDossier* si le numCmd est absent de la synthèse", async () => {
    listCandidatsStub.resolves([{ cmd: "167648", client: "LM" }]);
    findStub.returns({ lean: sinon.stub().resolves([]) });
    sinon.stub(dossierService, "fetchSousDossiersVisuels").resolves([]);
    await syncDecoStubsDepuisGamesys({ sinceDate, synthese: new Map() });
    expect(fetchCommandeInfoStub.calledOnce).to.be.true;
  });
  ```
  (`fetchSousDossiersVisuels` reste toujours un appel Gamesys réel — non couvert par la synthèse, grain ligne.)

- [ ] **Étape 8.2 — Implémentation.**
  Signature : `async function syncDecoStubsDepuisGamesys({ sinceDate, concurrency = 3, dryRun = false, synthese = null } = {})`.
  Dans le `limit(async () => { ... })`, remplacer le bloc initial (`fetchDossierCommandeInfo` + `fetchDossierFormatPlaque` + `fetchDossierLivraisonDates`) par :
  ```js
  const s = synthese && synthese.get(candidat.numCmd);
  let commandeInfo, formatPlaqueGamesys, dateLivraisonSouhaitee, magasin, ville, magasinRef, villeRef;
  if (s) {
    commandeInfo = {
      dateCommande: s.dateCommande ?? undefined,
      codeClient: s.codeClientGamesys ?? undefined,
      refClient: s.refClient ?? undefined,
      nombreProfil: s.nombreProfil ?? 0,
      nombreKitPose: s.nombreKitPose ?? 0,
      prixTotal: s.prixTotal ?? null,
    };
    formatPlaqueGamesys = s.formatPlaqueGamesys ?? null;
    dateLivraisonSouhaitee = s.dateLivraisonSouhaitee ?? null;
    magasin = s.magasin ?? null;
    ville = s.ville ?? null;
    magasinRef = null;
    villeRef = null;
  } else {
    commandeInfo = await dossierService.fetchDossierCommandeInfo(connection, candidat.cmd);
    formatPlaqueGamesys = await dossierService.fetchDossierFormatPlaque(connection, candidat.cmd);
    ({ dateLivraisonSouhaitee, magasin, ville, magasinRef, villeRef } =
      await dossierService.fetchDossierLivraisonDates(connection, candidat.cmd));
  }
  const prixTotal = commandeInfo?.prixTotal ?? null;
  const mag =
    candidat.client === "ECOM" ? magasin || ville : ville || magasin || villeRef || magasinRef;
  ```
  ⚠️ La forme Gamesys renvoie `nombreProfil`/`nombreKitPose` via `fetchDossierCommandeInfo` — vérifier que la synthèse fournit bien les mêmes types (nombres). Garder `pkOnly = (commandeInfo?.nombreProfil ?? 0) > 0 || (commandeInfo?.nombreKitPose ?? 0) > 0` inchangé.
  Le reste (`commandeCommune`, `fetchSousDossiersVisuels`, boucle sous-dossiers) inchangé.

- [ ] **Étape 8.3 — Câbler `server.js`.** Bloc stub sync :
  ```js
  setTimeout(async () => {
    try {
      const sinceDate = await resolveSinceDate({ cle: "startupStubSync", fenetreDefautJours: DECO_STUB_SYNC_LOOKBACK_DAYS });
      const synthese = await syntheseCommandesService
        .chargerSyntheseCommandes({ sinceDate, resoudreClientsViaCatalogue: true })
        .catch((e) => { logger.warn(`Sync stubs: synthèse indisponible : ${e.message}`); return null; });
      const resume = await syncDecoStubsDepuisGamesys({ sinceDate, synthese });
      await marquerRun("startupStubSync");
      logger.info(`Sync stubs Deco depuis Gamesys (depuis ${sinceDate.toISOString().slice(0, 10)}) : ${JSON.stringify(resume)}`);
    } catch (error) {
      logger.warn(`Sync stubs Deco échouée : ${error.message}`);
    }
  }, DECO_STUB_SYNC_INITIAL_DELAY_MS);
  ```
  Ajouter en tête de `server.js` : `const syntheseCommandesService = require("./src/services/syntheseCommandesService");`

- [ ] **Étape 8.4 — Tests → PASS (fichier + suite complète).**

- [ ] **Étape 8.5 — Vérif base réelle.** `NODE_ENV=development node server/scripts/probeSyntheseCommandes.js --days=7` toujours vert. Optionnel : petit script ad hoc comparant, pour 5 numCmd, le `$setOnInsert` calculé avec vs sans `synthese` (doit être identique champ à champ hors ordre).

- [ ] **Étape 8.6 — Commit.**
  ```bash
  git add server/src/services/decoGamesysStubSyncService.js server/server.js test/unit/decoGamesysStubSyncService.test.js
  git commit -m "perf(startup): syncDecoStubsDepuisGamesys lit la synthèse (3 allers-retours ODBC/candidat en moins)"
  ```

---

## Auto-revue

**Couverture spec :**
- Point 1 (parité ECOM) → Task 1 (`resoudreClientsViaCatalogue`).
- Point 3 (câblage synthèse) → Tasks 4-8 (phases 3/4/6 + stub sync ; phases `consommationPrix`/`pkOnly`/`decoPrixVisuel` explicitement laissées inchangées, hors périmètre synthèse).
- Point 4a (batch `.exists()`) → Task 2. Point 4b (watermark) → Task 3.
- Clause `< 900` conservée → Contraintes globales + repli `fetchDossier*` partout.

**Placeholders :** aucun `TODO`/`TBD` ; code fourni pour chaque étape.

**Cohérence des types :** `synthese` = `Map<number, objet>` partout ; clés de l'objet (`prixTotal`, `dateLivraisonSouhaitee`, `magasin`, `ville`, `dateCommande`, `codeClientGamesys`, `refClient`, `nombreProfil`, `nombreKitPose`, `formatPlaqueGamesys`, `formatsPlaque`, `surMesure`) définies en Task 1, consommées Tasks 4-8. Attention `codeClientGamesys` (synthèse) vs `codeClient` (forme `fetchDossierCommandeInfo` / `$set` Deco) — conversion explicite dans Tasks 6 et 8.

**Risques :**
- Jointure `fd_dossier` (Task 1.1) : fan-out possible → étape 1.6 prévoit le repli (garder `fetchDossierFormatPlaque`).
- Tests existants stubbant `Deco.exists` (Task 2) : demande de réécrire les stubs en `find().lean()` — lister tous les `it` concernés avant de modifier.
- `startupPrixBackfillService.test.js` : assertions `calledWith` strictes → passer en `sinon.match` pour tolérer la clé `synthese`.

---

## Ordre d'exécution & dépendances

1 → 2 → 3 (indépendants entre eux, mais 1 avant 4-8). Puis 4, 5, 6 (indépendants). Puis 7 (dépend de 1,4,5,6). Puis 8 (dépend de 1,2,3).

Chaque task = 1 commit, testable seule. Après Task 3 et après Task 7 : vérif `npm run server` en dev (démarrage réel).
