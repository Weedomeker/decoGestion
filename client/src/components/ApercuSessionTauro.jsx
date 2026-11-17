import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Loader, Message, Modal, Table } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

function Section({ titre, children }) {
  return (
    <div style={{ marginTop: "1em" }}>
      <h4 style={{ marginBottom: "0.4em" }}>{titre}</h4>
      {children}
    </div>
  );
}

Section.propTypes = { titre: PropTypes.string.isRequired, children: PropTypes.node };

function ApercuSessionTauro({ open, mode, ids, message, finitionInitiale, relancerInitial, onClose, onLance }) {
  const [finition, setFinition] = useState(finitionInitiale || "MAT");
  const [relancer, setRelancer] = useState(relancerInitial || []);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const idsKey = JSON.stringify(ids ?? null);
  const enSession = mode === "session";

  const derniereRequete = useRef(0);

  const charger = useCallback(async () => {
    const numero = ++derniereRequete.current;
    setLoading(true);
    setError(null);
    try {
      const body = { mode, relancer };
      if (ids) body.ids = ids;
      if (enSession) body.finition = finition;
      const response = await fetch(`${API_BASE}/tauro/plan`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (numero !== derniereRequete.current) return;
      if (!response.ok) {
        setPlan(null);
        setError(result.error || `Erreur aperçu (${response.status})`);
      } else {
        setPlan(result);
      }
    } catch (e) {
      if (numero !== derniereRequete.current) return;
      console.error("Erreur aperçu Tauro:", e);
      setPlan(null);
      setError("Impossible de contacter le serveur.");
    } finally {
      if (numero === derniereRequete.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, idsKey, finition, relancer]);

  // Le parent démonte la fenêtre à la fermeture : l'état repart à zéro à chaque ouverture.
  useEffect(() => {
    if (open) charger();
  }, [open, charger]);

  const toggleRelancer = (cle, checked) =>
    setRelancer((prev) => (checked ? [...new Set([...prev, cle])] : prev.filter((c) => c !== cle)));

  const sessions = plan?.sessions ?? [];
  const horsSession = plan?.horsSession ?? [];
  const sansPdf = plan?.sansPdf ?? [];
  const restants = plan?.restants ?? [];
  const ignores = plan?.ignores ?? [];
  const bloques = plan?.bloques ?? [];
  const alertes = plan?.alertes ?? [];
  const aLancer = sessions.length + horsSession.length + sansPdf.length > 0;
  const autreFinition = finition === "MAT" ? "Brillant" : "Mat";

  const libelleLancer = enSession
    ? `Lancer ${sessions.length} session${sessions.length > 1 ? "s" : ""}`
    : `Lancer ${horsSession.length} PDF hors session`;

  return (
    <Modal open={open} onClose={onClose} size="large" closeOnDimmerClick={false}>
      <Modal.Header>{enSession ? "Lancer en session" : "Lancer hors session"}</Modal.Header>
      <Modal.Content scrolling>
        {message && <Message info content={message} />}

        {enSession && (
          <Button.Group size="small" style={{ marginBottom: "0.5em" }}>
            <Button
              type="button"
              active={finition === "MAT"}
              primary={finition === "MAT"}
              onClick={() => setFinition("MAT")}
            >
              Mat
            </Button>
            <Button
              type="button"
              active={finition === "BRI"}
              primary={finition === "BRI"}
              onClick={() => setFinition("BRI")}
            >
              Brillant
            </Button>
          </Button.Group>
        )}

        {loading && <Loader active inline="centered" content="Chargement de l'aperçu…" />}
        {error && <Message negative content={error} />}

        {plan && !error && (
          <div style={loading ? { opacity: 0.5 } : undefined}>
            {enSession && (
              <Section titre="Sessions">
                {sessions.length === 0 ? (
                  <p>Aucune session.</p>
                ) : (
                  <Table size="small" compact>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Code</Table.HeaderCell>
                        <Table.HeaderCell>Finition</Table.HeaderCell>
                        <Table.HeaderCell>Ex.</Table.HeaderCell>
                        <Table.HeaderCell>Jobs</Table.HeaderCell>
                        <Table.HeaderCell>N° début → fin</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {sessions.map((s) => (
                        <Table.Row key={s.code}>
                          <Table.Cell>{s.code}</Table.Cell>
                          <Table.Cell>{s.fin}</Table.Cell>
                          <Table.Cell>{s.ex}</Table.Cell>
                          <Table.Cell>{s.jobs?.length ?? 0}</Table.Cell>
                          <Table.Cell>
                            {s.depart} → {s.dernier}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}
              </Section>
            )}

            {!enSession && (
              <Section titre="PDF hors session">
                {horsSession.length === 0 ? (
                  <p>Aucun PDF.</p>
                ) : (
                  <Table size="small" compact>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Nom</Table.HeaderCell>
                        <Table.HeaderCell>Ex.</Table.HeaderCell>
                        <Table.HeaderCell>Finition</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {horsSession.map((h) => (
                        <Table.Row key={h.id}>
                          <Table.Cell>{h.nom}</Table.Cell>
                          <Table.Cell>{h.ex}</Table.Cell>
                          <Table.Cell>{h.fin}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}
              </Section>
            )}

            {restants.length > 0 && (
              <Section titre="Restent dans la file">
                <ul>
                  {restants.map((r) => (
                    <li key={r.id}>
                      {r.cmd} : {r.raison}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {ignores.length > 0 && (
              <Section titre={`${autreFinition} ignoré`}>
                <ul>
                  {ignores.map((r) => (
                    <li key={r.id}>
                      {r.cmd} ({r.ex} ex.)
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {sansPdf.length > 0 && (
              <Section titre="Sans PDF">
                <p>Teinte masse et stock : partent avec, hors comptage.</p>
                <ul>
                  {sansPdf.map((r) => (
                    <li key={r.id}>
                      {r.cmd}
                      {r.visuel ? ` : ${r.visuel}` : ""}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {bloques.length > 0 && (
              <Section titre="Bloqués">
                <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                  {bloques.map((r) => (
                    <li key={r.id} style={{ marginBottom: "0.3em" }}>
                      <Checkbox
                        label={`Relancer ${r.cmd} : ${r.raison}`}
                        checked={relancer.includes(r.cle)}
                        onChange={(e, { checked }) => toggleRelancer(r.cle, checked)}
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {alertes.length > 0 && (
              <Section titre="Infos">
                {alertes.map((a, i) => (
                  <Message key={i} warning size="small" content={a} />
                ))}
              </Section>
            )}
          </div>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button
          type="button"
          primary
          icon="send"
          content={libelleLancer}
          disabled={loading || !plan || !!error || !aLancer || (enSession && plan.finition !== finition)}
          onClick={() =>
            onLance({ mode, finition: enSession ? finition : undefined, relancer, empreinte: plan.empreinte }, ids)
          }
        />
      </Modal.Actions>
    </Modal>
  );
}

ApercuSessionTauro.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(["session", "hors-session"]).isRequired,
  ids: PropTypes.array,
  message: PropTypes.string,
  finitionInitiale: PropTypes.string,
  relancerInitial: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  onLance: PropTypes.func.isRequired,
};

export default ApercuSessionTauro;
