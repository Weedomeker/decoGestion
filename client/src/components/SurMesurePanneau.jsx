import PropTypes from "prop-types";
import { Checkbox, Dropdown, Label } from "semantic-ui-react";

const cm = (mm) => String(mm / 10).replace(".", ",");

export default function SurMesurePanneau({ job, onConfirm, onChoisirPdf }) {
  const { smPanneau: panneau, smPdf, smCandidats = [] } = job;
  const aConfirmer = panneau.ecarts.filter((e) => !e.bloquant);
  const bloquants = panneau.ecarts.filter((e) => e.bloquant);

  return (
    <div className="sm-panneau">
      <div>
        <strong>
          Panneau {panneau.page + 1} · {cm(panneau.largeur)} × {cm(panneau.hauteur)} cm
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
          label="Écart vérifié : le PDF fait foi"
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
