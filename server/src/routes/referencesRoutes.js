const express = require("express");
const referencesController = require("../controllers/referencesController");

const router = express.Router();

router.get("/references-check", referencesController.checkReferences);
router.get("/references/:client", referencesController.listReferences);
router.post("/references/:client", referencesController.createReference);
router.patch("/references/:client/:id", referencesController.updateReference);
router.delete("/references/:client/:id", referencesController.deleteReference);

module.exports = router;
