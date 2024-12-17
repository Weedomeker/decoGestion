import PropTypes from 'prop-types';
import { Image } from 'semantic-ui-react';
import logo from '../images/logo_deco_noir.svg';
const Header = ({ appVersion }) => {
  const textSliced = appVersion && appVersion.split(' ').slice(0, 8).join(' ');
  const numVersion = appVersion && appVersion.match(/\d/g).join('.');
  const textFinal = (
    <p
      style={{
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: '10px',
        color: 'grey',
        marginTop: '14px',
      }}
    >
      {textSliced}
      <text
        style={{
          color: 'green',
          fontSize: '11px',
        }}
      >
        {numVersion}
      </text>
      {')'}
    </p>
  );
  return (
    <div className="header">
      <Image src={logo} />
      {textFinal}
    </div>
  );
};

Header.propTypes = {
  appVersion: PropTypes.string,
};

export default Header;
