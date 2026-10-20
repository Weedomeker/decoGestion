const assert = require("assert");
const sinon = require("sinon");
const MongoTransport = require("../../server/src/logger/mongoTransport");

function fakeCollection() {
  return { createIndexes: sinon.stub().resolves(), insertMany: sinon.stub().resolves() };
}

// Fausse connexion mongoose : ouverte (readyState 1) quand une collection est fournie.
function fakeConnection(collection) {
  return { readyState: collection ? 1 : 0, db: { collection: () => collection } };
}

function log(transport, info) {
  return new Promise((resolve) => transport.log(info, resolve));
}

describe("MongoTransport", () => {
  let transport;

  const create = (collection) => (transport = new MongoTransport({ flushMs: 60000, connection: fakeConnection(collection) }));

  afterEach(() => {
    transport.close();
    sinon.restore();
  });

  it("met en tampon tant que MongoDB n'est pas connecté", async () => {
    create(null);
    await log(transport, { level: "info", message: "hors ligne" });
    await transport.flush();
    assert.strictEqual(transport.buffer.length, 1);
  });

  it("écrit le tampon avec cmd/client en champs et le reste dans meta", async () => {
    const collection = fakeCollection();
    create(collection);
    await log(transport, { level: "error", message: "PDF KO", cmd: 164886, client: "LM", ref: "123", stack: "Error: x" });
    await transport.flush();

    sinon.assert.calledOnce(collection.createIndexes);
    const [docs] = collection.insertMany.firstCall.args;
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].level, "error");
    assert.strictEqual(docs[0].message, "PDF KO");
    assert.strictEqual(docs[0].cmd, 164886);
    assert.strictEqual(docs[0].client, "LM");
    assert.deepStrictEqual(docs[0].meta, { ref: "123" });
    assert.strictEqual(docs[0].stack, "Error: x");
    assert.ok(docs[0].ts instanceof Date);
    assert.strictEqual(transport.buffer.length, 0);
  });

  it("abandonne un lot rejeté au lieu de le renvoyer en boucle", async () => {
    const collection = fakeCollection();
    collection.insertMany.rejects(new Error("document trop gros"));
    create(collection);
    sinon.stub(console, "error");
    await log(transport, { level: "warn", message: "x" });
    await transport.flush();
    assert.strictEqual(transport.buffer.length, 0);
    sinon.assert.calledOnce(console.error);
  });
});

describe("logger", () => {
  const logger = require("../../server/src/logger/logger");

  function capture() {
    const infos = [];
    const spy = { log: (info, cb) => (infos.push(info), cb()) };
    const { Transport } = require("winston");
    const transport = Object.assign(new Transport(), spy);
    logger.add(transport);
    return { infos, remove: () => logger.remove(transport) };
  }

  it("recolle un 2e argument texte au message (auparavant perdu)", () => {
    const { infos, remove } = capture();
    logger.error("Échec : ", "détail");
    remove();
    assert.strictEqual(infos[0].message, "Échec : détail");
  });

  it("conserve la stack d'une erreur passée en 2e argument", () => {
    const { infos, remove } = capture();
    logger.error("Génération échouée :", new Error("boom"));
    remove();
    assert.strictEqual(infos[0].message, "Génération échouée : boom");
    assert.match(infos[0].stack, /Error: boom/);
  });

  it("propage le contexte d'un logger enfant", () => {
    const { infos, remove } = capture();
    logger.child({ cmd: 164886, client: "LM" }).info("PDF OK");
    remove();
    assert.strictEqual(infos[0].cmd, 164886);
    assert.strictEqual(infos[0].client, "LM");
  });
});
