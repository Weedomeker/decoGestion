const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStagingDir, deliverToHotFolder, removeStagingDir } = require('../../server/src/utils/hotFolderDelivery');

describe('hotFolderDelivery', () => {
  let stagingDir;
  let hotFolder;

  beforeEach(async () => {
    stagingDir = await createStagingDir();
    hotFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'decoGestion-hotfolder-test-'));
  });

  afterEach(async () => {
    await removeStagingDir(stagingDir);
    await fs.promises.rm(hotFolder, { recursive: true, force: true });
  });

  it('crée un dossier de staging local dans le dossier temporaire', () => {
    assert.ok(fs.existsSync(stagingDir));
    assert.ok(stagingDir.startsWith(os.tmpdir()));
  });

  it('copie le PDF dans le hot folder (sous-dossier créé si absent)', async () => {
    const staged = path.join(stagingDir, '168869 - LM VERNOUILLET - 101x215 - VERT DE GRIS FONCÉ 1_EX.pdf');
    fs.writeFileSync(staged, '%PDF-1.7 contenu');
    const dest = path.join(hotFolder, 'Deco_Std_101x215', path.basename(staged));

    await deliverToHotFolder(staged, dest);

    assert.strictEqual(fs.readFileSync(dest, 'utf8'), '%PDF-1.7 contenu');
  });

  it("refuse de déposer un PDF vide (rien n'est envoyé au RIP)", async () => {
    const staged = path.join(stagingDir, 'vide.pdf');
    fs.writeFileSync(staged, '');
    const dest = path.join(hotFolder, 'vide.pdf');

    await assert.rejects(() => deliverToHotFolder(staged, dest), /vide/);
    assert.strictEqual(fs.existsSync(dest), false);
  });

  it('rejette si le PDF de staging est absent', async () => {
    await assert.rejects(() => deliverToHotFolder(path.join(stagingDir, 'absent.pdf'), path.join(hotFolder, 'x.pdf')), /ENOENT/);
  });

  it('exclusif : un fichier déjà présent rejette en UnrecoverableError et reste intact', async () => {
    const { UnrecoverableError } = require('bullmq');
    const staged = path.join(stagingDir, 'nouveau.pdf');
    fs.writeFileSync(staged, '%PDF-1.7 nouveau');
    const dest = path.join(hotFolder, 'Deco_Std_151x260', '011_S1711A_x_4.pdf');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, '%PDF-1.7 ancien');

    await assert.rejects(
      () => deliverToHotFolder(staged, dest, { exclusif: true }),
      (err) => err instanceof UnrecoverableError && /Déjà présent dans .*Deco_Std_151x260 : 011_S1711A_x_4\.pdf/.test(err.message),
    );
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), '%PDF-1.7 ancien');
  });

  it('exclusif : dépôt normal quand la destination est libre', async () => {
    const staged = path.join(stagingDir, 'libre.pdf');
    fs.writeFileSync(staged, '%PDF-1.7 libre');
    const dest = path.join(hotFolder, 'libre.pdf');
    await deliverToHotFolder(staged, dest, { exclusif: true });
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), '%PDF-1.7 libre');
  });

  it("sans option : un fichier déjà présent est écrasé comme aujourd'hui", async () => {
    const staged = path.join(stagingDir, 'ecrase.pdf');
    fs.writeFileSync(staged, '%PDF-1.7 nouveau');
    const dest = path.join(hotFolder, 'ecrase.pdf');
    fs.writeFileSync(dest, '%PDF-1.7 ancien');
    await deliverToHotFolder(staged, dest);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), '%PDF-1.7 nouveau');
  });

  it('removeStagingDir supprime le dossier et tolère null', async () => {
    fs.writeFileSync(path.join(stagingDir, 'a.pdf'), 'x');
    await removeStagingDir(stagingDir);
    assert.strictEqual(fs.existsSync(stagingDir), false);
    await removeStagingDir(null);
  });
});
