// npm run release [-- major|minor|patch] [--dry-run] [--yes]
// npm run release -- --init 2.3.0   (une seule fois : réaligne main, pose le tag de référence)
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const lib = require("./lib/releaseLib");

const ROOT = path.join(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const VERSION_FILES = ["package.json", "package-lock.json", "client/package.json", "client/package-lock.json"];

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const git = (...args) => run("git", args);

function succeeds(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { level: null, dryRun: false, yes: false, init: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["major", "minor", "patch"].includes(arg)) opts.level = arg;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--init") opts.init = argv[++i];
    else fail(`Argument inconnu : ${arg}`);
  }
  return opts;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^o(ui)?$/i.test(answer.trim()));
    }),
  );
}

// Tout est vérifié AVANT la moindre écriture.
function checkPreconditions({ requireMainAncestor }) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "dev") fail(`Les releases se font depuis dev (branche actuelle : ${branch}).`);
  if (git("status", "--porcelain")) fail("Des modifications ne sont pas commitées : commitez ou remisez-les d'abord.");

  git("fetch", "origin", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/dev")) {
    fail("dev n'est pas synchronisée avec origin/dev (faites un pull ou un push d'abord).");
  }
  if (!succeeds(() => run("gh", ["auth", "status"]))) fail("gh n'est pas authentifié : lancez `gh auth login`.");
  if (requireMainAncestor && !succeeds(() => git("merge-base", "--is-ancestor", "origin/main", "HEAD"))) {
    fail("origin/main n'est pas un ancêtre de dev : lancez d'abord `npm run release -- --init <version>`.");
  }
}

function lastTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return null;
  }
}

function readCommits(range) {
  const out = git("log", "--no-merges", "--format=%s%x1f%b%x1e", range);
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body] = record.split("\x1f");
      return lib.parseCommit(subject, body);
    })
    .filter(Boolean);
}

function setVersionInFiles(version) {
  const touched = [];
  for (const file of VERSION_FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    json.version = version;
    if (json.packages && json.packages[""]) json.packages[""].version = version;
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
    touched.push(file);
  }
  return touched;
}

// Exécute les étapes dans l'ordre ; en cas d'échec, dit ce qui est fait et comment reprendre.
function runSteps(steps) {
  const done = [];
  for (const step of steps) {
    try {
      console.log(`→ ${step.label}`);
      step.action();
      done.push(step.label);
    } catch (error) {
      console.error(`\n✖ Échec : ${step.label}\n${error.stderr || error.message}`);
      if (done.length) console.error(`Déjà fait : ${done.join(", ")}`);
      const remaining = steps.slice(steps.indexOf(step)).map((s) => `  ${s.command}`);
      console.error(`Pour reprendre, relancez à la main :\n${remaining.join("\n")}`);
      if (step.undo) console.error(`Pour annuler : ${step.undo}`);
      process.exit(1);
    }
  }
}

async function release(opts) {
  checkPreconditions({ requireMainAncestor: true });

  const tag = lastTag();
  if (!tag) fail("Aucun tag vX.Y.Z : lancez d'abord `npm run release -- --init <version>`.");

  const current = tag.replace(/^v/, "");
  const commits = readCommits(`${tag}..HEAD`);
  const level = opts.level || lib.determineBump(commits);
  if (!level) {
    console.log(`Aucun commit feat/fix/perf depuis ${tag} : pas de release.`);
    return;
  }

  const next = lib.bumpVersion(current, level);
  const nextTag = `v${next}`;
  const entry = lib.renderChangelogEntry(next, lib.formatDate(new Date()), commits);

  console.log(`\nRelease ${tag} → ${nextTag} (${level}, ${commits.length} commit(s) publiables)\n`);
  console.log(entry);

  if (opts.dryRun) {
    console.log("--dry-run : rien n'a été modifié.");
    return;
  }
  if (!opts.yes && !(await confirm(`Publier ${nextTag} ? (o/N) `))) {
    console.log("Annulé.");
    return;
  }

  const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, "utf8") : "";
  const touched = setVersionInFiles(next);
  fs.writeFileSync(CHANGELOG, lib.prependToChangelog(existing, entry));

  const notesFile = path.join(os.tmpdir(), `decogestion-${nextTag}-notes.md`);
  fs.writeFileSync(notesFile, lib.releaseNotes(entry));
  const files = [...touched, "CHANGELOG.md"];

  runSteps([
    {
      label: "commit de release",
      command: `git add ${files.join(" ")} && git commit -m "chore(release): ${nextTag}"`,
      undo: lib.commitUndoCommand(files, existing ? [] : ["CHANGELOG.md"]),
      action: () => {
        git("add", ...files);
        git("commit", "-m", `chore(release): ${nextTag}`);
      },
    },
    {
      label: `tag ${nextTag}`,
      command: `git tag -a ${nextTag} -m "${nextTag}"`,
      undo: "git reset --soft HEAD~1",
      action: () => git("tag", "-a", nextTag, "-m", nextTag),
    },
    {
      label: "push de dev",
      command: "git push origin dev",
      undo: `git tag -d ${nextTag} && git reset --soft HEAD~1`,
      action: () => git("push", "origin", "dev"),
    },
    {
      label: `push du tag ${nextTag}`,
      command: `git push origin ${nextTag}`,
      action: () => git("push", "origin", nextTag),
    },
    {
      label: "avance de main (fast-forward)",
      command: "git push origin HEAD:main",
      action: () => git("push", "origin", "HEAD:main"),
    },
    {
      label: "release GitHub",
      command: `gh release create ${nextTag} --title ${nextTag} --notes-file "${notesFile}"`,
      action: () => run("gh", ["release", "create", nextTag, "--title", nextTag, "--notes-file", notesFile]),
    },
  ]);

  console.log(`\n✔ ${nextTag} publiée. Pensez à \`npm run build\` avant la copie sur le poste de prod.`);
}

// Une seule fois : rejoint l'historique de main dans dev (fast-forward possible ensuite),
// puis pose le tag de référence sur le commit où package.json est passé à cette version.
async function init(version, opts) {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) fail("Usage : npm run release -- --init X.Y.Z");
  checkPreconditions({ requireMainAncestor: false });
  if (lastTag()) fail(`Un tag de version existe déjà (${lastTag()}) : --init ne sert qu'une fois.`);

  const tag = `v${version}`;
  const needMerge = !succeeds(() => git("merge-base", "--is-ancestor", "origin/main", "HEAD"));
  const introduced = git("log", "--reverse", "--format=%H", "-G", `"version": "${version}"`, "--", "package.json")
    .split("\n")
    .filter(Boolean)[0];
  const target = introduced || git("rev-parse", "HEAD");
  const targetLabel = git("log", "-1", "--format=%h %ad %s", "--date=short", target);

  console.log("\nAmorçage du versioning :");
  if (needMerge) console.log("  1. merge de origin/main dans dev (historique seulement), puis push de dev");
  console.log(`  2. tag ${tag} sur ${targetLabel}`);
  console.log(`  3. push du tag et release GitHub ${tag} « Version de référence »\n`);

  if (opts.dryRun) {
    console.log("--dry-run : rien n'a été modifié.");
    return;
  }
  if (!opts.yes && !(await confirm("Continuer ? (o/N) "))) {
    console.log("Annulé.");
    return;
  }

  if (needMerge) {
    git("merge", "--no-ff", "--no-commit", "origin/main");
    // main ne doit rien apporter de neuf : on refuse un merge qui modifierait le code.
    if (!succeeds(() => git("diff", "--cached", "--quiet"))) {
      git("merge", "--abort");
      fail("origin/main contient des changements absents de dev : fusion à faire à la main.");
    }
    git("commit", "--no-edit");
  }

  runSteps([
    ...(needMerge
      ? [{ label: "push de dev", command: "git push origin dev", action: () => git("push", "origin", "dev") }]
      : []),
    {
      label: `tag ${tag}`,
      command: `git tag -a ${tag} ${target} -m "${tag}"`,
      action: () => git("tag", "-a", tag, target, "-m", tag),
    },
    { label: `push du tag ${tag}`, command: `git push origin ${tag}`, action: () => git("push", "origin", tag) },
    {
      label: "release GitHub",
      command: `gh release create ${tag} --title ${tag} --notes "Version de référence du versioning."`,
      action: () =>
        run("gh", ["release", "create", tag, "--title", tag, "--notes", "Version de référence du versioning."]),
    },
  ]);

  console.log(`\n✔ Versioning amorcé sur ${tag}. Prochaine étape : npm run release`);
}

const opts = parseArgs(process.argv.slice(2));
(opts.init ? init(opts.init, opts) : release(opts)).catch((error) => fail(error.stack || error.message));
