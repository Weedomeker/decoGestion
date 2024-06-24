require('dotenv').config();
const mongoose = require('mongoose');

const main = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('Mongoose connecté !');
};

module.exports = main;
