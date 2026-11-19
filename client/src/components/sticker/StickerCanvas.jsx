import PropTypes from "prop-types";
import { useRef } from "react";
import { API_BASE } from "../../utils/api";
import { ASCENDANT, PAGE, PT, cheminBandes, mesurerTexte, remplacerJetons, tailleAjustee } from "./geometrie";

const POIGNEES = ["nw", "ne", "sw", "se"];
const TAILLE_POIGNEE = 2.2; // mm
const MIN = 1; // mm, taille minimale d'un cadre

const arrondir = (v, pas) => Math.round(v / pas) * pas;

function Texte({ e, donnees }) {
  const lignes = remplacerJetons(e.contenu, donnees).split("\n");
  const taille = e.ajuster ? tailleAjustee(lignes, (l, t) => mesurerTexte(l, t, e.police), e.taille, e.l / PT) : e.taille;
  const ancre = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
  const x = e.align === "center" ? e.x + e.l / 2 : e.align === "right" ? e.x + e.l : e.x;
  return (
    <text
      fontFamily="Helvetica, Arial, sans-serif"
      fontWeight={e.police === "regular" ? 400 : 700}
      fontSize={taille * PT}
      fill={e.couleur}
      textAnchor={ancre}
      style={{ whiteSpace: "pre" }}
    >
      {lignes.map((ligne, i) => (
        <tspan key={i} x={x} y={e.y + (i * taille * (e.interligne || 1.15) + taille * ASCENDANT) * PT}>
          {ligne}
        </tspan>
      ))}
    </text>
  );
}
Texte.propTypes = { e: PropTypes.object.isRequired, donnees: PropTypes.object };

function Picto({ e, picto }) {
  if (!picto) return <Remplacant e={e} libelle="Picto ?" />;
  const [vw, vh] = picto.viewBox;
  const s = Math.min(e.l / vw, e.h / vh);
  const gauche = e.x + (e.l - vw * s) / 2;
  const haut = e.y + (e.h - vh * s) / 2;
  const couleur = (v) => (v === "couleur" ? e.couleur : v);
  return (
    <g transform={`translate(${gauche} ${haut}) scale(${s})`}>
      {picto.couches.map((c, i) => (
        <path
          key={i}
          d={c.d}
          fill={c.fill ? couleur(c.fill) : "none"}
          stroke={c.stroke ? couleur(c.stroke) : "none"}
          strokeWidth={c.stroke ? c.largeur || 1 : 0}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}
Picto.propTypes = { e: PropTypes.object.isRequired, picto: PropTypes.object };

function Remplacant({ e, libelle }) {
  return (
    <g className="sk-remplacant">
      <rect x={e.x} y={e.y} width={e.l} height={e.h} />
      <text x={e.x + e.l / 2} y={e.y + e.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(3.2, e.h * 0.5)}>
        {libelle}
      </text>
    </g>
  );
}
Remplacant.propTypes = { e: PropTypes.object.isRequired, libelle: PropTypes.string };

// Miniature tournée dans son cadre : -90 (PDF, sens horaire) = rotate(90) en SVG.
function Miniature({ e, url }) {
  if (!url) return <Remplacant e={e} libelle="Miniature du visuel" />;
  const tourne = e.orientationImage === 90 || e.orientationImage === -90;
  const cx = e.x + e.l / 2;
  const cy = e.y + e.h / 2;
  const l = tourne ? e.h : e.l;
  const h = tourne ? e.l : e.h;
  return (
    <image
      href={url}
      x={cx - l / 2}
      y={cy - h / 2}
      width={l}
      height={h}
      preserveAspectRatio="xMidYMid meet"
      transform={tourne ? `rotate(${-e.orientationImage} ${cx} ${cy})` : undefined}
    />
  );
}
Miniature.propTypes = { e: PropTypes.object.isRequired, url: PropTypes.string };

function Forme({ e }) {
  if (e.forme === "bandes") return <path d={cheminBandes(e)} fill={e.couleur} />;
  if (e.forme === "ligne") {
    const y = e.y + e.h / 2;
    return <line x1={e.x} x2={e.x + e.l} y1={y} y2={y} stroke={e.couleur} strokeWidth={Math.max(e.epaisseur, 0.05)} />;
  }
  return (
    <rect
      x={e.x}
      y={e.y}
      width={e.l}
      height={e.h}
      fill={e.fond || "none"}
      stroke={e.epaisseur > 0 ? e.couleur : "none"}
      strokeWidth={e.epaisseur}
    />
  );
}
Forme.propTypes = { e: PropTypes.object.isRequired };

function Element({ e, donnees, pictos }) {
  switch (e.type) {
    case "texte":
      return <Texte e={e} donnees={donnees} />;
    case "picto":
      return <Picto e={e} picto={pictos[e.cle]} />;
    case "image":
      return e.imageId ? (
        <image
          href={`${API_BASE}/sticker_images/${e.imageId}`}
          x={e.x}
          y={e.y}
          width={e.l}
          height={e.h}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <Remplacant e={e} libelle="Image" />
      );
    case "miniature":
      // Fichier importé : data URL telle quelle ; aperçu du serveur : chemin relatif à l'API
      return (
        <Miniature
          e={e}
          url={
            donnees?.miniatureUrl
              ? donnees.miniatureUrl.startsWith("data:")
                ? donnees.miniatureUrl
                : `${API_BASE}${donnees.miniatureUrl}`
              : null
          }
        />
      );
    case "forme":
      return <Forme e={e} />;
    default:
      return null;
  }
}
Element.propTypes = { e: PropTypes.object.isRequired, donnees: PropTypes.object, pictos: PropTypes.object };

function StickerCanvas({ elements, selection, onSelect, onModifier, onMemoriser, pictos, donnees, apercuImpression }) {
  const svgRef = useRef(null);
  const glisser = useRef(null);

  const versMm = (ev) => {
    const svg = svgRef.current;
    const p = svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };

  const commencer = (ev, e, mode) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    onSelect(e.id);
    if (e.verrou && mode === "deplacer") return;
    const p = versMm(ev);
    glisser.current = { id: e.id, mode, depart: { x: p.x, y: p.y }, origine: { ...e }, memorise: false };
    try {
      svgRef.current.setPointerCapture(ev.pointerId);
    } catch {
      /* pointeur déjà relâché : le glisser suit quand même la souris sur le canevas */
    }
  };

  const bouger = (ev) => {
    const g = glisser.current;
    if (!g) return;
    const p = versMm(ev);
    let dx = p.x - g.depart.x;
    let dy = p.y - g.depart.y;
    if (!g.memorise) {
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return; // simple clic : pas d'entrée d'historique
      onMemoriser();
      g.memorise = true;
    }
    const pas = ev.altKey ? 0.1 : 0.5;
    const o = g.origine;
    if (g.mode === "deplacer") {
      onModifier(g.id, { x: arrondir(o.x + dx, pas), y: arrondir(o.y + dy, pas) }, false);
      return;
    }
    // Redimensionnement dans le repère de l'élément (s'il est tourné).
    const r = (-(o.rotation || 0) * Math.PI) / 180;
    [dx, dy] = [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
    let { x, y, l, h } = o;
    if (g.mode.includes("e")) l = Math.max(MIN, o.l + dx);
    if (g.mode.includes("s")) h = Math.max(MIN, o.h + dy);
    if (g.mode.includes("w")) {
      l = Math.max(MIN, o.l - dx);
      x = o.x + o.l - l;
    }
    if (g.mode.includes("n")) {
      h = Math.max(MIN, o.h - dy);
      y = o.y + o.h - h;
    }
    // Maj : garde les proportions (pictos, logos)
    if (ev.shiftKey && o.l > 0 && o.h > 0) {
      const ratio = o.l / o.h;
      if (l / h > ratio) h = l / ratio;
      else l = h * ratio;
      if (g.mode.includes("w")) x = o.x + o.l - l;
      if (g.mode.includes("n")) y = o.y + o.h - h;
    }
    onModifier(g.id, { x: arrondir(x, pas), y: arrondir(y, pas), l: arrondir(l, pas), h: arrondir(h, pas) }, false);
  };

  const finir = (ev) => {
    if (glisser.current && svgRef.current?.hasPointerCapture(ev.pointerId)) {
      svgRef.current.releasePointerCapture(ev.pointerId);
    }
    glisser.current = null;
  };

  const choisi = elements.find((e) => e.id === selection);

  return (
    <svg
      ref={svgRef}
      className={`sk-canvas${apercuImpression ? " sk-canvas--impression" : ""}`}
      viewBox={`-4 -4 ${PAGE.l + 8} ${PAGE.h + 8}`}
      onPointerDown={() => onSelect(null)}
      onPointerMove={bouger}
      onPointerUp={finir}
      onPointerCancel={finir}
      role="application"
      aria-label="Étiquette A6 éditable"
    >
      <rect className="sk-page" x={0} y={0} width={PAGE.l} height={PAGE.h} />
      <clipPath id="sk-page-clip">
        <rect x={0} y={0} width={PAGE.l} height={PAGE.h} />
      </clipPath>
      <g clipPath="url(#sk-page-clip)">
        {elements.map((e) => {
          const cx = e.x + e.l / 2;
          const cy = e.y + e.h / 2;
          return (
            <g key={e.id} transform={e.rotation ? `rotate(${e.rotation} ${cx} ${cy})` : undefined}>
              <Element e={e} donnees={donnees} pictos={pictos} />
              <rect
                className={`sk-hit${e.verrou ? " sk-hit--verrou" : ""}`}
                x={e.x}
                y={e.y}
                width={e.l}
                height={e.h}
                onPointerDown={(ev) => commencer(ev, e, "deplacer")}
              />
            </g>
          );
        })}
      </g>
      {choisi && (
        <g
          transform={
            choisi.rotation
              ? `rotate(${choisi.rotation} ${choisi.x + choisi.l / 2} ${choisi.y + choisi.h / 2})`
              : undefined
          }
        >
          <rect className="sk-selection" x={choisi.x} y={choisi.y} width={choisi.l} height={choisi.h} />
          {!choisi.verrou &&
            POIGNEES.map((m) => (
              <rect
                key={m}
                className={`sk-poignee sk-poignee--${m}`}
                x={(m.includes("w") ? choisi.x : choisi.x + choisi.l) - TAILLE_POIGNEE / 2}
                y={(m.includes("n") ? choisi.y : choisi.y + choisi.h) - TAILLE_POIGNEE / 2}
                width={TAILLE_POIGNEE}
                height={TAILLE_POIGNEE}
                onPointerDown={(ev) => commencer(ev, choisi, m)}
              />
            ))}
        </g>
      )}
    </svg>
  );
}

StickerCanvas.propTypes = {
  elements: PropTypes.arrayOf(PropTypes.object).isRequired,
  selection: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onModifier: PropTypes.func.isRequired,
  onMemoriser: PropTypes.func.isRequired,
  pictos: PropTypes.object.isRequired,
  donnees: PropTypes.object,
  apercuImpression: PropTypes.bool,
};

export default StickerCanvas;
