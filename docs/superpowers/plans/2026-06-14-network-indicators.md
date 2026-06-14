# Network Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter des indicateurs réseau discrets — un dot animé dans le header avec tooltip de détail, et un micro-badge de statut sur chaque bouton client dans le formulaire.

**Architecture:** 3 fichiers touchés. Le CSS ajoute les classes `.network-dot` + `.client-dot` + les keyframes. `ServerStatus.jsx` est refactorisé (supprime le Label, ajoute dot + Popup). `App.jsx` ajoute un badge sur chaque span de bouton client.

**Tech Stack:** React, Semantic UI React (`Popup`, `Divider`), CSS variables existantes du thème dark industrial.

---

## Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `client/src/css/index.css` | Styles `.network-dot`, `.client-dot`, `@keyframes networkPulse` |
| `client/src/components/ServerStatus.jsx` | Refactorisé : dot + Popup de détail (supprime le Label) |
| `client/src/App.jsx` | Badge `.client-dot` sur chaque span de bouton client |

---

### Task 1 : Styles CSS — dot header + badge boutons

**Files:**
- Modify: `client/src/css/index.css` (append à la fin)

- [ ] **Step 1 : Ajouter les styles en fin de `client/src/css/index.css`**

Ouvrir `client/src/css/index.css` et ajouter à la toute fin :

```css
/* ===================== NETWORK STATUS DOT ===================== */

.network-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.network-dot--ok      { background: var(--success); }
.network-dot--degraded { background: var(--warning); }
.network-dot--offline  { background: var(--danger); }
.network-dot--unknown  { background: var(--text-muted); }

@keyframes networkPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 170, 0, 0.6); }
  50%       { box-shadow: 0 0 0 6px rgba(255, 170, 0, 0); }
}

@keyframes networkPulseFast {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 58, 58, 0.6); }
  50%       { box-shadow: 0 0 0 6px rgba(255, 58, 58, 0); }
}

.network-dot--pulse      { animation: networkPulse 2s infinite; }
.network-dot--pulse-fast { animation: networkPulseFast 1.2s infinite; }

/* Client badge dot */
.client-btn-wrap {
  position: relative;
  display: inline-block;
}

.client-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.client-dot--ok      { background: var(--success); }
.client-dot--ko      { background: var(--danger); }
.client-dot--unknown { background: var(--text-muted); }
```

- [ ] **Step 2 : Commit**

```bash
git add client/src/css/index.css
git commit -m "style: ajoute classes network-dot et client-dot avec animations pulse"
```

---

### Task 2 : Refactoriser `ServerStatus.jsx`

**Files:**
- Modify: `client/src/components/ServerStatus.jsx`

- [ ] **Step 1 : Remplacer intégralement le contenu de `ServerStatus.jsx`**

```jsx
import { useEffect, useState } from "react";
import { Divider, Popup } from "semantic-ui-react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

const DOT_STATE = {
  ok:      { cls: "network-dot network-dot--ok" },
  degraded:{ cls: "network-dot network-dot--degraded network-dot--pulse" },
  offline: { cls: "network-dot network-dot--offline network-dot--pulse-fast" },
  unknown: { cls: "network-dot network-dot--unknown" },
};

function ServiceRow({ ok, label }) {
  const color =
    ok === true  ? "var(--success)"   :
    ok === false ? "var(--danger)"    :
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

export default function ServerStatus({ onHealthChange }) {
  const [health, setHealth] = useState({ status: "unknown" });

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

  const { cls }    = DOT_STATE[health.status] ?? DOT_STATE.unknown;
  const symlinks   = health.symlinks ?? {};
  const mongoOk    = health.mongodb === "connected";
  const odbcOk     = health.odbc    === "connected";

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 2px" }}>
      <ServiceRow ok={mongoOk} label="MongoDB" />
      <ServiceRow ok={odbcOk}  label="ODBC"    />
      <Divider style={{ margin: "4px 0" }} />
      {["LM", "CASTO", "BRICO", "ECOM", "PREVIEW"].map((k) => (
        <ServiceRow key={k} ok={symlinks[k] ?? null} label={k} />
      ))}
    </div>
  );

  return (
    <Popup
      trigger={<span className={cls} />}
      content={content}
      position="bottom right"
      on="hover"
      style={{
        minWidth: 160,
        background:   "var(--bg-elevated)",
        border:       "1px solid var(--border-bright)",
        color:        "var(--text-primary)",
        boxShadow:    "0 4px 20px rgba(0,0,0,0.5)",
      }}
    />
  );
}
```

- [ ] **Step 2 : Vérifier visuellement dans le navigateur**

Démarrer le backend (`npm run server`) et le frontend (`npm run client`), puis ouvrir `http://localhost:5173`.

Vérifier :
- Un point vert (8px) visible dans le header à droite
- Au survol du point : popup avec les lignes MongoDB / ODBC / LM / CASTO / BRICO / ECOM / PREVIEW et leurs couleurs
- Arrêter le serveur → le point passe rouge et pulse

- [ ] **Step 3 : Commit**

```bash
git add client/src/components/ServerStatus.jsx
git commit -m "feat: ServerStatus — dot animé + Popup de détail réseau"
```

---

### Task 3 : Badges de statut sur les boutons clients dans `App.jsx`

**Files:**
- Modify: `client/src/App.jsx` — section du sélecteur client, lignes ~1108–1138

- [ ] **Step 1 : Identifier la section dans `App.jsx`**

La section à modifier est le `<Button.Group>` du sélecteur client en mode manuel. Le code existant est :

```jsx
{["LM", "CASTO", "BRICO", "ECOM"].map((c) => {
  const isKo = symlinkStatus[c] === false;
  return (
    <Popup
      key={c}
      content={`Accès réseau ${c} indisponible`}
      disabled={!isKo}
      trigger={
        <span>
          <Button ... />
        </span>
      }
    />
  );
})}
```

- [ ] **Step 2 : Ajouter la classe `client-btn-wrap` et le badge sur le `<span>` trigger**

Remplacer uniquement le `trigger` du `<Popup>` dans le `.map()` des clients (conserver tout le reste intact) :

```jsx
{["LM", "CASTO", "BRICO", "ECOM"].map((c) => {
  const isKo = symlinkStatus[c] === false;
  const dotCls =
    healthData === null          ? "client-dot client-dot--unknown" :
    symlinkStatus[c] === true    ? "client-dot client-dot--ok"      :
    symlinkStatus[c] === false   ? "client-dot client-dot--ko"      :
                                   "client-dot client-dot--unknown";
  return (
    <Popup
      key={c}
      content={`Accès réseau ${c} indisponible`}
      disabled={!isKo}
      trigger={
        <span className="client-btn-wrap">
          <Button
            toggle
            type="button"
            active={checkFolder === c}
            color={checkFolder === c ? clientColor(c) : undefined}
            onClick={() => {
              if (isKo) return;
              handleResetForm();
              setCheckFolder(c);
            }}
            disabled={isKo}
            icon={CLIENT_ICONS[c]}
            content={c}
            style={isKo ? { pointerEvents: "none", opacity: 0.45 } : {}}
          />
          <span className={dotCls} />
        </span>
      }
    />
  );
})}
```

- [ ] **Step 3 : Vérifier visuellement**

Dans le navigateur, vérifier :
- Un micro-badge (6px) apparaît dans le coin supérieur droit de chaque bouton LM / CASTO / BRICO / ECOM
- Vert si le symlink est OK, rouge si KO, gris si `healthData` pas encore chargé
- Le badge ne perturbe pas le clic ni le comportement existant du bouton

- [ ] **Step 4 : Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: badge de statut réseau sur les boutons clients (dot 6px)"
```

---

## Self-review

**Couverture spec :**
- [x] Dot 8px header avec états ok/degraded/offline/unknown
- [x] Animation pulse orange (dégradé) et rouge rapide (offline)
- [x] Tooltip au survol avec MongoDB, ODBC, LM, CASTO, BRICO, ECOM, PREVIEW
- [x] Badge 6px sur boutons clients (vert/rouge/gris)
- [x] Edge cases : `healthData null` → gris, serveur offline → rouge header + gris badges
- [x] Aucun nouveau fichier, aucune nouvelle dépendance

**Types et noms cohérents :**
- `DOT_STATE` défini Task 2 Step 1, utilisé dans le même fichier uniquement
- `dotCls` calculé localement dans Task 3 Step 2
- Classes CSS `.network-dot--pulse` et `.network-dot--pulse-fast` définies Task 1, référencées Task 2 : cohérent

**Placeholders :** aucun.
