# Spec : Schéma MongoDB — Profils & Kits de pose

**Date :** 2026-06-26  
**Statut :** Validé

---

## Contexte

Dans la base Gamesys (ODBC), certains dossiers/commandes comportent des **profils** (ex : cornières aluminium, profils de finition) et/ou des **kits de pose**. Ces informations sont déjà récupérées depuis ODBC via `dossierService.getDossierDetail()` mais ne sont jamais persistées — elles disparaissent après chaque consultation.

L'objectif est de **persister ces données en MongoDB** au moment du traitement des jobs, afin de constituer un historique de consommation et de préparer la gestion de stock future.

---

## Périmètre

- Création de deux nouveaux modèles Mongoose
- Intégration dans le flux `runJobs` (post-`saveDeco`)
- Phase 1 : enregistrement uniquement ; la gestion des quantités en stock (ajouts manuels, alertes de rupture) est hors scope

---

## Schémas Mongoose

### `StockArticle` — collection `stock_articles`

Catalogue des articles (profils et kits) détectés dans Gamesys. Un document par référence unique.

```js
{
  ref:             { type: String, required: true, unique: true }, // st_art_ref_client
  modele:          { type: String },  // st_modele
  libelle:         { type: String },  // st_lib_1_conso
  type:            { type: String, enum: ['profil', 'kit'], required: true },
  codeArticle:     { type: String },  // st_code_tarif (ex: 'KITPOSE')
  famille:         { type: String },  // st_art_famille
  sousFamille:     { type: String },  // st_art_sfamille
  stockDisponible: { type: Number, default: 0 },
  timestamps: true
}
```

> `stockDisponible` est initialisé à 0. Il sera alimenté via une future interface de gestion de stock. La décrémentation automatique est hors scope de cette phase.

---

### `ConsommationCommande` — collection `consommations_commandes`

Enregistre les articles consommés par chaque commande traitée.

```js
{
  numCmd:  { type: Number, required: true },
  client:  { type: String, enum: ['LM', 'CASTO', 'BRICO', 'ECOM'] },
  dateJob: { type: Date, default: Date.now },
  articles: [{
    ref:      { type: String },    // référence StockArticle
    type:     { type: String, enum: ['profil', 'kit'] },
    libelle:  { type: String },
    quantite: { type: Number }     // endv_quant depuis Gamesys
  }],
  timestamps: true
}
```

> Pas de contrainte d'unicité sur `numCmd` : si un job est relancé, un nouveau document est créé (traçabilité complète).

---

## Flux de données

Déclencheur : fin du traitement d'un job dans `runJobs` (`server/src/controllers/jobsController.js`), après l'appel à `saveDeco`.

```
1. getDossierDetail(job.cmd)       ← ODBC / Gamesys
   ↓ profileReferences + kitPosesReferences
   
2. Si aucun article → fin silencieuse (log debug)

3. Pour chaque article :
   StockArticle.findOneAndUpdate(
     { ref: article.ref },
     { $setOnInsert: { modele, libelle, type, codeArticle, famille, sousFamille } },
     { upsert: true, new: true }
   )
   // Crée l'article dans le catalogue si nouveau, ne modifie pas stockDisponible

4. ConsommationCommande.create({
     numCmd: job.cmd,
     client: job.client,
     dateJob: new Date(),
     articles: [{ ref, type, libelle, quantite }]
   })
```

**Gestion des erreurs :** le bloc ODBC est enveloppé dans un `try/catch`. Tout échec (Gamesys indisponible, dossier introuvable, erreur MongoDB) est loggué en warning mais ne fait **jamais** échouer le job. Le comportement existant reste intact.

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `server/src/models/StockArticle.js` | Créer |
| `server/src/models/ConsommationCommande.js` | Créer |
| `server/src/controllers/jobsController.js` | Modifier — ajouter le bloc post-saveDeco |

---

## Vérification

1. **Flux nominal** : traiter un job dont la commande a des profils/kits dans Gamesys → vérifier les collections `stock_articles` et `consommations_commandes` en base.
2. **ODBC absent** : couper Gamesys → le job se termine en succès, aucun document créé, warning en log.
3. **Commande sans profils** : job dont la commande n'a pas de profils/kits → aucun document `ConsommationCommande` créé.
4. **Idempotence** : relancer le même job → `StockArticle` inchangé (`$setOnInsert`), nouveau `ConsommationCommande` créé.
5. **Référence dupliquée** : deux jobs avec la même `ref` d'article → un seul document `StockArticle`, deux `ConsommationCommande`.
