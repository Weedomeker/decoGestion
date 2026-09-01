import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "../utils/api";

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

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDuration(s) {
  if (s == null || s === "") return "—";
  const n = Number(s);
  if (isNaN(n)) return "—";
  if (n < 60) return `${Math.round(n)}s`;
  return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
}

function HistoriqueView() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
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

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
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
            value={filters.q}
            onChange={(e) => handleFilterChange("q", e.target.value)}
            aria-label="Rechercher"
          />

          <button
            type="button"
            className="historique-btn historique-btn--reset"
            onClick={handleReset}
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
        {loading && <div className="historique-status">Chargement…</div>}
        {!loading && error && <div className="historique-status historique-status--error">{error}</div>}
        {!loading && !error && data.length === 0 && (
          <div className="historique-status">Aucun résultat</div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="historique-table-wrapper">
            <table className="historique-table">
              <thead>
                <tr>
                  <th>Date</th>
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
                    <td>{formatDate(row.createdAt ?? row.date)}</td>
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
                    <td className="historique-mono">{formatDuration(row.temps)}</td>
                    <td className="historique-mono">{row.perte != null ? row.perte : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div className="historique-pagination">
          <button
            type="button"
            className="historique-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Précédent
          </button>
          <span className="historique-page-info">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="historique-btn"
            disabled={page >= totalPages - 1}
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
