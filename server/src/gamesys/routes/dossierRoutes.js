const express = require("express");
const router = express.Router();
const dossierController = require("../controllers/dossierController");

router.get("/", dossierController.listDossiers);
router.get("/search", dossierController.searchDossiers);

router.get("/detail", dossierController.getDossierDetail);

router.get("/commande/:commande", dossierController.getDossierDetail);

router.get("/:numero/full", dossierController.getDossierFull);
router.get("/:numero/visuel", dossierController.getDossierVisual);
router.get("/:numero/production", dossierController.getDossierProduction);
router.get("/:numero/livraison", dossierController.getDossierLivraison);
router.get("/:numero/raw", dossierController.getDossierRaw);

router.get("/:numero", dossierController.getDossierDetail);

module.exports = router;
