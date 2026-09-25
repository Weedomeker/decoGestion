# Schéma des données — decoGestion

Documentation de référence des collections MongoDB utilisées par l'application decoGestion.
Généré à partir des schémas Mongoose dans `server/src/models/`. Destiné à être importé comme
contexte dans une autre application/projet Claude.

## Vue d'ensemble

- **Base de données** : MongoDB, via Mongoose.
- **Environnements** : base `DecoKin` en production, base `Test` en développement.
- **Domaine métier** : gestion de la découpe/production de visuels décoratifs (crédences, dibond,
  stickers...) pour quatre enseignes clientes : **LM** (Leroy Merlin), **CASTO** (Castorama),
  **BRICO** (Bricomarché), **ECOM** (e-commerce). Les commandes proviennent d'un ERP externe,
  **Gamesys**, dont certaines données sont synchronisées/reflétées dans ces collections.
- **8 collections** réparties en 3 familles :
  - **Commandes / production** : `Deco`, `ConsommationCommande`
  - **Référentiels produit** (un par enseigne) : `RefDeco`, `RefCasto`, `RefBrico`, `RefEcom`
  - **Stocks** : `Stocks`, `StockProfile`

---

## 1. `Deco` (collection Mongo : `lm_commandes`)

Entité centrale : une entrée par visuel/panneau traité pour une commande. C'est la table de
travail principale, alimentée à la fois par la saisie manuelle (formulaire) et par la
synchronisation automatique depuis Gamesys (`gamesysStub`).

| Champ | Type | Description |
|---|---|---|
| `date` | Date | Date de création de l'entrée (par défaut : maintenant). |
| `dateLivraisonSouhaitee` | Date | Date de livraison souhaitée par le client. |
| `prixTotal` | Number | Prix total de la commande. |
| `prix` | Number | Prix unitaire du visuel. |
| `client` | String (enum) | Enseigne : `LM`, `CASTO`, `BRICO`, `ECOM`, ou `""`. |
| `numCmd` | Number (≥1) | Numéro de commande (correspond au dossier Gamesys, ex. `167648`). |
| `sousDossier` | String | Suffixe du sous-dossier Gamesys (ex. `"07"` pour `167648/07`) identifiant le visuel précis dans la commande. À combiner avec `numCmd` pour reconstituer le chemin complet. Vide pour les stubs `pkOnly`/`gamesysStub` non rattachés à un seul visuel, et pour la saisie manuelle. |
| `sousDossiers` | [String] | Liste des suffixes de sous-dossiers Gamesys d'origine agrégés dans un stub `pkOnly` (un stub peut regrouper plusieurs sous-dossiers, contrairement à `sousDossier` au singulier). |
| `mag` | String | Magasin destinataire. |
| `dibond` | String | Type/référence de plaque dibond utilisée. |
| `deco` | String | Nom du modèle décoratif (auto-rempli via le référentiel, cf. hooks ci-dessous). |
| `ref` | String | Référence produit — clé de résolution vers les collections `Ref*`. |
| `format` | String | Format du panneau (auto-rempli si trouvé dans le référentiel). |
| `finition` | String | Finition du visuel (auto-rempli via le référentiel, défaut `""`). |
| `ex` | Number (1–9999) | Nombre d'exemplaires. |
| `temps` | Number (≥0) | Temps de production (probablement en minutes/heures). |
| `perte` | Number | Perte matière calculée (cf. `client/src/CheckFormats.js`). |
| `status` | String | Statut du job de traitement. |
| `app_version` | String | Version de l'application ayant créé/traité l'entrée. |
| `ip` | String | IP de la machine à l'origine du job. |
| `comment` | String | Commentaire libre. |
| `prodBlanc` | Boolean | Indique une production sur fond blanc. |
| `pkOnly` | Boolean | `true` si l'entrée ne concerne que des profils/kits de pose, sans visuel (pas de découpe). |
| `dateCommande` | Date | Date réelle de la commande côté Gamesys. |
| `codeClient` | String | Code client Gamesys. |
| `refClient` | String | Référence client Gamesys. |
| `nombreProfil` | Number | Nombre de profils associés à la commande. |
| `nombreKitPose` | Number | Nombre de kits de pose associés. |
| `formatPlaqueGamesys` | String | Format de plaque tel que fourni par Gamesys (avant conversion, cf. dibond/format mm→cm). |
| `gamesysStub` | Boolean | `true` = document créé proactivement depuis Gamesys avant tout traitement utilisateur ; repasse à `false` dès qu'un job le réclame (`claimStubOrCreate`). |
| `createdAt` / `updatedAt` | Date | Timestamps automatiques Mongoose. |

**Index** : `{ numCmd: 1, client: 1 }`, `{ date: -1 }`.

**Logique métier clé (hooks `pre("save")` / `pre("findOneAndUpdate")`)** :
Quand `ref` est renseigné/modifié, l'app recherche cette référence dans les collections de
référentiel (`RefDeco`, `RefCasto`, `RefBrico`, `RefEcom`) selon un **ordre de priorité propre à
chaque enseigne** (le référentiel de l'enseigne du client est cherché en premier, puis les
autres en repli). Si une correspondance est trouvée, `finition`, `format` et `deco` sont
auto-remplis depuis le référentiel.

---

## 2. `ConsommationCommande` (collection Mongo : `consommations_commandes`)

Une entrée par commande (numCmd), détaillant la consommation d'articles (profils/kits de pose)
liés. Sert notamment aux prévisions de stock.

| Champ | Type | Description |
|---|---|---|
| `numCmd` | Number (requis) | Numéro de commande — **unique**. |
| `client` | String (enum) | `LM`, `CASTO`, `BRICO`, `ECOM`. |
| `dateCommande` | Date | Date réelle de la commande Gamesys (`dos_date`) — à distinguer de `createdAt` qui reflète le moment de l'import/traitement. |
| `dateDepartUsine` | Date | Date de départ usine (Gamesys `ff_livraison.bo_date_depart_usine`). |
| `dateLivraisonSouhaitee` | Date | Date de livraison souhaitée (Gamesys `bo_date_souhaitee`). |
| `codeClient` | String | Code client Gamesys (mêmes sources que `Deco`). |
| `refClient` | String | Référence client Gamesys. |
| `mag` | String | Ville de livraison (magasin LM/CASTO/BRICO) ou nom du destinataire final pour ECOM (livraison directe, pas de notion de magasin). |
| `articles` | [ArticleSchema] | Liste des articles consommés (voir sous-schéma). |
| `createdAt` / `updatedAt` | Date | Timestamps automatiques. |

**Sous-schéma `article`** (embarqué, sans `_id`) :

| Champ | Type | Description |
|---|---|---|
| `ref` | String | Référence de l'article. |
| `type` | String (enum) | `profil` ou `kit`. |
| `libelle` | String | Libellé de l'article. |
| `quantite` | Number | Quantité consommée (défaut 0). |
| `prix` | Number | Prix de l'article. |

**Index** : `{ numCmd: 1 }` (unique).

---

## 3. Référentiels produit — `RefDeco`, `RefCasto`, `RefBrico`, `RefEcom`

Un référentiel par enseigne, associant une référence produit (`ref`) à ses caractéristiques.
Utilisés pour l'auto-complétion et la résolution des champs dans `Deco`.

| Champ | Type | Description |
|---|---|---|
| `ref` | String (unique) | Référence produit — clé de recherche. |
| `model` | String | Nom du modèle décoratif. |
| `finition` | String | Finition du produit. |
| `format` | String | Format du panneau. |
| `blanc` | Boolean | **`RefEcom` uniquement** — indique un fond blanc. |

| Modèle | Collection Mongo | Index texte |
|---|---|---|
| `RefDeco` | `lm_ref_deco` | `{ model: "text", finition: "text" }` |
| `RefCasto` | `casto_ref_deco` | `{ model: "text", finition: "text" }` |
| `RefBrico` | `brico_ref_deco` | `{ model: "text", finition: "text" }` |
| `RefEcom` | `ecom_ref_deco` | *(aucun index texte)* |

Ordre de résolution utilisé par `Deco` selon l'enseigne du client (`clientRefOrder`) :

- **LM** → RefDeco, RefCasto, RefBrico, RefEcom
- **CASTO** → RefCasto, RefDeco, RefBrico, RefEcom
- **BRICO** → RefBrico, RefDeco, RefCasto, RefEcom
- **ECOM** → RefEcom, RefDeco, RefCasto, RefBrico

---

## 4. `Stocks` (collection Mongo : `stocks`, nom de modèle en minuscule)

Stock disponible par visuel/référence.

| Champ | Type | Description |
|---|---|---|
| `visuel` | String | Nom du visuel. |
| `finition` | String | Finition (défaut `""`). |
| `format` | String | Format du panneau. |
| `ref` | String | Référence produit. |
| `ex` | Number | Quantité en stock (nombre d'exemplaires). |
| `createdAt` / `updatedAt` | Date | Timestamps automatiques. |

**Index** : `{ ref: 1 }`.

**Comportement particulier** : un hook `post("findOneAndUpdate")` **supprime automatiquement**
le document si `ex` atteint `0` après mise à jour (le stock épuisé n'est pas conservé à 0, il est
retiré de la collection).

---

## 5. `StockProfile` (collection Mongo : `stock_profiles`)

Stock disponible pour les profils et kits de pose (accessoires de montage, distincts des visuels
découpés).

| Champ | Type | Description |
|---|---|---|
| `ref` | String (requis, unique) | Référence de l'article. |
| `modele` | String | Nom du modèle (défaut `""`). |
| `libelle` | String | Libellé (défaut `""`). |
| `type` | String (enum, requis) | `profil` ou `kit`. |
| `codeArticle` | String | Code article interne (défaut `""`). |
| `famille` | String | Famille produit (défaut `""`). |
| `sousFamille` | String | Sous-famille produit (défaut `""`). |
| `stockDisponible` | Number | Quantité disponible (défaut 0). |
| `createdAt` / `updatedAt` | Date | Timestamps automatiques. |

**Index** : `{ type: 1 }`.

---

## Règles métier transverses notables

### Crédences (BRICO / CASTO)

Panneaux de format `300x60` (CASTO) ou `255x60` (BRICO), détectés via le regex `/^\d{3}x\d{2}$/i`
sur `format_visu`. Impact sur `Deco` :

- **`ex = 1`** → 2 visuels **différents** amalgamés côte à côte sur la même plaque ; le 2e visuel
  est obligatoire (fourni par l'utilisateur), sinon rejet HTTP 400. Résultat : **2 entrées**
  `Deco` distinctes en base (une par visuel).
- **`ex ≥ 2`** → le même visuel est dupliqué automatiquement pour remplir la plaque
  (`visuel2 = visuel1`). Résultat : **1 seule entrée** `Deco` (pas de doublon créé pour le visuel
  dupliqué).

### Stubs Gamesys (`gamesysStub` / `pkOnly`)

Un service de synchronisation crée proactivement des documents `Deco` par sous-dossier visuel
directement depuis Gamesys, avant toute intervention utilisateur (`gamesysStub: true`). Un job
utilisateur peut ensuite « réclamer » ce stub (`claimStubOrCreate`) plutôt que d'en créer un
nouveau, ce qui bascule `gamesysStub` à `false`. Les entrées `pkOnly: true` représentent des
commandes de profils/kits de pose seuls, sans visuel à découper, et peuvent agréger plusieurs
sous-dossiers (`sousDossiers`) contrairement aux entrées visuel classiques (`sousDossier`).

### Limite de fraîcheur des données Gamesys

L'intégration avec Gamesys est récente : tout backfill/synchronisation de données historiques
Gamesys échoue quasi systématiquement pour les commandes antérieures à 2025 (≈0% de succès sur
2023–2024, ≈90% en 2026, mesuré le 24/08/2026).
