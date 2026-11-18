# Thème « Acier + orange discret » — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer la palette G1, des contrôles unifiés (28 px, arrondi 3 px), une mise en page harmonieuse du Dossier API et de la File, et des menus déroulants jamais coupés.

**Architecture :**
- Les couleurs passent toutes par les variables de `client/src/css/index.css`.
- Les contrôles Semantic sont restylés dans une nouvelle feuille, `client/src/css/controls.css`, chargée après `index.css`.
- La logique testable sort dans trois utilitaires purs sous `client/src/utils/` : placement des menus, résumé des dossiers, résumé de la sélection. Ils sont testés avec mocha, comme `apercuTauro.js`.
- Le reste se vérifie visuellement dans Chrome.

**Tech Stack :** React 18, Vite 5, semantic-ui-react 2, CSS avec `color-mix()`, mocha + `node:assert`.

**Spec :** `docs/superpowers/specs/2026-11-18-theme-acier-orange-design.md` (fait foi pour toutes les valeurs ; lire la section citée par chaque tâche).

## Global Constraints

- Branche `dev`, commits directs ; pas de branche de fonctionnalité.
- Ne jamais lancer `npm run format`. Formater seulement les fichiers neufs (`npx prettier --write <fichier>`).
- Tests : `npm run test:unit` (racine, en dev). Les utilitaires client sont des modules ESM (`export function`), chargés dans les tests par `require("../../client/src/utils/x.js")`, comme `apercuTauro.test.js`.
- Contrôle de chaque tâche visuelle : `cd client && npm run lint && npm run build`, sans erreur.
- Contrôles : `--ctl-h: 28px`, `--ctl-h-sm: 24px`, `--ctl-px: 12px`, `--ctl-r: 3px`.
- Grille d'espacement : 4, 8, 12, 16 et 24 px seulement. Texte : 12, 13 et 14–15 px seulement, plus rien en 9–10 px ni en petites majuscules espacées.
- L'orange (`--accent2`) ne sert qu'à quatre endroits : l'onglet actif de l'en-tête, `.tab-badge`, le focus des champs et menus, et le focus clavier.
- Contraste du texte ≥ 4,5:1 dans les deux thèmes.
- Vérification visuelle avec les fichiers d'essai `client/public/__palettes-essai.js` et `client/public/__file-simulee.js`. Ils ne sont jamais commités ; la tâche 9 les supprime. Les modifier relance Vite et nodemon.

## Review Focus

1. **Menu ouvert dans la modale Config** : le menu doit passer au-dessus de la modale, pas dessous. *Test : tâche 4, étape de vérification « Config ».*
2. **Fenêtre redimensionnée ou tableau défilé, menu ouvert** : le menu reste collé à son champ et ne sort jamais de l'écran. *Tests : tâche 4, `placerMenu` (bord droit, bord bas) et vérification à 1280×600.*
3. **Filtre « Sur-mesure uniquement » activé** : le résumé du bandeau ne compte que les jobs visibles. *Test : tâche 7, `resumeSelection` avec `estVisible`.*
4. **Dossier contenant seulement des profils/kits** : le résumé de la zone de recherche compte 0 job pour lui, sans planter. *Test : tâche 6, `resumeDossiers`.*
5. **Mode sombre** : texte des boutons principaux en `--on-accent` (foncé), et cases cochées lisibles. *Vérification : tâches 2 et 9.*

---

### Task 1 : Palette G1, en-tête foncé, sobriété

**Files :**
- Modify : `client/src/css/index.css` (blocs `:root` et `[data-theme="dark"]` ; `body` ; `.header*` ; logo)

**Interfaces :**
- Produces : les variables `--accent`, `--accent-soft`, `--on-accent`, `--accent2`, `--accent2-soft`, `--success`, `--danger`, `--danger-soft`, `--warning`, `--warning-soft`, plus les fonds, bordures et textes (tableau de la spec §1). Ajoute aussi `--ctl-h`, `--ctl-h-sm`, `--ctl-px`, `--ctl-r` et `--s-12: 12px` dans `:root`.

- [ ] **Étape 1 : remplacer les valeurs Zinc et Ardoise par G1.** Valeurs exactes : tableau de la spec §1, clair et sombre. Garder les noms existants.
- [ ] **Étape 2 : sobriété.** Retirer `background-image` et `background-size` du `body` (fond pointillé) et l'ombre de `.header`, en clair comme en sombre.
- [ ] **Étape 3 : en-tête foncé.** Valeurs de la spec §2. En clair, fond `color-mix(in srgb, var(--accent) 30%, #0b0d12)`. Logo `filter: invert(1)` en clair (la règle `img.ui.image.header-logo` actuelle force `filter: none`, la remplacer). Onglets `rgba(255,255,255,.62)`. Onglet actif blanc avec `box-shadow: inset 0 -3px 0 var(--accent2)`. `.tab-badge` fond `--accent2`, texte blanc. `.header-action-btn` : fond `rgba(255,255,255,.08)`, bordure `rgba(255,255,255,.18)`. En sombre, fond `--bg-elevated`.
- [ ] **Étape 4 : vérifier.** Lancer `cd client && npm run lint && npm run build`, sans erreur. Dans Chrome (`localhost:5173`), en clair puis en sombre : en-tête bleu nuit, onglet actif souligné d'orange, fond sans points.
- [ ] **Étape 5 : commit.** `git add client/src/css/index.css && git commit -m "style(theme): palette acier G1 et en-tete fonce"`

### Task 2 : Boutons, champs, cases et interrupteurs unifiés

**Files :**
- Create : `client/src/css/controls.css`
- Modify : `client/src/main.jsx` (importer `./css/controls.css` après `./css/index.css`)
- Modify : les `<Button color=…>` dans `App.jsx`, `components/Config.jsx`, `DossierAutocomplete.jsx`, `InfoStockModal.jsx`, `JobsList.jsx`, `ReferencesView.jsx`, `SurMesurePanneau.jsx`, `ApercuSessionTauro.jsx`, `AlerteRepriseArret.jsx`
- Modify : couleurs codées en dur dans `css/index.css`, `css/JobsList.css`, `css/ReferencesView.css`

**Interfaces :**
- Consumes : les variables de la tâche 1.
- Produces : 4 rôles de bouton. `primary` = principal, `positive` = validation, `negative` = danger, sans prop de couleur = secondaire. Les tâches suivantes n'utilisent que ces rôles.

- [ ] **Étape 1 : écrire `controls.css`.** Valeurs de la spec §3 :
  - boutons : hauteur, arrondi, graisse 500, écart icône 6 px, boutons à icône seule carrés ;
  - les 4 rôles ; `negative` en contour, plein au survol ; texte des `primary` en `--on-accent` (lisible en sombre) ;
  - champs et `.ui.selection.dropdown` : bordure, survol, focus orange ;
  - menus fermés à hauteur exacte `--ctl-h`, marges `calc((var(--ctl-h) - 2px - 1.2em) / 2)`, flèche centrée ;
  - **exclure `.ui.search.selection.dropdown > input.search`** des règles de champ (pas de bordure, de fond ni de `min-height`) ;
  - cases à cocher : 15 px, arrondi 2 px, coche et tiret en SVG ;
  - interrupteurs : 28 × 16 px ;
  - `.ui.label` : arrondi 3 px, fond teinté via les variables ;
  - `.pk-toggle-badge` (spec §3).

  Les règles du prototype `__palettes-essai.js` (bloc `data-ordre`) peuvent servir de point de départ, sans le préfixe `html[data-ordre]`.
- [ ] **Étape 2 : passer les `<Button>` aux rôles.** `color="green"` → `positive` ; `color="red"` → `negative` ; `color="black"` et `color="vk"` → `primary` ; `color="blue"`, `"teal"` et `"grey"` → aucune prop. Garder les `basic`. Ne pas toucher aux `<Icon color>`, `<Label color>` et `<Segment color>`. Vérifier qu'il ne reste rien : `grep -rnE '<Button[^>]*color=' client/src` doit être vide (attention aux props sur plusieurs lignes : chercher aussi `color="(red|green|black|vk|blue|teal|grey)"` sous un `<Button`).
- [ ] **Étape 3 : rattacher les couleurs codées en dur.** Dans les trois CSS, remplacer chaque hexadécimal ou `rgba` par la variable équivalente. Laisser celles qui n'en ont pas (spec, « Laissé à l'implémenteur »).
- [ ] **Étape 4 : vérifier.** Lancer `cd client && npm run lint && npm run build`. Dans Chrome, Dossier API avec le dossier 169853 :
  - un seul contour sur les menus Format Tauro, Format et Visuel ;
  - menus et champs de 28 px (mesurer avec `getBoundingClientRect().height`) ;
  - en sombre, « Rechercher » et les boutons principaux ont un texte foncé.
- [ ] **Étape 5 : commit.** `git add client/src && git commit -m "style(ui): boutons, champs, cases et interrupteurs unifies (28 px, arrondi 3)"`

### Task 3 : Enseignes en texte coloré adouci

**Files :**
- Modify : `client/src/css/index.css` (`--color-*`, `.client-badge*` vers la ligne 883, `.stats-client-badge` vers la ligne 2110)
- Modify : `client/src/css/JobsList.css:96-99` (liseré)
- Modify : `client/src/components/JobsList.jsx:524` (cellule client)

**Interfaces :**
- Produces : la classe `.client-name client-name--{lm|casto|ecom|brico}`, texte coloré réutilisable.

- [ ] **Étape 1 : couleurs.** Mêmes valeurs dans les deux thèmes : `--color-lm: #3d7a52`, `--color-casto: #3a5ea6`, `--color-ecom: #2e7770`, `--color-brico: #a65b34`.
- [ ] **Étape 2 : style texte.** Créer `.client-name` (12 px, graisse 700, espacement 0,02 em, sans fond ni bordure). Couleur en clair : `color-mix(in srgb, var(--color-x) 90%, #000)` ; en sombre : `color-mix(… 55%, #fff)`. Rendre `.client-badge--x` et `.stats-client-badge.stats-client-x` identiques à `.client-name--x`, sans fond, bordure ni largeur fixe.
- [ ] **Étape 3 : File.** Ligne 524 : `<TableCell><span className={`client-name client-name--${entry.client?.toLowerCase()}`}>{entry.client}</span></TableCell>`. Liseré : 3 px, `var(--color-x)` en clair, `color-mix(… 75%, #fff)` en sombre.
- [ ] **Étape 4 : vérifier.** Lancer `npm run lint && npm run build`. Dans Chrome, File simulée (`__file-simulee.js`, les 4 enseignes), en clair et en sombre : texte coloré sans cadre. Contraste mesuré : ≥ 4,8:1 en clair, ≥ 7:1 en sombre.
- [ ] **Étape 5 : commit.** `git commit -am "style(clients): enseignes en texte colore adouci, sans badge"`

### Task 4 : Menus déroulants posés au-dessus de la page

**Files :**
- Create : `client/src/utils/placementMenu.js`
- Test : `test/unit/placementMenu.test.js`
- Modify : `client/src/components/AutoDropdown.jsx`
- Modify : `client/src/components/Config.jsx:13` et `client/src/components/JobsList.jsx:23` (importer `Dropdown` depuis `./AutoDropdown`)
- Modify : `client/src/css/index.css:993` (règles `.dossier-table .ui.dropdown .menu` : retirer `z-index: 1100` et les largeurs qui contredisent le calcul)

**Interfaces :**
- Produces : `placerMenu({ declencheur, fenetre, hauteurContenu, marge = 8, hauteurMin = 120, hauteurMax = 300 }) → { versLeHaut: boolean, top: number, left: number, minLargeur: number, hauteurMax: number }`.
  - `declencheur` : `{ top, bottom, left, right, width }` (rectangle en pixels de la fenêtre).
  - `fenetre` : `{ largeur, hauteur }`.
  - `top` : bord haut du menu en position fixe (s'il s'ouvre vers le haut, `top = declencheur.top - hauteurMax`).

- [ ] **Étape 1 : écrire les tests qui échouent.**

```js
const assert = require("node:assert/strict");
const { placerMenu } = require("../../client/src/utils/placementMenu.js");
const fenetre = { largeur: 1280, hauteur: 600 };
const decl = (top, left = 100, width = 200) => ({ top, bottom: top + 28, left, right: left + width, width });

describe("placerMenu", () => {
  it("s'ouvre vers le bas quand il y a la place", () => {
    const p = placerMenu({ declencheur: decl(100), fenetre, hauteurContenu: 250 });
    assert.equal(p.versLeHaut, false); assert.equal(p.top, 128); assert.equal(p.hauteurMax, 250);
  });
  it("s'ouvre vers le haut près du bas de la fenêtre", () => {
    const p = placerMenu({ declencheur: decl(520), fenetre, hauteurContenu: 250 });
    assert.equal(p.versLeHaut, true); assert.equal(p.top, 520 - 250); assert.equal(p.hauteurMax, 250);
  });
  it("plafonne la hauteur à la place disponible, sans descendre sous hauteurMin", () => {
    const p = placerMenu({ declencheur: decl(300), fenetre: { largeur: 1280, hauteur: 420 }, hauteurContenu: 300 });
    assert.ok(p.hauteurMax <= 300 - 8 && p.hauteurMax >= 120);
  });
  it("prend au moins la largeur du déclencheur", () => {
    assert.equal(placerMenu({ declencheur: decl(100), fenetre, hauteurContenu: 100 }).minLargeur, 200);
  });
  it("recale à gauche un menu qui dépasserait le bord droit", () => {
    const p = placerMenu({ declencheur: decl(100, 1200, 200), fenetre, hauteurContenu: 100 });
    assert.equal(p.left + p.minLargeur <= 1280 - 8, true);
  });
  it("limite la largeur à la fenêtre moins 16 px", () => {
    const p = placerMenu({ declencheur: decl(100, 0, 2000), fenetre, hauteurContenu: 100 });
    assert.equal(p.minLargeur, 1280 - 16); assert.equal(p.left, 8);
  });
});
```

- [ ] **Étape 2 : lancer les tests.** `npx mocha test/unit/placementMenu.test.js` doit échouer avec « Cannot find module ».
- [ ] **Étape 3 : implémenter `placerMenu` dans `client/src/utils/placementMenu.js`.**
  - Hauteur utile : `min(hauteurContenu, hauteurMax)`.
  - Place sous le déclencheur : `fenetre.hauteur - declencheur.bottom - marge`. Place au-dessus : `declencheur.top - marge`.
  - Ouvrir vers le haut si la place dessous est inférieure à la hauteur utile et que la place dessus est plus grande.
  - Hauteur finale : `max(hauteurMin, min(hauteur utile, place du côté choisi))`.
  - Largeur : `min(declencheur.width, fenetre.largeur - 16)`.
  - Gauche : `clamp(declencheur.left, 8, fenetre.largeur - 8 - largeur)`.
- [ ] **Étape 4 : relancer les tests.** `npx mocha test/unit/placementMenu.test.js` : 6 réussis.
- [ ] **Étape 5 : brancher `AutoDropdown`.**
  - Garder une ref sur le `.ui.dropdown` et repérer son `.menu`.
  - À l'ouverture : mesurer le déclencheur et la hauteur de contenu du menu (`scrollHeight`), appeler `placerMenu`, puis appliquer au menu `position: fixed`, `top`, `left`, `min-width`, `max-height`, `overflow-y: auto` et `z-index: 1200`.
  - Passer `upward` à Semantic selon `versLeHaut`, tout en gardant le `top` calculé.
  - Tant que le menu est ouvert, écouter `scroll` (en capture, sur `window`) et `resize` pour recalculer. À `onClose`, retirer les écouteurs et les styles en ligne.
  - Supprimer `getVisibleBounds` et la classe `auto-dropdown--capped`, qui n'ont plus d'usage.
  - Garder les props `onOpen`, `onClose` et `upward` de l'appelant (`upward` explicite gagne).
- [ ] **Étape 6 : `Config` et `JobsList` passent par `AutoDropdown`.** Remplacer l'import de `Dropdown` depuis `semantic-ui-react` par `import Dropdown from "./AutoDropdown"`. Retirer de `index.css` le `z-index: 1100` et les `min-width`/`max-width` du menu de `.dossier-table`.
- [ ] **Étape 7 : vérifier dans Chrome**, en 1920×1080, 1366×768 et 1280×600, chaque menu de la spec §5. Il s'ouvre entier, au-dessus des tableaux et des bandeaux, et reste collé à son champ quand on fait défiler le tableau ou redimensionne la fenêtre. **Config** : ouvrir la modale, puis ses 2 menus, qui doivent passer au-dessus de la modale (sinon, relever le `z-index` au-dessus de celui de `.ui.dimmer`). Menus à recherche : la saisie filtre toujours, et Entrée choisit l'élément.
- [ ] **Étape 8 : commit.** `git add client/src test/unit/placementMenu.test.js && git commit -m "fix(ui): menus deroulants poses au-dessus de la page, jamais coupes"`

### Task 5 : Harmonie du Dossier API (tableau et partie haute)

**Files :**
- Modify : `client/src/App.jsx` (`.mode-tabs` vers la ligne 1036 ; filtre vers la ligne 1138 ; en-têtes vers 1192 ; prix du job vers 1302 et 1425)
- Modify : `client/src/css/index.css` (`.dossier-table…` vers les lignes 1015-1036, `.form-panel--wide .mode-tabs`, `.filter-toggle`, `.ui.grey.segment.dossier-autocomplete`)

- [ ] **Étape 1 : prix sur la ligne.**
  - Sortir le prix du job (lignes 1302 et 1425) de sous le menu Visuel et le mettre dans une cellule `<Table.Cell className="col-prix">` juste après la cellule Visuel.
  - Ajouter `<Table.HeaderCell className="col-prix">Prix</Table.HeaderCell>`.
  - Augmenter de 1 le `colSpan` des lignes de groupe (ligne 1246 : `hasCredences ? 10 : 9`) et celui de toute ligne pleine largeur du tableau, par exemple `credence-inline-form` ou le bandeau d'avertissement crédences (`grep -n colSpan App.jsx`).
  - `.col-prix` : 84 px, aligné à droite, police des données 12 px, `--text-secondary`.
- [ ] **Étape 2 : lignes et alignements** (spec §3 bis, « Tableau du Dossier API »).
  - Cellules 6 × 8 px (12 px à gauche de la 1re colonne), `vertical-align: middle`.
  - Supprimer `padding-top: 13px`, `vertical-align: top` et `.toggle-chip { margin-top: 9px }`, ainsi que `height: 35px` sur `.dossier-table .ui.input > input`.
  - Lignes de groupe : fond `--bg-surface`, 12 px, `nowrap`, sans `display: flex` sur la cellule.
  - `.toggle-chip` : 22 px, 11 px, arrondi 3 px.
- [ ] **Étape 3 : partie haute** (spec §3 bis, « Partie haute »).
  - `.form-panel--wide .mode-tabs` : `max-width: none`, sans marges automatiques.
  - Espacements : onglets → recherche 12 px, recherche → filtre 12 px, filtre → tableau 8 px.
  - Cadre de recherche : 1 px sur les 4 côtés, sélecteur `.ui.grey.segment.dossier-autocomplete:not(.inverted)` pour battre Semantic.
  - `.filter-toggle` : 12 px, casse normale.
- [ ] **Étape 4 : vérifier.** Lancer `npm run lint && npm run build`. Dans Chrome, avec 20 jobs (dossiers 169853 169852 169850 169848 169818 169817 169816 169811 169810 169814 169766 169732) :
  - centre vertical de la case, des menus, des champs et des pastilles identique à 1 px près dans une ligne (mesurer avec `getBoundingClientRect`) ;
  - lignes de job et de groupe de même hauteur ;
  - bords gauche et droit identiques pour `.mode-tabs`, `.dossier-autocomplete`, `.filter-toggle` et `.dossier-table`.
- [ ] **Étape 5 : commit.** `git commit -am "style(formulaire): Dossier API aligne, prix sur la ligne, espacements reguliers"`

### Task 6 : Zone de recherche « résumé + liste repliable »

**Files :**
- Create : `client/src/utils/resumeDossiers.js`
- Test : `test/unit/resumeDossiers.test.js`
- Modify : `client/src/components/DossierAutocomplete.jsx:515-546`
- Modify : `client/src/css/index.css` (`.dossier-chips`, nouveau `.dossier-resume`)

**Interfaces :**
- Produces : `resumeDossiers(dossiers) → { nbDossiers: number, nbJobs: number, montant: number }`. `dossiers` est `loadedDossiers` (`[{ numero, jobs: [{ type, … }], prixTotal? }]`). `nbJobs` ne compte pas les jobs `type === "profils_kits"`. `montant` est la somme des `prixTotal` définis.

- [ ] **Étape 1 : écrire les tests qui échouent.**

```js
const assert = require("node:assert/strict");
const { resumeDossiers } = require("../../client/src/utils/resumeDossiers.js");
describe("resumeDossiers", () => {
  it("compte dossiers, jobs hors profils/kits et montant", () => {
    const r = resumeDossiers([
      { numero: "1", prixTotal: 100.5, jobs: [{ type: "deco" }, { type: "profils_kits" }] },
      { numero: "2", prixTotal: 50, jobs: [{ type: "deco" }, { type: "deco" }] },
    ]);
    assert.deepEqual(r, { nbDossiers: 2, nbJobs: 3, montant: 150.5 });
  });
  it("dossier seulement profils/kits : 0 job, sans planter", () => {
    assert.deepEqual(resumeDossiers([{ numero: "3", jobs: [{ type: "profils_kits" }] }]), { nbDossiers: 1, nbJobs: 0, montant: 0 });
  });
  it("liste vide", () => {
    assert.deepEqual(resumeDossiers([]), { nbDossiers: 0, nbJobs: 0, montant: 0 });
  });
});
```

- [ ] **Étape 2 : lancer les tests.** `npx mocha test/unit/resumeDossiers.test.js` doit échouer avec « Cannot find module ».
- [ ] **Étape 3 : implémenter `resumeDossiers`** dans `client/src/utils/resumeDossiers.js`.
- [ ] **Étape 4 : relancer les tests.** 3 réussis.
- [ ] **Étape 5 : refaire le rendu.** Valeurs de la spec §3 bis, « Zone de recherche : option A ».
  - Une ligne : champ (260 px) et « Rechercher » à gauche ; `<div className="dossier-resume">` à droite, avec « **{nbDossiers}** dossiers chargés | **{nbJobs}** jobs | {formatPrix(montant)} », puis le bouton texte « Voir les dossiers ▾ » / « Masquer la liste ▴ » et le bouton texte « Tout vider », qui appelle `handleClearAll`.
  - Supprimer le bouton corbeille.
  - Nouvel état `const [listeOuverte, setListeOuverte] = useState(false)`. `.dossier-chips` n'est rendu que si `listeOuverte`. Ses étiquettes : numéro seul, sans `(n)`, sans prix, sans icône ✓, croix `handleClearDossier` conservée.
  - Le `<Message>` d'avertissement existant reste sous la ligne, inchangé.
  - Toutes les étiquettes sont vertes aujourd'hui : la mention « dont N à vérifier » de la spec n'a pas de source, ne pas l'ajouter.
- [ ] **Étape 6 : vérifier.** Lancer `npm run lint && npm run build`. Dans Chrome, charger 12 dossiers : une seule ligne ; le résumé indique 12 dossiers et 20 jobs ; la liste se déplie et se replie ; retirer un dossier depuis la liste dépliée met le résumé à jour ; « Tout vider » vide tout.
- [ ] **Étape 7 : commit.** `git add client/src test/unit/resumeDossiers.test.js && git commit -m "feat(formulaire): zone de recherche sur une ligne, resume et liste des dossiers repliable"`

### Task 7 : Bandeau « Ajouter » avec résumé

**Files :**
- Create : `client/src/utils/resumeSelection.js`
- Test : `test/unit/resumeSelection.test.js`
- Modify : `client/src/App.jsx:2285-2320` (bandeau `.submit-bar--sticky`)
- Modify : `client/src/css/index.css:1878-1896`

**Interfaces :**
- Produces : `resumeSelection(jobs, idsSelectionnes, estVisible) → { selectionnes: number, total: number, dossiers: number, montant: number }`.
  - Ne considère que les jobs avec `!j._absorbedBy && estVisible(j)` ; `total` est leur nombre.
  - `selectionnes` : ceux dont `idsSelectionnes.has(j.id)`.
  - `dossiers` : nombre de `dossierNumero` distincts parmi les sélectionnés.
  - `montant` : somme des `prix` définis des sélectionnés.

- [ ] **Étape 1 : écrire les tests qui échouent.**

```js
const assert = require("node:assert/strict");
const { resumeSelection } = require("../../client/src/utils/resumeSelection.js");
const jobs = [
  { id: "a", dossierNumero: "1", prix: 100, surMesure: false },
  { id: "b", dossierNumero: "1", prix: 50, surMesure: true },
  { id: "c", dossierNumero: "2", prix: 25, surMesure: true },
  { id: "d", dossierNumero: "2", prix: 10, _absorbedBy: "c" },
];
const tous = () => true;
describe("resumeSelection", () => {
  it("compte sélection, total, dossiers et montant", () => {
    assert.deepEqual(resumeSelection(jobs, new Set(["a", "c"]), tous), { selectionnes: 2, total: 3, dossiers: 2, montant: 125 });
  });
  it("respecte le filtre sur-mesure", () => {
    assert.deepEqual(resumeSelection(jobs, new Set(["a", "b", "c"]), (j) => j.surMesure), { selectionnes: 2, total: 2, dossiers: 2, montant: 75 });
  });
  it("ignore les jobs absorbés et les prix absents", () => {
    assert.deepEqual(resumeSelection([{ id: "x", dossierNumero: "9" }], new Set(["x"]), tous), { selectionnes: 1, total: 1, dossiers: 1, montant: 0 });
  });
});
```

- [ ] **Étape 2 : lancer les tests.** `npx mocha test/unit/resumeSelection.test.js` doit échouer.
- [ ] **Étape 3 : implémenter `resumeSelection`.**
- [ ] **Étape 4 : relancer les tests.** 3 réussis.
- [ ] **Étape 5 : bandeau.** Spec §3 ter, valeurs exactes.
  - Calculer `resumeSelection(dossierJobs, selectedJobIds, isJobVisible)`. Remplacer `selectedVisibleCount` par `.selectionnes` là où il sert.
  - À gauche : « **N** / T jobs sélectionnés | D dossiers | montant », puis le lien « N lignes à corriger » quand il existe.
  - À droite : bouton secondaire « Tout désélectionner » (vide la sélection visible ; réutiliser le gestionnaire de la case « tout cocher » de l'en-tête) et `primary` « Ajouter à la file », avec « Ajout n/N… » pendant l'envoi.
  - Sans dossier (saisie manuelle) : garder le seul bouton « Ajouter », sans résumé.
  - CSS : largeur du tableau, sans marges négatives ; `bottom` = `-padding-bottom` de `.form-panel` (16 px), avec la marge basse négative correspondante ; fond, liseré et ombres de la spec §3 ter.
- [ ] **Étape 6 : vérifier.** Lancer `npm run lint && npm run build`. Dans Chrome, avec 20 jobs : décocher 3 lignes donne « 17 / 20 » et un montant qui baisse ; cocher « Sur-mesure uniquement » change le total ; rien ne dépasse sous le bandeau au défilement ; mêmes résultats en sombre.
- [ ] **Étape 7 : commit.** `git add client/src test/unit/resumeSelection.test.js && git commit -m "feat(formulaire): bandeau Ajouter avec resume de la selection"`

### Task 8 : File harmonisée

**Files :**
- Modify : `client/src/components/JobsList.jsx:595-600` (`<colgroup>` des deux tableaux), `:552` et `:726` (bouton de suppression)
- Modify : `client/src/css/JobsList.css`

- [ ] **Étape 1 : colonnes.**
  - Même `<colgroup>` pour les deux tableaux, avec les largeurs de la spec §3 bis (File) : 36, 36, 84, 160, 84, 170, visuel en `auto`, 64, 84, 84, 48 et 44 px.
  - `table-layout: fixed`.
  - Cellules de texte : `nowrap` et `text-overflow: ellipsis`. Colonnes de contrôle (poignée, case, action) : `padding: 0`, centrées, sans ellipsis.
- [ ] **Étape 2 : hauteur partagée.** Le premier `.jobs-table-wrapper` prend `flex: 1 1 auto; min-height: 160px`, le second `flex: 0 0 auto; max-height: 28vh`. Chaque conteneur défile seul. Retirer l'`overflow: hidden` de `.jobs-table`, sinon `thead` et `tfoot` ne restent pas collés.
- [ ] **Étape 3 : style.**
  - Police d'interface 13 px ; police des données pour les commandes, formats, plaques et ex ; date en `--text-secondary`.
  - Titres de section en 12 px, graisse 600, casse normale.
  - `thead` collé en haut.
  - `tfoot.sticky-footer` collé en bas, avec le style du bandeau « Ajouter » de la tâche 7.
  - Cadre 1 px, arrondi `--ctl-r` ; marges de la vue 24 px.
- [ ] **Étape 4 : suppression discrète.** Bouton de suppression de ligne en `basic icon` sans couleur, avec la classe `job-delete`. Gris par défaut, `--danger` au survol de la ligne, fond `--danger-soft` et bordure `--danger` au survol du bouton.
- [ ] **Étape 5 : vérifier.** Lancer `npm run lint && npm run build`. Dans Chrome, avec la File simulée (14 en attente et 6 traités, toutes enseignes), en 1280×600 :
  - au moins 8 lignes en attente visibles ;
  - en-têtes des deux tableaux alignés (mêmes `left` de `th`) ;
  - aucune cellule sur deux lignes, aucun « … » près des cases ;
  - barres « Lancer » et « Vider l'historique » visibles sans défiler ;
  - même contrôle en sombre.
- [ ] **Étape 6 : commit.** `git commit -am "style(file): colonnes alignees, une ligne par job, barres d'actions toujours visibles"`

### Task 9 : Vérification d'ensemble, journal et nettoyage

**Files :**
- Modify : `CHANGELOG.md`, `client/src/components/WhatsNew.jsx` (s'il lit le changelog, rien à faire)
- Delete : `client/public/__palettes-essai.js`, `client/public/__file-simulee.js`

- [ ] **Étape 1 : tests.** `npm run test:unit` : tous réussis, y compris les 12 nouveaux.
- [ ] **Étape 2 : passe visuelle complète** (spec §5).
  - Les 6 onglets, en clair et en sombre, en 1920×1080, 1366×768 et 1280×600.
  - Références, Stats, Historique et Sticker : palette, contrôles 28 px, enseignes en texte coloré.
  - Contraste ≥ 4,5:1, en particulier les boutons principaux en sombre et les enseignes sur les lignes grises.
  - Saisie complète d'un job au clavier, en saisie manuelle.
- [ ] **Étape 3 : `CHANGELOG.md`.** Ajouter une rubrique « Interface » sous une nouvelle version : nouvelle palette, en-tête foncé, contrôles unifiés, menus jamais coupés, Dossier API et File réorganisés. Écrire en termes simples, comme les entrées existantes.
- [ ] **Étape 4 : supprimer les deux fichiers d'essai.** Vérifier que `git status` ne les montre plus.
- [ ] **Étape 5 : commit.** `git add -A CHANGELOG.md client && git commit -m "docs(changelog): nouvelle interface acier"`
