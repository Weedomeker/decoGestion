const Stocks = require('./models/Stocks');

const findStock = async (ref) => {
  const stock = await Stocks.findOne({ ref });
  if (!stock) return;

  return stock;
};

module.exports = findStock;
