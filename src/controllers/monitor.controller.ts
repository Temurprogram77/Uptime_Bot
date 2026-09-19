import { Request, Response } from "express";
import { prisma } from "../config/db";
import { PingService } from "../services/ping.service";

// Barcha monitorlarni olish (oxirgi ping natijalari bilan birga)
export const getMonitors = async (req: Request, res: Response) => {
  try {
    const monitors = await prisma.monitor.findMany({
      include: {
        pingLogs: {
          take: 10,
          orderBy: { checkedAt: "desc" },
        },
      },
    });

    res.status(200).json({ success: true, data: monitors });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Yangi monitor qo'shish va birdan birinchi marta ping qilib ko'rish
export const createMonitor = async (req: Request, res: Response) => {
  try {
    const { name, url, intervalMinutes = 5 } = req.body;

    if (!name || !url) {
      return res.status(400).json({ success: false, message: "Nom va URL kiritilishi shart" });
    }

    let user = req.body.userId ? await prisma.user.findUnique({ where: { id: req.body.userId } }) : await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: process.env.TELEGRAM_CHAT_ID || "demo_admin",
          firstName: "Demo",
          lastName: "User",
          username: "demouser",
        },
      });
    }

    // Monitor yaratish
    const monitor = await prisma.monitor.create({
      data: {
        name,
        url,
        intervalMinutes: Number(intervalMinutes),
        userId: user.id,
      },
    });

    // Birdan birinchi pingni tekshirib log saqlaymiz
    const pingResult = await PingService.checkUrl(url);
    await prisma.pingLog.create({
      data: {
        monitorId: monitor.id,
        statusCode: pingResult.statusCode,
        responseTime: pingResult.responseTime,
        status: pingResult.status,
        errorMessage: pingResult.errorMessage,
      },
    });

    res.status(201).json({ success: true, data: monitor, initialPing: pingResult });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};