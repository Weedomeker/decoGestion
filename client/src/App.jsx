const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
const REGEX_BLANC = /\+\s*blanc\b/i;
import { Fragment, useEffect, useState } from "react";
import { Button, Checkbox, Dropdown, Form, Icon, Input, Label, Popup, Table } from "semantic-ui-react";
import CheckFormats from "./CheckFormats";
import Config from "./components/Config";
import DossierAutocomplete from "./components/DossierAutocomplete";
import Footer from "./components/Footer";
import FormatDropdown from "./components/FormatDropdown";
import FormatTauro from "./components/FormatTauro";
import Header from "./components/Header";
import InfoMessage from "./components/InfoMessage";
import InfoModal from "./components/InfoModal";
import InfoStockModal from "./components/InfoStockModal";
import JobsList from "./components/JobsList";
import ServerStatus from "./components/ServerStatus";
import LouisPreview from "./components/LouisPreview";
import Place from "./components/Place";
import PreviewDeco from "./components/PreviewDeco";
import TeinteMasseDropdown from "./components/TeinteMasseDropdown";
import VisuelDropdown from "./components/VisuelDropdown";
import { isCredenceFormat } from "./utils/credence";

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([""]);
  const [selectedFormat, setSelectedFormat] = useState("");
  const [selectedFormat2, setSelectedFormat2] = useState("");
  const [formatTauro, setFormatTauro] = useState([""]);
  const [checkProdBlanc, setCheckProdBlanc] = useState(false);
  const [checkGenerate, setCheckGenerate] = useState({
    cut: false,
    reg: true,
    teinteMasse: false,
  });
  const [checkFolder, setCheckFolder] = useState("LM");
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [selectedFormatTauro, setSelectedFormatTauro] = useState("");
  const [version, setVersion] = useState(null);
  const [isloadingFormatTauro, setLoadingFormatTauro] = useState(true);
  const [files, setFiles] = useState([{ name: "", fileSize: "" }]);
  const [files2, setFiles2] = useState([{ name: "", fileSize: "" }]);
  const [isFile, setIsFile] = useState(false);
  const [isFile2, setIsFile2] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedFile2, setSelectedFile2] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [fileSize2, setFileSize2] = useState("");
  const [numCmd, setNumCmd] = useState("");
  const [numCmd2, setNumCmd2] = useState("");
  const [ville, setVille] = useState("");
  const [ex, setEx] = useState(1);
  const [isFooter, setIsFooter] = useState(false);
  const [jobsRefresh, setJobsRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("dossier");
  const [activeView, setActiveView] = useState("form");
  const [pendingCount, setPendingCount] = useState(0);
  const [isLouisOpen, setIsLouisOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dossierPreview, setDossierPreview] = useState(null);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('deco-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('deco-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const [warnMsg, setWarnMsg] = useState({
    hidden: true,
    header: "",
    msg: "",
    icon: "warning sign",
    color: "red",
  });
  const [error, setError] = useState({
    formatTauro: false,
    format: false,
    visuel: false,
    numCmd: false,
    ville: false,
    ex: false,
  });
  const [enabled, setEnabled] = useState({
    format: true,
    visu: true,
    numCmd: true,
    ville: true,
    ex: true,
    validate: true,
  });
  const [perte, setPerte] = useState(0);
  const [dossierJobs, setDossierJobs] = useState([]);
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [modalData, setModalData] = useState({
    open: false,
    message: "",
    object: null,
    error: null,
  });
  const [modalInfoStock, setModalInfoStock] = useState({
    open: false,
    stock: null,
    object: null,
    use: false,
  });
  const [credenceEditId, setCredenceEditId] = useState(null);
  const [credence2NumCmd, setCredence2NumCmd] = useState("");
  const [credence2File, setCredence2File] = useState(null);
  const [credence2Client, setCredence2Client] = useState("");
  const [credence2Format, setCredence2Format] = useState("");
  const [healthData, setHealthData] = useState(null);

  function autoPairCredences(jobs) {
    const result = jobs.map((j) => ({ ...j }));
    const credencesByDossier = {};
    result.forEach((j, idx) => {
      if (j.isCredence && !j._absorbedBy && !j.credence2) {
        if (!credencesByDossier[j.dossierNumero]) credencesByDossier[j.dossierNumero] = [];
        credencesByDossier[j.dossierNumero].push(idx);
      }
    });
    for (const indices of Object.values(credencesByDossier)) {
      for (let i = 0; i + 1 < indices.length; i += 2) {
        const primaryIdx = indices[i];
        const partnerIdx = indices[i + 1];
        result[primaryIdx] = { ...result[primaryIdx], credence2: result[partnerIdx] };
        result[partnerIdx] = { ...result[partnerIdx], _absorbedBy: result[primaryIdx].id };
      }
    }
    return result;
  }

  function handleDossierAutoFill({ clearMode, manualMode, allJobs, client }) {
    if (clearMode) {
      setDossierJobs([]);
      setSelectedJobIds(new Set());
      setEnabled({ format: true, visu: true, numCmd: true, ville: true, ex: true, validate: true });
      setActiveTab("dossier");
      setCredenceEditId(null);
      setCredence2NumCmd("");
      setCredence2File(null);
      setCredence2Client("");
      setCredence2Format("");
      return;
    }

    if (client) setCheckFolder(client);

    if (manualMode) {
      setEnabled((current) => ({ ...current, format: false, visu: false, numCmd: false, ville: false }));
      setActiveTab("manuel");
      return;
    }

    if (!allJobs || allJobs.length === 0) return;

    const pairedJobs = autoPairCredences(allJobs);

    setCheckProdBlanc(false);
    setSelectedFormat2("");
    setSelectedFile2("");
    setPerte(0);
    setModalInfoStock({ open: false, stock: null, object: null, use: false });
    setActiveTab("dossier");
    setDossierJobs(pairedJobs);
    setCredenceEditId(null);
    setCredence2NumCmd("");
    setCredence2File(null);
    setCredence2Client("");
    setCredence2Format("");

    // Auto-sélectionne les nouveaux jobs valides, préserve les sélections existantes
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      const incomingIds = new Set(pairedJobs.map((j) => j.id));
      // Retire les IDs disparus (dossier supprimé)
      prev.forEach((id) => { if (!incomingIds.has(id)) next.delete(id); });
      pairedJobs.forEach((j) => {
        if (j._absorbedBy) {
          next.delete(j.id); // Force-déselectionne les partenaires absorbés même si déjà sélectionnés
        } else if (!prev.has(j.id) && j.selectedFileObject) {
          next.add(j.id);
        }
      });
      return next;
    });
  }

  function updateDossierJob(index, updates) {
    setDossierJobs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  function toggleJobSelection(jobId) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleGroupSelection(dossierNumero) {
    const groupJobs = dossierJobs.filter((j) => j.dossierNumero === dossierNumero && !j._absorbedBy);
    const allSelected = groupJobs.length > 0 && groupJobs.every((j) => selectedJobIds.has(j.id));
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      groupJobs.forEach((j) => { if (allSelected) next.delete(j.id); else next.add(j.id); });
      return next;
    });
  }

  function pairCredence(primaryId, partnerId) {
    setDossierJobs((prev) => {
      const primary = prev.find((r) => r.id === primaryId);
      const prevPartnerId = primary?.credence2?.id || null;
      return prev.map((r) => {
        if (r.id === primaryId) {
          const partner = partnerId ? prev.find((x) => x.id === partnerId) : null;
          return { ...r, credence2: partner || null };
        }
        if (prevPartnerId && r.id === prevPartnerId) return { ...r, _absorbedBy: null };
        if (partnerId && r.id === partnerId) return { ...r, _absorbedBy: primaryId, credence2: null };
        return r;
      });
    });
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (partnerId) next.delete(partnerId);
      return next;
    });
  }

  function applyManualCredence2(jobId) {
    setDossierJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              credence2: {
                _manual: true,
                numCmd: credence2NumCmd,
                selectedFileObject: credence2File,
                formatPath: credence2Format || j.formatPath,
                client: credence2Client || j.client,
              },
            }
          : j,
      ),
    );
    setCredenceEditId(null);
    setCredence2NumCmd("");
    setCredence2File(null);
    setCredence2Client("");
    setCredence2Format("");
  }

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ""; // nécessaire pour Chrome
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  //Get Format Tauro
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/formatsTauro`, {
      method: "GET",
      headers: { Accept: "Application/json" },
    })
      .then((res) => res.json())
      .then((res) => {
        let arr = [];
        (res.map((v) => {
          arr.push(v.value);
        }),
          setFormatTauro(arr));
        setLoadingFormatTauro(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingFormatTauro(false);
        setWarnMsg({ hidden: false, header: "Erreur serveur", msg: "Impossible de charger les formats Tauro.", icon: "warning sign", color: "red" });
      });
  }, []);

  //Get App version
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/process`, {
      method: "GET",
      headers: {
        Accept: "Application/json",
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((res) => {
        setVersion(res.version);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/path`, {
      method: "GET",
      headers: {
        Accept: "Application/json",
      },
    })
      .then((res) => res.json())
      .then((res) => {
        if (Array.isArray(res)) {
          setData(
            res.map((res) => {
              return res;
            }),
          );
        } else {
          setWarnMsg({
            hidden: false,
            header: "Erreur",
            msg: res.message || res.error,
            icon: "warning sign",
            color: "red",
          });
        }
        setIsLoading(false);
        setIsFooter(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
        setWarnMsg({ hidden: false, header: "Serveur inaccessible", msg: "Impossible de contacter le serveur. Vérifiez la connexion.", icon: "warning sign", color: "red" });
      });
  }, [formatTauro, checkFolder]);

  const handleClose = () => {
    setModalData({
      open: false,
      message: "",
      object: null,
      error: null,
    });
  };

  const handleCloseStock = () => {
    setModalInfoStock({ open: false, stock: null, object: null, use: false });
  };

  const handleValidateStock = async () => {
    const jobToUpdate = modalInfoStock.object;

    setModalInfoStock((prev) => ({ ...prev, open: false }));

    try {
      const response = await fetch(`http://${HOST}:${PORT}/edit_job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...jobToUpdate, useStock: true }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Une erreur est survenue");
      }
    } catch (error) {
      setModalData({ open: true, message: "", object: null, error: error.message });
    }
  };

  const handleJobSubmit = async (e) => {
    e.preventDefault();

    // Mode dossier : soumettre uniquement les jobs sélectionnés
    if (dossierJobs.length > 0) {
      const jobsToSubmit = dossierJobs.filter((j) => selectedJobIds.has(j.id) && !j._absorbedBy);
      if (jobsToSubmit.length === 0) return;

      const unpairedCredences = jobsToSubmit.filter(
        (j) =>
          j.isCredence &&
          !j.credence2 &&
          (j.client === "BRICO" || j.client === "CASTO") &&
          Number(j.ex) === 1,
      );
      if (unpairedCredences.length > 0) {
        const details = unpairedCredences.map((j) => `N°${j.numCmd || j.id}`).join(", ");
        setModalData({
          open: true,
          message: "",
          object: null,
          error: `${unpairedCredences.length} crédence${unpairedCredences.length > 1 ? "s" : ""} sans 2e panneau : ${details}. Les crédences BRICO/CASTO doivent être amalgamées.`,
        });
        return;
      }

      const incompatibleFinitions = jobsToSubmit.filter((j) => {
        if (!j.isCredence || !j.credence2) return false;
        const v1 = j.selectedFileObject?.name || "";
        const v2 = j.credence2?.selectedFileObject?.name || "";
        const fin1 = /brillant/i.test(v1) ? "BRILLANT" : /mat/i.test(v1) ? "MAT" : null;
        const fin2 = /brillant/i.test(v2) ? "BRILLANT" : /mat/i.test(v2) ? "MAT" : null;
        return fin1 && fin2 && fin1 !== fin2;
      });
      if (incompatibleFinitions.length > 0) {
        const details = incompatibleFinitions
          .map((j) => `N°${j.numCmd || j.id} (${/brillant/i.test(j.selectedFileObject?.name || "") ? "BRILLANT" : "MAT"} + ${/brillant/i.test(j.credence2?.selectedFileObject?.name || "") ? "BRILLANT" : "MAT"})`)
          .join(", ");
        setModalData({
          open: true,
          message: "",
          object: null,
          error: `Finitions incompatibles pour ${incompatibleFinitions.length} crédence${incompatibleFinitions.length > 1 ? "s" : ""} : ${details}. Les deux panneaux doivent avoir la même finition.`,
        });
        return;
      }

      try {
        const errors = [];
        for (const job of jobsToSubmit) {
          const payload = {
            client: job.client || checkFolder,
            client2: job.credence2?.client || job.client || checkFolder,
            allFormatTauro: formatTauro,
            formatTauro: job.formatTauroValue,
            prodBlanc: job.prodBlanc ?? false,
            format: job.formatPath,
            format2: job.credence2?.formatPath || "",
            visuel: job.selectedFileObject?.name || "",
            visuel2: job.credence2?.selectedFileObject?.name || "",
            numCmd: job.numCmd || "",
            numCmd2: job.credence2?.numCmd || "",
            ville: job.ville || "",
            ex: job.ex || 1,
            perte: 0,
            regmarks: checkGenerate.reg,
            cut: checkGenerate.cut,
            teinteMasse: job.teinteMasse ?? false,
            stock: false,
          };
          const response = await fetch(`http://${HOST}:${PORT}/add_job`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            errors.push(result.error || `Erreur ${response.status} (job ${job.numCmd || job.id})`);
          }
        }
        if (errors.length === 0) {
          setDossierJobs([]);
          setSelectedJobIds(new Set());
        } else {
          setModalData({ open: true, message: "", object: null, error: errors.join(" · ") });
        }
        setJobsRefresh((prev) => prev + 1);
      } catch (err) {
        setModalData({ open: true, message: "", object: null, error: err.message });
      }
      return;
    }

    // Mode normal : un seul job via le formulaire
    const _isCredenceFormat = isCredenceFormat(selectedFormat);
    if (_isCredenceFormat && (checkFolder === "BRICO" || checkFolder === "CASTO")) {
      if (Number(ex) === 1 && !selectedFile2) {
        setModalData({
          open: true,
          message: "",
          object: null,
          error: "Cette crédence (1 ex) doit être amalgamée avec un 2e visuel différent. Renseignez le 2e panneau avant de soumettre.",
        });
        return;
      }
      if (selectedFile2) {
        const fin1 = /brillant/i.test(selectedFile) ? "BRILLANT" : /mat/i.test(selectedFile) ? "MAT" : null;
        const fin2 = /brillant/i.test(selectedFile2) ? "BRILLANT" : /mat/i.test(selectedFile2) ? "MAT" : null;
        if (fin1 && fin2 && fin1 !== fin2) {
          setModalData({
            open: true,
            message: "",
            object: null,
            error: `Amalgame impossible : finitions incompatibles (panneau 1 : ${fin1}, panneau 2 : ${fin2}). Les deux crédences doivent avoir la même finition.`,
          });
          return;
        }
      }
    }

    const data = {
      client: checkFolder,
      allFormatTauro: formatTauro,
      formatTauro: selectedFormatTauro,
      prodBlanc: checkProdBlanc,
      format: selectedFormat,
      format2: selectedFormat2,
      visuel: selectedFile,
      visuel2: selectedFile2,
      numCmd: numCmd,
      numCmd2: numCmd2,
      ville: ville,
      ex: ex,
      perte: perte,
      regmarks: checkGenerate.reg,
      cut: checkGenerate.cut,
      teinteMasse: checkGenerate.teinteMasse,
      stock: modalInfoStock.use,
    };

    try {
      const response = await fetch(`http://${HOST}:${PORT}/add_job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Une erreur est survenue");
      }
      setJobsRefresh((prev) => prev + 1);
      if (result.stock?.ex > 0) {
        setModalInfoStock({
          open: true,
          stock: result.stock,
          object: result.object,
          use: false,
        });
      } else {
        setModalData({
          open: true,
          message: result.message,
          object: result.object,
          error: null,
        });
      }
    } catch (err) {
      setModalData({
        open: true,
        message: "",
        object: null,
        error: err.message,
      });
    }
  };

  // Ajout Format Plaque Tauro
  const handleToggleAddFormat = () => {
    showAddFormat ? setShowAddFormat(false) : setShowAddFormat(true);
    if (showAddFormat) {
      const value = "Deco_Std_" + document.getElementById("addFormatTauro").value;
      if (value !== "") {
        setFormatTauro((curr) => [...curr, value]);
      }
    }
  };

  const handleResetForm = () => {
    setSelectedFormatTauro("");
    setSelectedFormat("");
    setSelectedFormat2("");
    setSelectedFile("");
    setSelectedFile2("");
    setFileSize("");
    setFileSize2("");
    setNumCmd("");
    setNumCmd2("");
    setVille("");
    setEx(1);
    setFiles([{ name: "", fileSize: "" }]);
    setFiles2([{ name: "", fileSize: "" }]);
    setIsFile(false);
    setIsFile2(false);
    setPerte("");
    setCheckProdBlanc(false);
    setPreview(null);
    setDossierJobs([]);
    setCheckGenerate({
      cut: false,
      reg: true,
      teinteMasse: false,
    });
    setSelectedJobIds(new Set());
  };

  const clientColor = (c) => {
    if (c === "LM") return "green";
    if (c === "CASTO") return "blue";
    if (c === "ECOM") return "teal";
    return "orange";
  };

  const CLIENT_ICONS = { LM: "leaf", CASTO: "home", BRICO: "wrench", ECOM: "shopping cart" };

  useEffect(() => {
    if (!healthData) return;
    const _odbcOk = healthData.odbc === "connected";
    const _symlinks = healthData.symlinks ?? {};
    const _anySymlinkOk = Object.values(_symlinks).some(Boolean);
    if (!_odbcOk && _anySymlinkOk && activeTab === "dossier") {
      setActiveTab("manuel");
    }
    if (_symlinks[checkFolder] === false) {
      const firstOk = ["LM", "CASTO", "BRICO", "ECOM"].find((c) => _symlinks[c] !== false);
      if (firstOk) setCheckFolder(firstOk);
    }
  }, [healthData]);

  const odbcOk = healthData?.odbc === "connected";
  const symlinkStatus = healthData?.symlinks ?? {};
  const anySymlinkOk = Object.values(symlinkStatus).some(Boolean);

  return (
    <div className="container">
      <Header
        appVersion={version}
        onFichiers={() => setIsLouisOpen(true)}
        configNode={<Config />}
        statusNode={<ServerStatus onHealthChange={setHealthData} />}
        activeView={activeView}
        onViewChange={setActiveView}
        pendingCount={pendingCount}
        theme={theme}
        onThemeToggle={toggleTheme}
      />

      <div className="view-area">
      <div className={`main-area${activeView !== "form" ? " hidden" : ""}`}>
        <div className="form-panel">
          {/* Onglets de mode */}
          <div className="mode-tabs">
            <Popup
              content="API dossier indisponible (ODBC déconnecté)"
              disabled={odbcOk || !healthData}
              trigger={
                <span>
                  <Button
                    toggle
                    type="button"
                    active={activeTab === "dossier"}
                    onClick={() => odbcOk && setActiveTab("dossier")}
                    disabled={!odbcOk && !!healthData}
                    icon="search"
                    content="Dossier API"
                    style={(!odbcOk && healthData) ? { pointerEvents: "none", opacity: 0.45 } : {}}
                  />
                </span>
              }
            />
            <Button
              toggle
              type="button"
              active={activeTab === "manuel"}
              onClick={() => {
                setActiveTab("manuel");
                setDossierJobs([]);
              }}
              icon="edit"
              content="Saisie manuelle"
            />
          </div>

          <Form onSubmit={handleJobSubmit}>
            {/* Mode dossier */}
            {activeTab === "dossier" && (
              <>
                <DossierAutocomplete
                  host={HOST}
                  port={PORT}
                  pathData={data[0] || {}}
                  formatTauro={formatTauro}
                  onAutoFill={handleDossierAutoFill}
                />
                {dossierJobs.length > 0 && (() => {
                  const groups = dossierJobs.reduce((acc, job, i) => {
                    if (job._absorbedBy) return acc;
                    const key = job.dossierNumero || "?";
                    if (!acc[key]) acc[key] = { client: job.client, jobs: [] };
                    acc[key].jobs.push({ ...job, _idx: i });
                    return acc;
                  }, {});
                  const visibleJobs = dossierJobs.filter((j) => !j._absorbedBy);
                  const visibleSelectedCount = visibleJobs.filter((j) => selectedJobIds.has(j.id)).length;
                  const allSelected = visibleJobs.length > 0 && visibleSelectedCount === visibleJobs.length;
                  const someSelected = visibleSelectedCount > 0 && !allSelected;
                  const hasCredences = dossierJobs.some((j) => j.isCredence);
                  const unpairedManualCredences = dossierJobs.filter((j) => {
                    if (!j.isCredence || j._absorbedBy || j.credence2) return false;
                    return !dossierJobs.some(
                      (x) => x.isCredence && x.id !== j.id && !x._absorbedBy && !x.credence2,
                    );
                  });
                  return (
                    <div className="dossier-table-wrapper">
                      {unpairedManualCredences.length > 0 && (
                        <div className="credence-unpaired-warning">
                          <Icon name="warning sign" color="orange" />
                          {unpairedManualCredences.length} crédence{unpairedManualCredences.length > 1 ? "s" : ""} sans 2e panneau dans le dossier — cliquez sur &laquo;&nbsp;Compléter&nbsp;&raquo; pour ajouter le 2e visuel.
                        </div>
                      )}
                      <Table compact="very" size="small" className={`dossier-table${hasCredences ? " dossier-table--credences" : ""}`}>
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell className="col-check">
                              <Checkbox
                                checked={allSelected}
                                indeterminate={someSelected}
                                onChange={() => {
                                  if (allSelected || someSelected) setSelectedJobIds(new Set());
                                  else setSelectedJobIds(new Set(visibleJobs.map((j) => j.id)));
                                }}
                              />
                            </Table.HeaderCell>
                            <Table.HeaderCell>Format Tauro</Table.HeaderCell>
                            <Table.HeaderCell>Format</Table.HeaderCell>
                            <Table.HeaderCell>Visuel</Table.HeaderCell>
                            <Table.HeaderCell>N° Cmd</Table.HeaderCell>
                            <Table.HeaderCell>Ville</Table.HeaderCell>
                            <Table.HeaderCell>Ex</Table.HeaderCell>
                            <Table.HeaderCell title="Prod avec blanc" style={{ textAlign: "center" }}>
                              <Icon name="adjust" size="small" />
                            </Table.HeaderCell>
                            <Table.HeaderCell title="Teinte masse" style={{ textAlign: "center" }}>
                              <Icon name="tint" size="small" />
                            </Table.HeaderCell>
                            {hasCredences && (
                              <Table.HeaderCell title="Crédence — 2e panneau">
                                <Icon name="clone" size="small" /> 2e panneau
                              </Table.HeaderCell>
                            )}
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {Object.entries(groups).map(([dossierNumero, group]) => {
                            const groupJobs = group.jobs;
                            const allGroupSel = groupJobs.every((j) => selectedJobIds.has(j.id));
                            const someGroupSel = groupJobs.some((j) => selectedJobIds.has(j.id)) && !allGroupSel;
                            return (
                              <Fragment key={`grp-${dossierNumero}`}>
                                <Table.Row className="dossier-group-header">
                                  <Table.Cell>
                                    <Checkbox
                                      checked={allGroupSel}
                                      indeterminate={someGroupSel}
                                      onChange={() => toggleGroupSelection(dossierNumero)}
                                    />
                                  </Table.Cell>
                                  <Table.Cell colSpan={hasCredences ? 9 : 8} className="dossier-group-label" data-client={group.client}>
                                    <span className={`client-badge client-badge--${group.client?.toLowerCase()}`}>
                                      {group.client}
                                    </span>
                                    Dossier {dossierNumero} — {groupJobs.length} job{groupJobs.length > 1 ? "s" : ""}
                                  </Table.Cell>
                                </Table.Row>
                                {groupJobs.map((job) => {
                                  const folders = data[0]?.[job.client] || [];
                                  const rowFiles = folders.find((f) => f.path === job.formatPath)?.files || [];
                                  const isSelected = selectedJobIds.has(job.id);
                                  const hasDossierPartner = dossierJobs.some(
                                    (x) => x.isCredence && x.id !== job.id && !x._absorbedBy && !x.credence2,
                                  );
                                  return (
                                    <Fragment key={job.id || job._idx}>
                                    <Table.Row
                                      className={isSelected ? "" : "job-row-deselected"}
                                    >
                                      <Table.Cell>
                                        <Checkbox
                                          checked={isSelected}
                                          onChange={() => toggleJobSelection(job.id)}
                                        />
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Dropdown
                                          compact selection search
                                          options={formatTauro.map((v) => ({ key: v, text: v.split("_").pop(), value: v }))}
                                          value={job.formatTauroValue || ""}
                                          onChange={(_, d) => updateDossierJob(job._idx, { formatTauroValue: d.value })}
                                        />
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Dropdown
                                          compact selection search
                                          options={folders.map((f) => ({ key: f.path, text: f.name.match(/\d{3}x\d{2,3}/i)?.[0] || f.name, value: f.path }))}
                                          value={job.formatPath || ""}
                                          onChange={(_, d) => {
                                            if (job.teinteMasse) {
                                              updateDossierJob(job._idx, { formatPath: d.value });
                                            } else {
                                              const sel = folders.find((f) => f.path === d.value);
                                              updateDossierJob(job._idx, { formatPath: d.value, selectedFileObject: sel?.files?.[0] || null });
                                            }
                                          }}
                                        />
                                      </Table.Cell>
                                      <Table.Cell>
                                        {job.teinteMasse ? (
                                          <TeinteMasseDropdown
                                            selectedFile={job.selectedFileObject?.name || ""}
                                            onSelectedFile={(value) =>
                                              updateDossierJob(job._idx, { selectedFileObject: value ? { name: value } : null })
                                            }
                                          />
                                        ) : (
                                          <Dropdown
                                            compact selection search
                                            options={rowFiles.map((f) => ({ key: f.name, text: f.name.split("/").pop().replace(/\.[^/.]+$/, ""), value: f.name }))}
                                            value={job.selectedFileObject?.name || ""}
                                            onChange={(_, d) => {
                                              const sel = rowFiles.find((f) => f.name === d.value);
                                              updateDossierJob(job._idx, {
                                                selectedFileObject: sel || null,
                                                prodBlanc: REGEX_BLANC.test((sel?.name || "").split("/").pop()),
                                              });
                                              setDossierPreview(sel?.name || null);
                                            }}
                                          />
                                        )}
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Input size="small" type="number"
                                          value={job.numCmd || ""}
                                          onChange={(_, d) => updateDossierJob(job._idx, { numCmd: d.value })}
                                        />
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Input size="small"
                                          value={job.ville || ""}
                                          onChange={(_, d) => updateDossierJob(job._idx, { ville: d.value.toUpperCase() })}
                                        />
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Input size="small" type="number" min={1}
                                          value={job.ex || 1}
                                          onChange={(_, d) => updateDossierJob(job._idx, { ex: Number(d.value) })}
                                        />
                                      </Table.Cell>
                                      <Table.Cell style={{ textAlign: "center" }}>
                                        <Icon
                                          name={job.prodBlanc ? "adjust" : "circle outline"}
                                          color={job.prodBlanc ? "yellow" : "grey"}
                                          link
                                          title={job.prodBlanc ? "Prod avec blanc : ON" : "Prod avec blanc : OFF"}
                                          onClick={() => updateDossierJob(job._idx, { prodBlanc: !job.prodBlanc })}
                                        />
                                      </Table.Cell>
                                      <Table.Cell style={{ textAlign: "center" }}>
                                        <Icon
                                          name="tint"
                                          color={job.teinteMasse ? "blue" : "grey"}
                                          link
                                          title={job.teinteMasse ? "Teinte masse : ON" : "Teinte masse : OFF"}
                                          onClick={() => updateDossierJob(job._idx, {
                                            teinteMasse: !job.teinteMasse,
                                            selectedFileObject: null,
                                          })}
                                        />
                                      </Table.Cell>
                                      {hasCredences && (
                                        <Table.Cell>
                                          {job.isCredence && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                                              {job._absorbedBy ? (
                                                <Label size="mini" color="grey">Inclus ✓</Label>
                                              ) : (
                                                <>
                                                  <Label
                                                    size="mini"
                                                    color={
                                                      job.credence2
                                                        ? "green"
                                                        : job.client === "BRICO" || job.client === "CASTO"
                                                        ? "red"
                                                        : "yellow"
                                                    }
                                                  >
                                                    {job.credence2 ? "2 panneaux" : "1 panneau"}
                                                  </Label>
                                                  {job.credence2?._manual && (
                                                    <span style={{ fontSize: "0.75em", color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                      {job.credence2.selectedFileObject?.name?.split("/").pop().replace(/\.[^/.]+$/, "") || "Manuel"}
                                                    </span>
                                                  )}
                                                  <Dropdown
                                                    compact selection clearable
                                                    placeholder="— seul —"
                                                    options={dossierJobs
                                                      .filter((j) =>
                                                        j.isCredence &&
                                                        j.id !== job.id &&
                                                        !j._absorbedBy &&
                                                        !j.credence2
                                                      )
                                                      .map((j) => ({
                                                        key: j.id,
                                                        value: j.id,
                                                        text: `${j.client || ""} — ${j.libelle || j.id} (${j.formatVisu || ""})`,
                                                      }))}
                                                    value={job.credence2?.id || null}
                                                    onChange={(_, d) => pairCredence(job.id, d.value || null)}
                                                  />
                                                  {(!job.credence2 || job.credence2._manual) && (
                                                    <Button
                                                      type="button"
                                                      size="mini"
                                                      compact
                                                      color={credenceEditId === job.id ? "grey" : "orange"}
                                                      onClick={() => {
                                                        setCredenceEditId((prev) => (prev === job.id ? null : job.id));
                                                        setCredence2Client("");
                                                        setCredence2Format("");
                                                        setCredence2File(null);
                                                        setCredence2NumCmd("");
                                                      }}
                                                    >
                                                      {credenceEditId === job.id ? "Annuler" : job.credence2?._manual ? "Modifier ▾" : "Compléter ▾"}
                                                    </Button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          )}
                                        </Table.Cell>
                                      )}
                                    </Table.Row>
                                    {credenceEditId === job.id && (() => {
                                      const c2Client = credence2Client || job.client;
                                      const c2Folders = (data[0]?.[c2Client] || []).filter((f) =>
                                        /\d{3}x\d{2}/.test(f.name)
                                      );
                                      const c2Files = credence2Format
                                        ? c2Folders.find((f) => f.path === credence2Format)?.files || []
                                        : [];
                                      return (
                                        <Table.Row className="credence-inline-form">
                                          <Table.Cell colSpan={hasCredences ? 10 : 9} style={{ padding: "0.75rem 1.25rem" }}>
                                            <Form style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                                              <strong style={{ marginRight: 4, alignSelf: "center" }}>
                                                <Icon name="clone" /> 2e panneau
                                              </strong>
                                              <Form.Field>
                                                <label>Client 2</label>
                                                <Dropdown
                                                  selection
                                                  size="mini"
                                                  placeholder="Client…"
                                                  options={["LM", "CASTO", "BRICO", "ECOM"].map((c) => ({ key: c, value: c, text: c }))}
                                                  value={c2Client}
                                                  onChange={(_, d) => {
                                                    setCredence2Client(d.value);
                                                    setCredence2Format("");
                                                    setCredence2File(null);
                                                  }}
                                                />
                                              </Form.Field>
                                              <Form.Field>
                                                <label>Format crédence 2</label>
                                                <Dropdown
                                                  selection
                                                  search
                                                  size="mini"
                                                  placeholder="Format…"
                                                  options={c2Folders.map((f) => ({
                                                    key: f.path,
                                                    value: f.path,
                                                    text: f.name.match(/\d{3}x\d{2,3}/i)?.[0] || f.name,
                                                  }))}
                                                  value={credence2Format || ""}
                                                  onChange={(_, d) => {
                                                    setCredence2Format(d.value);
                                                    setCredence2File(null);
                                                  }}
                                                />
                                              </Form.Field>
                                              <Form.Field>
                                                <label>Visuel 2</label>
                                                <Dropdown
                                                  selection
                                                  search
                                                  clearable
                                                  placeholder="Sélectionner…"
                                                  options={c2Files.map((f) => ({
                                                    key: f.name,
                                                    value: f.name,
                                                    text: f.name.split("/").pop().replace(/\.[^/.]+$/, ""),
                                                  }))}
                                                  value={credence2File?.name || null}
                                                  onChange={(_, d) =>
                                                    setCredence2File(d.value ? c2Files.find((f) => f.name === d.value) : null)
                                                  }
                                                />
                                              </Form.Field>
                                              <Form.Field>
                                                <label>N° commande 2</label>
                                                <Input
                                                  size="mini"
                                                  placeholder="Ex : 165676"
                                                  value={credence2NumCmd}
                                                  onChange={(_, d) => setCredence2NumCmd(d.value)}
                                                />
                                              </Form.Field>
                                              <Form.Field>
                                                <label>&nbsp;</label>
                                                <Button
                                                  type="button"
                                                  size="mini"
                                                  color="green"
                                                  disabled={!credence2File || !credence2NumCmd || !credence2Format}
                                                  onClick={() => applyManualCredence2(job.id)}
                                                  icon="check"
                                                  content="Valider"
                                                />
                                              </Form.Field>
                                            </Form>
                                          </Table.Cell>
                                        </Table.Row>
                                      );
                                    })()}
                                    </Fragment>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </Table.Body>
                      </Table>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Mode manuel */}
            {activeTab === "manuel" && (
              <>
                <div className="form-section">
                  <span className="form-section-label">Plaque Tauro</span>
                <Form.Field className="format-tauro" required error={error.formatTauro}>
                  <FormatTauro
                    error={error.formatTauro}
                    isLoading={isloadingFormatTauro}
                    value={selectedFormatTauro}
                    formatTauro={formatTauro}
                    onValue={(e, data) => {
                      setSelectedFormatTauro(data.value);
                      if (CheckFormats(data.value, selectedFormat) && CheckFormats(data.value, selectedFormat).gap == true) {
                        setWarnMsg({
                          ...warnMsg,
                          hidden: false,
                          header: "Attention au format",
                          msg: `Perte matère: (${CheckFormats(data.value, selectedFormat).surface}/m2)`,
                          icon: "info circle",
                          color: "yellow",
                        });
                      } else if (
                        selectedFormat &&
                        CheckFormats(data.value, selectedFormat) &&
                        CheckFormats(data.value, selectedFormat).isChecked == false
                      ) {
                        setWarnMsg({
                          ...warnMsg,
                          hidden: false,
                          header: "Problème format",
                          msg: "Le format du visuel est plus grand que celui de la plaque.",
                          icon: "warning sign",
                          color: "red",
                        });
                      } else {
                        setWarnMsg({ ...warnMsg, hidden: true });
                      }

                      if (data.value == "") {
                        setEnabled({ ...enabled, format: false });
                        setError({ ...error, formatTauro: true });
                      } else {
                        setEnabled({ ...enabled, format: false });
                        setError({ ...error, formatTauro: false });
                      }
                    }}
                  />
                  <Button
                    attached="bottom"
                    className="add-button"
                    type="button"
                    icon="add"
                    color="grey"
                    size="mini"
                    onClick={handleToggleAddFormat}
                  />
                  {showAddFormat && <Input id="addFormatTauro" size="small" label="Add format" placeholder="ex: 101x215" />}
                  {error.formatTauro && <span className="field-error-msg">Sélectionne un format de plaque Tauro</span>}
                </Form.Field>
                </div>

                {/* Sélecteur client */}
                <div className="form-section">
                  <span className="form-section-label">Client</span>
                  <Button.Group size="small" className="client-selector">
                    {["LM", "CASTO", "BRICO", "ECOM"].map((c) => {
                      const isKo = symlinkStatus[c] === false;
                      const dotCls =
                        healthData === null        ? "client-dot client-dot--unknown" :
                        symlinkStatus[c] === true  ? "client-dot client-dot--ok"      :
                        symlinkStatus[c] === false ? "client-dot client-dot--ko"      :
                                                     "client-dot client-dot--unknown";
                      return (
                        <Popup
                          key={c}
                          content={`Accès réseau ${c} indisponible`}
                          disabled={!isKo}
                          trigger={
                            <span className="client-btn-wrap">
                              <Button
                                toggle
                                type="button"
                                active={checkFolder === c}
                                color={checkFolder === c ? clientColor(c) : undefined}
                                onClick={() => {
                                  if (isKo) return;
                                  handleResetForm();
                                  setCheckFolder(c);
                                }}
                                disabled={isKo}
                                icon={CLIENT_ICONS[c]}
                                content={c}
                                style={isKo ? { pointerEvents: "none", opacity: 0.45 } : {}}
                              />
                              <span className={dotCls} />
                            </span>
                          }
                        />
                      );
                    })}
                  </Button.Group>
                </div>

                {/* Format + Visuel + N° Cmd */}
                <div className="form-section form-section--accented" data-client={checkFolder}>
                  <span className="form-section-label">Format & Visuel</span>
                  <Form.Field required error={error.format}>
                    <FormatDropdown
                      placeholder={checkFolder}
                      enabled={enabled.format}
                      error={error.format}
                      id="format"
                      className="format"
                      isLoading={isLoading}
                      data={data[0][checkFolder] || []}
                      value={selectedFormat}
                      selectedFormat={selectedFormat}
                      onSelectFormat={(e, v) => {
                        if (v.value === null) {
                          setSelectedFormat(null);
                          setFiles([]);
                          setIsFile(false);
                          setSelectedFile(null);
                          setError({ ...error, format: false });
                          return;
                        }

                        if (v.value.match(/\d{3}x\d{3}/)) {
                          setSelectedFormat2(null);
                          setFiles2([]);
                          setIsFile2(false);
                          setSelectedFile2(null);
                          setError({ ...error, format: false });
                        }

                        const selected = data[0][checkFolder].find((x) => x.path === v.value);

                        setSelectedFormat(v.value);

                        setFiles(selected.files);
                        setIsFile(true);
                        setSelectedFile(null);
                        setIsFooter(false);
                        setEnabled({ ...enabled, visu: false });

                        setError({ ...error, format: !selected?.name });
                      }}
                    />
                    {error.format && <span className="field-error-msg">Sélectionne un format {checkFolder}</span>}
                  </Form.Field>

                  <Form.Field required error={error.visuel}>
                    {!checkGenerate.teinteMasse ? (
                      <VisuelDropdown
                        enabled={enabled.visu}
                        error={error.visuel}
                        id="visuel"
                        className="visuel"
                        isFile={isFile}
                        files={files}
                        value={selectedFile}
                        text={selectedFile}
                        selectedFile={selectedFile}
                        onSelectedFile={(value) => {
                          const name = value.name.split("/").pop();
                          setCheckProdBlanc(REGEX_BLANC.test(name));
                          setSelectedFile(value.name);
                          setFileSize(value.size);
                          setPreview(value.name);
                          if (value.name == "" || value.name == undefined) {
                            setError({ ...error, visuel: true });
                          } else {
                            setEnabled({ ...enabled, numCmd: false });
                            setError({ ...error, visuel: false });
                          }

                          if (
                            CheckFormats(selectedFormatTauro, value.name.split("/").pop()) &&
                            CheckFormats(selectedFormatTauro, value.name.split("/").pop()).gap == true
                          ) {
                            setPerte(CheckFormats(selectedFormatTauro, value.name.split("/").pop()).surface);
                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Attention au format",
                              msg: `Perte matière: ${CheckFormats(selectedFormatTauro, value.name.split("/").pop()).surface}/m2`,
                              icon: "info circle",
                              color: "yellow",
                            });
                          } else if (CheckFormats(selectedFormatTauro, value.name.split("/").pop()) == undefined) {
                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Problème format",
                              msg: "Format du visuel introuvable. Attention au format de plaque choisit.",
                              icon: "warning sign",
                              color: "orange",
                            });
                          } else if (CheckFormats(selectedFormatTauro, value.name.split("/").pop()).isChecked == false) {
                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Problème format",
                              msg: "Le format du visuel est plus grand que celui de la plaque.",
                              icon: "warning sign",
                              color: "red",
                            });
                          } else {
                            setWarnMsg({ ...warnMsg, hidden: true });
                          }
                        }}
                      />
                    ) : (
                      <TeinteMasseDropdown
                        value={selectedFile}
                        text={selectedFile}
                        selectedFile={selectedFile}
                        onSelectedFile={(value) => {
                          setSelectedFile(value);
                          if (!value) {
                            setError({ ...error, visuel: true });
                          } else {
                            setEnabled({ ...enabled, numCmd: false });
                            setError({ ...error, visuel: false });
                          }
                        }}
                      />
                    )}

                    {error.visuel && <span className="field-error-msg">Sélectionne un visuel</span>}
                    {fileSize && <p style={{ fontSize: "10px", textAlign: "right", marginTop: "2px" }}>{fileSize}</p>}
                  </Form.Field>

                  <Form.Field required error={error.numCmd} inline>
                    <Input
                      disabled={enabled.numCmd}
                      error={error.numCmd}
                      id="numCmd"
                      name="numCmd"
                      type="number"
                      placeholder="N° commande"
                      value={numCmd}
                      onChange={(e, data) => {
                        const value = data.value;
                        setNumCmd(value);
                        const maxValidate = (string) => string.slice(0, 6);
                        if (value.length > 6 || value.length < 5) {
                          setError({ ...error, numCmd: true });
                        } else {
                          setEnabled({ ...enabled, ville: false });
                          maxValidate(value);
                          setError({ ...error, numCmd: false });
                        }
                      }}
                      onWheel={(e) => e.preventDefault()}
                    />
                    {error.numCmd && <span className="field-error-msg">N° commande : 5 ou 6 chiffres requis</span>}
                  </Form.Field>
                </div>

                {/* Si format crédence */}
                {isCredenceFormat(selectedFormat) && (
                  <div className="form-section form-section--accented" data-client={checkFolder}>
                    <span className="form-section-label"><Icon name="clone" size="small" /> Crédence — 2e partie</span>
                    <Form.Field required error={error.format}>
                      <FormatDropdown
                        placeholder={checkFolder}
                        enabled={enabled.format}
                        error={error.format}
                        id="format"
                        className="format"
                        isLoading={isLoading}
                        data={
                          selectedFormat.match(/\d{3}x\d{2}/)
                            ? data[0][checkFolder].filter((x) => x.name.includes(selectedFormat.match(/\d{3}x\d{2}/)[0]))
                            : data[0][checkFolder] || []
                        }
                        value={selectedFormat2}
                        selectedFormat={selectedFormat2}
                        onSelectFormat={(e, v) => {
                          if (v.value === null) {
                            setSelectedFormat2(null);
                            setFiles2([]);
                            setIsFile2(false);
                            setSelectedFile2(null);
                            setError({ ...error, format: false });
                            return;
                          }

                          const selected = data[0][checkFolder].find((x) => x.path === v.value);

                          setSelectedFormat2(v.value);
                          setFiles2(selected.files);
                          setIsFile2(true);
                          setSelectedFile2(null);
                          setIsFooter(false);
                          setEnabled({ ...enabled, visu: false });

                          setError({ ...error, format: !selected?.name });
                        }}
                      />
                    </Form.Field>
                    <Form.Field required error={error.visuel}>
                      <VisuelDropdown
                        enabled={enabled.visu}
                        error={error.visuel}
                        id="visuel"
                        className="visuel"
                        isFile={isFile2}
                        files={files2}
                        value={selectedFile2}
                        text={selectedFile2}
                        selectedFile={selectedFile2}
                        onSelectedFile={(value) => {
                          if (!value) {
                            setSelectedFile2(null);
                            setPreview(null);
                            setFileSize2("");
                            setCheckProdBlanc(false);
                            return;
                          }
                          const name = value.name.split("/").pop();
                          setCheckProdBlanc(REGEX_BLANC.test(name));
                          setSelectedFile2(value.name);
                          setPreview(value.name);
                          setFileSize2(value.size);
                          if (value.name == "" || value.name == undefined) {
                            setError({ ...error, visuel: true });
                          } else {
                            setEnabled({ ...enabled, numCmd: false });
                            setError({ ...error, visuel: false });
                          }

                          if (
                            CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop()) &&
                            CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop())
                              .gap == true
                          ) {
                            setPerte(
                              CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop())
                                .surface,
                            );

                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Attention au format",
                              msg: `Perte matière: ${CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop()).surface}/m2`,
                              icon: "info circle",
                              color: "yellow",
                            });
                          } else if (
                            CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop()) ==
                            undefined
                          ) {
                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Problème format",
                              msg: "Format du visuel introuvable. Attention au format de plaque choisit.",
                              icon: "warning sign",
                              color: "orange",
                            });
                          } else if (
                            CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop())
                              .isChecked == false
                          ) {
                            setWarnMsg({
                              ...warnMsg,
                              hidden: false,
                              header: "Problème format",
                              msg: "Le format du visuel est plus grand que celui de la plaque.",
                              icon: "warning sign",
                              color: "red",
                            });
                          } else {
                            setWarnMsg({ ...warnMsg, hidden: true });
                            setPerte(
                              CheckFormats(selectedFormatTauro, value.name?.split("/").pop(), selectedFile?.split("/").pop())
                                .surface,
                            );
                          }
                        }}
                      />
                      <p
                        style={{
                          fontSize: "10px",
                          textAlign: "right",
                          width: "300px",
                          marginTop: "2px",
                        }}
                      >
                        {fileSize2}
                      </p>
                    </Form.Field>
                    <Form.Field required error={error.numCmd} inline>
                      <Input
                        disabled={enabled.numCmd}
                        error={error.numCmd}
                        id="numCmd2"
                        name="numCmd2"
                        type="number"
                        placeholder="N° commande 2"
                        value={numCmd2}
                        onChange={(e, data) => {
                          const value = data.value;
                          setNumCmd2(value);
                          const maxValidate = (string) => string.slice(0, 6);
                          if (value.length > 6 || value.length < 5) {
                            setError({ ...error, numCmd: true });
                          } else {
                            setEnabled({ ...enabled, ville: false });
                            maxValidate(value);
                            setError({ ...error, numCmd: false });
                          }
                        }}
                        onWheel={(e) => e.preventDefault()}
                      />
                    </Form.Field>
                  </div>
                )}

                {/* Ville / Mag */}
                <div className="form-section">
                  <span className="form-section-label">Magasin / Ville</span>
                <Form.Field required error={error.ville}>
                  <Place
                    enabled={enabled.ville}
                    value={ville}
                    onValue={(value) => {
                      setVille(value);
                      if (value.length < 1) {
                        setError({ ...error, ville: true });
                      } else {
                        setEnabled({ ...enabled, ex: false, validate: false });
                        setError({ ...error, ville: false });
                      }
                    }}
                  />
                  {error.ville && <span className="field-error-msg">Saisis la ville ou le magasin</span>}
                </Form.Field>
                </div>
                {/* Exemplaires */}
                <div className="form-section">
                  <span className="form-section-label">Exemplaires</span>
                  <Form.Field>
                    <Input
                      placeholder="Exemplaire(s)"
                      id="ex"
                      name="ex"
                      type="number"
                      value={ex}
                      onChange={(e, data) => {
                        const value = data.value;
                        setEx(value);
                      }}
                    />
                  </Form.Field>
                </div>
              </>
            )}

            {/* Options partagées */}
            <div className="form-section">
              <span className="form-section-label">Options de production</span>
              <div className="options-grid">
                <div className="options-col">
                  {activeTab !== "dossier" && (
                    <Checkbox
                      name="Prod avec blanc"
                      label="Prod avec blanc"
                      checked={checkProdBlanc}
                      onChange={(e, data) => setCheckProdBlanc(data.checked)}
                    />
                  )}
                  {checkFolder == "LM" && activeTab !== "dossier" && (
                    <Checkbox
                      name="Teinte Masse"
                      label="Teinte Masse"
                      checked={checkGenerate.teinteMasse}
                      onChange={(e, data) => {
                        setCheckGenerate({ ...checkGenerate, teinteMasse: data.checked });
                      }}
                    />
                  )}
                </div>
                <div className="options-col">
                  <Checkbox
                    name="Générer regmarks"
                    label="Générer regmarks"
                    checked={checkGenerate.reg}
                    onChange={(e, data) => {
                      setCheckGenerate({ ...checkGenerate, reg: data.checked });
                    }}
                  />
                  {checkFolder === "LM" && (
                    <Checkbox
                      className="decoupe"
                      name="Générer découpe"
                      label="Générer découpe"
                      checked={checkGenerate.cut}
                      onChange={(e, data) => {
                        setCheckGenerate({ cut: data.checked, reg: data.checked });
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <InfoMessage
              isHidden={warnMsg.hidden}
              title={warnMsg.header}
              text={warnMsg.msg}
              icon={warnMsg.icon}
              color={warnMsg.color}
            />

            <Button
              type="submit"
              color="vk"
              fluid
              disabled={dossierJobs.length > 0 && selectedJobIds.size === 0}
              content={
                dossierJobs.length > 0
                  ? `Ajouter (${selectedJobIds.size} sélectionné${selectedJobIds.size > 1 ? "s" : ""})`
                  : "Ajouter"
              }
            />
          </Form>
        </div>

        {/* Panneau preview — apparaît automatiquement quand un visuel est sélectionné */}
        {(() => {
          const activePreview = activeTab === "dossier" ? dossierPreview : preview;
          return (
            <div className={`preview-panel${activePreview ? " visible" : ""}`}>
              <p className="preview-label">Aperçu visuel</p>
              <PreviewDeco fileSelected={activePreview} show={!!activePreview} client={checkFolder} />
            </div>
          );
        })()}
      </div>

      <div className={`jobs-view${activeView !== "jobs" ? " hidden" : ""}`}>
        <JobsList formatTauro={formatTauro} refreshToken={jobsRefresh} onPendingCountChange={setPendingCount} />
      </div>
      </div>

      <Footer active={!isFooter} />

      <LouisPreview open={isLouisOpen} onClose={() => setIsLouisOpen(false)} />

      <InfoModal
        open={modalData.open}
        onClose={handleClose}
        message={modalData.message}
        object={modalData.object}
        error={modalData.error}
      />

      <InfoStockModal
        open={modalInfoStock.open}
        onClose={handleCloseStock}
        onValidate={handleValidateStock}
        stock={modalInfoStock.stock}
      />
    </div>
  );
}

export default App;
