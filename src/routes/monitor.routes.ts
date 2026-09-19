import { Router } from "express";
import { getMonitors, createMonitor } from "../controllers/monitor.controller";

const router = Router();

router.get("/", getMonitors);
router.post("/", createMonitor);

export default router;