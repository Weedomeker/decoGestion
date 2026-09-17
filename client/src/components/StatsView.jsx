import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { API_BASE } from "../utils/api";

const PERIODS = [
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
  { key: "all", label: "Tout" },
];

function StatCard({ label, value }) {
  return (
    <div className="stats-card">
      <span className="stats-card-value">{value}</span>
      <span className="stats-card-label">{label}</span>
    </div>
  );
}

function StatsView() {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/stats?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totals = data?.totals ?? { count: 0, avgTemps: 0, totalPerte: 0 };
  const byClient = data?.byClient ?? [];

  return (
    <div className="stats-view">
      {/* Sélecteur de période */}
      <div className="stats-period-selector">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            className={`stats-period-btn${period === key ? " active" : ""}`}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="stats-loading">Chargement…</div>}
      {error && <div className="stats-error">Erreur : {error}</div>}

      {!loading && !error && data && (
        <>
          {/* Cards totaux */}
          <div className="stats-cards">
            <StatCard
              label="jobs traités"
              value={totals.count}
            />
            <StatCard
              label="temps moyen"
              value={`${Math.round(totals.avgTemps)}s`}
            />
            <StatCard
              label="perte matière"
              value={`${Number(totals.totalPerte ?? 0).toFixed(2)} m²`}
            />
          </div>

          {/* Graphique barres par client */}
          {byClient.length > 0 && (
            <div className="stats-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={byClient}
                  margin={{ top: 8, right: 24, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis
                    dataKey="client"
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--border-default)" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: "Jobs",
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--text-muted)",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: "Perte m²",
                      angle: 90,
                      position: "insideRight",
                      fill: "var(--text-muted)",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "4px",
                      color: "var(--text-primary)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      if (name === "Perte m²") return [`${Number(value).toFixed(2)} m²`, name];
                      return [value, name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Jobs"
                    fill="var(--accent)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="totalPerte"
                    name="Perte m²"
                    fill="var(--accent-soft)"
                    stroke="var(--accent)"
                    strokeWidth={1}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tableau récapitulatif */}
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Jobs</th>
                  <th>Temps moy.</th>
                  <th>Perte mat.</th>
                </tr>
              </thead>
              <tbody>
                {byClient.map((row) => (
                  <tr key={row.client}>
                    <td>
                      <span className={`stats-client-badge stats-client-${row.client?.toLowerCase()}`}>
                        {row.client}
                      </span>
                    </td>
                    <td>{row.count}</td>
                    <td>{Math.round(row.avgTemps)}s</td>
                    <td>{Number(row.totalPerte ?? 0).toFixed(2)} m²</td>
                  </tr>
                ))}
                {byClient.length === 0 && (
                  <tr>
                    <td colSpan={4} className="stats-empty">Aucune donnée</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default StatsView;
