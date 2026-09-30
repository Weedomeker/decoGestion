// Lecture de CHANGELOG.md (écrit par scripts/release.js) pour la fenêtre « Quoi de neuf ».
const fs = require("fs");
const logger = require("../logger/logger");
const { compareVersions } = require("../utils/version");

// Seules les versions publiées (X.Y.Z) comptent : une section « [Unreleased] » est ignorée.
const VERSION_RE = /^## \[(\d+\.\d+\.\d+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/;
const OTHER_HEADING_RE = /^## /;
const SECTION_RE = /^### (.+)$/;
const ITEM_RE = /^- (?:\*\*(.+?)\*\* : )?(.+)$/;

// Tolérant : toute ligne qui n'est ni une version, ni une section, ni une puce est ignorée.
function parseChangelog(markdown) {
  const entries = [];
  let entry = null;
  let section = null;

  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const versionMatch = VERSION_RE.exec(line);
    if (versionMatch) {
      entry = { version: versionMatch[1], date: versionMatch[2] || null, sections: {} };
      entries.push(entry);
      section = null;
      continue;
    }
    if (OTHER_HEADING_RE.test(line)) {
      // Titre non publié : ses lignes ne doivent pas se rattacher à la version précédente.
      entry = null;
      section = null;
      continue;
    }
    if (!entry) continue;

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      entry.sections[section] = [];
      continue;
    }

    const itemMatch = ITEM_RE.exec(line);
    if (itemMatch && section) {
      entry.sections[section].push({ scope: itemMatch[1] || null, text: itemMatch[2] });
    }
  }
  return entries;
}

function readChangelog({ since, limit = 5, current, filePath }) {
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") logger.warn(`CHANGELOG illisible : ${error.message}`);
    return [];
  }

  const entries = parseChangelog(markdown);
  if (since) {
    return entries.filter(
      (e) => compareVersions(e.version, since) > 0 && (!current || compareVersions(e.version, current) <= 0),
    );
  }
  return entries.slice(0, limit);
}

module.exports = { parseChangelog, readChangelog };
