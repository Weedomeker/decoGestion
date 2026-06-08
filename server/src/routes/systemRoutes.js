const express = require("express");
const systemController = require("../controllers/systemController");

const router = express.Router();

router.get("/process", systemController.getProcess);
router.get("/public", systemController.getPublic);
router.get("/path", systemController.getPath);
router.get("/formatsTauro", systemController.getFormatsTauro);
router.get("/qrcode", systemController.getQrCode);

module.exports = router;
