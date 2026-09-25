# UX Formulaire — Approche A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cinq corrections chirurgicales sur la vue Formulaire : empty state Dossier, toggle chips PB/TM, bouton reset, submit sticky, réordonnancement des sections Manuel.

**Architecture:** Modifications JSX dans `client/src/App.jsx` et nouveaux sélecteurs CSS dans `client/src/css/index.css`. Aucun changement de logique métier, de route backend, ni de composant extrait.

**Tech Stack:** React 18, Semantic UI React, CSS custom properties (design system Zinc/Ardoise)

## Global Constraints

- Ne pas modifier la logique d'activation séquentielle des champs (`enabled` state)
- Ne pas toucher aux composants extraits (`DossierAutocomplete`, `JobsList`, etc.)
- Ne pas modifier le backend ni les routes
- Respecter les variables CSS existantes (`var(--bg-elevated)`, `var(--text-muted)`, etc.)
- Conserver les `!important` sur les overrides Semantic UI (convention du projet)
- Démarrer le backend : `npm run server` ; démarrer le frontend : `npm run client`

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `client/src/App.jsx` | Toutes les corrections JSX (corrections 1–5) |
| `client/src/css/index.css` | Nouveaux sélecteurs CSS pour chaque correction |

---

### Task 1 : Empty state en mode Dossier

**Files:**
- Modify: `client/src/App.jsx` (~ligne 757)
- Modify: `client/src/css/index.css` (après la section `STEPPER HINT`, ~ligne 1554)

**Interfaces:**
- Consumes: `dossierJobs` (state array, défini dans App)
- Produces: bloc `.dossier-empty-state` visible quand `dossierJobs.length === 0` en mode Dossier

- [ ] **Étape 1 : Ajouter le CSS**

Dans `client/src/css/index.css`, ajouter après le bloc `/* ===================== STEPPER HINT ===================== */` (après la règle `.form-step-hint .icon`) :

```css
/* ===================== DOSSIER EMPTY STATE ===================== */
.dossier-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-sm);
  padding: var(--s-xl) var(--s-md);
  color: var(--text-muted);
  font-size: 13px;
  font-family: 'Figtree', -apple-system, sans-serif;
}

.dossier-empty-state .icon {
  color: var(--text-muted) !important;
}
```

- [ ] **Étape 2 : Ajouter le JSX**

Dans `client/src/App.jsx`, localiser le bloc mode dossier (autour de la ligne 751) :

```jsx
{activeTab === "dossier" && (
  <>
    <DossierAutocomplete
      pathData={data[0] || {}}
      formatTauro={formatTauro}
      onAutoFill={handleDossierAutoFill}
    />
    {dossierJobs.length > 0 && (() => {
```

Insérer entre `</DossierAutocomplete>` (fin du composant, après `/>`) et `{dossierJobs.length > 0 && (() => {` :

```jsx
    {dossierJobs.length === 0 && (
      <div className="dossier-empty-state">
        <Icon name="folder outline" size="large" />
        <span>Saisis un N° de dossier ou un nom de client</span>
      </div>
    )}
```

- [ ] **Étape 3 : Vérifier visuellement**

Démarrer l'app (`npm run server` dans un terminal, `npm run client` dans un autre).  
Aller sur la vue Formulaire → onglet "Dossier API".  
Vérifier : le bloc icône + texte est visible sous le champ de recherche quand aucun dossier n'est chargé.  
Vérifier : le bloc disparaît dès qu'un dossier est chargé (tableau visible).

- [ ] **Étape 4 : Commit**

```bash
git add client/src/App.jsx client/src/css/index.css
git commit -m "feat: ajouter empty state en mode Dossier"
```

---

### Task 2 : Toggle chips PB / TM dans le tableau Dossier

**Files:**
- Modify: `client/src/App.jsx` (colonnes 8 et 9 du `<Table.Body>`, ~lignes 937–956)
- Modify: `client/src/css/index.css` (après la section `DOSSIER EMPTY STATE`)

**Interfaces:**
- Consumes: `job.prodBlanc` (boolean), `job.teinteMasse` (boolean), `updateDossierJob(job._idx, {...})` (fonction)
- Produces: boutons `.toggle-chip` qui remplacent les `<Icon link />` dans les colonnes 8 et 9 du tableau

- [ ] **Étape 1 : Ajouter le CSS**

Dans `client/src/css/index.css`, ajouter après le bloc `.dossier-empty-state .icon` :

```css
/* ===================== TOGGLE CHIPS ===================== */
.toggle-chip {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  font-family: 'Geist Mono', ui-monospace, monospace;
  background: transparent;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.toggle-chip:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.toggle-chip--pb.toggle-chip--on {
  background: var(--warning-soft);
  color: var(--warning);
}

.toggle-chip--tm.toggle-chip--on {
  background: var(--accent-soft);
  color: var(--accent);
}
```

- [ ] **Étape 2 : Remplacer l'icône Prod blanc**

Localiser dans `App.jsx` la cellule colonne 8 (Prod blanc) du `<Table.Body>` :

```jsx
<Table.Cell style={{ textAlign: "center" }}>
  <Icon
    name={job.prodBlanc ? "adjust" : "circle outline"}
    color={job.prodBlanc ? "yellow" : "grey"}
    link
    title={job.prodBlanc ? "Prod avec blanc : ON" : "Prod avec blanc : OFF"}
    onClick={() => updateDossierJob(job._idx, { prodBlanc: !job.prodBlanc })}
  />
</Table.Cell>
```

Remplacer par :

```jsx
<Table.Cell style={{ textAlign: "center" }}>
  <button
    type="button"
    className={`toggle-chip toggle-chip--pb${job.prodBlanc ? " toggle-chip--on" : ""}`}
    title={job.prodBlanc ? "Prod avec blanc : ON" : "Prod avec blanc : OFF"}
    onClick={() => updateDossierJob(job._idx, { prodBlanc: !job.prodBlanc })}
  >
    PB
  </button>
</Table.Cell>
```

- [ ] **Étape 3 : Remplacer l'icône Teinte masse**

Localiser la cellule colonne 9 (Teinte masse) juste en dessous :

```jsx
<Table.Cell style={{ textAlign: "center" }}>
  <Icon
    name="tint"
    color={job.teinteMasse ? "blue" : "grey"}
    link
    title={job.teinteMasse ? "Teinte masse : ON" : "Teinte masse : OFF"}
    onClick={() => updateDossierJob(job._idx, {
      teinteMasse: !job.teinteMasse,
      selectedFileObject: null,
    })}
  />
</Table.Cell>
```

Remplacer par :

```jsx
<Table.Cell style={{ textAlign: "center" }}>
  <button
    type="button"
    className={`toggle-chip toggle-chip--tm${job.teinteMasse ? " toggle-chip--on" : ""}`}
    title={job.teinteMasse ? "Teinte masse : ON" : "Teinte masse : OFF"}
    onClick={() => updateDossierJob(job._idx, {
      teinteMasse: !job.teinteMasse,
      selectedFileObject: null,
    })}
  >
    TM
  </button>
</Table.Cell>
```

- [ ] **Étape 4 : Vérifier visuellement**

Charger un dossier avec plusieurs jobs.  
Vérifier : les colonnes 8 et 9 affichent `PB` et `TM` en texte muted sur fond transparent.  
Cliquer sur `PB` d'une ligne → fond jaune pâle, texte warning. Re-cliquer → retour à l'état OFF.  
Cliquer sur `TM` → fond bleu pâle, texte accent. Re-cliquer → retour OFF, `selectedFileObject` remis à null.

- [ ] **Étape 5 : Commit**

```bash
git add client/src/App.jsx client/src/css/index.css
git commit -m "feat: remplacer icônes PB/TM par toggle chips dans le tableau Dossier"
```

---

### Task 3 : Bouton reset visible

**Files:**
- Modify: `client/src/App.jsx` (zone `.mode-tabs`, ~ligne 717 ; zone `return (`, ~ligne 699)
- Modify: `client/src/css/index.css` (après la section `TOGGLE CHIPS`)

**Interfaces:**
- Consumes: `dossierJobs`, `selectedFormatTauro`, `selectedFormat`, `selectedFile`, `numCmd`, `ville` (states), `handleResetForm` (fonction existante)
- Produces: constante `hasFormContent` (boolean), bouton `.reset-btn` dans `.mode-tabs`

- [ ] **Étape 1 : Ajouter le CSS**

Dans `client/src/css/index.css`, ajouter après le bloc `.toggle-chip--tm.toggle-chip--on` :

```css
/* ===================== RESET BTN ===================== */
.reset-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: 'Figtree', -apple-system, sans-serif;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius);
  transition: color 0.15s, background 0.15s;
}

.reset-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.reset-btn .icon {
  margin: 0 !important;
}
```

- [ ] **Étape 2 : Ajouter la constante `hasFormContent`**

Dans `App.jsx`, juste avant la ligne `return (` (autour de la ligne 699), ajouter :

```jsx
const hasFormContent =
  dossierJobs.length > 0 ||
  !!selectedFormatTauro ||
  !!selectedFormat ||
  !!selectedFile ||
  !!numCmd ||
  !!ville;
```

- [ ] **Étape 3 : Ajouter le bouton dans `.mode-tabs`**

Localiser la `<div className="mode-tabs">` (ligne ~717). Elle contient deux boutons : "Dossier API" (dans un `<Popup>`) et "Saisie manuelle". Après le second `<Button ... content="Saisie manuelle" />` et avant la fermeture `</div>`, ajouter :

```jsx
{hasFormContent && (
  <button
    type="button"
    className="reset-btn"
    onClick={handleResetForm}
    title="Vider le formulaire"
  >
    <Icon name="times" size="small" />
    Vider
  </button>
)}
```

- [ ] **Étape 4 : Vérifier visuellement**

En mode Manuel : remplir au moins un champ (ex : sélectionner un format Tauro).  
Vérifier : le bouton "✕ Vider" apparaît à droite des onglets de mode.  
Cliquer dessus → le formulaire est vidé, le bouton disparaît.  
En mode Dossier : charger un dossier. Vérifier que le bouton "Vider" apparaît.  
Cliquer → le tableau est effacé, bouton disparaît.

- [ ] **Étape 5 : Commit**

```bash
git add client/src/App.jsx client/src/css/index.css
git commit -m "feat: ajouter bouton reset visible dans la barre d'onglets"
```

---

### Task 4 : Submit sticky en mode Dossier

**Files:**
- Modify: `client/src/App.jsx` (bloc `<InfoMessage>` + `<Button type="submit">`, ~lignes 1672–1692)
- Modify: `client/src/css/index.css` (après la section `RESET BTN`)

**Interfaces:**
- Consumes: `activeTab`, `dossierJobs`, `warnMsg`, `selectedJobIds` (states existants)
- Produces: wrapper `<div className="submit-bar submit-bar--sticky">` qui rend le bouton submit toujours visible en mode Dossier

- [ ] **Étape 1 : Ajouter le CSS**

Dans `client/src/css/index.css`, ajouter après le bloc `.reset-btn .icon` :

```css
/* ===================== SUBMIT BAR ===================== */
.submit-bar {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
}

.submit-bar--sticky {
  position: sticky;
  bottom: 0;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-default);
  padding: var(--s-sm) var(--s-md);
  margin: 0 calc(-1 * var(--s-lg));
  z-index: 10;
}

.submit-bar--sticky .submit-button.ui.button {
  margin-top: 0 !important;
}
```

- [ ] **Étape 2 : Envelopper InfoMessage + Button dans `.submit-bar`**

Localiser dans `App.jsx` le bloc existant (après les sections de formulaire, autour de la ligne 1672) :

```jsx
            <InfoMessage
              isHidden={warnMsg.hidden}
              title={warnMsg.header}
              text={warnMsg.msg}
              icon={warnMsg.icon}
              color={warnMsg.color}
            />

            <Button
              type="submit"
              color="vk"
              size="small"
              className="submit-button"
              disabled={dossierJobs.length > 0 && selectedJobIds.size === 0}
              content={
                dossierJobs.length > 0
                  ? `Ajouter (${selectedJobIds.size} sélectionné${selectedJobIds.size > 1 ? "s" : ""})`
                  : "Ajouter"
              }
            />
```

Remplacer par :

```jsx
            <div className={`submit-bar${
              activeTab === "dossier" && dossierJobs.length > 0 ? " submit-bar--sticky" : ""
            }`}>
              <InfoMessage
                isHidden={warnMsg.hidden}
                title={warnMsg.header}
                text={warnMsg.msg}
                icon={warnMsg.icon}
                color={warnMsg.color}
              />
              <Button
                type="submit"
                color="vk"
                size="small"
                className="submit-button"
                disabled={dossierJobs.length > 0 && selectedJobIds.size === 0}
                content={
                  dossierJobs.length > 0
                    ? `Ajouter (${selectedJobIds.size} sélectionné${selectedJobIds.size > 1 ? "s" : ""})`
                    : "Ajouter"
                }
              />
            </div>
```

- [ ] **Étape 3 : Vérifier visuellement**

Charger un dossier avec suffisamment de lignes pour nécessiter du scroll.  
Vérifier : le bouton "Ajouter (N sélectionnés)" reste visible en bas de l'écran même en scrollant dans le tableau.  
Vérifier : en mode Manuel (sans jobs), le bouton est positionné normalement (pas sticky).  
Vérifier : un message d'avertissement actif (ex: format trop grand) apparaît bien dans la submit-bar sticky.

- [ ] **Étape 4 : Commit**

```bash
git add client/src/App.jsx client/src/css/index.css
git commit -m "feat: rendre le bouton submit sticky en mode Dossier"
```

---

### Task 5 : Réordonner les sections en mode Manuel

**Files:**
- Modify: `client/src/App.jsx` (sections du rendu `activeTab === "manuel"`, ~lignes 1133–1622)

**Interfaces:**
- Consumes: aucun nouveau state — déplacement de blocs JSX existants uniquement
- Produces: ordre Client → Plaque Tauro → Format & Visuel → Ville → Ex → Options dans le mode Manuel

- [ ] **Étape 1 : Mettre à jour le stepper hint**

Localiser la fonction ternaire du stepper hint (~ligne 1136) :

```jsx
const hint =
  enabled.format  ? "Sélectionne un format de plaque Tauro pour commencer" :
  enabled.visu    ? "Choisis un format de visuel" :
  enabled.numCmd  ? "Sélectionne le visuel" :
  enabled.ville   ? "Renseigne le numéro de commande (5 ou 6 chiffres)" :
  enabled.ex      ? "Saisis la ville ou le magasin" :
  null;
```

Remplacer par :

```jsx
const hint =
  enabled.format  ? "Choisis un client, puis un format de plaque Tauro" :
  enabled.visu    ? "Choisis un format de visuel" :
  enabled.numCmd  ? "Sélectionne le visuel" :
  enabled.ville   ? "Renseigne le numéro de commande (5 ou 6 chiffres)" :
  enabled.ex      ? "Saisis la ville ou le magasin" :
  null;
```

- [ ] **Étape 2 : Déplacer le sélecteur client avant Plaque Tauro**

Dans le rendu `activeTab === "manuel"`, l'ordre actuel des blocs JSX est :
1. Stepper hint
2. `{/* Plaque Tauro */}` — `<div className="form-section">` contenant `<span>Plaque Tauro</span>` + `<FormatTauro ...>`
3. `{/* Sélecteur client */}` — `<div className="form-section">` contenant `<span>Client</span>` + `<Button.Group className="client-selector">`

Déplacer le bloc `{/* Sélecteur client */}` (de `<div className="form-section">` incluant `<span className="form-section-label">Client</span>` jusqu'à la fermeture `</div>` de ce bloc) pour le placer entre le stepper hint et le bloc Plaque Tauro.

Nouvel ordre après modification :
1. Stepper hint
2. `{/* Sélecteur client */}` ← déplacé ici
3. `{/* Plaque Tauro */}`
4. `{/* Format & Visuel */}` (inchangé)
5. `{/* Crédence — 2e partie */}` (inchangé)
6. `{/* Ville / Mag */}` (inchangé)
7. `{/* Exemplaires */}` (inchangé)

- [ ] **Étape 3 : Vérifier visuellement**

En mode Manuel, vérifier que l'ordre des sections est : Client → Plaque Tauro → Format & Visuel → Ville → Exemplaires.  
Vérifier que le stepper hint affiche "Choisis un client, puis un format de plaque Tauro" au démarrage.  
Vérifier que changer de client remet bien à zéro les dropdowns format/visuel (comportement inchangé — `handleResetForm` est appelé via `onClick` du bouton client).  
Vérifier que la séquence d'activation des champs fonctionne toujours : choisir Plaque Tauro débloque Format, choisir Format débloque Visuel, etc.

- [ ] **Étape 4 : Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: réordonner les sections du mode Manuel (client en premier)"
```

---

## Récapitulatif des commits attendus

```
feat: ajouter empty state en mode Dossier
feat: remplacer icônes PB/TM par toggle chips dans le tableau Dossier
feat: ajouter bouton reset visible dans la barre d'onglets
feat: rendre le bouton submit sticky en mode Dossier
feat: réordonner les sections du mode Manuel (client en premier)
```
