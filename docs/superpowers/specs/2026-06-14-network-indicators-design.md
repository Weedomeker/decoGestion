# Design — Indicateurs réseau discrets

**Date :** 2026-06-14  
**Statut :** approuvé

---

## Contexte

Le backend expose un endpoint `GET /health` qui retourne l'état de chaque service :

```json
{
  "status": "ok|degraded|offline",
  "mongodb": "connected|disconnected|...",
  "odbc": "connected|disconnected",
  "symlinks": { "LM": true, "CASTO": false, "BRICO": true, "ECOM": true, "PREVIEW": true },
  "uptime": 123,
  "memory": 45
}
```

`ServerStatus.jsx` poll `/health` toutes les 30s et expose les données via `onHealthChange` à `App.jsx`. `App.jsx` grise déjà les boutons clients KO et désactive l'onglet "Dossier API" si ODBC est KO.

**Ce qui existe déjà :**
- `ServerStatus.jsx` : label Semantic UI coloré ("Connecté", "Mode dégradé — Réseau: LM KO")
- Boutons clients : `disabled + opacity 0.45` si symlink KO
- Onglet "Dossier API" : désactivé si ODBC KO

**Ce qui manque :** les indicateurs sont textuels et peu polis. L'état réseau par client n'est pas visible d'un coup d'œil.

---

## Solution retenue : Option A — Dot unique + tooltip

### Header : `ServerStatus.jsx`

Remplacer le `<Label>` actuel par un **dot CSS de 8px** dans le header.

**États visuels :**

| État | Couleur | Animation |
|------|---------|-----------|
| `ok` | `#21ba45` (vert) | aucune |
| `degraded` | `#f2711c` (orange) | `pulse` CSS 2s infini |
| `offline` | `#db2828` (rouge) | `pulse` CSS 1.2s infini |
| `unknown` | `#aaa` (gris) | aucune |

**Animation `pulse` :** `box-shadow` expansif via `@keyframes`, discret.

**Tooltip (Semantic UI `<Popup>`, position `bottom right`, trigger `hover`) :**

```
● MongoDB    connecté
● ODBC       connecté
──────────────────────
● LM         OK
● CASTO      KO
● BRICO      OK
● ECOM       OK
● PREVIEW    OK
```

- Fond blanc, police `0.75rem`, largeur fixe `180px`
- Chaque ligne a son propre dot coloré (`green`/`red`/`grey`)
- Séparateur `<Divider />` entre services système et chemins réseau
- Le tooltip ne s'affiche qu'au survol (pas de pop automatique)

### Boutons clients : badge de statut

Dans `App.jsx`, mode manuel, chaque bouton LM / CASTO / BRICO / ECOM reçoit un **badge de 6px** en `position: absolute`, coin supérieur droit.

**États du badge :**

| Condition | Couleur badge |
|-----------|--------------|
| `healthData === null` | `#aaa` gris |
| `symlinkStatus[c] === true` | `#21ba45` vert |
| `symlinkStatus[c] === false` | `#db2828` rouge |

Le badge s'ajoute au comportement existant (disabled + opacity si KO) sans le remplacer. Il est visible même sur le bouton actif.

**Wrapper requis :** Le bouton est déjà dans un `<span>` (pour le Popup Semantic). Le badge sera positionné via `position: relative` sur ce `<span>`.

---

## Fichiers modifiés

| Fichier | Nature du changement |
|---------|---------------------|
| `client/src/components/ServerStatus.jsx` | Refactoring complet : supprime le `<Label>`, ajoute dot CSS + `<Popup>` de détail |
| `client/src/App.jsx` | Ajoute le badge `.client-dot` sur le `<span>` wrapper de chaque bouton client |
| `client/src/css/index.css` | Ajoute `.network-dot`, `.network-dot--pulse`, `.client-dot`, `@keyframes networkPulse` |

Aucun nouveau fichier, aucune nouvelle dépendance NPM.

---

## Comportement edge cases

- **`healthData` null** (premier rendu avant la réponse) : dot gris dans le header, badges gris sur les boutons. Pas d'erreur.
- **Serveur hors-ligne** (`catch` dans `ServerStatus`) : dot rouge, badges tous gris (pas de données symlink).
- **Symlink non présent dans la réponse** (clé absente) : considéré comme `null` → badge gris.

---

## Ce qui ne change pas

- Le poll de 30s dans `ServerStatus`
- La logique de désactivation des boutons clients dans `App.jsx`
- La logique de bascule d'onglet "dossier → manuel" si ODBC KO
- Le callback `onHealthChange` (interface `ServerStatus` → `App` inchangée)
