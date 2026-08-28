const { expect } = require("chai");
const {
  hasKnownClientPrefix,
  deduceAppClientFromCatalogue,
  recoverCandidatesFromCatalogue,
  mergeCandidates,
} = require("../../server/src/gamesys/utils/clientCatalogue");

describe("clientCatalogue.deduceAppClientFromCatalogue()", () => {
  it("rattache à ECOM une crédence DECO ECO dimensionnée", () => {
    const res = deduceAppClientFromCatalogue("I96", [
      { label: "Travertino 125 x 255 cm (M)", famille: "DECO ECO", tarif: "" },
    ]);
    expect(res).to.equal("ECOM");
  });

  it("rattache à ECOM un profilé MURANEO", () => {
    const res = deduceAppClientFromCatalogue("PRO097", [
      { label: "PROFILE Noir Mat - A - Finition - 255cm", famille: "MURANEO", tarif: "" },
    ]);
    expect(res).to.equal("ECOM");
  });

  it("rattache à ECOM un panier mixte DECO LM + DECO-K-I (jamais LM)", () => {
    const res = deduceAppClientFromCatalogue("S332", [
      { label: "Marbre Blanc 125 x 255 cm (M)", famille: "DECO LM", tarif: "" },
      { label: "PROFILE Alu Mat - C - Intérieur - 255cm", famille: "DECO-K-I", tarif: "" },
    ]);
    expect(res).to.equal("ECOM");
  });

  it("écarte une commande sans famille déco résolue", () => {
    const res = deduceAppClientFromCatalogue("CFFOUIL", [{ label: "Affiche 400X300", famille: "", tarif: "" }]);
    expect(res).to.equal(null);
  });

  it("écarte une famille déco sans ancre (crédence ni profilé) — cas Totem", () => {
    const res = deduceAppClientFromCatalogue("CFFOUIL", [{ label: "Totem", famille: "MURANEO", tarif: "" }]);
    expect(res).to.equal(null);
  });

  it("écarte une commande contaminée par une famille PLV", () => {
    const res = deduceAppClientFromCatalogue("X12", [
      { label: "Travertino 125 x 255 cm (M)", famille: "DECO ECO", tarif: "" },
      { label: "Tête de gondole", famille: "S-BEAUTE", tarif: "" },
    ]);
    expect(res).to.equal(null);
  });

  it("traite LM MERSH comme une contamination (hors FAM_DECO)", () => {
    const res = deduceAppClientFromCatalogue("X12", [
      { label: "Travertino 125 x 255 cm (M)", famille: "DECO ECO", tarif: "" },
      { label: "Bandeau menuiserie", famille: "LM MERSH", tarif: "" },
    ]);
    expect(res).to.equal(null);
  });

  it("exclut d'office les comptes de test/démo/interne", () => {
    const res = deduceAppClientFromCatalogue("TEST", [
      { label: "Travertino 125 x 255 cm (M)", famille: "DECO ECO", tarif: "" },
    ]);
    expect(res).to.equal(null);
  });

  it("rattache à ECOM via le code tarif EC- quand aucune famille n'est résolue", () => {
    const res = deduceAppClientFromCatalogue("X12", [{ label: "Article", famille: "", tarif: "EC-123" }]);
    expect(res).to.equal("ECOM");
  });

  it("retourne null sur une liste vide", () => {
    expect(deduceAppClientFromCatalogue("X12", [])).to.equal(null);
  });
});

describe("clientCatalogue.recoverCandidatesFromCatalogue()", () => {
  const famMap = new Map([
    ["TRAVERTINO 125 X 255 CM (M)", { famille: "DECO ECO", tarif: "" }],
    ["TRAVERTINO 150 X 255 CM (M)", { famille: "DECO ECO", tarif: "" }],
    ["PROFILE NOIR MAT - A - FINITION - 255CM", { famille: "MURANEO", tarif: "" }],
    ["PROFILE NOIR MAT - B - RACCORD - 255CM", { famille: "MURANEO", tarif: "" }],
  ]);

  it("récupère une commande I96 (crédences DECO ECO + profilés MURANEO) en ECOM", () => {
    const rows = [
      { dos_no_cmde: "167758/00", dos_client: "I96", endv_identif: "Travertino 125 x 255 cm (M)" },
      { dos_no_cmde: "167758/01", dos_client: "I96", endv_identif: "Travertino 150 x 255 cm (M)" },
      { dos_no_cmde: "167758/02", dos_client: "I96", endv_identif: "PROFILE Noir Mat - A - Finition - 255cm" },
      { dos_no_cmde: "167758/03", dos_client: "I96", endv_identif: "PROFILE Noir Mat - B - Raccord - 255cm" },
    ];
    expect(recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: true })).to.deep.equal([
      { cmd: "167758", client: "ECOM" },
    ]);
  });

  it("ignore les lignes dont le code client a un préfixe enseigne connu", () => {
    const rows = [{ dos_no_cmde: "167900/00", dos_client: "LM046", endv_identif: "Travertino 125 x 255 cm (M)" }];
    expect(recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: false })).to.deep.equal([]);
  });

  it("requireProfilKit:true exclut une commande sans profilé ni kit", () => {
    const rows = [{ dos_no_cmde: "167801/00", dos_client: "PRO137", endv_identif: "Travertino 125 x 255 cm (M)" }];
    expect(recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: true })).to.deep.equal([]);
  });

  it("requireProfilKit:false récupère une commande visuels-seuls du catalogue déco", () => {
    const rows = [{ dos_no_cmde: "167801/00", dos_client: "PRO137", endv_identif: "Travertino 125 x 255 cm (M)" }];
    expect(recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit: false })).to.deep.equal([
      { cmd: "167801", client: "ECOM" },
    ]);
  });

  it("retourne [] quand famMap est vide ou absente", () => {
    const rows = [{ dos_no_cmde: "167758/00", dos_client: "I96", endv_identif: "Travertino 125 x 255 cm (M)" }];
    expect(recoverCandidatesFromCatalogue(rows, new Map(), {})).to.deep.equal([]);
    expect(recoverCandidatesFromCatalogue(rows, null, {})).to.deep.equal([]);
  });
});

describe("clientCatalogue.hasKnownClientPrefix()", () => {
  it("reconnaît les préfixes enseigne", () => {
    ["LM046", "CAS1515", "BM01893", "ECOMCB", "lm046"].forEach((c) =>
      expect(hasKnownClientPrefix(c), c).to.equal(true),
    );
  });
  it("rejette les codes sans préfixe enseigne", () => {
    ["I96", "PRO138", "EPROCB", "S332", "CFFOUIL", "", null, undefined].forEach((c) =>
      expect(hasKnownClientPrefix(c), String(c)).to.equal(false),
    );
  });
});

describe("clientCatalogue.mergeCandidates()", () => {
  it("concatène en dédupliquant sur cmd (la base gagne)", () => {
    const base = [{ cmd: "100", client: "LM" }];
    const extra = [
      { cmd: "100", client: "ECOM" },
      { cmd: "200", client: "ECOM" },
    ];
    expect(mergeCandidates(base, extra)).to.deep.equal([
      { cmd: "100", client: "LM" },
      { cmd: "200", client: "ECOM" },
    ]);
  });

  it("gère des entrées absentes", () => {
    expect(mergeCandidates(undefined, [{ cmd: "1", client: "ECOM" }])).to.deep.equal([{ cmd: "1", client: "ECOM" }]);
    expect(mergeCandidates([{ cmd: "1", client: "LM" }], undefined)).to.deep.equal([{ cmd: "1", client: "LM" }]);
  });
});
