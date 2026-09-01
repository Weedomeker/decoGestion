# BullMQ + Redis Integration — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer `pLimit + Promise.all` dans `runJobs` par BullMQ + Redis pour que les jobs de 40 min survivent aux redémarrages serveur et soient relancés automatiquement en cas d'échec.

**Architecture:** BullMQ Worker tourne dans le même process Express (concurrence=3). `runJobs` enqueue N jobs dans Redis puis attend leur fin via `waitUntilFinished`. Le comportement HTTP (réponse 200 après traitement complet) est conservé. `processJob` n'est pas modifié.

**Tech Stack:** BullMQ v5, ioredis v5, @bull-board/api, @bull-board/express, Docker (Redis 7-alpine), Node.js CommonJS.

## Global Constraints

- CommonJS partout (`require` / `module.exports`) — pas d'ESM
- Node.js ≥ 16 (requis par BullMQ v5)
- Concurrence fixée par `process.env.JOBS_CONCURRENCY` (défaut : 3)
- `processJob` ne doit PAS être modifié
- Les tests existants (`test/integration/credences.test.js`) doivent continuer à passer
- Mocha + Chai pour les tests
- Commits fréquents après chaque tâche

---

## Cartographie des fichiers

| Fichier | Action | Rôle |
|---|---|---|
| `server/src/services/queueService.js` | **Créer** | Queue BullMQ, QueueEvents, factory `initWorker` |
| `server/src/controllers/jobsController.js` | **Modifier** | Exporter `processJob`, réécrire `runJobs`, supprimer backup JSON |
| `server/server.js` | **Modifier** | Monter Bull Board `/admin/queues`, appeler `initWorker`, supprimer `restoreJobsBackup` |
| `server/src/services/appState.js` | **Modifier** | Supprimer `restoreJobsBackup()` |
| `docker-compose.yml` | **Créer** | Redis 7-alpine + app Node |
| `Dockerfile` | **Créer** | Image Node pour l'app en production |
| `.env` | **Modifier** | Ajouter `REDIS_URL` |
| `package.json` | **Modifier** | Ajouter `bullmq`, `ioredis`, `@bull-board/api`, `@bull-board/express` |
| `test/unit/queueService.test.js` | **Créer** | Test unitaire exports queueService |

---

## Task 1 : Dépendances + Infrastructure Redis

**Files:**
- Modify: `package.json`
- Modify: `.env`
- Create: `docker-compose.yml`
- Create: `Dockerfile`

**Interfaces:**
- Produces: `REDIS_URL` env var disponible ; `docker-compose up -d redis` démarre Redis sur port 6379

- [ ] **Step 1 : Installer les dépendances npm**

```bash
npm install bullmq ioredis @bull-board/api @bull-board/express
```

Résultat attendu : `package.json` contient les quatre packages dans `dependencies`.

- [ ] **Step 2 : Ajouter `REDIS_URL` dans `.env`**

Ajouter à la fin du fichier `.env` existant :

```
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3 : Créer `docker-compose.yml`**

À la racine du projet (même niveau que `package.json`) :

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

  app:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      - redis
    env_file:
      - .env
    environment:
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./server/public:/app/server/public
    restart: unless-stopped

volumes:
  redis_data:
```

- [ ] **Step 4 : Créer `Dockerfile`**

À la racine du projet :

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8000
CMD ["node", "./server/server.js"]
```

- [ ] **Step 5 : Vérifier que Redis démarre**

```bash
docker compose up -d redis
docker compose ps
```

Résultat attendu : service `redis` en statut `running`.

```bash
docker compose exec redis redis-cli ping
```

Résultat attendu : `PONG`

- [ ] **Step 6 : Commit**

```bash
git add package.json package-lock.json docker-compose.yml Dockerfile .env
git commit -m "feat: ajouter BullMQ, ioredis, bull-board et infrastructure Redis Docker"
```

---

## Task 2 : Créer `queueService.js`

**Files:**
- Create: `server/src/services/queueService.js`
- Create: `test/unit/queueService.test.js`

**Interfaces:**
- Produces:
  - `decoQueue` — instance `Queue` BullMQ nommée `'deco-jobs'`
  - `queueEvents` — instance `QueueEvents` pour `waitUntilFinished`
  - `initWorker(processor)` — `(processor: async (bullJob) => void) => Worker` — crée et retourne un Worker BullMQ avec concurrence=JOBS_CONCURRENCY

- [ ] **Step 1 : Écrire le test unitaire**

```js
// test/unit/queueService.test.js
const assert = require('assert');

describe('queueService', () => {
  let queueService;

  before(() => {
    // Stub ioredis pour éviter une vraie connexion Redis en test unitaire
    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function (request, ...args) {
      if (request === 'ioredis') {
        return class FakeRedis {
          constructor() {}
          on() { return this; }
          disconnect() {}
          duplicate() { return new FakeRedis(); }
        };
      }
      return originalLoad.call(this, request, ...args);
    };

    queueService = require('../../server/src/services/queueService');

    Module._load = originalLoad;
  });

  it('exporte decoQueue', () => {
    assert.ok(queueService.decoQueue, 'decoQueue doit être défini');
  });

  it('exporte queueEvents', () => {
    assert.ok(queueService.queueEvents, 'queueEvents doit être défini');
  });

  it('exporte initWorker en tant que fonction', () => {
    assert.strictEqual(typeof queueService.initWorker, 'function');
  });
});
```

- [ ] **Step 2 : Lancer le test — vérifier l'échec**

```bash
npx mocha test/unit/queueService.test.js --timeout 5000
```

Résultat attendu : `Error: Cannot find module '../../server/src/services/queueService'`

- [ ] **Step 3 : Créer `server/src/services/queueService.js`**

```js
const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../logger/logger');

const JOBS_CONCURRENCY = parseInt(process.env.JOBS_CONCURRENCY) || 3;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function makeConnection() {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const decoQueue = new Queue('deco-jobs', { connection: makeConnection() });
const queueEvents = new QueueEvents('deco-jobs', { connection: makeConnection() });

function initWorker(processor) {
  const worker = new Worker('deco-jobs', processor, {
    connection: makeConnection(),
    concurrency: JOBS_CONCURRENCY,
  });

  worker.on('failed', (job, err) => {
    logger.error(`❌ BullMQ job ${job?.data?.job?.cmd} échoué (tentative ${job?.attemptsMade}) : ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`✅ BullMQ job ${job?.data?.job?.cmd} terminé`);
  });

  return worker;
}

module.exports = { decoQueue, queueEvents, initWorker };
```

- [ ] **Step 4 : Lancer le test — vérifier la réussite**

```bash
npx mocha test/unit/queueService.test.js --timeout 5000
```

Résultat attendu : `3 passing`

- [ ] **Step 5 : Commit**

```bash
git add server/src/services/queueService.js test/unit/queueService.test.js
git commit -m "feat: créer queueService — Queue BullMQ, QueueEvents et factory initWorker"
```

---

## Task 3 : Modifier `jobsController.js` — exporter `processJob` + réécrire `runJobs`

**Files:**
- Modify: `server/src/controllers/jobsController.js:737-803` (fonction `runJobs`)
- Modify: `server/src/controllers/jobsController.js:896-905` (exports)

**Interfaces:**
- Consumes:
  - `decoQueue` from `../services/queueService`
  - `queueEvents` from `../services/queueService`
- Produces:
  - `processJob(job, req)` — exporté (utilisé par le worker dans `server.js`)
  - `generateStickersForJobs(jobs)` — reste privé, appelé en interne dans `runJobs`

- [ ] **Step 1 : Vérifier que les tests existants passent avant toute modification**

```bash
npm test
```

Résultat attendu : tous les tests passent (baseline).

- [ ] **Step 2 : Ajouter les imports BullMQ en haut de `jobsController.js`**

Après la ligne `const pLimit = require("p-limit");` (ligne 26), ajouter :

```js
const { decoQueue, queueEvents } = require("../services/queueService");
```

- [ ] **Step 3 : Réécrire `runJobs` (ligne 737)**

Remplacer la fonction `runJobs` entière par :

```js
async function runJobs(req, res) {
  saveFormatsTauroIfNeeded(req.body.formatTauro);

  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: "Jobs not run" });
  }

  try {
    state.jobs.completed = [];
    const jobsToRun = [...state.jobs.jobs];

    if (jobsToRun.length === 0) {
      return res.status(400).json({ error: "Aucun job à traiter" });
    }

    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    const bullJobs = await Promise.all(
      jobsToRun.map((job) =>
        decoQueue.add(
          "process-job",
          {
            job,
            sortFolder: req.body.sortFolder,
            ip: req.ip,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          },
        ),
      ),
    );

    logger.info(`📥 ${bullJobs.length} job(s) enqueués dans BullMQ.`);

    try {
      await Promise.all(bullJobs.map((bj) => bj.waitUntilFinished(queueEvents)));
    } catch (err) {
      logger.error(`⚠️ Un ou plusieurs jobs ont échoué définitivement : ${err.message}`);
    }

    logger.info("✅ Tous les jobs ont été traités.");

    const resultsSummary = state.jobs.completed.map(({ cmd, cmd2 }) => [cmd, cmd2 > 0 ? cmd2 : ""]);
    logger.info(
      `📊 Résumé des commandes traitées :\n[${resultsSummary
        .map(([cmd, cmd2]) => `${cmd}${cmd2 ? " + " + cmd2 : ""}`)
        .join(", ")}]`,
    );

    state.jobs.jobs = state.jobs.jobs.filter(
      (job) => !state.jobs.completed.some((completedJob) => completedJob._id === job._id),
    );

    const endTime = performance.now();
    broadcastWS({ type: "end", endTime });

    try {
      await generateStickersForJobs(state.jobs.completed);
    } catch (error) {
      logger.error("❌ Erreur lors de la génération des étiquettes :", error);
    }

    res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    logger.error("Error running jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
```

- [ ] **Step 4 : Mettre à jour les exports (ligne ~896)**

Remplacer le bloc `module.exports` par :

```js
module.exports = {
  getJobs,
  editJob,
  addJob,
  runJobs,
  deleteJob,
  deleteCompletedJobs,
  generateStickersOnly,
  getHistory,
  processJob,
};
```

- [ ] **Step 5 : Supprimer la ligne `const pLimit = require("p-limit");` (ligne 26)**

Cette dépendance n'est plus utilisée après la migration.

- [ ] **Step 6 : Vérifier que les tests existants passent toujours**

```bash
npm test
```

Résultat attendu : tous les tests passent. Si des tests importent `pLimit` indirectement, ils ne seront pas affectés.

- [ ] **Step 7 : Commit**

```bash
git add server/src/controllers/jobsController.js
git commit -m "feat: migrer runJobs vers BullMQ — enqueue + waitUntilFinished, supprimer backup JSON"
```

---

## Task 4 : `server.js` + `appState.js` — Worker, Bull Board, nettoyage

**Files:**
- Modify: `server/server.js:16` (import), `server/server.js:40` (restoreJobsBackup), `server/server.js:78` (après registerRoutes)
- Modify: `server/src/services/appState.js:62-73` (supprimer restoreJobsBackup)

**Interfaces:**
- Consumes:
  - `initWorker` from `./src/services/queueService`
  - `processJob` from `./src/controllers/jobsController`
  - `createBullBoard` from `@bull-board/api`
  - `BullMQAdapter` from `@bull-board/api/bullMQAdapter`
  - `ExpressAdapter` from `@bull-board/express`
  - `decoQueue` from `./src/services/queueService`

- [ ] **Step 1 : Modifier les imports dans `server.js`**

Remplacer la ligne 16 :
```js
const { state, loadAppVersion, restoreJobsBackup } = require("./src/services/appState");
```
par :
```js
const { state, loadAppVersion } = require("./src/services/appState");
```

Ajouter après les imports existants (après ligne 21 `const mongooseLib = ...`) :

```js
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { decoQueue, initWorker } = require("./src/services/queueService");
const { processJob } = require("./src/controllers/jobsController");
```

- [ ] **Step 2 : Supprimer `restoreJobsBackup()` dans `server.js` (ligne 40)**

Supprimer la ligne :
```js
restoreJobsBackup();
```

- [ ] **Step 3 : Monter Bull Board et initialiser le Worker dans `server.js`**

Après la ligne `registerRoutes(app);` (ligne 78), ajouter :

```js
// Bull Board — dashboard /admin/queues
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(decoQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// Worker BullMQ — traite les jobs process-job avec processJob
initWorker(async (bullJob) => {
  const { job, sortFolder, ip } = bullJob.data;
  const fakeReq = { body: { sortFolder }, ip };
  await processJob(job, fakeReq);
});
```

- [ ] **Step 4 : Supprimer `restoreJobsBackup` dans `appState.js`**

Dans `server/src/services/appState.js`, supprimer la fonction `restoreJobsBackup` (lignes 62-74) et la retirer de `module.exports` :

Remplacer :
```js
module.exports = {
  state,
  loadAppVersion,
  restoreJobsBackup,
  updateSourcePath,
};
```
par :
```js
module.exports = {
  state,
  loadAppVersion,
  updateSourcePath,
};
```

- [ ] **Step 5 : Lancer le serveur et vérifier Bull Board**

```bash
npm run server
```

Dans un navigateur, ouvrir `http://localhost:8000/admin/queues`.

Résultat attendu : interface Bull Board affichant la queue `deco-jobs` (0 jobs en attente).

- [ ] **Step 6 : Vérifier que les tests passent toujours**

```bash
npm test
```

Résultat attendu : tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add server/server.js server/src/services/appState.js
git commit -m "feat: initialiser worker BullMQ et monter Bull Board /admin/queues"
```

---

## Test de bout en bout (manuel)

Avec Redis en cours (`docker compose up -d redis`) et le serveur démarré (`npm run server`) :

1. Ajouter un job via l'interface
2. Cliquer "Lancer"
3. Observer dans Bull Board (`http://localhost:8000/admin/queues`) que le job passe de `waiting` → `active` → `completed`
4. Arrêter le serveur (`Ctrl+C`) pendant qu'un job est `active`
5. Redémarrer le serveur (`npm run server`)
6. Observer que le job repasse en `active` automatiquement (après le stall timeout BullMQ ~30s)

---

## Suppression du backup JSON (nettoyage post-validation)

Une fois le test de bout en bout validé, supprimer les fichiers et dossiers de backup JSON devenus obsolètes :

```bash
# Supprimer le backup existant s'il reste un fichier résiduel
rm -f server/backups/jobs_backup.json
# Optionnel : supprimer le dossier s'il est vide
rmdir server/backups 2>/dev/null || true
```

```bash
git add -A
git commit -m "chore: supprimer dossier backups JSON remplacé par BullMQ + Redis"
```
