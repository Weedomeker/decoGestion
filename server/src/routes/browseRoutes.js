const express = require("express");
const router = express.Router();
const { browse } = require("../controllers/browseController");

router.get("/browse", browse);

module.exports = router;
