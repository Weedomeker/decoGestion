const express = require("express");
const jobsController = require("../controllers/jobsController");

const router = express.Router();

router.get("/jobs", jobsController.getJobs);
router.get("/history/export", jobsController.exportHistory);
router.get("/history", jobsController.getHistory);
router.get("/stats", jobsController.getStats);
router.patch("/edit_job", jobsController.editJob);
router.post("/add_job", jobsController.addJob);
router.post("/run_jobs", jobsController.runJobs);
router.delete("/delete_job", jobsController.deleteJob);
router.delete("/delete_job_completed", jobsController.deleteCompletedJobs);
router.post("/generate_stickers", jobsController.generateStickersOnly);
router.post("/generate_sticker_quick", jobsController.generateStickerQuick);
router.get("/suggestions", jobsController.getSuggestions);
router.get("/lookup_visuel", jobsController.lookupVisuel);
router.get("/ref_formats", jobsController.getRefFormats);
router.get("/ref_visuels", jobsController.getRefVisuels);
router.post("/preview_sticker_quick", jobsController.previewStickerQuick);

module.exports = router;
