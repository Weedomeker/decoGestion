# Design : Intégration SonarCloud via GitHub Actions

**Date :** 2026-06-19
**Projet :** decoGestion
**Statut :** Approuvé

---

## Objectif

Intégrer une analyse de qualité de code statique SonarCloud déclenchée automatiquement par GitHub Actions, avec remontée du rapport de couverture NYC (lcov) dans le dashboard SonarCloud. L'analyse est informative — elle ne bloque pas le merge des PRs.

---

## Fichiers à créer

```
.github/
  workflows/
    sonar.yml
sonar-project.properties
```

---

## Déclencheurs

| Événement        | Branches ciblées |
|-----------------|------------------|
| `push`          | `main`, `dev`    |
| `pull_request`  | `main`, `dev`    |

---

## Workflow GitHub Actions (`.github/workflows/sonar.yml`)

```yaml
name: SonarCloud Analysis

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run test:coverage
        env:
          NODE_ENV: test

      - uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### Notes techniques

- `fetch-depth: 0` est obligatoire pour que SonarCloud accède à l'historique git complet (blame, nouveaux vs anciens problèmes).
- `GITHUB_TOKEN` est fourni automatiquement par GitHub Actions — pas besoin de le configurer manuellement.
- `SONAR_TOKEN` doit être ajouté manuellement dans les secrets du dépôt GitHub.
- `npm ci` installe exactement les versions verrouillées dans `package-lock.json`.
- `npm run test:coverage` exécute `nyc mocha` et génère `coverage/lcov.info`.

---

## Configuration SonarCloud (`sonar-project.properties`)

```properties
sonar.projectKey=Weedomeker_decoGestion
sonar.organization=weedomeker

sonar.sources=server/src,client/src
sonar.tests=test
sonar.test.inclusions=test/**/*.test.js

sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.exclusions=node_modules/**,client/node_modules/**,server/public/**,coverage/**
sonar.coverage.exclusions=test/**,server/public/**
```

### Notes

- `sonar.projectKey` et `sonar.organization` doivent correspondre exactement aux valeurs générées lors de l'import du dépôt sur sonarcloud.io.
- Les sources incluent `server/src` (backend) et `client/src` (frontend React).
- `server/public/` est exclu car il contient des symlinks vers des partages réseau — pas du code source.

---

## Configuration manuelle requise (une seule fois)

| Étape | Action |
|-------|--------|
| 1 | Créer un compte sur sonarcloud.io avec le compte GitHub `weedomeker` |
| 2 | Importer le dépôt `decoGestion` dans SonarCloud |
| 3 | Récupérer le token : SonarCloud → My Account → Security → Generate Token |
| 4 | Ajouter le secret : GitHub → dépôt → Settings → Secrets → Actions → `SONAR_TOKEN` |

---

## Comportement attendu

- **Sur push `main`/`dev`** : le dashboard SonarCloud est mis à jour avec la couverture globale, la dette technique, et les security hotspots.
- **Sur PR** : SonarCloud publie un commentaire dans la PR avec les nouveaux problèmes détectés sur le diff uniquement.
- **Quality Gate** : informatif uniquement, ne bloque pas le merge.

---

## Ce qui n'est PAS couvert

- Analyse du frontend (pas de tests Vitest/Jest côté client configurés).
- Branch protection rule obligatoire sur SonarCloud Quality Gate.
- Notifications Slack/email en cas d'échec Quality Gate.
