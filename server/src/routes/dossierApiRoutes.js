const express = require("express");
const dossierApiController = require("../controllers/dossierApiController");

const router = express.Router();

router.get("/dossier-api/:numero", dossierApiController.getDossierApi);

module.exports = router;
