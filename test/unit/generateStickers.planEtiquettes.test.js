const { expect } = require("chai");
const { planEtiquettes } = require("../../server/src/generateStickers");

const labels = (plan) => plan.map((e) => `${e.commandId} V${e.visuelIndex} ${e.isStock ? "STOCK" : e.ex}`);

describe("generateStickers.planEtiquettes()", () => {
  // Cas 166688 : 255x60 + 300x60 de la même commande sur une plaque → les 2 étiquettes sortaient en 01/01
  it("amalgame de 2 panneaux de la même commande : 01/02 et 02/02", () => {
    const plan = planEtiquettes([{ cmd: 166688, cmd2: 166688, ex: 1, client: "CASTO", visuPath2: "x.pdf" }]);
    expect(labels(plan)).to.deep.equal(["166688 V1 01/02", "166688 V2 02/02"]);
  });

  it("amalgame de 2 commandes différentes : 01/01 chacune", () => {
    const plan = planEtiquettes([{ cmd: 1001, cmd2: 1002, ex: 1, client: "CASTO", visuPath2: "x.pdf" }]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/01", "1002 V2 01/01"]);
  });

  it("2e panneau d'une commande amalgamé avec une autre commande : compté dans sa propre commande", () => {
    const plan = planEtiquettes([
      { cmd: 1001, cmd2: 1002, ex: 1, client: "CASTO", visuPath2: "x.pdf" },
      { cmd: 1002, ex: 1, client: "LM" },
    ]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/01", "1002 V2 01/02", "1002 V1 02/02"]);
  });

  it("complément stock : le panneau stock n'est pas compté", () => {
    const plan = planEtiquettes([{ cmd: 1001, cmd2: 0, ex: 1, client: "CASTO", visuPath2: "x.pdf" }]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/01", "1001 V2 STOCK"]);
  });

  it("visuel seul en 3 ex : 01/03 à 03/03", () => {
    const plan = planEtiquettes([{ cmd: 1001, ex: 3, client: "LM" }]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/03", "1001 V1 02/03", "1001 V1 03/03"]);
  });

  it("crédence dupliquée 3 panneaux sur 2 plaques : le 4e panneau part en stock", () => {
    const plan = planEtiquettes([{ cmd: 1001, cmd2: 1001, ex: 2, panneaux: 3, client: "CASTO", visuPath2: "x.pdf" }]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/03", "1001 V2 02/03", "1001 V1 03/03", "1001 V2 STOCK"]);
  });

  it("crédence dupliquée prise en stock (useStock) : le panneau en trop n'a pas d'étiquette", () => {
    const plan = planEtiquettes([
      { cmd: 1001, cmd2: 1001, ex: 2, panneaux: 3, useStock: true, client: "CASTO", visuPath2: "x.pdf" },
    ]);
    expect(labels(plan)).to.deep.equal(["1001 V1 01/03", "1001 V2 02/03", "1001 V1 03/03"]);
  });

  it("les numéros de fichier (avant le /) sont uniques par commande, stock compris", () => {
    const plan = planEtiquettes([{ cmd: 1001, cmd2: 1001, ex: 2, panneaux: 3, client: "CASTO", visuPath2: "x.pdf" }]);
    const nums = plan.map((e) => e.ex.split("/")[0]);
    expect(new Set(nums).size).to.equal(nums.length);
    nums.forEach((n) => expect(n).to.match(/^\d{2}$/));
  });
});
