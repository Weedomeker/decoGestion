const express = require("express");
const stockController = require("../controllers/stockController");

const router = express.Router();

router.post("/stock", stockController.getStock);

module.exports = router;
