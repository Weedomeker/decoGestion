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
