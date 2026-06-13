const mongoose = require("mongoose");
const { getOdbcStatus } = require("../gamesys/config/db");
const { state } = require("../services/appState");

const MONGO_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

function getHealth(req, res) {
  const mongoReadyState = mongoose.connection.readyState;
  const mongoState = MONGO_STATES[mongoReadyState] || "unknown";
  const odbcState = getOdbcStatus();

  const healthy = mongoReadyState === 1 && odbcState === "connected";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    mongodb: mongoState,
    odbc: odbcState,
    symlinks: state.networkStatus,
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}

module.exports = { getHealth };
