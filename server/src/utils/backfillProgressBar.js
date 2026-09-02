const cliProgress = require("cli-progress");

// Barre de progression console pour les jobs de rattrapage au démarrage (les 6 phases de
// backfillRecentDecoData + syncGamesysExtraction) — même style que generatePreview.js
// (shades_classic), adaptée au vocabulaire candidats/ok/erreurs de ces jobs plutôt que
// PDFs générés/ignorés/échoués. Retourne un cli-progress.SingleBar déjà démarré ; l'appelant
// l'incrémente via bar.increment(1, {ok, ko}) et le ferme via bar.stop().
function createBackfillProgressBar(label, total) {
  const bar = new cliProgress.SingleBar(
    {
      format: `⏳ ${label} {bar} {percentage}% | {value}/{total} | ✅ {ok} | ❌ {ko}\n`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
      clearOnComplete: true,
      autopadding: true,
    },
    cliProgress.Presets.shades_classic,
  );
  bar.start(total, 0, { ok: 0, ko: 0 });
  return bar;
}

module.exports = { createBackfillProgressBar };
