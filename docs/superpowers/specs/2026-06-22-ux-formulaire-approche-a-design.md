# UX Formulaire — Approche A : Raffinements ciblés

**Date :** 2026-06-22  
**Scope :** Vue Formulaire uniquement  
**Contexte :** Outil interne, utilisateur expert solo  

---

## Objectif

Cinq corrections chirurgicales sur la vue Formulaire pour améliorer la vitesse et la clarté visuelle sans toucher à la logique métier ni au flux d'activation des champs.

---

## Correction 1 — Empty state en mode Dossier

**Fichier :** `client/src/App.jsx` (rendu du mode `activeTab === "dossier"`)

**Problème :** quand `dossierJobs` est vide, le mode Dossier n'affiche que le champ de recherche sans contexte.

**Solution :** ajouter un bloc `.dossier-empty-state` sous `<DossierAutocomplete>`, visible uniquement quand `dossierJobs.length === 0`.

```jsx
{dossierJobs.length === 0 && (
  <div className="dossier-empty-state">
    <Icon name="folder outline" size="large" />
    <span>Saisis un N° de dossier ou un nom de client</span>
  </div>
)}
```

**CSS :** nouveau sélecteur `.dossier-empty-state` dans `index.css` — flex colonne centré, couleur `var(--text-muted)`, font-size 13px, padding `var(--s-xl)`.

---

## Correction 2 — Toggles icône dans le tableau (Prod blanc / Teinte masse)

**Fichier :** `client/src/App.jsx` (colonnes 8 et 9 du `<Table.Body>` en mode Dossier)

**Problème :** les colonnes "Prod blanc" et "Teinte masse" utilisent une icône cliquable seule. Le retour ON/OFF (couleur de l'icône) est subtil sur plusieurs lignes.

**Solution :** remplacer chaque `<Icon ... link />` par un `<button className="toggle-chip toggle-chip--pb|tm">` avec label court.

```jsx
// Prod blanc (col 8)
<button
  className={`toggle-chip toggle-chip--pb${job.prodBlanc ? " toggle-chip--on" : ""}`}
  title={job.prodBlanc ? "Prod avec blanc : ON" : "Prod avec blanc : OFF"}
  onClick={() => updateDossierJob(job._idx, { prodBlanc: !job.prodBlanc })}
>
  PB
</button>

// Teinte masse (col 9)
<button
  className={`toggle-chip toggle-chip--tm${job.teinteMasse ? " toggle-chip--on" : ""}`}
  title={job.teinteMasse ? "Teinte masse : ON" : "Teinte masse : OFF"}
  onClick={() => updateDossierJob(job._idx, {
    teinteMasse: !job.teinteMasse,
    selectedFileObject: null,
  })}
>
  TM
</button>
```

**CSS :** `.toggle-chip` — bouton pill compact (padding 2px 6px, border-radius 3px, font-size 10px, font-weight 700, border none, cursor pointer, font-family Geist Mono).  
- État OFF : background transparent, color `var(--text-muted)`  
- `.toggle-chip--pb.toggle-chip--on` : background `var(--warning-soft)`, color `var(--warning)`  
- `.toggle-chip--tm.toggle-chip--on` : background `var(--accent-soft)`, color `var(--accent)`

---

## Correction 3 — Bouton reset visible

**Fichier :** `client/src/App.jsx` (section `.mode-tabs`)

**Problème :** aucun moyen d'effacer le formulaire explicitement. Changer de client remet à zéro silencieusement.

**Solution :** ajouter un bouton "Vider" à droite des onglets de mode, visible uniquement quand il y a quelque chose à effacer.

```jsx
// Condition d'affichage
const hasFormContent =
  dossierJobs.length > 0 ||
  selectedFormatTauro ||
  selectedFormat ||
  selectedFile ||
  numCmd ||
  ville;

// Dans .mode-tabs, après les deux boutons toggle
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

`handleResetForm` existe déjà et couvre tous les champs. Ajouter `setDossierJobs([])` + `setSelectedJobIds(new Set())` à l'appel existant si ce n'est pas déjà fait (c'est déjà le cas).

**CSS :** `.reset-btn` — `margin-left: auto`, background transparent, border none, color `var(--text-muted)`, font-size 12px, cursor pointer, display flex, align-items center, gap 4px. Hover : color `var(--text-secondary)`.

---

## Correction 4 — Submit sticky en mode Dossier

**Fichier :** `client/src/App.jsx` (bouton submit + `<InfoMessage>`)

**Problème :** avec un tableau de 10+ lignes, le bouton "Ajouter" est en bas du `form-panel` et nécessite de scroller.

**Solution :** envelopper le `<Button type="submit">` et le `<InfoMessage>` dans un `<div className="submit-bar">`. En mode Dossier avec jobs, ajouter `submit-bar--sticky`.

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

**CSS :**
```css
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
```

Supprimer la règle `.ui.vk.button { margin-top: var(--s-lg) }` dans le contexte sticky (le padding du wrapper suffit).

---

## Correction 5 — Ordre des sections en mode Manuel

**Fichier :** `client/src/App.jsx` (rendu `activeTab === "manuel"`)

**Problème :** l'ordre actuel est Plaque Tauro → Client → Format & Visuel. Le client détermine les formats disponibles et devrait être sélectionné en premier.

**Solution :** déplacer le bloc JSX `{/* Sélecteur client */}` (`.form-section` contenant `.client-selector`) au-dessus du bloc `{/* Plaque Tauro */}`.

Nouvel ordre :
1. Stepper hint (inchangé)
2. **Client** ← remonté
3. Plaque Tauro
4. Format & Visuel (+ Crédence si applicable)
5. Ville / Magasin
6. Exemplaires

**Stepper hint :** mettre à jour la chaîne de hints dans la fonction ternaire :
```js
const hint =
  enabled.format  ? "Choisis un client, puis un format de plaque Tauro" :
  enabled.visu    ? "Choisis un format de visuel" :
  enabled.numCmd  ? "Sélectionne le visuel" :
  enabled.ville   ? "Renseigne le numéro de commande (5 ou 6 chiffres)" :
  enabled.ex      ? "Saisis la ville ou le magasin" :
  null;
```

Aucun changement à la logique d'activation des champs — `enabled.format` (qui contrôle FormatDropdown) reste déclenché par la sélection du formatTauro, pas du client.

---

## Résumé des fichiers modifiés

| Fichier | Nature de la modification |
|---|---|
| `client/src/App.jsx` | Corrections 1, 2, 3, 4, 5 — JSX uniquement |
| `client/src/css/index.css` | Nouveaux sélecteurs : `.dossier-empty-state`, `.toggle-chip`, `.reset-btn`, `.submit-bar` |

Aucune modification des routes, du backend, des modèles Mongoose, ni des autres composants.

---

## Non-scope

- Vues File, Références, Stats, Historique
- Logique d'activation séquentielle des champs
- Gestion des crédences
- Composants extraits (DossierAutocomplete, JobsList, etc.)
