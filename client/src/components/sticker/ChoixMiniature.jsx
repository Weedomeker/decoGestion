import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "semantic-ui-react";
import { API_BASE } from "../../utils/api";

const TAILLE_MAX = 5 * 1024 * 1024;

const nomDepuisUrl = (url) => {
  try {
    return decodeURIComponent(String(url).split("/").pop());
  } catch {
    return url;
  }
};

// Image de la miniature pour cette étiquette seulement : automatique (référence du formulaire),
// un aperçu cherché par son nom (toutes enseignes), ou un fichier du poste. Jamais enregistrée
// dans le modèle : elle sert à l'aperçu PDF et à « Générer ».
function ChoixMiniature({ forcee, onChange, urlAuto }) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState([]);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState(null);
  const fichierRef = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResultats([]);
      return undefined;
    }
    const minuteur = setTimeout(async () => {
      setRecherche(true);
      try {
        const res = await fetch(`${API_BASE}/sticker_apercus?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResultats(Array.isArray(data) ? data : []);
      } catch {
        setResultats([]);
      } finally {
        setRecherche(false);
      }
    }, 250);
    return () => clearTimeout(minuteur);
  }, [q]);

  const importer = (ev) => {
    const fichier = ev.target.files?.[0];
    ev.target.value = "";
    if (!fichier) return;
    setErreur(null);
    if (!/^image\/(png|jpeg)$/.test(fichier.type)) {
      setErreur("Image PNG ou JPG attendue");
      return;
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur("Image trop lourde (5 Mo maximum)");
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => onChange({ type: "fichier", nom: fichier.name, url: lecteur.result });
    lecteur.onerror = () => setErreur("Lecture du fichier impossible");
    lecteur.readAsDataURL(fichier);
  };

  return (
    <div className="sk-mini">
      <div className="sk-props__sep">Image de la miniature</div>
      <div className="sk-mini__courante">
        <Icon name={forcee ? (forcee.type === "fichier" ? "upload" : "image outline") : "magic"} />
        <span>
          {!forcee && (urlAuto ? `Automatique : ${nomDepuisUrl(urlAuto)}` : "Automatique (aucune trouvée par la référence)")}
          {forcee?.type === "apercu" && `Aperçu : ${forcee.fichier}`}
          {forcee?.type === "fichier" && `Fichier : ${forcee.nom}`}
        </span>
      </div>
      {forcee && (
        <Button size="mini" icon="undo" content="Revenir à l'automatique" onClick={() => onChange(null)} />
      )}

      <label className="sk-prop">
        <span>Chercher un aperçu (toutes enseignes)</span>
        <input type="search" value={q} placeholder="Ex : galets 100x210" onChange={(ev) => setQ(ev.target.value)} />
      </label>
      {recherche && <div className="sk-mini__info">Recherche…</div>}
      {!recherche && q.trim().length >= 2 && resultats.length === 0 && <div className="sk-mini__info">Aucun aperçu</div>}
      {resultats.length > 0 && (
        <div className="sk-mini__resultats">
          {resultats.map((r) => (
            <button
              key={r.fichier}
              type="button"
              className={`sk-mini__item${forcee?.fichier === r.fichier ? " is-actif" : ""}`}
              title={r.fichier}
              onClick={() => onChange({ type: "apercu", fichier: r.fichier, url: r.url })}
            >
              <img src={`${API_BASE}${r.url}`} alt="" loading="lazy" />
              <span>{r.fichier.replace(/\.jpe?g$/i, "")}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={fichierRef} type="file" accept="image/png,image/jpeg" hidden onChange={importer} />
      <Button size="mini" icon="upload" content="Fichier du poste (PNG / JPG)…" onClick={() => fichierRef.current?.click()} />
      {erreur && <div className="sk-mini__info sk-mini__info--erreur">{erreur}</div>}
      <div className="sk-mini__info">Pour cette étiquette seulement : non enregistré dans le modèle.</div>
    </div>
  );
}

ChoixMiniature.propTypes = {
  forcee: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  urlAuto: PropTypes.string,
};

export default ChoixMiniature;
