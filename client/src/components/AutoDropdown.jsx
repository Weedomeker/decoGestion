import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import { Dropdown } from "semantic-ui-react";
import { placerMenu } from "../utils/placementMenu";

const STYLES_POSES = ["top", "bottom", "right", "left", "minWidth", "maxWidth", "maxHeight"];

// Un ancêtre avec transform, filter, perspective, contain ou will-change devient le repère
// de la position fixe (ex. la modale Semantic) : on retranche sa position.
function origineFixe(el) {
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const c = getComputedStyle(p);
    if (
      c.transform !== "none" ||
      c.filter !== "none" ||
      c.perspective !== "none" ||
      (c.backdropFilter && c.backdropFilter !== "none") ||
      /paint|layout|strict|content/.test(c.contain) ||
      /transform|filter|perspective/.test(c.willChange)
    ) {
      const r = p.getBoundingClientRect();
      return { x: r.left + p.clientLeft, y: r.top + p.clientTop, h: p.clientHeight };
    }
  }
  return { x: 0, y: 0, h: 0 };
}

/**
 * Dropdown Semantic dont le menu ouvert est posé au-dessus de toute la page
 * (position fixe calculée par placerMenu). Il n'est plus rogné par un tableau,
 * un panneau qui défile ou le footer ; il suit son champ quand on fait défiler
 * ou qu'on redimensionne la fenêtre, et s'ouvre vers le haut si la place manque.
 */
function AutoDropdown({ onOpen, onClose, upward, className, ...props }) {
  const upwardRef = useRef(upward);
  upwardRef.current = upward;

  // Gestionnaires créés une seule fois : add/removeEventListener doivent recevoir la même fonction.
  const ctl = useRef(null);
  if (!ctl.current) {
    const etat = { el: null, raf: 0 };
    const menuDe = (el) => el?.querySelector(":scope > .menu");

    const placer = () => {
      const menu = menuDe(etat.el);
      if (!menu) return;
      const r = etat.el.getBoundingClientRect();
      const p = placerMenu({
        declencheur: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
        fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
        hauteurContenu: menu.scrollHeight, // hauteur complète, même si la liste est plafonnée
      });
      // upward explicite de l'appelant : il gagne sur le calcul
      const force = upwardRef.current;
      const versLeHaut = force === true || (force !== false && p.versLeHaut);
      const o = origineFixe(etat.el);
      const hauteurRepere = o.h || window.innerHeight;
      // jamais hors de l'écran : la hauteur ne dépasse pas la place du côté choisi (upward forcé compris)
      const place = versLeHaut ? r.top - 8 : window.innerHeight - r.bottom - 8;
      const hauteurMax = Math.max(0, Math.min(p.hauteurMax, place));
      Object.assign(menu.style, {
        // vers le haut : ancré par le bas sur le haut du champ, il reste collé quand la liste filtrée rétrécit
        top: versLeHaut ? "auto" : `${r.bottom - o.y}px`,
        bottom: versLeHaut ? `${hauteurRepere - (r.top - o.y)}px` : "auto",
        right: "auto",
        left: `${p.left - o.x}px`,
        minWidth: `${p.minLargeur}px`,
        maxWidth: `${p.maxLargeur}px`,
        maxHeight: `${hauteurMax}px`,
      });
    };

    const planifier = (e) => {
      // défilement de la liste elle-même : rien à recalculer
      if (e?.type === "scroll" && etat.el?.contains(e.target)) return;
      cancelAnimationFrame(etat.raf);
      etat.raf = requestAnimationFrame(placer);
    };

    const arreter = () => {
      window.removeEventListener("scroll", planifier, true);
      window.removeEventListener("resize", planifier);
      cancelAnimationFrame(etat.raf);
      const menu = menuDe(etat.el);
      if (menu) STYLES_POSES.forEach((k) => (menu.style[k] = ""));
      etat.el = null;
    };

    const demarrer = (el) => {
      arreter();
      etat.el = el;
      window.addEventListener("scroll", planifier, true);
      window.addEventListener("resize", planifier);
      planifier(); // le menu devient visible au rendu suivant
    };

    ctl.current = { demarrer, arreter };
  }

  useEffect(() => ctl.current.arreter, []);

  // Semantic ouvre aussi le menu sans événement (focus clavier, saisie dans une recherche) :
  // l'élément vient de la ref interne du Dropdown, pas de e.target.
  const dropdownRef = useRef(null);

  const handleOpen = (e, data) => {
    const el = dropdownRef.current?.ref?.current ?? e?.target?.closest?.(".ui.dropdown");
    if (el) ctl.current.demarrer(el);
    onOpen?.(e, data);
  };

  const handleClose = (e, data) => {
    ctl.current.arreter();
    onClose?.(e, data);
  };

  return (
    <Dropdown
      {...props}
      ref={dropdownRef}
      onOpen={handleOpen}
      onClose={handleClose}
      className={[className, "auto-dropdown--fixe"].filter(Boolean).join(" ")}
    />
  );
}

AutoDropdown.propTypes = {
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
  upward: PropTypes.bool,
  className: PropTypes.string,
};

export default AutoDropdown;
