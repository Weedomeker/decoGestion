import PropTypes from "prop-types";
import { Button, Image } from "semantic-ui-react";
import logo from "../images/logo_deco_noir.svg";

const Header = ({ appVersion, onFichiers, configNode, statusNode, activeView, onViewChange, pendingCount }) => {
  const textSliced = appVersion && appVersion.split(" ").slice(0, 8).join(" ");
  const numVersion = appVersion && appVersion.match(/\d/g).join(".");

  return (
    <div className="header">
      <div className="header-brand">
        <Image src={logo} size="small" className="header-logo" />
        {numVersion && <span className="header-version">v{numVersion}</span>}
      </div>
      <div className="header-tabs">
        <button
          className={`header-tab${activeView === "form" ? " active" : ""}`}
          onClick={() => onViewChange("form")}
        >
          Formulaire
        </button>
        <button
          className={`header-tab${activeView === "jobs" ? " active" : ""}`}
          onClick={() => onViewChange("jobs")}
        >
          File
          {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
        </button>
      </div>
      <div className="header-actions">
        <Button compact icon="folder open" content="Fichiers" onClick={onFichiers} />
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
