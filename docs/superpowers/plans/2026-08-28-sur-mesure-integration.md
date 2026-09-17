# Intégration propre des panneaux sur-mesure — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire du sur-mesure (panneaux à cote client, `sfamille = 'SMES'`) un concept explicite : détecté une seule fois côté serveur, propagé dans la payload API, consommé par le front, persisté sur `Deco` (flag + orientation), visible (badge + filtre), exporté (colonne CSV), avec la cote client exacte en commentaire.

**Architecture:** Un util pur `server/src/gamesys/utils/surMesure.js` détecte et parse. `dossierService.buildVisualReferences` pose des champs additifs sur les références visuelles. `dossierApiController.normalizeDossierApiPayload` les propage dans `visualJobs`. Le front (`DossierAutocomplete.buildRows`, `App.jsx`) les consomme sans redétecter. `jobsController` / `jobsList` les persistent sur `Deco`. Le hook `Deco` saute la résolution Ref\* pour les sur-mesure **visuel** (hors catalogue par nature).

**Tech Stack:** Node.js CommonJS (backend), React/Vite (frontend `client/`), Mongoose, Mocha + Chai (`npm test` → `mocha "test/**/*.test.js" --timeout 10000 --exit`). ODBC/Gamesys non requis pour les tests (fixtures en dur).

**Spec:** `docs/superpowers/specs/2026-08-28-sur-mesure-integration-design.md`

## Global Constraints

- Tests : `npm test` (mocha). Un fichier : `npx mocha test/<fichier> --timeout 10000`.
- Ne **jamais** lancer `npm run format` (reformate ~70 fichiers non liés). Formater à la main les fichiers neufs seulement.
- Backend CommonJS (`require`/`module.exports`). Frontend ESM (`import`).
- Tous les nouveaux champs de la payload API sont **additifs** — ne rien retirer, ne pas renommer `reference`.
- Le champ `reference` d'une `visualReference` **n'est jamais réassigné** (le nettoyer collapse deux orientations sous la même clé `uniqueBy`).
- Le nom nettoyé du visuel vit dans le **nouveau** champ `deco`.
- Convention `format` : `<largeur>x<hauteur>` en cm, ex `100x210`. Division par 10 si valeur > 500 (mm → cm).
- Finitions sur-mesure : `LISSE` | `TEXTUREE` | `COULEUR` | `BROSSE` (dé-accentué, majuscules) ou `""`.
- Orientations : `GAUCHE` | `DROIT` | `CENTRE` ou `null`.
- Commits fréquents, un par tâche. Branche courante : `dev` (pas `main`).

---

### Task 1: Util `surMesure.js`

**Files:**
- Create: `server/src/gamesys/utils/surMesure.js`
- Test: `test/unit/surMesure.test.js`

**Interfaces:**
- Consumes: `require("./reference")` → `isTeinteMasseModel`, `extractOrientationHint` (déjà exportés).
- Produces:
  - `isSurMesureLabel(endvIdentif: string): boolean`
  - `parseSurMesureGabarit(endvIdentif: string, stockCodeTarif?: string): { format: string, finition: string }` — `format`/`finition` peuvent être `""`.
  - `parseSurMesureRefClient(endvRefClient: string): { name: string, orientation: string|null, printFormat: string|null, finishHint: string|null }` — `name` peut être `""`.
  - `classifySurMesure({ name: string }): "teinte_masse" | "visuel"`

- [ ] **Step 1: Write the failing test** — `test/unit/surMesure.test.js`

```js
const { expect } = require("chai");
const {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
} = require("../../server/src/gamesys/utils/surMesure");

describe("surMesure util", () => {
  describe("isSurMesureLabel()", () => {
    it("reconnaît le gabarit SMES", () => {
      expect(isSurMesureLabel("Panneau déco sur-mesure 125x210 Finition Lisse")).to.equal(true);
    });
    it("reconnaît la forme 'Format fini : ...'", () => {
      expect(isSurMesureLabel(" Format fini : 100.0 x 255.0 cm ")).to.equal(true);
    });
    it("rejette un libellé catalogue standard", () => {
      expect(isSurMesureLabel("Travertino 125 x 255 cm (M)")).to.equal(false);
    });
    it("rejette vide / null", () => {
      expect(isSurMesureLabel("")).to.equal(false);
      expect(isSurMesureLabel(null)).to.equal(false);
    });
  });

  describe("parseSurMesureGabarit()", () => {
    it("extrait format + finition (Finition Lisse)", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 100x210 Finition Lisse"))
        .to.deep.equal({ format: "100x210", finition: "LISSE" });
    });
    it("extrait la finition Texturée dé-accentuée", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 125x210 Finition Texturée").finition)
        .to.equal("TEXTUREE");
    });
    it("gère la finition sans le mot 'Finition' (ex: '... 150x255 Brossé')", () => {
      expect(parseSurMesureGabarit("Panneau déco sur-mesure 150x255 Brossé").finition)
        .to.equal("BROSSE");
    });
    it("gère 'Format fini : 100.0 x 255.0 cm' → format 100x255, finition ''", () => {
      expect(parseSurMesureGabarit(" Format fini : 100.0 x 255.0 cm "))
        .to.deep.equal({ format: "100x255", finition: "" });
    });
    it("replie sur le suffixe du code tarif SMES quand le libellé n'a pas la finition", () => {
      expect(parseSurMesureGabarit("Format fini : 125.0 x 210.0 cm", "EC-SM125X210L").finition)
        .to.equal("LISSE");
    });
  });

  describe("parseSurMesureRefClient()", () => {
    it("ARCHE BEIGE CENTRE 86.9 X 201.5 MAT", () => {
      expect(parseSurMesureRefClient("ARCHE BEIGE CENTRE 86.9 X 201.5 MAT")).to.deep.equal({
        name: "ARCHE BEIGE",
        orientation: "CENTRE",
        printFormat: "86.9x201.5",
        finishHint: "MAT",
      });
    });
    it("BLANC ZERO 90 x 210 MAT (sans orientation)", () => {
      expect(parseSurMesureRefClient("BLANC ZERO 90 x 210 MAT")).to.deep.equal({
        name: "BLANC ZERO",
        orientation: null,
        printFormat: "90x210",
        finishHint: "MAT",
      });
    });
    it("BAMBUSA DROITE 80 X 230 MAT → orientation DROIT", () => {
      const r = parseSurMesureRefClient("BAMBUSA DROITE 80 X 230 MAT");
      expect(r.name).to.equal("BAMBUSA");
      expect(r.orientation).to.equal("DROIT");
      expect(r.printFormat).to.equal("80x230");
    });
    it("décimale virgule → point", () => {
      expect(parseSurMesureRefClient("X 86,9 X 201,5 MAT").printFormat).to.equal("86.9x201.5");
    });
    it("chaîne vide", () => {
      expect(parseSurMesureRefClient("")).to.deep.equal({
        name: "", orientation: null, printFormat: null, finishHint: null,
      });
    });
  });

  describe("classifySurMesure()", () => {
    it("teinte connue → teinte_masse", () => {
      expect(classifySurMesure({ name: "BLANC ZERO" })).to.equal("teinte_masse");
    });
    it("nom de visuel → visuel", () => {
      expect(classifySurMesure({ name: "ARCHE BEIGE" })).to.equal("visuel");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/surMesure.test.js --timeout 10000`
Expected: FAIL — `Cannot find module '../../server/src/gamesys/utils/surMesure'`

- [ ] **Step 3: Write minimal implementation** — `server/src/gamesys/utils/surMesure.js`

```js
const { isTeinteMasseModel, extractOrientationHint } = require("./reference");

// dé-accente + majuscules, sans toucher aux espaces/x
function deaccentUpper(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

const SUR_MESURE_LABEL_RE = /^\s*(?:PANNEAU\s+DECO\s+SUR[-\s]?MESURE\b|FORMAT\s+FINI\s*:)/;

function isSurMesureLabel(endvIdentif) {
  if (!endvIdentif) return false;
  return SUR_MESURE_LABEL_RE.test(deaccentUpper(endvIdentif));
}

const FINITIONS = ["LISSE", "TEXTUREE", "COULEUR", "BROSSE"];
const FINITION_BY_CODE = { L: "LISSE", T: "TEXTUREE", C: "COULEUR", B: "BROSSE" };

function normFormat(w, h) {
  const nw = Number(w);
  const nh = Number(h);
  if (!Number.isFinite(nw) || !Number.isFinite(nh)) return "";
  const cw = nw > 500 ? Math.round(nw / 10) : Math.round(nw);
  const ch = nh > 500 ? Math.round(nh / 10) : Math.round(nh);
  return `${cw}x${ch}`;
}

function parseSurMesureGabarit(endvIdentif, stockCodeTarif) {
  const text = deaccentUpper(endvIdentif);

  let format = "";
  const m = text.match(/(\d{2,4}(?:\.\d+)?)\s*X\s*(\d{2,4}(?:\.\d+)?)/);
  if (m) format = normFormat(m[1], m[2]);

  let finition = "";
  // ce qui reste après les dimensions (+ 'CM' optionnel), sans le mot 'FINITION'
  const tail = text
    .replace(/^.*?\d{2,4}(?:\.\d+)?\s*X\s*\d{2,4}(?:\.\d+)?\s*(?:CM)?\s*/, "")
    .replace(/^FINITION\s+/, "")
    .trim();
  if (FINITIONS.includes(tail)) finition = tail;

  if (!finition && stockCodeTarif) {
    const cm = deaccentUpper(stockCodeTarif).match(/-SM\d+X\d+([LTCB])$/);
    if (cm) finition = FINITION_BY_CODE[cm[1]];
  }

  return { format, finition };
}

function parseSurMesureRefClient(endvRefClient) {
  const raw = String(endvRefClient || "").trim();
  if (!raw) return { name: "", orientation: null, printFormat: null, finishHint: null };

  const upper = deaccentUpper(raw);

  const orientation = extractOrientationHint(null, upper);

  let printFormat = null;
  const pf = upper.match(/(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)/);
  if (pf) printFormat = `${pf[1].replace(",", ".")}x${pf[2].replace(",", ".")}`;

  let finishHint = null;
  if (/\bBRILLANT\b/.test(upper)) finishHint = "BRILLANT";
  else if (/\bMAT\b/.test(upper)) finishHint = "MAT";

  const name = upper
    .replace(/\b(?:GAUCHE|DROITE|DROIT|DROT|CENTRE)\b/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*X\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b(?:MAT|BRILLANT|CM)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { name, orientation, printFormat, finishHint };
}

function classifySurMesure({ name } = {}) {
  return isTeinteMasseModel(name) ? "teinte_masse" : "visuel";
}

module.exports = {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/surMesure.test.js --timeout 10000`
Expected: PASS (tous les `it`)

- [ ] **Step 5: Commit**

```bash
git add server/src/gamesys/utils/surMesure.js test/unit/surMesure.test.js
git commit -m "feat(sur-mesure): util pur de detection et parsing (surMesure.js)"
```

---

### Task 2: Enrichissement `dossierService.buildVisualReferences`

**Files:**
- Modify: `server/src/gamesys/services/dossierService.js` — `buildVisualReferences` (≈ lignes 411-464)
- Test: `test/unit/dossierService.buildVisualReferences.test.js` (étendu)

**Interfaces:**
- Consumes: `surMesure.js` de la Task 1 ; la ligne stock retenue (`stockReference`) porte `sousFamille` (= `st_art_sfamille`) et `codeTarif`.
- Produces: chaque entrée `visualReferences` d'une ligne sur-mesure porte en plus : `surMesure: true`, `surMesureKind: "visuel"|"teinte_masse"`, `deco?: string`, `finition?: string`, `format?: string`, `orientation?: string`, `printFormat?: string`. `reference` **inchangé**.

- [ ] **Step 1: Write the failing test** — ajouter à `test/unit/dossierService.buildVisualReferences.test.js`

```js
describe("dossierService.buildVisualReferences() — sur-mesure", () => {
  it("enrichit une ligne SMES détectée par le libellé gabarit (signal B, sans stock)", () => {
    const enteteDevis = [
      {
        endv_identif: "Panneau déco sur-mesure 100x210 Finition Lisse",
        endv_ref_client: "BLANC ZERO 90 x 210 MAT",
        endv_px_total: 185.08,
        endv_quant: 1,
      },
    ];

    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");

    expect(r.surMesure).to.equal(true);
    expect(r.surMesureKind).to.equal("teinte_masse");
    expect(r.deco).to.equal("BLANC ZERO");
    expect(r.finition).to.equal("LISSE");
    expect(r.format).to.equal("100x210");
    expect(r.printFormat).to.equal("90x210");
    expect(r.reference).to.equal("BLANC ZERO 90 x 210 MAT"); // INCHANGÉ
  });

  it("classe 'visuel' un vrai visuel sur-mesure et porte l'orientation", () => {
    const enteteDevis = [
      {
        endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée",
        endv_ref_client: "ARCHE BEIGE CENTRE 86.9 X 201.5 MAT",
        endv_px_total: 199,
        endv_quant: 1,
      },
    ];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");
    expect(r.surMesureKind).to.equal("visuel");
    expect(r.deco).to.equal("ARCHE BEIGE");
    expect(r.orientation).to.equal("CENTRE");
    expect(r.finition).to.equal("TEXTUREE");
    expect(r.format).to.equal("125x210");
    expect(r.printFormat).to.equal("86.9x201.5");
  });

  it("détecte via st_art_sfamille='SMES' même si le libellé est 'Format fini : ...' (signal A)", () => {
    const enteteDevis = [
      { endv_identif: "Format fini : 100.0 x 255.0 cm", endv_ref_client: "BAMBUSA DROITE 80 X 230 MAT", endv_px_total: 229.39, endv_quant: 1 },
    ];
    const stock = [
      { reference: "MU-SM100X255T", modele: "MU-SM100X255T", libelle: "Panneau déco sur-mesure 100x255 Finition Texturée", codeTarif: "MU-SM100X255T", sousFamille: "SMES", type: "PANO" },
    ];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, stock, "");
    expect(r.surMesure).to.equal(true);
    expect(r.deco).to.equal("BAMBUSA");
    expect(r.orientation).to.equal("DROIT");
    expect(r.finition).to.equal("TEXTUREE"); // via suffixe code tarif 'T'
  });

  it("ne touche pas une ligne catalogue standard", () => {
    const enteteDevis = [{ endv_identif: "VISUEL MOSAIQUE", endv_px_total: 243.69, endv_ref_client: "" }];
    const [r] = require("../../server/src/gamesys/services/dossierService")
      .buildVisualReferences(enteteDevis, [], "");
    expect(r.surMesure).to.equal(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/dossierService.buildVisualReferences.test.js --timeout 10000`
Expected: FAIL sur les nouveaux `it` (`surMesure` undefined). Les `it` BAMBUSA existants passent toujours.

- [ ] **Step 3: Write minimal implementation**

Dans `server/src/gamesys/services/dossierService.js`, en tête (près des autres `require` de `./utils/...`) :

```js
const {
  isSurMesureLabel,
  parseSurMesureGabarit,
  parseSurMesureRefClient,
  classifySurMesure,
} = require("../utils/surMesure");
```

Dans `buildVisualReferences`, à l'intérieur du `.map((entete) => { ... })`, **juste avant le `return {`** qui construit l'objet visuel :

```js
        const smSfamille = String(stockReference?.sousFamille || "").toUpperCase() === "SMES";
        const isSM = smSfamille || isSurMesureLabel(entete.endv_identif);
        let surMesureFields = {};
        if (isSM) {
          const gab = parseSurMesureGabarit(entete.endv_identif, stockReference?.codeTarif);
          const rc = parseSurMesureRefClient(explicitReference);
          surMesureFields = {
            surMesure: true,
            surMesureKind: classifySurMesure(rc),
            deco: rc.name || undefined,
            finition: gab.finition || undefined,
            format: gab.format || undefined,
            orientation: rc.orientation || undefined,
            printFormat: rc.printFormat || undefined,
          };
        }
```

Puis dans l'objet retourné, ajouter `...surMesureFields,` **après** `category: "visuel",` (l'ordre n'importe pas, mais placer en dernier pour la lisibilité) :

```js
        return {
          reference,
          libelle: entete.endv_identif || stockReference?.libelle || reference,
          endv_px_total: entete.endv_px_total,
          endv_quant: entete.endv_quant,
          articleReference: stockReference?.reference,
          modele: stockReference?.modele,
          gencod: stockReference?.gencod,
          codeTarif: stockReference?.codeTarif,
          famille: stockReference?.famille,
          sousFamille: stockReference?.sousFamille,
          type: stockReference?.type,
          source: stockReference ? "fs_stock" : "fd_entete_devi",
          category: "visuel",
          ...surMesureFields,
        };
```

> Note : `explicitReference` est déjà calculé plus haut dans le `.map` (`const explicitReference = getVisualReferenceFromEntete(entete);`). `fetchSousDossiersVisuels` réutilise `buildVisualReferences` → enrichi automatiquement, aucune modif.

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/dossierService.buildVisualReferences.test.js --timeout 10000`
Expected: PASS (nouveaux + anciens)

- [ ] **Step 5: Commit**

```bash
git add server/src/gamesys/services/dossierService.js test/unit/dossierService.buildVisualReferences.test.js
git commit -m "feat(sur-mesure): buildVisualReferences pose surMesure/deco/finition/format/orientation/printFormat"
```

---

### Task 3: Propagation payload API

**Files:**
- Modify: `server/src/controllers/dossierApiController.js` — `extractVisualFormat` (≈ l.23-30), `normalizeDossierApiPayload` (le `.map` qui construit chaque `visualJob`, ≈ l.84-125 ; + le bloc `warnings`)
- Test: `test/unit/dossierApiController.normalizeDossierApiPayload.test.js` (étendu)

**Interfaces:**
- Consumes: les champs `surMesure`/`surMesureKind`/`deco`/`finition`/`format`/`orientation`/`printFormat` posés par la Task 2 sur `payload.sousDossiers[].visualReferences[]`.
- Produces: chaque `visualJob` porte `surMesure: boolean`, `surMesureKind: string|null`, `deco: string|null`, `finition: string|null`, `orientation: string|null`, `printFormat: string|null`. `extractVisualFormat` renvoie `visualRef.format` quand `visualRef.surMesure`.

- [ ] **Step 1: Write the failing test** — ajouter à `test/unit/dossierApiController.normalizeDossierApiPayload.test.js`

```js
describe("normalizeDossierApiPayload() — sur-mesure", () => {
  const { normalizeDossierApiPayload } = require("../../server/src/controllers/dossierApiController");

  function payloadWithVisualRef(vr) {
    return {
      numero: "167302",
      clientName: "LM",
      sousDossiers: [
        {
          sousNumero: "05",
          commande: "167302/05",
          enteteDevis: [{ endv_identif: vr.libelle, endv_quant: 1, endv_px_total: 185.08 }],
          livraison: [{ bo_ville: "COLOMIERS" }],
          visualReferences: [vr],
        },
      ],
    };
  }

  it("propage les champs sur-mesure dans visualJobs et prend visualRef.format", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({
        reference: "BLANC ZERO 90 x 210 MAT",
        libelle: "Panneau déco sur-mesure 100x210 Finition Lisse",
        surMesure: true,
        surMesureKind: "teinte_masse",
        deco: "BLANC ZERO",
        finition: "LISSE",
        format: "100x210",
        orientation: undefined,
        printFormat: "90x210",
      })
    );
    const job = out.visualJobs[0];
    expect(job.surMesure).to.equal(true);
    expect(job.surMesureKind).to.equal("teinte_masse");
    expect(job.deco).to.equal("BLANC ZERO");
    expect(job.finition).to.equal("LISSE");
    expect(job.printFormat).to.equal("90x210");
    expect(job.orientation).to.equal(null);
    expect(job.formatVisu).to.equal("100x210"); // vient de visualRef.format
  });

  it("émet un warning si sur-mesure sans nom exploitable", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({
        reference: "Panneau déco sur-mesure 100x210 Finition Lisse",
        libelle: "Panneau déco sur-mesure 100x210 Finition Lisse",
        surMesure: true,
        surMesureKind: "visuel",
        deco: undefined,
        format: "100x210",
      })
    );
    expect(out.warnings.some((w) => /sur-mesure sans nom/i.test(w))).to.equal(true);
  });

  it("laisse surMesure=false pour un visuel catalogue", () => {
    const out = normalizeDossierApiPayload(
      payloadWithVisualRef({ reference: "TRAVERTI-125255", libelle: "Travertino 125 x 255 cm (M)" })
    );
    expect(out.visualJobs[0].surMesure).to.equal(false);
    expect(out.visualJobs[0].surMesureKind).to.equal(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/dossierApiController.normalizeDossierApiPayload.test.js --timeout 10000`
Expected: FAIL (`job.surMesure` undefined ; pas de warning)

- [ ] **Step 3: Write minimal implementation**

Dans `dossierApiController.js`, `extractVisualFormat` :

```js
function extractVisualFormat(visualRef, sousDossier) {
  if (visualRef?.surMesure && visualRef?.format) return visualRef.format;
  return (
    parseFormat(visualRef?.libelle) ||
    parseFormat(visualRef?.codeTarif) ||
    parseFormat(sousDossier?.dossier?.dos_imp_1_ele) ||
    parseFormat(sousDossier?.dossier?.dos_forme_et_format)
  );
}
```

Dans `normalizeDossierApiPayload`, dans le `return visualReferences.map((visualRef, visualIndex) => { ... })`, ajouter à l'objet retourné (à la suite de `prix: prixSousDossier,`) :

```js
        surMesure: visualRef?.surMesure || false,
        surMesureKind: visualRef?.surMesureKind || null,
        deco: visualRef?.deco || null,
        finition: visualRef?.finition || null,
        orientation: visualRef?.orientation || null,
        printFormat: visualRef?.printFormat || null,
```

Toujours dans ce `.map`, après le `if (reference && reference === libelle) { warnings.push(...) }` existant :

```js
      if (visualRef?.surMesure && !visualRef?.deco) {
        warnings.push(`Sur-mesure sans nom exploitable (endv_ref_client vide) pour ${commande}`);
      }
```

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/dossierApiController.normalizeDossierApiPayload.test.js test/integration/dossierApi.teinteMasse.test.js --timeout 10000`
Expected: PASS (nouveaux + existants)

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/dossierApiController.js test/unit/dossierApiController.normalizeDossierApiPayload.test.js
git commit -m "feat(sur-mesure): propage les champs sur-mesure dans la payload /dossier-api"
```

---

### Task 4: Schéma `Deco` + hook

**Files:**
- Modify: `server/src/models/Deco.js` — schéma (après `comment`), `pre("save")` (≈ l.80-93), `pre("findOneAndUpdate")` (≈ l.96-125)
- Test: `test/unit/decoSurMesureHook.test.js` (nouveau)

**Interfaces:**
- Consumes: rien de nouveau ; les champs `surMesure`/`surMesureKind`/`orientation` arrivent via `data` de `saveDeco` (Task 6).
- Produces: `Deco` accepte `surMesure: Boolean`, `surMesureKind: String`, `orientation: String`. Le hook **saute** `resolveRefFields` quand `surMesureKind === "visuel"`.

- [ ] **Step 1: Write the failing test** — `test/unit/decoSurMesureHook.test.js`

```js
const { expect } = require("chai");
const { connect, disconnect } = require("../helpers/mongoTestHelper");

// mongoTestHelper.connect() démarre un MongoMemoryServer vide : aucune collection Ref*,
// donc resolveRefFields renvoie toujours { matched:false, finition:"" } — ce qui est
// exactement le comportement attendu par les assertions ci-dessous.
describe("Deco — hook sur-mesure (skip Ref* si surMesureKind === 'visuel')", function () {
  this.timeout(30000);
  let Deco;

  before(async () => {
    await connect();
    Deco = require("../../server/src/models/Deco");
  });
  after(async () => {
    await disconnect();
  });

  it("un doc surMesureKind='visuel' conserve deco/finition/format venus de Gamesys", async () => {
    const doc = await Deco.create({
      numCmd: 999001, client: "LM",
      ref: "ARCHE BEIGE", surMesure: true, surMesureKind: "visuel",
      deco: "ARCHE BEIGE", finition: "TEXTUREE", format: "125x210", orientation: "CENTRE",
    });
    expect(doc.deco).to.equal("ARCHE BEIGE");
    expect(doc.finition).to.equal("TEXTUREE");
    expect(doc.format).to.equal("125x210");
  });

  it("un doc surMesureKind='teinte_masse' passe par la résolution Ref* normale", async () => {
    // ref bidon absente de Ref* → resolveRefFields renvoie {matched:false, finition:""}
    const doc = await Deco.create({
      numCmd: 999002, client: "LM",
      ref: "ZZZ-INEXISTANT", surMesure: true, surMesureKind: "teinte_masse",
      deco: "PLACEHOLDER", finition: "PLACEHOLDER", format: "100x210",
    });
    // le hook a tourné : finition remise à "" (comportement teinte-masse existant)
    expect(doc.finition).to.equal("");
  });

  it("un doc non sur-mesure garde la résolution Ref* (non-régression)", async () => {
    const doc = await Deco.create({
      numCmd: 999003, client: "LM", ref: "ZZZ-INEXISTANT2",
      deco: "PLACEHOLDER", finition: "PLACEHOLDER",
    });
    expect(doc.finition).to.equal("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/decoSurMesureHook.test.js --timeout 30000`
Expected: FAIL — le 1er `it` : `finition` vaut `""` (le hook a écrasé) au lieu de `"TEXTUREE"`.

- [ ] **Step 3: Write minimal implementation**

`server/src/models/Deco.js`, schéma — ajouter après la ligne `comment: { type: String, default: "" },` :

```js
  surMesure: { type: Boolean, default: false },
  surMesureKind: { type: String }, // "visuel" | "teinte_masse" | (vide)
  orientation: { type: String },   // GAUCHE | CENTRE | DROIT | (vide)
```

Hook `pre("save")` — remplacer la condition :

```js
decoSchema.pre("save", async function (next) {
  try {
    if (this.isModified("ref") && this.ref && this.surMesureKind !== "visuel") {
      const refFields = await resolveRefFields(this.client, this.ref);
      this.finition = refFields.finition;
      this.format = refFields.format ?? this.format;
      this.deco = refFields.deco ?? this.deco;
    }
    next();
  } catch (err) {
    logger.error("Erreur pre-save:", err);
    next(err);
  }
});
```

Hook `pre("findOneAndUpdate")` — remplacer `if (data.ref) {` par :

```js
    const kind = update.$set ? update.$set.surMesureKind : update.surMesureKind;
    if (data.ref && kind !== "visuel") {
```

(le reste du hook inchangé)

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/decoSurMesureHook.test.js --timeout 30000`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Deco.js test/unit/decoSurMesureHook.test.js
git commit -m "feat(sur-mesure): champs Deco surMesure/surMesureKind/orientation + hook skip Ref* pour visuel"
```

---

### Task 5: `jobsList.createJob` — argument `surMesureData`

**Files:**
- Modify: `server/src/jobsList.js` — signature + objet `newJob`
- Test: `test/unit/jobsList.createJob.test.js` (étendu)

**Interfaces:**
- Consumes: appelé par `jobsController.addJob` (Task 6) avec un dernier argument `surMesureData`.
- Produces: `createJob(...args33)` où `args33` = `surMesureData: { surMesure?: boolean, surMesureKind?: string, orientation?: string, printFormat?: string }`. Le job résultant porte `surMesure` (bool), `surMesureKind`, `orientation`, `printFormat`.

- [ ] **Step 1: Write the failing test** — ajouter à `test/unit/jobsList.createJob.test.js`

```js
describe("jobsList.createJob() — sur-mesure", () => {
  it("porte surMesureData sur le job", () => {
    const job = createJob(
      "LM", "167302", 0, "COLOMIERS", "100x210", "", "Deco_Std_101x215",
      "BLANC ZERO MAT", "", "94953671", 0, "1",
      "", "", "server/public/write", "server/public/PRINTSA1/x", "server/public/PRINTSA1/x2",
      0, false, false, true /*teinteMasse*/, false, false, "LM", null, null,
      185.08, undefined, "05", undefined,
      { surMesure: true, surMesureKind: "teinte_masse", orientation: "", printFormat: "90x210" },
    );
    expect(job.surMesure).to.equal(true);
    expect(job.surMesureKind).to.equal("teinte_masse");
    expect(job.printFormat).to.equal("90x210");
  });

  it("défaut sans surMesureData : surMesure=false", () => {
    const job = createJob(
      "LM", "1", 0, "P", "100x255", "", "Deco_Std_101x215", "v.pdf", "", "94953707", 0, "1",
      "p", "", "w", "j", "j2", 0, false, false, false, false, false, "LM", null, null, undefined, undefined, undefined, undefined,
    );
    expect(job.surMesure).to.equal(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/jobsList.createJob.test.js --timeout 10000`
Expected: FAIL (`job.surMesure` undefined)

- [ ] **Step 3: Write minimal implementation** — `server/src/jobsList.js`

Ajouter `surMesureData` en **dernier** paramètre de `createJob(...)` (après `sousDossier2,`) :

```js
function createJob(
  client, cmd, cmd2, ville, format, format2, formatPlaque, visuel, visuel2, ref, ref2, ex,
  visuPath, visuPath2, writePath, jpgName, jpgName2, perte, reg, cut, teinteMasse, stock, prodBlanc,
  client2, refDbData, refDbData2, prix, prix2, sousDossier, sousDossier2,
  surMesureData,
) {
```

Dans l'objet `newJob`, ajouter avant la `}` finale :

```js
    surMesure: !!(surMesureData && surMesureData.surMesure),
    surMesureKind: surMesureData?.surMesureKind || undefined,
    orientation: surMesureData?.orientation || undefined,
    printFormat: surMesureData?.printFormat || undefined,
```

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/jobsList.createJob.test.js --timeout 10000`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/jobsList.js test/unit/jobsList.createJob.test.js
git commit -m "feat(sur-mesure): createJob accepte surMesureData"
```

---

### Task 6: `jobsController` — lecture body, persistance, comment, CSV

**Files:**
- Create: `server/src/utils/coteClient.js` (fonction pure `buildCoteClientComment` — module isolé pour être testable sans charger `jobsController` et ses dépendances lourdes : `../app`, `queueService`, etc.)
- Modify: `server/src/controllers/jobsController.js` — `require` du nouvel util ; `addJob` (`data` ≈ l.158-181 ; appel `createJob` ≈ l.429-460), `runJobs`/`saveDeco` (≈ l.713-798), export CSV (≈ l.1287-1302)
- Test: `test/unit/coteClient.test.js`

**Interfaces:**
- Consumes: `req.body.surMesure` (bool), `req.body.surMesureKind`, `req.body.orientation`, `req.body.printFormat` ; `createJob(..., surMesureData)` de la Task 5 ; `getPrixVisuel({ ..., orientation })` de la Task 7.
- Produces: le doc `Deco` sauvé porte `surMesure`, `surMesureKind`, `orientation` ; `comment` contient `"Cote client : <w> × <h> cm"` quand `printFormat` présent. Colonne CSV `surMesure`.

`jobExecution.test.js` est un test d'intégration lourd (**serveur requis sur :8000**) — pas de harness unitaire réutilisable pour `saveDeco`. Le déliverable testé de cette tâche est donc la **fonction pure `buildCoteClientComment`** (module isolé `server/src/utils/coteClient.js`) ; la persistance des champs `surMesure`/`surMesureKind`/`orientation` et du `comment` est vérifiée par le **Test global** (manuel, base Test).

- [ ] **Step 1: Write the failing test** — `test/unit/coteClient.test.js`

```js
const { expect } = require("chai");
const { buildCoteClientComment } = require("../../server/src/utils/coteClient");

describe("coteClient.buildCoteClientComment()", () => {
  it("compose la cote client (décimale FR)", () => {
    expect(buildCoteClientComment("86.9x201.5", "")).to.equal("Cote client : 86,9 × 201,5 cm");
  });
  it("entiers", () => {
    expect(buildCoteClientComment("90x210", "")).to.equal("Cote client : 90 × 210 cm");
  });
  it("concatène à un commentaire existant avec ' — '", () => {
    expect(buildCoteClientComment("90x210", "Pris en stock le 01/01"))
      .to.equal("Pris en stock le 01/01 — Cote client : 90 × 210 cm");
  });
  it("printFormat vide → commentaire inchangé", () => {
    expect(buildCoteClientComment(null, "abc")).to.equal("abc");
    expect(buildCoteClientComment("", "")).to.equal("");
  });
  it("printFormat non parsable → commentaire inchangé", () => {
    expect(buildCoteClientComment("nawak", "abc")).to.equal("abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/coteClient.test.js --timeout 10000`
Expected: FAIL — `Cannot find module '../../server/src/utils/coteClient'`.

- [ ] **Step 3: Write minimal implementation** — `server/src/controllers/jobsController.js`

**(a) `addJob` — lire le body.** Dans l'objet `data` (l.158-181), ajouter :

```js
    surMesure: req.body.surMesure,
    surMesureKind: req.body.surMesureKind,
    orientation: req.body.orientation,
    printFormat: req.body.printFormat,
```

**(b) `addJob` — passer à `createJob`.** À l'appel `createJob(...)` (l.429-460), ajouter en **dernier** argument (après `data.sousDossier2,`) :

```js
    {
      surMesure: !!data.surMesure,
      surMesureKind: data.surMesureKind || undefined,
      orientation: data.orientation || undefined,
      printFormat: data.printFormat || undefined,
    },
```

**(c) Nouveau module `server/src/utils/coteClient.js` :**

```js
// "86.9x201.5" -> "Cote client : 86,9 × 201,5 cm", concaténé à un commentaire existant.
function buildCoteClientComment(printFormat, existingComment = "") {
  if (!printFormat) return existingComment || "";
  const m = String(printFormat).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return existingComment || "";
  const fr = (n) => String(n).replace(".", ",");
  const cote = `Cote client : ${fr(m[1])} × ${fr(m[2])} cm`;
  return existingComment ? `${existingComment} — ${cote}` : cote;
}

module.exports = { buildCoteClientComment };
```

Dans `jobsController.js`, ajouter aux `require` du haut :

```js
const { buildCoteClientComment } = require("../utils/coteClient");
```

**(d) `saveDeco` — persistance + comment + orientation vers getPrixVisuel.** Dans `saveDeco` (l.713-798) :

- au calcul du prix, passer `orientation` :

```js
          prix = await getPrixVisuel({
            cmd, ref: safeRef, deco: visuel, format: resolvedFormat, soleDoc,
            orientation: job.orientation || undefined,
          });
```

- dans l'objet `data` (l.769-796), remplacer la ligne `comment: isStock ? \`Pris en stock le ...\` : "",` et ajouter les champs :

```js
      comment: buildCoteClientComment(job.printFormat, isStock ? `Pris en stock le ${new Date().toLocaleString()}` : ""),
      prodBlanc: !!job.prodBlanc,
      surMesure: !!job.surMesure,
      surMesureKind: job.surMesureKind || undefined,
      orientation: job.orientation || undefined,
```

**(e) Export CSV.** Ligne d'en-tête (l.1287) :

```js
    res.write("date,client,numCmd,mag,deco,ref,format,finition,ex,temps,perte,prodBlanc,surMesure\n");
```

Dans le `line` (l.1289-1303), ajouter en dernier élément du tableau avant `.join(",")` :

```js
        entry.surMesure ? 1 : 0,
```

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/coteClient.test.js --timeout 10000` puis `npm test`
Expected: PASS (`coteClient` + suite complète — `credences.test.js`, `dossierApi.teinteMasse.test.js`, etc. inchangés)

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/coteClient.js server/src/controllers/jobsController.js test/unit/coteClient.test.js
git commit -m "feat(sur-mesure): jobsController persiste surMesure + comment 'Cote client' + colonne CSV"
```

---

### Task 7: `orientation` explicite dans les services de prix

**Files:**
- Modify: `server/src/services/decoPrixVisuelBackfillService.js` — `matchPrixVisuel` (l.20-98), appels dans `backfillDecoPrixVisuel` (l.135) et `repairDecoPrixVisuel` (l.197)
- Modify: `server/src/services/profilsKitsService.js` — `getPrixVisuel` (l.64-146)
- Test: `test/unit/decoPrixVisuelBackfillService.test.js` (étendu)

**Interfaces:**
- Consumes: `saveDeco` (Task 6) passe `orientation` à `getPrixVisuel` ; les backfills passent `doc.orientation`.
- Produces: `matchPrixVisuel(enteteRows, { ref, deco, format, soleDoc, orientation })` et `getPrixVisuel({ cmd, ref, deco, format, soleDoc, orientation })` — `orientation` optionnel, utilisé tel quel si fourni, sinon repli sur `extractOrientationHint(ref, deco)`.

- [ ] **Step 1: Write the failing test** — ajouter à `test/unit/decoPrixVisuelBackfillService.test.js`

```js
it("désambiguïse par le paramètre orientation quand deco est nettoyé (pas d'orientation dans deco/ref)", () => {
  // DROIT en 1er : sans le param, matchPrixVisuel renvoie candidates[0] = 199.0 → le test échoue.
  const rows = [
    { endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée", endv_px_total: 199.0,  endv_ref_client: "ARCHE BEIGE DROIT 117.8 X 201.5 MAT" },
    { endv_identif: "Panneau déco sur-mesure 125x210 Finition Texturée", endv_px_total: 230.46, endv_ref_client: "ARCHE BEIGE GAUCHE 119.6 X 201.5 MAT" },
  ];
  const prix = matchPrixVisuel(rows, { ref: "ARCHE BEIGE", deco: "ARCHE BEIGE", format: "125x210", orientation: "GAUCHE" });
  expect(prix).to.equal(230.46);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/decoPrixVisuelBackfillService.test.js --timeout 10000`
Expected: FAIL — sans le param `orientation`, `extractOrientationHint("ARCHE BEIGE", "ARCHE BEIGE")` renvoie `null`, aucune désambiguïsation, `matchPrixVisuel` renvoie `candidates[0]` = **199.0** ≠ 230.46 attendu.

- [ ] **Step 3: Write minimal implementation**

`decoPrixVisuelBackfillService.js` — signature :

```js
function matchPrixVisuel(enteteRows, { ref, deco, format, soleDoc = false, orientation = null }) {
```

Dans le bloc orientation (l.65-75), remplacer :

```js
    if (candidates.length > 1) {
      const orient = orientation || extractOrientationHint(ref, deco);
      if (orient) {
        const narrowed = candidates.filter(
          (row) =>
            labelMatchesOrientation(row.endv_identif || "", orient) ||
            labelMatchesOrientation(getVisualReferenceFromEntete(row), orient),
        );
        if (narrowed.length > 0) candidates = narrowed;
      }
    }
```

Aux 2 appels (`backfillDecoPrixVisuel` l.135, `repairDecoPrixVisuel` l.197), ajouter `orientation: doc.orientation` à l'objet, et inclure `orientation: 1` dans la projection `Deco.find(filter, { numCmd: 1, ref: 1, deco: 1, format: 1 })` → `{ numCmd: 1, ref: 1, deco: 1, format: 1, orientation: 1 }` (et `prix: 1` déjà là pour repair).

`profilsKitsService.js` — `getPrixVisuel` :

```js
async function getPrixVisuel({ cmd, ref, deco, format, soleDoc = false, orientation = null }) {
```

Dans son bloc orientation (l.114-122), même remplacement `const orient = orientation || extractOrientationHint(ref, deco);` puis utiliser `orient`.

- [ ] **Step 4: Run tests**

Run: `npx mocha test/unit/decoPrixVisuelBackfillService.test.js test/unit/profilsKitsService.test.js --timeout 10000`
Expected: PASS (nouveau + existants — les cas 167431/166212/167602/167637 restent verts car `orientation` par défaut `null` → repli `extractOrientationHint`, comportement inchangé)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/decoPrixVisuelBackfillService.js server/src/services/profilsKitsService.js test/unit/decoPrixVisuelBackfillService.test.js
git commit -m "feat(sur-mesure): matchPrixVisuel/getPrixVisuel acceptent un orientation explicite"
```

---

### Task 8: Front — `DossierAutocomplete.buildRows`

**Files:**
- Modify: `client/src/components/DossierAutocomplete.jsx` — `buildRows` (branche `detectedTeinte` ≈ l.146-168)

**Interfaces:**
- Consumes: `job.surMesure`, `job.surMesureKind`, `job.deco`, `job.orientation`, `job.printFormat` (payload API, portés par le spread `...job`).
- Produces: les rows visuelles portent `surMesure`/`surMesureKind`/`orientation`/`printFormat` (déjà via `...job`) ; la branche teinte-masse se déclenche aussi quand `job.surMesureKind === "teinte_masse"`.

**Pas de harness de test front dans ce repo** : mocha est CJS et ne peut pas `require()` un module ESM de `client/src` (confirmé — `test/unit/referenceValidation.test.js` en-tête : *« impossible de require() un module ESM directement depuis mocha CJS »*, d'où des « miroirs CJS »). Créer un miroir CJS de `buildRows` pour un si petit changement n'en vaut pas le coût. Cette tâche est **couverte par la vérification manuelle du Test global** (section finale). Contrainte : diff minimal, une seule ligne de logique modifiée, relu attentivement.

- [ ] **Step 1: (pas de test unitaire — voir ci-dessus)**

- [ ] **Step 2: (n/a)**

- [ ] **Step 3: Write minimal implementation** — `client/src/components/DossierAutocomplete.jsx`, dans `buildRows`, remplacer :

```js
    const detectedTeinte = detectTeinteMasse(job);
```

par :

```js
    const detectedTeinte =
      detectTeinteMasse(job) ||
      (job.surMesureKind === "teinte_masse" && job.deco
        ? detectTeinteMasse({ libelle: job.deco, reference: "" })
        : null);
```

La branche `if (detectedTeinte) { return { id: baseId, ...job, ... } }` porte déjà `surMesure`/`surMesureKind`/`orientation`/`printFormat` via `...job` — **aucune autre modif nécessaire** dans cette branche. La branche visuelle normale (sur-mesure `visuel`) fonctionne telle quelle : `formatPath` vient de `findFormatFolder(folders, job.formatVisu)` et `job.formatVisu` = `visualRef.format` (gabarit) grâce à la Task 3.

- [ ] **Step 4: Run tests** — `npm test` (backend, rien ne doit casser) + `npm run build` (client compile sans erreur)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DossierAutocomplete.jsx
git commit -m "feat(sur-mesure): buildRows consomme surMesureKind (filet teinte-masse) et porte les champs sur-mesure"
```

---

### Task 9: Front — `App.jsx` (merge key, payloads, badge, filtre)

**Files:**
- Modify: `client/src/App.jsx` — `mergeIdenticalVisuals` (l.158-179), payload `/add_job` batch (l.562-585), payload `/add_job` manuel (l.689-707), rendu liste des jobs dossier (≈ l.910-1200, près de la puce `teinteMasse`), en-tête de liste

**Interfaces:**
- Consumes: rows de la Task 8 portant `surMesure`/`surMesureKind`/`orientation`/`printFormat`.
- Produces: les 2 POST `/add_job` envoient `surMesure`/`surMesureKind`/`orientation`/`printFormat` ; badge « SUR-MESURE » + sous-label `printFormat` ; toggle « sur-mesure uniquement » ; `mergeIdenticalVisuals` ne fusionne pas deux orientations différentes.

Pas de test unitaire front (voir Task 8) — couvert par le **Test global**.

- [ ] **Step 1: (pas de test unitaire)**

- [ ] **Step 2: (n/a)**

- [ ] **Step 3: Write implementation** — `client/src/App.jsx`

**(a) `mergeIdenticalVisuals`** — clé de fusion (l.165) :

```js
      const key = [
        j.numCmd,
        j.reference || j.ref,
        visuelName,
        j.surMesure ? (j.orientation || "") : "",
        j.surMesure ? (j.printFormat || "") : "",
      ].join("|");
```

**(b) Payload batch** (l.562-585, objet `payload`) — ajouter :

```js
            surMesure: job.surMesure ?? false,
            surMesureKind: job.surMesureKind ?? null,
            orientation: job.orientation ?? "",
            printFormat: job.printFormat ?? "",
```

**(c) Payload manuel** (l.689-707, objet `data`) — ajouter :

```js
      surMesure: false,
      surMesureKind: null,
      orientation: "",
      printFormat: "",
```

(le flux manuel n'a pas de source sur-mesure — champs neutres pour cohérence du body)

**(d) Badge + sous-label** — dans le rendu d'une row de job dossier, à côté de la puce `toggle-chip--tm` (chercher `toggle-chip--tm` ≈ l.1188), ajouter :

```jsx
{job.surMesure && (
  <span className="badge badge--surmesure" title="Panneau sur-mesure">
    SUR-MESURE
    {job.printFormat ? ` · ${job.printFormat.replace("x", " × ").replace(".", ",")}` : ""}
  </span>
)}
```

(réutiliser une classe de badge existante si le design en a une ; sinon ajouter `.badge--surmesure` au CSS avec la même facture visuelle que les puces existantes)

**(e) Filtre « sur-mesure uniquement »** — état :

```js
const [surMesureOnly, setSurMesureOnly] = useState(false);
```

Dans le bloc `dossierJobs.length > 0 && (() => { ... })()` (l.910), là où `visibleJobs` est calculé (l.921), intercaler :

```js
const visibleJobs = dossierJobs
  .filter((j) => /* filtres existants */)
  .filter((j) => !surMesureOnly || j.surMesure);
```

Et un checkbox/toggle dans l'en-tête de cette liste :

```jsx
<label className="filter-toggle">
  <input type="checkbox" checked={surMesureOnly} onChange={(e) => setSurMesureOnly(e.target.checked)} />
  Sur-mesure uniquement
</label>
```

- [ ] **Step 4: Vérification** — `npm test` (backend inchangé, doit rester vert) + build front `npm run build` (pas d'erreur de compilation).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(sur-mesure): App.jsx — payloads, badge, filtre, merge key orientation/printFormat"
```

---

## Test global (après toutes les tâches)

1. `npm test` — **toute** la suite verte (confirmer « dev » dans le message au lancement).
2. Serveur dev + client : `npm run server` (préciser dev) & `npm run client`.
3. Rechercher le **dossier 167302** dans l'autocomplétion :
   - 3 lignes visuel « BLANC ZERO » → chacune badge **SUR-MESURE · 90 × 210** (ou 80 × 210), puce teinte-masse active, **aucun fichier requis**, statut « Prêt » dès le format Tauro choisi.
   - 2 lignes /03 et /04 (mêmes 80 × 210) : fusionnées en 1 ligne `ex: 2` (teinte identique) ; la ligne /05 (90 × 210) reste séparée.
   - profils/kit inchangés.
4. Soumettre → vérifier en base **Test** (`lm_commandes`, `numCmd: 167302`) : docs avec `surMesure: true`, `surMesureKind: "teinte_masse"`, `deco` cohérent, `finition` résolue via Ref\*, `comment` = « Cote client : 90 × 210 cm ».
5. Rechercher un dossier avec un **vrai visuel sur-mesure** (ex. 167431 ARCHE BEIGE si dispo en base Test, sinon 167500 BAMBUSA) :
   - lignes badgées SUR-MESURE, **fichier requis** (sélection manuelle dans le dossier format `125x210`), orientation visible.
   - après soumission : doc `Deco` avec `surMesureKind: "visuel"`, `finition`/`deco`/`format` **venus de Gamesys** (hook n'a pas écrasé), `orientation` renseignée.
6. Toggle « sur-mesure uniquement » : ne montre que les lignes badgées.
7. Export CSV historique : colonne `surMesure` présente, `1` pour ces docs.

## Self-Review (fait à l'écriture du plan)

- **Couverture spec :** §1 util → T1 ; §2 buildVisualReferences → T2 ; §3 dossierApiController → T3 ; §4 buildRows → T8 ; §5 App.jsx → T9 ; §6 jobsController → T6 ; §7 Deco schéma+hook → T4 (+ T5 jobsList) ; §8 services prix → T7 ; tests → répartis. Flux 167302 → Test global §3-4. Cas limites `endv_ref_client` vide → T3 (warning) + T1 (parse). Sous-dossiers identiques → T9 merge key + Test global §3.
- **Placeholders :** les 2 points ouverts (harness d'exécution job T6, outillage test front T8/T9) sont explicitement traités avec une voie de repli concrète (fonction pure extraite + vérif manuelle), pas des « TODO ».
- **Cohérence des types :** `surMesureData` (objet) cohérent T5↔T6 ; `orientation` param cohérent T6↔T7 ; champs payload cohérents T3↔T8↔T9 ; `surMesureKind ∈ {"visuel","teinte_masse"}` cohérent T2/T4/T6/T8.
