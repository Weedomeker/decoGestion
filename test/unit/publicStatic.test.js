const { expect } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const registerPublicStatic = require("../../server/src/routes/publicStatic");

// Reproduit l'arborescence de server/ dans un dossier temporaire.
describe("registerPublicStatic", () => {
  let serverDir;
  let server;
  let base;

  before((done) => {
    serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "publicStatic-"));
    fs.writeFileSync(path.join(serverDir, "server.js"), "// code");
    fs.writeFileSync(path.join(serverDir, "server.log"), "journal");
    fs.mkdirSync(path.join(serverDir, "src"));
    fs.writeFileSync(path.join(serverDir, "src", "mongoose.js"), "// code");
    fs.mkdirSync(path.join(serverDir, "public", "PRINTSA#19 NOV 2026"), { recursive: true });
    fs.writeFileSync(path.join(serverDir, "public", "PRINTSA#19 NOV 2026", "visuel.jpg"), "jpg");
    fs.mkdirSync(path.join(serverDir, "public", "PREVIEW"));
    fs.writeFileSync(path.join(serverDir, "public", "PREVIEW", "apercu.jpg"), "apercu");

    const app = express();
    registerPublicStatic(app, serverDir);
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  after(() => {
    server.close();
    fs.rmSync(serverDir, { recursive: true, force: true });
  });

  it("sert le JPG d'un job comme l'appelle la File (/public/public/<session>/...)", async () => {
    const res = await fetch(`${base}/public/public/PRINTSA%2319%20NOV%202026/visuel.jpg`);
    expect(res.status).to.equal(200);
    expect(await res.text()).to.equal("jpg");
  });

  it("sert les aperçus sous /public/PREVIEW", async () => {
    const res = await fetch(`${base}/public/PREVIEW/apercu.jpg`);
    expect(res.status).to.equal(200);
  });

  for (const fichier of ["server.js", "server.log", "src/mongoose.js"]) {
    it(`ne sert pas ${fichier} hors de server/public`, async () => {
      const res = await fetch(`${base}/public/${fichier}`);
      expect(res.status).to.equal(404);
    });
  }
});
