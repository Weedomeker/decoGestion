const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { saveConfig, saveJobsConcurrency, getConfig } = require("../../server/src/services/configService");

// configService lit ./config.json relatif au cwd : on travaille dans un dossier temporaire
// pour ne jamais toucher le vrai config.json.
describe("configService — jobsConcurrency", () => {
  const originalCwd = process.cwd();
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decogestion-config-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saveJobsConcurrency fusionne sans perdre les autres clés", () => {
    fs.writeFileSync("config.json", JSON.stringify({ vernis: ["MAT"] }));

    saveJobsConcurrency(5);

    expect(getConfig()).to.deep.equal({ vernis: ["MAT"], jobsConcurrency: 5 });
  });

  it("saveConfig (modale Config) conserve la concurrence enregistrée, même si elle envoie une valeur périmée", async () => {
    fs.writeFileSync("config.json", JSON.stringify({ vernis: ["MAT"], jobsConcurrency: 6 }));

    await saveConfig({ vernis: ["MAT", "Brillant"], jobsConcurrency: 2 });

    expect(getConfig()).to.deep.equal({ vernis: ["MAT", "Brillant"], jobsConcurrency: 6 });
  });

  it("linkFolders ne tente pas de lier les valeurs non-string", async () => {
    fs.writeFileSync("config.json", JSON.stringify({ vernis: ["MAT"], jobsConcurrency: 4 }));

    const { linkFolders } = require("../../server/src/services/configService");
    const result = await linkFolders(false);

    expect(result).to.deep.equal({ success: [], failed: [] });
  });
});
