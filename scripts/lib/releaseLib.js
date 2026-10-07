// Logique pure de `npm run release` : aucune commande git ici, tout est testable.
const { bumpVersion } = require("../../server/src/utils/version");

const SECTION_TITLES = {
  breaking: "⚠️ Changements majeurs",
  feat: "Nouveautés",
  fix: "Corrections",
  perf: "Performances",
};
const SECTION_ORDER = ["breaking", "feat", "fix", "perf"];

const COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const BREAKING_RE = /^BREAKING[ -]CHANGE:/m;

// Renvoie null pour tout ce qui ne doit pas apparaître dans une release :
// messages non conventionnels (historique ancien), merges, commits de release.
function parseCommit(subject, body = "") {
  const match = COMMIT_RE.exec(String(subject || "").trim());
  if (!match) return null;
  const [, type, scope = null, bang, description] = match;
  if (type === "chore" && scope === "release") return null;
  return {
    type,
    scope,
    breaking: Boolean(bang) || BREAKING_RE.test(body || ""),
    description: description.trim(),
  };
}

function determineBump(commits) {
  if (commits.some((c) => c.breaking)) return "major";
  if (commits.some((c) => c.type === "feat")) return "minor";
  if (commits.some((c) => c.type === "fix" || c.type === "perf")) return "patch";
  return null;
}

function sectionOf(commit) {
  if (commit.breaking) return "breaking";
  return SECTION_TITLES[commit.type] ? commit.type : null;
}

function countPublishable(commits) {
  return commits.filter((c) => sectionOf(c) !== null).length;
}

// `--init` sans version tomberait sinon sur une release normale : on refuse explicitement.
function parseArgs(argv) {
  const opts = { level: null, dryRun: false, yes: false, init: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["major", "minor", "patch"].includes(arg)) opts.level = arg;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--init") {
      const version = argv[++i];
      if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("Usage : npm run release -- --init X.Y.Z");
      opts.init = version;
    } else throw new Error(`Argument inconnu : ${arg}`);
  }
  return opts;
}

// Met à jour la version d'un package.json / package-lock.json en conservant ses fins de ligne.
function setJsonVersion(text, version) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.parse(text);
  json.version = version;
  if (json.packages && json.packages[""]) json.packages[""].version = version;
  return `${JSON.stringify(json, null, 2)}\n`.replace(/\n/g, eol);
}

function renderItem(commit) {
  return commit.scope ? `- **${commit.scope}** : ${commit.description}` : `- ${commit.description}`;
}

function renderChangelogEntry(version, date, commits) {
  const lines = [`## [${version}] - ${date}`, ""];
  let hasSection = false;

  for (const key of SECTION_ORDER) {
    const items = commits.filter((c) => sectionOf(c) === key);
    if (items.length === 0) continue;
    hasSection = true;
    lines.push(`### ${SECTION_TITLES[key]}`, ...items.map(renderItem), "");
  }

  if (!hasSection) lines.push("_Maintenance interne._", "");
  return lines.join("\n");
}

const CHANGELOG_HEADER = "# Changelog\n\n";

function prependToChangelog(existing, entry) {
  const rest = String(existing || "")
    .replace(/^# Changelog\s*/, "")
    .trim();
  return rest ? `${CHANGELOG_HEADER}${entry}\n${rest}\n` : `${CHANGELOG_HEADER}${entry}`;
}

function releaseNotes(entry) {
  return entry.split("\n").slice(1).join("\n").trim();
}

// Annulation d'un commit de release raté : les fichiers sont déjà indexés, donc `git checkout --`
// (qui restaure depuis l'index) ne ferait rien — on désindexe puis on restaure depuis HEAD.
function commitUndoCommand(files, newFiles) {
  const existing = files.filter((f) => !newFiles.includes(f));
  const parts = [`git reset -q HEAD -- ${files.join(" ")}`];
  if (existing.length) parts.push(`git checkout HEAD -- ${existing.join(" ")}`);
  if (newFiles.length) parts.push(`git clean -f -- ${newFiles.join(" ")}`);
  return parts.join(" && ");
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = {
  SECTION_TITLES,
  parseCommit,
  parseArgs,
  countPublishable,
  setJsonVersion,
  determineBump,
  bumpVersion,
  renderChangelogEntry,
  prependToChangelog,
  releaseNotes,
  commitUndoCommand,
  formatDate,
};
