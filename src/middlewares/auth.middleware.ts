import { Request, Response, NextFunction } from "express";

export const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const adminChatId = process.env.TELEGRAM_CHAT_ID;
  const adminSecret = process.env.ADMIN_SECRET_TOKEN;

  const headerChatId = req.headers["x-telegram-chat-id"] as string | undefined;
  const headerToken = req.headers["x-admin-token"] as string | undefined;
  const queryToken = req.query.adminToken as string | undefined;
  const initDataHeader = req.headers["x-telegram-init-data"] as string | undefined;

  let initDataUserId: string | undefined;
  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userParam = params.get("user");
      if (userParam) {
        const parsedUser = JSON.parse(userParam);
        initDataUserId = parsedUser.id?.toString();
      }
    } catch {
      // Ignore JSON parse errors in initData
    }
  }

  const matchesChatId =
    adminChatId &&
    (headerChatId === adminChatId ||
      headerToken === adminChatId ||
      queryToken === adminChatId ||
      initDataUserId === adminChatId);

  const matchesSecret =
    adminSecret &&
    (headerToken === adminSecret || queryToken === adminSecret);

  // In development mode without env variables set, allow localhost
  const isDevBypass =
    process.env.NODE_ENV === "development" &&
    !adminChatId &&
    !adminSecret;

  if (matchesChatId || matchesSecret || isDevBypass) {
    return next();
  }

  res.status(403).json({
    success: false,
    message: "Ruxsat etilmadi: Faqat tizim administratori uchun ochiq.",
  });
};
