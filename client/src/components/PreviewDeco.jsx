import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Image } from "semantic-ui-react";
import { API_BASE } from "../utils/api";

function extractReference(filename) {
  const match = filename.match(/\b\d{7,}\b/) || filename.match(/[A-Z]+-\d+/i);
  if (match && match[0] !== "00000000") return match[0];
}

function extractFormat(filename) {
  const isCredence = filename.match(/\b\d{3}x\d{2}\b/i);
  const format = filename.match(/\b\d{3}x\d{3}\b/i);
  return isCredence ? { isCredence: true, format: isCredence[0] } : { isCredence: false, format: format?.[0] };
}

function PreviewDeco({ fileSelected, show }) {
  const [previewList, setPreviewList] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/path`)
      .then((res) => res.json())
      .then((data) => {
        if (data[0].Preview) setPreviewList(data[0].Preview);
      })
      .catch((err) => console.error("Erreur preview:", err));
  }, []);

  useEffect(() => {
    if (!fileSelected || previewList.length === 0) return;
    const filename = fileSelected.split("/").pop();
    const name = filename.replace(".pdf", "");
    const reference = extractReference(filename);

    const matched = reference
      ? previewList.find((e) => e.name.includes(reference))
      : previewList.find((e) => e.name.replace(".jpg", "") === name);

    setImageUrl(matched ? `${API_BASE}/${matched.path.split("\\").slice(1).join("/")}` : null);
  }, [fileSelected, previewList]);

  if (!fileSelected || !show || !imageUrl) {
    return (
      <div className="preview-empty">
        <p>Aucune image</p>
      </div>
    );
  }

  const fname = fileSelected.split("/").pop() ?? "";
  const { isCredence } = extractFormat(imageUrl);

  return (
    <div className="preview-c">
      <div className="preview-c-top">
        <span className="preview-c-label">Preview</span>
      </div>
      <div className="preview-c-image">
        <Image src={imageUrl} alt="Aperçu déco" style={{ transform: isCredence ? "rotate(90deg)" : undefined }} />
      </div>
      <div className="preview-c-bottom">
        <span className="preview-c-fname">{fname.replace(".pdf", ".jpg")}</span>
      </div>
    </div>
  );
}

PreviewDeco.propTypes = {
  fileSelected: PropTypes.string,
  show: PropTypes.bool,
};

export default PreviewDeco;
