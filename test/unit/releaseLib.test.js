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
