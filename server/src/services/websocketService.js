const WebSocket = require("ws");

let wss;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    ws.on("close", () => {});
    ws.on("error", () => {}); // évite le crash si le client se déconnecte brutalement
  });

  return wss;
}

function broadcastWS(data) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (_) {
        // Client fermé entre le check readyState et le send — ignoré
      }
    }
  });
}

function broadcastCompletedJob(job) {
  broadcastWS({ completedJob: job });
}

function broadcastHealth(payload) {
  broadcastWS({ type: "health", ...payload });
}

module.exports = {
  initWebSocket,
  broadcastWS,
  broadcastCompletedJob,
  broadcastHealth,
};
