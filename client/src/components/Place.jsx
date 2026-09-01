/* eslint-disable no-unused-vars */
import { StandaloneSearchBox, useJsApiLoader } from "@react-google-maps/api";
import PropTypes from "prop-types";
import { useRef, useState } from "react";

const Place = ({ value, onValue, enabled }) => {
  const [libraries] = useState(["places"]);
  const inputRef = useRef();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_API_GOOGLE,
    libraries,
    language: "fr",
    region: "fr",
  });
  const handlePlaceChanged = () => {
    const [place] = inputRef.current.getPlaces();
  };

  const plainInput = (
    <input
      disabled={!enabled}
      type="text"
      name="ville"
      id="ville"
      placeholder="VILLE / MAG"
      value={value || ""}
      onChange={(e) => {
        onValue(e.target.value);
      }}
    />
  );

  if (loadError) {
    return (
      <>
        {plainInput}
        <span className="field-error-msg">Autocomplétion Google indisponible — saisie libre activée</span>
      </>
    );
  }

  return isLoaded ? (
    <StandaloneSearchBox onLoad={(ref) => (inputRef.current = ref)} onPlacesChanged={handlePlaceChanged}>
      {plainInput}
    </StandaloneSearchBox>
  ) : (
    plainInput
  );
};

Place.propTypes = {
  value: PropTypes.string,
  onValue: PropTypes.func,
  enabled: PropTypes.bool,
};

export default Place;
