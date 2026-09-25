# Gestion Déco

[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](https://github.com/Weedomeker/decoGestion)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

Gestion Déco est une application web complète conçue pour faciliter la gestion et la production des décolements de matériaux utilisés dans l'impression et la signalisation. Elle permet de générer des fichiers de découpe optimisés pour les matériaux Dibond, de créer des fichiers PDF des décolements et de les exporter en format image haute qualité.

## Fonctionnalités

- **Gestion des utilisateurs** : Système d'authentification et de gestion des comptes utilisateur
- **Gestion des décolements** : Création, modification et suivi des projets de décolement
- **Génération de fichiers de découpe** : Production automatique de fichiers de découpe pour matériaux Dibond
- **Génération PDF** : Création de fichiers PDF professionnels des décolements
- **Conversion image** : Export des PDF en formats image (PNG, JPEG) avec optimisation
- **Gestion des stocks** : Suivi des matériaux et inventaire en temps réel
- **Prévisualisation** : Aperçu en temps réel des décolements avant production
- **Intégration réseau** : Connexion aux dossiers partagés pour synchronisation automatique
- **QR Codes** : Génération de codes QR pour traçabilité
- **Stickers** : Production de stickers personnalisés

## Technologies utilisées

### Backend

- **Node.js** : Environnement d'exécution JavaScript côté serveur
- **Express.js** : Framework web pour la création d'APIs REST
- **MongoDB** : Base de données NoSQL pour le stockage des données
- **Mongoose** : ODM pour MongoDB
- **WebSocket** : Communication en temps réel
- **PDF-lib** : Génération et manipulation de fichiers PDF
- **pdf2pic** : Conversion PDF vers images
- **Maker.js** : Génération de fichiers de découpe

### Frontend

- **React** : Bibliothèque JavaScript pour l'interface utilisateur
- **Vite** : Outil de build rapide pour le développement
- **React Router** : Gestion de la navigation
- **Semantic UI React** : Framework CSS pour l'interface
- **React PDF** : Affichage de PDF dans le navigateur
- **React Hook Form** : Gestion des formulaires

## Prérequis

Avant d'installer l'application, assurez-vous d'avoir les éléments suivants :

- **Node.js** (version 16 ou supérieure)
- **MongoDB** (version 4.4 ou supérieure)
- **npm** ou **yarn** pour la gestion des dépendances
- Accès aux dossiers réseau configurés (pour la synchronisation)

## Installation

1. **Cloner le repository** :

   ```bash
   git clone https://github.com/Weedomeker/decoGestion.git
   cd decoGestion
   ```

2. **Installer les dépendances du serveur** :

   ```bash
   npm install
   ```

3. **Installer les dépendances du client** :

   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Configurer l'environnement** :
   - Copier le fichier `config.json` et adapter les chemins réseau selon votre environnement
   - Créer un fichier `.env` dans le répertoire racine avec les variables d'environnement nécessaires (port, URL MongoDB, etc.)

5. **Démarrer MongoDB** :
   Assurez-vous que MongoDB est en cours d'exécution sur votre système.

## Configuration

### Variables d'environnement (.env)

```env
PORT=8000
MONGODB_URI=mongodb://localhost:27017/decogestion
NODE_ENV=development
```

### Configuration réseau (config.json)

Le fichier `config.json` contient les chemins vers les dossiers partagés pour différents fournisseurs :

- **LM** : Dossier Leroy Merlin
- **CASTO** : Dossier Castorama
- **BRICO** : Dossier Bricomarché
- **TAURO** : Dossier Tauro (imprimante)
- **PREVIEW** : Dossier des aperçus

Adaptez ces chemins selon votre infrastructure réseau.

## Utilisation

### Démarrage en mode développement

1. **Démarrer le serveur** :

   ```bash
   npm run server
   ```

2. **Démarrer le client** (dans un terminal séparé) :

   ```bash
   npm run client
   ```

3. **Accéder à l'application** :
   Ouvrez votre navigateur à l'adresse `http://localhost:3000`

### Démarrage en production

```bash
npm run build
npm start
```

L'application sera accessible sur le port configuré (par défaut 8000).

## Structure du projet

```
decoGestion/
├── client/                 # Application frontend React
│   ├── public/            # Assets statiques
│   ├── src/
│   │   ├── components/    # Composants React
│   │   ├── css/          # Styles CSS
│   │   └── images/       # Images et ressources
│   └── package.json
├── server/                # Serveur backend Node.js
│   ├── src/
│   │   ├── models/       # Modèles MongoDB
│   │   ├── logger/       # Système de logging
│   │   └── ...           # Modules métier
│   ├── public/           # Assets servis
│   └── server.js         # Point d'entrée serveur
├── test/                  # Tests
├── logs/                  # Logs de l'application
├── config.json           # Configuration réseau
├── package.json          # Dépendances et scripts
└── README.md
```

## Scripts disponibles

### Scripts principaux

- `npm start` : Démarrage en production
- `npm run server` : Démarrage du serveur en développement (avec nodemon)
- `npm run client` : Démarrage du client en développement
- `npm run build` : Build de production du client

### Scripts utilitaires

- `npm run format` : Formatage du code avec Prettier et ESLint

## API

L'application expose une API REST complète accessible sur `/api/`. Les endpoints principaux incluent :

- `/api/users` : Gestion des utilisateurs
- `/api/decos` : Gestion des décolements
- `/api/stocks` : Gestion des stocks
- `/api/preview` : Génération d'aperçus
- `/api/cutfile` : Génération de fichiers de découpe

## Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Guidelines de développement

- Respecter le style de code défini par ESLint
- Écrire des tests pour les nouvelles fonctionnalités
- Mettre à jour la documentation si nécessaire
- Utiliser des commits descriptifs

## Licence

Ce projet est sous licence ISC - voir le fichier [LICENSE](LICENSE) pour plus de détails.

## Auteur

**Weedomeker** - [GitHub](https://github.com/Weedomeker)

## Support

Pour obtenir de l'aide ou signaler un problème :

- Ouvrir une issue sur [GitHub](https://github.com/Weedomeker/decoGestion/issues)
- Contacter l'équipe de développement

---

_Application conçue pour optimiser la production de décolements dans l'industrie de l'impression et de la signalisation._
