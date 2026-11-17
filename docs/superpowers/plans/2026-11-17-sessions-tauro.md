# Sessions Tauro dans decoGestion — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** lancer la file decoGestion « en session » (PDF renommés `NNN_Sjjmm<L>_…_<ex>.pdf`, racks de 50 ex.) ou « hors session » (nom d'origine). Un aperçu et une confirmation précèdent tout lancement. Chaque envoi est inscrit dans un journal Mongo.

**Architecture :**
- Les modules purs du dossier « session Tauro Asanti » sont copiés dans `server/src/tauro/` et complétés par trois éléments : le mode hors session, des clés multiples, et un adaptateur de jobs decoGestion.
- Un service de plan calcule le plan à partir de la sélection et du journal, ainsi qu'une empreinte.
- `POST /tauro/plan` sert l'aperçu. `run_jobs` recalcule le plan, le compare à l'empreinte, puis enfile des copies des jobs portant leur nom Tauro.
- `processJob` utilise ce nom uniquement pour le dépôt du PDF et le préfixe du JPG.

**Tech Stack :** Node.js CommonJS, Express, Mongoose, BullMQ, React (semantic-ui-react), mocha + `node:assert/strict`.

**Spec :** `docs/superpowers/specs/2026-11-17-sessions-tauro-design.md`

Source des modules : `C:\Users\Kongsberg\Desktop\session Tauro Asanti\` (`regles-tauro.js`, `lancement-tauro.js`, `test/lancement.test.js`, `docs/superpowers/plans/2026-11-16-lancement-hors-session.md`).

## Global Constraints

- **Session** : Mat = exactement 50 ex. ; Brillant = 20 ex. minimum, au plus près de 50, 60 au maximum. Un lancement ne porte qu'une seule finition, et l'ordre de la sélection est conservé.
- **Nom Tauro** : il s'applique **uniquement** au PDF déposé et au préfixe du JPG. `fileName` (texte imprimé, étiquettes, vernis, `.cut`) ne change jamais.
- **Préfixe JPG en session** : `<code session>-<n° sur 3 chiffres> `, par exemple `S1711A-011 169034 - LM AMIENS - …jpg`. Le titre imprimé sur la page JPG reste `fileName`.
- **Hors session** : PDF sous `pdfBaseName`. Il ne consomme ni lettre ni n°, mais il est inscrit au journal.
- **Teinte masse et stock** (`teinteMasse`, `useStock`) : ils ne comptent pas dans les 50, n'ont pas de n°, et partent dans le même lancement.
- **Lancement Tauro** : jamais d'écrasement (`COPYFILE_EXCL`) et jamais de nouvelle tentative sur « déjà présent » (`UnrecoverableError`). Sans `tauro` dans la requête, le comportement actuel ne change pas.
- **Date de session** : heure locale, `new Date().toLocaleDateString("sv-SE")`.
- **Clés** :
  - `cmd/sousDossier` ;
  - sur-mesure : `cmd/sousDossier-p<smPage>` ;
  - commande 0 ou sans sous-dossier : `id:<_id>` ;
  - crédence à 2 commandes : 2 clés et commande du nom `cmd+cmd2` ;
  - job fusionné : une clé par sous-dossier.
- **Fichiers copiés** : chacun porte en tête `// Copie de « session Tauro Asanti/<fichier> » — garder les deux versions alignées.`
- **Base de données** : en dev, uniquement la base MongoDB **Test**. Ne pas lancer `npm run format` ; formater seulement les fichiers neufs (`npx prettier --write <fichier>`).
- **Commits** sur `dev`, en messages courts en français (style `feat(tauro): …`).

## Review Focus

1. **Le RIP consomme le 1er dépôt, puis BullMQ refait une tentative du même job.** Attendu : aucun 2e dépôt. Couvert par le test « déjà au journal → succès sans copie » (Task 5).
2. **La file change entre l'aperçu et la confirmation** (job ajouté, `ex` modifié, fusion). Attendu : 409, puis l'aperçu se rafraîchit. Couvert par le test « empreinte différente » (Task 6).
3. **Deux pages sur-mesure du même sous-dossier, ou deux sous-dossiers d'une commande avec le même visuel.** Attendu : ils ne sont pas pris pour des doublons. Couvert par les tests de l'adaptateur (Task 2).
4. **Crédence à 2 commandes dont la 2e est déjà lancée.** Attendu : la crédence est bloquée. Couvert par le test `clesJournal` (Task 1).
5. **Job en échec dans une session.** Attendu : il reste dans la file, sans `nomTauro`, sans entrée au journal. La session suivante continue la numérotation après le plus grand n° inscrit. Couvert par le test « copie » (Task 6).

---

### Task 1 : modules Tauro copiés, mode hors session, clés multiples

**Files :**
- Create : `server/src/tauro/regles-tauro.js` (copie, plus la modification ci-dessous)
- Create : `server/src/tauro/lancement-tauro.js` (copie, plus les modifications ci-dessous)
- Test : `test/unit/tauro/lancement.test.js` (conversion mocha des tests purs)

**Interfaces :**
- Produces :
  - `regles.job(l, code)`, tel qu'aujourd'hui, avec une différence : si `l.cle` est une chaîne non vide, `job().cle = l.cle`.
  - `lancement.preparerLancement(lignes, o)`, avec `o.mode: "session" | "hors-session"` (défaut `"session"` ; toute autre valeur lève `Mode de lancement invalide : <x>`).
    - Le retour contient en plus `mode` et `horsSession: Job[]`.
    - En hors session : `sessions: []`, `restants: []`, `ignores: []`, aucun filtre de finition. `lettreSuivante` et `suivant` valent `suiteDuJour`.
    - Chaque job hors session vaut `{ ...regles.job(l, ""), job: nomOrigine(l), session: null, ordre: null, horsSession: true, ligne: l }`.
  - `lancement.nomOrigine(l) -> string` : `l.nomOrigine`, sinon le nom de `l.pdf` sans dossier ni `.pdf`, sinon `""`.
  - `l.clesJournal?: string[]` : toutes les clés que couvre une ligne. Par défaut `[j.cle]`. Elles servent au contrôle « déjà lancé » (bloqué si **une** clé est au journal), au contrôle de doublon (une clé partagée par deux lignes bloque les deux) et à l'alerte « commande en partie lancée » (commande = préfixe `^(\d+)/` de chaque clé ; aucune alerte pour une clé `id:`).

- [ ] **Step 1 : copier les deux modules** dans `server/src/tauro/`, avec l'en-tête « Copie de … ». Remplacer `require("./regles-tauro")` si besoin (même dossier).

- [ ] **Step 2 : convertir les tests purs.** Copier `test/lancement.test.js` vers `test/unit/tauro/lancement.test.js`.
  - Retirer les tests qui dépendent du CSV, de `instantane` ou de la CLI : « export réel du 10/11 » (l.91) et tous ceux de « bout en bout » (l.347 et suivantes).
  - `const test = require("node:test")` devient `describe("tauro/lancement", () => { … })`, et `test(` devient `it(`. `node:assert/strict` reste.
  - Les `require` pointent vers `../../../server/src/tauro/…`.

- [ ] **Step 3 : écrire les tests nouveaux**, avec les helpers `dg`, `lignesDG`, `journalDe` et `tousJobs` du fichier :

```js
it("hors session : nom d'origine, Mat et Brillant ensemble, ni lettre ni n°", () => {
  const p = L.preparerLancement(lignesDG([
    dg({ ex: 2, visuPath: "C:\\v\\169304 - LM - 151x260 - ONYX 150x210 MAT 2_EX.pdf" }),
    dg({ ex: 1, visuel: "GRAVURE NATURE 100x210 DROIT 94960000 BRILLANT.pdf", visuPath: "C:\\v\\GRAVURE NATURE.pdf" }),
  ]), { date: "2026-11-17", mode: "hors-session" });
  assert.equal(p.mode, "hors-session");
  assert.deepEqual(p.sessions, []);
  assert.deepEqual(p.horsSession.map((j) => j.job), ["169304 - LM - 151x260 - ONYX 150x210 MAT 2_EX", "GRAVURE NATURE"]);
  assert.deepEqual(p.horsSession.map((j) => j.fin), ["MAT", "BRI"]);
  assert.equal(p.lettreSuivante, "A"); assert.equal(p.suivant, 1);
});
it("hors session au journal : la session suivante garde A et le dossier y est bloqué « identique »", () => {
  const urgent = dg({ ex: 2, visuPath: "C:\\v\\URGENT.pdf" });
  const hs = L.preparerLancement(lignesDG([urgent]), { date: "2026-11-17", mode: "hors-session" });
  const b = L.preparerLancement(lignesDG([urgent, ...Array.from({ length: 50 }, () => dg())]),
    { date: "2026-11-17", journal: journalDe(hs.horsSession) });
  assert.equal(b.sessions[0].code, "S1711A");
  assert.equal(b.sessions[0].depart, 1);
  assert.match(b.bloques[0].raison, /déjà lancé .*\(URGENT\) — identique/);
});
it("réimpression : relancer + hors session ; les autres lignes déjà lancées restent bloquées", () => { /* plan 2026-11-16, Task 1 */ });
it("mode invalide : erreur", () => assert.throws(() => L.preparerLancement([], { date: "2026-11-17", mode: "x" }), /Mode de lancement invalide/));
it("clesJournal : une ligne est bloquée si une de ses clés est déjà lancée ; une clé partagée par 2 lignes les bloque", () => {
  const l1 = { ...L.depuisDecoGestion(dg({ cmd: 169034, sousDossier: "01" })), clesJournal: ["169034/01", "169380/02"] };
  const deja = L.preparerLancement([L.depuisDecoGestion(dg({ cmd: 169380, sousDossier: "02", ex: 50 }))], { date: "2026-11-17" });
  const p = L.preparerLancement([l1], { date: "2026-11-17", journal: journalDe(tousJobs(deja)) });
  assert.match(p.bloques[0].raison, /déjà lancé/);
  const l2 = { ...L.depuisDecoGestion(dg({ cmd: 169380, sousDossier: "02" })) };
  assert.equal(L.preparerLancement([l1, l2], { date: "2026-11-17" }).bloques.length, 2);
});
it("clé explicite l.cle : reprise telle quelle, aucune alerte pour id:", () => {
  assert.equal(regles.job({ cmd: "0", cle: "id:42", dibond: "151x260", ex: 1 }, "").cle, "id:42");
});
```

- [ ] **Step 4 : lancer** `npx mocha test/unit/tauro/lancement.test.js`. Attendu : les tests convertis passent, les nouveaux échouent (`p.mode` indéfini, etc.).

- [ ] **Step 5 : implémenter** `mode`, `nomOrigine`, `l.cle` dans `regles.job` (`cle: l.cle || cleLigne(l, nom)`) et `clesJournal` dans `preparerLancement`, sans changer le comportement en mode session.
  - `ligneJournal` reste mono-clé. L'inscription d'une ligne multi-clés est faite par le journal decoGestion (Task 3).
  - Mettre à jour le commentaire d'en-tête.

- [ ] **Step 6 : lancer** `npx mocha test/unit/tauro/lancement.test.js`. Attendu : tout passe.

- [ ] **Step 7 : commit** `feat(tauro): regles et lancement Tauro (copie du dossier session), mode hors session, cles multiples`.

> Note pour l'utilisateur, en fin de chantier : reporter `l.cle`, `clesJournal`, `mode` et `nomOrigine` dans le dossier « session Tauro Asanti », pour garder les deux copies alignées.

---

### Task 2 : noms decoGestion et adaptateur job → ligne

**Files :**
- Create : `server/src/utils/nomsJob.js`
- Modify : `server/src/controllers/jobsController.js:683-725` (utiliser `nomsJob`)
- Create : `server/src/tauro/depuisJob.js`
- Modify : `server/src/controllers/jobsController.js:593-630` (fusion : conserver les sous-dossiers)
- Test : `test/unit/nomsJob.test.js`, `test/unit/tauro/depuisJob.test.js`

**Interfaces :**
- Produces : `nomsJob(job) -> { fileName, fileName2, pdfBaseName }`, extraction **à l'identique** de `processJob` l.683-693 et 723-725. `pdfBaseName` vaut `""` pour une teinte masse ou un job stock.
- Produces : `ligneDepuisJob(job) -> ligne` (dans `server/src/tauro/depuisJob.js`) :
  - c'est `lancement.depuisDecoGestion(job)`, complété de :
    - `nomOrigine` = `pdfBaseName` sans `.pdf` ;
    - `sansPdf` = `!!job.teinteMasse || !!job.useStock` ;
    - `cle` et `clesJournal`, selon les règles ci-dessous ;
  - **crédence** (`/^\d{3}x\d{2}$/i` sur `format_visu`) :
    - `visuel2` différent de `visuel` : `deco` = `"<décor1> ET <décor2>"` (décors par `decorDepuisFichier`) ;
    - si `cmd2` est non nul et différent de `cmd` : `cmd = "<cmd>+<cmd2>"`, et `clesJournal` contient aussi `<cmd2>/<sousDossier2>` ;
  - **sur-mesure** (`smBase`) :
    - `deco` = `decorDepuisFichier(partie de smBase après le dernier " - ")` ;
    - `fmtVis` = `smFormat` ;
    - `finition` = `finitionDe(smBase)` ;
    - clé `<cmd>/<sousDossier>-p<smPage>` ;
  - **cmd 0, ou sous-dossier vide** : `cle = "id:<_id>"` ;
  - **job fusionné** (`job.sousDossiers?.length > 1`) : `clesJournal` = une clé `<cmd>/<sd>` par sous-dossier ;
  - `clesJournal[0] === cle` dans tous les cas.
- Produces : dans `addJob`, à la fusion, `jobExist.sousDossiers = [...new Set([...(jobExist.sousDossiers || [jobExist.sousDossier]), newJob.sousDossier].filter(Boolean))]`.

- [ ] **Step 1 : tests `nomsJob`**. Pour un job standard, une crédence 2 visuels (`cmd2 = 0` et `cmd2 = 169380`), un sur-mesure (`smBase`) et une teinte masse : `fileName` et `pdfBaseName` sont égaux aux chaînes que produit le code actuel. Recopier les expressions de l.683-725 dans les valeurs attendues, avec par exemple `"169034 - LM AMIENS - 151x260 - BETON CLAIR 150x255 MAT 4_EX"`.

- [ ] **Step 2 : tests `depuisJob`**, avec les noms d'exemple de CLAUDE.md :
  - crédence `"CRED 300x60cm MOSAIQUE 3664711694254 MAT.pdf"` + `"VELTIS BRILLANT 255x60 VELTIS-25560.pdf"`, `cmd2 = 169380` : `regles.job(l, "S1711A").job` contient `_169034+169380_` et `ET` ; `clesJournal` = `["169034/01", "169380/02"]` ;
  - sur-mesure, 2 pages du même sous-dossier : clés différentes (`…-p1`, `…-p2`), et un plan sans aucun bloqué ;
  - `cmd: 0` donne `cle` = `"id:<_id>"` ;
  - teinte masse et stock donnent `sansPdf: true` ;
  - job fusionné `sousDossiers: ["01", "02"]` donne 2 clés.

- [ ] **Step 3 : lancer** `npx mocha test/unit/nomsJob.test.js test/unit/tauro/depuisJob.test.js`. Attendu : FAIL (modules absents).

- [ ] **Step 4 : implémenter** `nomsJob.js` et `depuisJob.js`. Remplacer dans `processJob` les calculs l.683-693 et l.723-725 par `const { fileName, fileName2, pdfBaseName } = nomsJob(job)`. Ajouter `sousDossiers` à la fusion dans `addJob`.

- [ ] **Step 5 : lancer** `npm run test:unit`. Attendu : tout passe, y compris `jobsController.addJob.reject` et `jobsList.createJob`.

- [ ] **Step 6 : commit** `feat(tauro): noms decoGestion extraits (nomsJob) et adaptateur job -> ligne Tauro`.

---

### Task 3 : journal des lancements (Mongo)

**Files :**
- Create : `server/src/models/LancementTauro.js`
- Create : `server/src/tauro/journalTauro.js`
- Test : `test/unit/tauro/journalTauro.test.js`

**Interfaces :**
- Produces : le modèle Mongoose `LancementTauro`.
  - Champs : `date: Date`, `jour: String` (AAAA-MM-JJ, local), `job: String`, `hf: String`, `source: String`, `octets: Number`, `cle: String`, `cmd: String`, `ex: Number`, `signature: String`, `mode: "session" | "hors-session"`, `nomSansSession: String`, `jobId: String`.
  - Index sur `jour`, `cle`, `cmd`, `nomSansSession`.
- Produces : `entreesPourLancement(lignes, jour) -> Promise<Entree[]>`. Ce sont les entrées dont `cle` appartient à `clesJournal`, dont `cmd` appartient aux commandes de la sélection, ou dont `jour === jour`. Le format est celui de `lancement.lireJournal` : `{ date (ISO), job, hf, source, octets, cle, ex, signature, cmd }`.
- Produces : `inscrire(jobTauro, { source, octets, mode }) -> Promise<void>`. Une entrée par clé de `jobTauro.clesTauro`, avec le même `job`, `ex` et `signature` (`lancement.signature(jobRegles)`, transporté par `jobTauro.signatureTauro`).
- Produces : `dejaInscrit(jobTauro) -> Promise<boolean>`. Vrai si une entrée a `cle === clesTauro[0]` et `job === nomTauro || nomOrigine`, et que son `jobId` est celui du job.

- [ ] **Step 1 : tests.** Remplacer le modèle par un faux (même technique que `queueControlService.test.js` : `Module._load`, stubs `find`, `insertMany`, `exists`), puis vérifier :
  - `inscrire` d'un job à 2 clés donne 2 documents (même `job`, `cmd` 169034 et 169380, `jour` local) ;
  - `entreesPourLancement` construit la requête `$or` attendue et renvoie le format `lireJournal` ;
  - le résultat, passé à `preparerLancement`, bloque « déjà lancé ».

- [ ] **Step 2 : lancer** `npx mocha test/unit/tauro/journalTauro.test.js`. Attendu : FAIL.

- [ ] **Step 3 : implémenter.** `nomSansSession` vaut `regles.nomSansSession(job)`. `jour` vaut `date.toLocaleDateString("sv-SE")`.

- [ ] **Step 4 : lancer** le test. Attendu : PASS.

- [ ] **Step 5 : commit** `feat(tauro): journal des lancements Tauro (collection LancementTauro)`.

---

### Task 4 : service de plan et route d'aperçu

**Files :**
- Create : `server/src/tauro/planTauro.js`
- Create : `server/src/routes/tauroRoutes.js`, plus son enregistrement dans `server/src/routes/index.js`
- Test : `test/unit/tauro/planTauro.test.js`

**Interfaces :**
- Consumes : `ligneDepuisJob` (Task 2), `preparerLancement` (Task 1), `entreesPourLancement` (Task 3).
- Produces : `construirePlan(jobs, journal, { mode, finition, relancer, date }) -> PlanTauro`. Fonction pure.
  - `jobs` est la sélection, dans l'ordre de la file. Les lignes `sansPdf` sont écartées avant `preparerLancement`.
  - `PlanTauro` vaut :
    ```
    { mode, finition, date,
      sessions: [{ code, fin, ex, depart, dernier, jobs: [{ id, nom, cmd, ex, format, blanc, hf }] }],
      horsSession: [{ id, nom, cmd, ex, fin, hf }],
      restants, ignores, bloques: [{ id, cle, cmd, ex, decor, raison }],
      alertes: string[], sansPdf: [{ id, cmd, ex, visuel }],
      aLancer: JobTauro[], empreinte: string }
    ```
  - `JobTauro` = `{ ...job (copie superficielle), nomTauro?, sessionTauro?, ordreTauro?, horsSession?, clesTauro, signatureTauro, hfTauro }`, dans l'ordre suivant : jobs de session triés par `ordreTauro`, puis hors session dans l'ordre de la file, puis `sansPdf` dans l'ordre de la file.
  - `empreinte` = sha1 hex de `JSON.stringify([mode, finition, [...relancer].sort(), aLancer.map((j) => [j._id, j.nomTauro || "", j.ex])])`.
  - **Alerte de finition** : si `job.refDbData?.finition` existe et que sa finition (`/brillant/i` → BRI, sinon MAT) diffère de celle du nom, ajouter l'alerte `"<cmd> : finition du nom (<x>) ≠ référence (<y>)"`.
- Produces : `async calculerPlan(jobs, opts) -> PlanTauro`. `date` vaut le jour local, le journal est lu par `entreesPourLancement`.
- Produces : `serialiser(plan) -> object`. C'est `PlanTauro` sans `aLancer` (réponse HTTP).
- Produces : la route `POST /tauro/plan` `{ ids?, mode, finition, relancer? }` renvoie `200 serialiser(plan)`, ou `400` si la sélection est vide ou le mode invalide.

- [ ] **Step 1 : tests de `construirePlan`**, avec des jobs `dg` et un journal vide :
  - 53 ex. de Mat (50 × 1 ex. + 1 × 3) : une session `S1711A` de 50 ex. et 3 ex. dans `restants` ;
  - un job teinte masse et un job stock dans la sélection : ils sont dans `sansPdf` et `aLancer`, sans `nomTauro`, et ne comptent pas dans `ex` ;
  - `aLancer` est trié par `ordreTauro`, puis `sansPdf` ;
  - les copies ne modifient pas les jobs d'origine (`assert.equal(jobs[0].nomTauro, undefined)`) ;
  - même entrée, même empreinte ; `ex` modifié, empreinte différente ;
  - en hors session, `horsSession[0].nom === nomsJob(job).pdfBaseName.replace(/\.pdf$/, "")` ;
  - alerte de finition : `refDbData.finition = "Brillant"` sur un visuel MAT.

- [ ] **Step 2 : lancer**. Attendu : FAIL.

- [ ] **Step 3 : implémenter.** Les champs `nomTauro`, `sessionTauro`, `ordreTauro`, `hfTauro`, `clesTauro` et `signatureTauro` viennent des jobs des règles (`s.jobs[k]` correspond à `s.lignes[k].source`, `lancement.signature`).

- [ ] **Step 4 : lancer** `npm run test:unit`. Attendu : PASS.

- [ ] **Step 5 : commit** `feat(tauro): plan de lancement et apercu POST /tauro/plan`.

---

### Task 5 : dépôt exclusif, journal et JPG triés dans `processJob`

**Files :**
- Modify : `server/src/utils/hotFolderDelivery.js`
- Modify : `server/src/composeJpgPage.js:33-42` et `applyJpgPage` (`jobsController.js:48`)
- Modify : `server/src/controllers/jobsController.js` (`processJob` : début, `jpgName`, `outJpgPath`, dépôt l.868, fin)
- Test : `test/unit/hotFolderDelivery.test.js`, `test/unit/composeJpgPage.test.js`, `test/unit/tauro/processJobTauro.test.js`

**Interfaces :**
- Produces : `deliverToHotFolder(stagedPdfPath, destPath, { exclusif = false } = {})`.
  - Avec `exclusif`, la copie se fait avec `fs.constants.COPYFILE_EXCL`.
  - `EEXIST` lève `new UnrecoverableError("Déjà présent dans <dossier> : <nom>")` (`require("bullmq").UnrecoverableError`).
- Produces : `composeJpgPage(jpgPath, jpgPage, titre = basename)` et `applyJpgPage(jpgPath, cmd, titre)`.
- Produces : `prefixeJpg(job) -> string` (dans `nomsJob.js`) : `"S1711A-011 "` si `job.sessionTauro`, sinon `""`.

Comportement de `processJob` quand `job.nomTauro || job.horsSession` :
1. **Au début** : si `await dejaInscrit(job)`, journaliser « déjà déposé (journal), rien n'est recopié » et sauter la production et le dépôt du PDF. Le reste (JPG, Deco, `completed`) suit le chemin normal.
2. **JPG** :
   - `jpgName` vaut `` `${dossierJour}/${prefixeJpg(job)}${fileName}` `` ;
   - crédence : `` `${dossierJour}/${prefixeJpg(job)}${castoName(fileName)} + ${castoName(fileName2)}.jpg` ``. `castoName` ne s'applique jamais au préfixe ;
   - `applyJpgPage(outJpgPath, job.cmd, <nom sans préfixe ni .jpg>)` ;
   - le job ajouté à `completed` reçoit un `jpgName` qui suit le nouveau chemin (même forme que `createJob` : `public/PRINTSA#…/x.jpg`).
3. **Dépôt** : `` deliverToHotFolder(stagedPdfPath, path.join(job.writePath, job.nomTauro ? `${job.nomTauro}.pdf` : pdfBaseName), { exclusif: true }) ``.
   - Une `UnrecoverableError` est relancée telle quelle, sans `deliverableError` générique, pour que BullMQ ne refasse pas de tentative.
   - Si `job.hfTauro` diffère de `path.basename(job.writePath)` : `log.warn`.
4. **Après un dépôt réussi** : `inscrire(job, { source: job.visuPath, octets, mode })`. En cas d'erreur : `log.error` et `broadcastWS({ type: "jobWarning", … })`, sans faire échouer le job.

- [ ] **Step 1 : tests.**
  - `hotFolderDelivery` : en mode `exclusif`, un fichier déjà présent rejette avec une `UnrecoverableError` et le fichier existant est intact ; sans option, l'écrasement continue comme aujourd'hui.
  - `composeJpgPage` : avec un `titre` fourni, le titre imprimé est ce titre et non le nom du fichier. Réutiliser le mécanisme d'observation du test existant.
  - `prefixeJpg` : `{ sessionTauro: "S1711A", ordreTauro: 11 }` donne `"S1711A-011 "` ; `{}` donne `""`.
  - `processJobTauro` (stubs de `dejaInscrit`, `inscrire`, `deliverToHotFolder`, selon le style `Module._load` de `modifyPdfErrors.test.js`) :
    - `dejaInscrit` vrai : `deliverToHotFolder` n'est pas appelé ;
    - session : `deliverToHotFolder` est appelé avec `…/Deco_Std_151x260/011_S1711A_…_4.pdf` et `{ exclusif: true }`, puis `inscrire` est appelé ;
    - `inscrire` rejette : le job finit quand même dans `completed`.

- [ ] **Step 2 : lancer** ces fichiers. Attendu : FAIL.

- [ ] **Step 3 : implémenter.**

- [ ] **Step 4 : lancer** `npm run test:unit`. Attendu : PASS. Les jobs sans `nomTauro` ni `horsSession` gardent exactement le comportement actuel.

- [ ] **Step 5 : commit** `feat(tauro): depot exclusif sous le nom Tauro, journal, JPG prefixes dans l'ordre d'impression`.

---

### Task 6 : `run_jobs` en mode Tauro et étiquettes triées

**Files :**
- Modify : `server/src/controllers/jobsController.js` (`runJobs` l.1169-1235, `reorderJobs` l.1258, `generateStickersForJobs` l.1370)
- Modify : `server/src/services/queueControlService.js` (verrou)
- Test : `test/unit/tauro/runJobsTauro.test.js`, `test/unit/queueControlService.test.js`

**Interfaces :**
- Consumes : `calculerPlan` (Task 4).
- Produces : le corps de `POST /run_jobs` accepte `tauro: { mode, finition, relancer, empreinte }`.
- Produces : `queueControl.reserver() -> boolean` et `queueControl.liberer()`.
  - `reserver()` passe `run.running` à vrai de façon **synchrone**, ou renvoie faux si un traitement est en cours.
  - `enqueueRun(jobs, extra, { dejaReserve: true })` accepte une réservation existante.
- Produces : `trierPourEtiquettes(jobs) -> Job[]`. Tri stable : `ordreTauro` croissant d'abord, puis les jobs sans `ordreTauro`, dans leur ordre d'entrée.

Comportement de `runJobs` avec `tauro` :
1. `if (!queueControl.reserver()) return 409`, **avant tout `await`**. Tous les chemins de sortie libèrent la réservation (`finally`).
2. `const plan = await calculerPlan(selectJobs(…), tauro)`. Si `plan.empreinte !== tauro.empreinte` : **409** `{ code: "PLAN_CHANGE", error: "La file a changé depuis l'aperçu : rafraîchir l'aperçu." }`.
3. `plan.aLancer` vide : 400 « Aucun job à lancer ».
4. Contrôle disque (`controlerEspaceDisque(plan.aLancer, …)`), puis `enqueueRun(plan.aLancer, …, { dejaReserve: true })`.
5. Retrait de la file par `_id` (inchangé). `generateStickersForJobs(trierPourEtiquettes(state.jobs.completed))`.
6. `reorderJobs` n'appelle pas `applyPriorities` pendant un lancement Tauro : drapeau `run.tauro` posé par `reserver({ tauro: true })`.
7. Le log de bilan ajoute les sessions : `Sessions S1711A (001–033), S1711B (034–068)`, ou `hors session : N PDF`.

Sans `tauro` : le chemin actuel ne change pas (il utilise lui aussi `reserver`/`liberer` à la place de `isRunning`).

- [ ] **Step 1 : tests.**
  - `queueControlService` : `reserver()` puis `reserver()` donne vrai puis faux ; `liberer()` permet de réserver à nouveau ; `enqueueRun` avec `dejaReserve` ne lève pas d'erreur.
  - `runJobsTauro` (stubs de `calculerPlan` et `enqueueRun`, faux `res`) :
    - empreinte différente : 409 `PLAN_CHANGE`, et `enqueueRun` n'est pas appelé ;
    - deux appels simultanés : le 2e reçoit 409 ;
    - un job en échec (absent de `completed`) reste dans `state.jobs.jobs` **sans** `nomTauro` ;
    - `trierPourEtiquettes` sur `[{ordreTauro: 3}, {}, {ordreTauro: 1}]` donne `[1, 3, {}]`.

- [ ] **Step 2 : lancer**. Attendu : FAIL.

- [ ] **Step 3 : implémenter.**

- [ ] **Step 4 : lancer** `npm run test:unit`. Attendu : PASS.

- [ ] **Step 5 : commit** `feat(tauro): run_jobs en session / hors session (plan verifie, verrou, etiquettes dans l'ordre)`.

---

### Task 7 : interface — deux boutons et aperçu

**Files :**
- Create : `client/src/components/ApercuSessionTauro.jsx`
- Modify : `client/src/components/JobsList.jsx` (bouton l.632-641, `runJobsList` l.287-299, `Confirm` l.823-834)

**Interfaces :**
- Consumes : `POST /tauro/plan` (Task 4), `POST /run_jobs` avec `tauro` (Task 6).
- Produces : `<ApercuSessionTauro open mode ids onClose onLance />`.
  - `mode` vaut `"session"` ou `"hors-session"`. `ids` est la sélection ; `undefined` désigne toute la file.

Comportement :
- **Deux boutons** à la place de « Traiter la file / la sélection » :
  - « Lancer en session » (primaire) et « Lancer hors session », avec la mention `(N)` quand une sélection existe ;
  - le `Confirm` actuel du lancement est retiré : l'aperçu le remplace ;
  - « Générer stickers seulement » est conservé.
- **Fenêtre d'aperçu** (`Modal` semantic-ui) :
  - chargement par `/tauro/plan`, avec une bascule Mat / Brillant (session seulement ; rechargement à chaque changement) ;
  - tableau des sessions : code, finition, ex., jobs, n° début → fin ;
  - en hors session : liste des PDF (nom, ex., finition) ;
  - sections « Restent dans la file » (n° de dossier et raison), « Brillant ignoré » ou « Mat ignoré » (ex.), « Sans PDF » (teinte masse et stock : « partent avec, hors comptage ») ;
  - « Bloqués » : raison, plus une case « Relancer » qui ajoute la clé à `relancer` et recharge le plan ;
  - « Infos » (alertes).
  - Le bouton « Lancer N session(s) » (ou « Lancer N PDF hors session ») est désactivé quand `aLancer` serait vide, c'est-à-dire quand il n'y a ni session, ni hors session, ni sans PDF.
- **Confirmation** : `POST /run_jobs { run: true, formatTauro, ids, tauro: { mode, finition, relancer, empreinte } }`.
  - Sur 409 `PLAN_CHANGE` : rechargement de l'aperçu, avec le message « La file a changé, aperçu mis à jour ».
  - Sur un autre 409 : message « Un traitement est déjà en cours ».

- [ ] **Step 1 : implémenter le composant et le branchement** dans le style de `JobsList.jsx` (mêmes imports semantic-ui, `API_BASE`). Formater uniquement le fichier neuf : `npx prettier --write client/src/components/ApercuSessionTauro.jsx`.
- [ ] **Step 2 : construire** avec `npm run build`. Attendu : build sans erreur.
- [ ] **Step 3 : vérifier en dev**, selon le scénario de la Vérification ci-dessous (navigateur).
- [ ] **Step 4 : commit** `feat(tauro): boutons Lancer en session / hors session et apercu des sessions`.

---

### Task 8 : documentation

**Files :**
- Modify : `CLAUDE.md` (« Règles de sortie »)
- Modify : `docs/cahier-des-charges/cahier-des-charges.html`, puis régénération du PDF (commande de CLAUDE.md)

- [ ] **Step 1 : CLAUDE.md.** Ajouter à « Règles de sortie » un point **Sessions Tauro**, sur le modèle suivant :
  - modules `server/src/tauro/` copiés du dossier session Tauro, à garder alignés ;
  - le nom Tauro ne s'applique qu'au dépôt du PDF et au préfixe du JPG ;
  - journal `LancementTauro` ;
  - dépôt exclusif sans nouvelle tentative ;
  - aperçu, puis empreinte (409).
- [ ] **Step 2 : cahier des charges.** Ajouter une section en termes simples (effet pour l'utilisateur d'abord, exemples de noms de fichiers), plus le détail technique en sections 9 et 10. Régénérer le PDF.
- [ ] **Step 3 : commit** `docs: sessions Tauro (CLAUDE.md, cahier des charges)`.

---

## Vérification de bout en bout (dev, base Test)

1. `npm test` (en confirmant l'environnement dev) : tout passe.
2. `npm run server` (dev : `saveFolder = server/public/tmp`) et `npm run client`.
3. Ajouter plus de 50 ex. de Mat, dont une crédence, un sur-mesure et une teinte masse. Cliquer sur « Lancer en session » : l'aperçu affiche `S<jjmm>A` à 50 ex., les restants, et la teinte masse dans « Sans PDF ».
4. Confirmer, puis contrôler :
   - `server/public/tmp/Deco_Std_*` et `Prod avec BLANC` contiennent des PDF `NNN_S…_<ex>.pdf` ;
   - `server/public/PRINTSA#<date>/` contient des JPG `S…-NNN …jpg`, dont le titre imprimé est inchangé ;
   - les étiquettes sont dans l'ordre des n° ;
   - les restants sont toujours dans la file ;
   - la base Test contient des documents `LancementTauro`.
5. Remettre un job déjà lancé dans la file : il est bloqué « déjà lancé — identique ». Cocher « Relancer », puis lancer hors session : le PDF garde son nom d'origine.
6. Nouveau lancement en session : la lettre passe à B et les n° continuent.
7. Modifier la file pendant que l'aperçu est ouvert, puis confirmer : 409, et l'aperçu est rechargé.
