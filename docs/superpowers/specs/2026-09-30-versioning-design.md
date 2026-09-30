# Versioning de DecoGestion — conception

Date : 30/09/2026 · Statut : validé en discussion, à relire

## Contexte

- La version vit uniquement dans `package.json` (`2.3.0`) et ne bouge quasiment jamais. Il n'y a ni tag git, ni CHANGELOG, ni release GitHub.
- `server/src/checkVersion.js` compare la version locale au `package.json` de `main` sur GitHub par **égalité stricte**. Or `main` est en retard sur `dev` et ne reçoit des mises à jour que ponctuellement, par PR. Et comme la comparaison est une égalité stricte, un poste en avance affiche quand même « Mise à jour disponible ».
- `client/src/components/Header.jsx` extrait la version d'un *message* en concaténant ses chiffres. « Mise à jour disponible: 2.4.0 (actuelle: 2.3.0) » s'affiche donc `v2.4.0.2.3.0`.
- Chaque Deco enregistre déjà `app_version` (`jobsController.js`, schéma `Deco.js`).
- Les commits suivent la convention `type(scope): message` (`feat`, `fix`, `perf`, `chore`…).
- **Mise en prod par copie de fichiers** : le poste de prod n'a pas de `.git`.

## Objectifs

1. Publier des releases avec une seule commande : calcul de la version, CHANGELOG en français, tag, release GitHub.
2. Afficher les nouveautés dans l'appli (fenêtre « Quoi de neuf »).
3. Prévenir quand une nouvelle version est disponible, à partir des releases GitHub.
4. Tracer la version **et le commit** qui ont produit chaque Deco.

Hors périmètre : déploiement automatique sur le poste de prod, pré-versions (beta/rc), signature des tags.

## Décisions

| Sujet | Décision |
|---|---|
| Outil | Script maison sans dépendance (`scripts/release.js`) et `gh` CLI |
| Branches | Release taguée sur `dev` ; `main` est avancée en **fast-forward** jusqu'au tag (`main` = dernière version livrée) |
| Tags | `vX.Y.Z` annotés |
| Version de référence pour l'alerte | Dernière release GitHub (`releases/latest`) |
| Build | Métadonnées inscrites dans `build-info.json` au build (pas de `.git` en prod) |

## 1. Release — `npm run release`

Exécutée depuis le poste de dev, sur `dev`.

**Arguments** : `npm run release [-- major|minor|patch] [--dry-run] [--yes]`

**Déroulé :**

1. **Vérifications** (arrêt avec un message explicite en cas d'échec) :
   - branche courante = `dev` ;
   - aucune modification en cours ;
   - `dev` à jour avec `origin/dev` (`git fetch` puis comparaison) ;
   - `gh auth status` OK ;
   - `origin/main` ancêtre de `dev`, pour que le fast-forward soit possible.
2. **Commits à publier** : `git log <dernier tag vX.Y.Z>..HEAD`. S'il n'y a aucun tag, voir « Amorçage ».
3. **Niveau d'incrément** (sauf si un niveau est passé en argument) :
   - `BREAKING CHANGE:` dans le corps ou `type!:` : **major** ;
   - au moins un `feat` : **minor** ;
   - au moins un `fix` ou `perf` : **patch** ;
   - uniquement d'autres types : pas de release (message, puis sortie avec le code 0).
4. **Aperçu** : version courante → nouvelle version, et entrée du CHANGELOG. Confirmation `o/N`, sauf avec `--yes`. `--dry-run` s'arrête ici sans rien écrire.
5. **Écritures** :
   - `version` dans `package.json`, `package-lock.json` (racine), `client/package.json` et `client/package-lock.json` ;
   - nouvelle entrée ajoutée **en tête** de `CHANGELOG.md` (créé s'il n'existe pas).
6. **Git** :
   - `git commit -m "chore(release): vX.Y.Z"` ;
   - `git tag -a vX.Y.Z -m "vX.Y.Z"` ;
   - `git push origin dev` puis `git push origin vX.Y.Z` ;
   - `git push origin vX.Y.Z:main`, qui échoue si `main` a divergé : jamais de `--force`.
7. **GitHub** : `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes temporaires>`.

**Reprise après échec** : chaque étape est vérifiée. Si l'une échoue, le script indique ce qui est déjà fait (commit local, tag, push) et la commande exacte pour reprendre ou annuler (`git tag -d`, `git reset --soft HEAD~1`). Il n'annule jamais rien automatiquement une fois un push fait.

### Format du CHANGELOG

```markdown
# Changelog

## [2.4.0] - 2026-09-30

### ⚠️ Changements majeurs
- **scope** : message

### Nouveautés
- **queue** : pilotage de la file de jobs depuis la JobsList

### Corrections
- **gamesys** : ne relie plus l'entête devis par endv_seq = dos_seq

### Performances
- **startup** : enchaîne les tâches Gamesys dès la fin du démarrage
```

- Une section n'apparaît que si elle contient au moins une entrée. Le scope est facultatif : sans scope, on écrit `- message`.
- Les commits `chore(release)` et les merges sont exclus.
- La première lettre du message est conservée telle quelle.

### Amorçage

À faire une seule fois, avec `npm run release -- --init 2.3.0`. La commande affiche chaque action et demande confirmation.

1. **Réaligner `main` sur `dev`** : `main` contient le commit de merge `658703a` (PR #1 `dev` → `main`, 25/09/2026), absent de `dev`. Le fast-forward est donc impossible (vérifié le 30/09/2026). On fait `git merge origin/main` sur `dev` : le contenu est déjà dans `dev`, seul l'historique est rejoint. Puis `git push origin dev`. Ensuite, `origin/main` est un ancêtre de `dev`.
2. **Tag de référence** : aucun tag n'existe. On pose le tag annoté `v2.3.0` sur `9dfe1bf` (18/11/2025), le commit où `package.json` est passé à `2.3.0`, puis on le pousse.
3. **Release GitHub `v2.3.0`** avec la note « Version de référence ».

La première vraie release reprend donc tous les commits depuis `9dfe1bf`.

## 2. Métadonnées de build et version dans l'appli

### `scripts/writeBuildInfo.js`

- Il est exécuté au début de `npm run build`.
- Il écrit `build-info.json` à la racine : `{ version, commit, branch, buildDate, dirty }`. `commit` est le sha court ; `dirty` vaut `true` s'il y a des modifications non commitées au moment du build.
- Sans git, `commit` et `branch` valent `null`.
- `build-info.json` est ajouté au `.gitignore` et copié en prod avec le reste.

### `appState.loadAppVersion()`

- Priorité : `build-info.json`, sinon `package.json` + `git rev-parse --short HEAD` (en dev), sinon `commit: null`.
- Résultat dans `state.app = { version, commit, buildDate }`. `state.appVersion` est conservé comme alias, pour les usages existants.

### Traçabilité

- `Deco.js` gagne un champ `app_commit: { type: String }`.
- La sauvegarde Deco (`jobsController.js`, là où `app_version` est déjà renseigné) ajoute `app_commit: state.app.commit`.
- Aucune migration : les anciennes entrées n'ont simplement pas ce champ.

## 3. Alerte de mise à jour

`server/src/checkVersion.js` est réécrit :

- Il appelle `GET https://api.github.com/repos/Weedomeker/decoGestion/releases/latest` (sans authentification, 60 req/h) et en tire `{ version: tag_name sans "v", url: html_url, publishedAt }`.
- La comparaison de versions se fait via une fonction `compareVersions(a, b)` (major, minor, patch numériques). `updateAvailable = compareVersions(latest, current) > 0`.
- Le résultat est mis en cache **1 h** en mémoire. En cas d'échec (hors ligne, 404, quota), il renvoie `latest: null` et `updateAvailable: false`, avec un seul `logger.warn` par période de cache.
- Le message du log de démarrage est conservé et s'appuie sur ce résultat.

### API

- `GET /version` renvoie `{ version, commit, buildDate, latest: { version, url, publishedAt } | null, updateAvailable }`.
- `GET /process` garde son champ `version` (message) pour rester compatible.

### Header

- La version est lue depuis `/version` (dans `App.jsx`), à la place de l'analyse du message de `/process`.
- Affichage `v2.4.0`. Au survol : `commit abc1234 · build du 30/09/2026 14:02`.
- Si `updateAvailable` est vrai, un badge « Mise à jour 2.5.0 » s'affiche, avec un lien vers la release GitHub (nouvel onglet).
- Un clic sur la version ouvre « Quoi de neuf ».

## 4. « Quoi de neuf »

### Serveur

- `server/src/services/changelogService.js` : `parseChangelog(markdown)` renvoie `[{ version, date, sections: { [titre]: string[] } }]`, de la plus récente à la plus ancienne. Le fichier `CHANGELOG.md` est lu à la demande.
- `GET /changelog?limit=N` renvoie ce tableau (`limit` 5 par défaut). Si le fichier est absent ou illisible, il renvoie `[]`.

### Client — `components/WhatsNew.jsx`

- C'est une modale Semantic UI, dans le style de `Config.jsx`. Elle affiche une section par version (`v2.4.0 — 30/09/2026`), puis les sous-titres des sections, puis une puce par entrée (scope en gras).
- **Ouverture automatique** : `localStorage.lastSeenVersion`, dont les lectures et écritures sont protégées par try/catch.
  - Si la valeur est absente (première visite), on enregistre la version courante et la fenêtre ne s'ouvre pas.
  - Si la version courante est plus récente que `lastSeenVersion`, la fenêtre s'ouvre avec les versions comprises entre les deux (bornes : strictement plus récente que `lastSeenVersion`, inférieure ou égale à la version courante). Le bouton « OK » met `lastSeenVersion` à jour.
- **Ouverture manuelle** : un clic sur la version dans le Header affiche les 5 dernières versions.

## Fichiers

| Nouveau | Rôle |
|---|---|
| `scripts/release.js` | CLI de release (Git/gh) |
| `scripts/lib/releaseLib.js` | Logique pure : analyse des commits, incrément, `compareVersions`, rendu d'une entrée du CHANGELOG |
| `scripts/writeBuildInfo.js` | Génère `build-info.json` |
| `server/src/services/changelogService.js` | Lecture et analyse de `CHANGELOG.md` |
| `client/src/components/WhatsNew.jsx` | Fenêtre « Quoi de neuf » |
| `CHANGELOG.md` | Créé à la première release |

| Modifié | Changement |
|---|---|
| `package.json` | Scripts `release` ; `build` précédé de `writeBuildInfo` |
| `.gitignore` | `build-info.json` |
| `server/src/checkVersion.js` | Releases GitHub, `compareVersions`, cache |
| `server/src/services/appState.js` | `loadAppVersion` avec `build-info.json` et `state.app` |
| `server/src/controllers/systemController.js` + routes | `GET /version`, `GET /changelog` |
| `server/src/models/Deco.js`, `jobsController.js` | `app_commit` |
| `client/src/App.jsx`, `components/Header.jsx` | Version via `/version`, badge de mise à jour, ouverture de WhatsNew |

`compareVersions` est défini dans `scripts/lib/releaseLib.js` et réutilisé par `checkVersion.js` et `changelogService.js`, pour n'avoir qu'une seule implémentation.

## Tests (mocha, `test/unit/`)

- `releaseLib` :
  - analyse des commits : `feat`, `fix`, `perf`, `type(scope)!:`, `BREAKING CHANGE:` dans le corps, types ignorés, exclusion de `chore(release)` et des merges ;
  - calcul de l'incrément et de la nouvelle version ;
  - `compareVersions` ;
  - rendu d'une entrée du CHANGELOG (sections vides omises, scope facultatif).
- `changelogService` : analyse d'un CHANGELOG multi-versions ; l'aller-retour rendu → analyse redonne les mêmes données ; fichier absent → `[]`.
- `checkVersion` (`fetch` simulé) : mise à jour disponible, poste en avance (pas d'alerte), cache 1 h, erreur réseau → `latest: null`.
- `loadAppVersion` : avec `build-info.json`, et sans (repli sur `package.json`).
- Vérification manuelle : `npm run release -- --dry-run` sur le vrai dépôt, `npm run build` qui doit produire `build-info.json`, puis contrôle du Header et de la fenêtre dans l'appli en dev.
