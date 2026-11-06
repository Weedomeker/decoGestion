const { expect } = require("chai");
const os = require("os");
const path = require("path");
const {
  taillesPdf,
  besoinsParDossier,
  refusEspaceDisque,
  disqueDe,
  controlerEspaceDisque,
  basculerSortieSecours,
} = require("../../server/src/utils/espaceDisque");

const MO = 2 ** 20;
const GO = 2 ** 30;
const tailles = { "a.pdf": 668 * MO, "b.pdf": 100 * MO, "c.pdf": 50 * MO };
const taille = (chemin) => tailles[chemin] || 0;
const job = (visuPath, extra = {}) => ({ visuPath, writePath: "sortie", ...extra });

describe("utils/espaceDisque", () => {
  it("compte les PDF à produire, amalgames compris", () => {
    const jobs = [job("a.pdf"), job("b.pdf", { visuPath2: "c.pdf" })];
    expect(taillesPdf(jobs, taille).map((t) => t.taille)).to.deep.equal([668 * MO, 150 * MO]);
  });

  it("ignore teinte masse et prise en stock", () => {
    const jobs = [job("a.pdf", { teinteMasse: true }), job("a.pdf", { useStock: true })];
    expect(taillesPdf(jobs, taille)).to.deep.equal([]);
  });

  it("limite le pic temporaire aux plus gros PDF traités en même temps, copie ImageMagick comprise", () => {
    const liste = [
      { destination: "sortie", taille: 100 },
      { destination: "sortie", taille: 300 },
      { destination: "sortie", taille: 200 },
    ];
    const besoins = besoinsParDossier(liste, "tmp", 2);
    expect(besoins.get("tmp")).to.equal(1000);
    expect(besoins.get("sortie")).to.equal(600);
  });

  it("cumule temporaire et sortie sur un même disque, comme en dev", () => {
    const besoins = new Map([
      ["tmp", 2 * GO],
      ["sortie", 2 * GO],
    ]);
    const refus = refusEspaceDisque(besoins, () => ({ racine: "C:\\", libre: 3 * GO }));
    expect(refus.code).to.equal("DISQUE_PLEIN");
    expect(refus.error).to.include("C:\\").and.to.include("4,5 Go nécessaires").and.to.include("3,0 Go libres");
  });

  it("sépare le disque local du hot folder, comme en production", () => {
    const besoins = new Map([
      ["tmp", 2 * GO],
      ["hot", 6 * GO],
    ]);
    const disques = { tmp: { racine: "C:\\", libre: 3 * GO }, hot: { racine: "\\\\RIP\\", libre: 500 * GO } };
    expect(refusEspaceDisque(besoins, (d) => disques[d])).to.equal(null);
  });

  it("exige la marge de sécurité", () => {
    const refus = refusEspaceDisque(new Map([["tmp", GO]]), () => ({ racine: "C:\\", libre: GO + 100 * MO }));
    expect(refus.code).to.equal("DISQUE_PLEIN");
  });

  it("laisse passer un partage injoignable : le job remontera l'erreur", () => {
    expect(refusEspaceDisque(new Map([["hot", 900 * GO]]), () => null)).to.equal(null);
  });

  it("mesure un dossier qui n'existe pas encore par son parent", () => {
    const disque = disqueDe(`${os.tmpdir()}/inexistant-sm/sous-dossier`);
    expect(disque.libre).to.be.a("number");
    expect(disque.racine).to.be.a("string");
  });

  it("déplace temporaires et sortie sur le dossier de secours, en gardant le dossier de plaque", () => {
    const secours = path.join("X:", "dev");
    const jobs = [job("a.pdf", { writePath: path.join("public", "tmp", "Deco_Std_101x215") })];
    const temporaire = basculerSortieSecours(jobs, secours);
    expect(temporaire).to.equal(path.join(secours, "tmp"));
    expect(jobs[0].writePath).to.equal(path.join(secours, "Deco_Std_101x215"));
    expect(jobs[0].dossierTemporaire).to.equal(temporaire);
  });

  it("laisse passer une file sans PDF à produire", () => {
    expect(controlerEspaceDisque([job("x", { teinteMasse: true })], os.tmpdir(), 3)?.code).to.not.equal("ERREUR");
  });
});
