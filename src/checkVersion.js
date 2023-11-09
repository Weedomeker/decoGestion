const fetch = require('node-fetch');
const fs = require('fs');

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
      throw new Error("Package or version doesn't exist on GitHub.");
    }
    return response.version;
  } catch (error) {
    throw error;
  }
}

function getDefaultMessage(options) {
  const { latestVersion, currentVersion, name } = options;
  if (latestVersion === currentVersion) {
    return `You have the latest version of ${name} (current: ${currentVersion})`;
  } else {
    return `Update available: ${latestVersion} (current: ${currentVersion})`;
  }
}

async function getGitHubPackageInfo(options) {
  const file = fs.readFileSync('./package.json', { encoding: 'utf-8' });
  const pkg = JSON.parse(file);
  const defaultOptions = {
    user: 'Weedomeker',
    name: 'decogestion',
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
