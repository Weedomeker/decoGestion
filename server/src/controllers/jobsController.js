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
const { saveFormatsTauroIfNeeded } = require("../services/formatsService");
const { broadcastWS, broadcastCompletedJob } = require("../services/websocketService");
const usePdfWorker = require("../utils/pdfWorker");
const { castoName } = require("../utils/jobNames");

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
    ville: req.body.ville != null ? req.body.ville?.toUpperCase() : "",
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
  let visuel = data.visuel.split("/").pop();
  let visuel2 = data.visuel2?.split("/").pop() || "";

  if (client === "LM") {
    visuel = visuel.includes("-") ? visuel.split("-")?.pop() : visuel;
  }
  if (client2 === "LM") {
    visuel2 = visuel2.includes("-") ? visuel2.split("-")?.pop() : visuel2;
  }

  if (client === "BRICO") {
    visuel = visuel.replace(".pdf", "").trim();
  }
  if (client2 === "BRICO") {
    visuel2 = visuel2.replace(".pdf", "").trim();
  }

  const visuPath = data.visuel;
  let visuPath2 = data.visuel2;
  let formatTauro = data.formatTauro;
  formatTauro = formatTauro.split("_")?.pop();
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
    ? path.join(state.paths.saveFolder + "/Prod avec BLANC")
    : path.join(state.paths.saveFolder + "/Deco_Std_" + formatTauro);

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

  let matchRef = data.teinteMasse ? findRefTeinteMasse?.[0]?.ref : visuel.match(/\d{13}/)?.[0];
  if (client === "BRICO" || client === "ECOM") matchRef = visuel.match(/[A-Z]+\d*-\d+/g)?.[0];

  let matchRef2 = visuel2.match(/\d{13}/)?.[0];
  if (client2 === "BRICO" || client2 === "ECOM") matchRef2 = visuel2.match(/[A-Z]+\d*-\d+/g)?.[0];

  // Validation MongoDB des références extraites
  const RefModelClient = refModels[client];
  const RefModelClient2 = refModels[client2];
  const otherRefModels = Object.values(refModels);

  let refWarning = null;
  let refWarning2 = null;

  if (matchRef && RefModelClient) {
    let refValidated = await RefModelClient.findOne({ ref: String(matchRef) }).lean();
    if (!refValidated) {
      for (const m of otherRefModels.filter((m) => m !== RefModelClient)) {
        refValidated = await m.findOne({ ref: String(matchRef) }).lean();
        if (refValidated) break;
      }
    }
    if (!refValidated) {
      refWarning = `Référence "${matchRef}" non trouvée en base (${client})`;
      logger.warn(`⚠️ ${refWarning} — visuel: ${visuel}`);
    } else {
      // Vérification cohérence format fichier vs base
      const formatFromRef = refValidated.format?.toLowerCase();
      const formatFromFile = format?.match(/\d{2,}x\d{2,}/i)?.[0]?.toLowerCase();
      if (formatFromRef && formatFromFile && formatFromRef !== formatFromFile) {
        const msg = `Format incohérent pour ref ${matchRef} : fichier=${formatFromFile}, base=${formatFromRef}`;
        logger.warn(`⚠️ ${msg}`);
        refWarning = msg;
      }
      // RefEcom.blanc : forcer prodBlanc si la référence est marquée blanc en base
      if (client === "ECOM" && refValidated.blanc === true && !prodBlanc) {
        logger.warn(`⚠️ RefEcom ${matchRef} marquée blanc=true en base mais prodBlanc=false — correction automatique`);
        prodBlanc = true;
        // Recalculer le writePath avec prodBlanc = true
        state.process.writePath = path.join(state.paths.saveFolder + "/Prod avec BLANC");
        if (!fs.existsSync(state.process.writePath)) {
          fs.mkdirSync(state.process.writePath, { recursive: true });
        }
      }
    }
  }

  if (matchRef2 && RefModelClient2 && visuel2) {
    let refValidated2 = await RefModelClient2.findOne({ ref: String(matchRef2) }).lean();
    if (!refValidated2) {
      for (const m of otherRefModels.filter((m) => m !== RefModelClient2)) {
        refValidated2 = await m.findOne({ ref: String(matchRef2) }).lean();
        if (refValidated2) break;
      }
    }
    if (!refValidated2) {
      refWarning2 = `Référence 2 "${matchRef2}" non trouvée en base (${client2})`;
      logger.warn(`⚠️ ${refWarning2} — visuel2: ${visuel2}`);
    } else {
      const formatFromRef2 = refValidated2.format?.toLowerCase();
      const formatFromFile2 = format2?.match(/\d{2,}x\d{2,}/i)?.[0]?.toLowerCase();
      if (formatFromRef2 && formatFromFile2 && formatFromRef2 !== formatFromFile2) {
        const msg2 = `Format incohérent pour ref2 ${matchRef2} : fichier=${formatFromFile2}, base=${formatFromRef2}`;
        logger.warn(`⚠️ ${msg2}`);
        refWarning2 = msg2;
      }
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
    refWarning,
    refWarning2,
  });
}

async function runJobs(req, res) {
  saveFormatsTauroIfNeeded(req.body.formatTauro);

  const status = req.body.run;
  if (!status) {
    return res.status(400).json({ error: "Jobs not run" });
  }

  try {
    state.jobs.completed = [];
    const backupPath = path.join(state.paths.serverRoot, "./backups/jobs_backup.json");

    try {
      fs.mkdirSync(path.join(state.paths.serverRoot, "./backups"), { recursive: true });
      fs.writeFileSync(backupPath, JSON.stringify(state.jobs.jobs, null, 2), "utf8");
      logger.info("📝 Backup des jobs créé.");
    } catch (e) {
      logger.error("❌ Impossible de créer le backup des jobs", e);
    }

    const jobsToRun = [...state.jobs.jobs];

    const startTime = performance.now();
    broadcastWS({ type: "start", startTime });

    for (const job of jobsToRun) {
      const regexCredences = /^\d{3}x\d{2}$/i;
      const isCredences = regexCredences.test(job.format_visu);
      const isStock = job?.useStock;

      // Log de cohérence avant traitement
      logger.info(
        `▶ Job ${job.cmd} | client=${job.client} | ref=${job.ref} | visuel=${job.visuel} | format=${job.format_visu} | ${job.ex}ex`,
      );
      if (isCredences && job.visuPath2) {
        logger.info(`  + 2e panneau | ref2=${job.ref2} | visuel2=${job.visuel2} | visuPath2=${job.visuPath2}`);
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
        continue;
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
              visuals.push({
                file: job.visuPath2,
                name: fileName2,
              });
            }

            await amalgameCredences(
              {
                visuals,
                plaque: job.format_Plaque,
              },
              path.join(
                job.writePath,
                `${castoName(fileName)}${job.visuPath2 ? " + " + castoName(fileName2) : ""}.pdf`,
              ),
            );

            const endPdf = performance.now();
            state.process.pdfTime = endPdf - startPdf;
          } else {
            await modifyPdf(job.visuPath, job.writePath, fileName, job.format_Plaque, job.reg);
            const endPdf = performance.now();
            state.process.pdfTime = endPdf - startPdf;
          }
        } catch (error) {
          logger.error(`Erreur de modification du PDF pour le job ${job.cmd}: ${error}`);
        }

        // Vérification que le PDF de sortie existe et n'est pas vide
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

        try {
          const startJpg = performance.now();
          if (job.ref) {
            if (isCredences && job.visuPath2) {
              await usePdfWorker({
                pdf: path.join(
                  job.writePath,
                  `${castoName(pdfName.split("/").pop())} + ${castoName(pdfName2.split("/").pop())}.pdf`,
                ),
                jpg: path.join(
                  `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${castoName(
                    jpgName.split("/").pop(),
                  )} + ${castoName(jpgName2.split("/").pop())}.jpg`,
                ),
              });
            } else {
              getPreview(job.ref, jpgName, isStock);
            }
          } else {
            await usePdfWorker({ pdf: `${pdfName}.pdf`, jpg: `${jpgName}.jpg` });
          }
          const endJpg = performance.now();
          state.process.jpgTime = endJpg - startJpg;
        } catch (error) {
          logger.error(`Error generating JPG for job ${job.cmd}:`, error);
        }

        // Vérification que le JPG de sortie existe et n'est pas vide
        const outJpgPath =
          isCredences && job.visuPath2
            ? path.join(
                `${state.paths.jpgPath}/${state.paths.sessionPRINTSA}/${castoName(jpgName.split("/").pop())} + ${castoName(jpgName2.split("/").pop())}.jpg`,
              )
            : `${jpgName}.jpg`;
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
        // Pour CASTO : EAN-13 ; pour BRICO : ref alphanumérique (job.ref est déjà fiable)
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

      // deco2 : même logique que deco — partie avant le format pour BRICO, après pour CASTO
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
        const data = {
          date: job.date,
          client: job.client,
          numCmd: cmd || 0,
          mag: job.ville,
          dibond: job.format_Plaque,
          deco: visuel,
          ref: ref || 0,
          format: formatVisu?.split("_").pop().replace("/", ""),
          ex: parseInt(job.ex),
          temps,
          perte: job.perte ? parseFloat(job.perte) : 0,
          status: "",
          app_version: `v${state.appVersion}`,
          ip: req.ip.split(":").pop() === "1" || req.hostname === "localhost" ? os.hostname() : req.ip.split(":").pop(),
          comment: isStock ? `Pris en stock le ${new Date().toLocaleString()}` : "",
          prodBlanc: !!job.prodBlanc,
        };

        const newDeco = new modelDeco(data);
        await newDeco.save();
      };

      try {
        const totalTime = parseFloat(((state.process.jpgTime + state.process.pdfTime) / 1000).toFixed(2)) || 0;
        await saveDeco({
          cmd: job.cmd || 0,
          visuel: deco,
          formatVisu: job.format_visu,
          ref: job.ref,
          temps: totalTime,
        });

        // Pour les crédences 2ex (même visuel dupliqué), on n'enregistre qu'une seule entrée
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

      if (isStock) {
        try {
          await Stocks.findOneAndUpdate({ ref: job.ref }, { $inc: { ex: -1 } }, { new: true });

          logger.info(
            `Stock mis à jour pour la référence: ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${job.ref} ${
              job.format_visu
            } (1ex déduit)`,
          );
        } catch (error) {
          logger.error(
            `Erreur lors de la mise à jour du stock pour la référence:  ${job.cmd} ${job.visuel?.replace(".pdf", "")} ${
              job.ref
            } ${job.format_visu}: `,
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
    logger.info("✅ Tous les jobs ont été traités avec succès.");
    const resultsSummary = [];
    state.jobs.completed.map((job) => {
      const { cmd, cmd2 } = job;
      resultsSummary.push([cmd, cmd2 > 0 ? cmd2 : ""]);
    });
    logger.info(
      `📊 Résumé des commandes traitées :\n[${resultsSummary
        .map(([cmd, cmd2]) => `${cmd}${cmd2 ? " + " + cmd2 : ""}`)
        .join(", ")}]`,
    );

    state.jobs.jobs = state.jobs.jobs.filter(
      (job) => !state.jobs.completed.some((completedJob) => completedJob._id === job._id),
    );

    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
        logger.info("✔️  Backup supprimé après exécution des jobs");
      }
    } catch (e) {
      logger.error("❌ Impossible de supprimer le backup", e);
    }

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

async function getHistory(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  try {
    const entries = await modelDeco.find({}).sort({ date: -1 }).limit(limit).lean();
    res.json({ data: entries, count: entries.length });
  } catch (error) {
    logger.error("Erreur getHistory:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique" });
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
  getHistory,
};
