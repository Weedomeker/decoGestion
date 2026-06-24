import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Divider, Popup } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

const DOT_STATE = {
  ok:      { cls: "network-dot network-dot--ok" },
  degraded:{ cls: "network-dot network-dot--degraded network-dot--pulse" },
  offline: { cls: "network-dot network-dot--offline network-dot--pulse-fast" },
  unknown: { cls: "network-dot network-dot--unknown" },
};

function ServiceRow({ ok, label }) {
  const color =
    ok === true  ? "var(--success)"    :
    ok === false ? "var(--danger)"     :
                   "var(--text-muted)";
  const text = ok === true ? "OK" : ok === false ? "KO" : "…";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: color, flexShrink: 0, display: "inline-block",
      }} />
      <span style={{ color: "var(--text-secondary)", minWidth: 72 }}>{label}</span>
      <span style={{ color }}>{text}</span>
    </div>
  );
}

ServiceRow.propTypes = {
  ok: PropTypes.bool,
  label: PropTypes.string.isRequired,
};

export default function ServerStatus({ onHealthChange }) {
  const [health, setHealth] = useState({ status: "unknown" });

  const onHealthChangeRef = useRef(onHealthChange);
  useEffect(() => { onHealthChangeRef.current = onHealthChange; });

  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        setHealth(data);
        onHealthChangeRef.current?.(data);
      } catch {
        const offline = { status: "offline" };
        setHealth(offline);
        onHealthChangeRef.current?.(offline);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const { cls }  = DOT_STATE[health.status] ?? DOT_STATE.unknown;
  const symlinks = health.symlinks ?? {};
  const mongoOk  = health.mongodb === "connected";
  const odbcOk   = health.odbc    === "connected";

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 2px" }}>
      <ServiceRow ok={mongoOk} label="MongoDB" />
      <ServiceRow ok={odbcOk}  label="ODBC"    />
      <Divider style={{ margin: "4px 0" }} />
      {["LM", "CASTO", "BRICO", "ECOM", "PREVIEW"].map((k) => (
        <ServiceRow key={k} ok={symlinks[k] ?? null} label={k} />
      ))}
      <Divider style={{ margin: "4px 0" }} />
      <a
        href={`${API_BASE}/admin/queues`}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textDecoration: "none" }}
      >
        ↗ Bull Board (file Redis)
      </a>
    </div>
  );

  return (
    <Popup
      trigger={<span className={cls} tabIndex={0} role="button" aria-label="État des services" />}
      content={content}
      position="bottom right"
      on={["hover", "click", "focus"]}
      hoverable
      style={{
        minWidth: 160,
        background: "var(--bg-elevated)",
        border:     "1px solid var(--border-bright)",
        color:      "var(--text-primary)",
        boxShadow:  "0 4px 20px rgba(0,0,0,0.5)",
      }}
    />
  );
}

ServerStatus.propTypes = {
  onHealthChange: PropTypes.func,
};
