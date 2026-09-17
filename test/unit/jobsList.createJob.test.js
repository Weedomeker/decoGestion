const { expect } = require("chai");
const createJob = require("../../server/src/jobsList");

// Arguments positionnels de createJob, dans l'ordre exact de sa signature — un helper évite de
// répéter les 24 premiers args identiques dans chaque test, seuls prix/prix2 varient ici.
function buildJob({ prix, prix2 } = {}) {
  return createJob(
    "LM", // client
    "164668", // cmd
    0, // cmd2
    "PARIS", // ville
    "100x255", // format
    "", // format2
    "Deco_Std_101x215", // formatPlaque
    "visuel.pdf", // visuel
    "", // visuel2
    "94953707", // ref
    0, // ref2
    "1", // ex
    "server/public/LM/visuel.pdf", // visuPath
    "", // visuPath2
    "server/public/write", // writePath
    "server/public/PRINTSA1/visuel", // jpgName
    "server/public/PRINTSA1/visuel2", // jpgName2
    0, // perte
    false, // reg
    false, // cut
    false, // teinteMasse
    false, // stock
    false, // prodBlanc
    "LM", // client2
    null, // refDbData
    null, // refDbData2
    prix,
    prix2,
  );
}

describe("jobsList.createJob() — prix précalculé du sous-dossier", () => {
  it("porte le prix explicite fourni par le frontend (sous-dossier précis)", () => {
    const job = buildJob({ prix: 199.39 });
    expect(job.prix).to.equal(199.39);
  });

  it("porte prix et prix2 pour une crédence à 2 panneaux", () => {
    const job = buildJob({ prix: 283.51, prix2: 557.35 });
    expect(job.prix).to.equal(283.51);
    expect(job.prix2).to.equal(557.35);
  });

  it("laisse prix indéfini quand aucun n'est fourni (flux de saisie manuelle)", () => {
    const job = buildJob({});
    expect(job.prix).to.be.undefined;
    expect(job.prix2).to.be.undefined;
  });

  it("laisse prix indéfini quand une chaîne vide est fournie", () => {
    const job = buildJob({ prix: "" });
    expect(job.prix).to.be.undefined;
  });

  it("convertit un prix fourni en chaîne en nombre", () => {
    const job = buildJob({ prix: "199.39" });
    expect(job.prix).to.equal(199.39);
  });
});

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
