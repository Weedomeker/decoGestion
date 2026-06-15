# Palette Stone chaud — Spec

Date : 2026-06-15  
Branche : dev

## Objectif

Remplacer la palette de couleurs actuelle (gris froids + indigo) par une palette **Stone chaud** : fond légèrement beige, textes brun-noir, accent quasi-noir chaud. Structure, layout et composants inchangés.

---

## Décisions validées

### Nouvelles variables CSS (`:root`)

| Variable | Ancienne valeur | Nouvelle valeur | Rôle |
|---|---|---|---|
| `--bg-base` | `#f5f5f5` | `#f5f4f1` | Fond de page |
| `--bg-elevated` | `#f9f9f9` | `#f7f6f3` | Surfaces surélevées |
| `--bg-hover` | `#f0f0f0` | `#eeece9` | État hover |
| `--border-dim` | `#eeeeee` | `#eceae7` | Bordures très discrètes |
| `--border-default` | `#e4e4e4` | `#e7e5e4` | Bordures standard |
| `--border-bright` | `#d0d0d0` | `#d6d3d1` | Bordures accentuées |
| `--border-color` | `#e4e4e4` | `#e7e5e4` | Alias border-default |
| `--text-primary` | `#1a1d27` | `#1c1917` | Texte principal |
| `--text-secondary` | `#4e5472` | `#78716c` | Texte secondaire |
| `--text-muted` | `#9ca3b8` | `#a8a29e` | Texte muet |
| `--accent` | `#4338ca` | `#292524` | Accent principal |
| `--accent-soft` | `rgba(67,56,202,0.08)` | `rgba(41,37,36,0.07)` | Fond accent léger |
| `--accent-hover` | `rgba(67,56,202,0.12)` | `rgba(41,37,36,0.11)` | Fond accent hover |

### Variables inchangées

- `--bg-surface: #ffffff` — surfaces blanches conservées
- `--bg-input: #ffffff` — inputs blancs conservés
- `--danger`, `--success`, `--warning` et leurs variantes soft — inchangés
- `--color-lm`, `--color-casto`, `--color-brico`, `--color-ecom` et leurs variantes soft — **inchangés** (couleurs enseignes intouchables)
- Variables de spacing (`--s-*`), radius (`--radius*`), layout (`--header-height`, etc.) — inchangées

### Tooltip sombre

Le tooltip du statut serveur (`background: #1a1a1a`) est intentionnellement hors palette — il reste inchangé.

---

## Fichiers impactés

| Fichier | Nature |
|---|---|
| `client/src/css/index.css` | Mise à jour des variables `:root` uniquement |

Aucun JSX, aucune logique métier, aucun autre fichier CSS touché.

---

## Ce qui ne change pas

- Structure HTML / JSX de tous les composants
- Layout, spacing, typographie
- Couleurs des enseignes (chips, badges)
- Tooltip serveur (fond sombre `#1a1a1a`)
- `--table-header-bg`, `--table-header-color`, `--surface-bg`
