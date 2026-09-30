const express = require("express");
const systemController = require("../controllers/systemController");

const router = express.Router();

router.get("/process", systemController.getProcess);
router.get("/path", systemController.getPath);
router.get("/formatsTauro", systemController.getFormatsTauro);
router.get("/version", systemController.getVersion);
router.get("/changelog", systemController.getChangelog);

module.exports = router;
