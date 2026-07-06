const express = require("express");
const stockController = require("../controllers/stockController");

const router = express.Router();

router.post("/stock", stockController.getStock);
router.get("/stock-profiles", stockController.getStockProfiles);
router.post("/stock-profiles", stockController.createStockProfile);
router.patch("/stock-profiles/:id", stockController.updateStockProfile);
router.delete("/stock-profiles/:id", stockController.deleteStockProfile);

module.exports = router;
