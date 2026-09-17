import PropTypes from "prop-types";

function Footer({ active }) {
  if (!active) return null;
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
}
Footer.propTypes = {
  active: PropTypes.bool.isRequired,
};
export default Footer;
