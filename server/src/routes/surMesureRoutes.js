const express = require("express");
const surMesureController = require("../controllers/surMesureController");

const router = express.Router();

router.post("/sur-mesure/panneaux", surMesureController.getPanneaux);

module.exports = router;
