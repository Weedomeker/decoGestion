const path = require("path");
const os = require("os");
const fs = require("fs");
const { performance } = require("perf_hooks");
const logger = require("../logger/logger");
const modifyPdf = require("../app");
const amalgameCredences = require("../amalgameCredences.js").modifyPdf;
const createDec = require("../dec");
const generateCutFile = require("../generateCutFile").generateCutFile;
const createJob = require("../jobsList");
const modelDeco = require("../models/Deco");
const refModels = require("../services/refModels");
const modelRefDeco = refModels.LM;
const checkVernis = require("../checkVernis");
const { generateStickers, createStickersPage } = require("../generateStickers");
const generateImages = require("../generateImages");
const getPreview = require("../getPreview");
const findStock = require("../findStock");
const Stocks = require("../models/Stocks");
const { state } = require("../services/appState");
const { saveProfilsKits } = require("../services/profilsKitsService");
const { saveFormatsTauroIfNeeded } = require("../services/formatsService");
const { broadcastWS, broadcastCompletedJob } = require("../services/websocketService");
const usePdfWorker = require("../utils/pdfWorker");
const { castoName } = require("../utils/jobNames");
const { extractRefFromFilename, validateRefFormat, REF_FORMAT_HINT } = require("../services/referencesCheckService");
const { decoQueue, queueEvents } = require("../services/queueService");

// Résout sur le premier modèle qui retourne un document non-null, avec son index.
// Court-circuite dès le premier résultat trouvé plutôt que d'attendre tous les modèles.
function findFirstRef(models, ref) {
  return new Promise((resolve) => {
    let remaining = models.length;
    if (remaining === 0) return resolve({ doc: null, index: -1 });
    let settled = false;
    models.forEach((model, index) => {
      const refNum = Number(ref);
      const refQuery = !isNaN(refNum) ? { $in: [String(ref), refNum] } : String(ref);
      model
        .findOne({ ref: refQuery })
        .lean()
        .then((doc) => {
          remaining--;
          if (doc && !settled) {
            settled = true;
            resolve({ doc, index });
          } else if (remaining === 0 && !settled) {
            resolve({ doc: null, index: -1 });
          }
        })
        .catch(() => {
          remaining--;
          if (remaining === 0 && !settled) resolve({ doc: null, index: -1 });
        });
    });
  });
}

function getJobs(req, res) {
  res.json(state.jobs);
}

function editJob(req, res) {
  const updates = req.body;

  if (!updates._id) {
    return res.status(400).json({ error: "ID requis" });
  }

  const objIndex = state.jobs.jobs.findIndex((obj) => String(obj._id) === String(updates._id));

  if (objIndex === -1) {
    return res.status(404).json({ error: "Objet non trouvé" });
  }

  const allowedFields = ["ville", "ex", "format", "visuel", "stock", "use", "useStock"];

  const filteredUpdates = Object.keys(updates)
    .filter((key) => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {});

  state.jobs.jobs[objIndex] = {
    ...state.jobs.jobs[objIndex],
    ...filteredUpdates,
  };

  broadcastWS({
    type: "update",
    object: state.jobs.jobs[objIndex],
  });

  res.status(200).json({
    message: "Objet mis à jour avec succès",
    object: state.jobs.jobs[objIndex],
  });
}

async function addJob(req, res) {
  const data = {
    client: req.body.client,
    allFormatTauro: req.body.allFormatTauro,
    formatTauro: req.body.formatTauro,
    prodBlanc: req.body.prodBlanc,
    format: req.body.format,
    format2: req.body.format2,
    visuel: req.body.visuel,
    visuel2: req.body.visuel2,
    numCmd: req.body.numCmd ? req.body.numCmd : 0,
    numCmd2: req.body.numCmd2 ? req.body.numCmd2 : 0,
    ville: typeof req.body.ville === "string" ? req.body.ville.toUpperCase() : "",
    ex: req.body.ex !== null ? req.body.ex : "",
    perte: req.body.perte,
    regmarks: req.body.regmarks,
    cut: req.body.cut,
    teinteMasse: req.body.teinteMasse,
    stock: req.body.stock,
  };
  if (!data.client || !data.visuel || !data.formatTauro || !data.format) {
    return res.status(400).json({ error: "Champs obligatoires manquants : client, visuel, format, formatTauro." });
  }

  let client = data.client.toUpperCase();
  const client2 = (req.body.client2 || data.client)?.toUpperCase();
  let visuel = data.visuel?.split("/").pop() || "";
  let visuel2 = data.visuel2?.split("/").pop() || "";

  if (client === "BRICO") {
    visuel = visuel.replace(".pdf", "").trim();
  }
  if (client2 === "BRICO") {
    visuel2 = visuel2.replace(".pdf", "").trim();
  }

  const visuPath = data.visuel;
  let visuPath2 = data.visuel2;
  let formatTauro = data.formatTauro?.split("_")?.pop() || "";
  let prodBlanc = data.prodBlanc;
  const format = data.format;
  let format2 = data.format2;
  const reg = data.regmarks;
  const teinteMasse = data.teinteMasse;

  // Validation du nombre d'exemplaires
  const nbEx = parseInt(data.ex);
  if (!nbEx || nbEx < 1) {
    return res.status(400).json({ error: "Le nombre d'exemplaires doit être un entier positif (≥ 1)." });
  }

  // Crédences BRICO/CASTO : règle selon le nombre d'exemplaires
  // (?!\d) évite de capturer "100x25" dans "100x255" — seules "300x60" / "255x60" matchent
  const _formatVisuCheck = format?.match(/\d{3}x\d{2}(?!\d)/i)?.[0] || "";
  if (_formatVisuCheck && (client === "BRICO" || client === "CASTO")) {
    if (nbEx === 1 && !data.visuel2) {
      return res.status(400).json({
        error: "Les crédences BRICO/CASTO (1 ex) doivent être amalgamées avec un 2e visuel différent.",
      });
    }
    if (nbEx >= 2 && !data.visuel2) {
      // 2 ex : même visuel amalgamé 2 fois sur la plaque
      data.visuel2 = data.visuel;
      data.format2 = data.format;
      visuel2 = visuel;
      visuPath2 = data.visuel;
      format2 = data.format;
    }
  }

  // Crédences : finitions incompatibles (MAT vs BRILLANT) interdites à l'amalgame
  if (_formatVisuCheck && (client === "BRICO" || client === "CASTO") && visuPath2 && visuPath2 !== visuPath) {
    const fin1 = /brillant/i.test(visuPath) ? "BRILLANT" : /mat/i.test(visuPath) ? "MAT" : null;
    const fin2 = /brillant/i.test(visuPath2) ? "BRILLANT" : /mat/i.test(visuPath2) ? "MAT" : null;
    if (fin1 && fin2 && fin1 !== fin2) {
      return res.status(400).json({
        error: `Amalgame impossible : finitions incompatibles (panneau 1 : ${fin1}, panneau 2 : ${fin2}). Les deux crédences doivent avoir la même finition.`,
      });
    }
  }

  // Vérification que les fichiers visuels existent bien sur le disque
  if (visuPath && !teinteMasse) {
    if (!fs.existsSync(path.resolve(visuPath))) {
      return res.status(400).json({ error: `Visuel introuvable sur le disque : ${visuPath}` });
    }
  }
  if (visuPath2 && !teinteMasse) {
    if (!fs.existsSync(path.resolve(visuPath2))) {
      return res.status(400).json({ error: `2e visuel introuvable sur le disque : ${visuPath2}` });
    }
  }

  state.process.writePath = prodBlanc
    ? path.join(state.paths.saveFolder, "Prod avec BLANC")
    : path.join(state.paths.saveFolder, `Deco_Std_${formatTauro}`);

  let prefixClient = "";
  if (client === null) {
    prefixClient = "";
  } else if (client === "LM") {
    prefixClient = "LM";
  } else if (client === "CASTO") {
    prefixClient = "CASTO";
  } else if (client === "BRICO") {
    prefixClient = "BRICO";
  } else if (client === "ECOM") {
    prefixClient = "ECOM";
  }

  let prefixClient2 = "";
  if (client2 === "LM") prefixClient2 = "LM";
  else if (client2 === "CASTO") prefixClient2 = "CASTO";
  else if (client2 === "BRICO") prefixClient2 = "BRICO";
  else if (client2 === "ECOM") prefixClient2 = "ECOM";

  state.process.fileName = `${data.numCmd} - ${prefixClient} ${
    data.ville ? data.ville.toUpperCase() + " - " : ""
  }${teinteMasse === true ? format?.split("_").pop()?.replace("/", "") : formatTauro} - ${visuel.replace(
    /\.[^/.]+$/,
    "",
  )} ${data.ex}_EX`;

  state.process.fileName2 = `${data.numCmd2 === 0 ? "" : data.numCmd2 + " - "}${prefixClient2} ${
    data.ville ? data.ville.toUpperCase() + " - " : ""
  }${teinteMasse === true ? format2?.split("_").pop() : formatTauro} - ${visuel2.replace(/\.[^/.]+$/, "")} ${
    data.ex
  }_EX`;

  try {
    if (!fs.existsSync(state.process.writePath)) {
      fs.mkdirSync(state.process.writePath, { recursive: true });
    }
    if (!fs.existsSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`)) {
      fs.mkdirSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`, { recursive: true });
    }
  } catch (err) {
    return res.status(500).json({ error: `Impossible de créer le dossier de sortie : ${err.message}` });
  }

  state.process.jpgName = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${state.process.fileName}`;
  state.process.jpgName2 = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${state.process.fileName2}`;

  const exactFormat = format?.match(/\d{3}x\d{2,}/i)?.[0];
  const query = { $text: { $search: visuel } };
  if (exactFormat) query.format = exactFormat;

  let findRefTeinteMasse = null;
  if (data.teinteMasse) {
    try {
      findRefTeinteMasse = await modelRefDeco
        .find(query, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(1);
    } catch (err) {
      logger.warn(`Recherche RefDeco teinte masse échouée (index texte manquant ?) : ${err.message}`);
      findRefTeinteMasse = [];
    }
  }

  let matchRef = data.teinteMasse ? findRefTeinteMasse?.[0]?.ref : extractRefFromFilename(visuel, client);
  let matchRef2 = visuel2 ? extractRefFromFilename(visuel2, client2) : null;

  // Validation du format de la référence extraite (avant toute requête MongoDB)
  if (matchRef && !teinteMasse && !validateRefFormat(matchRef, client)) {
    return res.status(400).json({
      error: `Format de référence non conforme pour le client ${client} : "${matchRef}" extrait de "${visuel}". Attendu : ${REF_FORMAT_HINT[client] || "format inconnu"}.`,
      code: "REF_FORMAT_INVALID",
    });
  }
  if (matchRef2 && visuel2 && !validateRefFormat(matchRef2, client2)) {
    return res.status(400).json({
      error: `Format de référence non conforme pour le client ${client2} (visuel 2) : "${matchRef2}" extrait de "${visuel2}". Attendu : ${REF_FORMAT_HINT[client2] || "format inconnu"}.`,
      code: "REF_FORMAT_INVALID",
    });
  }

  // Validation MongoDB des références extraites
  const RefModelClient = refModels[client];
  const RefModelClient2 = refModels[client2];
  const otherRefModels = Object.values(refModels);

  let refCrossClientWarning = null;
  let prodBlancCorrected = false;
  let refValidated = null;
  let refValidated2 = null;

  // Vérification référence 1
  if (!matchRef && !teinteMasse) {
    return res.status(400).json({
      error: `Impossible d'extraire une référence du fichier "${visuel}" pour le client ${client}.`,
      code: "REF_EXTRACTION_FAILED",
    });
  }

  if (matchRef && RefModelClient) {
    try {
      const allModels = [RefModelClient, ...otherRefModels.filter((m) => m !== RefModelClient)];
      const { doc, index: resultIndex } = await findFirstRef(allModels, matchRef);
      refValidated = doc;

      // Vérifier si la référence provient d'une collection d'un autre client
      if (refValidated && resultIndex > 0) {
        refCrossClientWarning = `Référence "${matchRef}" déclarée pour le client ${client} mais trouvée dans une autre collection. Vérifiez la cohérence.`;
        logger.warn(`⚠️ ${refCrossClientWarning}`);
      }
      if (!refValidated) {
        return res.status(400).json({
          error: `Référence "${matchRef}" introuvable en base MongoDB (client ${client}). Vérifiez que ce visuel est bien référencé.`,
          code: "REF_NOT_FOUND",
        });
      }
      // Vérification cohérence format fichier vs base
      const formatFromRef = refValidated.format?.toLowerCase();
      const formatFromFile = format?.match(/\d{2,}x\d{2,}/i)?.[0]?.toLowerCase();
      if (formatFromRef && formatFromFile && formatFromRef !== formatFromFile) {
        const msg = `Format incohérent pour la ref ${matchRef} : sélectionné=${formatFromFile}, base=${formatFromRef}. Vérifiez le format du visuel.`;
        logger.warn(`⚠️ ${msg}`);
        return res.status(400).json({ error: msg, code: "FORMAT_MISMATCH" });
      }
      // RefEcom.blanc : forcer prodBlanc si la référence est marquée blanc en base
      if (client === "ECOM" && refValidated.blanc === true && !prodBlanc) {
        logger.warn(`⚠️ RefEcom ${matchRef} marquée blanc=true en base mais prodBlanc=false — correction automatique`);
        prodBlanc = true;
        prodBlancCorrected = true;
        state.process.writePath = path.join(state.paths.saveFolder, "Prod avec BLANC");
        if (!fs.existsSync(state.process.writePath)) {
          fs.mkdirSync(state.process.writePath, { recursive: true });
        }
      }
    } catch (err) {
      logger.error(`Erreur MongoDB validation ref "${matchRef}" (${client}) : ${err.message}`);
      return res.status(500).json({ error: "Erreur lors de la vérification de la référence en base.", code: "DB_ERROR" });
    }
  }

  // Vérification référence 2 (si visuel2 présent)
  if (matchRef2 && RefModelClient2 && visuel2) {
    try {
      const allModels2 = [RefModelClient2, ...otherRefModels.filter((m) => m !== RefModelClient2)];
      const { doc: doc2, index: resultIndex2 } = await findFirstRef(allModels2, matchRef2);
      refValidated2 = doc2;

      if (refValidated2 && resultIndex2 > 0) {
        const warn2 = `Référence 2 "${matchRef2}" déclarée pour le client ${client2} mais trouvée dans une autre collection. Vérifiez la cohérence.`;
        logger.warn(`⚠️ ${warn2}`);
        refCrossClientWarning = refCrossClientWarning ? `${refCrossClientWarning} · ${warn2}` : warn2;
      }
      if (!refValidated2) {
        return res.status(400).json({
          error: `Référence 2 "${matchRef2}" introuvable en base MongoDB (client ${client2}). Vérifiez que ce visuel est bien référencé.`,
          code: "REF_NOT_FOUND",
        });
      }
      const formatFromRef2 = refValidated2.format?.toLowerCase();
      const formatFromFile2 = format2?.match(/\d{2,}x\d{2,}/i)?.[0]?.toLowerCase();
      if (formatFromRef2 && formatFromFile2 && formatFromRef2 !== formatFromFile2) {
        const msg2 = `Format incohérent pour la ref 2 ${matchRef2} : sélectionné=${formatFromFile2}, base=${formatFromRef2}. Vérifiez le format du visuel.`;
        logger.warn(`⚠️ ${msg2}`);
        return res.status(400).json({ error: msg2, code: "FORMAT_MISMATCH" });
      }
    } catch (err) {
      logger.error(`Erreur MongoDB validation ref2 "${matchRef2}" (${client2}) : ${err.message}`);
      return res.status(500).json({ error: "Erreur lors de la vérification de la référence 2 en base.", code: "DB_ERROR" });
    }
  }

  const newJob = createJob(
    client,
    data.numCmd,
    data.numCmd2,
    data.ville,
    format?.match(/\d{2,}x\d{2,}/i)?.[0],
    format2?.match(/\d{2,}x\d{2,}/i)?.[0],
    formatTauro,
    visuel,
    visuel2,
    matchRef ? matchRef : 0,
    matchRef2 ? matchRef2 : 0,
    data.ex,
    visuPath,
    visuPath2,
    state.process.writePath,
    state.process.jpgName,
    state.process.jpgName2,
    data.perte,
    reg,
    data.cut,
    data.teinteMasse,
    data.stock ? data.stock : false,
    prodBlanc,
    client2,
    refValidated || null,
    refValidated2 || null,
  );

  const jobExist = state.jobs.jobs.find(
    (item) => item.cmd === newJob.cmd && item.ref === newJob.ref && item.visuel === newJob.visuel,
  );

  const result = jobExist ? { exist: true, object: jobExist } : { exist: false, object: newJob };
  if (!result.exist) {
    state.jobs.jobs.push(newJob);
    broadcastWS({ type: "update" });
  }

  let modelStock = null;
  if (matchRef) {
    const stock = await findStock(matchRef);
    if (stock) {
      const { visuel, finition, format, ref, ex } = stock;
      modelStock = { visuel, ref, format, finition, ex };
    }
  }

  if (result.exist) {
    return res.status(200).json({
      message: "Commande déjà existante",
      object: result.object,
    });
  }

  return res.status(201).json({
    message: "Commande ajoutée",
    object: result.object,
    stock: modelStock,
    refCrossClientWarning: refCrossClientWarning || null,
    prodBlancCorrected,
  });
}

async function processJob(job, req) {
  const regexCredences = /^\d{3}x\d{2}$/i;
  const isCredences = regexCredences.test(job.format_visu);
  const isStock = job?.useStock;

  let pdfTime = 0;
  let jpgTime = 0;

  logger.info(
    `▶ Job ${job.cmd} | client=${job.client} | ref=${job.ref} | visuel=${job.visuel} | format=${job.format_visu} | ${job.ex}ex`,
  );
  if (isCredences && job.visuPath2) {
    logger.info(`  + 2e panneau | ref2=${job.ref2} | visuel2=${job.visuel2} | visuPath2=${job.visuPath2}`);
  }

  if (job.refDbData && !job.teinteMasse) {
    if (!fs.existsSync(path.resolve(job.visuPath))) {
      logger.error(`❌ Job ${job.cmd} annulé : visuel introuvable sur le disque : ${job.visuPath}`);
      broadcastWS({ type: "jobError", job, reason: "Visuel introuvable sur le disque" });
      return;
    }
    if (String(job.ref) !== String(job.refDbData.ref)) {
      logger.error(
        `❌ Job ${job.cmd} annulé : incohérence ref (job.ref=${job.ref} ≠ pinned=${job.refDbData.ref})`,
      );
      broadcastWS({ type: "jobError", job, reason: "Incohérence de référence" });
      return;
    }
  }

  const fileName = `${job.cmd} - ${job.client} ${job.ville.toUpperCase()} - ${
    job.teinteMasse ? job.format_visu.split("_").pop() : job.format_Plaque.split("_").pop()
  } - ${job.visuel.replace(/\.[^/.]+$/, "")} ${job.ex}_EX`;

  const fileName2 = isCredences
    ? `${job.cmd2 === 0 ? "" : job.cmd2 + " - "}${job.client} ${job.ville.toUpperCase()} - ${
        job.teinteMasse ? job.format2_visu.split("_").pop() : job.format_Plaque.split("_").pop()
      } - ${job.visuel2.replace(/\.[^/.]+$/, "")} ${job.ex}_EX` || ""
    : "";

  const sortFolder = req.body.sortFolder;

  try {
    if (!fs.existsSync(job.writePath)) {
      fs.mkdirSync(job.writePath, { recursive: true });
    }
    if (!fs.existsSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`)) {
      fs.mkdirSync(`${state.paths.jpgPath}/${state.paths.sessionPRINTSA}`, { recursive: true });
    }
    if (sortFolder) {
      const vernisFolder = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${
        checkVernis(fileName) === "_S" ? "Satin" : checkVernis(fileName)
      }`;
      if (!fs.existsSync(vernisFolder)) fs.mkdirSync(vernisFolder, { recursive: true });
    }
  } catch (err) {
    logger.error(`❌ Impossible de créer les dossiers pour le job ${job.cmd} : ${err.message}`);
    return;
  }

  const pdfName = `${job.writePath}/${fileName}`;
  const pdfName2 = `${job.writePath}/${fileName2}` || "";
  const jpgName = `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${fileName}`;
  const jpgName2 = isCredences ? `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${fileName2}` || "" : "";

  if (!job.teinteMasse && !isStock) {
    try {
      const startPdf = performance.now();
      if (isCredences) {
        const visuals = [{ file: job.visuPath, name: fileName }];
        if (job.visuPath2) {
          visuals.push({ file: job.visuPath2, name: fileName2 });
        }
        await amalgameCredences(
          { visuals, plaque: job.format_Plaque },
          path.join(
            job.writePath,
            `${castoName(fileName)}${job.visuPath2 ? " + " + castoName(fileName2) : ""}.pdf`,
          ),
        );
        const endPdf = performance.now();
        pdfTime = endPdf - startPdf;
      } else {
        await modifyPdf(job.visuPath, job.writePath, fileName, job.format_Plaque, job.reg);
        const endPdf = performance.now();
        pdfTime = endPdf - startPdf;
      }
    } catch (error) {
      logger.error(`Erreur de modification du PDF pour le job ${job.cmd}: ${error}`);
    }

    if (!job.teinteMasse) {
      const outPdfPath = isCredences
        ? path.join(job.writePath, `${castoName(fileName)}${job.visuPath2 ? " + " + castoName(fileName2) : ""}.pdf`)
        : `${pdfName}.pdf`;
      try {
        if (!fs.existsSync(outPdfPath) || fs.statSync(outPdfPath).size === 0) {
          logger.error(`❌ PDF de sortie manquant ou vide pour le job ${job.cmd} : ${outPdfPath}`);
        } else {
          logger.info(`✅ PDF OK (${fs.statSync(outPdfPath).size} octets) : ${path.basename(outPdfPath)}`);
        }
      } catch (err) {
        logger.error(`❌ Impossible de vérifier le PDF pour le job ${job.cmd} : ${err.message}`);
      }
    }

    const outJpgPath =
      isCredences && job.visuPath2
        ? path.join(
            `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${castoName(jpgName.split("/").pop())} + ${castoName(jpgName2.split("/").pop())}.jpg`,
          )
        : `${jpgName}.jpg`;

    const jpgDejaPresent = fs.existsSync(outJpgPath) && fs.statSync(outJpgPath).size > 0;

    if (jpgDejaPresent) {
      logger.info(`✅ JPG déjà présent, génération ignorée : ${path.basename(outJpgPath)}`);
    } else {
      try {
        const startJpg = performance.now();
        if (job.ref) {
          if (isCredences && job.visuPath2) {
            await usePdfWorker({
              pdf: path.join(
                job.writePath,
                `${castoName(pdfName.split("/").pop())} + ${castoName(pdfName2.split("/").pop())}.pdf`,
              ),
              jpg: outJpgPath,
            });
          } else {
            await getPreview(job.ref, jpgName, isStock);
          }
        } else {
          const visuelNoExt = job.visuel?.replace(/\.[^.]+$/, "") || "";
          const previewFound = visuelNoExt ? await getPreview(visuelNoExt, jpgName, isStock) : false;
          if (!previewFound) {
            await usePdfWorker({ pdf: `${pdfName}.pdf`, jpg: outJpgPath });
          }
        }
        const endJpg = performance.now();
        jpgTime = endJpg - startJpg;
      } catch (error) {
        logger.error(`Error generating JPG for job ${job.cmd}:`, error);
      }
    }

    try {
      if (!fs.existsSync(outJpgPath) || fs.statSync(outJpgPath).size === 0) {
        logger.error(`❌ JPG de sortie manquant ou vide pour le job ${job.cmd} : ${outJpgPath}`);
      } else {
        logger.info(`✅ JPG OK (${fs.statSync(outJpgPath).size} octets) : ${path.basename(outJpgPath)}`);
      }
    } catch (err) {
      logger.error(`❌ Impossible de vérifier le JPG pour le job ${job.cmd} : ${err.message}`);
    }
  } else {
    try {
      await generateImages(job, state.paths.previewDeco, `${jpgName}.jpg`, isStock);
    } catch (error) {
      logger.error(`Error generating JPG for job ${job.cmd}:`, error);
    }
  }

  const matchName1 = isCredences ? job.visuel.match(/ \d{3}x\d{2}/i) : job.visuel.match(/ \d{2,3}x\d{2,3}/i);

  let matchRef1;
  if (isCredences) {
    matchRef1 = job.client === "CASTO" ? job.visuel.match(/\d{13}/) : job.ref ? { 0: String(job.ref) } : null;
  } else {
    matchRef1 = job.visuel.match(/[A-Z]+\d*-\d+/i) || job.ref;
  }

  const deco =
    matchName1 && job.visuel.includes(matchName1[0])
      ? job.client === "CASTO"
        ? job.visuel
            .split(matchName1[0])[1]
            ?.replace(/cm/gi, "")
            ?.replace(/\.pdf$/i, "")
            ?.replace(matchRef1 ? matchRef1[0] : "", "")
            ?.replace(" MAT", "")
            .trim()
        : job.visuel.split(matchName1[0])[0].trim()
      : job.visuel;

  const matchName2 = isCredences && job.visuel2 ? job.visuel2.match(/ \d{3}x\d{2}/i) : null;

  const matchRef2 = job.visuel2
    ? isCredences
      ? job.client === "CASTO"
        ? job.visuel2.match(/\d{13}/)
        : job.ref2
          ? { 0: String(job.ref2) }
          : null
      : job.visuel2.match(/[A-Z]+\d*-\d+/i)
    : null;

  const deco2 =
    matchName2 && job.visuel2.includes(matchName2[0])
      ? job.client === "CASTO"
        ? job.visuel2
            .split(matchName2[0])[1]
            ?.replace(/cm/gi, "")
            ?.replace(/\.pdf$/i, "")
            ?.replace(matchRef2 ? matchRef2[0] : "", "")
            ?.replace(" MAT", "")
            .trim()
        : job.visuel2.split(matchName2[0])[0].trim()
      : job.visuel2;

  const saveDeco = async ({ cmd, visuel, formatVisu, ref, temps }) => {
    const safeRef = ref && String(ref) !== "0" ? ref : null;
    const data = {
      date: job.date,
      client: job.client,
      numCmd: cmd || 0,
      mag: job.ville,
      dibond: job.format_Plaque,
      deco: visuel,
      ref: safeRef,
      format: formatVisu?.split("_").pop().replace("/", ""),
      ex: parseInt(job.ex),
      temps,
      perte: job.perte ? parseFloat(job.perte) : 0,
      status: safeRef ? "" : "ref_invalide",
      app_version: `v${state.appVersion}`,
      ip: req.ip.split(":").pop() === "1" || req.hostname === "localhost" ? os.hostname() : req.ip.split(":").pop(),
      comment: isStock ? `Pris en stock le ${new Date().toLocaleString()}` : "",
      prodBlanc: !!job.prodBlanc,
    };
    const newDeco = new modelDeco(data);
    await newDeco.save();
  };

  try {
    const totalTime = parseFloat((((jpgTime ?? 0) + (pdfTime ?? 0)) / 1000).toFixed(2)) || 0;
    await saveDeco({
      cmd: job.cmd || 0,
      visuel: deco,
      formatVisu: job.format_visu,
      ref: job.ref,
      temps: totalTime,
    });

    const isDuplicated = job.visuel === job.visuel2;
    if (isCredences && job.cmd2 && job.visuel2 && !isDuplicated) {
      await saveDeco({
        cmd: job.cmd2 || 0,
        visuel: deco2,
        formatVisu: job.format2_visu || job.format_visu,
        ref: job.ref2,
        temps: totalTime,
      });
    }
  } catch (error) {
    logger.error(`Erreur sauvegarde dossier pour le job ${job.cmd}: ${error.message}`);
  }

  try {
    await saveProfilsKits(job);
  } catch (err) {
    logger.warn(`Profils/kits non enregistrés pour le job ${job.cmd} : ${err.message}`);
  }

  if (isStock) {
    try {
      await Stocks.findOneAndUpdate({ ref: job.ref }, { $inc: { ex: -1 } }, { new: true });
      logger.info(
        `Stock mis à jour pour la référence: ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${job.ref} ${job.format_visu} (1ex déduit)`,
      );
    } catch (error) {
      logger.error(
        `Erreur lors de la mise à jour du stock pour la référence: ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${job.ref} ${job.format_visu}: `,
        error,
      );
    }
  }

  if (job.cut) {
    const pathCutFiles = `./server/public/${state.paths.sessionPRINTSA}/Cut/`;
    if (!fs.existsSync(pathCutFiles)) {
      fs.mkdirSync(pathCutFiles, { recursive: true });
    }
    const fTauro = job.format_Plaque.split("_").pop();
    const fVisu = job.format_visu.split("_").pop();
    const wPlate = parseFloat(fTauro.toLowerCase().split("x")[0]);
    const hPlate = parseFloat(fTauro.toLowerCase().split("x")[1]);
    const width = parseFloat(fVisu.toLowerCase().split("x")[0]);
    const height = parseFloat(fVisu.toLowerCase().split("x")[1]);

    if (job.client === "LM" || job.client === "ECOM") {
      try {
        createDec(wPlate, hPlate, width, height, pathCutFiles);
        generateCutFile(hPlate * 10, wPlate * 10, height * 10, width * 10, 6, pathCutFiles);
      } catch (error) {
        logger.error(`Erreur génération fichier de coupe pour le job ${job.cmd}: ${error.message}`);
      }
    }
  }

  state.jobs.completed.push(job);
  broadcastCompletedJob(job);
}

async function runJobs(req, res) {
  saveFormatsTauroIfNeeded(req.body.formatTauro);

  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: "Jobs not run" });
  }

  try {
    state.jobs.completed = [];
    const jobsToRun = [...state.jobs.jobs];

    if (jobsToRun.length === 0) {
      return res.status(400).json({ error: "Aucun job à traiter" });
    }

    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    const bullJobs = await Promise.all(
      jobsToRun.map((job) =>
        decoQueue.add(
          "process-job",
          {
            job,
            sortFolder: req.body.sortFolder,
            ip: req.ip,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          },
        ),
      ),
    );

    logger.info(`📥 ${bullJobs.length} job(s) ajoutés à la queue BullMQ.`);

    try {
      await Promise.all(bullJobs.map((bj) => bj.waitUntilFinished(queueEvents, 7200000)));
    } catch (err) {
      logger.error(`⚠️ Un ou plusieurs jobs ont échoué définitivement : ${err.message}`);
    }

    logger.info("✅ Tous les jobs ont été traités.");

    const resultsSummary = state.jobs.completed.map(({ cmd, cmd2 }) => [cmd, cmd2 > 0 ? cmd2 : ""]);
    logger.info(
      `📊 Résumé des commandes traitées :\n[${resultsSummary
        .map(([cmd, cmd2]) => `${cmd}${cmd2 ? " + " + cmd2 : ""}`)
        .join(", ")}]`,
    );

    state.jobs.jobs = state.jobs.jobs.filter(
      (job) => !state.jobs.completed.some((completedJob) => completedJob._id === job._id),
    );

    const endTime = performance.now();
    broadcastWS({ type: "end", endTime });

    try {
      await generateStickersForJobs(state.jobs.completed);
    } catch (error) {
      logger.error("❌ Erreur lors de la génération des étiquettes :", error);
    }

    res.status(200).json({ message: "Jobs completed successfully" });
  } catch (error) {
    logger.error("Error running jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

function deleteJob(req, res) {
  const jobId = req.body._id;

  if (!jobId) {
    return res.status(400).json({ error: "No job ID provided" });
  }

  const jobIndex = state.jobs.jobs.findIndex((job) => job._id === jobId);

  if (jobIndex === -1) {
    return res.status(404).json({ error: "Job not found" });
  }

  state.jobs.jobs.splice(jobIndex, 1);
  broadcastWS(state.jobs);

  return res.sendStatus(200);
}

function deleteCompletedJobs(req, res) {
  const clearJobs = req.body.clear;

  if (!clearJobs) {
    return res.status(400).json({ error: "No jobs " });
  }

  state.jobs.completed = [];
  return res.sendStatus(200);
}

async function generateStickersOnly(req, res) {
  try {
    state.jobs.completed = [];
    const jobsToRun = [...state.jobs.jobs];

    if (!state.paths.sessionPRINTSA) {
      return res.status(400).json({ error: "sessionPRINTSA est manquant" });
    }

    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    await generateStickersForJobs(jobsToRun);

    state.jobs.completed.push(...jobsToRun);
    broadcastCompletedJob(jobsToRun);

    state.jobs.jobs = state.jobs.jobs.filter((job) => !jobsToRun.some((j) => j._id === job._id));

    const endTime = performance.now();
    broadcastWS({ type: "end", endTime });

    res.status(200).json({ message: "Étiquettes générées avec succès !" });
  } catch (error) {
    logger.error("❌ Erreur lors de la génération des étiquettes :", error);
    res.status(500).json({ error: "Erreur lors de la génération des étiquettes" });
  }
}

async function generateStickersForJobs(jobs) {
  const baseFolder = path.join(state.paths.serverRoot, `./public/${state.paths.sessionPRINTSA}`);
  const tempFolder = path.join(baseFolder, "_tmp");
  const etiquettesFolder = path.join(baseFolder, "Etiquettes");

  await fs.promises.mkdir(tempFolder, { recursive: true });
  await fs.promises.mkdir(etiquettesFolder, { recursive: true });

  await generateStickers(jobs, tempFolder, true);

  const pdfPath = path.join(etiquettesFolder, `${state.paths.sessionPRINTSA}.pdf`);
  await createStickersPage(tempFolder, pdfPath, "A4");

  const files = await fs.promises.readdir(tempFolder);
  await Promise.all(
    files.map((file) => fs.promises.rename(path.join(tempFolder, file), path.join(etiquettesFolder, file))),
  );

  await fs.promises.rm(tempFolder, { recursive: true, force: true });
}

async function saveProfilsKitsFromCmd(req, res) {
  const { numCmd, client } = req.body;
  if (!numCmd || !client) {
    return res.status(400).json({ error: "numCmd et client sont requis." });
  }
  try {
    const articles = await saveProfilsKits({ cmd: String(numCmd), client });
    if (articles === null) {
      return res.json({ message: "Déjà enregistré en base.", alreadyExists: true });
    }
    res.json({ message: "Profils/kits enregistrés.", articles: articles || [] });
  } catch (err) {
    logger.warn(`saveProfilsKitsFromCmd échoué pour cmd=${numCmd} : ${err.message}`);
    res.status(500).json({ error: err.message || "Erreur lors de l'enregistrement." });
  }
}

const SUGGESTION_FIELDS = { ville: "mag", ref: "ref", visuel: "deco", format: "format", client: "client" };

async function getSuggestions(req, res) {
  const { field, q } = req.query;
  const mongoField = SUGGESTION_FIELDS[field];
  if (!mongoField) return res.status(400).json({ error: "Champ invalide" });
  try {
    const filter = q ? { [mongoField]: { $regex: q, $options: "i" } } : {};
    const values = await modelDeco.distinct(mongoField, filter);
    res.json(values.filter(Boolean).sort().slice(0, 20));
  } catch (error) {
    logger.error("Erreur getSuggestions:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des suggestions" });
  }
}

async function lookupVisuel(req, res) {
  const { visuel, format } = req.query;
  if (!visuel) return res.status(400).json({ error: "visuel requis" });
  try {
    const filter = { deco: { $regex: visuel.trim(), $options: "i" } };
    if (format) filter.format = { $regex: format.trim(), $options: "i" };
    const entry = await modelDeco.findOne(filter).sort({ createdAt: -1 });
    if (!entry) return res.json({});
    res.json({
      ref: entry.ref || "",
      ville: entry.mag || "",
      format: entry.format || "",
      client: entry.client || "",
    });
  } catch (error) {
    logger.error("Erreur lookupVisuel:", error);
    res.status(500).json({ error: "Erreur lookup" });
  }
}

async function getRefVisuels(req, res) {
  const { q, client } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const filter = { model: { $regex: q.trim(), $options: "i" } };
    const targets = client && refModels[client] ? [refModels[client]] : Object.values(refModels);
    const sets = await Promise.all(targets.map((m) => m.distinct("model", filter)));
    const visuels = [...new Set(sets.flat().filter(Boolean))].sort().slice(0, 20);
    res.json(visuels);
  } catch (error) {
    logger.error("Erreur getRefVisuels:", error);
    res.status(500).json({ error: "Erreur lookup visuels" });
  }
}

async function getRefFormats(req, res) {
  try {
    const models = Object.values(refModels);
    const sets = await Promise.all(models.map((m) => m.distinct("format")));
    const clean = /^\d+x\d+$/i;
    const formats = [...new Set(
      sets.flat()
        .map((f) => (f != null ? String(f).trim().toLowerCase() : ""))
        .filter((f) => clean.test(f)),
    )].sort((a, b) => {
      const [aw, ah] = a.split("x").map(Number);
      const [bw, bh] = b.split("x").map(Number);
      return aw - bw || ah - bh;
    });
    res.json(formats);
  } catch (error) {
    logger.error("Erreur getRefFormats:", error);
    res.status(500).json({ error: "Erreur récupération formats" });
  }
}

async function previewStickerQuick(req, res) {
  const { client, numCmd, ex, ville, ref, visuel, format_visu, isStock } = req.body;
  if (!client) return res.status(400).json({ error: "client est requis" });
  if (!isStock && !numCmd) return res.status(400).json({ error: "numCmd est requis" });

  const syntheticJob = {
    cmd: Number(numCmd) || 0,
    ex: 1,
    client,
    ville: (ville || "").toUpperCase(),
    ref: ref || "",
    visuel: visuel || "",
    format_visu: format_visu || "",
    visuelIndex: 1,
    showStock: Boolean(isStock),
    visuPath2: null,
    visuel2: null,
    format2_visu: null,
    commandId: numCmd ? String(numCmd) : "STOCK",
  };

  const tmpDir = path.join(os.tmpdir(), `sticker_preview_${Date.now()}`);
  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });
    await generateStickers([syntheticJob], tmpDir, true);

    const files = await fs.promises.readdir(tmpDir);
    const pdfFile = files.find((f) => f.endsWith(".pdf"));
    if (!pdfFile) return res.status(500).json({ error: "Aucun sticker généré" });

    const pdfBytes = await fs.promises.readFile(path.join(tmpDir, pdfFile));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.send(pdfBytes);
  } catch (error) {
    logger.error("Erreur previewStickerQuick:", error);
    res.status(500).json({ error: "Erreur lors de la génération de l'aperçu" });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function generateStickerQuick(req, res) {
  const { client, numCmd, ex, ville, ref, visuel, format_visu, isStock } = req.body;
  if (!client) return res.status(400).json({ error: "client est requis" });
  if (!isStock && !numCmd) return res.status(400).json({ error: "numCmd est requis" });
  if (!state.paths.sessionPRINTSA)
    return res.status(400).json({ error: "sessionPRINTSA est manquant" });

  const syntheticJob = {
    cmd: Number(numCmd) || 0,
    ex: Number(ex) || 1,
    client,
    ville: (ville || "").toUpperCase(),
    ref: ref || "",
    visuel: visuel || "",
    format_visu: format_visu || "",
    visuelIndex: 1,
    showStock: Boolean(isStock),
    visuPath2: null,
    visuel2: null,
    format2_visu: null,
    commandId: numCmd ? String(numCmd) : "STOCK",
  };

  try {
    await generateStickersForJobs([syntheticJob]);
    res.status(200).json({ message: "Sticker généré avec succès !" });
  } catch (error) {
    logger.error("❌ Erreur lors de la génération du sticker rapide :", error);
    res.status(500).json({ error: "Erreur lors de la génération du sticker" });
  }
}

// Fonction interne partagée pour construire le filtre MongoDB
function buildHistoryFilter(query) {
  const filter = {};

  if (query.client) {
    filter.client = new RegExp(`^${query.client}$`, "i");
  }

  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }

  if (query.q) {
    const q = query.q.trim();
    const numericQ = /^\d+$/.test(q) ? Number(q) : null;
    const textRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    const orClauses = [
      { mag: textRegex },
      { deco: textRegex },
      { ref: textRegex },
    ];
    if (numericQ !== null) {
      orClauses.push({ numCmd: numericQ });
    }
    filter.$or = orClauses;
  }

  return filter;
}

async function getHistory(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);

  // Utiliser la fonction partagée pour construire le filtre
  const filter = buildHistoryFilter(req.query);

  try {
    const [entries, totalDocs] = await Promise.all([
      modelDeco.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      modelDeco.countDocuments(filter),
    ]);
    res.json({ data: entries, count: entries.length, total: totalDocs });
  } catch (error) {
    logger.error("Erreur getHistory:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique" });
  }
}

async function exportHistory(req, res) {
  // Utiliser la fonction partagée pour construire le filtre
  const filter = buildHistoryFilter(req.query);

  // Helper : échapper et entourer de guillemets une valeur texte
  function csvText(val) {
    if (val === null || val === undefined) return '""';
    return '"' + String(val).replace(/"/g, '""') + '"';
  }

  // Helper : formater une date en YYYY-MM-DD HH:mm (retourne chaîne vide avec guillemets pour date absente)
  function formatDate(d) {
    if (!d) return '""';
    const dt = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = dt.getFullYear();
    const MM = pad(dt.getMonth() + 1);
    const dd = pad(dt.getDate());
    const HH = pad(dt.getHours());
    const mm = pad(dt.getMinutes());
    return '"' + yyyy + "-" + MM + "-" + dd + " " + HH + ":" + mm + '"';
  }

  // Nom de fichier avec la date du jour
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

  try {
    const entries = await modelDeco.find(filter).sort({ date: -1 }).lean();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="historique-${dateStr}.csv"`);

    // En-tête CSV
    res.write("date,client,numCmd,mag,deco,ref,format,finition,ex,temps,perte,prodBlanc\n");

    for (const entry of entries) {
      const line = [
        formatDate(entry.date),
        csvText(entry.client),
        entry.numCmd !== undefined && entry.numCmd !== null ? entry.numCmd : 0,
        csvText(entry.mag),
        csvText(entry.deco),
        csvText(entry.ref),
        csvText(entry.format),
        csvText(entry.finition),
        entry.ex !== undefined && entry.ex !== null ? entry.ex : 0,
        entry.temps !== undefined && entry.temps !== null ? entry.temps : 0,
        entry.perte !== undefined && entry.perte !== null ? entry.perte : 0,
        entry.prodBlanc ? 1 : 0,
      ].join(",");
      res.write(line + "\n");
    }

    res.end();
  } catch (error) {
    logger.error("Erreur exportHistory:", error);
    res.status(500).json({ error: "Erreur lors de l'export de l'historique" });
  }
}

async function getStats(req, res) {
  const period = req.query.period || "week";

  const now = new Date();
  let from = null;
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (period === "week") {
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    from = new Date(now);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }
  // period === "all" : from reste null, pas de filtre date

  const matchStage = from ? { $match: { date: { $gte: from, $lte: to } } } : null;

  const pipeline = [
    ...(matchStage ? [matchStage] : []),
    {
      $facet: {
        byClient: [
          {
            $group: {
              _id: "$client",
              count: { $sum: 1 },
              avgTemps: { $avg: "$temps" },
              totalPerte: { $sum: "$perte" },
            },
          },
          {
            $project: {
              _id: 0,
              client: "$_id",
              count: 1,
              avgTemps: { $round: ["$avgTemps", 1] },
              totalPerte: { $round: ["$totalPerte", 2] },
            },
          },
          { $sort: { count: -1 } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              avgTemps: { $avg: "$temps" },
              totalPerte: { $sum: "$perte" },
            },
          },
          {
            $project: {
              _id: 0,
              count: 1,
              avgTemps: { $round: ["$avgTemps", 1] },
              totalPerte: { $round: ["$totalPerte", 2] },
            },
          },
        ],
      },
    },
  ];

  try {
    const [result] = await modelDeco.aggregate(pipeline);
    const totals = result.totals[0] || { count: 0, avgTemps: 0, totalPerte: 0 };
    res.json({
      period,
      from: from ? from.toISOString() : null,
      to: to.toISOString(),
      totals,
      byClient: result.byClient,
    });
  } catch (error) {
    logger.error("Erreur getStats:", error);
    res.status(500).json({ error: "Erreur lors du calcul des statistiques" });
  }
}

module.exports = {
  getJobs,
  editJob,
  addJob,
  runJobs,
  deleteJob,
  deleteCompletedJobs,
  generateStickersOnly,
  generateStickerQuick,
  previewStickerQuick,
  getSuggestions,
  lookupVisuel,
  getRefVisuels,
  getRefFormats,
  getHistory,
  exportHistory,
  getStats,
  processJob,
  saveProfilsKitsFromCmd,
};
