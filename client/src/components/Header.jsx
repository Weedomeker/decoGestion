import { Image } from 'semantic-ui-react';
import PropTypes from 'prop-types';

const Header = ({ appVersion }) => {
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
        {appVersion && appVersion}
      </p>
    </div>
  );
};

Header.propTypes = {
  appVersion: PropTypes.string,
};

export default Header;
