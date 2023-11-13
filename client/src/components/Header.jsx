import { Image } from 'semantic-ui-react';
import PropTypes from 'prop-types';

const Header = ({ appVersion }) => {
  const app = appVersion && appVersion.replace(/(\d)/g, '$1');
  return (
    <div className="header">
      <Image src="../src/images/logo_deco_noir.svg" />
      <p
        style={{
          textAlign: 'center',
          fontFamily: 'monospace',
          textTransform: 'capitalize',
          fontSize: '10px',
          color: 'grey',
          marginTop: '14px',
        }}
      >
        {appVersion && app}
      </p>
    </div>
  );
};

Header.propTypes = {
  appVersion: PropTypes.string,
};

export default Header;
