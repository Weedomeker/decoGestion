const fetch = require('node-fetch');
const fs = require('fs');
const chalk = require('chalk');

const log = console.log;

async function fetchDataFromURL(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data with status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    throw error;
  }
}

async function getVersionFromGitHub(options) {
  const { user, name, branch } = options;
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(user)}/${encodeURIComponent(
    name,
  )}/${encodeURIComponent(branch)}/package.json`;

  try {
    const response = await fetchDataFromURL(url);
    if (response.status === 404) {
      throw new Error("Le package ou la version n'existe pas sur GitHub.");
    }
    return response.version;
  } catch (error) {
    throw error;
  }
}

function getDefaultMessage(options) {
  const { latestVersion, currentVersion, name } = options;
  if (latestVersion === currentVersion) {
    return `Vous avez la dernière version de ${name} (actuelle: ${currentVersion})`;
  } else {
    return `Mise à jour disponible: ${latestVersion} (actuelle: ${currentVersion})`;
  }
}

async function getGitHubPackageInfo(options) {
  const file = fs.readFileSync('./package.json', { encoding: 'utf-8' });
  const pkg = JSON.parse(file);
  const defaultOptions = {
    user: 'Weedomeker',
    name: 'Decogestion',
    currentVersion: pkg.version,
    branch: 'main',
  };

  options = { ...defaultOptions, ...options };

  try {
    const latestVersion = await getVersionFromGitHub(options);
    options.latestVersion = latestVersion;

    if (options.currentVersion === undefined) {
      return { latestVersion, message: null };
    } else {
      return { latestVersion, message: getDefaultMessage(options) };
    }
  } catch (error) {
    throw error;
  }
}

module.exports = getGitHubPackageInfo;
