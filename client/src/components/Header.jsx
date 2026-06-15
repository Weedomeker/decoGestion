import PropTypes from "prop-types";
import { Image } from "semantic-ui-react";
import logo from "../images/logo_deco_noir.svg";

const Header = ({ appVersion, onFichiers, configNode, statusNode, activeView, onViewChange, pendingCount }) => {
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
};

export default Header;
