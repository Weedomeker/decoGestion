import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Image } from "semantic-ui-react";

const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

function PreviewDeco({ fileSelected, show }) {
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
    const match = filename.match(/\b\d{7,}\b/) || filename.match(/[A-Z]+-\d+/i);
    if (match && match[0] !== "00000000") return match ? match[0] : null;
  };

  // Extraire le format et differencier type de format 3 digits x 3 digits ou 3 digits x 2 digits
  // Si 3 digits x 2 digits return isCredence true sinon false et return format
  const extractFormat = (filename) => {
    const isCredence = filename.match(/\b\d{3}x\d{2}\b/i);
    const format = filename.match(/\b\d{3}x\d{3}\b/i);
    return isCredence ? { isCredence: true, format: isCredence[0] } : { isCredence: false, format: format[0] };
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
    }
  }, [fileSelected, previewList]);

  if (!fileSelected || !show || !imageUrl)
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
        <p>Aucune image trouvée</p>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
      {/* style rotation if reference is not null */}
      <Image
        src={imageUrl}
        alt="Aperçu déco"
        rounded
        style={{ transform: extractFormat(imageUrl).isCredence ? "rotate(90deg)" : undefined }}
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
