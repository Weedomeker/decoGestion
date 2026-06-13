import { useEffect, useState } from "react";
import { Label } from "semantic-ui-react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

const CONFIG = {
  ok:      { color: "green",  text: "Connecté" },
  degraded:{ color: "orange", text: "Mode dégradé" },
  offline: { color: "red",    text: "Hors ligne" },
  unknown: { color: "grey",   text: "…" },
};

export default function ServerStatus() {
  const [health, setHealth] = useState({ status: "unknown" });

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`http://${HOST}:${PORT}/health`);
        const data = await res.json();
        setHealth(data);
      } catch {
        setHealth({ status: "offline" });
      }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const { color, text } = CONFIG[health.status] ?? CONFIG.unknown;

  const details = [];
  if (health.status === "degraded") {
    if (health.mongodb !== "connected") details.push(`MongoDB: ${health.mongodb}`);
    if (health.odbc !== "connected") details.push(`ODBC: ${health.odbc}`);
  }

  return (
    <Label size="tiny" color={color} style={{ marginLeft: "0.5rem" }}>
      {text}
      {details.length > 0 && ` — ${details.join(", ")}`}
    </Label>
  );
}
