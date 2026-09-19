import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { startPingWorker } from "./jobs/pingWorker";
import { bot } from "./services/bot.service";

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server ishga tushdi: http://localhost:${PORT}`);
  
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