import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "../utils/api";
import { formatDuree } from "../utils/duree";

const PAGE_SIZE = 20;

const CLIENT_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "LM", label: "LM" },
  { value: "CASTO", label: "CASTO" },
  { value: "BRICO", label: "BRICO" },
  { value: "ECOM", label: "ECOM" },
];

const EMPTY_FILTERS = { client: "", from: "", to: "", q: "" };

// Code compte revendeur "pro" (sans préfixe enseigne : PRO###, EPROCB, I96, S332, L558…).
// Renvoie le code en majuscules, ou null si c'est un compte enseigne classique (LM/CAS/BM/ECOM).
const ENSEIGNE_PREFIXES = ["LM", "CAS", "BM", "ECOM"];
function proAccountCode(codeClient) {
  const c = String(codeClient || "").trim().toUpperCase();
  if (!c) return null;
  return ENSEIGNE_PREFIXES.some((p) => c.startsWith(p)) ? null : c;
}

// Date de production (champ « date », celui du tri et des filtres Du / Au), avec l'heure.
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const jour = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} ${heure}`;
}

function HistoriqueView() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Recherche saisie : envoyée au serveur 300 ms après la dernière frappe, pas à chaque lettre.
  const [saisie, setSaisie] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildQuery = useCallback(
    (extraParams = {}) => {
      const params = new URLSearchParams();
      params.set("limit", PAGE_SIZE);
      params.set("skip", (page * PAGE_SIZE).toString());
      if (filters.client) params.set("client", filters.client);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
      return params.toString();
    },
    [filters, page],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/history?${buildQuery()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json.data ?? []);
          setTotal(json.total ?? 0);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [buildQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => (prev.q === saisie ? prev : { ...prev, q: saisie }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [saisie]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setSaisie("");
    setPage(0);
  }

  function handleExportCSV() {
    const params = new URLSearchParams();
    if (filters.client) params.set("client", filters.client);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.q) params.set("q", filters.q);
    const url = `${API_BASE}/history/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="historique-view">
      {/* Barre de filtres */}
      <div className="historique-filters">
        <div className="historique-filters-left">
          <select
            className="historique-select"
            value={filters.client}
            onChange={(e) => handleFilterChange("client", e.target.value)}
            aria-label="Filtrer par client"
          >
            {CLIENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="historique-date-label">
            Du
            <input
              type="date"
              className="historique-date-input"
              value={filters.from}
              onChange={(e) => handleFilterChange("from", e.target.value)}
              aria-label="Date de début"
            />
          </label>

          <label className="historique-date-label">
            Au
            <input
              type="date"
              className="historique-date-input"
              value={filters.to}
              onChange={(e) => handleFilterChange("to", e.target.value)}
              aria-label="Date de fin"
            />
          </label>

          <input
            type="text"
            className="historique-search-input"
            placeholder="Mag, déco, réf, N° cmd"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            aria-label="Rechercher"
          />

          <button
            type="button"
            className="historique-btn historique-btn--reset"
            onClick={handleReset}
            disabled={!saisie && !filters.client && !filters.from && !filters.to}
          >
            Réinitialiser
          </button>
        </div>

        <button
          type="button"
          className="historique-btn historique-btn--export"
          onClick={handleExportCSV}
        >
          Exporter CSV
        </button>
      </div>

      {/* Corps */}
      <div className="historique-body">
        {loading && data.length === 0 && <div className="historique-status">Chargement…</div>}
        {!loading && error && <div className="historique-status historique-status--error">{error}</div>}
        {!loading && !error && data.length === 0 && (
          <div className="historique-status">Aucun résultat</div>
        )}

        {!error && data.length > 0 && (
          // Pendant un rechargement (page, filtre), le tableau reste en place, estompé : plus de saut.
          <div className={`historique-table-wrapper${loading ? " historique-table-wrapper--charge" : ""}`} aria-busy={loading}>
            <table className="historique-table">
              <thead>
                <tr>
                  <th>Produit le</th>
                  <th>Client</th>
                  <th>N° Cmd</th>
                  <th>Mag</th>
                  <th>Déco</th>
                  <th>Format</th>
                  <th>Finition</th>
                  <th>Ex</th>
                  <th>Temps</th>
                  <th>Perte</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row._id ?? i}>
                    <td className="historique-mono" title={row.dateCommande ? `Commande du ${new Date(row.dateCommande).toLocaleDateString("fr-FR")}` : undefined}>
                      {formatDate(row.date ?? row.createdAt)}
                    </td>
                    <td className="historique-client-cell">
                      <span className={`client-badge client-badge--${(row.client ?? "").toLowerCase()}`}>
                        {row.client ?? "—"}
                      </span>
                      {row.surMesure && proAccountCode(row.codeClient) && (
                        <span className="badge badge--pro" title="Compte revendeur pro (sur-mesure)">
                          {proAccountCode(row.codeClient)}
                        </span>
                      )}
                    </td>
                    <td className="historique-mono">{row.numCmd ?? "—"}</td>
                    <td>{row.mag ?? "—"}</td>
                    <td>
                      {row.deco ?? "—"}
                      {row.surMesure && (
                        <span
                          className="badge badge--surmesure"
                          title={`Sur-mesure${row.orientation ? ` — ${row.orientation}` : ""}${
                            row.comment ? ` — ${row.comment}` : ""
                          }`}
                        >
                          SM
                        </span>
                      )}
                    </td>
                    <td className="historique-mono">{row.format ?? row.format_visu ?? "—"}</td>
                    <td>{row.finition ?? "—"}</td>
                    <td>{row.ex ?? "—"}</td>
                    <td className="historique-mono">{formatDuree(row.temps)}</td>
                    <td className="historique-mono">{row.perte != null ? row.perte : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!error && total > 0 && (
        <div className="historique-pagination">
          <button
            type="button"
            className="historique-btn"
            disabled={loading || page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédent
          </button>
          <span className="historique-page-info">
            Page {page + 1} / {totalPages}
            <span className="historique-total">
              {total.toLocaleString("fr-FR")} ligne{total > 1 ? "s" : ""}
            </span>
          </span>
          <button
            type="button"
            className="historique-btn"
            disabled={loading || page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

export default HistoriqueView;
