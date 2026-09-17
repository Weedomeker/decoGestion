# Spec : Intégration BullMQ + Redis

**Date :** 2026-06-19
**Périmètre :** persistance et retry automatique des jobs pendant l'exécution (`runJobs`)

---

## Contexte

Les jobs PDF peuvent durer jusqu'à 40 minutes avec des fichiers de plusieurs Go. Si le serveur redémarre ou plante pendant `runJobs`, les jobs en cours sont perdus et doivent être relancés manuellement depuis le début.

Un mécanisme de backup JSON (`jobs_backup.json`) existe déjà mais reste manuel : il restaure la liste au démarrage, mais ne gère ni la reprise automatique ni les retries.

L'objectif est de remplacer ce mécanisme par BullMQ + Redis pour obtenir : persistance de la queue d'exécution, retry automatique sur échec, et visibilité via un dashboard.

---

## Périmètre retenu

BullMQ intervient **uniquement pendant l'exécution** (`runJobs`). Les jobs restent en mémoire (`state.jobs.jobs`) jusqu'au déclenchement manuel. BullMQ ne gère pas la liste d'attente pré-exécution.

---

## Architecture

```
Express process
│
├── POST /run-jobs
│     └── runJobs()
│           └── enqueue N jobs → Redis (BullMQ Queue)
│
├── BullMQ Worker (même process, concurrency=3)
│     └── pour chaque job → processJob() [inchangé]
│           ├── modifyPDF / amalgameCredences
│           ├── generateJPG (pdfWorker / getPreview)
│           ├── saveDeco (MongoDB)
│           ├── updateStock
│           └── generateCutFile
│
├── GET /admin/queues → Bull Board UI
│
└── WebSocket → broadcasts depuis processJob [inchangés]

Redis (Docker)
└── queue BullMQ (waiting / active / completed / failed)
```

---

## Fichiers

### Nouveaux
- `server/src/services/queueService.js` — Queue BullMQ, Worker, configuration retry
- `docker-compose.yml` — Redis + app Node
- `Dockerfile` — image Node pour l'app

### Modifiés
- `server/src/controllers/jobsController.js` — `runJobs` : remplace `pLimit + Promise.all` par enqueue BullMQ ; supprime la logique `jobs_backup.json`
- `server/server.js` — montage Bull Board sur `/admin/queues` + démarrage worker au boot
- `.env` — ajout `REDIS_URL`
- `package.json` — ajout dépendances `bullmq`, `@bull-board/express`, `@bull-board/api`

### Supprimés
- `server/src/services/appState.js` : fonction `restoreJobsBackup()` retirée (Redis remplace ce besoin)
- `server/server.js` : appel `restoreJobsBackup()` retiré au démarrage

---

## Configuration retry

```js
{
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 }
  // délais : 5s → 10s → 20s
}
```

Un job qui échoue 3 fois passe en statut `failed`. Il est visible dans Bull Board et peut être relancé manuellement en un clic.

---

## Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]
    command: redis-server --appendonly yes

  app:
    build: .
    ports: ["8000:8000"]
    depends_on: [redis]
    environment:
      - REDIS_URL=redis://redis:6379

volumes:
  redis_data:
```

`appendonly yes` assure la persistance AOF de Redis : la queue survit à un redémarrage du container.

---

## Variables d'environnement

```
# .env (racine)
REDIS_URL=redis://localhost:6379      # dev local
# REDIS_URL=redis://redis:6379        # docker-compose
```

---

## Bull Board

- URL : `/admin/queues`
- Auth : aucune (réseau interne entreprise)
- Affiche : jobs waiting / active / completed / failed
- Actions : relancer un job failed manuellement

---

## Comportement détaillé de runJobs

**Avant (actuel) :**
```js
const limit = pLimit(JOBS_CONCURRENCY);
await Promise.all(jobsToRun.map((job) => limit(() => processJob(job, req))));
```

**Après (BullMQ) :**
```js
// 1. Ajouter tous les jobs dans la queue Redis
await Promise.all(jobsToRun.map((job) => decoQueue.add("process-job", { job, sortFolder })));

// 2. Le worker (lancé au démarrage) traite les jobs avec concurrency=3
//    et appelle processJob(job, req) pour chacun
```

`processJob` reste **inchangé**. La réponse HTTP de `runJobs` est renvoyée immédiatement après l'enqueue (non bloquante). La fin du traitement est signalée via WebSocket (`type: "end"`) comme actuellement.

---

## Gestion du `req` dans le Worker

`processJob` utilise `req.ip` et `req.body.sortFolder`. Ces valeurs sont sérialisées dans le payload BullMQ au moment de l'enqueue :

```js
decoQueue.add("process-job", {
  job,
  sortFolder: req.body.sortFolder,
  ip: req.ip,
})
```

Le worker reconstruit un objet `req` minimal `{ ip, body: { sortFolder } }` pour l'appel à `processJob`.

---

## Ce qui ne change pas

- `processJob` — aucune modification
- `state.jobs.jobs` / `state.jobs.completed` — toujours utilisés comme avant
- Tous les broadcasts WebSocket (`broadcastWS`, `broadcastCompletedJob`)
- La concurrence à 3 (`JOBS_CONCURRENCY`)
- Les tests existants (`test/integration/credences.test.js`)

---

## Ce qui est supprimé

- Logique `jobs_backup.json` dans `runJobs` (write + unlink)
- `restoreJobsBackup()` dans `appState.js` et son appel dans `server.js`

---

## Séquence de récupération après crash

1. Redis conserve le job en statut `active`
2. Après le timeout de stall BullMQ (30s par défaut), le job repasse en `waiting`
3. Au redémarrage du worker, le job est repris automatiquement
4. Si `processJob` lève une exception → retry (jusqu'à 3 fois)
5. Après 3 échecs → statut `failed`, visible dans Bull Board
