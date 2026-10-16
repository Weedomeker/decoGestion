const assert = require("assert");
const sinon = require("sinon");
const { withMongoRetry, isMongoNetworkError } = require("../../server/src/utils/retryMongo");

const etimedout = () => new Error("connect ETIMEDOUT 65.62.83.72:27017");

describe("retryMongo", () => {
  describe("isMongoNetworkError", () => {
    it("reconnaît le ETIMEDOUT de la coupure du 12/10", () => assert.ok(isMongoNetworkError(etimedout())));

    it("reconnaît une erreur de sélection de serveur par son nom", () => {
      const err = new Error("Server selection timed out");
      err.name = "MongoServerSelectionError";
      assert.ok(isMongoNetworkError(err));
    });

    it("ignore une erreur de validation ou de doublon", () => {
      assert.ok(!isMongoNetworkError(new Error("Deco validation failed: numCmd: required")));
      assert.ok(!isMongoNetworkError(new Error("E11000 duplicate key error")));
      assert.ok(!isMongoNetworkError(null));
    });
  });

  describe("withMongoRetry", () => {
    it("renvoie le résultat dès le premier essai réussi", async () => {
      const fn = sinon.stub().resolves("ok");
      assert.strictEqual(await withMongoRetry(fn, { delaysMs: [0, 0] }), "ok");
      sinon.assert.calledOnce(fn);
    });

    it("retente après une erreur réseau puis réussit", async () => {
      const fn = sinon.stub();
      fn.onFirstCall().rejects(etimedout());
      fn.onSecondCall().rejects(etimedout());
      fn.onThirdCall().resolves("ok");
      assert.strictEqual(await withMongoRetry(fn, { delaysMs: [0, 0, 0] }), "ok");
      sinon.assert.calledThrice(fn);
    });

    it("abandonne après le dernier délai et relance l'erreur réseau", async () => {
      const fn = sinon.stub().rejects(etimedout());
      await assert.rejects(() => withMongoRetry(fn, { delaysMs: [0, 0] }), /ETIMEDOUT/);
      sinon.assert.callCount(fn, 3);
    });

    it("ne retente pas une erreur non réseau", async () => {
      const fn = sinon.stub().rejects(new Error("Deco validation failed"));
      await assert.rejects(() => withMongoRetry(fn, { delaysMs: [0, 0] }), /validation/);
      sinon.assert.calledOnce(fn);
    });
  });
});
