import dotenv from "dotenv";
dotenv.config();

import { execSync } from "child_process";
import app from "./app";
import { startPingWorker } from "./jobs/pingWorker";
import { bot, getOrCreateUser } from "./services/bot.service";

// Render yoki boshqa serverda database jadvallarini avtomatik yaratish
try {
  console.log("Database migratsiyasi tekshirilmoqda (prisma db push)...");
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  console.log("Database jadvallari muvaffaqiyatli tayyorlandi!");
} catch (error: any) {
  console.error("Database sinxronizatsiya xatosi:", error.message);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server ishga tushdi: http://localhost:${PORT}`);
  
  // Bosh admin hisobini bazada mavjudligini ta'minlash
  const adminChatIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const adminId of adminChatIds) {
    try {
      await getOrCreateUser({ id: adminId, first_name: "Admin" });
      console.log(`Admin (${adminId}) hisobi tekshirildi/yaratildi.`);
    } catch (e: any) {
      console.warn("Admin hisobini yaratishda ogohlantirish:", e.message);
    }
  }

  // Orqa fon cron workerini yoqish
  startPingWorker();

  // Graceful shutdown (Render va boshqa platformalarda to'xtaganda Telegram ulanishini toza yopish)
  const stopBot = async () => {
    try {
      console.log("Bot to'xtatilmoqda...");
      await bot.stop();
    } catch {}
  };
  process.once("SIGINT", stopBot);
  process.once("SIGTERM", stopBot);

  // Telegram botni xavfsiz va qayta urinish bilan ishga tushirish
  const runBot = () => {
    bot.start({
      drop_pending_updates: true,
      onStart: (botInfo) => {
        console.log(`Telegram bot faol: @${botInfo.username}`);
      },
    }).catch((err) => {
      console.error("Bot start xatosi (5 soniyadan so'ng qayta uriniladi):", err.message || err);
      setTimeout(runBot, 5000);
    });
  };

  runBot();
});