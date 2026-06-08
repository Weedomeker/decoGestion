const findStock = require("../findStock");

async function getStock(req, res) {
  const { ref } = req.body;
  if (!ref) return res.status(400).json({ error: "Ref required" });

  try {
    const stock = await findStock(ref);
    if (stock) return res.status(200).json({ stock });
    return res.status(404).json({ error: "Stock not found" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  getStock,
};
