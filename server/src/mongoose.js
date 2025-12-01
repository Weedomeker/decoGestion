require("dotenv").config();
const mongoose = require("mongoose");

const main = async () => {
  await mongoose.connect(
    process.env.NODE_ENV === "development"
      ? process.env.MONGO_URL + "Test?retryWrites=true&w=majority&appName=Orphea"
      : process.env.MONGO_URL + "DecoKin?retryWrites=true&w=majority&appName=Orphea",
  );
  console.log("Mongoose connecté !");
};

module.exports = main;
