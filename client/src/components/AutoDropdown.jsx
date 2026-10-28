import PropTypes from "prop-types";
import { useState } from "react";
import { Dropdown } from "semantic-ui-react";

// Hauteur max d'un menu selection Semantic sur grand écran (~21rem)
const MENU_MAX_HEIGHT = 300;
const MENU_MIN_HEIGHT = 120;
const MARGIN = 8;

// Zone visible réelle du dropdown : viewport ∩ ancêtres qui rognent (overflow ≠ visible).
// Le footer est hors de ces conteneurs, donc un menu qui dépasse est coupé à sa hauteur.
function getVisibleBounds(el) {
  let top = 0;
  let bottom = window.innerHeight;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowY !== "visible") {
      const r = p.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}

/**
 * Dropdown Semantic qui s'ouvre vers le haut quand la place manque en bas,
 * et limite la hauteur du menu à l'espace disponible pour ne jamais être rogné.
 */
function AutoDropdown({ onOpen, upward, className, style, ...props }) {
  const [placement, setPlacement] = useState({ upward: false, maxHeight: null });

  const handleOpen = (e, data) => {
    const el = e?.target?.closest?.(".ui.dropdown");
    if (el) {
      const rect = el.getBoundingClientRect();
      const bounds = getVisibleBounds(el);
      const below = bounds.bottom - rect.bottom - MARGIN;
      const above = rect.top - bounds.top - MARGIN;
      const goUp = below < MENU_MAX_HEIGHT && above > below;
      const space = goUp ? above : below;
      setPlacement({
        upward: goUp,
        maxHeight: space < MENU_MAX_HEIGHT ? Math.max(MENU_MIN_HEIGHT, Math.floor(space)) : null,
      });
    }
    onOpen?.(e, data);
  };

  const capped = placement.maxHeight != null;

  return (
    <Dropdown
      {...props}
      upward={upward ?? placement.upward}
      onOpen={handleOpen}
      className={[className, capped && "auto-dropdown--capped"].filter(Boolean).join(" ") || undefined}
      style={capped ? { ...style, "--auto-dropdown-max-h": `${placement.maxHeight}px` } : style}
    />
  );
}

AutoDropdown.propTypes = {
  onOpen: PropTypes.func,
  upward: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default AutoDropdown;
