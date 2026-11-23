import PropTypes from "prop-types";
import { Checkbox, Label } from "semantic-ui-react";
import Dropdown from "./AutoDropdown";

const cm = (mm) => String(mm / 10).replace(".", ",");

export default function SurMesurePanneau({ job, onConfirm, onChoisirPdf }) {
  const { smPanneau: panneau, smPdf, smCandidats = [] } = job;
  const aConfirmer = panneau.ecarts.filter((e) => !e.bloquant);
  const bloquants = panneau.ecarts.filter((e) => e.bloquant);
  // Rang de pose porté par le nom (« 169824-2 LM … »), qui peut différer de la page du PDF.
  const rang = Number(String(panneau.nom || "").match(/^\d+-(\d+)\s/)?.[1]) || panneau.page + 1;
  const ordreDouteux = aConfirmer.some((e) => e.type === "ordre");

  return (
    <div className="sm-panneau">
      <div>
        <strong>
          Panneau {rang}
          {rang !== panneau.page + 1 && ` (page ${panneau.page + 1} du PDF)`} · {cm(panneau.largeur)} ×{" "}
          {cm(panneau.hauteur)} cm
        </strong>
      </div>
      {smCandidats.length > 1 ? (
        <Dropdown
          compact
          selection
          options={smCandidats.map((nom) => ({ key: nom, text: nom, value: nom }))}
          value={smPdf}
          onChange={(_, d) => onChoisirPdf(d.value)}
        />
      ) : (
        <div className="sm-panneau__pdf" title={smPdf}>
          {smPdf}
        </div>
      )}
      {bloquants.map((e) => (
        <Label key={e.message} color="red" size="tiny" basic>
          {e.message}
        </Label>
      ))}
      {aConfirmer.map((e) => (
        <Label key={e.message} color="orange" size="tiny" basic>
          {e.message}
        </Label>
      ))}
      {aConfirmer.length > 0 && bloquants.length === 0 && (
        <Checkbox
          label={
            ordreDouteux ? "Vérifié dans le PDF : bon panneau, bonne place" : "Écart vérifié : le PDF fait foi"
          }
          checked={panneau.ecartsConfirmes}
          onChange={(_, d) => onConfirm(d.checked)}
        />
      )}
    </div>
  );
}

SurMesurePanneau.propTypes = {
  job: PropTypes.object.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onChoisirPdf: PropTypes.func.isRequired,
};
