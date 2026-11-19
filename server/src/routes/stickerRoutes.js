const express = require("express");
const stickerController = require("../controllers/stickerController");

const router = express.Router();

router.get("/sticker_modeles", stickerController.listerModeles);
router.post("/sticker_modeles", stickerController.creerModele);
router.patch("/sticker_modeles/:id", stickerController.modifierModele);
router.delete("/sticker_modeles/:id", stickerController.supprimerModele);
router.post("/sticker_donnees", stickerController.donneesApercu);
router.get("/sticker_apercus", stickerController.rechercherApercus);
router.get("/sticker_pictos", stickerController.listerPictos);
router.get("/sticker_images", stickerController.listerImages);
router.post("/sticker_images", stickerController.importerImage);
router.get("/sticker_images/:id", stickerController.lireImage);
router.delete("/sticker_images/:id", stickerController.supprimerImage);

module.exports = router;
