const express = require("express");
const systemController = require("../controllers/systemController");

const router = express.Router();

router.get("/process", systemController.getProcess);
router.get("/path", systemController.getPath);
router.get("/formatsTauro", systemController.getFormatsTauro);

module.exports = router;
