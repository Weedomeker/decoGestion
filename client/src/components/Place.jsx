/* eslint-disable no-unused-vars */
import { useRef, useState } from 'react';
import { StandaloneSearchBox, useJsApiLoader } from '@react-google-maps/api';

const Place = () => {
  const [libraries] = useState(['places']);
  const inputRef = useRef();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_API_GOOGLE,
    libraries,
    language: 'fr',
    region: 'fr',
  });
  const handlePlaceChanged = () => {
    const [place] = inputRef.current.getPlaces();
  };

  return (
    isLoaded && (
      <StandaloneSearchBox onLoad={(ref) => (inputRef.current = ref)} onPlacesChanged={handlePlaceChanged}>
        <input type="text" name="ville" id="ville" placeholder="VILLE / MAG" />
      </StandaloneSearchBox>
    )
  );
};

export default Place;
