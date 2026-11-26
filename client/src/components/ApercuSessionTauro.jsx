import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Loader, Message, Modal } from "semantic-ui-react";
import { API_BASE } from "../utils/api";
import {
  TAILLE_DEFAUT,
  blocageCourt,
  dansOrdreImpression,
  erreurTaille,
  listeDossiers,
  regrouperParMotif,
  resumeFormats,
} from "../utils/apercuTauro";

/** Champ « nombre d'ex. » compact ; vide -> "" (refusé par erreurTaille) */
function ChampEx({ libelle, valeur, onChange }) {
  return (
    <label className="apercu-tauro-champ">
      {libelle}
      <input
        type="number"
        min={1}
        max={100}
        step={1}
        value={valeur}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </label>
  );
}

ChampEx.propTypes = {
  libelle: PropTypes.string,
  valeur: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onChange: PropTypes.func.isRequired,
};

const n3 = (n) => String(n).padStart(3, "0");
// « PDF » est invariable
const pluriel = (n, mot) => `${n} ${mot}${n > 1 && mot !== "PDF" ? "s" : ""}`;

// Session : les teintes masse comptent dans les ex. et les n° d'ordre, mais n'ont pas de PDF
const nbTeinteMasse = (s) => (s.jobs ?? []).filter((j) => j.teinteMasse).length;
const nbPdf = (s) => (s.jobs?.length ?? 0) - nbTeinteMasse(s);

/** Bloc de l'aperçu : « part » (vert), « reste » (neutre) ou « verif » (orange) */
function Bloc({ type, titre, children }) {
  return (
    <section className={`apercu-tauro-bloc apercu-tauro-bloc--${type}`}>
      <h4>{titre}</h4>
      {children}
    </section>
  );
}

Bloc.propTypes = {
  type: PropTypes.oneOf(["part", "reste", "verif"]).isRequired,
  titre: PropTypes.string.isRequired,
  children: PropTypes.node,
};

/** Liste repliable des noms de PDF */
function NomsPdf({ noms }) {
  if (!noms.length) return null;
  return (
    <details className="apercu-tauro-noms">
      <summary>Voir les {pluriel(noms.length, "PDF")}</summary>
      <ol>
        {noms.map((nom) => (
          <li key={nom}>{nom}</li>
        ))}
      </ol>
    </details>
  );
}

NomsPdf.propTypes = { noms: PropTypes.arrayOf(PropTypes.string).isRequired };

function ApercuSessionTauro({
  open,
  mode,
  ids,
  message,
  finitionInitiale,
  relancerInitial,
  tailleInitiale,
  onClose,
  onLance,
}) {
  const [finition, setFinition] = useState(finitionInitiale || "MAT");
  const [relancer, setRelancer] = useState(relancerInitial || []);
  const [taille, setTaille] = useState({ ...TAILLE_DEFAUT, ...tailleInitiale });
  const tailleInvalide = erreurTaille(taille);
  const tailleKey = JSON.stringify(taille);
  const changerTaille = (cle) => (valeur) => setTaille((t) => ({ ...t, [cle]: valeur }));
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const idsKey = JSON.stringify(ids ?? null);
  const enSession = mode === "session";

  const derniereRequete = useRef(0);

  const charger = useCallback(async () => {
    const numero = ++derniereRequete.current;
    // Saisie incomplète (champ vide, hors limites) : pas d'aperçu tant qu'elle n'est pas corrigée
    if (enSession && tailleInvalide) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = { mode, relancer };
      if (ids) body.ids = ids;
      if (enSession) {
        body.finition = finition;
        body.taille = taille;
      }
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
  }, [mode, idsKey, finition, relancer, tailleKey]);

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

  const libelleLancer = !enSession
    ? `Lancer ${horsSession.length} PDF hors session`
    : sessions.length === 0 && sansPdf.length > 0
      ? `Lancer ${sansPdf.length} job${sansPdf.length > 1 ? "s" : ""} sans PDF`
      : `Lancer ${sessions.length} session${sessions.length > 1 ? "s" : ""}`;

  return (
    <Modal open={open} onClose={onClose} size="large" closeOnDimmerClick={false}>
      <Modal.Header>{enSession ? "Lancer en session" : "Lancer hors session"}</Modal.Header>
      <Modal.Content scrolling>
        {message && <Message info content={message} />}

        {enSession && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75em", marginBottom: "0.5em" }}>
            <span>Finition du lancement :</span>
            <Button.Group size="small" className="finition-tauro">
              {[
                ["MAT", "Mat", "mat"],
                ["BRI", "Brillant", "bri"],
              ].map(([valeur, libelle, classe]) => (
                <Button
                  key={valeur}
                  type="button"
                  className={classe}
                  active={finition === valeur}
                  aria-pressed={finition === valeur}
                  onClick={() => setFinition(valeur)}
                >
                  {libelle}
                </Button>
              ))}
            </Button.Group>
            <span className="apercu-tauro-taille">
              Ex. par session :
              {finition === "MAT" ? (
                <>
                  <ChampEx valeur={taille.exMat} onChange={changerTaille("exMat")} />
                  exactement
                </>
              ) : (
                <>
                  <ChampEx libelle="min" valeur={taille.minBrillant} onChange={changerTaille("minBrillant")} />
                  <ChampEx libelle="max" valeur={taille.maxBrillant} onChange={changerTaille("maxBrillant")} />
                </>
              )}
              {JSON.stringify(taille) !== JSON.stringify(TAILLE_DEFAUT) && (
                <button type="button" className="apercu-tauro-defaut" onClick={() => setTaille({ ...TAILLE_DEFAUT })}>
                  valeurs par défaut
                </button>
              )}
            </span>
          </div>
        )}
        {enSession && tailleInvalide && <Message warning size="small" content={tailleInvalide} />}

        {loading && <Loader active inline="centered" content="Chargement de l'aperçu…" />}
        {error && <Message negative content={error} />}

        {plan && !error && (
          <div className="apercu-tauro" style={loading ? { opacity: 0.5 } : undefined}>
            {/* 1. Ce qui part */}
            <Bloc type="part" titre="Part à l'impression">
              {enSession && sessions.length === 0 && horsSession.length === 0 && (
                <p className="apercu-tauro-vide">Aucune session : pas assez d&apos;exemplaires (voir ci-dessous).</p>
              )}
              {sessions.map((s) => (
                <div key={s.code} className="apercu-tauro-session">
                  <div className="apercu-tauro-ligne">
                    <b>{s.code}</b>
                    <span className={`apercu-tauro-fin apercu-tauro-fin--${s.fin === "BRI" ? "bri" : "mat"}`}>
                      {s.fin === "BRI" ? "Brillant" : "Mat"}
                    </span>
                    <span>
                      <b>{s.ex} ex.</b> · {pluriel(nbPdf(s), "PDF")}
                      {nbTeinteMasse(s) > 0 && ` + ${nbTeinteMasse(s)} teinte${nbTeinteMasse(s) > 1 ? "s" : ""} masse`} · n°{" "}
                      {n3(s.depart)} → {n3(s.dernier)}
                    </span>
                  </div>
                  <div className="apercu-tauro-detail">{resumeFormats(s.jobs ?? [])}</div>
                  <NomsPdf
                    noms={dansOrdreImpression(s.jobs ?? []).map((j) =>
                      j.teinteMasse ? `${j.nom} (teinte masse, sans PDF)` : j.nom,
                    )}
                  />
                </div>
              ))}
              {!enSession && horsSession.length > 0 && (
                <div className="apercu-tauro-session">
                  <div className="apercu-tauro-ligne">
                    <b>{pluriel(horsSession.length, "PDF")}</b>
                    <span>
                      sous leur nom d&apos;origine · {horsSession.reduce((t, h) => t + (Number(h.ex) || 0), 0)} ex.
                    </span>
                  </div>
                  <NomsPdf noms={horsSession.map((h) => h.nom)} />
                </div>
              )}
              {!enSession && horsSession.length === 0 && <p className="apercu-tauro-vide">Aucun PDF à lancer.</p>}
              {sansPdf.length > 0 && (
                <div className="apercu-tauro-detail">
                  + {pluriel(sansPdf.length, "job")} sans PDF ({enSession ? "stock" : "teinte masse, stock"}), hors comptage : {listeDossiers(sansPdf)}
                </div>
              )}
            </Bloc>

            {/* 2. Ce qui reste dans la file */}
            {(restants.length > 0 || ignores.length > 0) && (
              <Bloc type="reste" titre="Reste dans la file">
                {regrouperParMotif(restants).map((g) => (
                  <div key={g.motif} className="apercu-tauro-session">
                    <div className="apercu-tauro-ligne">
                      <b>{g.ex} ex.</b>
                      <span>
                        {pluriel(g.jobs, "job")} · {g.motif}
                      </span>
                    </div>
                    <div className="apercu-tauro-detail">Dossiers : {g.dossiers}</div>
                  </div>
                ))}
                {ignores.length > 0 && (
                  <div className="apercu-tauro-session">
                    <div className="apercu-tauro-ligne">
                      <b>{ignores.reduce((t, r) => t + (Number(r.ex) || 0), 0)} ex.</b>
                      <span>
                        {autreFinition} ({pluriel(ignores.length, "job")}) · un lancement ne porte qu&apos;une finition :
                        choisir « {autreFinition} » pour les lancer
                      </span>
                    </div>
                    <div className="apercu-tauro-detail">Dossiers : {listeDossiers(ignores)}</div>
                  </div>
                )}
              </Bloc>
            )}

            {/* 3. À vérifier */}
            {(bloques.length > 0 || alertes.length > 0) && (
              <Bloc type="verif" titre="À vérifier">
                {bloques.length > 0 && (
                  <ul className="apercu-tauro-bloques">
                    {bloques.map((r) => {
                      const texte = `${r.cle?.startsWith("id:") ? r.cmd : r.cle} — ${blocageCourt(r.raison)}`;
                      return (
                        <li key={r.id}>
                          {/* Seul un « déjà lancé » se confirme ; les autres blocages ne se relancent pas. */}
                          {String(r.raison || "").startsWith("déjà lancé") ? (
                            <Checkbox
                              label={`Relancer ${texte}`}
                              checked={relancer.includes(r.cle)}
                              onChange={(e, { checked }) => toggleRelancer(r.cle, checked)}
                            />
                          ) : (
                            texte
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {alertes.length > 0 && (
                  <ul className="apercu-tauro-infos">
                    {alertes.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </Bloc>
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
          disabled={
            loading ||
            !plan ||
            !!error ||
            !aLancer ||
            (enSession && (!!tailleInvalide || plan.finition !== finition || JSON.stringify(plan.taille) !== tailleKey))
          }
          onClick={() =>
            onLance(
              {
                mode,
                finition: enSession ? finition : undefined,
                taille: enSession ? taille : undefined,
                relancer,
                empreinte: plan.empreinte,
              },
              ids,
            )
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
  tailleInitiale: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onLance: PropTypes.func.isRequired,
};

export default ApercuSessionTauro;
