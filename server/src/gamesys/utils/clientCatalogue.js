const { isProfileLabel, isKitPoseLabel, isVisualLabel } = require("./reference");

// Récupération des commandes Gamesys dont le code client (endv_cclient / dos_client) n'a PAS de
// préfixe enseigne connu (LM/CAS/BM/ECOM) — comptes revendeurs pro (PRO###), variantes de
// paiement e-commerce (EPROCB/EPROPAYP) et comptes B2B courts (I96, L558, S332, ...). Ces
// comptes achètent le catalogue e-commerce (crédences DECO ECO/SDB + profilés MURANEO/DECO-K-I
// + accessoires) mais tombaient en `null` dans mapDosClientToAppClient → écartés des synchros
// (consommations + stubs). On les rattache à ECOM en se basant sur la famille Gamesys
// (fs_stock.st_art_famille) des articles de la commande.
//
// Règle volontairement conservatrice : jamais de branche LM/CASTO (ces enseignes portent
// toujours leur préfixe ; LEROYM/BRICOCAM sont des codes morts), et une seule famille "hors
// déco" résolue suffit à écarter toute la commande. Cf. plan
// C:\Users\Kongsberg\.claude\plans\avec-ce-que-l-on-snappy-moth.md et la simulation associée.

// Familles fs_stock du catalogue déco traité par l'app (visuels + profils + kits de pose).
// LM MERSH (menuiserie/merchandising Leroy Merlin) est volontairement EXCLU : ce n'est pas le
// catalogue e-commerce → une ligne LM MERSH compte comme contamination.
const FAM_DECO = new Set(["DECO LM", "CASTORAM", "DECO ECO", "ECOM", "MURANEO", "DECO-K-I"]);

// Comptes non enseigne à ne jamais rattacher (tests, démos, compte interne).
const COMPTES_EXCLUS = new Set(["TEST", "FORTDEMO", "PRODFINI", "VRAI", "DECOKIN"]);

// Préfixes déjà gérés par mapDosClientToAppClient (match par startsWith).
const KNOWN_PREFIXES = ["LM", "CAS", "BM", "ECOM"];

function hasKnownClientPrefix(cclient) {
  const key = String(cclient || "").toUpperCase();
  return KNOWN_PREFIXES.some((prefix) => key.startsWith(prefix));
}

const FORMAT_RE = /\d{2,4}\s*x\s*\d{2,4}/i;

// lignes : [{ label, famille, tarif }] — toutes les lignes de devis d'une commande racine,
// enrichies de la famille/tarif fs_stock résolus par libellé exact (loadFamilleByLabel).
// Retourne "ECOM" si la commande est du catalogue déco exploitable, sinon null.
function deduceAppClientFromCatalogue(cclient, lignes) {
  const key = String(cclient || "").toUpperCase();
  if (COMPTES_EXCLUS.has(key)) return null;

  const rows = Array.isArray(lignes) ? lignes : [];
  const decoLignes = rows.filter((l) => FAM_DECO.has(l.famille));

  if (decoLignes.length === 0) {
    // Aucun libellé rattaché au catalogue déco — dernier recours : le code tarif e-commerce.
    return rows.some((l) => /^EC-/i.test(l.tarif || "")) ? "ECOM" : null;
  }

  // Une seule ligne rattachée à une famille hors déco (PLV/signalétique : S-BEAUTE, AUTO-MOB,
  // TEXDECOR, COND, POSE, LM MERSH, TET-*, ...) suffit à écarter toute la commande.
  const contamine = rows.some((l) => l.famille && !FAM_DECO.has(l.famille));
  if (contamine) return null;

  // Ancre : au moins une ligne déco qui est un profilé, un kit de pose, ou un visuel dimensionné
  // (élimine "Totem" = famille MURANEO mais ni crédence ni profil).
  const hasAnchor = decoLignes.some(
    (l) =>
      isProfileLabel(l.label) ||
      isKitPoseLabel(l.label) ||
      (isVisualLabel(l.label) && FORMAT_RE.test(String(l.label || ""))),
  );
  if (!hasAnchor) return null;

  return "ECOM";
}

// rows : [{ dos_no_cmde, dos_client, endv_identif }] — lignes de devis brutes déjà mappées.
// famMap : Map<UPPER(st_lib_1_conso), { famille, tarif }> (loadFamilleByLabel).
// Retourne [{ cmd, client }] pour les seules commandes SANS préfixe connu (disjoint du résultat
// de groupCandidatesFromRows/groupAllCandidatesFromRows → aucun double comptage).
function recoverCandidatesFromCatalogue(rows, famMap, { requireProfilKit = false } = {}) {
  if (!famMap || !famMap.size) return [];

  const byCmd = new Map();
  for (const row of rows || []) {
    if (!row.dos_no_cmde) continue;
    if (hasKnownClientPrefix(row.dos_client)) continue;

    const cmd = String(row.dos_no_cmde).split("/")[0];
    if (!byCmd.has(cmd)) byCmd.set(cmd, { cmd, cclient: row.dos_client, lignes: [] });

    const info = famMap.get(String(row.endv_identif || "").toUpperCase());
    byCmd.get(cmd).lignes.push({
      label: row.endv_identif,
      famille: info ? info.famille : "",
      tarif: info ? info.tarif : "",
    });
  }

  const out = [];
  for (const { cmd, cclient, lignes } of byCmd.values()) {
    if (requireProfilKit && !lignes.some((l) => isProfileLabel(l.label) || isKitPoseLabel(l.label))) {
      continue;
    }
    const client = deduceAppClientFromCatalogue(cclient, lignes);
    if (client) out.push({ cmd, client });
  }
  return out;
}

// Fusionne les candidats de la 1ʳᵉ passe (préfixe) avec ceux récupérés par catalogue, en
// dédupliquant sur `cmd` (défensif : les deux ensembles sont déjà disjoints par construction).
function mergeCandidates(base, extra) {
  const seen = new Set((base || []).map((c) => c.cmd));
  const merged = [...(base || [])];
  for (const c of extra || []) {
    if (!seen.has(c.cmd)) {
      seen.add(c.cmd);
      merged.push(c);
    }
  }
  return merged;
}

module.exports = {
  FAM_DECO,
  COMPTES_EXCLUS,
  KNOWN_PREFIXES,
  hasKnownClientPrefix,
  deduceAppClientFromCatalogue,
  recoverCandidatesFromCatalogue,
  mergeCandidates,
};
