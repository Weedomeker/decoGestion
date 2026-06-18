# Design — Parallélisation du traitement des jobs

**Date :** 2026-06-18  
**Périmètre :** `server/src/controllers/jobsController.js`, `server/src/utils/pdfWorker.js`, `server/src/pdfToimg.js`  
**Objectif :** Réduire le temps d'exécution de `runJobs` pour des files de 20+ jobs, sans ajouter de dépendances (p-limit et piscina sont déjà installés).

---

## Contexte

Le traitement de la file (`POST /run_jobs`) exécute chaque job séquentiellement dans un `for...of`. Pour chaque job, les opérations lourdes sont :

1. `modifyPdf` ou `amalgameCredences` — manipulation PDF (pdf-lib, CPU + IO réseau/disque)
2. `usePdfWorker` — conversion PDF→JPG via un `new Worker()` spawné à chaque appel
3. `saveDeco` — écriture MongoDB

Avec 20+ jobs et ~5s par job, le temps total dépasse 100s. Le pic de ressources est faible car tout est séquentiel, mais la durée perçue est longue.

---

## Approche retenue : A + B

### A — Parallélisation des jobs avec `p-limit`

**Fichier :** `server/src/controllers/jobsController.js`

Remplacer le `for...of` dans `runJobs` par `Promise.all(jobsToRun.map(...))` + `p-limit`.

```js
const pLimit = require('p-limit');
const JOBS_CONCURRENCY = parseInt(process.env.JOBS_CONCURRENCY) || 3;
const limit = pLimit(JOBS_CONCURRENCY);

await Promise.all(
  jobsToRun.map((job) => limit(() => processJob(job, req)))
);
```

La logique interne de chaque job est extraite dans une fonction `processJob(job, req)` — aucune modification de la logique métier, uniquement le découpage.

**Points d'adaptation :**

- `state.process.pdfTime` et `state.process.jpgTime` sont des valeurs partagées sur le singleton. Avec la parallélisation, plusieurs jobs les écriraient simultanément. Solution : les remplacer par des variables locales dans `processJob` et les passer directement à `saveDeco` comme `temps`.
- `broadcastCompletedJob(job)` est appelé par chaque `processJob` dès que son job est terminé — aucun changement, le WebSocket gère déjà plusieurs messages consécutifs.
- Le `broadcastWS({ type: "end" })`, le filtre `state.jobs.jobs = ...` et `generateStickersForJobs` restent après le `Promise.all` — ils s'exécutent une seule fois, quand tous les jobs sont terminés.
- `JOBS_CONCURRENCY` est configurable via `.env` pour permettre d'ajuster selon la machine sans modifier le code.

**Gain attendu :** 20 jobs × 5s → ~35s avec concurrence 3 (gain ×2,8).

---

### B — Pool de workers `piscina` pour la conversion PDF→JPG

**Fichiers :** `server/src/utils/pdfWorker.js`, `server/src/pdfToimg.js`

#### `pdfToimg.js` — adapter pour Piscina

Piscina requiert que le fichier worker exporte une fonction (et non lire `workerData` + `parentPort.postMessage`).

```js
// Avant
const { parentPort, workerData } = require('worker_threads');
pdfToimg(workerData.pdf, workerData.jpg);

// Après
module.exports = async ({ pdf, jpg }) => {
  await pdfToimg(pdf, jpg);
};
```

La fonction interne `pdfToimg(readFile, writeFile)` ne change pas. On supprime `parentPort.postMessage` et `workerData` — le résultat est la résolution de la Promise retournée par la fonction exportée.

#### `pdfWorker.js` — remplacer Worker par Piscina

```js
const Piscina = require('piscina');
const os = require('os');
const path = require('path');
const { state } = require('../services/appState');

const pool = new Piscina({
  filename: path.join(state.paths.serverRoot, './src/pdfToimg.js'),
  minThreads: 1,
  maxThreads: Math.max(2, os.cpus().length - 1),
});

function usePdfWorker(data) {
  return pool.run(data);
}

module.exports = usePdfWorker;
```

Le pool est instancié **une seule fois** au chargement du module (singleton de module Node). Les threads sont réutilisés entre les appels.

**Points d'adaptation :**

- `state.paths.serverRoot` doit être disponible au moment de l'import du module. Ce chemin est initialisé dans `appState.js` avant tout require des routes — c'est déjà le cas aujourd'hui.
- `minThreads: 1` garantit qu'un thread reste chaud même hors traitement. `maxThreads` s'adapte au nombre de cœurs de la machine (serveur Windows en production).
- Les erreurs remontent toujours comme des rejets de Promise — l'appelant (`runJobs`) les attrape déjà dans son `try/catch`.

**Gain attendu :** élimination de l'overhead de spawn (~50–200ms par job), meilleure réutilisation mémoire des threads.

---

## Flux après les deux changements

```
POST /run_jobs
  │
  ├─ broadcastWS({ type: "start" })
  │
  ├─ Promise.all avec p-limit(3)
  │    ├─ processJob(job1) → modifyPdf → pool.run(jpg) → saveDeco → broadcastCompletedJob
  │    ├─ processJob(job2) → modifyPdf → pool.run(jpg) → saveDeco → broadcastCompletedJob
  │    ├─ processJob(job3) → modifyPdf → pool.run(jpg) → saveDeco → broadcastCompletedJob
  │    ├─ (job4 démarre quand job1 se libère…)
  │    └─ ...
  │
  ├─ broadcastWS({ type: "end" })
  ├─ state.jobs.jobs = filtrés
  ├─ generateStickersForJobs(completed)
  └─ res.status(200)
```

---

## Hors périmètre

- Génération des stickers découplée de la réponse HTTP (approche C) — non retenue pour cette itération.
- Virtualisation de la liste côté frontend — non retenue (problème backend).
- Refactoring du frontend JobsList — non retenu.

---

## Tests à vérifier après implémentation

- `test/integration/credences.test.js` — doit continuer à passer sans modification.
- Vérifier manuellement avec 3+ jobs que `broadcastCompletedJob` arrive bien pour chaque job.
- Vérifier que les fichiers PDF/JPG sont correctement nommés même en parallèle (pas de collision de noms — chaque job a un `fileName` unique basé sur `cmd + visuel`).
- Vérifier que `generateStickersForJobs` reçoit bien tous les jobs complétés (tableau `state.jobs.completed` cohérent après `Promise.all`).
