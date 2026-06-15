import PropTypes from "prop-types";
import { Image } from "semantic-ui-react";
import logo from "../images/logo_deco_noir.svg";

const Header = ({ appVersion, onFichiers, configNode, statusNode, activeView, onViewChange, pendingCount, theme, onThemeToggle }) => {
  const numVersion = appVersion && appVersion.match(/\d/g)?.join(".");

  return (
    <div className="header">
      <div className="header-brand">
        <Image src={logo} className="header-logo" />
        {numVersion && <span className="header-version">v{numVersion}</span>}
      </div>

      <div className="header-tabs">
        <button className={`header-tab${activeView === "form" ? " active" : ""}`} onClick={() => onViewChange("form")}>
          Formulaire
        </button>
        <button className={`header-tab${activeView === "jobs" ? " active" : ""}`} onClick={() => onViewChange("jobs")}>
          File
          {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
        </button>
      </div>

      <div className="header-actions">
        <button className="header-action-btn" onClick={onThemeToggle} title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <button className="header-action-btn" onClick={onFichiers} title="Parcourir les fichiers">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Fichiers
        </button>
        {configNode}
        {statusNode}
      </div>
    </div>
  );
};

Header.propTypes = {
  appVersion: PropTypes.string,
  onFichiers: PropTypes.func,
  configNode: PropTypes.node,
  statusNode: PropTypes.node,
  activeView: PropTypes.string,
  onViewChange: PropTypes.func,
  pendingCount: PropTypes.number,
  theme: PropTypes.string,
  onThemeToggle: PropTypes.func,
};

export default Header;
