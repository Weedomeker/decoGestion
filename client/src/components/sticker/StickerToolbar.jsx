import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { Button, Popup } from "semantic-ui-react";
import { API_BASE } from "../../utils/api";
import { elementParDefaut } from "./geometrie";

export function IconePicto({ picto, couleur = "currentColor", taille = 22 }) {
  const [vw, vh] = picto.viewBox;
  const c = (v) => (v === "couleur" ? couleur : v === "#FFFFFF" ? "var(--bg-elevated)" : v);
  return (
    <svg width={taille} height={taille} viewBox={`-4 -4 ${vw + 8} ${vh + 8}`} aria-hidden="true">
      {picto.couches.map((k, i) => (
        <path
          key={i}
          d={k.d}
          fill={k.fill ? c(k.fill) : "none"}
          stroke={k.stroke ? c(k.stroke) : "none"}
          strokeWidth={k.stroke ? k.largeur || 1 : 0}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
IconePicto.propTypes = { picto: PropTypes.object.isRequired, couleur: PropTypes.string, taille: PropTypes.number };

function StickerToolbar({
  pictos,
  jetons,
  images,
  onAjouter,
  onImporterImage,
  importEnCours,
  selection,
  onDupliquer,
  onPlan,
  onSupprimer,
  onAnnuler,
  onRetablir,
  peutAnnuler,
  peutRetablir,
}) {
  const [pictosOuvert, setPictosOuvert] = useState(false);
  const [imagesOuvert, setImagesOuvert] = useState(false);
  const [menu, setMenu] = useState(null); // "champ" | "forme"
  const fichierRef = useRef(null);

  const categories = [...new Set(pictos.map((p) => p.categorie))];

  const ajouterImage = (img) => {
    const ratio = img.largeur && img.hauteur ? img.hauteur / img.largeur : 0.5;
    const l = ratio > 1 ? 30 / ratio : 30;
    onAjouter(elementParDefaut("image", { imageId: img._id, l, h: l * ratio, x: (105 - l) / 2 }));
    setImagesOuvert(false);
  };

  const choisirFichier = async (ev) => {
    const fichier = ev.target.files?.[0];
    ev.target.value = "";
    if (!fichier) return;
    const img = await onImporterImage(fichier);
    if (img) ajouterImage(img);
  };

  return (
    <div className="sk-toolbar" role="toolbar" aria-label="Outils de l'étiquette">
      <div className="sk-toolbar__groupe">
        <Button size="small" icon="font" content="Texte" onClick={() => onAjouter(elementParDefaut("texte"))} />
        <Popup
          on="click"
          open={menu === "champ"}
          onOpen={() => setMenu("champ")}
          onClose={() => setMenu(null)}
          position="bottom left"
          className="sk-popup"
          trigger={<Button size="small" icon="magic" content="Champ auto" />}
        >
          <div className="sk-menu">
            {jetons.map((j) => (
              <button
                key={j.cle}
                type="button"
                className="sk-menu__item"
                onClick={() => {
                  const infos = j.cle === "infos";
                  onAjouter(
                    elementParDefaut("texte", {
                      contenu: `{${j.cle}}`,
                      taille: infos ? 10 : 14,
                      police: infos ? "regular" : "bold",
                      l: infos ? 95 : 60,
                      x: infos ? 5 : 22.5,
                    }),
                  );
                  setMenu(null);
                }}
              >
                <span>{j.libelle}</span>
                <em>{j.exemple}</em>
              </button>
            ))}
          </div>
        </Popup>
        <Popup
          on="click"
          open={pictosOuvert}
          onOpen={() => setPictosOuvert(true)}
          onClose={() => setPictosOuvert(false)}
          position="bottom left"
          className="sk-popup"
          trigger={<Button size="small" icon="exclamation triangle" content="Picto" />}
        >
          {categories.map((cat) => (
            <div key={cat} className="sk-galerie">
              <div className="sk-galerie__titre">{cat}</div>
              <div className="sk-galerie__grille">
                {pictos
                  .filter((p) => p.categorie === cat)
                  .map((p) => (
                    <button
                      key={p.cle}
                      type="button"
                      className="sk-galerie__item"
                      title={p.nom}
                      onClick={() => {
                        const [vw, vh] = p.viewBox;
                        const h = 16;
                        onAjouter(elementParDefaut("picto", { cle: p.cle, l: (h * vw) / vh, h, x: 52.5 - (h * vw) / vh / 2 }));
                        setPictosOuvert(false);
                      }}
                    >
                      <IconePicto picto={p} taille={28} />
                      <span>{p.nom}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </Popup>
        <Popup
          on="click"
          open={imagesOuvert}
          onOpen={() => setImagesOuvert(true)}
          onClose={() => setImagesOuvert(false)}
          position="bottom left"
          className="sk-popup"
          trigger={<Button size="small" icon="image outline" content="Logo / image" />}
        >
          <div className="sk-galerie">
            <div className="sk-galerie__titre">Images enregistrées</div>
            {images.length === 0 && <div className="sk-galerie__vide">Aucune image importée</div>}
            <div className="sk-galerie__grille sk-galerie__grille--images">
              {images.map((img) => (
                <button key={img._id} type="button" className="sk-galerie__item" title={img.nom} onClick={() => ajouterImage(img)}>
                  <img src={`${API_BASE}/sticker_images/${img._id}`} alt="" />
                  <span>{img.nom}</span>
                </button>
              ))}
            </div>
            <input ref={fichierRef} type="file" accept="image/png,image/jpeg" hidden onChange={choisirFichier} />
            <Button
              size="small"
              fluid
              icon="upload"
              content="Importer un PNG / JPG…"
              loading={importEnCours}
              disabled={importEnCours}
              onClick={() => fichierRef.current?.click()}
            />
          </div>
        </Popup>
        <Button size="small" icon="file image outline" content="Miniature" onClick={() => onAjouter(elementParDefaut("miniature"))} />
        <Popup
          on="click"
          open={menu === "forme"}
          onOpen={() => setMenu("forme")}
          onClose={() => setMenu(null)}
          position="bottom left"
          className="sk-popup"
          trigger={<Button size="small" icon="square outline" content="Forme" />}
        >
          <div className="sk-menu">
            {[
              ["rect", "Cadre / rectangle"],
              ["ligne", "Ligne"],
              ["bandes", "Bandes de signalisation"],
            ].map(([forme, libelle]) => (
              <button
                key={forme}
                type="button"
                className="sk-menu__item"
                onClick={() => {
                  onAjouter(elementParDefaut("forme", { forme, ...(forme === "bandes" ? { couleur: "#E30613" } : {}) }));
                  setMenu(null);
                }}
              >
                <span>{libelle}</span>
              </button>
            ))}
          </div>
        </Popup>
      </div>
      <div className="sk-toolbar__groupe">
        <Button.Group size="small" basic>
          <Button icon="undo" title="Annuler (Ctrl+Z)" aria-label="Annuler" disabled={!peutAnnuler} onClick={onAnnuler} />
          <Button icon="redo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir" disabled={!peutRetablir} onClick={onRetablir} />
        </Button.Group>
        <Button.Group size="small" basic>
          <Button icon="clone outline" title="Dupliquer (Ctrl+D)" aria-label="Dupliquer" disabled={!selection} onClick={onDupliquer} />
          <Button icon="arrow up" title="Premier plan" aria-label="Premier plan" disabled={!selection} onClick={() => onPlan("avant")} />
          <Button icon="arrow down" title="Arrière-plan" aria-label="Arrière-plan" disabled={!selection} onClick={() => onPlan("arriere")} />
          <Button icon="trash alternate outline" title="Supprimer (Suppr)" aria-label="Supprimer" disabled={!selection} onClick={onSupprimer} />
        </Button.Group>
      </div>
    </div>
  );
}

StickerToolbar.propTypes = {
  pictos: PropTypes.arrayOf(PropTypes.object).isRequired,
  jetons: PropTypes.arrayOf(PropTypes.object).isRequired,
  images: PropTypes.arrayOf(PropTypes.object).isRequired,
  onAjouter: PropTypes.func.isRequired,
  onImporterImage: PropTypes.func.isRequired,
  importEnCours: PropTypes.bool,
  selection: PropTypes.string,
  onDupliquer: PropTypes.func.isRequired,
  onPlan: PropTypes.func.isRequired,
  onSupprimer: PropTypes.func.isRequired,
  onAnnuler: PropTypes.func.isRequired,
  onRetablir: PropTypes.func.isRequired,
  peutAnnuler: PropTypes.bool,
  peutRetablir: PropTypes.bool,
};

export default StickerToolbar;
