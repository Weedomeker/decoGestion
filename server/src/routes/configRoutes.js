const express = require("express");
const configController = require("../controllers/configController");

const router = express.Router();

router.post("/config", configController.postConfig);
router.get("/config", configController.getConfig);

module.exports = router;
