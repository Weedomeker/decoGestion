const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.get("/detail", (req, res) => {
  const { commande } = req.query;
  if (!commande) {
    return res.status(400).json({
      error: "Veuillez fournir un paramètre commande (ex: ?commande=102017/00)",
      code: "ORDER_QUERY_REQUIRED",
    });
  }
  req.params.commande = commande;
  orderController.getOrderProductionDetails(req, res);
});

router.get("/:commande", orderController.getOrderProductionDetails);

module.exports = router;
