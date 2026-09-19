import cron from "node-cron";
import { prisma } from "../config/db";
import { PingService } from "../services/ping.service";
import { TelegramService } from "../services/telegram.service";

export const startPingWorker = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const monitors = await prisma.monitor.findMany({
        where: { isActive: true },
        include: {
          user: true,
          pingLogs: {
            take: 1,
            orderBy: { checkedAt: "desc" },
          },
        },
      });

      const now = Date.now();

      for (const monitor of monitors) {
        const previousPing = monitor.pingLogs[0];
        const lastCheck = previousPing?.checkedAt?.getTime() || 0;
        const intervalMs = monitor.intervalMinutes * 60 * 1000;

        if (now - lastCheck >= intervalMs) {
          const result = await PingService.checkUrl(monitor.url);

          await prisma.pingLog.create({
            data: {
              monitorId: monitor.id,
              statusCode: result.statusCode,
              responseTime: result.responseTime,
              status: result.status,
              errorMessage: result.errorMessage,
            },
          });

          // Holat DOWN ga o'zgarganda (status change to DOWN) Telegram orqali xabar yuborish
          const previousStatus = previousPing?.status;
          if (result.status === "DOWN" && previousStatus !== "DOWN" && monitor.user?.telegramId) {
            await TelegramService.sendAlert(
              monitor.user.telegramId,
              monitor.name,
              monitor.url,
              result.errorMessage || "Saytdan javob olinmadi"
            );
          }

          console.log(`[${monitor.intervalMinutes}m] ${monitor.name}: ${result.status} (${result.responseTime}ms)`);
        }
      }
    } catch (error: any) {
      console.error("Worker xatosi:", error.message);
    }
  });

  console.log("Multi-user Cron Worker ishga tushirildi.");
};