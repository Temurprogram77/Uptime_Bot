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

  // Telegram botni ishga tushirish
  bot.start({
    onStart: (botInfo) => {
      console.log(`Telegram bot faol: @${botInfo.username}`);
    },
  });
});