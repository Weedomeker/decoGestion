// Inscrit version + commit dans build-info.json au moment du build : le poste de prod reçoit
// les fichiers par copie, sans .git, et ne peut pas les retrouver seul.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function gitOut(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function collectBuildInfo(now = new Date()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const status = gitOut(["status", "--porcelain"]);
  return {
    version: pkg.version,
    commit: gitOut(["rev-parse", "--short", "HEAD"]),
    branch: gitOut(["rev-parse", "--abbrev-ref", "HEAD"]),
    buildDate: now.toISOString(),
    dirty: status === null ? null : status.length > 0,
  };
}

if (require.main === module) {
  const info = collectBuildInfo();
  fs.writeFileSync(path.join(ROOT, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
  const dirtyNote = info.dirty ? " ⚠️ modifications non commitées" : "";
  console.log(`build-info.json : v${info.version} (${info.commit || "sans git"})${dirtyNote}`);
}

module.exports = { collectBuildInfo };
