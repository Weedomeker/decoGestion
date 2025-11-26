import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function PreviewDeco({ fileSelected, show }) {
  const [previewList, setPreviewList] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/path`)
      .then((res) => res.json())
      .then((data) => {
        if (data[0].Preview) setPreviewList(data[0].Preview);
      })
      .catch((err) => console.error('Erreur preview:', err));
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setWidth(width);
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const extractReference = (filename) => {
    const match = filename.match(/\b\d{8}\b/);
    return match ? match[0] : null;
  };

  // 🔹 4. Chercher le bon visuel
  useEffect(() => {
    if (!fileSelected || previewList.length === 0) return;

    const reference = extractReference(fileSelected.split('/').pop());

    const matched = previewList.find((entry) => entry.name.includes(reference));

    if (matched) {
      setImageUrl(`http://${HOST}:${PORT}/${matched.path.split('\\').slice(1).join('/')}`);
    } else {
      setImageUrl(null);
      console.warn('Aucune image trouvée pour :', reference);
    }
  }, [fileSelected, previewList]);

  if (!fileSelected || !show || !imageUrl) return null;

  return (
    <div className="pdf-container" ref={containerRef}>
      <img src={imageUrl} alt="Aperçu déco" style={{ width: width / 2 + 'px', transform: 'rotate(90deg)' }} />
    </div>
  );
}

PreviewDeco.propTypes = {
  fileSelected: PropTypes.string,
  show: PropTypes.bool,
};

export default PreviewDeco;
