import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Image } from "semantic-ui-react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function PreviewDeco({ fileSelected, show, client }) {
  const [previewList, setPreviewList] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/path`)
      .then((res) => res.json())
      .then((data) => {
        if (data[0].Preview) setPreviewList(data[0].Preview);
      })
      .catch((err) => console.error("Erreur preview:", err));
  }, []);

  const extractReference = (filename) => {
    const match = filename.match(/\b\d{7,}\b/);
    return match ? match[0] : null;
  };

  // 🔹 4. Chercher le bon visuel
  useEffect(() => {
    if (!fileSelected || previewList.length === 0) return;

    const filename = fileSelected.split("/").pop();
    const name = filename.replace(".pdf", "");
    const reference = extractReference(filename);

    let matched;

    if (reference) {
      matched = previewList.find((entry) => entry.name.includes(reference));
    } else {
      matched = previewList.find((entry) => entry.name.replace(".jpg", "") === name);
    }

    if (matched) {
      setImageUrl(`http://${HOST}:${PORT}/${matched.path.split("\\").slice(1).join("/")}`);
    } else {
      setImageUrl(null);
      console.warn("Aucune image trouvée pour :", filename);
    }
  }, [fileSelected, previewList]);

  if (!fileSelected || !show || !imageUrl) return null;

  return (
    <div className="pdf-container">
      {/* style rotation if reference is not null */}
      <Image
        src={imageUrl}
        alt="Aperçu déco"
        rounded
        style={{ transform: client === "CASTO" || client === "BRICO" ? "rotate(90deg)" : undefined }}
      />
    </div>
  );
}

PreviewDeco.propTypes = {
  fileSelected: PropTypes.string,
  show: PropTypes.bool,
  client: PropTypes.string,
};

export default PreviewDeco;
