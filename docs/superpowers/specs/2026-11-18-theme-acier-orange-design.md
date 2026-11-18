# Thème « Acier + orange discret » et menus déroulants fiables

Date : 18/11/2026 · Statut : validé par l'utilisateur le 18/11/2026

## Intention

L'interface doit faire plus professionnelle, plus ordonnée et plus homogène. Trois problèmes aujourd'hui :

- l'ambiance (gris Zinc, fond pointillé, accent = bleu CASTO) ;
- des boutons et des champs disparates : couleurs Semantic (`color="red|green|orange…"`) qui ignorent le thème, hauteurs et arrondis variables ;
- des menus déroulants coupés ou recouverts quand ils s'ouvrent dans un tableau ou un panneau, surtout dans une petite fenêtre.

La palette a été choisie en direct sur l'application (essai G1, 18/11/2026) : **bleu acier pour la structure, orange discret pour signaler ce qui est actif**.

## Objectifs

1. Palette G1 en clair et en sombre, en-tête foncé.
2. Boutons et champs unifiés : une hauteur, un arrondi, un focus, et 4 rôles de bouton.
3. Plus aucun menu déroulant coupé ou recouvert, quelle que soit la taille de la fenêtre.
4. Une mise en page harmonieuse : espacements, alignements, hauteurs et tailles de texte réguliers, notamment sur le Dossier API (zone de recherche, tableau, bandeau « Ajouter ») et la File.

## Hors périmètre

- Changer l'ordre ou le contenu des champs du formulaire, et les règles métier. Les réorganisations visuelles décidées ici (zone de recherche, prix sur la ligne, bandeaux d'actions, File) sont les seules modifications de mise en page.
- Retravailler en détail Références, Stats, Historique, Sticker et Saisie manuelle : ils reçoivent la palette, les contrôles unifiés, les règles d'harmonie générales et les couleurs d'enseigne, sans maquette dédiée.
- Remplacer Semantic UI.
- Corriger d'autres défauts de mise en page remarqués pendant l'essai, comme le bandeau « Serveur inaccessible » qui recouvre le tableau. Ils sont notés en fin de document pour plus tard.

## Anti-objectifs (échec même si « ça marche »)

- Un menu du formulaire principal qui change de comportement : recherche, sélection, valeur affichée, ouverture au clavier.
- Une couleur d'enseigne (LM, CASTO, BRICO, ECOM) qu'on ne distingue plus de l'accent ou d'un statut.
- Un texte devenu illisible en mode sombre.

## Approches envisagées

**Couleurs, boutons et champs.** Une seule voie raisonnable : remplacer les variables du thème et ajouter une feuille de style qui unifie les composants Semantic. Remplacer Semantic UI serait une refonte sans rapport avec le gain.

**Menus déroulants.**

1. **Améliorer `AutoDropdown`** : à l'ouverture, le menu est posé par-dessus toute la page (position fixe calculée), recalculé au défilement et au redimensionnement, et s'ouvre vers le haut si la place manque. *Retenue par l'utilisateur.* Avantage : les menus gardent leur fonctionnement. Limite : il faut vérifier chaque cas particulier (recherche, multiple).
2. Composant maison basé sur `@floating-ui` : plus fiable, mais nouvelle dépendance et ~18 menus à réécrire. Écartée. Elle reste le recours pour un menu qui résisterait à la voie 1.

## Conception

### 1. Palette G1 (`client/src/css/index.css`)

G1 remplace les blocs `:root` (Zinc) et `[data-theme="dark"]` (Ardoise). Noms de variables existants conservés, plus trois nouveaux : `--on-accent`, `--accent2`, `--accent2-soft`.

| Variable | Clair | Sombre |
|---|---|---|
| `--bg-base` | `#f3f5f7` | `#0e1318` |
| `--bg-surface` / `--surface-bg` | `#e8ecf0` | `#151b22` |
| `--bg-elevated` | `#ffffff` | `#1a222b` |
| `--bg-input` | `#ffffff` | `#0e1318` |
| `--bg-hover` | `rgba(0,0,0,.035)` | `rgba(255,255,255,.04)` |
| `--border-dim` | `#e6e8ec` | `#22252c` |
| `--border-default` / `--border-color` | `#dadde3` | `#2b2f37` |
| `--border-bright` | `#bfc4cc` | `#40454f` |
| `--text-primary` | `#10131a` | `#eceef2` |
| `--text-secondary` | `#4b5260` | `#a2a8b3` |
| `--text-muted` | `#8a909c` | `#666c78` |
| `--accent` (bleu acier) | `#2c5a85` | `#7fa8d1` |
| `--accent-soft` | `rgba(44,90,133,.09)` | `rgba(127,168,209,.13)` |
| `--on-accent` | `#ffffff` | `#0e1318` |
| `--accent2` (orange) | `#d9682a` | `#f0954f` |
| `--accent2-soft` | `rgba(217,104,42,.18)` | `rgba(240,149,79,.2)` |
| `--success` | `#15803d` | `#45b97c` |
| `--danger` | `#b42318` | `#f0645a` |
| `--danger-soft` | `rgba(200,40,30,.08)` | idem |
| `--warning` (ambre, distinct de l'orange) | `#9a6a00` | `#e6c04a` |
| `--warning-soft` | `rgba(180,110,10,.09)` | idem |
| `--table-header-bg` | `#f9fafb` | `#151b22` |
| `--table-header-color` | `#6b7280` | `#666c78` |

**Où va l'orange (et nulle part ailleurs) :** soulignement de l'onglet actif de l'en-tête, pastilles (`.tab-badge`), contour et halo des champs et menus en cours de saisie, contour de focus clavier des boutons.

**Couleurs d'enseigne** (`--color-*`) : nouvelles teintes adoucies, communes aux deux thèmes (voir « Enseigne affichée en texte coloré » en section 3).

**Sobriété :** suppression du fond pointillé et de l'ombre de l'en-tête. Titres de colonnes de tableau en casse normale, police d'interface, graisse 600, 12 px.

### 2. En-tête foncé

Fond = `color-mix(in srgb, var(--accent) 30%, #0b0d12)` en clair. En sombre, l'en-tête garde `--bg-elevated`. Logo inversé en blanc. Onglets en blanc à 62 %, l'actif en blanc plein avec soulignement orange de 3 px. Boutons d'action (thème, Fichiers, Config) translucides, avec un contour blanc à 18 %.

### 3. Boutons et champs unifiés

Nouvelle feuille `client/src/css/controls.css`, importée après `index.css`. Les valeurs de ce document font foi. Le prototype (`client/public/__palettes-essai.js`, bloc `data-ordre`) n'en contient qu'une partie : les réglages faits ensuite en direct (harmonie, File, bandeaux, enseignes, cases, interrupteurs) ont été injectés dans la page et ne sont décrits qu'ici.

- **Dimensions (choisies en direct le 18/11/2026) :** variables `--ctl-h: 28px`, `--ctl-h-sm: 24px` (`mini`/`compact`, boutons des lignes de tableau), `--ctl-px: 12px` (marge intérieure horizontale), `--ctl-r: 3px` (arrondi ; 4 px choisi d’abord, réduit à 3 px après essai). Boutons, champs et menus déroulants fermés partagent la même hauteur et le même arrondi, pour s'aligner sur une même ligne. Menus ouverts : même arrondi de 3 px. Étiquettes Semantic (`.ui.label`, dont les dossiers chargés) et pastilles : 3 px aussi, plus de formes pilule.
- **Boutons :** hauteur `--ctl-h`, arrondi `--ctl-r`, graisse 500, icône et texte alignés avec un écart de 6 px, carrés (largeur = hauteur) pour les boutons à icône seule.
- **4 rôles,** exprimés par les props Semantic existantes :
  - *principal* = `primary` (fond bleu acier) ;
  - *validation* = `positive` (fond vert) ;
  - *danger* = `negative` (contour rouge, plein au survol) ;
  - *secondaire* = sans couleur (fond blanc, bordure neutre).
- **Remplacement des `color=` sur les `<Button>`** : `green` → `positive` ; `red` → `negative` ; `black` et `vk` → `primary` ; `blue`, `teal` et `grey` → secondaire. Les `<Icon color>`, `<Label color>` et `<Segment color>` gardent leur prop, mais leurs couleurs sont rattachées aux variables (étiquettes au fond teinté, arrondi 3 px). Inventaire actuel : ~30 occurrences dans `App.jsx`, `Config.jsx`, `DossierAutocomplete.jsx`, `InfoStockModal.jsx`, `JobsList.jsx`, `ReferencesView.jsx` et `SurMesurePanneau.jsx`.
- **Champs** (`.ui.input`, champs de `.ui.form`, `.ui.selection.dropdown`) : hauteur `--ctl-h`, arrondi `--ctl-r`, bordure `--border-default`, fond `--bg-input`. Bordure `--border-bright` au survol, bordure orange et halo `--accent2-soft` au focus.
- **Menus déroulants fermés :** hauteur exacte `--ctl-h`, avec des marges verticales calculées (`(--ctl-h − 2px − 1.2em) / 2`) et une flèche centrée verticalement. Le champ de recherche intérieur (`.ui.search.selection.dropdown > input.search`) est **exclu** des règles de champ : pas de bordure, pas de fond, pas de hauteur minimale. Sinon sa bordure se superpose à celle du menu (double contour constaté pendant l'essai).
- **Cases à cocher** (validé en direct le 18/11/2026), hors `toggle` et `slider` :
  - carré de 15 px, arrondi 2 px ;
  - vide : fond `--bg-input`, bordure 1 px `--border-bright`, bordure `--accent` au survol ;
  - cochée : fond et bordure `--accent`, coche en SVG (trait 1,8 px, bouts arrondis, couleur `--on-accent`) à la place du caractère de la police « Checkbox », trop épais ;
  - partielle (`indeterminate`) : tiret SVG dans le même style ;
  - focus clavier : bordure `--accent2` et halo `--accent2-soft` ;
  - les cases `fitted` gardent leur alignement (`padding-left` de 15 px).
- **Interrupteurs** (`.ui.toggle.checkbox`, ex. « Générer stickers seulement ») : 28 × 16 px au lieu de 56 × 24 environ (taille Semantic). Rail arrondi gris (`--border-bright`), bleu acier (`--accent`) une fois activé. Pastille blanche de 12 px avec une ombre légère, qui glisse en 0,15 s. Libellé à 8 px du rail, 13 px. Halo `--accent2-soft` au focus clavier. Validé en direct le 18/11/2026.
- **Enseigne affichée en texte coloré, sans badge** (18/11/2026 : comparaison directe dans la File, après trois essais de badges pâle, plein et teinté, tous jugés plus lourds). Partout où une enseigne est nommée : Formulaire (lignes de dossier), File (colonne Clients), Historique, Stats.
  - Texte seul : pas de fond, pas de bordure, pas de largeur fixe. 12 px, graisse 700, espacement des lettres 0,02 em, aligné à gauche.
  - **Couleurs d'enseigne adoucies** (option A, choisie le 18/11/2026 après un essai de teintes vives jugées trop criardes ; écartées : « profondes » et « texte neutre + point de couleur ») : LM `#3d7a52` (vert sauge), CASTO `#3a5ea6` (bleu ardoise, distinct du bleu acier de l'accent), ECOM `#2e7770` (sarcelle douce), BRICO `#a65b34` (terre cuite). Elles deviennent `--color-lm`, `--color-casto`, `--color-ecom` et `--color-brico`, communes aux deux thèmes.
  - Couleur du texte : en clair, `color-mix(in srgb, var(--color-x) 90%, #000)` → **4,8 à 5,9:1**, mesuré sur les lignes grises (sans cet assombrissement : 4,1 à 5,1, sous le seuil de 4,5). En sombre, `color-mix(… 55%, #fff)` → **7,1 à 7,8:1**. Liseré de la File : `--color-x` pur en clair, `color-mix(… 75%, #fff)` en sombre.
  - **Le liseré gauche de 3 px**, en couleur pleine sur les lignes de la File, reste le repère vif de l'enseigne.
  - Les classes `.client-badge` / `.client-badge--x` (Formulaire, Historique) et `.stats-client-badge` (Stats) sont gardées comme points d'accroche, mais rendues en texte coloré. Dans la File, le nom du client (aujourd'hui du texte brut dans la cellule) prend le même style.
  - **Point d'attention :** BRICO (`#a65b34`, terre cuite) et l'orange d'accent (`#d9682a`) sont de teinte voisine, mais jamais côte à côte, et l'accent n'est qu'un soulignement, une pastille ronde ou un halo. À revoir si l'utilisateur les confond à l'usage.
- **Pastille « N profils/kits »** (`.pk-toggle-badge`) : n'est plus noire et en majuscules. Fond `--accent-soft`, texte `--accent`, bordure accent à 22 %, en minuscules, 11,5 px graisse 600, hauteur 22 px, arrondi 3 px. Fond et bordure un peu plus soutenus au survol.
- **Couleurs codées en dur** dans `index.css`, `JobsList.css` et `ReferencesView.css` (~30) : remplacées par la variable correspondante quand il en existe une.

### 3 bis. Harmonie : espacements, alignements, hauteurs

Validé en direct sur le Dossier API le 18/11/2026. Règles générales, à appliquer à tous les écrans :

- **Grille d'espacement** : uniquement 4, 8, 12, 16 et 24 px (variables `--s-*` existantes, plus un `--s-12` à ajouter). Plus de 13, 14 ni 26 px.
- **Échelle de texte** :
  - 12 px pour les métadonnées, titres de colonnes, filtres et prix ;
  - 13 px pour le contenu et les champs ;
  - 14 à 15 px pour les chiffres clés.
  - Plus de textes à 9 ou 10 px, ni de petites majuscules espacées (« SUR-MESURE UNIQUEMENT », en-têtes de groupes, pastilles).
- **Une largeur par écran** : tout ce qui est empilé (onglets de mode, zone de recherche, filtre, tableau, bandeau d'action) s'aligne sur les mêmes bords gauche et droit. Exemple : `.form-panel--wide .mode-tabs` perd son `max-width` centré, qui la décalait de 350 px par rapport au tableau.
- **Centrage vertical** : dans une ligne de tableau, case à cocher, menus, champs et pastilles ont le même axe central (écart ≤ 1 px mesuré). Les anciennes compensations sont supprimées : `padding-top: 13px` de la 1re colonne, `margin-top: 9px` de `.toggle-chip`, `vertical-align: top` des cellules.

**Tableau du Dossier API (`.dossier-table`) :**

- **Lignes de job** : cellules de 6 px × 8 px (12 px à gauche de la 1re colonne), centrées verticalement, hauteur uniforme d'environ 41 px, au lieu de 59 px avec le prix dessous.
- **Prix du visuel** : affiché sur la même ligne, à droite du menu Visuel, dans une zone de 84 px alignée à droite (police des données, 12 px, `--text-secondary`), au lieu d'une ligne de 9 px sous le menu. L'implémenteur ajoute un en-tête de colonne « Prix ».
- **Lignes de groupe** (« Dossier 169850 — 3 jobs · 1 004,36 € ») : fond `--bg-surface`, bordure haute `--border-default`, 12 px, éléments espacés de 8 px, une seule ligne (`nowrap`), même hauteur que les lignes de job. Ne pas passer la cellule en `display: flex` : elle utilise `colSpan`.
- **Pastilles PB / TM** (`.toggle-chip`) : 22 px de haut, 11 px, arrondi 3 px, centrées.
- **En-têtes de colonnes** : 8 px de marge intérieure, 12 px, centrés verticalement.

**Partie haute du Dossier API :**

- Onglets de mode → zone de recherche : 12 px. Zone de recherche → filtre : 12 px. Filtre → tableau : 8 px.
- **Zone de recherche : option A « Résumé + liste repliable »** (choisie le 18/11/2026 parmi 3 maquettes ; écartées : étiquettes compactes sur une ligne, et retrait depuis le tableau). Les étiquettes vertes répétaient les lignes de dossier du tableau.
  - **Une seule ligne.** À gauche : champ N° Dossier(s) (260 px) et « Rechercher ». À droite : le résumé « **12** dossiers chargés | **20** jobs | **8 182,85 €** » (chiffres en `--text-primary`, montant en police des données et en gras, séparateurs verticaux `--border-bright`), puis deux boutons texte, « Voir les dossiers ▾ / Masquer la liste ▴ » (`--accent`) et « Tout vider » (`--text-secondary`, rouge au survol).
  - La corbeille rouge à côté de « Rechercher » disparaît : « Tout vider » la remplace, avec la même action.
  - **Liste repliée par défaut.** Dépliée, elle s'affiche sous la ligne, séparée par un trait `--border-dim`. Les étiquettes y sont compactes : numéro de dossier seul, en police des données 12 px, fond `--bg-elevated`, bordure `--border-default`, 24 px de haut, sans icône ✓, croix discrète qui passe au rouge au survol. Une étiquette en erreur ou en avertissement (non verte aujourd'hui) garde sa bordure et son texte `--warning` : un problème reste visible sans déplier, car le résumé l'indique par « dont N à vérifier » en `--warning`. L'implémenteur ajoute cette mention, absente de la maquette.
  - **Chiffres du résumé** : nombre de dossiers chargés, nombre de lignes de job du tableau (pas la somme des « (n) » des étiquettes, qui comptent aussi les profils/kits), et montant total des dossiers chargés.
- **Cadre de la zone de recherche** (`.ui.grey.segment.dossier-autocomplete`) : bordure 1 px `--border-default` sur les 4 côtés, au lieu du bord haut gris de 2 px de Semantic. Arrondi `--ctl-r`, fond `--bg-surface`, marge intérieure 8 px × 12 px, éléments espacés de 12 px.
- **Filtre « Sur-mesure uniquement »** : 12 px, casse normale, `--text-secondary`.

**File (`JobsList`, `.jobs-table`)**, validée en direct le 18/11/2026 avec une file simulée de 14 jobs en attente et 6 traités :

- **Hauteur partagée** : la file en attente prend toute la place disponible (`flex: 1`, au moins 160 px). Les traités sont limités à 28 % de la hauteur de la fenêtre. Avant, les deux zones se partageaient la hauteur à parts égales : 3 jobs en attente visibles dans une fenêtre basse.
- **Mêmes colonnes dans les deux tableaux**, en `table-layout: fixed`, avec des largeurs sur le `<colgroup>` :
  - poignée 36 px, case 36 px ;
  - client 84 px, date 160 px, commande 84 px, ville 170 px ;
  - visuel : le reste ;
  - vernis 64 px, format 84 px, plaque 84 px, ex 48 px, action 44 px.
  - Chaque cellule de texte tient sur une ligne et coupe le texte trop long par « … ». Exception : les colonnes de contrôle (poignée, case, action) n'ont ni marge intérieure, ni coupure, et sont centrées. Sinon, la poignée (23 px) et la case (25 px) débordent de l'espace utile et affichent « … » (constaté pendant l'essai). Plus de dates ni de villes sur deux lignes : les lignes passent d'environ 43 px à environ 31 px.
- **Typographie** : police d'interface 13 px pour le texte. Police des données seulement pour les commandes, formats, plaques et ex. Date en `--text-secondary`, chiffres à largeur fixe.
- **Client** : nom en gras, dans la couleur de l'enseigne (`--color-lm`, etc., via `data-client` sur la ligne), en plus du liseré gauche de 3 px.
- **Suppression d'une ligne** : croix grise discrète, sans cadre. Elle passe au rouge au survol de la ligne, avec un fond `--danger-soft` et une bordure rouge au survol du bouton. Plus de 14 cadres rouges empilés.
- **Titres de section** (« File en attente (14) », « Traités (6) ») : 12 px, graisse 600, casse normale. Les traités en `--text-secondary`.
- **En-têtes de colonnes** fixés en haut au défilement (`thead` sticky). Les tableaux ne doivent pas être en `overflow: hidden`, sinon `sticky` ne fonctionne pas.
- **Barres d'actions** (`tfoot.sticky-footer` : « Lancer en session / hors session / Parallèle », « Vider l'historique ») : collées en bas de leur tableau, toujours visibles. Même style que le bandeau « Ajouter » : fond teinté, liseré accent de 2 px, ombre double.
- **Cadre des tableaux** : bordure 1 px `--border-default`, arrondi `--ctl-r`. Marges latérales de la vue : 24 px.

### 3 ter. Bandeau « Ajouter » du Dossier API (`.submit-bar--sticky`)

Validé en direct le 18/11/2026.

- **Largeur et position :** même largeur que le tableau (plus de marges négatives), collé tout en bas de la zone qui défile. `bottom` compense le `padding-bottom` du `.form-panel`, pour que rien ne dépasse sous le bandeau. Coins arrondis `--ctl-r` en haut seulement, pas de bordure basse.
- **Contraste :**
  - fond `color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))` ;
  - bordure `--border-bright` ;
  - liseré haut de 2 px en `--accent` ;
  - ombre double vers le haut : en clair, `0 -2px 6px rgba(16,19,26,.10), 0 -16px 36px -8px rgba(16,19,26,.38)` ; en sombre, `rgba(0,0,0,.4)` et `rgba(0,0,0,.7)`.
- **Contenu, de gauche à droite :**
  - le résumé « **N** / T jobs sélectionnés | D dossiers | montant € » : N en `--accent` et plus grand, montant en police des données et en gras, séparateurs verticaux `--border-bright` ;
  - le lien « N lignes à corriger », quand il y a lieu ;
  - à droite, « Tout désélectionner » (secondaire), puis « Ajouter à la file » (principal ; pendant l'envoi : « Ajout n/N… »).
- **Données :** le résumé est calculé dans `App.jsx` à partir de l'état déjà présent : jobs sélectionnés visibles, nombre de dossiers chargés, somme des prix des jobs sélectionnés. Dans la maquette, le montant était la somme des dossiers entiers : l'implémenteur prend la somme des jobs sélectionnés, plus juste. « Tout désélectionner » réutilise la case « tout cocher » de l'en-tête du tableau.

### 4. Menus déroulants (`client/src/components/AutoDropdown.jsx`)

- À l'ouverture, le menu `.menu` de l'instance passe en `position: fixed` avec `top`, `left`, `min-width` et `max-height` calculés à partir du déclencheur et de la fenêtre, et un `z-index` au-dessus des tableaux et des barres fixes, mais sous les modales (à vérifier : les menus de `Config` sont dans une modale).
- Ouverture vers le haut si la place sous le déclencheur est inférieure à la hauteur utile et qu'il y en a plus au-dessus (même règle qu'aujourd'hui, mais calculée sur la fenêtre et non plus sur les conteneurs).
- Le calcul est refait au défilement (n'importe quel ancêtre, écoute en capture) et au redimensionnement, tant que le menu est ouvert. Les écouteurs sont retirés à la fermeture.
- Largeur : au moins celle du déclencheur, plafonnée par la largeur de la fenêtre moins 16 px. Le menu est recalé horizontalement s'il dépasse à droite.
- `Config.jsx` (2 menus) et `JobsList.jsx` (1 menu, `upward` forcé) importent `AutoDropdown` au lieu du `Dropdown` de Semantic. Les règles `.dossier-table .ui.dropdown .menu` (`min-width 300`, `max-width 420`, `z-index 1100`) sont reprises ou retirées pour ne pas contredire le calcul.
- Les menus à recherche (`search`) et multiples (`multiple`) sont vérifiés un par un.

### 5. Vérification

Dans Chrome, sur l'app réelle (dossier de test 169853), en clair et en sombre, à trois tailles de fenêtre : 1920×1080, 1366×768, 1280×600.

- Chaque menu de l'inventaire (`App.jsx` ×7, `Config` ×2, `FormatDropdown`, `FormatTauro`, `JobsList`, `StickerView` ×3, `SurMesurePanneau`, `TeinteMasseDropdown`, `VisuelDropdown`) s'ouvre entier, au-dessus de tout, et reste collé à son champ si l'on fait défiler.
- Un formulaire complet est rempli au clavier.
- Contraste : textes ≥ 4,5:1 sur leur fond dans les deux modes. Point connu : en sombre, le texte des boutons principaux doit être `--on-accent` (foncé) et non blanc ; « Lancer en session » était blanc sur bleu clair pendant l'essai.
- File avec au moins 14 jobs en attente, toutes enseignes : colonnes alignées entre « en attente » et « traités », aucune cellule sur deux lignes, barres d'actions visibles sans défiler.
- Dossier API avec au moins 20 jobs : axes verticaux alignés à 1 px près dans une ligne, bandeau « Ajouter » sans rien qui dépasse dessous, résumé exact après avoir coché ou décoché des lignes.
- `npm run lint` et `npm run build` passent. Ne pas lancer `npm run format`.

## Laissé à l'implémenteur

- L'organisation exacte de `controls.css` et la valeur du `z-index` des menus.
- Le choix de la variable pour chaque couleur codée en dur sans équivalent évident.

## Mise en œuvre

- Travail directement sur la branche `dev` (demande de l'utilisateur), pas sur une branche de fonctionnalité.
- `feat/sessions-tauro` a été fusionnée dans `dev` le 18/11/2026, avant ce travail. `ApercuSessionTauro.jsx` et `AlerteRepriseArret.jsx` sont donc dans le périmètre : rôles de bouton, variables de couleur et `AutoDropdown`.
- Les fichiers d'essai `client/public/__palettes-essai.js` et `client/public/__file-simulee.js` sont supprimés à la fin. Ils ne sont jamais commités. La file simulée (fetch intercepté, écritures bloquées) peut resservir pour la vérification, en le disant.
- Entrée dans `CHANGELOG.md` (rubrique interface). Le cahier des charges n'est pas concerné : aucune règle métier ni sortie ne change.

## Défauts notés pour plus tard (hors périmètre)

- Le bandeau « Serveur inaccessible » se pose par-dessus le tableau du formulaire au lieu de le repousser.
