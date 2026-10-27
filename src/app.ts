import express from "express";
import cors from "cors";
import helmet from "helmet";
import monitorRoutes from "./routes/monitor.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

// API marshrutlari
app.use("/api/monitors", monitorRoutes);
app.use("/api/admin", adminRoutes);

// Asosiy root va health endpointlar (UptimeRobot va monitoring uchun)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Uptime Monitor & Bot Backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server muvaffaqiyatli ishlamoqda!" });
});

export default app;