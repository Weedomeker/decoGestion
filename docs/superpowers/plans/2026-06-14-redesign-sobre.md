# Refonte Design Sobre — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rethème CSS complet de decoGestion vers une palette ivoire/stone sobre, sans néons ni animations, avec accents clients désaturés.

**Architecture:** Modifications CSS uniquement sur `client/src/css/index.css` (1308 lignes) et `client/src/css/JobsList.css` (158 lignes). Semantic UI React conservé — ses composants sont re-skinés via les surcharges `.ui.*` existantes. Aucun fichier JSX n'est touché.

**Tech Stack:** CSS custom properties, Semantic UI React (surcouche `!important`), Vite dev server (`npm run client`)

**Spec de référence :** `docs/superpowers/specs/2026-06-14-redesign-sobre.md`

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `client/src/css/index.css` | Modifier — sections `:root`, `BASE`, `HEADER`, `SEMANTIC UI OVERRIDES`, composants formulaire, dossier, dots réseau |
| `client/src/css/JobsList.css` | Modifier — rethème complet de la table des jobs |
| `client/index.html` | Modifier — supprimer les imports Google Fonts |

---

## Avant de commencer

- [ ] Lancer le dev server : `npm run client` (dans un terminal séparé du backend)
- [ ] Ouvrir `http://localhost:5173` dans le navigateur
- [ ] Garder l'onglet ouvert pendant toute l'implémentation — Vite recharge à chaud

---

## Task 1 : Supprimer les imports Google Fonts

**Fichier :** `client/index.html`

Le fichier `client/index.html` importe actuellement Barlow, Barlow Condensed et JetBrains Mono via Google Fonts. Il faut les retirer.

- [ ] **Ouvrir `client/index.html`** et localiser les balises `<link>` qui chargent les polices Google. Elles ressemblent à :
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Barlow..." rel="stylesheet">
  ```
- [ ] **Supprimer toutes les balises `<link>` Google Fonts** (il peut y en avoir 1 ou 2). Garder uniquement les liens non liés aux fonts.

- [ ] **Vérifier dans le navigateur** : la page se recharge, les polices deviennent system-ui (Helvetica Neue / Arial). C'est normal et attendu.

- [ ] **Commit :**
  ```bash
  git add client/index.html
  git commit -m "style: supprime imports Google Fonts (Barlow, JetBrains Mono)"
  ```

---

## Task 2 : Remplacer les variables CSS dans `:root`

**Fichier :** `client/src/css/index.css` — section `:root` (lignes 1–63)

C'est la tâche la plus impactante : remplacer les variables de couleur change ~80 % de l'UI automatiquement grâce aux `var()`.

- [ ] **Remplacer la totalité du bloc `:root { ... }` par :**

```css
:root {
  --s-xs: 4px;
  --s-sm: 8px;
  --s-md: 16px;
  --s-lg: 24px;
  --s-xl: 32px;
  --radius: 3px;

  /* Backgrounds */
  --bg-base:     #eeebe5;
  --bg-surface:  #e8e4dc;
  --bg-elevated: #f0ede8;
  --bg-hover:    rgba(42, 37, 32, 0.04);
  --bg-input:    #faf8f4;

  /* Borders */
  --border-dim:     #ede9e2;
  --border-default: #d9d4cc;
  --border-bright:  #cac4ba;
  --border-color:   #d9d4cc;

  /* Text */
  --text-primary:   #2a2520;
  --text-secondary: #776e62;
  --text-muted:     #b0a89e;
  --surface-bg:     #e8e4dc;

  /* Client accents (désaturés — pas de néon) */
  --color-lm:    #2d6e46;
  --color-casto: #325a91;
  --color-ecom:  #237870;
  --color-brico: #a05523;

  /* Dots de statut réseau */
  --dot-lm:    #6dbb8a;
  --dot-casto: #6a9bbf;
  --dot-ecom:  #4aacaa;
  --dot-brico: #bf7a3a;

  /* Système sémantique (lisible sur fond clair) */
  --accent:       #325a91;
  --accent-soft:  rgba(50, 90, 145, 0.12);
  --danger:       #b84040;
  --danger-soft:  rgba(184, 64, 64, 0.08);
  --success:      #2d6e46;
  --warning:      #a07830;
  --warning-soft: rgba(160, 120, 48, 0.08);

  /* Table */
  --table-header-bg:    #f0ede8;
  --table-header-color: #b0a89e;
  --table-row-height:   34px;

  /* Layout */
  --form-panel-width: 1100px;
}
```

- [ ] **Vérifier dans le navigateur** : le fond passe en ivoire, les textes en stone. Il reste probablement du noir dur sur certains éléments — c'est normal, les prochaines tâches le corrigent.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: variables CSS — palette ivoire/stone, accents clients désaturés"
  ```

---

## Task 3 : Nettoyer la base — supprimer grille overlay et animations

**Fichier :** `client/src/css/index.css` — sections `BASE` et partout dans le fichier

- [ ] **Dans la section `/* ===================== BASE ===================== */`**, remplacer le bloc `html, body` et supprimer `body::before` :

```css
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  max-height: 100vh;
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

#root {
  position: relative;
  z-index: 1;
  height: 100%;
}
```

  Le bloc `body::before { ... }` (grille tactique) doit être **entièrement supprimé**.

- [ ] **Supprimer tous les blocs `@keyframes`** dans `index.css`. Chercher et supprimer :
  - `@keyframes pulse-badge { ... }`
  - `@keyframes networkPulse { ... }`
  - `@keyframes networkPulseFast { ... }`

- [ ] **Dans la section scrollbars**, remplacer les couleurs codées en dur :

```css
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--bg-base); }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
```

- [ ] **Vérifier dans le navigateur** : la grille en pointillés a disparu du fond. La page est propre.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: supprime grille overlay, @keyframes et polices codées en dur"
  ```

---

## Task 4 : Header, Footer et onglets de navigation

**Fichier :** `client/src/css/index.css` — sections `HEADER` et `FOOTER`

- [ ] **Remplacer la section `/* ===================== HEADER ===================== */`** entière par :

```css
/* ===================== HEADER ===================== */

.header {
  grid-column: 1;
  grid-row: 1;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-default);
  box-shadow: none;
  width: 100%;
  padding: 0 var(--s-lg);
  display: grid;
  grid-template-columns: 180px 1fr auto;
  align-items: center;
}

.header-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

img.ui.image.header-logo,
.header-logo img {
  filter: none !important;
  vertical-align: middle;
  max-width: 150px;
  margin: 0;
}

img.ui.image:not(.header-logo) {
  filter: none !important;
  vertical-align: middle;
  margin: 0;
}

.header-version {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  gap: var(--s-sm);
  align-items: center;
}

.header-tabs {
  display: flex;
  gap: 0;
  align-self: stretch;
  align-items: flex-end;
  justify-content: center;
}

.header-tab {
  padding: 8px 20px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  font-weight: 500;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 7px;
  line-height: 1;
  transition: color 0.15s;
  margin-bottom: -1px;
}

.header-tab.active {
  color: var(--text-primary);
  border-bottom: 2px solid var(--text-primary);
}

.header-tab:hover:not(.active) {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  background: var(--text-primary);
  color: var(--bg-base);
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
}
```

- [ ] **Remplacer la section `/* ===================== FOOTER ===================== */`** par :

```css
/* ===================== FOOTER ===================== */

.footer {
  grid-column: 1;
  grid-row: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-default);
  color: var(--text-muted);
  text-align: center;
  justify-content: center;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  min-height: 48px;
  max-height: 48px;
}

.footer h4 { margin: 0 0 2px; font-size: 9px; }
.footer p  { margin: 0; }
```

- [ ] **Vérifier dans le navigateur** : le header est en ivoire clair, les onglets Formulaire/File sont discrets, le badge de compte est noir stone.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: header et footer — palette stone, supprime glows et text-shadow"
  ```

---

## Task 5 : Semantic UI — Inputs, Dropdowns, Checkboxes, Progress

**Fichier :** `client/src/css/index.css` — section `SEMANTIC UI OVERRIDES`

- [ ] **Remplacer le bloc `/* --- Inputs --- */`** par :

```css
/* --- Inputs --- */
.ui.input > input,
.ui.form input:not([type="checkbox"]),
.pac-target-input {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: var(--radius) !important;
  color: var(--text-primary) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 13px !important;
  transition: border-color 0.15s !important;
}

.ui.input > input:focus,
.ui.form input:not([type="checkbox"]):focus,
.pac-target-input:focus {
  border-color: var(--text-primary) !important;
  box-shadow: none !important;
  outline: none !important;
}

.ui.input > input::placeholder { color: var(--text-muted) !important; }
```

- [ ] **Remplacer le bloc `/* --- Dropdowns --- */`** par :

```css
/* --- Dropdowns --- */
.ui.dropdown,
.ui.dropdown:not(.button) {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: var(--radius) !important;
  color: var(--text-secondary) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 13px !important;
}

.ui.dropdown > .text { color: var(--text-primary) !important; }
.ui.dropdown > .default.text { color: var(--text-muted) !important; }

.ui.dropdown .menu {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: var(--radius) !important;
  box-shadow: 0 4px 16px rgba(42,37,32,0.1) !important;
}

.ui.dropdown .menu > .item {
  color: var(--text-secondary) !important;
  border-top: 1px solid var(--border-dim) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 12px !important;
}

.ui.dropdown .menu > .item:hover {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

.ui.dropdown .menu > .item.active,
.ui.dropdown .menu > .item.selected {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

.ui.dropdown .menu > .divider {
  border-top: 1px solid var(--border-default) !important;
}

.ui.dropdown > .dropdown.icon { color: var(--text-muted) !important; }

.ui.active.dropdown,
.ui.dropdown:focus {
  border-color: var(--text-primary) !important;
  box-shadow: none !important;
}
```

- [ ] **Remplacer le bloc `/* --- Checkboxes --- */`** par :

```css
/* --- Checkboxes --- */
.ui.checkbox label {
  color: var(--text-secondary) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 13px !important;
}

.ui.checkbox input ~ label::before {
  background: var(--bg-input) !important;
  border-color: var(--border-bright) !important;
}

.ui.checkbox input:checked ~ label::before {
  background: var(--text-primary) !important;
  border-color: var(--text-primary) !important;
}

.ui.checkbox input:checked ~ label::after {
  color: var(--bg-base) !important;
}

.ui.toggle.checkbox label::before {
  background: var(--bg-elevated) !important;
  border: 1px solid var(--border-bright) !important;
}
.ui.toggle.checkbox input:checked ~ label::before {
  background: var(--text-primary) !important;
  box-shadow: none !important;
}
.ui.toggle.checkbox input:checked ~ label { color: var(--text-primary) !important; }
```

- [ ] **Remplacer le bloc `/* --- Progress bar --- */`** par :

```css
/* --- Progress bar --- */
.ui.progress {
  background: var(--border-dim) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: var(--radius) !important;
  box-shadow: none !important;
}

.ui.progress .bar {
  background: var(--text-primary) !important;
  box-shadow: none !important;
  border-radius: var(--radius) !important;
  transition: width 0.3s ease !important;
}

.ui.progress .bar > .progress {
  color: var(--bg-base) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 10px !important;
}

.ui.progress.indicating .bar { background: var(--text-primary) !important; }
```

- [ ] **Remplacer le bloc `/* --- Segments --- */`** par :

```css
/* --- Segments --- */
.ui.segment {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-default) !important;
  box-shadow: none !important;
  color: var(--text-primary) !important;
}
```

- [ ] **Remplacer le bloc `/* --- Form labels --- */`** par :

```css
/* --- Form labels --- */
.ui.form .field > label,
.ui.form label {
  color: var(--text-muted) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 9px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 2px !important;
}
```

- [ ] **Vérifier dans le navigateur** : les champs de saisie sont en fond ivoire, les dropdowns ouverts ont un fond clair, les checkboxes se cochent en noir stone.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: Semantic UI inputs, dropdowns, checkboxes, progress — fond clair"
  ```

---

## Task 6 : Semantic UI — Boutons

**Fichier :** `client/src/css/index.css` — sous-section `/* --- Buttons --- */`

- [ ] **Remplacer tout le bloc boutons** (du commentaire `/* --- Buttons --- */` jusqu'au commentaire `/* --- Checkboxes --- */`) par :

```css
/* --- Buttons --- */
.ui.button {
  background: var(--bg-elevated) !important;
  color: var(--text-secondary) !important;
  border: 1px solid var(--border-default) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-weight: 500 !important;
  font-size: 12px !important;
  letter-spacing: 0.3px !important;
  border-radius: var(--radius) !important;
  box-shadow: none !important;
  transition: background 0.15s, border-color 0.15s !important;
}

.ui.button:hover {
  background: var(--bg-hover) !important;
  border-color: var(--border-bright) !important;
  color: var(--text-primary) !important;
}

/* Red / Danger */
.ui.red.button, .ui.red.button:focus {
  background: transparent !important;
  color: var(--danger) !important;
  border-color: var(--danger) !important;
}
.ui.red.button:hover {
  background: var(--danger-soft) !important;
  box-shadow: none !important;
}

/* Green — LM */
.ui.green.button {
  background: transparent !important;
  color: var(--color-lm) !important;
  border-color: var(--color-lm) !important;
}
.ui.green.button:hover {
  background: rgba(45, 110, 70, 0.06) !important;
  box-shadow: none !important;
}

/* Blue — CASTO */
.ui.blue.button {
  background: transparent !important;
  color: var(--color-casto) !important;
  border-color: var(--color-casto) !important;
}
.ui.blue.button:hover {
  background: rgba(50, 90, 145, 0.06) !important;
  box-shadow: none !important;
}

/* Teal — ECOM */
.ui.teal.button {
  background: transparent !important;
  color: var(--color-ecom) !important;
  border-color: var(--color-ecom) !important;
}
.ui.teal.button:hover {
  background: rgba(35, 120, 115, 0.06) !important;
  box-shadow: none !important;
}

/* Orange — BRICO */
.ui.orange.button {
  background: transparent !important;
  color: var(--color-brico) !important;
  border-color: var(--color-brico) !important;
}
.ui.orange.button:hover {
  background: rgba(160, 85, 35, 0.06) !important;
  box-shadow: none !important;
}

/* Grey */
.ui.grey.button {
  background: var(--bg-elevated) !important;
  color: var(--text-muted) !important;
  border-color: var(--border-dim) !important;
}

/* VK = bouton principal submit */
.ui.vk.button {
  background: var(--text-primary) !important;
  color: var(--bg-base) !important;
  border: none !important;
  box-shadow: none !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  letter-spacing: 1px !important;
  text-shadow: none !important;
}
.ui.vk.button:hover {
  background: #3d3530 !important;
  box-shadow: none !important;
}

/* Disabled */
.ui.button:disabled,
.ui.button.disabled {
  opacity: 0.3 !important;
}

/* Toggle button group */
.ui.buttons .button + .button { border-left: none !important; }
```

- [ ] **Remplacer le bloc client-selector** pour adapter l'état actif :

```css
/* ===================== CLIENT SELECTOR ===================== */

.client-selector .ui.button,
.client-selector .ui.green.button,
.client-selector .ui.blue.button,
.client-selector .ui.teal.button,
.client-selector .ui.orange.button {
  background: transparent !important;
  background-color: transparent !important;
  opacity: 0.45;
  transition: opacity 0.15s, border-color 0.15s !important;
}

.client-selector .ui.green.button.active {
  opacity: 1 !important;
  color: var(--color-lm) !important;
  border-color: var(--color-lm) !important;
  background: rgba(45, 110, 70, 0.08) !important;
  background-color: rgba(45, 110, 70, 0.08) !important;
  box-shadow: none !important;
}

.client-selector .ui.blue.button.active {
  opacity: 1 !important;
  color: var(--color-casto) !important;
  border-color: var(--color-casto) !important;
  background: rgba(50, 90, 145, 0.08) !important;
  background-color: rgba(50, 90, 145, 0.08) !important;
  box-shadow: none !important;
}

.client-selector .ui.teal.button.active {
  opacity: 1 !important;
  color: var(--color-ecom) !important;
  border-color: var(--color-ecom) !important;
  background: rgba(35, 120, 115, 0.08) !important;
  background-color: rgba(35, 120, 115, 0.08) !important;
  box-shadow: none !important;
}

.client-selector .ui.orange.button.active {
  opacity: 1 !important;
  color: var(--color-brico) !important;
  border-color: var(--color-brico) !important;
  background: rgba(160, 85, 35, 0.08) !important;
  background-color: rgba(160, 85, 35, 0.08) !important;
  box-shadow: none !important;
}
```

- [ ] **Vérifier dans le navigateur** : le bouton "Ajouter" est noir stone, les boutons client sont discrets avec un accent de couleur désaturée à l'état actif.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: boutons Semantic UI — noir stone, accents clients désaturés, sans glow"
  ```

---

## Task 7 : Semantic UI — Messages et Modals

**Fichier :** `client/src/css/index.css` — sous-sections `/* --- Messages --- */` et `/* --- Modals --- */`

- [ ] **Remplacer le bloc `/* --- Messages --- */`** par :

```css
/* --- Messages --- */
.ui.message {
  background: var(--bg-elevated) !important;
  border: 1px solid var(--border-default) !important;
  color: var(--text-secondary) !important;
  box-shadow: none !important;
  border-radius: var(--radius) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
}

.ui.message .header {
  color: var(--text-primary) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  letter-spacing: 0.3px !important;
}

.ui.yellow.message, .ui.warning.message {
  border-left: 3px solid var(--warning) !important;
  background: var(--warning-soft) !important;
  color: var(--warning) !important;
  border-color: transparent !important;
  border-left-color: var(--warning) !important;
}

.ui.red.message, .ui.error.message {
  border-left: 3px solid var(--danger) !important;
  background: var(--danger-soft) !important;
  color: var(--danger) !important;
  border-color: transparent !important;
  border-left-color: var(--danger) !important;
}

.ui.green.message, .ui.success.message {
  border-left: 3px solid var(--success) !important;
  background: rgba(45, 110, 70, 0.06) !important;
  color: var(--success) !important;
  border-color: transparent !important;
  border-left-color: var(--success) !important;
}

.ui.message .icon { color: inherit !important; }
```

- [ ] **Remplacer le bloc `/* --- Modals --- */`** et le bloc dimmer :

```css
/* --- Modals --- */
.ui.modal {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-default) !important;
  box-shadow: 0 8px 40px rgba(42,37,32,0.15) !important;
  border-radius: calc(var(--radius) * 2) !important;
}

.ui.modal > .header {
  background: var(--bg-elevated) !important;
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-default) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 15px !important;
  letter-spacing: 0.2px !important;
}

.ui.modal > .content {
  background: var(--bg-surface) !important;
  color: var(--text-secondary) !important;
}

.ui.modal > .actions {
  background: var(--bg-elevated) !important;
  border-top: 1px solid var(--border-default) !important;
}

.ui.dimmer {
  background: rgba(42, 37, 32, 0.5) !important;
  backdrop-filter: blur(2px) !important;
}
```

- [ ] **Vérifier dans le navigateur** : ouvrir la modale Config ou soumettre un job invalide pour voir la modale d'erreur. Les modales doivent être en fond ivoire.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: messages et modals Semantic UI — fond clair, couleurs sémantiques désaturées"
  ```

---

## Task 8 : Sections formulaire, mode tabs et header-tabs actif couleur client

**Fichier :** `client/src/css/index.css` — sections `FORM SECTIONS` et `MODE TABS`

- [ ] **Remplacer le bloc `/* ===================== FORM SECTIONS ===================== */`** par :

```css
/* ===================== FORM SECTIONS ===================== */

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
}

.form-section-label {
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-section--accented {
  position: relative;
  border-left: 2px solid var(--client-color, var(--border-default));
  background: var(--client-bg, transparent);
  padding: var(--s-md) var(--s-md);
  border-radius: 0 var(--radius) var(--radius) 0;
  gap: var(--s-sm);
  display: flex;
  flex-direction: column;
}

.form-section--accented[data-client="LM"]    {
  --client-color: var(--color-lm);
  --client-bg: rgba(45, 110, 70, 0.04);
}
.form-section--accented[data-client="CASTO"] {
  --client-color: var(--color-casto);
  --client-bg: rgba(50, 90, 145, 0.04);
}
.form-section--accented[data-client="ECOM"]  {
  --client-color: var(--color-ecom);
  --client-bg: rgba(35, 120, 115, 0.04);
}
.form-section--accented[data-client="BRICO"] {
  --client-color: var(--color-brico);
  --client-bg: rgba(160, 85, 35, 0.04);
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-sm);
}

.options-col {
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
}
```

- [ ] **Remplacer le bloc `/* ===================== MODE TABS ===================== */`** par :

```css
/* ===================== MODE TABS ===================== */

.mode-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: var(--s-md);
}

.mode-tabs .ui.button.toggle {
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--text-muted) !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  margin-bottom: -1px;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-weight: 500 !important;
  font-size: 12px !important;
  letter-spacing: 0.3px !important;
  box-shadow: none !important;
  padding: 8px 16px;
  transition: color 0.15s !important;
}

.mode-tabs .ui.button.toggle.active {
  background: transparent !important;
  color: var(--text-primary) !important;
  border-bottom: 2px solid var(--text-primary) !important;
  box-shadow: none !important;
}

.mode-tabs .ui.button.toggle:hover:not(.active) {
  background: var(--bg-hover) !important;
  color: var(--text-secondary) !important;
}
```

- [ ] **Remplacer le bloc d'erreur inline** :

```css
/* ===================== INLINE MESSAGES ===================== */

.field-error-msg {
  color: var(--danger);
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 10px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.field-error-msg::before {
  content: "⚠";
  font-size: 10px;
}
```

- [ ] **Vérifier dans le navigateur** : les sections "Format & Visuel" ont un liseré gauche de la couleur du client actif (vert discret pour LM, bleu ardoise pour CASTO), les onglets Dossier API / Saisie manuelle sont lisibles.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: form sections, mode tabs — liseré client désaturé, onglets stone"
  ```

---

## Task 9 : Dossier autocomplete — suggestions, chips, badges client

**Fichier :** `client/src/css/index.css` — sections dossier

- [ ] **Remplacer le bloc `/* Dossier autocomplete */`** par :

```css
/* Dossier autocomplete */
.dossier-autocomplete            { max-width: 100% !important; }
.dossier-autocomplete-search     { display: flex; gap: var(--s-sm); align-items: flex-start; }
.dossier-autocomplete-search .ui.input { min-width: 200px; }

.dossier-input-wrapper           { position: relative; }

.dossier-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: 240px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(42,37,32,0.1);
  margin-top: 2px;
  overflow: hidden;
}

.dossier-suggestion-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--border-dim);
}

.dossier-suggestion-item:last-child { border-bottom: none; }

.dossier-suggestion-item:hover,
.dossier-suggestion-item.active {
  background: rgba(42, 37, 32, 0.05);
}

.suggestion-numero {
  font-weight: 600;
  color: var(--text-primary);
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 12px;
  flex-shrink: 0;
}

.suggestion-label {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dossier-jobs-picker { display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--s-sm); }
```

- [ ] **Remplacer le bloc `/* Chips des dossiers chargés */`** par :

```css
/* Chips des dossiers chargés */
.dossier-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--s-sm);
}

/* Labels Semantic UI colorés par client (utilisés comme chips) */
.ui.label.green {
  background: rgba(45,110,70,0.10) !important;
  border: 1px solid rgba(45,110,70,0.3) !important;
  color: var(--color-lm) !important;
}
.ui.label.blue {
  background: rgba(50,90,145,0.10) !important;
  border: 1px solid rgba(50,90,145,0.3) !important;
  color: var(--color-casto) !important;
}
.ui.label.orange {
  background: rgba(160,85,35,0.10) !important;
  border: 1px solid rgba(160,85,35,0.3) !important;
  color: var(--color-brico) !important;
}
.ui.label.teal {
  background: rgba(35,120,115,0.10) !important;
  border: 1px solid rgba(35,120,115,0.3) !important;
  color: var(--color-ecom) !important;
}
```

- [ ] **Remplacer les blocs `/* Badge client coloré */` et `.client-badge`** par :

```css
/* Badge client coloré dans les en-têtes de groupe */
.client-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.client-badge--lm    { background: rgba(45,110,70,0.10);  color: var(--color-lm);    border: 1px solid rgba(45,110,70,0.25); }
.client-badge--casto { background: rgba(50,90,145,0.10);  color: var(--color-casto); border: 1px solid rgba(50,90,145,0.25); }
.client-badge--ecom  { background: rgba(35,120,115,0.10); color: var(--color-ecom);  border: 1px solid rgba(35,120,115,0.25); }
.client-badge--brico { background: rgba(160,85,35,0.10);  color: var(--color-brico); border: 1px solid rgba(160,85,35,0.25); }
```

- [ ] **Vérifier dans le navigateur** : charger un dossier via l'autocomplétion. Les suggestions sont sur fond ivoire, les chips des dossiers chargés ont leur couleur client désaturée.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: dossier autocomplete — suggestions ivoire, chips clients désaturées"
  ```

---

## Task 10 : Dossier table — en-têtes de groupe, lignes, dropdowns intégrés

**Fichier :** `client/src/css/index.css` — section `/* Table dossier */`

- [ ] **Remplacer le bloc header de la dossier-table** (commentaire `/* Neutralise le header coloré... */`) :

```css
/* Neutralise le header coloré imposé par color="green|blue|teal|orange" */
.dossier-table.ui.table thead th,
.dossier-table.ui.green.table thead th,
.dossier-table.ui.blue.table thead th,
.dossier-table.ui.teal.table thead th,
.dossier-table.ui.orange.table thead th {
  background: var(--table-header-bg) !important;
  color: var(--table-header-color) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 9px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 1.8px !important;
  white-space: nowrap !important;
  border-bottom: 1px solid var(--border-default) !important;
}
```

- [ ] **Remplacer le bloc `/* Cellules */`** :

```css
/* Cellules */
.dossier-table.ui.table td {
  background: var(--bg-input) !important;
  color: var(--text-primary) !important;
  padding: 4px 6px !important;
  vertical-align: middle !important;
}
```

- [ ] **Remplacer le bloc `/* Ligne de groupe */`** :

```css
/* Ligne de groupe : séparateur entre dossiers */
.dossier-table .dossier-group-header td {
  background: var(--bg-base) !important;
  border-top: 1px solid var(--border-default) !important;
  border-bottom: 1px solid var(--border-default) !important;
  padding: 6px 8px !important;
}

.dossier-group-label {
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  text-transform: none !important;
  letter-spacing: 0 !important;
  color: var(--text-secondary) !important;
  vertical-align: middle !important;
}

.dossier-group-label .client-badge {
  margin-right: 6px;
}
```

- [ ] **Remplacer le bloc dropdowns dans la table** :

```css
/* Dropdowns dans la table dossier */
.dossier-table .ui.dropdown {
  min-width: unset !important;
  max-width: unset !important;
  width: 100% !important;
  background: var(--bg-input) !important;
  border: 1px solid var(--border-dim) !important;
  color: var(--text-primary) !important;
}

.dossier-table .ui.dropdown > .text,
.dossier-table .ui.dropdown .default.text {
  color: var(--text-primary) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: calc(100% - 18px) !important;
  display: block !important;
}

.dossier-table .ui.dropdown > .dropdown.icon {
  color: var(--text-muted) !important;
}

.dossier-table .ui.dropdown .menu {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-default) !important;
  box-shadow: 0 4px 16px rgba(42,37,32,0.1) !important;
  min-width: 300px !important;
  max-width: 420px !important;
  z-index: 1100 !important;
}

.dossier-table .ui.dropdown .menu > .item {
  color: var(--text-secondary) !important;
  border-top: 1px solid var(--border-dim) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 11px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.dossier-table .ui.dropdown .menu > .item:hover,
.dossier-table .ui.dropdown .menu > .item.selected,
.dossier-table .ui.dropdown .menu > .item.active {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}
```

- [ ] **Remplacer le bloc inputs dans la table** :

```css
/* Inputs dans la table dossier */
.dossier-table .ui.input {
  max-width: unset !important;
  width: 100% !important;
}

.dossier-table .ui.input > input {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-dim) !important;
  color: var(--text-primary) !important;
  padding: 4px 6px !important;
}
```

- [ ] **Remplacer le bloc `/* Ligne désélectionnée */`** :

```css
/* Ligne désélectionnée */
.dossier-table .job-row-deselected td {
  opacity: 0.35 !important;
}
```

- [ ] **Remplacer le bloc crédences** :

```css
/* Bandeau d'avertissement crédences sans 2e panneau */
.credence-unpaired-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  background: var(--warning-soft);
  border: 1px solid rgba(160, 120, 48, 0.3);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--warning);
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
}

.dossier-table.ui.table .credence-inline-form td {
  background: rgba(160, 120, 48, 0.04) !important;
  border-top: 1px dashed rgba(160, 120, 48, 0.25) !important;
}

.dossier-table .credence-inline-form label {
  color: var(--warning) !important;
}
```

- [ ] **Vérifier dans le navigateur** : charger 3-4 dossiers. La table doit afficher des groupes bien séparés sur fond ivoire, avec les en-têtes de groupe en stone plus clair, les dropdowns ouverts sur fond blanc propre.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: dossier table — groupes, dropdowns, crédences — fond clair"
  ```

---

## Task 11 : Dots réseau et Semantic UI tables globales

**Fichier :** `client/src/css/index.css` — sections `NETWORK STATUS DOT` et `--- Tables ---`

- [ ] **Remplacer le bloc `/* ===================== NETWORK STATUS DOT ===================== */`** par :

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

.network-dot--ok       { background: var(--dot-lm); }
.network-dot--degraded { background: var(--warning); }
.network-dot--offline  { background: var(--danger); }
.network-dot--unknown  { background: var(--text-muted); }

/* Supprimé : animations networkPulse / networkPulseFast */
.network-dot--pulse      { /* pas d'animation */ }
.network-dot--pulse-fast { /* pas d'animation */ }

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

.client-dot--ok      { background: var(--dot-lm); }
.client-dot--ko      { background: var(--danger); }
.client-dot--unknown { background: var(--text-muted); }
```

- [ ] **Remplacer le bloc `/* --- Tables (for dossier table inside form) --- */`** par :

```css
/* --- Tables --- */
.ui.table {
  background: var(--bg-surface) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: var(--radius) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 12px !important;
  box-shadow: none !important;
}

.ui.table thead th {
  background: var(--table-header-bg) !important;
  color: var(--table-header-color) !important;
  border-bottom: 1px solid var(--border-default) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 9px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 1.8px !important;
}

.ui.table td {
  border-top: 1px solid var(--border-dim) !important;
  color: var(--text-primary) !important;
  background: transparent !important;
}

.ui.striped.table > tr:nth-child(2n),
.ui.striped.table tbody tr:nth-child(2n) {
  background: rgba(42,37,32,0.02) !important;
}

.ui.table tr:hover > td {
  background: var(--bg-hover) !important;
}

.ui.table tfoot th,
.ui.table tfoot td {
  background: var(--bg-elevated) !important;
  border-top: 1px solid var(--border-default) !important;
}
```

- [ ] **Vérifier dans le navigateur** : le dot réseau dans le header est vert discret (sans pulse). Les dots clients sur les boutons LM/CASTO/BRICO/ECOM sont visibles.

- [ ] **Commit :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: dots réseau, tables globales — supprime animations, fond clair"
  ```

---

## Task 12 : JobsList.css — rethème complet de la vue File

**Fichier :** `client/src/css/JobsList.css`

- [ ] **Remplacer le contenu entier de `client/src/css/JobsList.css`** par :

```css
/* ===================== JOBS TABLE ===================== */

.jobs-table-container {
  overflow: auto;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.jobs-table {
  width: 100%;
  display: table;
  table-layout: fixed;
  border-collapse: collapse;
}

/* Sticky header & footer */
.sticky-header,
.sticky-footer {
  position: sticky;
  z-index: 2;
  width: 100%;
}

.sticky-header {
  top: 0;
  display: table-header-group;
  background: var(--table-header-bg) !important;
}

.sticky-header th {
  background: var(--table-header-bg) !important;
  color: var(--table-header-color) !important;
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif !important;
  font-size: 9px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 1.8px !important;
  border-bottom: 1px solid var(--border-default) !important;
  padding: 8px !important;
}

.sticky-footer {
  bottom: 0;
  display: table-footer-group;
  background: var(--bg-elevated) !important;
}

.sticky-footer th {
  background: var(--bg-elevated) !important;
  border-top: 1px solid var(--border-default) !important;
  padding: 6px 8px !important;
}

.sticky-footer-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.sticky-footer-content .ui.progress {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  margin: 0;
}

.sticky-footer-content .ui.button {
  margin-right: 0 !important;
}

.body-table-jobs {
  display: table-row-group;
}

/* Table rows */
.table-row {
  display: table-row;
  height: var(--table-row-height, 34px) !important;
  max-height: var(--table-row-height, 34px);
  transition: background 0.1s;
}

/* Client color accent — left border */
.table-row[data-client="LM"]    > td:first-child { border-left: 2px solid var(--color-lm) !important; }
.table-row[data-client="CASTO"] > td:first-child { border-left: 2px solid var(--color-casto) !important; }
.table-row[data-client="ECOM"]  > td:first-child { border-left: 2px solid var(--color-ecom) !important; }
.table-row[data-client="BRICO"] > td:first-child { border-left: 2px solid var(--color-brico) !important; }

/* Table cells */
.table-cell {
  height: var(--table-row-height, 34px) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
  font-size: 12px !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: table-cell;
  vertical-align: middle;
  padding: 0 8px;
  color: var(--text-secondary);
}

/* Links in completed rows */
.table-row a {
  color: var(--color-ecom) !important;
  text-decoration: none !important;
}
.table-row a:hover {
  color: var(--text-primary) !important;
  text-decoration: underline !important;
}

/* ===================== ACTION BUTTONS ===================== */

/* Supprimé : animations pulse-danger / pulse-success */
.jobs-view .ui.red.button:not(:disabled)   { /* pas d'animation */ }
.jobs-view .ui.green.button:not(:disabled) { /* pas d'animation */ }

/* ===================== CHECKBOX FOOTER ===================== */

.checkbox-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkbox-footer .ui.checkbox {
  margin: 0;
}

.checkbox-footer .ui.dropdown {
  z-index: 35;
}

.progress {
  overflow: hidden;
  width: 100%;
}
```

- [ ] **Vérifier dans le navigateur** : aller dans l'onglet "File". La table des jobs doit avoir un fond ivoire, les en-têtes en caps stone, les liserés clients désaturés à gauche. Les boutons "Traiter la file" et "Stickers" ne clignotent plus.

- [ ] **Commit :**
  ```bash
  git add client/src/css/JobsList.css
  git commit -m "style: JobsList — rethème fond clair, supprime animations pulse"
  ```

---

## Task 13 : Google Places autocomplete et nettoyage final

**Fichier :** `client/src/css/index.css` — section `GOOGLE PLACES AUTOCOMPLETE` et misc

- [ ] **Remplacer le bloc `/* ===================== GOOGLE PLACES AUTOCOMPLETE ===================== */`** par :

```css
/* ===================== GOOGLE PLACES AUTOCOMPLETE ===================== */

.pac-container {
  background: var(--bg-input) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 0 0 var(--radius) var(--radius) !important;
  box-shadow: 0 4px 16px rgba(42,37,32,0.1) !important;
  font-family: ui-monospace, 'Courier New', monospace !important;
}

.pac-item {
  color: var(--text-secondary) !important;
  border-top: 1px solid var(--border-dim) !important;
  font-size: 12px !important;
  cursor: pointer;
}

.pac-item:hover,
.pac-item-selected {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

.pac-item-query { color: var(--text-primary) !important; }
.pac-matched    { color: var(--color-ecom) !important; }

.pac-logo::after { display: none !important; }
```

- [ ] **Vérifier les occurrences de polices codées en dur** restantes dans `index.css`. Chercher `'Barlow'`, `'JetBrains Mono'`, `'Barlow Condensed'` et les remplacer :
  - Toute référence à `'Barlow'` → `-apple-system, 'Helvetica Neue', Arial, sans-serif`
  - Toute référence à `'Barlow Condensed'` → `-apple-system, 'Helvetica Neue', Arial, sans-serif`
  - Toute référence à `'JetBrains Mono'` → `ui-monospace, 'Courier New', monospace`

  Commande pour vérifier qu'il n'en reste plus :
  ```bash
  grep -n "Barlow\|JetBrains" client/src/css/index.css
  ```
  Résultat attendu : aucune ligne.

- [ ] **Vérifier les glows restants** — s'assurer qu'aucun `text-shadow` coloré ou `box-shadow` néon ne subsiste :
  ```bash
  grep -n "glow\|neon\|text-shadow" client/src/css/index.css
  ```
  Supprimer tout résultat trouvé (sauf commentaires).

- [ ] **Test visuel final** — naviguer dans l'application et vérifier :
  - [ ] Fond général ivoire (`#eeebe5`), pas de fond noir
  - [ ] Aucune grille en pointillés
  - [ ] Aucun dot ou bouton qui pulse
  - [ ] Sélectionner client LM : section Format/Visuel avec liseré vert forêt discret
  - [ ] Sélectionner client CASTO : liseré bleu ardoise
  - [ ] Charger un dossier : chips colorées par client, table propre
  - [ ] Ouvrir une modale : fond ivoire, pas de fond noir
  - [ ] Vue File : tableau avec fond clair, liseré client à gauche

- [ ] **Commit final :**
  ```bash
  git add client/src/css/index.css
  git commit -m "style: Google Places, nettoyage polices et glows résiduels — rethème complet"
  ```

---

## Résumé des commits

| Task | Commit |
|---|---|
| 1 | `style: supprime imports Google Fonts` |
| 2 | `style: variables CSS — palette ivoire/stone` |
| 3 | `style: supprime grille overlay et @keyframes` |
| 4 | `style: header et footer` |
| 5 | `style: Semantic UI inputs, dropdowns, checkboxes, progress` |
| 6 | `style: boutons Semantic UI — accents clients désaturés` |
| 7 | `style: messages et modals Semantic UI` |
| 8 | `style: form sections, mode tabs` |
| 9 | `style: dossier autocomplete — suggestions et chips` |
| 10 | `style: dossier table — groupes et dropdowns` |
| 11 | `style: dots réseau, tables globales` |
| 12 | `style: JobsList — rethème fond clair` |
| 13 | `style: nettoyage final` |
