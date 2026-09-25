# Intégration — decoGestion × Autre Application

Ce document décrit les collections MongoDB partagées entre **decoGestion** et l'application externe de suivi de production, ainsi que la logique à implémenter côté autre app.

---

## Collections MongoDB

### `lm_commandes` — suivi de production

Chaque commande traitée par decoGestion crée une entrée dans cette collection.

| Champ         | Type      | Description |
|---------------|-----------|-------------|
| `_id`         | ObjectId  | Identifiant MongoDB |
| `date`        | Date      | Date de création du job |
| `client`      | String    | Enseigne : `LM`, `CASTO`, `BRICO`, `ECOM` |
| `numCmd`      | Number    | Numéro de commande (5–6 chiffres) |
| `mag`         | String    | Ville / magasin |
| `status`      | String    | `"A lancer"` stub en attente · `"A imprimer"` visuel traité · `"PK à coliser"` pkOnly traité · `"expe"` expédié · `"ref_invalide"` |
| `pkOnly`      | Boolean   | `true` = dossier PK uniquement (pas de visuel) · `false` = commande visuel |
| `deco`        | String    | Nom du visuel *(absent si pkOnly)* |
| `ref`         | String    | Référence produit *(absent si pkOnly)* |
| `format`      | String    | Format du visuel *(absent si pkOnly)* |
| `finition`    | String    | Finition *(absent si pkOnly)* |
| `dibond`      | String    | Format plaque Tauro *(absent si pkOnly)* |
| `ex`          | Number    | Nombre d'exemplaires *(absent si pkOnly)* |
| `prodBlanc`   | Boolean   | Fond blanc *(absent si pkOnly)* |
| `temps`       | Number    | Temps de traitement (ms) |
| `perte`       | Number    | Perte matière (%) |
| `app_version` | String    | Version de decoGestion |
| `ip`          | String    | IP de l'opérateur |

**Index disponibles :**
- `{ numCmd: 1, client: 1 }`
- `{ date: -1 }`

---

### `consommations_commandes` — articles PK consommés par commande

Créée lors de la soumission d'un dossier contenant des profils ou kits de pose (qu'il soit PK uniquement ou mixte).

| Champ          | Type     | Description |
|----------------|----------|-------------|
| `_id`          | ObjectId | Identifiant MongoDB |
| `numCmd`       | Number   | Numéro de commande — clé de jointure avec `lm_commandes` |
| `client`       | String   | Enseigne |
| `dateCommande` | Date     | Date réelle de la commande Gamesys — à utiliser pour les prévisions par période |
| `createdAt`    | Date     | Date d'enregistrement du document (horodatage technique, auto-généré) |
| `articles`     | Array    | Liste des articles consommés (voir ci-dessous) |

> `dateJob` a été retiré du schéma (redondant avec `createdAt`, jamais utilisé pour du filtrage). Si votre code lit encore ce champ, basculez sur `createdAt`.

**Sous-document `articles[]` :**

| Champ      | Type   | Description |
|------------|--------|-------------|
| `ref`      | String | Référence article — clé de jointure avec `stock_profiles` |
| `type`     | String | `"profil"` ou `"kit"` |
| `libelle`  | String | Libellé de l'article |
| `quantite` | Number | Quantité consommée |

---

### `stock_profiles` — référentiel des profils et kits

Catalogue des articles disponibles. Le champ `stockDisponible` est à décrémenter par l'autre app lors de l'expédition.

| Champ              | Type   | Description |
|--------------------|--------|-------------|
| `_id`              | ObjectId | |
| `ref`              | String | Référence article *(clé unique)* |
| `modele`           | String | Modèle |
| `libelle`          | String | Libellé |
| `type`             | String | `"profil"` ou `"kit"` |
| `codeArticle`      | String | Code tarif |
| `famille`          | String | Famille article |
| `sousFamille`      | String | Sous-famille |
| `stockDisponible`  | Number | Stock restant — à décrémenter lors de l'expédition |

---

## Flux d'intégration

```
decoGestion (soumission dossier PK uniquement)
  │
  ├─► consommations_commandes  { numCmd, client, articles: [{ ref, type, libelle, quantite }] }
  └─► lm_commandes             { numCmd, client, mag, pkOnly: true, status: "PK à coliser" }

Autre app (scan code-barre → expédition)
  │
  ├─ PATCH lm_commandes { status: "expe" }   ← mise à jour statut
  │
  └─ si pkOnly === true :
       lookup consommations_commandes par numCmd
       pour chaque article :
         stock_profiles.$inc({ stockDisponible: -quantite })
```

---

## Logique à implémenter côté autre app

### 1. Passer une commande en "expédié"

```js
// 1. Mettre à jour le statut
const commande = await db.collection("lm_commandes").findOneAndUpdate(
  { numCmd: <numCmd> },
  { $set: { status: "expe" } },
  { returnDocument: "after" }
);

// 2. Si dossier PK uniquement → décrémenter le stock
if (commande.pkOnly) {
  await decrementStockPK(commande.numCmd);
}
```

### 2. Décrémentation du stock PK

```js
async function decrementStockPK(numCmd) {
  const conso = await db.collection("consommations_commandes").findOne({ numCmd });
  if (!conso) return;

  for (const art of conso.articles) {
    await db.collection("stock_profiles").findOneAndUpdate(
      { ref: art.ref },
      { $inc: { stockDisponible: -art.quantite } }
    );
  }
}
```

### 3. Distinguer visuel vs PK dans la liste de production

```js
// Requête — toutes les commandes en attente
const enAttente = await db.collection("lm_commandes")
  .find({ status: "" })
  .sort({ date: -1 })
  .toArray();

// Filtrer par type
const commandes_visuels = enAttente.filter(c => !c.pkOnly);
const commandes_pk      = enAttente.filter(c => c.pkOnly === true);
```

---

## Connexion MongoDB

La chaîne de connexion est définie dans `.env` à la racine de decoGestion :

```
MONGO_URL=mongodb://...
```

La base de données est celle pointée par `MONGO_URL`. Les trois collections à utiliser :

| Collection                  | Usage |
|-----------------------------|-------|
| `lm_commandes`              | Suivi statut production |
| `consommations_commandes`   | Détail articles PK par commande |
| `stock_profiles`            | Stock profils/kits à décrémenter |
