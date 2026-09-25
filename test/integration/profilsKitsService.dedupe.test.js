const { expect } = require("chai");
const sinon = require("sinon");
const { connect, disconnect, clearCollections } = require("../helpers/mongoTestHelper");
const dossierService = require("../../server/src/gamesys/services/dossierService");
const ConsommationCommande = require("../../server/src/models/ConsommationCommande");
const { saveProfilsKits } = require("../../server/src/services/profilsKitsService");

const GROUPED_WITH_PROFIL = {
  profileReferences: [
    { reference: "P001", articleReference: "P001", modele: "PROFIL BLANC", libelle: "PROFIL BLANC 255", codeTarif: "", famille: "PROFIL", sousFamille: "" },
  ],
  kitPosesReferences: [],
  sousDossiers: [
    {
      enteteDevis: [{ endv_identif: "PROFIL BLANC 255", endv_quant: 3 }],
    },
  ],
};

describe("profilsKitsService.saveProfilsKits() — anti-doublon (intégration, base réelle)", () => {
  let getDossierDetailStub;

  before(async () => { await connect(); });
  after(async () => { await disconnect(); });

  beforeEach(() => {
    getDossierDetailStub = sinon.stub(dossierService, "getDossierDetail").resolves(GROUPED_WITH_PROFIL);
  });

  afterEach(async () => {
    sinon.restore();
    await clearCollections();
  });

  const fakeJob = (cmd = 166276, client = "LM") => ({ cmd, client });

  it("deux appels séquentiels pour le même numCmd ne créent qu'un seul document", async () => {
    await saveProfilsKits(fakeJob());
    await saveProfilsKits(fakeJob());

    const count = await ConsommationCommande.countDocuments({ numCmd: 166276 });
    expect(count).to.equal(1);
  });

  it("deux appels concurrents pour le même numCmd ne créent qu'un seul document", async () => {
    await Promise.all([saveProfilsKits(fakeJob()), saveProfilsKits(fakeJob())]);

    const count = await ConsommationCommande.countDocuments({ numCmd: 166276 });
    expect(count).to.equal(1);
  });
});
