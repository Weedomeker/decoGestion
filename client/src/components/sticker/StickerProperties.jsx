import PropTypes from "prop-types";
import { Button, Checkbox } from "semantic-ui-react";
import Dropdown from "../AutoDropdown";
import { API_BASE } from "../../utils/api";
import { IconePicto } from "./StickerToolbar";
import ChoixMiniature from "./ChoixMiniature";

// Couleurs des enseignes (notices d'origine) + noir et blanc
const NUANCIER = ["#EC2027", "#E30613", "#A80933", "#000000", "#4B5260", "#FFFFFF"];

const LIBELLES = { texte: "Texte", picto: "Picto", image: "Image", miniature: "Miniature", forme: "Forme" };

function Nombre({ label, value, onChange, step = 0.5, min, max, unite = "mm" }) {
  return (
    <label className="sk-prop">
      <span>{label}</span>
      <span className="sk-prop__nombre">
        <input
          type="number"
          step={step}
          inputMode="decimal"
          min={min}
          max={max}
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ""}
          onChange={(ev) => ev.target.value !== "" && onChange(Number(ev.target.value))}
        />
        {unite && <em>{unite}</em>}
      </span>
    </label>
  );
}
Nombre.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  step: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  unite: PropTypes.string,
};

function Couleur({ label, value, onChange, aucune }) {
  return (
    <div className="sk-prop sk-prop--couleur">
      <span>{label}</span>
      <div className="sk-nuancier">
        {aucune && (
          <button
            type="button"
            className={`sk-nuance sk-nuance--aucune${!value ? " is-actif" : ""}`}
            title="Aucune"
            aria-label="Aucune couleur"
            onClick={() => onChange("")}
          />
        )}
        {NUANCIER.map((c) => (
          <button
            key={c}
            type="button"
            className={`sk-nuance${value?.toUpperCase() === c ? " is-actif" : ""}`}
            style={{ background: c }}
            title={c}
            aria-label={`Couleur ${c}`}
            onClick={() => onChange(c)}
          />
        ))}
        <input type="color" value={value || "#ffffff"} onChange={(ev) => onChange(ev.target.value.toUpperCase())} title="Autre couleur" />
      </div>
    </div>
  );
}
Couleur.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string, onChange: PropTypes.func.isRequired, aucune: PropTypes.bool };

function StickerProperties({ element: e, onModifier, pictos, images, jetons, miniatureForcee, onMiniatureForcee, miniatureUrlAuto }) {
  if (!e) {
    return (
      <div className="sk-props sk-props--vide">
        <p>Cliquez un élément de l&apos;étiquette pour le modifier.</p>
        <ul>
          <li>Glisser : déplacer (pas de 0,5 mm, Alt : 0,1 mm)</li>
          <li>Poignées : redimensionner (Maj : garder les proportions)</li>
          <li>Flèches : déplacer, Suppr : supprimer</li>
          <li>Ctrl+Z / Ctrl+Y : annuler / rétablir, Ctrl+D : dupliquer</li>
        </ul>
      </div>
    );
  }
  const set = (patch) => onModifier(e.id, patch);

  return (
    <div className="sk-props">
      <div className="sk-props__titre">{LIBELLES[e.type]}</div>

      {e.type === "texte" && (
        <>
          <label className="sk-prop sk-prop--bloc">
            <span>Contenu</span>
            <textarea rows={3} value={e.contenu} onChange={(ev) => set({ contenu: ev.target.value })} />
          </label>
          <Dropdown
            className="sk-props__jetons"
            text="Insérer un champ automatique"
            icon="magic"
            floating
            labeled
            button
            scrolling
            options={jetons.map((j) => ({ key: j.cle, value: j.cle, text: j.libelle, description: `{${j.cle}}` }))}
            value={null}
            onChange={(_, { value }) => set({ contenu: `${e.contenu}{${value}}` })}
            selectOnBlur={false}
          />
          <div className="sk-props__ligne">
            <Button.Group size="mini" basic>
              <Button active={e.police === "bold"} onClick={() => set({ police: "bold" })} content="Gras" />
              <Button active={e.police === "regular"} onClick={() => set({ police: "regular" })} content="Normal" />
            </Button.Group>
            <Button.Group size="mini" basic>
              {[
                ["left", "align left"],
                ["center", "align center"],
                ["right", "align right"],
              ].map(([a, icone]) => (
                <Button key={a} icon={icone} active={e.align === a} onClick={() => set({ align: a })} aria-label={`Aligner ${a}`} />
              ))}
            </Button.Group>
          </div>
          <div className="sk-props__grille">
            <Nombre label="Taille" value={e.taille} step={0.5} min={3} max={120} unite="pt" onChange={(v) => set({ taille: v })} />
            <Nombre label="Interligne" value={e.interligne} step={0.05} min={0.8} max={3} unite="" onChange={(v) => set({ interligne: v })} />
          </div>
          <Checkbox
            className="sk-prop"
            label="Réduire si le texte dépasse le cadre"
            checked={e.ajuster !== false}
            onChange={(_, d) => set({ ajuster: d.checked })}
          />
          <Couleur label="Couleur" value={e.couleur} onChange={(c) => set({ couleur: c || "#000000" })} />
        </>
      )}

      {e.type === "picto" && (
        <>
          <div className="sk-galerie__grille sk-galerie__grille--props">
            {pictos.map((p) => (
              <button
                key={p.cle}
                type="button"
                className={`sk-galerie__item${p.cle === e.cle ? " is-actif" : ""}`}
                title={p.nom}
                onClick={() => set({ cle: p.cle })}
              >
                <IconePicto picto={p} taille={22} />
              </button>
            ))}
          </div>
          <Couleur label="Couleur" value={e.couleur} onChange={(c) => set({ couleur: c || "#000000" })} />
        </>
      )}

      {e.type === "image" && (
        <div className="sk-galerie__grille sk-galerie__grille--images">
          {images.map((img) => (
            <button
              key={img._id}
              type="button"
              className={`sk-galerie__item${img._id === e.imageId ? " is-actif" : ""}`}
              title={img.nom}
              onClick={() => set({ imageId: img._id })}
            >
              <img src={`${API_BASE}/sticker_images/${img._id}`} alt="" />
              <span>{img.nom}</span>
            </button>
          ))}
        </div>
      )}

      {e.type === "miniature" && (
        <>
          <label className="sk-prop">
            <span>Sens de l&apos;image</span>
            <select value={e.orientationImage} onChange={(ev) => set({ orientationImage: Number(ev.target.value) })}>
              <option value={-90}>Tournée ¼ de tour à droite</option>
              <option value={0}>Droite</option>
              <option value={90}>Tournée ¼ de tour à gauche</option>
            </select>
          </label>
          <ChoixMiniature forcee={miniatureForcee} onChange={onMiniatureForcee} urlAuto={miniatureUrlAuto} />
        </>
      )}

      {e.type === "forme" && (
        <>
          <label className="sk-prop">
            <span>Forme</span>
            <select value={e.forme} onChange={(ev) => set({ forme: ev.target.value })}>
              <option value="rect">Cadre / rectangle</option>
              <option value="ligne">Ligne</option>
              <option value="bandes">Bandes de signalisation</option>
            </select>
          </label>
          <Couleur label={e.forme === "rect" ? "Bordure" : "Couleur"} value={e.couleur} onChange={(c) => set({ couleur: c || "#000000" })} />
          {e.forme === "rect" && <Couleur label="Fond" value={e.fond} aucune onChange={(c) => set({ fond: c })} />}
          {e.forme !== "bandes" ? (
            <Nombre label="Épaisseur" value={e.epaisseur} step={0.1} min={0} max={20} onChange={(v) => set({ epaisseur: v })} />
          ) : (
            <div className="sk-props__grille">
              <Nombre label="Pas" value={e.periode} step={0.1} min={0.5} max={50} onChange={(v) => set({ periode: v })} />
              <Nombre label="Bande" value={e.largeurBande} step={0.1} min={0.1} max={50} onChange={(v) => set({ largeurBande: v })} />
            </div>
          )}
        </>
      )}

      <div className="sk-props__sep">Position</div>
      <div className="sk-props__grille">
        <Nombre label="X" value={e.x} onChange={(v) => set({ x: v })} />
        <Nombre label="Y" value={e.y} onChange={(v) => set({ y: v })} />
        <Nombre label="Largeur" value={e.l} min={0.5} onChange={(v) => set({ l: Math.max(0.5, v) })} />
        <Nombre label="Hauteur" value={e.h} min={0.5} onChange={(v) => set({ h: Math.max(0.5, v) })} />
        <Nombre label="Rotation" value={e.rotation || 0} step={15} min={-360} max={360} unite="°" onChange={(v) => set({ rotation: v })} />
      </div>
      <Button
        size="mini"
        icon="arrows alternate horizontal"
        content="Centrer horizontalement"
        onClick={() => set({ x: Math.round(((105 - e.l) / 2) * 100) / 100 })}
      />
      <Checkbox
        className="sk-prop"
        label="Verrouiller (ne se déplace plus à la souris)"
        checked={Boolean(e.verrou)}
        onChange={(_, d) => set({ verrou: d.checked })}
      />
    </div>
  );
}

StickerProperties.propTypes = {
  element: PropTypes.object,
  onModifier: PropTypes.func.isRequired,
  pictos: PropTypes.arrayOf(PropTypes.object).isRequired,
  images: PropTypes.arrayOf(PropTypes.object).isRequired,
  jetons: PropTypes.arrayOf(PropTypes.object).isRequired,
  miniatureForcee: PropTypes.object,
  onMiniatureForcee: PropTypes.func.isRequired,
  miniatureUrlAuto: PropTypes.string,
};

export default StickerProperties;
