# Versioning DecoGestion — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** publier des releases versionnées (CHANGELOG français, tag, release GitHub), afficher version, nouveautés et alerte de mise à jour dans l'appli, et tracer le commit de chaque Deco.

**Architecture :**
- Une logique pure et testée : `server/src/utils/version.js`, `scripts/lib/releaseLib.js` et `server/src/services/changelogService.js`.
- Des CLI minces qui appellent git et gh : `scripts/release.js` et `scripts/writeBuildInfo.js`.
- Le serveur lit `build-info.json`, écrit au build, et expose `/version` et `/changelog`.
- Le client affiche la version, le badge de mise à jour et la modale « Quoi de neuf ».

**Tech Stack :** Node 22 (CommonJS), Express, Mongoose, `node-fetch@2` (déjà présent), mocha, chai et sinon, React 18, semantic-ui-react, `gh` CLI.

**Spec :** `docs/superpowers/specs/2026-09-30-versioning-design.md`

## Global Constraints

- Aucune nouvelle dépendance npm.
- Tags `vX.Y.Z` annotés. Release taguée sur `dev`, puis `main` avancée en **fast-forward uniquement** : jamais de `--force`.
- Tous les textes visibles (CHANGELOG, messages CLI, UI) sont en **français**, avec les accents.
- Titres de sections du CHANGELOG, dans cet ordre : `⚠️ Changements majeurs`, `Nouveautés`, `Corrections`, `Performances`.
- Incrément : breaking → major ; `feat` → minor ; `fix`/`perf` → patch ; sinon pas de release.
- Version de référence de l'alerte : `https://api.github.com/repos/Weedomeker/decoGestion/releases/latest`, avec un cache de **1 h**.
- `build-info.json` à la racine, ignoré par git, au format `{ version, commit, branch, buildDate, dirty }`.
- Tests : `npm run test:unit`, qui tourne avec `NODE_ENV=development`. Ne jamais requêter DecoKin (prod).
- Ne pas lancer `npm run format` : il reformate environ 70 fichiers sans rapport avec ce travail.
- Style du code : CommonJS côté serveur et scripts, guillemets doubles, commentaires en français, même densité que le code voisin.

**Écart assumé par rapport au spec :**
- `compareVersions` vit dans `server/src/utils/version.js` et non dans `scripts/lib/releaseLib.js`. Le poste de prod reçoit `server/`, mais peut-être pas `scripts/`. `releaseLib` le réimporte.
- Les entrées analysées du CHANGELOG sont `{ scope, text }` et non des chaînes, pour que le client n'ait pas à réanalyser le markdown.
- En `NODE_ENV=development`, `loadAppVersion` ignore `build-info.json`. Sinon, un build local ancien afficherait un commit périmé pendant le dev. La priorité à `build-info.json` s'applique hors dev, donc en prod.

## Review Focus

1. **Poste en avance sur la dernière release** (le poste de dev par exemple) : aucun badge « Mise à jour ». Testé dans la Task 4.
2. **GitHub injoignable, 404 ou quota dépassé** : l'appli démarre, `/version` répond avec `latest: null`, et un seul warn est émis par heure. Testé dans la Task 4.
3. **Commits non conventionnels** (36 depuis la 2.3.0, par exemple « update decompte stock » ou les merges) : ils sont ignorés sans planter et n'apparaissent pas dans le CHANGELOG. Testé dans la Task 2.
4. **CHANGELOG absent, vide ou avec des lignes inattendues** : `/changelog` renvoie `[]` ou ignore les lignes inconnues, la modale ne s'ouvre pas et rien ne plante. Testé dans la Task 3.
5. **`npm run release` avec des modifications en cours, `dev` pas à jour ou `main` divergente** : refus **avant toute écriture**. Vérifié en manuel dans la Task 7 (étape « refus sur arbre sale »).

---

### Task 1 : utilitaires de version (`compareVersions`, `bumpVersion`)

**Files :**
- Create : `server/src/utils/version.js`
- Test : `test/unit/version.test.js`

**Interfaces :**
- Produces :
  - `parseVersion(v: string) → [number, number, number] | null`. Accepte un préfixe `v` ; renvoie `null` si ce n'est pas `X.Y.Z`.
  - `compareVersions(a: string, b: string) → -1 | 0 | 1`. Une version invalide vaut `0.0.0`.
  - `bumpVersion(v: string, level: "major"|"minor"|"patch") → string`. Lève une `Error` si `v` est invalide ou si `level` est inconnu.

- [ ] **Step 1 : écrire le test qui échoue**

```js
// test/unit/version.test.js
const { expect } = require("chai");
const { parseVersion, compareVersions, bumpVersion } = require("../../server/src/utils/version");

describe("utils/version", () => {
  describe("parseVersion()", () => {
    it("accepte X.Y.Z avec ou sans préfixe v", () => {
      expect(parseVersion("2.3.0")).to.deep.equal([2, 3, 0]);
      expect(parseVersion("v10.0.12")).to.deep.equal([10, 0, 12]);
    });

    it("renvoie null pour une version invalide", () => {
      expect(parseVersion("2.3")).to.equal(null);
      expect(parseVersion("abc")).to.equal(null);
      expect(parseVersion(undefined)).to.equal(null);
    });
  });

  describe("compareVersions()", () => {
    it("compare numériquement (10 > 9), pas lexicographiquement", () => {
      expect(compareVersions("2.10.0", "2.9.0")).to.equal(1);
      expect(compareVersions("2.3.0", "2.3.1")).to.equal(-1);
      expect(compareVersions("v2.3.0", "2.3.0")).to.equal(0);
    });

    it("traite une version invalide comme 0.0.0", () => {
      expect(compareVersions("abc", "0.0.1")).to.equal(-1);
      expect(compareVersions(null, "0.0.0")).to.equal(0);
    });
  });

  describe("bumpVersion()", () => {
    it("incrémente et remet à zéro les niveaux inférieurs", () => {
      expect(bumpVersion("2.3.4", "major")).to.equal("3.0.0");
      expect(bumpVersion("2.3.4", "minor")).to.equal("2.4.0");
      expect(bumpVersion("v2.3.4", "patch")).to.equal("2.3.5");
    });

    it("refuse une version ou un niveau invalide", () => {
      expect(() => bumpVersion("2.3", "patch")).to.throw(/invalide/);
      expect(() => bumpVersion("2.3.0", "huge")).to.throw(/inconnu/);
    });
  });
});
```

- [ ] **Step 2 : lancer le test, il doit échouer**

Run : `npx mocha test/unit/version.test.js` (PowerShell : `$env:NODE_ENV='development'` avant)
Expected : FAIL, `Cannot find module '../../server/src/utils/version'`

- [ ] **Step 3 : implémenter**

```js
// server/src/utils/version.js
// Versions sémantiques X.Y.Z (préfixe "v" toléré). Partagé par le serveur (alerte de mise à jour,
// changelog) et par scripts/release.js — vit dans server/ car c'est ce qui est copié en prod.

function parseVersion(v) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a, b) {
  const pa = parseVersion(a) || [0, 0, 0];
  const pb = parseVersion(b) || [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function bumpVersion(v, level) {
  const parsed = parseVersion(v);
  if (!parsed) throw new Error(`Version invalide : ${v}`);
  const [major, minor, patch] = parsed;
  switch (level) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Niveau d'incrément inconnu : ${level}`);
  }
}

module.exports = { parseVersion, compareVersions, bumpVersion };
```

- [ ] **Step 4 : relancer, le test doit passer**

Run : `npx mocha test/unit/version.test.js`
Expected : PASS (6 tests)

- [ ] **Step 5 : commit**

```bash
git add server/src/utils/version.js test/unit/version.test.js
git commit -m "feat(version): utilitaires compareVersions et bumpVersion"
```

---

### Task 2 : logique de release (analyse des commits, incrément, rendu du CHANGELOG)

**Files :**
- Create : `scripts/lib/releaseLib.js`
- Test : `test/unit/releaseLib.test.js`

**Interfaces :**
- Consumes : `bumpVersion` (Task 1).
- Produces :
  - `parseCommit(subject: string, body?: string) → { type, scope: string|null, breaking: boolean, description } | null`. Renvoie `null` pour un message non conventionnel, un merge ou `chore(release)`.
  - `determineBump(commits: ParsedCommit[]) → "major"|"minor"|"patch"|null`
  - `renderChangelogEntry(version: string, date: "YYYY-MM-DD", commits: ParsedCommit[]) → string`. Commence par `## [version] - date` et se termine par `\n`.
  - `prependToChangelog(existing: string, entry: string) → string`. Commence toujours par `# Changelog\n\n`.
  - `releaseNotes(entry: string) → string`. L'entrée sans sa ligne `## [...]`, pour `gh release create`.
  - `formatDate(date: Date) → "YYYY-MM-DD"` (heure locale).
  - `SECTION_TITLES` : `{ breaking: "⚠️ Changements majeurs", feat: "Nouveautés", fix: "Corrections", perf: "Performances" }`
  - `bumpVersion` (réexporté).

- [ ] **Step 1 : écrire le test qui échoue**

```js
// test/unit/releaseLib.test.js
const { expect } = require("chai");
const lib = require("../../scripts/lib/releaseLib");

describe("releaseLib", () => {
  describe("parseCommit()", () => {
    it("analyse type, scope et description", () => {
      expect(lib.parseCommit("feat(queue): pilotage de la file")).to.deep.equal({
        type: "feat",
        scope: "queue",
        breaking: false,
        description: "pilotage de la file",
      });
      expect(lib.parseCommit("fix: corrige le stock").scope).to.equal(null);
    });

    it("détecte les changements majeurs via ! ou BREAKING CHANGE dans le corps", () => {
      expect(lib.parseCommit("feat(api)!: nouvelle route").breaking).to.equal(true);
      expect(lib.parseCommit("fix(db): schéma", "détail\n\nBREAKING CHANGE: champ renommé").breaking).to.equal(true);
    });

    it("ignore les messages non conventionnels, les merges et chore(release)", () => {
      expect(lib.parseCommit("update decompte stock")).to.equal(null);
      expect(lib.parseCommit("Merge pull request #1 from Weedomeker/dev")).to.equal(null);
      expect(lib.parseCommit("chore(release): v2.4.0")).to.equal(null);
      expect(lib.parseCommit("")).to.equal(null);
    });
  });

  describe("determineBump()", () => {
    const c = (s, b) => lib.parseCommit(s, b);

    it("breaking > feat > fix/perf > rien", () => {
      expect(lib.determineBump([c("fix: a"), c("feat(x)!: b")])).to.equal("major");
      expect(lib.determineBump([c("fix: a"), c("feat: b")])).to.equal("minor");
      expect(lib.determineBump([c("perf: a"), c("chore: b")])).to.equal("patch");
      expect(lib.determineBump([c("chore: a"), c("docs: b"), c("test: c")])).to.equal(null);
      expect(lib.determineBump([])).to.equal(null);
    });
  });

  describe("renderChangelogEntry()", () => {
    it("regroupe par section dans l'ordre, omet les sections vides, scope en gras", () => {
      const commits = [
        lib.parseCommit("fix(gamesys): entête devis"),
        lib.parseCommit("feat(queue): pilotage de la file"),
        lib.parseCommit("chore: ménage"),
        lib.parseCommit("feat: sans scope"),
      ];
      expect(lib.renderChangelogEntry("2.4.0", "2026-09-30", commits)).to.equal(
        [
          "## [2.4.0] - 2026-09-30",
          "",
          "### Nouveautés",
          "- **queue** : pilotage de la file",
          "- sans scope",
          "",
          "### Corrections",
          "- **gamesys** : entête devis",
          "",
        ].join("\n"),
      );
    });

    it("place un commit breaking uniquement dans ⚠️ Changements majeurs", () => {
      const entry = lib.renderChangelogEntry("3.0.0", "2026-10-01", [lib.parseCommit("feat(api)!: v2 de l'API")]);
      expect(entry).to.include("### ⚠️ Changements majeurs\n- **api** : v2 de l'API");
      expect(entry).to.not.include("### Nouveautés");
    });

    it("écrit une ligne de maintenance quand aucun commit n'est publiable (niveau forcé)", () => {
      const entry = lib.renderChangelogEntry("2.4.1", "2026-10-01", [lib.parseCommit("chore: deps")]);
      expect(entry).to.equal("## [2.4.1] - 2026-10-01\n\n_Maintenance interne._\n");
    });
  });

  describe("prependToChangelog() / releaseNotes()", () => {
    const entry = "## [2.4.0] - 2026-09-30\n\n### Nouveautés\n- a\n";

    it("crée l'en-tête quand le fichier est vide", () => {
      expect(lib.prependToChangelog("", entry)).to.equal(`# Changelog\n\n${entry}`);
    });

    it("insère la nouvelle entrée au-dessus des anciennes, sans doubler l'en-tête", () => {
      const existing = "# Changelog\n\n## [2.3.1] - 2026-09-01\n\n### Corrections\n- b\n";
      const result = lib.prependToChangelog(existing, entry);
      expect(result.match(/# Changelog/g)).to.have.length(1);
      expect(result.indexOf("[2.4.0]")).to.be.lessThan(result.indexOf("[2.3.1]"));
    });

    it("releaseNotes retire la ligne de titre de version", () => {
      expect(lib.releaseNotes(entry)).to.equal("### Nouveautés\n- a");
    });
  });

  describe("formatDate()", () => {
    it("formate en YYYY-MM-DD local", () => {
      expect(lib.formatDate(new Date(2026, 8, 5, 23, 30))).to.equal("2026-09-05");
    });
  });
});
```

- [ ] **Step 2 : lancer le test, il doit échouer**

Run : `npx mocha test/unit/releaseLib.test.js`
Expected : FAIL, `Cannot find module '../../scripts/lib/releaseLib'`

- [ ] **Step 3 : implémenter**

```js
// scripts/lib/releaseLib.js
// Logique pure de `npm run release` : aucune commande git ici, tout est testable.
const { bumpVersion } = require("../../server/src/utils/version");

const SECTION_TITLES = {
  breaking: "⚠️ Changements majeurs",
  feat: "Nouveautés",
  fix: "Corrections",
  perf: "Performances",
};
const SECTION_ORDER = ["breaking", "feat", "fix", "perf"];

const COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const BREAKING_RE = /^BREAKING[ -]CHANGE:/m;

// Renvoie null pour tout ce qui ne doit pas apparaître dans une release :
// messages non conventionnels (historique ancien), merges, commits de release.
function parseCommit(subject, body = "") {
  const match = COMMIT_RE.exec(String(subject || "").trim());
  if (!match) return null;
  const [, type, scope = null, bang, description] = match;
  if (type === "chore" && scope === "release") return null;
  return {
    type,
    scope,
    breaking: Boolean(bang) || BREAKING_RE.test(body || ""),
    description: description.trim(),
  };
}

function determineBump(commits) {
  if (commits.some((c) => c.breaking)) return "major";
  if (commits.some((c) => c.type === "feat")) return "minor";
  if (commits.some((c) => c.type === "fix" || c.type === "perf")) return "patch";
  return null;
}

function sectionOf(commit) {
  if (commit.breaking) return "breaking";
  return SECTION_TITLES[commit.type] ? commit.type : null;
}

function renderItem(commit) {
  return commit.scope ? `- **${commit.scope}** : ${commit.description}` : `- ${commit.description}`;
}

function renderChangelogEntry(version, date, commits) {
  const lines = [`## [${version}] - ${date}`, ""];
  let hasSection = false;

  for (const key of SECTION_ORDER) {
    const items = commits.filter((c) => sectionOf(c) === key);
    if (items.length === 0) continue;
    hasSection = true;
    lines.push(`### ${SECTION_TITLES[key]}`, ...items.map(renderItem), "");
  }

  if (!hasSection) lines.push("_Maintenance interne._", "");
  return lines.join("\n");
}

const CHANGELOG_HEADER = "# Changelog\n\n";

function prependToChangelog(existing, entry) {
  const rest = String(existing || "")
    .replace(/^# Changelog\s*/, "")
    .trim();
  return rest ? `${CHANGELOG_HEADER}${entry}\n${rest}\n` : `${CHANGELOG_HEADER}${entry}`;
}

function releaseNotes(entry) {
  return entry.split("\n").slice(1).join("\n").trim();
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = {
  SECTION_TITLES,
  parseCommit,
  determineBump,
  bumpVersion,
  renderChangelogEntry,
  prependToChangelog,
  releaseNotes,
  formatDate,
};
```

- [ ] **Step 4 : relancer, le test doit passer**

Run : `npx mocha test/unit/releaseLib.test.js`
Expected : PASS (11 tests)

- [ ] **Step 5 : commit**

```bash
git add scripts/lib/releaseLib.js test/unit/releaseLib.test.js
git commit -m "feat(release): logique d'analyse des commits et rendu du CHANGELOG"
```

---

### Task 3 : lecture du CHANGELOG (`changelogService`)

**Files :**
- Create : `server/src/services/changelogService.js`
- Test : `test/unit/changelogService.test.js`

**Interfaces :**
- Consumes : `compareVersions` (Task 1). Le test utilise aussi `renderChangelogEntry` et `prependToChangelog` (Task 2) pour l'aller-retour.
- Produces :
  - `parseChangelog(markdown: string) → Array<{ version, date: string|null, sections: { [titre]: Array<{ scope: string|null, text }> } }>`, dans l'ordre du fichier (la plus récente d'abord).
  - `readChangelog({ since?: string, limit?: number = 5, current?: string, filePath: string }) → même tableau`.
    - Avec `since` : les versions `> since` et `<= current` (sans borne haute si `current` est absent).
    - Sans `since` : les `limit` premières.
    - Fichier absent ou illisible : `[]`.

- [ ] **Step 1 : écrire le test qui échoue**

```js
// test/unit/changelogService.test.js
const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseChangelog, readChangelog } = require("../../server/src/services/changelogService");
const { renderChangelogEntry, prependToChangelog, parseCommit } = require("../../scripts/lib/releaseLib");

const SAMPLE = `# Changelog

## [2.5.0] - 2026-10-10

### Nouveautés
- **queue** : pause de la file
- sans scope

## [2.4.0] - 2026-09-30

### Corrections
- **gamesys** : entête devis
Ligne inattendue ignorée

## [2.3.0] - 2025-11-18

_Maintenance interne._
`;

describe("changelogService", () => {
  describe("parseChangelog()", () => {
    it("structure versions, dates, sections et entrées (scope facultatif)", () => {
      const entries = parseChangelog(SAMPLE);
      expect(entries.map((e) => e.version)).to.deep.equal(["2.5.0", "2.4.0", "2.3.0"]);
      expect(entries[0].date).to.equal("2026-10-10");
      expect(entries[0].sections.Nouveautés).to.deep.equal([
        { scope: "queue", text: "pause de la file" },
        { scope: null, text: "sans scope" },
      ]);
      expect(entries[1].sections.Corrections).to.deep.equal([{ scope: "gamesys", text: "entête devis" }]);
      expect(entries[2].sections).to.deep.equal({});
    });

    it("renvoie [] pour un contenu vide ou sans version", () => {
      expect(parseChangelog("")).to.deep.equal([]);
      expect(parseChangelog("# Changelog\n\nrien")).to.deep.equal([]);
    });

    it("relit à l'identique ce que la release écrit (aller-retour)", () => {
      const entry = renderChangelogEntry("2.4.0", "2026-09-30", [
        parseCommit("feat(queue): pilotage"),
        parseCommit("fix: correctif"),
      ]);
      const [parsed] = parseChangelog(prependToChangelog("", entry));
      expect(parsed).to.deep.equal({
        version: "2.4.0",
        date: "2026-09-30",
        sections: {
          Nouveautés: [{ scope: "queue", text: "pilotage" }],
          Corrections: [{ scope: null, text: "correctif" }],
        },
      });
    });
  });

  describe("readChangelog()", () => {
    let tmpDir;
    let filePath;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-changelog-"));
      filePath = path.join(tmpDir, "CHANGELOG.md");
      fs.writeFileSync(filePath, SAMPLE);
    });

    afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    it("sans since : les `limit` plus récentes", () => {
      expect(readChangelog({ filePath, limit: 2 }).map((e) => e.version)).to.deep.equal(["2.5.0", "2.4.0"]);
    });

    it("avec since : strictement après since et jusqu'à la version courante incluse", () => {
      const result = readChangelog({ filePath, since: "2.3.0", current: "2.4.0" });
      expect(result.map((e) => e.version)).to.deep.equal(["2.4.0"]);
    });

    it("renvoie [] si le fichier est absent", () => {
      expect(readChangelog({ filePath: path.join(tmpDir, "absent.md") })).to.deep.equal([]);
    });
  });
});
```

- [ ] **Step 2 : lancer le test, il doit échouer**

Run : `npx mocha test/unit/changelogService.test.js`
Expected : FAIL, `Cannot find module '../../server/src/services/changelogService'`

- [ ] **Step 3 : implémenter**

```js
// server/src/services/changelogService.js
// Lecture de CHANGELOG.md (écrit par scripts/release.js) pour la fenêtre « Quoi de neuf ».
const fs = require("fs");
const logger = require("../logger/logger");
const { compareVersions } = require("../utils/version");

const VERSION_RE = /^## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/;
const SECTION_RE = /^### (.+)$/;
const ITEM_RE = /^- (?:\*\*(.+?)\*\* : )?(.+)$/;

// Tolérant : toute ligne qui n'est ni une version, ni une section, ni une puce est ignorée.
function parseChangelog(markdown) {
  const entries = [];
  let entry = null;
  let section = null;

  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const versionMatch = VERSION_RE.exec(line);
    if (versionMatch) {
      entry = { version: versionMatch[1], date: versionMatch[2] || null, sections: {} };
      entries.push(entry);
      section = null;
      continue;
    }
    if (!entry) continue;

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      entry.sections[section] = [];
      continue;
    }

    const itemMatch = ITEM_RE.exec(line);
    if (itemMatch && section) {
      entry.sections[section].push({ scope: itemMatch[1] || null, text: itemMatch[2] });
    }
  }
  return entries;
}

function readChangelog({ since, limit = 5, current, filePath }) {
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") logger.warn(`CHANGELOG illisible : ${error.message}`);
    return [];
  }

  const entries = parseChangelog(markdown);
  if (since) {
    return entries.filter(
      (e) => compareVersions(e.version, since) > 0 && (!current || compareVersions(e.version, current) <= 0),
    );
  }
  return entries.slice(0, limit);
}

module.exports = { parseChangelog, readChangelog };
```

- [ ] **Step 4 : relancer, le test doit passer**

Run : `npx mocha test/unit/changelogService.test.js`
Expected : PASS (6 tests)

- [ ] **Step 5 : commit**

```bash
git add server/src/services/changelogService.js test/unit/changelogService.test.js
git commit -m "feat(version): lecture du CHANGELOG pour la fenêtre Quoi de neuf"
```

---

### Task 4 : métadonnées de build, `state.app` et alerte de mise à jour

**Files :**
- Create : `scripts/writeBuildInfo.js`
- Modify : `server/src/services/appState.js` (`state.appVersion`, `loadAppVersion`)
- Modify : `server/src/checkVersion.js` (réécriture complète)
- Modify : `package.json` (script `build`)
- Modify : `.gitignore`
- Test : `test/unit/appState.loadAppVersion.test.js`, `test/unit/checkVersion.test.js`

**Interfaces :**
- Consumes : `compareVersions` (Task 1).
- Produces :
  - `collectBuildInfo(now?: Date) → { version, commit: string|null, branch: string|null, buildDate: string (ISO), dirty: boolean|null }`, dans `scripts/writeBuildInfo.js`.
  - `state.app = { version: string, commit: string|null, buildDate: string|null }`. `state.appVersion` est gardé comme alias de `state.app.version`.
  - `loadAppVersion(rootDir?: string = projectRoot, { preferBuildInfo?: boolean = NODE_ENV !== "development" } = {})` remplit `state.app`.
  - `checkVersion({ fetchImpl?, now? }) → Promise<{ currentVersion, latest: { version, url, publishedAt } | null, updateAvailable: boolean, latestVersion: string|undefined, message: string }>`
  - `checkVersion._resetCache()`, réservé aux tests.

- [ ] **Step 1 : écrire les tests qui échouent**

```js
// test/unit/appState.loadAppVersion.test.js
const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { state, loadAppVersion } = require("../../server/src/services/appState");

describe("appState.loadAppVersion()", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-version-"));
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ version: "2.3.0" }));
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const BUILD_INFO = { version: "2.4.0", commit: "abc1234", buildDate: "2026-09-30T12:00:00.000Z" };

  it("hors dev (prod), utilise build-info.json en priorité (poste sans .git)", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), JSON.stringify(BUILD_INFO));

    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app).to.deep.equal(BUILD_INFO);
    expect(state.appVersion).to.equal("2.4.0");
  });

  it("en dev (défaut sous NODE_ENV=development), ignore un build-info.json périmé", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), JSON.stringify(BUILD_INFO));

    loadAppVersion(tmpDir);

    expect(state.app.version).to.equal("2.3.0");
  });

  it("se rabat sur package.json, commit null hors dépôt git", () => {
    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app).to.deep.equal({ version: "2.3.0", commit: null, buildDate: null });
  });

  it("ignore un build-info.json corrompu", () => {
    fs.writeFileSync(path.join(tmpDir, "build-info.json"), "{ pas du json");

    loadAppVersion(tmpDir, { preferBuildInfo: true });

    expect(state.app.version).to.equal("2.3.0");
  });
});
```

```js
// test/unit/checkVersion.test.js
const { expect } = require("chai");
const sinon = require("sinon");
const checkVersion = require("../../server/src/checkVersion");
const { state } = require("../../server/src/services/appState");

function releaseResponse(tag) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tag, html_url: `https://github.com/r/${tag}`, published_at: "2026-10-01T08:00:00Z" }),
  };
}

describe("checkVersion()", () => {
  const NOW = 1_800_000_000_000;

  beforeEach(() => {
    checkVersion._resetCache();
    state.app = { version: "2.4.0", commit: "abc1234", buildDate: null };
  });

  it("signale une mise à jour quand la dernière release est plus récente", async () => {
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.updateAvailable).to.equal(true);
    expect(result.latest).to.deep.equal({
      version: "2.5.0",
      url: "https://github.com/r/v2.5.0",
      publishedAt: "2026-10-01T08:00:00Z",
    });
    expect(result.message).to.equal("Mise à jour disponible: 2.5.0 (actuelle: 2.4.0)");
  });

  it("ne signale rien pour un poste en avance sur la dernière release", async () => {
    state.app.version = "2.6.0";
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.updateAvailable).to.equal(false);
    expect(result.message).to.match(/dernière version/);
  });

  it("met le résultat en cache 1 h", async () => {
    const fetchImpl = sinon.stub().resolves(releaseResponse("v2.5.0"));

    await checkVersion({ fetchImpl, now: NOW });
    await checkVersion({ fetchImpl, now: NOW + 3_599_000 });
    expect(fetchImpl.callCount).to.equal(1);

    await checkVersion({ fetchImpl, now: NOW + 3_600_001 });
    expect(fetchImpl.callCount).to.equal(2);
  });

  it("GitHub injoignable, 404 ou quota : pas d'alerte, pas d'exception, et mise en cache de l'échec", async () => {
    const fetchImpl = sinon.stub().rejects(new Error("getaddrinfo ENOTFOUND api.github.com"));

    const result = await checkVersion({ fetchImpl, now: NOW });
    await checkVersion({ fetchImpl, now: NOW + 1000 });

    expect(result.latest).to.equal(null);
    expect(result.updateAvailable).to.equal(false);
    expect(result.message).to.match(/vérification des mises à jour indisponible/);
    expect(fetchImpl.callCount).to.equal(1);
  });

  it("traite une réponse HTTP non-ok comme un échec", async () => {
    const fetchImpl = sinon.stub().resolves({ ok: false, status: 403, json: async () => ({}) });

    const result = await checkVersion({ fetchImpl, now: NOW });

    expect(result.latest).to.equal(null);
  });
});
```

- [ ] **Step 2 : lancer les tests, ils doivent échouer**

Run : `npx mocha test/unit/appState.loadAppVersion.test.js test/unit/checkVersion.test.js`
Expected : FAIL (`state.app` indéfini, `loadAppVersion` ignore son argument, `checkVersion._resetCache is not a function`)

- [ ] **Step 3 : implémenter `appState.loadAppVersion`**

Dans `server/src/services/appState.js`, ajouter `const { execFileSync } = require("child_process");` sous les imports existants, remplacer `appVersion: undefined,` dans `state` par :

```js
  // Version de l'appli : build-info.json (écrit au build, seule source en prod) sinon package.json + git.
  app: { version: undefined, commit: null, buildDate: null },
  appVersion: undefined, // alias de app.version (usages historiques)
```

puis remplacer toute la fonction `loadAppVersion` par :

```js
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function gitShortCommit(rootDir) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// En dev, build-info.json (reste d'un build local) serait périmé : on lit package.json + git.
function loadAppVersion(rootDir = projectRoot, { preferBuildInfo = process.env.NODE_ENV !== "development" } = {}) {
  const buildInfo = preferBuildInfo ? readJson(path.join(rootDir, "build-info.json")) : null;

  if (buildInfo?.version) {
    state.app = {
      version: buildInfo.version,
      commit: buildInfo.commit || null,
      buildDate: buildInfo.buildDate || null,
    };
  } else {
    const packageJson = readJson(path.join(rootDir, "package.json"));
    if (!packageJson) logger.error(`Lecture de package.json impossible dans ${rootDir}`);
    state.app = { version: packageJson?.version, commit: gitShortCommit(rootDir), buildDate: null };
  }

  state.appVersion = state.app.version;
  logger.debug(`Version de l'application: ${state.app.version} (${state.app.commit || "commit inconnu"})`);
}
```

Vérification importante : le test « commit null hors dépôt git » suppose que `os.tmpdir()` n'est pas à l'intérieur d'un dépôt git. Sur ce poste, c'est `C:\Users\...\AppData\Local\Temp`, ce qui convient.

- [ ] **Step 4 : réécrire `server/src/checkVersion.js`**

```js
const fetch = require("node-fetch");
const logger = require("./logger/logger");
const { state } = require("./services/appState");
const { compareVersions } = require("./utils/version");

// Version de référence = dernière release GitHub (plus le package.json de main, qui n'est pas la prod).
const LATEST_RELEASE_URL = "https://api.github.com/repos/Weedomeker/decoGestion/releases/latest";
const CACHE_MS = 60 * 60 * 1000; // l'API sans authentification est limitée à 60 requêtes/h

let cache = null; // { at, latest }

async function fetchLatestRelease(fetchImpl) {
  const response = await fetchImpl(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "decoGestion" },
    timeout: 10000,
  });
  if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
  const release = await response.json();
  return {
    version: String(release.tag_name || "").replace(/^v/, ""),
    url: release.html_url,
    publishedAt: release.published_at,
  };
}

// Un échec est mis en cache comme un succès : un seul warn par heure si GitHub est injoignable.
async function getLatestRelease(fetchImpl, now) {
  if (cache && now - cache.at < CACHE_MS) return cache.latest;

  let latest = null;
  try {
    latest = await fetchLatestRelease(fetchImpl);
  } catch (error) {
    logger.warn(`Vérification des mises à jour impossible : ${error.message}`);
  }
  cache = { at: now, latest };
  return latest;
}

async function checkVersion({ fetchImpl = fetch, now = Date.now() } = {}) {
  const currentVersion = state.app.version;
  const latest = await getLatestRelease(fetchImpl, now);
  const updateAvailable = Boolean(latest) && compareVersions(latest.version, currentVersion) > 0;

  let message;
  if (!latest) {
    message = `Version ${currentVersion} (vérification des mises à jour indisponible)`;
  } else if (updateAvailable) {
    message = `Mise à jour disponible: ${latest.version} (actuelle: ${currentVersion})`;
  } else {
    message = `Vous avez la dernière version de Decogestion (actuelle: ${currentVersion})`;
  }

  return { currentVersion, latest, updateAvailable, latestVersion: latest?.version, message };
}

checkVersion._resetCache = () => {
  cache = null;
};

module.exports = checkVersion;
```

Les appelants existants (`server/server.js:140` et `systemController.getProcess`) n'utilisent que `.message` : ils restent compatibles. Au démarrage, `loadAppVersion()` (`server/server.js:50`) est appelé avant `server.listen`, donc `state.app.version` est bien renseigné.

- [ ] **Step 5 : écrire `scripts/writeBuildInfo.js`, brancher le build, ignorer le fichier**

```js
// scripts/writeBuildInfo.js
// Inscrit version + commit dans build-info.json au moment du build : le poste de prod reçoit
// les fichiers par copie, sans .git, et ne peut pas les retrouver seul.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function gitOut(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function collectBuildInfo(now = new Date()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const status = gitOut(["status", "--porcelain"]);
  return {
    version: pkg.version,
    commit: gitOut(["rev-parse", "--short", "HEAD"]),
    branch: gitOut(["rev-parse", "--abbrev-ref", "HEAD"]),
    buildDate: now.toISOString(),
    dirty: status === null ? null : status.length > 0,
  };
}

if (require.main === module) {
  const info = collectBuildInfo();
  fs.writeFileSync(path.join(ROOT, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
  const dirtyNote = info.dirty ? " ⚠️ modifications non commitées" : "";
  console.log(`build-info.json : v${info.version} (${info.commit || "sans git"})${dirtyNote}`);
}

module.exports = { collectBuildInfo };
```

Dans `package.json`, remplacer la ligne du script `build` par :

```json
    "build": "node scripts/writeBuildInfo.js && set NODE_ENV=production&& cd client && npm run build",
```

Ajouter à la fin de `.gitignore` :

```
build-info.json
```

- [ ] **Step 6 : relancer les tests, ils doivent passer, puis toute la suite**

Run : `npx mocha test/unit/appState.loadAppVersion.test.js test/unit/checkVersion.test.js`
Expected : PASS (9 tests)

Run : `npm run test:unit`
Expected : tous les tests passent (aucune régression sur les usages de `state.appVersion`).

Run : `node scripts/writeBuildInfo.js`
Expected : `build-info.json : v2.3.0 (<sha>)`. Le fichier existe, et `git status` ne le liste **pas**. Supprimez-le ensuite (`rm build-info.json`) : il n'a pas à traîner dans le dépôt de dev.

- [ ] **Step 7 : commit**

```bash
git add scripts/writeBuildInfo.js server/src/services/appState.js server/src/checkVersion.js package.json .gitignore test/unit/appState.loadAppVersion.test.js test/unit/checkVersion.test.js
git commit -m "feat(version): build-info.json, state.app et alerte basée sur les releases GitHub"
```

---

### Task 5 : endpoints `/version` et `/changelog`, traçabilité `app_commit`

**Files :**
- Modify : `server/src/controllers/systemController.js`
- Modify : `server/src/routes/systemRoutes.js`
- Modify : `server/src/models/Deco.js:38`
- Modify : `server/src/controllers/jobsController.js` (objet `data` de la sauvegarde Deco, ligne `app_version`)
- Test : `test/unit/systemController.version.test.js`

**Interfaces :**
- Consumes : `checkVersion` (Task 4), `readChangelog` (Task 3), `state.app` (Task 4).
- Produces :
  - `GET /version` → `{ version, commit, buildDate, latest: {version,url,publishedAt}|null, updateAvailable }`
  - `GET /changelog?since=X.Y.Z&limit=N` → tableau de `readChangelog`.
  - Champ Deco `app_commit: String`.

- [ ] **Step 1 : écrire le test qui échoue**

```js
// test/unit/systemController.version.test.js
const { expect } = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const os = require("os");
const path = require("path");
const checkVersion = require("../../server/src/checkVersion");
const { state } = require("../../server/src/services/appState");
const systemController = require("../../server/src/controllers/systemController");

function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe("systemController — version et changelog", () => {
  let originalRoot;
  let tmpDir;

  beforeEach(() => {
    checkVersion._resetCache();
    state.app = { version: "2.4.0", commit: "abc1234", buildDate: "2026-09-30T12:00:00.000Z" };
    originalRoot = state.paths.projectRoot;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-sys-"));
    state.paths.projectRoot = tmpDir;
  });

  afterEach(() => {
    state.paths.projectRoot = originalRoot;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    sinon.restore();
  });

  it("GET /version renvoie version, commit, date de build et l'état de mise à jour", async () => {
    // Pré-remplit le cache avec une release plus récente (aucun appel réseau réel).
    await checkVersion({
      fetchImpl: sinon.stub().resolves({
        ok: true,
        json: async () => ({ tag_name: "v2.5.0", html_url: "https://x/v2.5.0", published_at: "2026-10-01" }),
      }),
    });
    const res = fakeRes();

    await systemController.getVersion({}, res);

    expect(res.body).to.deep.equal({
      version: "2.4.0",
      commit: "abc1234",
      buildDate: "2026-09-30T12:00:00.000Z",
      latest: { version: "2.5.0", url: "https://x/v2.5.0", publishedAt: "2026-10-01" },
      updateAvailable: true,
    });
  });

  it("GET /changelog filtre depuis `since` jusqu'à la version courante", () => {
    fs.writeFileSync(
      path.join(tmpDir, "CHANGELOG.md"),
      "# Changelog\n\n## [2.5.0] - 2026-10-10\n\n### Nouveautés\n- futur\n\n## [2.4.0] - 2026-09-30\n\n### Corrections\n- a\n",
    );
    const res = fakeRes();

    systemController.getChangelog({ query: { since: "2.3.0" } }, res);

    expect(res.body.map((e) => e.version)).to.deep.equal(["2.4.0"]);
  });

  it("GET /changelog renvoie [] sans CHANGELOG", () => {
    const res = fakeRes();

    systemController.getChangelog({ query: {} }, res);

    expect(res.body).to.deep.equal([]);
  });
});
```

- [ ] **Step 2 : lancer le test, il doit échouer**

Run : `npx mocha test/unit/systemController.version.test.js`
Expected : FAIL, `systemController.getVersion is not a function`

- [ ] **Step 3 : implémenter les handlers et les routes**

Dans `server/src/controllers/systemController.js`, ajouter aux imports :

```js
const path = require("path");
const { readChangelog } = require("../services/changelogService");
```

Ajouter avant `module.exports` :

```js
async function getVersion(req, res) {
  try {
    const { latest, updateAvailable } = await checkVersion();
    const { version, commit, buildDate } = state.app;
    res.json({ version, commit, buildDate, latest, updateAvailable });
  } catch (error) {
    logger.error(`getVersion: ${error.message}`);
    res.status(500).json({ error: "Erreur de lecture de la version" });
  }
}

function getChangelog(req, res) {
  const limit = parseInt(req.query.limit) || 5;
  res.json(
    readChangelog({
      since: req.query.since,
      limit,
      current: state.app.version,
      filePath: path.join(state.paths.projectRoot, "CHANGELOG.md"),
    }),
  );
}
```

Puis mettre à jour l'export :

```js
module.exports = {
  getProcess,
  getPath,
  getFormatsTauro: getFormatsTauroHandler,
  getVersion,
  getChangelog,
};
```

Dans `server/src/routes/systemRoutes.js`, ajouter après `router.get("/formatsTauro", ...)` :

```js
router.get("/version", systemController.getVersion);
router.get("/changelog", systemController.getChangelog);
```

- [ ] **Step 4 : ajouter `app_commit`**

Dans `server/src/models/Deco.js`, sous la ligne `app_version: { type: String },` :

```js
  app_commit: { type: String },
```

Dans `server/src/controllers/jobsController.js`, sous la ligne `app_version: \`v${state.appVersion}\`,` de l'objet `data` :

```js
      app_commit: state.app.commit || undefined,
```

- [ ] **Step 5 : relancer le test, puis toute la suite**

Run : `npx mocha test/unit/systemController.version.test.js`
Expected : PASS (3 tests)

Run : `npm run test:unit`
Expected : tous les tests passent.

- [ ] **Step 6 : commit**

```bash
git add server/src/controllers/systemController.js server/src/routes/systemRoutes.js server/src/models/Deco.js server/src/controllers/jobsController.js test/unit/systemController.version.test.js
git commit -m "feat(version): endpoints /version et /changelog, traçabilité app_commit"
```

---

### Task 6 : client (version, badge de mise à jour, « Quoi de neuf »)

Le client n'a pas de framework de test : la validation passe par `vite build`, eslint et une vérification manuelle en dev.

**Files :**
- Create : `client/src/components/WhatsNew.jsx`
- Modify : `client/src/components/Header.jsx`
- Modify : `client/src/App.jsx` (ligne 45 `const [version, setVersion]`, effet « Get App version » l. 396-412, props du `<Header>` l. 851-861)
- Modify : `client/src/css/index.css` (`.header-version`, l. 244)

**Interfaces :**
- Consumes : `GET /version`, `GET /changelog` (Task 5).
- Produces :
  - `<Header appInfo={object|null} onVersionClick={fn} …/>`. La prop `appVersion` disparaît.
  - `<WhatsNew currentVersion={string|undefined} manualOpen={bool} onManualClose={fn} />`

- [ ] **Step 1 : créer `client/src/components/WhatsNew.jsx`**

```jsx
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Button, Modal, ModalActions, ModalContent, ModalHeader } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

const STORAGE_KEY = "lastSeenVersion";

// localStorage peut être indisponible (navigation privée, stockage bloqué) : jamais bloquant.
function readLastSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(version) {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // stockage indisponible : la fenêtre se rouvrira simplement au prochain chargement
  }
}

async function fetchChangelog(query) {
  const response = await fetch(`${API_BASE}/changelog?${query}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function WhatsNew({ currentVersion, manualOpen, onManualClose }) {
  const [entries, setEntries] = useState([]);
  const [autoOpen, setAutoOpen] = useState(false);

  // Ouverture automatique, une seule fois, après une mise à jour de l'appli.
  useEffect(() => {
    if (!currentVersion) return;
    const lastSeen = readLastSeen();
    if (!lastSeen) {
      // Première visite : rien à annoncer, on mémorise la version courante.
      writeLastSeen(currentVersion);
      return;
    }
    if (lastSeen === currentVersion) return;

    fetchChangelog(`since=${encodeURIComponent(lastSeen)}`)
      .then((list) => {
        if (list.length > 0) {
          setEntries(list);
          setAutoOpen(true);
        } else {
          writeLastSeen(currentVersion);
        }
      })
      .catch((error) => console.error("Erreur chargement du changelog :", error));
  }, [currentVersion]);

  useEffect(() => {
    if (!manualOpen) return;
    fetchChangelog("limit=5")
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [manualOpen]);

  const close = () => {
    if (currentVersion) writeLastSeen(currentVersion);
    setAutoOpen(false);
    onManualClose?.();
  };

  return (
    <Modal open={autoOpen || manualOpen} onClose={close} size="small">
      <ModalHeader>Quoi de neuf ?</ModalHeader>
      <ModalContent scrolling>
        {entries.length === 0 ? (
          <p>Aucune note de version disponible.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.version} className="whatsnew-entry">
              <h3 className="whatsnew-version">
                v{entry.version}
                {entry.date && (
                  <span className="whatsnew-date"> — {new Date(entry.date).toLocaleDateString("fr-FR")}</span>
                )}
              </h3>
              {Object.keys(entry.sections).length === 0 && <p className="whatsnew-empty">Maintenance interne.</p>}
              {Object.entries(entry.sections).map(([title, items]) => (
                <div key={title} className="whatsnew-section">
                  <h4>{title}</h4>
                  <ul>
                    {items.map((item, i) => (
                      <li key={i}>
                        {item.scope && <strong>{item.scope}</strong>}
                        {item.scope && " : "}
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))
        )}
      </ModalContent>
      <ModalActions>
        <Button primary onClick={close}>
          OK
        </Button>
      </ModalActions>
    </Modal>
  );
}

WhatsNew.propTypes = {
  currentVersion: PropTypes.string,
  manualOpen: PropTypes.bool,
  onManualClose: PropTypes.func,
};

export default WhatsNew;
```

- [ ] **Step 2 : Header, avec la version depuis `appInfo` et le badge de mise à jour**

Dans `client/src/components/Header.jsx`, remplacer la signature et les lignes 5-13 par :

```jsx
const Header = ({ appInfo, onVersionClick, onFichiers, configNode, statusNode, activeView, onViewChange, pendingCount, theme, onThemeToggle }) => {
  const version = appInfo?.version;
  const buildDetails = [
    appInfo?.commit && `commit ${appInfo.commit}`,
    appInfo?.buildDate && `build du ${new Date(appInfo.buildDate).toLocaleString("fr-FR")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="header">
      <div className="header-brand">
        <Image src={logo} className="header-logo" />
        {version && (
          <button
            type="button"
            className="header-version"
            onClick={onVersionClick}
            title={buildDetails ? `${buildDetails} — Quoi de neuf ?` : "Quoi de neuf ?"}
          >
            v{version}
          </button>
        )}
        {appInfo?.updateAvailable && appInfo.latest && (
          <a
            className="header-update"
            href={appInfo.latest.url}
            target="_blank"
            rel="noreferrer"
            title="Voir la nouvelle version sur GitHub"
          >
            Mise à jour {appInfo.latest.version}
          </a>
        )}
      </div>
```

Dans les `propTypes`, remplacer `appVersion: PropTypes.string,` par :

```jsx
  appInfo: PropTypes.shape({
    version: PropTypes.string,
    commit: PropTypes.string,
    buildDate: PropTypes.string,
    updateAvailable: PropTypes.bool,
    latest: PropTypes.shape({ version: PropTypes.string, url: PropTypes.string }),
  }),
  onVersionClick: PropTypes.func,
```

- [ ] **Step 3 : App.jsx, à brancher sur `/version` et `WhatsNew`**

1. Ajouter l'import sous `import VisuelDropdown ...` : `import WhatsNew from "./components/WhatsNew";`
2. Remplacer `const [version, setVersion] = useState(null);` (l. 45) par :

```jsx
  const [appInfo, setAppInfo] = useState(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
```

3. Remplacer tout l'effet `//Get App version` (l. 396-412) par :

```jsx
  // Version de l'appli (+ commit, date de build et alerte de mise à jour)
  useEffect(() => {
    fetch(`${API_BASE}/version`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setAppInfo)
      .catch((err) => console.error(err));
  }, []);
```

4. Dans `<Header ...>`, remplacer `appVersion={version}` par :

```jsx
        appInfo={appInfo}
        onVersionClick={() => setWhatsNewOpen(true)}
```

5. Juste après la balise fermante `/>` du `<Header>`, ajouter :

```jsx
      <WhatsNew
        currentVersion={appInfo?.version}
        manualOpen={whatsNewOpen}
        onManualClose={() => setWhatsNewOpen(false)}
      />
```

6. Vérifier qu'il ne reste aucune référence à `version` ou `setVersion` : `grep -n "setVersion\|appVersion" client/src/App.jsx` ne doit rien renvoyer.

- [ ] **Step 4 : styles**

Dans `client/src/css/index.css`, compléter `.header-version` (l. 244) pour en faire un bouton sans style, puis ajouter les nouvelles classes juste après son bloc :

```css
.header-version {
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  line-height: 1;
  padding: 0 0 2px;
  background: none;
  border: 0;
  cursor: pointer;
}

.header-version:hover,
.header-version:focus-visible {
  color: var(--text-primary);
  text-decoration: underline;
}

.header-update {
  font-size: 10px;
  font-weight: 600;
  color: var(--warning) !important;
  background: var(--warning-soft);
  border: 1px solid var(--warning);
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 6px;
  white-space: nowrap;
}

.whatsnew-entry + .whatsnew-entry {
  margin-top: 1.4em;
  padding-top: 1em;
  border-top: 1px solid var(--border-dim);
}

.whatsnew-version {
  margin-bottom: 0.4em;
}

.whatsnew-date {
  font-weight: 400;
  font-size: 0.8em;
  color: var(--text-muted);
}

.whatsnew-section h4 {
  margin: 0.8em 0 0.3em;
}

.whatsnew-section ul {
  margin: 0;
  padding-left: 1.2em;
}

.whatsnew-empty {
  color: var(--text-muted);
}
```

(`--warning`, `--warning-soft`, `--border-dim`, `--text-muted` et `--text-primary` existent déjà, voir `JobsList.jsx` et `index.css`.)

- [ ] **Step 5 : vérifier le build et le lint**

Run : `cd client && npx eslint src/components/WhatsNew.jsx src/components/Header.jsx src/App.jsx`
Expected : aucune **erreur** nouvelle. Les warnings déjà présents dans `App.jsx` sont acceptés.

Run : `cd client && npx vite build`
Expected : `✓ built`.

- [ ] **Step 6 : vérification manuelle en dev**

1. `npm run server` (dev, port 9000) et `npm run client`.
2. Le Header affiche `v2.3.0`. Au survol : `commit <sha> — Quoi de neuf ?`. Pas de badge, car aucune release n'existe encore et `latest` vaut `null`.
3. Clic sur `v2.3.0` : la modale s'ouvre avec « Aucune note de version disponible. » (pas encore de CHANGELOG). « OK » la ferme.
4. Console du navigateur (DevTools) : `localStorage.setItem("lastSeenVersion","2.2.0")`, puis créer temporairement à la racine un `CHANGELOG.md` contenant une entrée `## [2.3.0] - 2025-11-18` avec `### Nouveautés` et `- **test** : essai`. Recharger : la modale s'ouvre **automatiquement** avec v2.3.0. Après « OK », recharger : elle ne s'ouvre plus. **Supprimer ensuite le `CHANGELOG.md` temporaire.**

- [ ] **Step 7 : commit**

```bash
git add client/src/components/WhatsNew.jsx client/src/components/Header.jsx client/src/App.jsx client/src/css/index.css
git commit -m "feat(version): version, badge de mise à jour et fenêtre Quoi de neuf"
```

---

### Task 7 : CLI `npm run release` (et `--init`)

**Files :**
- Create : `scripts/release.js`
- Modify : `package.json` (script `release`)

**Interfaces :**
- Consumes : `releaseLib` (Task 2) : `parseCommit`, `determineBump`, `bumpVersion`, `renderChangelogEntry`, `prependToChangelog`, `releaseNotes`, `formatDate`.
- Produces :
  - `npm run release [-- major|minor|patch] [--dry-run] [--yes]`
  - `npm run release -- --init <X.Y.Z>`

La logique est couverte par la Task 2. Ce script ne fait qu'orchestrer git et gh, et il est vérifié en `--dry-run` sur le vrai dépôt.

- [ ] **Step 1 : écrire `scripts/release.js`**

```js
// scripts/release.js
// npm run release [-- major|minor|patch] [--dry-run] [--yes]
// npm run release -- --init 2.3.0   (une seule fois : réaligne main, pose le tag de référence)
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const lib = require("./lib/releaseLib");

const ROOT = path.join(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const VERSION_FILES = ["package.json", "package-lock.json", "client/package.json", "client/package-lock.json"];

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const git = (...args) => run("git", args);

function succeeds(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { level: null, dryRun: false, yes: false, init: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["major", "minor", "patch"].includes(arg)) opts.level = arg;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--init") opts.init = argv[++i];
    else fail(`Argument inconnu : ${arg}`);
  }
  return opts;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^o(ui)?$/i.test(answer.trim()));
    }),
  );
}

// Tout est vérifié AVANT la moindre écriture.
function checkPreconditions({ requireMainAncestor }) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "dev") fail(`Les releases se font depuis dev (branche actuelle : ${branch}).`);
  if (git("status", "--porcelain")) fail("Des modifications ne sont pas commitées : commitez ou remisez-les d'abord.");

  git("fetch", "origin", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/dev")) {
    fail("dev n'est pas synchronisée avec origin/dev (faites un pull ou un push d'abord).");
  }
  if (!succeeds(() => run("gh", ["auth", "status"]))) fail("gh n'est pas authentifié : lancez `gh auth login`.");
  if (requireMainAncestor && !succeeds(() => git("merge-base", "--is-ancestor", "origin/main", "HEAD"))) {
    fail("origin/main n'est pas un ancêtre de dev : lancez d'abord `npm run release -- --init <version>`.");
  }
}

function lastTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return null;
  }
}

function readCommits(range) {
  const out = git("log", "--no-merges", "--format=%s%x1f%b%x1e", range);
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body] = record.split("\x1f");
      return lib.parseCommit(subject, body);
    })
    .filter(Boolean);
}

function setVersionInFiles(version) {
  const touched = [];
  for (const file of VERSION_FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    json.version = version;
    if (json.packages && json.packages[""]) json.packages[""].version = version;
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
    touched.push(file);
  }
  return touched;
}

// Exécute les étapes dans l'ordre ; en cas d'échec, dit ce qui est fait et comment reprendre.
function runSteps(steps) {
  const done = [];
  for (const step of steps) {
    try {
      console.log(`→ ${step.label}`);
      step.action();
      done.push(step.label);
    } catch (error) {
      console.error(`\n✖ Échec : ${step.label}\n${error.stderr || error.message}`);
      if (done.length) console.error(`Déjà fait : ${done.join(", ")}`);
      const remaining = steps.slice(steps.indexOf(step)).map((s) => `  ${s.command}`);
      console.error(`Pour reprendre, relancez à la main :\n${remaining.join("\n")}`);
      if (step.undo) console.error(`Pour annuler : ${step.undo}`);
      process.exit(1);
    }
  }
}

async function release(opts) {
  checkPreconditions({ requireMainAncestor: true });

  const tag = lastTag();
  if (!tag) fail("Aucun tag vX.Y.Z : lancez d'abord `npm run release -- --init <version>`.");

  const current = tag.replace(/^v/, "");
  const commits = readCommits(`${tag}..HEAD`);
  const level = opts.level || lib.determineBump(commits);
  if (!level) {
    console.log(`Aucun commit feat/fix/perf depuis ${tag} : pas de release.`);
    return;
  }

  const next = lib.bumpVersion(current, level);
  const nextTag = `v${next}`;
  const entry = lib.renderChangelogEntry(next, lib.formatDate(new Date()), commits);

  console.log(`\nRelease ${tag} → ${nextTag} (${level}, ${commits.length} commit(s) publiables)\n`);
  console.log(entry);

  if (opts.dryRun) {
    console.log("--dry-run : rien n'a été modifié.");
    return;
  }
  if (!opts.yes && !(await confirm(`Publier ${nextTag} ? (o/N) `))) {
    console.log("Annulé.");
    return;
  }

  const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, "utf8") : "";
  const touched = setVersionInFiles(next);
  fs.writeFileSync(CHANGELOG, lib.prependToChangelog(existing, entry));

  const notesFile = path.join(os.tmpdir(), `decogestion-${nextTag}-notes.md`);
  fs.writeFileSync(notesFile, lib.releaseNotes(entry));
  const files = [...touched, "CHANGELOG.md"];

  runSteps([
    {
      label: "commit de release",
      command: `git add ${files.join(" ")} && git commit -m "chore(release): ${nextTag}"`,
      undo: `git checkout -- ${files.join(" ")}`,
      action: () => {
        git("add", ...files);
        git("commit", "-m", `chore(release): ${nextTag}`);
      },
    },
    {
      label: `tag ${nextTag}`,
      command: `git tag -a ${nextTag} -m "${nextTag}"`,
      undo: "git reset --soft HEAD~1",
      action: () => git("tag", "-a", nextTag, "-m", nextTag),
    },
    {
      label: "push de dev",
      command: "git push origin dev",
      undo: `git tag -d ${nextTag} && git reset --soft HEAD~1`,
      action: () => git("push", "origin", "dev"),
    },
    {
      label: `push du tag ${nextTag}`,
      command: `git push origin ${nextTag}`,
      action: () => git("push", "origin", nextTag),
    },
    {
      label: "avance de main (fast-forward)",
      command: "git push origin HEAD:main",
      action: () => git("push", "origin", "HEAD:main"),
    },
    {
      label: "release GitHub",
      command: `gh release create ${nextTag} --title ${nextTag} --notes-file "${notesFile}"`,
      action: () => run("gh", ["release", "create", nextTag, "--title", nextTag, "--notes-file", notesFile]),
    },
  ]);

  console.log(`\n✔ ${nextTag} publiée. Pensez à \`npm run build\` avant la copie sur le poste de prod.`);
}

// Une seule fois : rejoint l'historique de main dans dev (fast-forward possible ensuite),
// puis pose le tag de référence sur le commit où package.json est passé à cette version.
async function init(version, opts) {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) fail("Usage : npm run release -- --init X.Y.Z");
  checkPreconditions({ requireMainAncestor: false });
  if (lastTag()) fail(`Un tag de version existe déjà (${lastTag()}) : --init ne sert qu'une fois.`);

  const tag = `v${version}`;
  const needMerge = !succeeds(() => git("merge-base", "--is-ancestor", "origin/main", "HEAD"));
  const introduced = git("log", "--reverse", "--format=%H", "-G", `"version": "${version}"`, "--", "package.json")
    .split("\n")
    .filter(Boolean)[0];
  const target = introduced || git("rev-parse", "HEAD");
  const targetLabel = git("log", "-1", "--format=%h %ad %s", "--date=short", target);

  console.log("\nAmorçage du versioning :");
  if (needMerge) console.log("  1. merge de origin/main dans dev (historique seulement), puis push de dev");
  console.log(`  2. tag ${tag} sur ${targetLabel}`);
  console.log(`  3. push du tag et release GitHub ${tag} « Version de référence »\n`);

  if (opts.dryRun) {
    console.log("--dry-run : rien n'a été modifié.");
    return;
  }
  if (!opts.yes && !(await confirm("Continuer ? (o/N) "))) {
    console.log("Annulé.");
    return;
  }

  if (needMerge) {
    git("merge", "--no-ff", "--no-commit", "origin/main");
    // main ne doit rien apporter de neuf : on refuse un merge qui modifierait le code.
    if (!succeeds(() => git("diff", "--cached", "--quiet"))) {
      git("merge", "--abort");
      fail("origin/main contient des changements absents de dev : fusion à faire à la main.");
    }
    git("commit", "--no-edit");
  }

  runSteps([
    ...(needMerge
      ? [{ label: "push de dev", command: "git push origin dev", action: () => git("push", "origin", "dev") }]
      : []),
    {
      label: `tag ${tag}`,
      command: `git tag -a ${tag} ${target} -m "${tag}"`,
      action: () => git("tag", "-a", tag, target, "-m", tag),
    },
    { label: `push du tag ${tag}`, command: `git push origin ${tag}`, action: () => git("push", "origin", tag) },
    {
      label: "release GitHub",
      command: `gh release create ${tag} --title ${tag} --notes "Version de référence du versioning."`,
      action: () =>
        run("gh", ["release", "create", tag, "--title", tag, "--notes", "Version de référence du versioning."]),
    },
  ]);

  console.log(`\n✔ Versioning amorcé sur ${tag}. Prochaine étape : npm run release`);
}

const opts = parseArgs(process.argv.slice(2));
(opts.init ? init(opts.init, opts) : release(opts)).catch((error) => fail(error.stack || error.message));
```

- [ ] **Step 2 : ajouter le script npm**

Dans `package.json`, sous `"build"`, ajouter :

```json
    "release": "node scripts/release.js",
```

- [ ] **Step 3 : vérifier le refus sur un arbre sale (Review Focus n° 5)**

À ce stade, `scripts/release.js` et `package.json` ne sont pas encore commités : l'arbre est donc « sale ». C'est exactement le cas à tester.

Run : `git status --short` (noter la sortie), puis `npm run release -- --init 2.3.0 --dry-run`
Expected : `✖ Des modifications ne sont pas commitées…`, code de sortie 1. **Aucun fichier modifié** (`git status` identique à avant).

- [ ] **Step 4 : commit, puis dry-run réel sur le dépôt**

```bash
git add scripts/release.js package.json
git commit -m "feat(release): commande npm run release (et --init)"
git push origin dev
```

Run : `npm run release -- --init 2.3.0 --dry-run`
Expected :
```
Amorçage du versioning :
  1. merge de origin/main dans dev (historique seulement), puis push de dev
  2. tag v2.3.0 sur 9dfe1bf 2025-11-18 Changement generation jpg pdf remplacé par apercu
  3. push du tag et release GitHub v2.3.0 « Version de référence »

--dry-run : rien n'a été modifié.
```

Run : `npm run release -- --dry-run`
Expected : `✖ origin/main n'est pas un ancêtre de dev : lancez d'abord …` (normal tant que `--init` n'a pas été fait).

- [ ] **Step 5 : s'arrêter là et demander l'accord explicite de l'utilisateur**

`--init` sans `--dry-run` **publie** : push d'un merge sur `dev`, tag et release GitHub publics. L'exécutant ne le lance **pas** de lui-même. Il présente les sorties des dry-runs à l'utilisateur, qui décide de lancer :
- `npm run release -- --init 2.3.0`
- puis `npm run release -- --dry-run`, pour vérifier la future 2.4.0 et son CHANGELOG ;
- puis `npm run release` pour publier.

---

## Récapitulatif de couverture du spec

| Spec | Task |
|---|---|
| Release : calcul, CHANGELOG, commit/tag/push, avance de main, gh release, reprise après échec | 2, 7 |
| Amorçage (merge main, tag v2.3.0 sur 9dfe1bf, release de référence) | 7 |
| `build-info.json`, `loadAppVersion`, `state.app` | 4 |
| Traçabilité `app_commit` | 5 |
| Alerte via les releases GitHub, `compareVersions`, cache 1 h, tolérance réseau | 1, 4 |
| `GET /version`, `GET /changelog` | 5 |
| Header (version fiable, survol, badge) | 6 |
| « Quoi de neuf » (ouverture auto une fois, manuelle, 1re visite, localStorage protégé) | 3, 6 |
