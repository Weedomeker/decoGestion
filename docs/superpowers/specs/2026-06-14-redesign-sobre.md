# Spec — Refonte visuelle decoGestion (design sobre)

**Date :** 2026-06-14  
**Portée :** CSS uniquement — Semantic UI React conservé, aucun composant remplacé  
**Fichiers cibles :** `client/src/css/index.css`, `client/src/css/JobsList.css`

---

## 1. Contexte et objectif

Le design actuel "Command Center" est sombre (`#08080d`), avec des couleurs néon par client, une grille tactique en overlay, des animations pulse/glow omniprésentes et trois familles de polices. L'objectif est un rethème complet vers quelque chose de **simple, sobre et épuré** — adapté à un usage quotidien en production print, sans effets décoratifs.

---

## 2. Décisions de design

### 2.1 Palette — Neutre chaud (ivoire/stone)

| Variable | Valeur | Usage |
|---|---|---|
| `--bg-base` | `#eeebe5` | Fond principal |
| `--bg-surface` | `#e8e4dc` | Fond segments/panels |
| `--bg-elevated` | `#f0ede8` | Fond header/footer |
| `--bg-input` | `#faf8f4` | Fond inputs et dropdowns |
| `--bg-hover` | `rgba(42,37,32,0.04)` | Hover léger |
| `--border-default` | `#d9d4cc` | Bordures standard |
| `--border-dim` | `#ede9e2` | Séparateurs fins |
| `--border-bright` | `#cac4ba` | Bordures accentuées |
| `--text-primary` | `#2a2520` | Texte principal (noir stone) |
| `--text-secondary` | `#776e62` | Texte secondaire |
| `--text-muted` | `#b0a89e` | Labels, placeholders |

### 2.2 Couleurs clients — accents désaturés

Chaque client conserve une couleur, mais désaturée et naturelle. Utilisée sur : bouton actif, bordure gauche de la section Format/Visuel, bouton submit, chips, en-têtes de groupe.

| Client | Couleur accent | Dot de statut |
|---|---|---|
| LM | `#2d6e46` (vert forêt) | `#6dbb8a` |
| CASTO | `#325a91` (bleu ardoise) | `#6a9bbf` |
| BRICO | `#a05523` (terracotta) | `#bf7a3a` |
| ECOM | `#237870` (teal désaturé) | `#4aacaa` |

Pas de glow, pas de box-shadow coloré.

### 2.3 Typographie

- **Police principale :** `-apple-system, 'Helvetica Neue', Arial, sans-serif` (system-ui)
- **Police données/valeurs :** `ui-monospace, 'Courier New', monospace` (system mono)
- **Labels :** `font-size: 9px`, `letter-spacing: 2.5px`, `text-transform: uppercase`, couleur `--text-muted`
- JetBrains Mono, Barlow, Barlow Condensed : supprimés (imports Google Fonts retirés)

### 2.4 Approche technique

Rethème CSS uniquement sur `index.css` et `JobsList.css`. Semantic UI React est conservé — ses composants sont re-skinés via les surcharges `.ui.*` existantes. Aucun composant JSX n'est modifié.

---

## 3. Ce qui disparaît

- Grille tactique overlay (`body::before`)
- Toutes les animations `@keyframes` (pulse-badge, networkPulse, networkPulseFast, pulse-danger, pulse-success)
- Tous les `box-shadow` colorés (glow neon)
- Fond quasi-noir (`#08080d`) et variantes
- Variables `--glow-*` et `--accent-glow`
- Imports Google Fonts (Barlow, Barlow Condensed, JetBrains Mono)
- Couleurs `--color-lm: #00ff88`, `--color-casto: #3b9eff`, etc. (remplacées par les accents désaturés)

Ce qui reste **inchangé** :
- Variables `--radius`, `--s-xs/sm/md/lg/xl` (espacements)
- Toutes les classes de layout (`.container`, `.main-area`, `.form-panel`, `.preview-panel`, etc.)
- Variables `--danger`, `--warning`, `--success` (valeurs mises à jour section 5 pour rester lisibles sur fond clair)
- Les dots de statut réseau (`.network-dot`, `.client-dot`) — couleurs adaptées à la nouvelle palette

---

## 4. Vue Dossier API — comportement avec 20+ dossiers

Cette vue est le cas d'usage principal. Elle doit rester exploitable avec 20 dossiers chargés et 60–100+ lignes.

**Zone de recherche (fixe, hors scroll) :**
- Input pleine largeur (max 480px), fond `--bg-input`, bordure `--text-primary` au focus
- Bouton "Rechercher" — noir stone `#2a2520`
- Bouton "Tout vider" — outline discret

**Autocomplete suggestions :**
- Fond `--bg-input`, ombre légère, pas de bordure colorée
- Item actif : `background: rgba(42,37,32,0.05)`

**Chips des dossiers chargés (fixe, hors scroll) :**
- Format : `164620 (4) ×`
- Couleur par client (accent désaturé), style pill avec border
- Wrapping naturel, pas de hauteur fixe — peuvent s'étendre sur 2 lignes si nécessaire

**Table des jobs (zone scrollable) :**
- Header collant (`position: sticky; top: 0`) sur fond `#f0ede8`
- En-têtes de groupe : fond `--bg-base` (`#eeebe5`), séparateur haut/bas `--border-default`, nom du client coloré
- Lignes de job : hauteur ~34px, hover discret
- Colonne État : dot 6px + label texte (Prêt / Choix requis / Fichier manquant / Format Tauro requis)

**Footer flottant (fixe, hors scroll) :**
- Toujours visible quelle que soit la longueur de la table
- Compteur : "12 dossiers · 28 jobs · 24 sélectionnés"
- Bouton "Ajouter (24)" — noir stone ou couleur client actif

---

## 5. Statuts et couleurs sémantiques

Ces couleurs s'appliquent aux messages d'erreur, warnings, états de job — adaptées pour rester lisibles sur fond clair.

| Usage | Couleur |
|---|---|
| Erreur / danger | `#b84040` |
| Warning | `#a07830` |
| Succès | `#2d6e46` (même que LM — cohérent) |
| Info | `#325a91` (même que CASTO) |

---

## 6. Transitions

Conserver uniquement les transitions utiles (pas d'animation) :
- `transition: border-color 0.15s, background 0.15s` sur inputs et boutons
- `transition: width 0.2s ease` sur `.preview-panel` (panneau aperçu)

Supprimer toutes les animations `@keyframes`.

---

## 7. Hors périmètre

- Refonte des composants JSX (DossierAutocomplete, JobsList, Header, etc.)
- Changement de layout général (colonnes, grille)
- Remplacement de Semantic UI
- Mode sombre
