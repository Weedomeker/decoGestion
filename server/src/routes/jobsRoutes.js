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

module.exports = router;
