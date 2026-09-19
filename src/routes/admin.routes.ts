import { Router, Request, Response } from "express";
import { prisma } from "../config/db";
import { adminAuth } from "../middlewares/auth.middleware";
import { bot } from "../services/bot.service";
import { PingService } from "../services/ping.service";

const router = Router();

// Apply admin authentication middleware to all admin routes
router.use(adminAuth);

// 1. GET /api/admin/stats - Umumiy statistika
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const monitors = await prisma.monitor.findMany({
      select: {
        id: true,
        pingLogs: {
          take: 1,
          orderBy: { checkedAt: "desc" },
          select: { status: true },
        },
      },
    });

    const totalMonitors = monitors.length;
    let upMonitors = 0;
    let downMonitors = 0;

    for (const monitor of monitors) {
      const latestPing = monitor.pingLogs[0];
      if (latestPing) {
        if (latestPing.status === "UP") {
          upMonitors++;
        } else if (latestPing.status === "DOWN") {
          downMonitors++;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalMonitors,
        upMonitors,
        downMonitors,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. GET /api/admin/users - Barcha foydalanuvchilar va ularning serverlari
router.get("/users", async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        telegramId: true,
        firstName: true,
        lastName: true,
        username: true,
        photoUrl: true,
        phone: true,
        createdAt: true,
        _count: {
          select: { monitors: true },
        },
        monitors: {
          include: {
            pingLogs: {
              take: 1,
              orderBy: { checkedAt: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. DELETE /api/admin/users/:id - Foydalanuvchini chiqarib yuborish / o'chirish (Cascade)
router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const adminTelegramId = (process.env.TELEGRAM_CHAT_ID || "6150067773").trim();

    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { monitors: true } } },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Foydalanuvchi topilmadi." });
    }

    if (user.telegramId === adminTelegramId) {
      return res.status(400).json({
        success: false,
        message: "Xavfsizlik: Bosh administrator hisobini o'chirib bo'lmaydi!",
      });
    }

    // Foydalanuvchini va uning barcha serverlarini o'chirish (onDelete: Cascade)
    await prisma.user.delete({
      where: { id },
    });

    // Foydalanuvchiga Telegram bot orqali ogohlantirish yuborishga urinish
    try {
      await bot.api.sendMessage(
        user.telegramId,
        "⚠️ <b>Hisobingiz va monitoring serverlaringiz administrator tomonidan o'chirildi.</b>\nQayta ulanish uchun /start bosing.",
        { parse_mode: "HTML" }
      );
    } catch {
      // User blocked bot or cannot receive messages
    }

    res.status(200).json({
      success: true,
      message: `Foydalanuvchi (${user.firstName || user.username || user.telegramId}) va uning ${user._count.monitors} ta serveri muvaffaqiyatli o'chirildi.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. POST /api/admin/users/:id/message - Foydalanuvchiga Telegram orqali xabar yuborish
router.post("/users/:id/message", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, message: "Xabar matni kiritilishi shart." });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: "Foydalanuvchi topilmadi." });
    }

    await bot.api.sendMessage(
      user.telegramId,
      `🔔 <b>Administrator xabari:</b>\n\n${message.trim()}`,
      { parse_mode: "HTML" }
    );

    res.status(200).json({
      success: true,
      message: "Xabar foydalanuvchiga muvaffaqiyatli yetkazildi!",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Xabar yuborilmadi: ${error.message}` });
  }
});

// 5. GET /api/admin/monitors - Barcha foydalanuvchilarning barcha serverlari
router.get("/monitors", async (req: Request, res: Response) => {
  try {
    const monitors = await prisma.monitor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        pingLogs: {
          take: 1,
          orderBy: { checkedAt: "desc" },
        },
      },
    });

    res.status(200).json({ success: true, data: monitors });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. POST /api/admin/monitors - Admin tomonidan to'g'ridan-to'g'ri yangi server qo'shish
router.post("/monitors", async (req: Request, res: Response) => {
  try {
    const { name, url, intervalMinutes = 5, userId } = req.body;

    if (!name || !url) {
      return res.status(400).json({ success: false, message: "Server nomi va URL manzili shart." });
    }

    let validUrl = url.trim();
    if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
      validUrl = `https://${validUrl}`;
    }

    try {
      const parsed = new URL(validUrl);
      if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
        return res.status(400).json({
          success: false,
          message: "Noto'g'ri URL formati. To'liq domen nomini kiriting (masalan: https://google.com).",
        });
      }
      validUrl = parsed.toString();
    } catch {
      return res.status(400).json({
        success: false,
        message: "URL formati yaroqsiz.",
      });
    }

    // Dastlabki tekshiruv (Ping) — agar server ishlamasa yoki xato bersa, qabul qilinmaydi!
    const pingResult = await PingService.checkUrl(validUrl);
    if (pingResult.status !== "UP") {
      const reason = pingResult.errorMessage || "Sayt javob bermadi";
      const code = pingResult.statusCode ? ` (HTTP ${pingResult.statusCode})` : "";
      return res.status(400).json({
        success: false,
        message: `Sayt tekshiruvdan o'tmadi: ${reason}${code}. Faqat ishlab turgan saytlarni qo'shish mumkin.`,
      });
    }

    // Default to admin user if no userId provided
    let targetUserId = userId;
    if (!targetUserId) {
      const adminChatId = (process.env.TELEGRAM_CHAT_ID || "6150067773").trim();
      let adminUser = await prisma.user.findUnique({ where: { telegramId: adminChatId } });
      if (!adminUser) {
        adminUser = await prisma.user.create({
          data: {
            telegramId: adminChatId,
            firstName: "Admin",
          },
        });
      }
      targetUserId = adminUser.id;
    }

    if (!targetUserId) {
      const firstUser = await prisma.user.findFirst();
      if (firstUser) targetUserId = firstUser.id;
    }

    const monitor = await prisma.monitor.create({
      data: {
        name,
        url: validUrl,
        intervalMinutes: Number(intervalMinutes),
        userId: targetUserId,
      },
    });

    // Muvaffaqiyatli birinchi pingni saqlash
    await prisma.pingLog.create({
      data: {
        monitorId: monitor.id,
        statusCode: pingResult.statusCode,
        responseTime: pingResult.responseTime,
        status: pingResult.status,
        errorMessage: pingResult.errorMessage,
      },
    });

    res.status(201).json({
      success: true,
      message: `"${monitor.name}" serveri muvaffaqiyatli tekshirildi va monitoringga qo'shildi!`,
      data: monitor,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. PATCH /api/admin/monitors/:id/toggle - Serverni to'xtatish yoki faollashtirish
router.patch("/monitors/:id/toggle", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const monitor = await prisma.monitor.findUnique({ where: { id } });

    if (!monitor) {
      return res.status(404).json({ success: false, message: "Server topilmadi." });
    }

    const updated = await prisma.monitor.update({
      where: { id },
      data: { isActive: !monitor.isActive },
    });

    res.status(200).json({
      success: true,
      message: updated.isActive ? "Monitoring faollashtirildi!" : "Monitoring vaqtincha to'xtatildi!",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. POST /api/admin/monitors/:id/ping - Real vaqtda hozir tekshirish (Ping Now)
router.post("/monitors/:id/ping", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const monitor = await prisma.monitor.findUnique({ where: { id } });

    if (!monitor) {
      return res.status(404).json({ success: false, message: "Server topilmadi." });
    }

    const pingResult = await PingService.checkUrl(monitor.url);

    const log = await prisma.pingLog.create({
      data: {
        monitorId: monitor.id,
        statusCode: pingResult.statusCode,
        responseTime: pingResult.responseTime,
        status: pingResult.status,
        errorMessage: pingResult.errorMessage,
      },
    });

    res.status(200).json({
      success: true,
      message: `Tekshiruv natijasi: ${pingResult.status} (${pingResult.responseTime}ms)`,
      data: {
        monitor,
        latestPing: log,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 9. PATCH /api/admin/monitors/:id/interval - Tekshiruv oralig'ini o'zgartirish
router.patch("/monitors/:id/interval", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { intervalMinutes } = req.body;

    if (!intervalMinutes || isNaN(Number(intervalMinutes))) {
      return res.status(400).json({ success: false, message: "To'g'ri oraliq vaqtini kiriting." });
    }

    const updated = await prisma.monitor.update({
      where: { id },
      data: { intervalMinutes: Number(intervalMinutes) },
    });

    res.status(200).json({
      success: true,
      message: `Vaqt oralig'i har ${updated.intervalMinutes} daqiqaga o'zgartirildi.`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 10. GET /api/admin/monitors/:id/logs - Serverning oxirgi tekshiruvlar jurnali (tarixi)
router.get("/monitors/:id/logs", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const logs = await prisma.pingLog.findMany({
      where: { monitorId: id },
      orderBy: { checkedAt: "desc" },
      take: 20,
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 11. DELETE /api/admin/monitors/:id - Serverni butunlay o'chirish
router.delete("/monitors/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const monitor = await prisma.monitor.findUnique({
      where: { id },
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Server topilmadi.",
      });
    }

    await prisma.monitor.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: `Monitor "${monitor.name}" (${monitor.url}) muvaffaqiyatli o'chirildi.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
