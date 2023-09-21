import PropTypes from 'prop-types';

function Footer({ active, timePdf, timeJpg }) {
  if (active) {
    return (
      <div className="footer">
        <h4>deco-k-in.com</h4>
        <p>
          Panneau mural décoratif - Tel : +33 (0)3 20 68 99 70
          <br />
          14, rue du Haut de la Cruppe 59650 VILLENEUVE D&apos;ASCQ France
        </p>
      </div>
    );
  } else {
    return (
      <div className="footer">
        <p>
          Pdf completed: {timePdf} secs - Jpg completed: {timeJpg} secs.
        </p>
      </div>
    );
  }
}
Footer.propTypes = {
  active: PropTypes.bool.isRequired,
  timePdf: PropTypes.number,
  timeJpg: PropTypes.number,
};
export default Footer;
