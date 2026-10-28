const REGEX_BLANC = /\+\s*blanc\b/i;
// Ordre des vues pour les raccourcis Alt+1…6 (même ordre que les onglets du Header)
const VIEWS = ["form", "jobs", "references", "stats", "historique", "sticker"];
import { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE } from "./utils/api";
import { Button, Checkbox, Form, Icon, Input, Label, Popup, Table } from "semantic-ui-react";
import Dropdown from "./components/AutoDropdown";
import CheckFormats from "./CheckFormats";
import Config from "./components/Config";
import DossierAutocomplete from "./components/DossierAutocomplete";
import Footer from "./components/Footer";
import FormatDropdown from "./components/FormatDropdown";
import FormatTauro from "./components/FormatTauro";
import Header from "./components/Header";
import InfoMessage from "./components/InfoMessage";
import InfoModal from "./components/InfoModal";
import Toast from "./components/Toast";
import InfoStockModal from "./components/InfoStockModal";
import JobsList from "./components/JobsList";
import ServerStatus from "./components/ServerStatus";
import LouisPreview from "./components/LouisPreview";
import Place from "./components/Place";
import PreviewDeco from "./components/PreviewDeco";
import HistoriqueView from "./components/HistoriqueView";
import ReferencesView from "./components/ReferencesView";
import StatsView from "./components/StatsView";
import StickerView from "./components/StickerView";
import TeinteMasseDropdown from "./components/TeinteMasseDropdown";
import VisuelDropdown from "./components/VisuelDropdown";
import WhatsNew from "./components/WhatsNew";
import { isCredenceFormat, getFinition, finitionsCompatibles, needsCredencePartner, visuelLabel } from "./utils/credence";
import { formatPrix } from "./utils/prix";

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
  const [appInfo, setAppInfo] = useState(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
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
  // Crédence 1 ex : 2e panneau = même visuel, envoyé en stock (pas de 2e commande)
  const [credenceStock, setCredenceStock] = useState(false);
  const [ville, setVille] = useState("");
  const [ex, setEx] = useState(1);
  const [isFooter, setIsFooter] = useState(false);
  const [jobsRefresh, setJobsRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("dossier");
  const [activeView, setActiveView] = useState("form");
  const [pendingCount, setPendingCount] = useState(0);
  const [isLouisOpen, setIsLouisOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [preview2, setPreview2] = useState(null);
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
  const [expandedPkGroups, setExpandedPkGroups] = useState(new Set());
  const [modalData, setModalData] = useState({
    open: false,
    message: "",
    object: null,
    error: null,
    warning: null,
    pkSaved: null,
  });
  // Visuels en stock trouvés à l'ajout : [{ stock, object }], confirmés en une seule modale
  const [stockHitsModal, setStockHitsModal] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [stockBadge, setStockBadge] = useState(null);
  const [credenceEditId, setCredenceEditId] = useState(null);
  const [credence2NumCmd, setCredence2NumCmd] = useState("");
  const [credence2File, setCredence2File] = useState(null);
  const [credence2Client, setCredence2Client] = useState("");
  const [credence2Format, setCredence2Format] = useState("");
  const [healthData, setHealthData] = useState(null);
  const [surMesureOnly, setSurMesureOnly] = useState(false);
  // Avec le filtre « Sur-mesure uniquement », les lignes masquées gardent leur coche mais ne partent pas
  const isJobVisible = (j) => !surMesureOnly || j.surMesure;
  // Soumission en cours : bloque le double clic et affiche la progression (done/total)
  const [submitProgress, setSubmitProgress] = useState(null);
  const submittingRef = useRef(false);
  // Jobs dossier soumis avec succès : DossierAutocomplete les retire de ses dossiers chargés
  const [consumedJobs, setConsumedJobs] = useState(null);
  const pathsLoadedAtRef = useRef(0);

  async function checkStockForVisuel(filename, client) {
    const base = filename.split(/[\\/]/).pop();
    if (!base || !client) { setStockBadge(null); return; }
    try {
      const res = await fetch(`${API_BASE}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: base, client }),
      });
      if (res.ok) {
        const data = await res.json();
        setStockBadge(data.stock ?? null);
      } else {
        setStockBadge(null);
      }
    } catch {
      setStockBadge(null);
    }
  }

  function showToast(message, type = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }
  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function mergeIdenticalVisuals(jobs) {
    const result = jobs.map((j) => ({ ...j }));
    const seen = new Map();
    result.forEach((j, idx) => {
      if (j.type === "profils_kits" || j._absorbedBy) return;
      const visuelName = j.selectedFileObject?.name;
      if (!visuelName) return; // pas encore de visuel résolu, rien à fusionner
      const key = [
        j.numCmd,
        j.reference || j.ref,
        visuelName,
        j.surMesure ? (j.orientation || "") : "",
        j.surMesure ? (j.printFormat || "") : "",
      ].join("|");
      if (seen.has(key)) {
        const primaryIdx = seen.get(key);
        const addedEx = Number(j.ex) || 0;
        result[primaryIdx] = {
          ...result[primaryIdx],
          ex: (Number(result[primaryIdx].ex) || 0) + addedEx,
        };
        result[idx] = { ...j, _absorbedBy: result[primaryIdx].id };
      } else {
        seen.set(key, idx);
      }
    });
    return result;
  }

  function autoPairCredences(jobs) {
    const result = jobs.map((j) => ({ ...j }));
    const credencesByDossier = {};
    result.forEach((j, idx) => {
      // BRICO/CASTO ≥ 2 ex : le backend duplique le visuel, pas d'appairage
      const autoDuplicated = (j.client === "BRICO" || j.client === "CASTO") && Number(j.ex) > 1;
      if (j.isCredence && !j._absorbedBy && !j.credence2 && !autoDuplicated) {
        if (!credencesByDossier[j.dossierNumero]) credencesByDossier[j.dossierNumero] = [];
        credencesByDossier[j.dossierNumero].push(idx);
      }
    });
    const pair = (primaryIdx, partnerIdx) => {
      result[primaryIdx] = { ...result[primaryIdx], credence2: result[partnerIdx] };
      result[partnerIdx] = { ...result[partnerIdx], _absorbedBy: result[primaryIdx].id };
    };
    for (const indices of Object.values(credencesByDossier)) {
      // Appaire d'abord par finition identique, puis les finitions inconnues avec les restes
      const byFinition = { MAT: [], BRILLANT: [], "?": [] };
      indices.forEach((idx) => byFinition[getFinition(result[idx].selectedFileObject?.name) || "?"].push(idx));
      const leftovers = [];
      for (const fin of ["MAT", "BRILLANT"]) {
        const list = byFinition[fin];
        for (let i = 0; i + 1 < list.length; i += 2) pair(list[i], list[i + 1]);
        if (list.length % 2) leftovers.push(list[list.length - 1]);
      }
      const unknown = [...byFinition["?"]];
      for (const idx of leftovers) {
        if (unknown.length) pair(idx, unknown.shift());
      }
      for (let i = 0; i + 1 < unknown.length; i += 2) pair(unknown[i], unknown[i + 1]);
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

    const dedupedJobs = mergeIdenticalVisuals(allJobs);
    const pairedJobs = autoPairCredences(dedupedJobs);

    setCheckProdBlanc(false);
    setSelectedFormat2("");
    setSelectedFile2("");
    setPerte(0);
    setStockHitsModal([]);
    setActiveTab("dossier");
    setDossierJobs(pairedJobs);
    setCredenceEditId(null);
    setCredence2NumCmd("");
    setCredence2File(null);
    setCredence2Client("");
    setCredence2Format("");

    // Auto-sélectionne les nouveaux jobs valides, préserve les sélections existantes
    // PK dans groupes mixtes (avec visuels) : pas d'auto-sélection — soumis automatiquement avec leurs visuels
    const pkOnlyDossiers = new Set(
      pairedJobs.filter(j => j.type === "profils_kits").map(j => j.dossierNumero)
    );
    pairedJobs.filter(j => j.type !== "profils_kits").forEach(j => pkOnlyDossiers.delete(j.dossierNumero));

    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      const incomingIds = new Set(pairedJobs.map((j) => j.id));
      // Retire les IDs disparus (dossier supprimé)
      prev.forEach((id) => { if (!incomingIds.has(id)) next.delete(id); });
      pairedJobs.forEach((j) => {
        if (j._absorbedBy) {
          next.delete(j.id); // Force-déselectionne les partenaires absorbés même si déjà sélectionnés
        } else if (!prev.has(j.id) && (
          // Sans format plaque, add_job refuserait la ligne (400) : l'utilisateur la coche après avoir choisi la plaque
          (j.type !== "profils_kits" && j.selectedFileObject && j.formatTauroValue) ||
          (j.type === "profils_kits" && pkOnlyDossiers.has(j.dossierNumero))
        )) {
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
    const numerosWithVisuals = new Set(
      dossierJobs.filter(j => j.type !== "profils_kits" && !j._absorbedBy).map(j => j.dossierNumero)
    );
    const allGroupJobs = dossierJobs.filter((j) => j.dossierNumero === dossierNumero && !j._absorbedBy);
    const groupJobs = numerosWithVisuals.has(dossierNumero)
      ? allGroupJobs.filter(j => j.type !== "profils_kits")
      : allGroupJobs;
    const allSelected = groupJobs.length > 0 && groupJobs.every((j) => selectedJobIds.has(j.id));
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      groupJobs.forEach((j) => { if (allSelected) next.delete(j.id); else next.add(j.id); });
      return next;
    });
  }

  function togglePkRows(dossierNumero) {
    setExpandedPkGroups(prev => {
      const next = new Set(prev);
      if (next.has(dossierNumero)) next.delete(dossierNumero);
      else next.add(dossierNumero);
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

  // Problèmes bloquants d'une ligne visuel (mêmes règles que la validation de handleJobSubmit)
  function getDossierJobIssues(job) {
    if (job.type === "profils_kits" || job._absorbedBy) return [];
    const issues = [];
    if (!job.formatTauroValue) issues.push("Format plaque à choisir");
    if (!job.selectedFileObject) issues.push("Visuel manquant");
    if (needsCredencePartner(job) && !job.credence2) issues.push("2e panneau requis (appairer, autre visuel ou +1 stock)");
    if (job.credence2 && !finitionsCompatibles(job.selectedFileObject?.name, job.credence2.selectedFileObject?.name)) {
      issues.push("Finitions incompatibles entre les 2 panneaux");
    }
    return issues;
  }

  function scrollToJobRow(jobId) {
    const row = document.querySelector(`[data-job-id="${CSS.escape(String(jobId))}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("job-row--flash");
    void row.offsetWidth; // relance l'animation
    row.classList.add("job-row--flash");
  }

  function toggleCredenceStock(jobIds, on) {
    const ids = new Set(jobIds);
    setCredenceEditId(null);
    setDossierJobs((prev) =>
      prev.map((j) => (ids.has(j.id) ? { ...j, credence2: on ? { _stock: true } : null } : j)),
    );
  }

  function openCredenceForm(job) {
    const opening = credenceEditId !== job.id;
    setCredenceEditId(opening ? job.id : null);
    // Pré-remplit avec le 2e panneau manuel existant, sinon le format du 1er panneau
    const existing = opening && job.credence2?._manual ? job.credence2 : null;
    setCredence2Client(existing?.client || "");
    setCredence2Format(opening ? existing?.formatPath || job.formatPath || "" : "");
    setCredence2File(existing?.selectedFileObject || null);
    setCredence2NumCmd(existing?.numCmd || "");
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

  //Get Format Tauro
  useEffect(() => {
    fetch(`${API_BASE}/formatsTauro`, {
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

  // Version de l'appli (+ commit, date de build et alerte de mise à jour)
  useEffect(() => {
    fetch(`${API_BASE}/version`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setAppInfo)
      .catch((err) => console.error(err));
  }, []);

  // /path renvoie les dossiers de visuels de tous les clients : un seul scan des partages
  // réseau suffit (bouton « Actualiser » ou retour sur l'onglet après 2 min pour les nouveaux fichiers)
  function loadPaths({ silent = false } = {}) {
    if (!silent) setIsLoading(true);
    pathsLoadedAtRef.current = Date.now();
    return fetch(`${API_BASE}/path`, {
      method: "GET",
      headers: {
        Accept: "Application/json",
      },
    })
      .then((res) => res.json())
      .then((res) => {
        if (Array.isArray(res)) {
          setData(res);
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
  }

  useEffect(() => {
    loadPaths();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - pathsLoadedAtRef.current > 120000) {
        loadPaths({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const handleClose = () => {
    setModalData({
      open: false,
      message: "",
      object: null,
      error: null,
      warning: null,
    });
  };

  const handleValidateStock = async (selected) => {
    setStockHitsModal([]);
    const messages = [];
    const errors = [];
    // Le serveur recalcule la quantité réellement disponible et scinde le job si le
    // stock ne couvre pas toute la commande (voir applyStockToJob côté back).
    for (const { object } of selected) {
      try {
        const response = await fetch(`${API_BASE}/edit_job`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _id: object?._id, useStock: true }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Une erreur est survenue");
        if (result.message) messages.push(result.message);
      } catch (error) {
        errors.push(`N°${object?.cmd ?? "?"} : ${error.message}`);
      }
    }
    if (messages.length > 0) {
      showToast(messages.length === 1 ? messages[0] : `${messages.length} visuels pris en stock`);
    }
    if (errors.length > 0) setModalData({ open: true, message: "", object: null, error: errors.join(" · ") });
    setJobsRefresh((prev) => prev + 1);
  };

  const handleJobSubmit = async (e) => {
    e?.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitJobs();
    } finally {
      submittingRef.current = false;
      setSubmitProgress(null);
    }
  };

  const submitJobs = async () => {
    // Mode dossier : soumettre uniquement les jobs sélectionnés
    if (dossierJobs.length > 0) {
      const jobsToSubmit = dossierJobs.filter((j) => selectedJobIds.has(j.id) && !j._absorbedBy && isJobVisible(j));
      if (jobsToSubmit.length === 0) return;

      const visualJobsToSubmit = jobsToSubmit.filter((j) => j.type !== "profils_kits");
      // PK groupes 100% PK : explicitement sélectionnés via checkbox de groupe
      const explicitPkJobs = jobsToSubmit.filter((j) => j.type === "profils_kits");
      // PK groupes mixtes : dérivés des numéros de dossier des visuels soumis
      const selectedDossierNumeros = new Set(visualJobsToSubmit.map(j => j.dossierNumero));
      const dossierNumerosWithVisualsSet = new Set(
        dossierJobs.filter(j => j.type !== "profils_kits" && !j._absorbedBy).map(j => j.dossierNumero)
      );
      const derivedPkJobs = dossierJobs.filter(j =>
        j.type === "profils_kits" &&
        !j._absorbedBy &&
        dossierNumerosWithVisualsSet.has(j.dossierNumero) &&
        selectedDossierNumeros.has(j.dossierNumero)
      );
      const pkJobsToSubmit = [...explicitPkJobs, ...derivedPkJobs];

      // Lignes bloquantes déjà signalées dans le tableau : on y amène l'utilisateur au lieu d'une modale
      const issueJobs = visualJobsToSubmit.filter((j) => getDossierJobIssues(j).length > 0);
      if (issueJobs.length > 0) {
        const first = issueJobs[0];
        scrollToJobRow(first.id);
        showToast(
          `${issueJobs.length} ligne${issueJobs.length > 1 ? "s" : ""} à corriger — N°${first.numCmd || first.id} : ${getDossierJobIssues(first)[0]}`,
          "error",
        );
        return;
      }

      try {
        const errors = [];
        const warnings = [];
        const succeededIds = [];
        const stockHits = [];
        const pkNumCmdCount = new Set(pkJobsToSubmit.map((j) => j.numCmd)).size;
        const total = visualJobsToSubmit.length + pkNumCmdCount;
        let done = 0;
        setSubmitProgress({ done, total });

        for (const job of visualJobsToSubmit) {
          // "+1 stock" : le backend duplique le visuel 1 en panneau stock (cmd2 = 0)
          const credenceStock = !!job.credence2?._stock && Number(job.ex) === 1;
          const payload = {
            complementStock: credenceStock,
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
            sousDossier: job.sousNumero || "",
            sousDossier2: job.credence2?.sousNumero || "",
            prix: job.prix,
            prix2: job.credence2?.prix,
            ville: job.ville || "",
            ex: job.ex || 1,
            perte: 0,
            regmarks: checkGenerate.reg,
            cut: checkGenerate.cut,
            teinteMasse: job.teinteMasse ?? false,
            surMesure: job.surMesure ?? false,
            surMesureKind: job.surMesureKind ?? null,
            orientation: job.orientation ?? "",
            printFormat: job.printFormat ?? "",
            stock: false,
          };
          const response = await fetch(`${API_BASE}/add_job`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            errors.push(result.error || `Erreur ${response.status} (job ${job.numCmd || job.id})`);
          } else {
            succeededIds.push(job.id);
            if (result.refCrossClientWarning)
              warnings.push(`N°${job.numCmd || job.id} : ${result.refCrossClientWarning}`);
            if (result.prodBlancCorrected)
              warnings.push(`N°${job.numCmd || job.id} : Prod blanc activé automatiquement (ref base marquée blanc)`);
            if (result.stock?.ex > 0) stockHits.push({ stock: result.stock, object: result.object });
          }
          setSubmitProgress({ done: ++done, total });
        }

        const pkConfirmations = [];
        const pkByNumCmd = new Map();
        const explicitPkNumCmds = new Set(explicitPkJobs.map((j) => j.numCmd));
        for (const pk of pkJobsToSubmit) {
          if (!pkByNumCmd.has(pk.numCmd)) pkByNumCmd.set(pk.numCmd, []);
          pkByNumCmd.get(pk.numCmd).push(pk);
        }
        for (const [numCmd, pks] of pkByNumCmd.entries()) {
          const pk = pks[0];
          const response = await fetch(`${API_BASE}/save_profils_kits`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ numCmd, client: pk.client, pkOnly: explicitPkNumCmds.has(numCmd), ville: pk.ville || "" }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            errors.push(result.error || `Erreur ${response.status} (profils/kits ${numCmd})`);
          } else {
            pks.forEach((p) => succeededIds.push(p.id));
            if (result.alreadyExists) {
              pkConfirmations.push(`N°${numCmd} (${pk.client}) — déjà présent en base`);
            } else if (result.articles?.length > 0) {
              const lines = result.articles.map(
                (a) => `${a.type === "kit" ? "Kit de pose" : "Profil"} — ${a.libelle || a.ref} × ${a.quantite ?? "?"}`,
              );
              pkConfirmations.push(`N°${numCmd} (${pk.client}) — ${result.articles.length} article(s) enregistré(s) : ${lines.join(" | ")}`);
            }
          }
          setSubmitProgress({ done: ++done, total });
        }

        if (errors.length === 0) {
          setDossierJobs([]);
          setSelectedJobIds(new Set());
          setConsumedJobs({ all: true });
          if (warnings.length > 0 || pkConfirmations.length > 0) {
            setModalData({ open: true, message: "Commandes ajoutées", object: null, error: null, warning: warnings.length > 0 ? warnings.join("\n") : null, pkSaved: pkConfirmations.length > 0 ? pkConfirmations : null });
          } else {
            showToast(`${total} commande${total > 1 ? "s" : ""} ajoutée${total > 1 ? "s" : ""} à la file`);
          }
        } else {
          const succeededSet = new Set(succeededIds);
          const isConsumed = (j) => succeededSet.has(j.id) || succeededSet.has(j._absorbedBy);
          setDossierJobs((prev) => prev.filter((j) => !isConsumed(j)));
          setSelectedJobIds((prev) => {
            const next = new Set(prev);
            succeededSet.forEach((id) => next.delete(id));
            return next;
          });
          // Sans ça, retirer une étiquette de dossier ferait réapparaître les lignes déjà ajoutées
          if (succeededIds.length > 0) {
            setConsumedJobs({ ids: new Set(dossierJobs.filter(isConsumed).map((j) => j.id)) });
          }
          setModalData({ open: true, message: "", object: null, error: errors.join(" · "), warning: warnings.length > 0 ? warnings.join("\n") : null, pkSaved: pkConfirmations.length > 0 ? pkConfirmations : null });
        }
        if (stockHits.length > 0) setStockHitsModal(stockHits);
        setJobsRefresh((prev) => prev + 1);
      } catch (err) {
        setModalData({ open: true, message: "", object: null, error: err.message, warning: null });
      }
      return;
    }

    // Mode normal : un seul job via le formulaire
    const _isCredenceFormat = isCredenceFormat(selectedFormat);
    const _credenceStock =
      credenceStock && _isCredenceFormat && (checkFolder === "BRICO" || checkFolder === "CASTO") && Number(ex) === 1;
    if (_isCredenceFormat && (checkFolder === "BRICO" || checkFolder === "CASTO") && !_credenceStock) {
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
      format2: _credenceStock ? "" : selectedFormat2,
      visuel: selectedFile,
      visuel2: _credenceStock ? "" : selectedFile2,
      numCmd: numCmd,
      numCmd2: _credenceStock ? "" : numCmd2,
      complementStock: _credenceStock,
      ville: ville,
      ex: ex,
      perte: perte,
      regmarks: checkGenerate.reg,
      cut: checkGenerate.cut,
      teinteMasse: checkGenerate.teinteMasse,
      surMesure: false,
      surMesureKind: null,
      orientation: "",
      printFormat: "",
      stock: false,
    };

    setSubmitProgress({ done: 0, total: 1 });
    try {
      const response = await fetch(`${API_BASE}/add_job`, {
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
        setStockHitsModal([{ stock: result.stock, object: result.object }]);
      } else {
        const notices = [
          result.refCrossClientWarning,
          result.prodBlancCorrected ? "Prod blanc activé automatiquement (ref base marquée blanc)" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        if (!notices && !result.object?.visuel2) {
          showToast(result.message || "Commande ajoutée");
        } else {
          setModalData({
            open: true,
            message: result.message,
            object: result.object,
            error: null,
            warning: notices || null,
          });
        }
      }
    } catch (err) {
      setModalData({
        open: true,
        message: "",
        object: null,
        error: err.message,
        warning: null,
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
    setCredenceStock(false);
    setVille("");
    setEx(1);
    setFiles([{ name: "", fileSize: "" }]);
    setFiles2([{ name: "", fileSize: "" }]);
    setIsFile(false);
    setIsFile2(false);
    setPerte("");
    setCheckProdBlanc(false);
    setPreview(null);
    setPreview2(null);
    setStockBadge(null);
    setDossierJobs([]);
    setConsumedJobs({ all: true });
    setCheckGenerate({
      cut: false,
      reg: true,
      teinteMasse: false,
    });
    setSelectedJobIds(new Set());
  };

  // Saisie manuelle : changer de client ne vide que ce qui dépend du client (formats, visuels,
  // 2e panneau, options LM) ; plaque Tauro, N° commande, ville et exemplaires sont conservés
  const handleClientChange = (c) => {
    if (c === checkFolder) return;
    setCheckFolder(c);
    setSelectedFormat("");
    setSelectedFormat2("");
    setSelectedFile("");
    setSelectedFile2("");
    setFileSize("");
    setFileSize2("");
    setFiles([{ name: "", fileSize: "" }]);
    setFiles2([{ name: "", fileSize: "" }]);
    setIsFile(false);
    setIsFile2(false);
    setNumCmd2("");
    setCredenceStock(false);
    setCheckProdBlanc(false);
    setPreview(null);
    setPreview2(null);
    setStockBadge(null);
    setPerte("");
    setError((e) => ({ ...e, format: false, visuel: false }));
    setEnabled((en) => ({ ...en, visu: true }));
    setWarnMsg((w) => ({ ...w, hidden: true }));
    if (c !== "LM") setCheckGenerate((g) => ({ ...g, cut: false, teinteMasse: false }));
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

  useEffect(() => {
    if (activeTab !== "manuel") setWarnMsg((w) => (/format/i.test(w.header) ? { ...w, hidden: true } : w));
  }, [activeTab]);

  const odbcOk = healthData?.odbc === "connected";
  const symlinkStatus = healthData?.symlinks ?? {};
  const anySymlinkOk = Object.values(symlinkStatus).some(Boolean);

  const hasFormContent =
    dossierJobs.length > 0 ||
    !!selectedFormatTauro ||
    !!selectedFormat ||
    !!selectedFile ||
    !!numCmd ||
    !!ville;

  const selectedVisibleCount = dossierJobs.filter((j) => selectedJobIds.has(j.id) && isJobVisible(j)).length;

  // Confirmation avant de quitter uniquement s'il y a une saisie à perdre
  useEffect(() => {
    if (!hasFormContent) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ""; // nécessaire pour Chrome
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasFormContent]);

  // Raccourcis : « / » recherche dossier, Ctrl+Entrée ajouter, Alt+1…6 changer de vue
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
      if (e.altKey && !e.ctrlKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        setActiveView(VIEWS[Number(e.key) - 1]);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveView("form");
        if (odbcOk || !healthData) setActiveTab("dossier");
        setTimeout(() => document.getElementById("dossier-search")?.focus(), 0);
      } else if (e.key === "Enter" && e.ctrlKey && !e.defaultPrevented && activeView === "form" && !document.querySelector(".ui.modal")) {
        e.preventDefault();
        document.getElementById("job-form")?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, odbcOk, healthData]);

  return (
    <div className="container">
      <Header
        appInfo={appInfo}
        onVersionClick={() => setWhatsNewOpen(true)}
        onFichiers={() => setIsLouisOpen(true)}
        configNode={<Config />}
        statusNode={<ServerStatus onHealthChange={setHealthData} />}
        activeView={activeView}
        onViewChange={setActiveView}
        pendingCount={pendingCount}
        theme={theme}
        onThemeToggle={toggleTheme}
      />
      <WhatsNew
        currentVersion={appInfo?.version}
        manualOpen={whatsNewOpen}
        onManualClose={() => setWhatsNewOpen(false)}
      />

      <div className="view-area">
      <div className={`main-area${activeView !== "form" ? " hidden" : ""}`}>
        <div className={`form-panel${activeTab === "dossier" && dossierJobs.length > 0 ? " form-panel--wide" : ""}`}>
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
            <div className="mode-tabs__tools">
              <button
                type="button"
                className="reset-btn"
                onClick={() => loadPaths()}
                disabled={isLoading}
                title="Relire les dossiers de visuels sur le réseau (nouveaux fichiers)"
              >
                <Icon name="refresh" size="small" loading={isLoading} />
                Actualiser
              </button>
              {hasFormContent && (
                <button
                  type="button"
                  className="reset-btn"
                  onClick={handleResetForm}
                  title="Vider le formulaire"
                >
                  <Icon name="times" size="small" />
                  Vider
                </button>
              )}
            </div>
          </div>

          <Form id="job-form" onSubmit={handleJobSubmit}>
            {/* Mode dossier */}
            {activeTab === "dossier" && (
              <>
                <DossierAutocomplete
                  pathData={data[0] || {}}
                  formatTauro={formatTauro}
                  onAutoFill={handleDossierAutoFill}
                  consumedJobs={consumedJobs}
                  gamesysOk={healthData ? odbcOk : undefined}
                />
                {dossierJobs.length === 0 && (
                  <div className="dossier-empty-state">
                    <Icon name="folder outline" size="large" />
                    <span>Saisis un N° de dossier ou un nom de client</span>
                  </div>
                )}
                {dossierJobs.length > 0 && (() => {
                  const groups = dossierJobs.reduce((acc, job, i) => {
                    if (job._absorbedBy) return acc;
                    const key = job.dossierNumero || "?";
                    if (!acc[key]) acc[key] = { client: job.client, prixTotal: job.dossierPrixTotal, jobs: [] };
                    acc[key].jobs.push({ ...job, _idx: i });
                    return acc;
                  }, {});
                  const dossierNumerosWithVisuals = new Set(
                    dossierJobs.filter(j => j.type !== "profils_kits" && !j._absorbedBy).map(j => j.dossierNumero)
                  );
                  const visibleJobs = dossierJobs
                    .filter((j) =>
                      !j._absorbedBy &&
                      (j.type !== "profils_kits" || !dossierNumerosWithVisuals.has(j.dossierNumero))
                    )
                    .filter((j) => !surMesureOnly || j.surMesure);
                  const visibleSelectedCount = visibleJobs.filter((j) => selectedJobIds.has(j.id)).length;
                  const allSelected = visibleJobs.length > 0 && visibleSelectedCount === visibleJobs.length;
                  const someSelected = visibleSelectedCount > 0 && !allSelected;
                  const hasCredences = dossierJobs.some((j) => j.isCredence);
                  const unpairedCredences = dossierJobs.filter(
                    (j) => needsCredencePartner(j) && !j._absorbedBy && !j.credence2 && selectedJobIds.has(j.id),
                  );
                  const pairedCredences = dossierJobs.filter((j) => j.isCredence && !j._absorbedBy && j.credence2);
                  const incompatibleCredences = pairedCredences.filter(
                    (j) => !finitionsCompatibles(j.selectedFileObject?.name, j.credence2?.selectedFileObject?.name),
                  );
                  return (
                    <div className="dossier-table-wrapper">
                      <label className="filter-toggle">
                        <input
                          type="checkbox"
                          checked={surMesureOnly}
                          onChange={(e) => setSurMesureOnly(e.target.checked)}
                        />
                        Sur-mesure uniquement
                      </label>
                      {hasCredences && (
                        <div className="credence-summary">
                          <Icon name="clone" />
                          <span>
                            Crédences : <strong>{pairedCredences.length}</strong> plaque{pairedCredences.length > 1 ? "s" : ""} amalgamée{pairedCredences.length > 1 ? "s" : ""}
                            {unpairedCredences.length > 0 && (
                              <> · <strong className="credence-summary__todo">{unpairedCredences.length}</strong> à compléter</>
                            )}
                            {incompatibleCredences.length > 0 && (
                              <> · <strong className="credence-summary__todo">{incompatibleCredences.length}</strong> finition{incompatibleCredences.length > 1 ? "s" : ""} incompatible{incompatibleCredences.length > 1 ? "s" : ""}</>
                            )}
                          </span>
                        </div>
                      )}
                      {unpairedCredences.length > 0 && (
                        <div className="credence-unpaired-warning">
                          <Icon name="warning sign" color="orange" />
                          <span>
                            {unpairedCredences.length} crédence{unpairedCredences.length > 1 ? "s" : ""} BRICO/CASTO 1 ex sans 2e panneau
                            ({unpairedCredences.map((j) => `N°${j.numCmd || "?"}`).join(", ")}) — appairez-les, choisissez
                            un &laquo;&nbsp;Autre visuel&nbsp;&raquo; ou complétez la plaque en stock.
                          </span>
                          <Button
                            type="button"
                            size="mini"
                            compact
                            color="teal"
                            onClick={() => toggleCredenceStock(unpairedCredences.map((j) => j.id), true)}
                          >
                            Tout compléter en stock
                          </Button>
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
                            <Table.HeaderCell style={{ textAlign: "center" }}>
                              <Popup
                                content="Prod avec blanc — impression sur fond blanc"
                                trigger={<Icon name="adjust" size="small" aria-label="Prod avec blanc" style={{ cursor: "help" }} />}
                                position="top center"
                                size="mini"
                              />
                            </Table.HeaderCell>
                            <Table.HeaderCell style={{ textAlign: "center" }}>
                              <Popup
                                content="Teinte masse — couleur de fond du panneau"
                                trigger={<Icon name="tint" size="small" aria-label="Teinte masse" style={{ cursor: "help" }} />}
                                position="top center"
                                size="mini"
                              />
                            </Table.HeaderCell>
                            {hasCredences && (
                              <Table.HeaderCell>
                                <Popup
                                  content="Crédence — 2e panneau à amalgamer"
                                  trigger={<span style={{ cursor: "help" }} aria-label="Crédence — 2e panneau"><Icon name="clone" size="small" /> 2e panneau</span>}
                                  position="top center"
                                  size="mini"
                                />
                              </Table.HeaderCell>
                            )}
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {Object.entries(groups).map(([dossierNumero, group]) => {
                            const groupJobs = group.jobs.filter((j) => !surMesureOnly || j.surMesure);
                            if (surMesureOnly && groupJobs.length === 0) return null;
                            const isMixedGroup = dossierNumerosWithVisuals.has(dossierNumero);
                            const selectableGroupJobs = isMixedGroup
                              ? groupJobs.filter(j => j.type !== "profils_kits")
                              : groupJobs;
                            const allGroupSel = selectableGroupJobs.length > 0 && selectableGroupJobs.every((j) => selectedJobIds.has(j.id));
                            const someGroupSel = selectableGroupJobs.some((j) => selectedJobIds.has(j.id)) && !allGroupSel;
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
                                    {(() => {
                                      const pkGroupJobs = groupJobs.filter(j => j.type === "profils_kits");
                                      const visualCount = groupJobs.length - pkGroupJobs.length;
                                      const pkExpanded = expandedPkGroups.has(dossierNumero);
                                      return (
                                        <>
                                          Dossier {dossierNumero} — {visualCount} job{visualCount > 1 ? "s" : ""}
                                          {group.prixTotal !== undefined && (
                                            <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: "normal" }}>
                                              · {formatPrix(group.prixTotal)}
                                            </span>
                                          )}
                                          {isMixedGroup && pkGroupJobs.length > 0 && (
                                            <span
                                              className="pk-toggle-badge"
                                              onClick={() => togglePkRows(dossierNumero)}
                                            >
                                              <Icon name={pkExpanded ? "chevron up" : "chevron down"} size="small" style={{ margin: 0 }} />
                                              {pkGroupJobs.length} profil{pkGroupJobs.length > 1 ? "s" : ""}/kit{pkGroupJobs.length > 1 ? "s" : ""}
                                            </span>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </Table.Cell>
                                </Table.Row>
                                {groupJobs.map((job) => {
                                  const folders = data[0]?.[job.client] || [];
                                  const rowFiles = folders.find((f) => f.path === job.formatPath)?.files || [];
                                  const isSelected = selectedJobIds.has(job.id);
                                  const rowIssues = getDossierJobIssues(job);
                                  return (
                                    <Fragment key={job.id || job._idx}>
                                    {job.type === "profils_kits" ? (
                                      isMixedGroup && !expandedPkGroups.has(dossierNumero) ? null :
                                      <Table.Row className={(!isMixedGroup && !isSelected) ? "job-row-deselected" : ""}>
                                        <Table.Cell>
                                          {!isMixedGroup && (
                                            <Checkbox
                                              checked={isSelected}
                                              onChange={() => toggleJobSelection(job.id)}
                                            />
                                          )}
                                        </Table.Cell>
                                        <Table.Cell colSpan={3} style={{ verticalAlign: "middle" }}>
                                          <Label size="mini" className="pk-article-label">
                                            <Icon name="configure" />
                                            {job.articleType === "kit" ? "Kit de pose" : "Profil"}
                                          </Label>
                                          <span style={{ marginLeft: 8, fontSize: "0.85em", opacity: 0.75 }}>
                                            {job.libelle || job.ref}
                                          </span>
                                          {job.prix !== undefined && (
                                            <span style={{ marginLeft: 8, fontSize: "0.75em", opacity: 0.6 }}>
                                              {formatPrix(job.prix)}
                                            </span>
                                          )}
                                        </Table.Cell>
                                        <Table.Cell>
                                          <Input
                                            size="small"
                                            type="number"
                                            value={job.numCmd || ""}
                                            onChange={(_, d) => updateDossierJob(job._idx, { numCmd: d.value })}
                                          />
                                        </Table.Cell>
                                        <Table.Cell>
                                          <Input
                                            size="small"
                                            value={job.ville || ""}
                                            onChange={(_, d) => updateDossierJob(job._idx, { ville: d.value.toUpperCase() })}
                                          />
                                        </Table.Cell>
                                        <Table.Cell style={{ textAlign: "center" }}>
                                          <strong>{job.quantite > 0 ? job.quantite : "—"}</strong>
                                        </Table.Cell>
                                        <Table.Cell style={{ textAlign: "center", color: "var(--text-muted, #aaa)" }}>—</Table.Cell>
                                        <Table.Cell style={{ textAlign: "center", color: "var(--text-muted, #aaa)" }}>—</Table.Cell>
                                        {hasCredences && <Table.Cell />}
                                      </Table.Row>
                                    ) : (
                                    <Table.Row
                                      data-job-id={job.id}
                                      className={!isSelected ? "job-row-deselected" : rowIssues.length > 0 ? "job-row--issue" : ""}
                                    >
                                      <Table.Cell>
                                        <Checkbox
                                          checked={isSelected}
                                          onChange={() => toggleJobSelection(job.id)}
                                        />
                                        {isSelected && rowIssues.length > 0 && (
                                          <Popup
                                            size="mini"
                                            position="right center"
                                            content={<ul className="job-issues">{rowIssues.map((m) => <li key={m}>{m}</li>)}</ul>}
                                            trigger={<Icon name="warning circle" color="red" className="job-issue-icon" aria-label="Ligne à corriger" />}
                                          />
                                        )}
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Dropdown
                                          compact selection search
                                          placeholder="Plaque à choisir…"
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
                                            placeholder={rowFiles.length ? "Aucun visuel trouvé — choisir…" : "Aucun visuel dans ce format"}
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
                                        {job.prix !== undefined && (
                                          <div style={{ fontSize: "0.75em", opacity: 0.6, marginTop: 2 }}>
                                            {formatPrix(job.prix)}
                                          </div>
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
                                        <button
                                          type="button"
                                          className={`toggle-chip toggle-chip--pb${job.prodBlanc ? " toggle-chip--on" : ""}`}
                                          title={job.prodBlanc ? "Prod avec blanc : ON" : "Prod avec blanc : OFF"}
                                          onClick={() => updateDossierJob(job._idx, { prodBlanc: !job.prodBlanc })}
                                        >
                                          PB
                                        </button>
                                      </Table.Cell>
                                      <Table.Cell style={{ textAlign: "center" }}>
                                        <button
                                          type="button"
                                          className={`toggle-chip toggle-chip--tm${job.teinteMasse ? " toggle-chip--on" : ""}`}
                                          title={job.teinteMasse ? "Teinte masse : ON" : "Teinte masse : OFF"}
                                          onClick={() => updateDossierJob(job._idx, job.teinteMasse
                                            ? { teinteMasse: false, selectedFileObject: job._visuelAvantTM ?? null, _visuelAvantTM: undefined }
                                            : { teinteMasse: true, selectedFileObject: null, _visuelAvantTM: job.selectedFileObject })}
                                        >
                                          TM
                                        </button>
                                        {job.surMesure && (
                                          <span className="badge badge--surmesure" title="Panneau sur-mesure">
                                            SUR-MESURE{job.printFormat ? ` · ${job.printFormat.replace("x", " × ").replace(/\./g, ",")}` : ""}
                                          </span>
                                        )}
                                      </Table.Cell>
                                      {hasCredences && (
                                        <Table.Cell>
                                          {job.isCredence && (() => {
                                            const c2 = job.credence2;
                                            const isBricoCasto = job.client === "BRICO" || job.client === "CASTO";
                                            const autoDuplicated = isBricoCasto && Number(job.ex) > 1;
                                            const fin1 = getFinition(job.selectedFileObject?.name);
                                            const finOk = !c2 || finitionsCompatibles(job.selectedFileObject?.name, c2.selectedFileObject?.name);
                                            const status = !finOk
                                              ? { color: "red", text: "Finitions ≠", tip: `Panneau 1 : ${fin1} · panneau 2 : ${getFinition(c2.selectedFileObject?.name)}. Les deux panneaux doivent avoir la même finition.` }
                                              : c2?._stock
                                              ? { color: "teal", text: "1 panneau + 1 stock", tip: "Le 2e panneau reprend le même visuel et part en stock" }
                                              : c2
                                              ? { color: "green", text: "2 panneaux", tip: "Plaque amalgamée avec 2 visuels différents" }
                                              : autoDuplicated
                                              ? { color: "blue", text: `Visuel ×2 auto`, tip: `${job.ex} ex : le même visuel est amalgamé 2 fois sur la plaque` }
                                              : isBricoCasto
                                              ? { color: "red", text: "2e panneau requis", tip: "Crédence BRICO/CASTO 1 ex : appairez, complétez ou ajoutez 1 stock" }
                                              : { color: "yellow", text: "1 panneau", tip: "Crédence seule sur la plaque" };
                                            const partnerOptions = dossierJobs
                                              .filter((j) =>
                                                j.isCredence &&
                                                j.id !== job.id &&
                                                j.selectedFileObject &&
                                                (!j._absorbedBy || j._absorbedBy === job.id) &&
                                                !j.credence2 &&
                                                !((j.client === "BRICO" || j.client === "CASTO") && Number(j.ex) > 1)
                                              )
                                              .map((j) => {
                                                const ok = finitionsCompatibles(job.selectedFileObject?.name, j.selectedFileObject?.name);
                                                const fin = getFinition(j.selectedFileObject?.name);
                                                return {
                                                  key: j.id,
                                                  value: j.id,
                                                  disabled: !ok,
                                                  text: `N°${j.numCmd || "?"} — ${visuelLabel(j.selectedFileObject) || j.libelle || j.id}${fin ? ` (${fin})` : ""}${ok ? "" : " — finition ≠"}`,
                                                };
                                              });
                                            return (
                                              <div className="credence-cell">
                                                <Popup
                                                  content={status.tip}
                                                  size="mini"
                                                  position="top center"
                                                  trigger={<Label size="mini" color={status.color} style={{ cursor: "help" }}>{status.text}</Label>}
                                                />
                                                {c2 && !c2._stock && (
                                                  <button
                                                    type="button"
                                                    className="credence-cell__partner"
                                                    title={`Aperçu : ${c2.selectedFileObject?.name || ""}`}
                                                    disabled={!c2.selectedFileObject?.name}
                                                    onClick={() => setDossierPreview(c2.selectedFileObject?.name || null)}
                                                  >
                                                    <Icon name="eye" size="small" />
                                                    {visuelLabel(c2.selectedFileObject) || "?"}
                                                    {c2.numCmd ? ` · N°${c2.numCmd}` : ""}
                                                  </button>
                                                )}
                                                {!autoDuplicated && (
                                                  <>
                                                    {!c2?._manual && !c2?._stock && (partnerOptions.length > 0 || c2) && (
                                                      <Dropdown
                                                        compact selection clearable
                                                        placeholder="Appairer avec…"
                                                        options={partnerOptions}
                                                        value={c2?.id || null}
                                                        onChange={(_, d) => pairCredence(job.id, d.value || null)}
                                                      />
                                                    )}
                                                    <div className="credence-cell__actions">
                                                      {isBricoCasto && Number(job.ex) === 1 && (!c2 || c2._stock) && (
                                                        <Popup
                                                          content="Complète la plaque avec le même visuel : le 2e panneau part en stock"
                                                          size="mini"
                                                          trigger={
                                                            <Button
                                                              type="button"
                                                              size="mini"
                                                              compact
                                                              basic={!!c2?._stock}
                                                              color="teal"
                                                              onClick={() => toggleCredenceStock([job.id], !c2?._stock)}
                                                            >
                                                              {c2?._stock ? "Retirer stock" : "+1 stock"}
                                                            </Button>
                                                          }
                                                        />
                                                      )}
                                                      {(!c2 || c2._manual) && (
                                                        <Button
                                                          type="button"
                                                          size="mini"
                                                          compact
                                                          basic={credenceEditId === job.id}
                                                          color="orange"
                                                          onClick={() => openCredenceForm(job)}
                                                        >
                                                          {credenceEditId === job.id ? "Annuler" : c2?._manual ? "Modifier ▾" : "Autre visuel ▾"}
                                                        </Button>
                                                      )}
                                                      {c2?._manual && (
                                                        <Button
                                                          type="button"
                                                          size="mini"
                                                          compact
                                                          basic
                                                          icon="close"
                                                          title="Retirer le 2e panneau"
                                                          onClick={() => toggleCredenceStock([job.id], false)}
                                                        />
                                                      )}
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </Table.Cell>
                                      )}
                                    </Table.Row>
                                    )}
                                    {job.type !== "profils_kits" && credenceEditId === job.id && (() => {
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
                                            <div
                                              className="ui form"
                                              style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape" && !e.target.closest(".ui.dropdown.active")) setCredenceEditId(null);
                                              }}
                                            >
                                              <strong style={{ marginRight: 4, alignSelf: "flex-end", lineHeight: "35px" }}>
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
                                                  noResultsMessage={credence2Format ? "Aucun visuel" : "Choisis d'abord un format"}
                                                  options={c2Files
                                                    .filter((f) => f.name !== job.selectedFileObject?.name)
                                                    .map((f) => {
                                                      const ok = finitionsCompatibles(job.selectedFileObject?.name, f.name);
                                                      return {
                                                        key: f.name,
                                                        value: f.name,
                                                        disabled: !ok,
                                                        text: `${visuelLabel(f)}${ok ? "" : " — finition ≠"}`,
                                                      };
                                                    })}
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
                                                  onKeyDown={(e) => {
                                                    if (e.key !== "Enter") return;
                                                    e.preventDefault(); // pas de soumission du formulaire principal
                                                    if (credence2File && credence2NumCmd && credence2Format) applyManualCredence2(job.id);
                                                  }}
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
                                            </div>
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
                {(() => {
                  const hint =
                    enabled.format  ? "Choisis un client, puis un format de plaque Tauro" :
                    enabled.visu    ? "Choisis un format de visuel" :
                    enabled.numCmd  ? "Sélectionne le visuel" :
                    enabled.ville   ? "Renseigne le numéro de commande (5 ou 6 chiffres)" :
                    enabled.ex      ? "Saisis la ville ou le magasin" :
                    null;
                  return hint ? (
                    <div className="form-step-hint">
                      <Icon name="arrow right" size="small" />
                      {hint}
                    </div>
                  ) : null;
                })()}

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
                                  handleClientChange(c);
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

                <div className="form-section">
                  <span className="form-section-label">Plaque Tauro</span>
                <Form.Field className="format-tauro" required error={error.formatTauro}>
                  <div className="format-tauro-row">
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
                    className="add-button"
                    type="button"
                    icon="add"
                    color="grey"
                    size="mini"
                    title="Ajouter un format de plaque Tauro"
                    aria-label="Ajouter un format de plaque Tauro"
                    onClick={handleToggleAddFormat}
                  />
                  </div>
                  {showAddFormat && <Input id="addFormatTauro" size="small" label="Add format" placeholder="ex: 101x215" />}
                  {error.formatTauro && <span className="field-error-msg">Sélectionne un format de plaque Tauro</span>}
                </Form.Field>
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
                        isLoading={isLoading}
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
                          setStockBadge(null);
                          checkStockForVisuel(value.name, checkFolder);
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
                    {stockBadge && (
                      <div className="stock-badge">
                        <Icon name="archive" size="small" />
                        En stock&nbsp;: <strong>{stockBadge.ex} ex</strong>
                        {stockBadge.finition && <span className="stock-badge-detail">{stockBadge.finition}</span>}
                      </div>
                    )}
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
                    {(checkFolder === "BRICO" || checkFolder === "CASTO") && Number(ex) === 1 && (
                      <Form.Field>
                        <Checkbox
                          toggle
                          label="Compléter avec 1 ex du même visuel pour le stock"
                          checked={credenceStock}
                          onChange={(e, d) => {
                            setCredenceStock(d.checked);
                            if (d.checked) {
                              setSelectedFormat2("");
                              setSelectedFile2("");
                              setPreview2(null);
                              setFileSize2("");
                              setNumCmd2("");
                              setError({ ...error, numCmd: false });
                            }
                          }}
                        />
                      </Form.Field>
                    )}
                    {!(credenceStock && Number(ex) === 1) && (
                    <>
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
                        isLoading={isLoading}
                        isFile={isFile2}
                        files={files2}
                        value={selectedFile2}
                        text={selectedFile2}
                        selectedFile={selectedFile2}
                        onSelectedFile={(value) => {
                          if (!value) {
                            setSelectedFile2(null);
                            setPreview2(null);
                            setFileSize2("");
                            setCheckProdBlanc(false);
                            return;
                          }
                          const name = value.name.split("/").pop();
                          setCheckProdBlanc(REGEX_BLANC.test(name));
                          setSelectedFile2(value.name);
                          setPreview2(value.name);
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
                    </>
                    )}
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

            <div className={`submit-bar${
              activeTab === "dossier" && dossierJobs.length > 0 ? " submit-bar--sticky" : ""
            }`}>
              <InfoMessage
                isHidden={warnMsg.hidden}
                title={warnMsg.header}
                text={warnMsg.msg}
                icon={warnMsg.icon}
                color={warnMsg.color}
              />
              {activeTab === "dossier" && (() => {
                const issueJobs = dossierJobs.filter((j) => selectedJobIds.has(j.id) && isJobVisible(j) && getDossierJobIssues(j).length > 0);
                if (issueJobs.length === 0) return null;
                return (
                  <button
                    type="button"
                    className="submit-issues"
                    title="Aller à la première ligne à corriger"
                    onClick={() => scrollToJobRow(issueJobs[0].id)}
                  >
                    <Icon name="warning circle" />
                    {issueJobs.length} ligne{issueJobs.length > 1 ? "s" : ""} à corriger
                  </button>
                );
              })()}
              <Button
                type="submit"
                color="vk"
                size="small"
                className="submit-button"
                loading={!!submitProgress && submitProgress.total <= 1}
                disabled={!!submitProgress || (dossierJobs.length > 0 && selectedVisibleCount === 0)}
                title="Ctrl+Entrée"
                content={
                  submitProgress && submitProgress.total > 1
                    ? `Ajout ${submitProgress.done}/${submitProgress.total}…`
                    : dossierJobs.length > 0
                      ? `Ajouter (${selectedVisibleCount} sélectionné${selectedVisibleCount > 1 ? "s" : ""})`
                      : "Ajouter"
                }
              />
            </div>
          </Form>
        </div>

        {/* Panneau preview — apparaît automatiquement quand un visuel est sélectionné */}
        {(() => {
          const activePreview = activeTab === "dossier" ? dossierPreview : preview;
          return (
            <div className={`preview-panel${activePreview ? " visible" : ""}`}>
              <p className="preview-label">Aperçu visuel</p>
              <PreviewDeco fileSelected={activePreview} fileSelected2={activeTab === "manuel" ? preview2 : null} show={!!activePreview} client={checkFolder} previewList={data[0]?.Preview} />
            </div>
          );
        })()}
      </div>

      <div className={`jobs-view${activeView !== "jobs" ? " hidden" : ""}`}>
        <JobsList
          formatTauro={formatTauro}
          refreshToken={jobsRefresh}
          onPendingCountChange={setPendingCount}
        />
      </div>

      <div className={`references-view-wrapper${activeView !== "references" ? " hidden" : ""}`}>
        <ReferencesView previewList={data[0]?.Preview} />
      </div>

      <div className={`stats-view-wrapper${activeView !== "stats" ? " hidden" : ""}`}>
        {activeView === "stats" && <StatsView />}
      </div>

      <div className={`historique-view-wrapper${activeView !== "historique" ? " hidden" : ""}`}>
        {activeView === "historique" && <HistoriqueView />}
      </div>

      <div className={`sticker-view-wrapper${activeView !== "sticker" ? " hidden" : ""}`}>
        {activeView === "sticker" && <StickerView />}
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
        warning={modalData.warning}
        pkSaved={modalData.pkSaved}
      />

      <InfoStockModal
        open={stockHitsModal.length > 0}
        items={stockHitsModal}
        onClose={() => setStockHitsModal([])}
        onValidate={handleValidateStock}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
