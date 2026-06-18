# Parallélisation des jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réduire le temps d'exécution de `runJobs` en parallélisant le traitement des jobs avec `p-limit` et en remplaçant la création de Worker par job par un pool `piscina`.

**Architecture:** Trois fichiers modifiés chirurgicalement. `pdfToimg.js` exporte une fonction pour Piscina. `pdfWorker.js` instancie un pool Piscina en lazy init. `jobsController.js` extrait le corps du `for...of` dans `processJob(job, req)` et l'exécute en parallèle via `Promise.all` + `p-limit`.

**Tech Stack:** Node.js, `p-limit` v3.1.0 (déjà installé), `piscina` v5.2.0 (déjà installé), Mocha/Chai pour les tests.

## Global Constraints

- Ne pas modifier la logique métier de traitement PDF/JPG — uniquement la structure de concurrence.
- `JOBS_CONCURRENCY` doit être configurable via `process.env.JOBS_CONCURRENCY` (défaut : `3`).
- `pdfToimg.js` doit rester compatible avec son chemin actuel `server/src/pdfToimg.js`.
- Les tests existants dans `test/integration/credences.test.js` doivent continuer à passer sans modification.
- Utiliser `require('p-limit')` (CommonJS) — le projet est entièrement CommonJS côté serveur.

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `server/src/pdfToimg.js` | Modifier — exporter une fonction au lieu de lire `workerData` |
| `server/src/utils/pdfWorker.js` | Modifier — remplacer `new Worker` par pool Piscina |
| `server/src/controllers/jobsController.js` | Modifier — extraire `processJob`, remplacer `for...of` |
| `test/unit/pdfWorker.test.js` | Créer — tests unitaires pdfWorker et pdfToimg |

---

### Task 1 : Adapter `pdfToimg.js` pour Piscina

**Files:**
- Modify: `server/src/pdfToimg.js`
- Create: `test/unit/pdfToimg.test.js`

**Interfaces:**
- Produit: `module.exports = async ({ pdf, jpg }) => void` — fonction reçue par Piscina via `pool.run({ pdf, jpg })`
- Consomme: `pdftobuffer` de `pdftopic`, `fs`, `logger`

- [ ] **Step 1 : Écrire le test unitaire**

```js
// test/unit/pdfToimg.test.js
const assert = require('assert');

describe('pdfToimg worker', () => {
  it('exports a function (Piscina-compatible)', () => {
    const workerFn = require('../../server/src/pdfToimg');
    assert.strictEqual(typeof workerFn, 'function');
  });

  it('rejects with an error when the PDF does not exist', async () => {
    const workerFn = require('../../server/src/pdfToimg');
    await assert.rejects(
      () => workerFn({ pdf: '/nonexistent.pdf', jpg: '/tmp/out.jpg' }),
      /introuvable/i,
    );
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx mocha test/unit/pdfToimg.test.js --timeout 10000
```

Attendu : FAIL — `require('../../server/src/pdfToimg')` retourne `undefined` (le fichier ne fait qu'appeler `pdfToimg(workerData.pdf, workerData.jpg)` sans exporter).

- [ ] **Step 3 : Modifier `server/src/pdfToimg.js`**

Remplacer le contenu entier du fichier par :

```js
const { pdftobuffer } = require("pdftopic");
const fs = require("fs");
const logger = require("./logger/logger");

const pdfToimg = async (readFile, writeFile) => {
  if (!fs.existsSync(readFile)) {
    throw new Error(`PDF introuvable pour la conversion en image : ${readFile}`);
  }
  const pdf = fs.readFileSync(readFile);
  const buffer = await pdftobuffer(pdf, 0);
  fs.writeFileSync(writeFile, buffer);

  if (!fs.existsSync(writeFile) || fs.statSync(writeFile).size === 0) {
    throw new Error(`Échec de la génération de l'image JPG : ${writeFile}`);
  }
  logger.info("Image générée avec succès");
};

module.exports = async ({ pdf, jpg }) => {
  await pdfToimg(pdf, jpg);
};
```

Points clés du changement :
- Supprimé : `const { parentPort, workerData } = require('worker_threads')` — inutile avec Piscina.
- Supprimé : `parentPort.postMessage('ok'|'error')` — Piscina gère la réponse via la résolution/rejet de la Promise.
- Supprimé : `pdfToimg(workerData.pdf, workerData.jpg)` à la fin du fichier.
- Ajouté : `module.exports = async ({ pdf, jpg }) => { await pdfToimg(pdf, jpg); }`.
- Les erreurs lèvent maintenant une exception au lieu de poster `'error'` — Piscina les propage correctement comme rejet de Promise.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx mocha test/unit/pdfToimg.test.js --timeout 10000
```

Attendu : PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add server/src/pdfToimg.js test/unit/pdfToimg.test.js
git commit -m "refactor: adapter pdfToimg.js pour Piscina — export function"
```

---

### Task 2 : Pool Piscina dans `pdfWorker.js`

**Files:**
- Modify: `server/src/utils/pdfWorker.js`
- Create: `test/unit/pdfWorker.test.js`

**Interfaces:**
- Consomme: `piscina`, `os`, `path`, `state.paths.serverRoot` (disponible avant tout appel à `usePdfWorker`)
- Produit: `usePdfWorker({ pdf: string, jpg: string }): Promise<void>` — identique à l'interface actuelle

- [ ] **Step 1 : Écrire le test unitaire**

```js
// test/unit/pdfWorker.test.js
const assert = require('assert');

describe('usePdfWorker', () => {
  before(() => {
    // Initialiser appState minimal pour que state.paths.serverRoot soit défini
    const { state } = require('../../server/src/services/appState');
    if (!state.paths.serverRoot) {
      const path = require('path');
      state.paths.serverRoot = path.join(__dirname, '../../server');
    }
  });

  it('exports a function', () => {
    const usePdfWorker = require('../../server/src/utils/pdfWorker');
    assert.strictEqual(typeof usePdfWorker, 'function');
  });

  it('returns a Promise when called', () => {
    const usePdfWorker = require('../../server/src/utils/pdfWorker');
    const result = usePdfWorker({ pdf: '/nonexistent.pdf', jpg: '/tmp/out.jpg' });
    assert.ok(result instanceof Promise, 'should return a Promise');
    return result.catch(() => {}); // le PDF n'existe pas — on ignore l'erreur
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx mocha test/unit/pdfWorker.test.js --timeout 15000
```

Attendu : FAIL sur "returns a Promise" — l'implémentation actuelle crée un Worker qui écoute `worker.on('message', resolve)` mais Piscina n'est pas encore utilisé.

- [ ] **Step 3 : Modifier `server/src/utils/pdfWorker.js`**

Remplacer le contenu entier du fichier par :

```js
const Piscina = require("piscina");
const os = require("os");
const path = require("path");
const { state } = require("../services/appState");

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Piscina({
      filename: path.join(state.paths.serverRoot, "./src/pdfToimg.js"),
      minThreads: 1,
      maxThreads: Math.max(2, os.cpus().length - 1),
    });
  }
  return pool;
}

function usePdfWorker(data) {
  return getPool().run(data);
}

module.exports = usePdfWorker;
```

Points clés :
- Le pool est créé en **lazy init** (au premier appel) — `state.paths.serverRoot` est garanti initialisé à ce moment.
- `minThreads: 1` : un thread reste chaud entre les sessions.
- `maxThreads: Math.max(2, os.cpus().length - 1)` : laisse un cœur au process principal.
- L'interface `usePdfWorker(data)` reste identique — aucun changement côté appelant.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
npx mocha test/unit/pdfWorker.test.js --timeout 15000
```

Attendu : PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add server/src/utils/pdfWorker.js test/unit/pdfWorker.test.js
git commit -m "refactor: remplacer new Worker par pool Piscina dans pdfWorker"
```

---

### Task 3 : Paralléliser `runJobs` avec `p-limit`

**Files:**
- Modify: `server/src/controllers/jobsController.js`

**Interfaces:**
- Consomme: `p-limit` (déjà dans `package.json`), `processJob(job, req): Promise<void>` (créé dans cette tâche)
- Produit: `runJobs` inchangé côté HTTP — même signature de route, même comportement observable

- [ ] **Step 1 : Ajouter les imports et la constante de concurrence**

En haut de `server/src/controllers/jobsController.js`, après les imports existants (ligne ~26), ajouter :

```js
const pLimit = require("p-limit");
const JOBS_CONCURRENCY = parseInt(process.env.JOBS_CONCURRENCY) || 3;
```

- [ ] **Step 2 : Extraire `processJob` depuis le corps du `for...of`**

Juste avant la fonction `runJobs` (ligne ~435), insérer la nouvelle fonction `processJob`. Elle contient exactement le corps de l'actuel `for (const job of jobsToRun)`, avec deux adaptations :

**Remplacement des timings partagés :**
- Remplacer `state.process.pdfTime = endPdf - startPdf;` (deux occurrences, lignes 550 et 554) par `pdfTime = endPdf - startPdf;`
- Remplacer `state.process.jpgTime = endJpg - startJpg;` (ligne 610) par `jpgTime = endJpg - startJpg;`
- Remplacer `(state.process.jpgTime ?? 0) + (state.process.pdfTime ?? 0)` (ligne 709) par `(jpgTime ?? 0) + (pdfTime ?? 0)`

La fonction complète :

```js
async function processJob(job, req) {
  const regexCredences = /^\d{3}x\d{2}$/i;
  const isCredences = regexCredences.test(job.format_visu);
  const isStock = job?.useStock;

  let pdfTime = 0;
  let jpgTime = 0;

  logger.info(
    `▶ Job ${job.cmd} | client=${job.client} | ref=${job.ref} | visuel=${job.visuel} | format=${job.format_visu} | ${job.ex}ex`,
  );
  if (isCredences && job.visuPath2) {
    logger.info(`  + 2e panneau | ref2=${job.ref2} | visuel2=${job.visuel2} | visuPath2=${job.visuPath2}`);
  }

  if (job.refDbData && !job.teinteMasse) {
    if (!fs.existsSync(path.resolve(job.visuPath))) {
      logger.error(`❌ Job ${job.cmd} annulé : visuel introuvable sur le disque : ${job.visuPath}`);
      broadcastWS({ type: "jobError", job, reason: "Visuel introuvable sur le disque" });
      return;
    }
    if (String(job.ref) !== String(job.refDbData.ref)) {
      logger.error(
        `❌ Job ${job.cmd} annulé : incohérence ref (job.ref=${job.ref} ≠ pinned=${job.refDbData.ref})`,
      );
      broadcastWS({ type: "jobError", job, reason: "Incohérence de référence" });
      return;
    }
  }

  const fileName = `${job.cmd} - ${job.client} ${job.ville.toUpperCase()} - ${
    job.teinteMasse ? job.format_visu.split("_").pop() : job.format_Plaque.split("_").pop()
  } - ${job.visuel.replace(/\.[^/.]+$/, "")} ${job.ex}_EX`;

  const fileName2 = isCredences
    ? `${job.cmd2 === 0 ? "" : job.cmd2 + " - "}${job.client} ${job.ville.toUpperCase()} - ${
        job.teinteMasse ? job.format2_visu.split("_").pop() : job.format_Plaque.split("_").pop()
      } - ${job.visuel2.replace(/\.[^/.]+$/, "")} ${job.ex}_EX` || ""
    : "";

  const sortFolder = req.body.sortFolder;

  try {
    if (!fs.existsSync(job.writePath)) {
      fs.mkdirSync(job.writePath, { recursive: true });
    }
    if (!fs.existsSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`)) {
      fs.mkdirSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`, { recursive: true });
    }
    if (sortFolder) {
      const vernisFolder = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${
        checkVernis(fileName) === "_S" ? "Satin" : checkVernis(fileName)
      }`;
      if (!fs.existsSync(vernisFolder)) fs.mkdirSync(vernisFolder, { recursive: true });
    }
  } catch (err) {
    logger.error(`❌ Impossible de créer les dossiers pour le job ${job.cmd} : ${err.message}`);
    return;
  }

  const pdfName = `${job.writePath}/${fileName}`;
  const pdfName2 = `${job.writePath}/${fileName2}` || "";
  const jpgName = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${fileName}`;
  const jpgName2 = isCredences ? `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${fileName2}` || "" : "";

  if (!job.teinteMasse && !isStock) {
    try {
      const startPdf = performance.now();
      if (isCredences) {
        const visuals = [{ file: job.visuPath, name: fileName }];
        if (job.visuPath2) {
          visuals.push({ file: job.visuPath2, name: fileName2 });
        }
        await amalgameCredences(
          { visuals, plaque: job.format_Plaque },
          path.join(
            job.writePath,
            `${castoName(fileName)}${job.visuPath2 ? " + " + castoName(fileName2) : ""}.pdf`,
          ),
        );
        const endPdf = performance.now();
        pdfTime = endPdf - startPdf;
      } else {
        await modifyPdf(job.visuPath, job.writePath, fileName, job.format_Plaque, job.reg);
        const endPdf = performance.now();
        pdfTime = endPdf - startPdf;
      }
    } catch (error) {
      logger.error(`Erreur de modification du PDF pour le job ${job.cmd}: ${error}`);
    }

    if (!job.teinteMasse) {
      const outPdfPath = isCredences
        ? path.join(job.writePath, `${castoName(fileName)}${job.visuPath2 ? " + " + castoName(fileName2) : ""}.pdf`)
        : `${pdfName}.pdf`;
      try {
        if (!fs.existsSync(outPdfPath) || fs.statSync(outPdfPath).size === 0) {
          logger.error(`❌ PDF de sortie manquant ou vide pour le job ${job.cmd} : ${outPdfPath}`);
        } else {
          logger.info(`✅ PDF OK (${fs.statSync(outPdfPath).size} octets) : ${path.basename(outPdfPath)}`);
        }
      } catch (err) {
        logger.error(`❌ Impossible de vérifier le PDF pour le job ${job.cmd} : ${err.message}`);
      }
    }

    const outJpgPath =
      isCredences && job.visuPath2
        ? path.join(
            `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${castoName(jpgName.split("/").pop())} + ${castoName(jpgName2.split("/").pop())}.jpg`,
          )
        : `${jpgName}.jpg`;

    const jpgDejaPresent = fs.existsSync(outJpgPath) && fs.statSync(outJpgPath).size > 0;

    if (jpgDejaPresent) {
      logger.info(`✅ JPG déjà présent, génération ignorée : ${path.basename(outJpgPath)}`);
    } else {
      try {
        const startJpg = performance.now();
        if (job.ref) {
          if (isCredences && job.visuPath2) {
            await usePdfWorker({
              pdf: path.join(
                job.writePath,
                `${castoName(pdfName.split("/").pop())} + ${castoName(pdfName2.split("/").pop())}.pdf`,
              ),
              jpg: outJpgPath,
            });
          } else {
            await getPreview(job.ref, jpgName, isStock);
          }
        } else {
          const visuelNoExt = job.visuel?.replace(/\.[^.]+$/, "") || "";
          const previewFound = visuelNoExt ? await getPreview(visuelNoExt, jpgName, isStock) : false;
          if (!previewFound) {
            await usePdfWorker({ pdf: `${pdfName}.pdf`, jpg: outJpgPath });
          }
        }
        const endJpg = performance.now();
        jpgTime = endJpg - startJpg;
      } catch (error) {
        logger.error(`Error generating JPG for job ${job.cmd}:`, error);
      }
    }

    try {
      if (!fs.existsSync(outJpgPath) || fs.statSync(outJpgPath).size === 0) {
        logger.error(`❌ JPG de sortie manquant ou vide pour le job ${job.cmd} : ${outJpgPath}`);
      } else {
        logger.info(`✅ JPG OK (${fs.statSync(outJpgPath).size} octets) : ${path.basename(outJpgPath)}`);
      }
    } catch (err) {
      logger.error(`❌ Impossible de vérifier le JPG pour le job ${job.cmd} : ${err.message}`);
    }
  } else {
    try {
      await generateImages(job, state.paths.previewDeco, `${jpgName}.jpg`, isStock);
    } catch (error) {
      logger.error(`Error generating JPG for job ${job.cmd}:`, error);
    }
  }

  const matchName1 = isCredences ? job.visuel.match(/ \d{3}x\d{2}/i) : job.visuel.match(/ \d{2,3}x\d{2,3}/i);

  let matchRef1;
  if (isCredences) {
    matchRef1 = job.client === "CASTO" ? job.visuel.match(/\d{13}/) : job.ref ? { 0: String(job.ref) } : null;
  } else {
    matchRef1 = job.visuel.match(/[A-Z]+\d*-\d+/i) || job.ref;
  }

  const deco =
    matchName1 && job.visuel.includes(matchName1[0])
      ? job.client === "CASTO"
        ? job.visuel
            .split(matchName1[0])[1]
            ?.replace(/cm/gi, "")
            ?.replace(/\.pdf$/i, "")
            ?.replace(matchRef1 ? matchRef1[0] : "", "")
            ?.replace(" MAT", "")
            .trim()
        : job.visuel.split(matchName1[0])[0].trim()
      : job.visuel;

  const matchName2 = isCredences && job.visuel2 ? job.visuel2.match(/ \d{3}x\d{2}/i) : null;

  const matchRef2 = job.visuel2
    ? isCredences
      ? job.client === "CASTO"
        ? job.visuel2.match(/\d{13}/)
        : job.ref2
          ? { 0: String(job.ref2) }
          : null
      : job.visuel2.match(/[A-Z]+\d*-\d+/i)
    : null;

  const deco2 =
    matchName2 && job.visuel2.includes(matchName2[0])
      ? job.client === "CASTO"
        ? job.visuel2
            .split(matchName2[0])[1]
            ?.replace(/cm/gi, "")
            ?.replace(/\.pdf$/i, "")
            ?.replace(matchRef2 ? matchRef2[0] : "", "")
            ?.replace(" MAT", "")
            .trim()
        : job.visuel2.split(matchName2[0])[0].trim()
      : job.visuel2;

  const saveDeco = async ({ cmd, visuel, formatVisu, ref, temps }) => {
    const safeRef = ref && String(ref) !== "0" ? ref : null;
    const data = {
      date: job.date,
      client: job.client,
      numCmd: cmd || 0,
      mag: job.ville,
      dibond: job.format_Plaque,
      deco: visuel,
      ref: safeRef,
      format: formatVisu?.split("_").pop().replace("/", ""),
      ex: parseInt(job.ex),
      temps,
      perte: job.perte ? parseFloat(job.perte) : 0,
      status: safeRef ? "" : "ref_invalide",
      app_version: `v${state.appVersion}`,
      ip: req.ip.split(":").pop() === "1" || req.hostname === "localhost" ? os.hostname() : req.ip.split(":").pop(),
      comment: isStock ? `Pris en stock le ${new Date().toLocaleString()}` : "",
      prodBlanc: !!job.prodBlanc,
    };
    const newDeco = new modelDeco(data);
    await newDeco.save();
  };

  try {
    const totalTime = parseFloat((((jpgTime ?? 0) + (pdfTime ?? 0)) / 1000).toFixed(2)) || 0;
    await saveDeco({
      cmd: job.cmd || 0,
      visuel: deco,
      formatVisu: job.format_visu,
      ref: job.ref,
      temps: totalTime,
    });

    const isDuplicated = job.visuel === job.visuel2;
    if (isCredences && job.cmd2 && job.visuel2 && !isDuplicated) {
      await saveDeco({
        cmd: job.cmd2 || 0,
        visuel: deco2,
        formatVisu: job.format2_visu || job.format_visu,
        ref: job.ref2,
        temps: totalTime,
      });
    }
  } catch (error) {
    logger.error(`Erreur sauvegarde dossier pour le job ${job.cmd}: ${error.message}`);
  }

  if (isStock) {
    try {
      await Stocks.findOneAndUpdate({ ref: job.ref }, { $inc: { ex: -1 } }, { new: true });
      logger.info(
        `Stock mis à jour pour la référence: ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${job.ref} ${job.format_visu} (1ex déduit)`,
      );
    } catch (error) {
      logger.error(
        `Erreur lors de la mise à jour du stock pour la référence: ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${job.ref} ${job.format_visu}: `,
        error,
      );
    }
  }

  if (job.cut) {
    const pathCutFiles = `./server/public/${state.paths.sessionPRINTSA}/Cut/`;
    if (!fs.existsSync(pathCutFiles)) {
      fs.mkdirSync(pathCutFiles, { recursive: true });
    }
    const fTauro = job.format_Plaque.split("_").pop();
    const fVisu = job.format_visu.split("_").pop();
    const wPlate = parseFloat(fTauro.toLowerCase().split("x")[0]);
    const hPlate = parseFloat(fTauro.toLowerCase().split("x")[1]);
    const width = parseFloat(fVisu.toLowerCase().split("x")[0]);
    const height = parseFloat(fVisu.toLowerCase().split("x")[1]);

    if (job.client === "LM" || job.client === "ECOM") {
      try {
        createDec(wPlate, hPlate, width, height, pathCutFiles);
        generateCutFile(hPlate * 10, wPlate * 10, height * 10, width * 10, 6, pathCutFiles);
      } catch (error) {
        logger.error(`Erreur génération fichier de coupe pour le job ${job.cmd}: ${error.message}`);
      }
    }
  }

  state.jobs.completed.push(job);
  broadcastCompletedJob(job);
}
```

- [ ] **Step 3 : Remplacer le `for...of` dans `runJobs` par `Promise.all` + `p-limit`**

Dans la fonction `runJobs`, localiser le bloc :

```js
for (const job of jobsToRun) {
  // ... tout le corps (lignes ~460-776)
}
```

Le remplacer par :

```js
const limit = pLimit(JOBS_CONCURRENCY);
await Promise.all(jobsToRun.map((job) => limit(() => processJob(job, req))));
```

Supprimer également les deux lignes `state.process.pdfTime = ...` et `state.process.jpgTime = ...` si elles restent dans `runJobs` (elles doivent maintenant n'exister qu'en variables locales dans `processJob`).

- [ ] **Step 4 : Lancer les tests d'intégration existants**

```bash
npm test
```

Attendu : tous les tests passent, en particulier `test/integration/credences.test.js`.

- [ ] **Step 5 : Vérification manuelle rapide**

Démarrer le serveur en dev :

```bash
npm run server
```

Ajouter 2-3 jobs depuis l'interface, puis cliquer "Traiter la file". Vérifier dans les logs que plusieurs jobs apparaissent avec le préfixe `▶ Job` en quasi-simultané plutôt que strictement les uns après les autres.

- [ ] **Step 6 : Commit**

```bash
git add server/src/controllers/jobsController.js
git commit -m "perf: paralléliser runJobs avec p-limit (concurrence 3) + extraire processJob"
```
