import { useEffect, useState } from "react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

const NETWORK_KEYS = ["LM", "CASTO", "BRICO", "ECOM"];

function deriveServiceState(isUnknown, connected) {
  if (isUnknown) return "unknown";
  return connected ? "ok" : "ko";
}

function deriveNetworkState(isUnknown, val) {
  if (isUnknown || val === undefined) return "unknown";
  return val ? "ok" : "ko";
}

function TooltipRow({ label, state }) {
  const color = state === "ok" ? "#22c55e" : state === "ko" ? "#ef4444" : "#555";
  const text  = state === "ok" ? "OK"      : state === "ko" ? "KO"      : "—";
  return (
    <div className="srv-tooltip-row">
      <span className="srv-tooltip-name">{label}</span>
      <div className="srv-tooltip-state">
        <span className="srv-tooltip-dot" style={{ background: color }} />
        <span className="srv-tooltip-val" style={{ color }}>{text}</span>
      </div>
    </div>
  );
}

function SrvTooltip({ health }) {
  const isUnknown = health.status === "unknown";
  const symlinks  = health.symlinks ?? {};

  const services = [
    { label: "MongoDB", state: deriveServiceState(isUnknown, health.mongodb === "connected") },
    { label: "GameSys", state: deriveServiceState(isUnknown, health.odbc    === "connected") },
  ];
  const network = NETWORK_KEYS.map(k => ({
    label: k,
    state: deriveNetworkState(isUnknown, symlinks[k]),
  }));

  return (
    <div className="srv-tooltip">
      <div className="srv-tooltip-section">Services</div>
      {services.map(r => <TooltipRow key={r.label} {...r} />)}
      <div className="srv-tooltip-divider" />
      <div className="srv-tooltip-section">Réseau clients</div>
      {network.map(r => <TooltipRow key={r.label} {...r} />)}
    </div>
  );
}

export default function ServerStatus({ onHealthChange }) {
  const [health, setHealth] = useState({ status: "unknown" });
  const [open, setOpen]     = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch(`http://${HOST}:${PORT}/health`);
        const data = await res.json();
        setHealth(data);
        onHealthChange?.(data);
      } catch {
        const offline = { status: "offline" };
        setHealth(offline);
        onHealthChange?.(offline);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const isUnknown = health.status === "unknown";
  const symlinks  = health.symlinks ?? {};

  const allStates = [
    deriveServiceState(isUnknown, health.mongodb === "connected"),
    deriveServiceState(isUnknown, health.odbc    === "connected"),
    ...NETWORK_KEYS.map(k => deriveNetworkState(isUnknown, symlinks[k])),
  ];

  const badgeState = isUnknown ? null
    : allStates.some(s => s === "ko") ? "ko"
    : "ok";

  return (
    <div
      className="srv-status-trigger"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <svg viewBox="0 0 24 24" className="srv-status-icon">
        <rect x="2" y="3" width="20" height="6" rx="1.5" />
        <rect x="2" y="13" width="20" height="6" rx="1.5" />
        <circle cx="18.5" cy="6"  r="1.3" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="16" r="1.3" fill="currentColor" stroke="none" />
      </svg>
      {badgeState && <span className={`srv-status-badge srv-status-badge--${badgeState}`} />}
      {open && <SrvTooltip health={health} />}
    </div>
  );
}
