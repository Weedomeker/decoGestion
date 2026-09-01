# SonarCloud GitHub Actions Integration — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un workflow GitHub Actions qui analyse automatiquement la qualité du code avec SonarCloud à chaque push sur `main`/`dev` et à chaque PR, en remontant le rapport de couverture NYC (lcov).

**Architecture:** Un fichier de workflow unique `.github/workflows/sonar.yml` orchestre checkout, installation, tests avec couverture, puis envoi à SonarCloud via l'action officielle `SonarSource/sonarcloud-github-action`. La configuration SonarCloud est déclarée dans `sonar-project.properties` à la racine du dépôt.

**Tech Stack:** GitHub Actions, SonarCloud, Node.js 20 LTS, Mocha + NYC (lcov), ESLint

---

## Fichiers concernés

| Action   | Fichier                              | Rôle                                          |
|----------|--------------------------------------|-----------------------------------------------|
| Créer    | `.github/workflows/sonar.yml`        | Workflow CI GitHub Actions                    |
| Créer    | `sonar-project.properties`           | Configuration du projet SonarCloud            |

---

## Task 1 : Configurer SonarCloud (étapes manuelles)

Ces étapes sont à effectuer **avant** toute implémentation de code. Elles ne nécessitent pas de modifier le dépôt.

**Prérequis :** Avoir accès au compte GitHub `weedomeker`.

- [ ] **Étape 1.1 : Créer un compte SonarCloud**

  Aller sur [sonarcloud.io](https://sonarcloud.io) → cliquer sur "Log in with GitHub" → autoriser l'accès.

- [ ] **Étape 1.2 : Importer le dépôt decoGestion**

  Dans SonarCloud → "+" → "Analyze new project" → sélectionner `Weedomeker/decoGestion` → cliquer "Set Up".

  SonarCloud te montrera le `projectKey` et l'`organization` générés. **Note ces valeurs** — elles seront utilisées dans `sonar-project.properties`.

  Format typique :
  - `organization` : `weedomeker` (ton username GitHub en minuscules)
  - `projectKey` : `Weedomeker_decoGestion`

  Si les valeurs diffèrent, utilise celles affichées par SonarCloud.

- [ ] **Étape 1.3 : Générer le SONAR_TOKEN**

  Dans SonarCloud → avatar en haut à droite → "My Account" → onglet "Security" → "Generate Tokens" → nom : `decoGestion-ci` → cliquer "Generate" → **copier le token immédiatement** (il n'est affiché qu'une fois).

- [ ] **Étape 1.4 : Ajouter le secret dans GitHub**

  Sur GitHub → dépôt `decoGestion` → "Settings" → "Secrets and variables" → "Actions" → "New repository secret" :
  - Name : `SONAR_TOKEN`
  - Value : le token copié à l'étape 1.3

  Cliquer "Add secret".

- [ ] **Étape 1.5 : Désactiver l'analyse automatique SonarCloud**

  Dans SonarCloud → projet `decoGestion` → "Administration" → "Analysis Method" → désactiver "Automatic Analysis".

  > **Pourquoi ?** SonarCloud activerait son propre runner par défaut. Il faut le désactiver pour que notre workflow GitHub Actions prenne le contrôle et puisse envoyer le rapport de couverture lcov.

---

## Task 2 : Créer `sonar-project.properties`

**Fichiers :**
- Créer : `sonar-project.properties` (racine du dépôt)

- [ ] **Étape 2.1 : Créer le fichier**

  Créer `sonar-project.properties` à la racine du dépôt avec ce contenu **exact** (adapter `sonar.projectKey` et `sonar.organization` si SonarCloud a généré des valeurs différentes à l'étape 1.2) :

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

- [ ] **Étape 2.2 : Vérifier que `coverage/` est dans `.gitignore`**

  Vérifier que le dossier `coverage/` généré par NYC n'est pas commité :

  ```bash
  grep "coverage" .gitignore
  ```

  Si absent, ajouter la ligne `coverage/` dans `.gitignore`.

- [ ] **Étape 2.3 : Committer**

  ```bash
  git add sonar-project.properties .gitignore
  git commit -m "chore: ajouter configuration SonarCloud"
  ```

---

## Task 3 : Créer `.github/workflows/sonar.yml`

**Fichiers :**
- Créer : `.github/workflows/sonar.yml`

- [ ] **Étape 3.1 : Créer le dossier et le fichier workflow**

  ```bash
  mkdir -p .github/workflows
  ```

  Créer `.github/workflows/sonar.yml` avec ce contenu :

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

  **Notes sur le contenu :**
  - `fetch-depth: 0` : obligatoire pour SonarCloud (analyse l'historique git pour distinguer nouveaux vs anciens problèmes).
  - `node-version: 20` : LTS stable pour CI (le projet tourne localement sur v26 mais 20 LTS est préférable pour la reproductibilité CI).
  - `npm ci` : installe les dépendances depuis `package-lock.json` sans les modifier.
  - `npm run test:coverage` : exécute `nyc mocha "test/**/*.test.js"` → génère `coverage/lcov.info`.
  - `GITHUB_TOKEN` : fourni automatiquement par GitHub Actions, aucune configuration requise.
  - `SONAR_TOKEN` : le secret ajouté à l'étape 1.4.

- [ ] **Étape 3.2 : Committer**

  ```bash
  git add .github/workflows/sonar.yml
  git commit -m "ci: ajouter workflow GitHub Actions SonarCloud"
  ```

---

## Task 4 : Vérifier le déclenchement du workflow

- [ ] **Étape 4.1 : Pusher la branche `dev`**

  ```bash
  git push origin dev
  ```

- [ ] **Étape 4.2 : Vérifier l'exécution sur GitHub**

  Sur GitHub → dépôt → onglet "Actions" → vérifier que le workflow "SonarCloud Analysis" apparaît et passe au vert.

  En cas d'échec, lire les logs du job `sonar` pour identifier le problème :
  - Erreur `SONAR_TOKEN` : vérifier que le secret est bien nommé `SONAR_TOKEN` (pas `SONAR_TOKEN_DEGOGESTION`, etc.)
  - Erreur `npm run test:coverage` : les tests échouent en CI → corriger localement d'abord avec `npm run test:coverage`
  - Erreur `projectKey` / `organization` : vérifier les valeurs dans `sonar-project.properties` vs celles affichées dans SonarCloud

- [ ] **Étape 4.3 : Vérifier le dashboard SonarCloud**

  Sur sonarcloud.io → projet `decoGestion` → vérifier :
  - La couverture de code est affichée (issue de `coverage/lcov.info`)
  - La Quality Gate s'affiche (même si informative)
  - Aucun "Failed to execute goal" dans les logs

- [ ] **Étape 4.4 : Vérifier le comportement sur PR**

  Créer une PR de test depuis une branche vers `dev` → vérifier que SonarCloud publie un commentaire automatique dans la PR avec l'analyse du diff.

---

## Résumé des fichiers créés

| Fichier                         | Contenu                                                    |
|---------------------------------|------------------------------------------------------------|
| `sonar-project.properties`      | Clé projet, organisation, sources, couverture, exclusions  |
| `.github/workflows/sonar.yml`   | Workflow CI : checkout → Node → npm ci → tests → Sonar    |
