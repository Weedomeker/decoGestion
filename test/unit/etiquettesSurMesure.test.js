const { expect } = require("chai");
const { planEtiquettes, comparerEtiquettes } = require("../../server/src/generateStickers");

const panneau = (cmd, smPage, ex = 1) => ({ cmd, smPage, ex, smBase: `${cmd}-${smPage}` });
const numeros = (plan) => plan.map((p) => [p.cmdInfo.smPage, p.ex]);

describe("étiquettes des sur-mesures", () => {
  it("169063 : numérote selon le rang dans le PDF, pas l'ordre de fin des jobs", () => {
    const finis = [panneau(169063, 0), panneau(169063, 2), panneau(169063, 1), panneau(169063, 3), panneau(169063, 4)];
    expect(numeros(planEtiquettes(finis))).to.deep.equal([
      [0, "01/05"],
      [1, "02/05"],
      [2, "03/05"],
      [3, "04/05"],
      [4, "05/05"],
    ]);
  });

  it("garde chaque commande à part", () => {
    const plan = planEtiquettes([panneau(2, 1), panneau(1, 1), panneau(2, 0), panneau(1, 0)]);
    const de = (cmd) => plan.filter((p) => p.cmdInfo.cmd === cmd).map((p) => [p.cmdInfo.smPage, p.ex]);
    expect(de(1)).to.deep.equal([
      [0, "01/02"],
      [1, "02/02"],
    ]);
    expect(de(2)).to.deep.equal([
      [0, "01/02"],
      [1, "02/02"],
    ]);
  });

  it("numérote à la suite les exemplaires d'un même panneau", () => {
    expect(numeros(planEtiquettes([panneau(1, 1), panneau(1, 0, 2)]))).to.deep.equal([
      [0, "01/03"],
      [0, "02/03"],
      [1, "03/03"],
    ]);
  });

  it("ne déplace pas un job standard", () => {
    const standard = { cmd: 5, ex: 1 };
    const plan = planEtiquettes([panneau(1, 1), standard, panneau(1, 0)]);
    expect(plan[1].cmdInfo).to.equal(standard);
    expect(plan[0].cmdInfo.smPage).to.equal(0);
  });

  it("classe la planche sur-mesure par numéro, malgré les formats", () => {
    const fichiers = [
      "169063_SM_B_88,2x210_05.pdf",
      "169063_SM_B_76,9x210_03.pdf",
      "169063_SM_B_100x210_01.pdf",
      "169063_SM_B_76,9x210_04.pdf",
      "169063_SM_B_88,2x210_02.pdf",
    ];
    expect(fichiers.sort(comparerEtiquettes).map((f) => f.slice(-6, -4))).to.deep.equal(["01", "02", "03", "04", "05"]);
  });

  it("classe toujours une planche standard du plus grand format au plus petit", () => {
    const fichiers = ["1_M_100x210_01.pdf", "1_M_100x255_02.pdf"];
    expect(fichiers.sort(comparerEtiquettes)[0]).to.equal("1_M_100x255_02.pdf");
  });
});
