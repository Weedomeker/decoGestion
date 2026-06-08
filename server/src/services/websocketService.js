const WebSocket = require("ws");

let wss;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    ws.on("close", () => {});
  });

  return wss;
}

function broadcastWS(data) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastCompletedJob(job) {
  broadcastWS({ completedJob: job });
}

module.exports = {
  initWebSocket,
  broadcastWS,
  broadcastCompletedJob,
};
