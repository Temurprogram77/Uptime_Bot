import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../config/db";
import { PingService } from "./ping.service";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN topilmadi!");

export const bot = new Bot(token);

interface UserState {
  step: "idle" | "awaiting_url" | "awaiting_interval" | "editing_interval";
  url?: string;
  name?: string;
  monitorId?: string;
}

const userState: Record<number, UserState> = {};

// Foydalanuvchini bazadan topish yoki yaratish yordamchisi
export const getOrCreateUser = async (userOrId: any) => {
  if (!userOrId) throw new Error("Foydalanuvchi aniqlanmadi.");

  if (typeof userOrId === "string" || typeof userOrId === "number") {
    const telegramId = userOrId.toString();
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing) return existing;
    return await prisma.user.create({
      data: { telegramId },
    });
  }

  const telegramId = userOrId.id.toString();
  return await prisma.user.upsert({
    where: { telegramId },
    update: {
      firstName: userOrId.first_name || null,
      lastName: userOrId.last_name || null,
      username: userOrId.username || null,
    },
    create: {
      telegramId,
      firstName: userOrId.first_name || null,
      lastName: userOrId.last_name || null,
      username: userOrId.username || null,
    },
  });
};

export const isUserAdmin = (telegramId?: string | number): boolean => {
  if (!telegramId) return false;
  const idStr = telegramId.toString().trim();
  const configuredAdmins = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return configuredAdmins.includes(idStr);
};

const getMainMenu = (isAdmin = false) => {
  const keyboard = new InlineKeyboard()
    .text("🖥 Mening serverlarim", "my_servers")
    .row()
    .text("➕ Yangi sayt qo'shish", "add_monitor");

  if (isAdmin) {
    const webAppUrl = process.env.WEBAPP_URL;
    if (webAppUrl && webAppUrl.startsWith("https://")) {
      keyboard.row().webApp("👑 Admin Panel", webAppUrl);
    } else if (webAppUrl) {
      keyboard.row().url("👑 Admin Panel", webAppUrl);
    }
  }

  return keyboard;
};

// Global bot error handler to prevent crashing on Telegram API errors
bot.catch((err) => {
  console.error("Telegram bot xatosi:", err.message || err);
});

const getIntervalKeyboard = (prefix: "interval_" | "edit_interval_") => {
  return new InlineKeyboard()
    .text("1 daqiqa", `${prefix}1`)
    .text("5 daqiqa", `${prefix}5`)
    .row()
    .text("15 daqiqa", `${prefix}15`)
    .text("30 daqiqa", `${prefix}30`)
    .row()
    .text("1 soat (60m)", `${prefix}60`)
    .text("24 soat (1440m)", `${prefix}1440`);
};

// 1. /start
bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  await getOrCreateUser(ctx.from);

  const isAdmin = isUserAdmin(telegramId);
  const keyboard = getMainMenu(isAdmin);

  if (isAdmin) {
    const webAppUrl = process.env.WEBAPP_URL;
    if (webAppUrl && webAppUrl.startsWith("https://")) {
      try {
        await ctx.api.setChatMenuButton({
          chat_id: ctx.chat.id,
          menu_button: {
            type: "web_app",
            text: "👑 Admin Panel",
            web_app: { url: webAppUrl },
          },
        });
      } catch (err: any) {
        console.warn("setChatMenuButton ogohlantirish:", err.message);
      }
    }
  } else {
    // Oddiy foydalanuvchilar uchun pastki Admin Panel tugmasini butunlay yashirish
    try {
      await ctx.api.setChatMenuButton({
        chat_id: ctx.chat.id,
        menu_button: {
          type: "commands",
        },
      });
    } catch {
      // ignore
    }
  }

  const welcomeText =
    `🤖 <b>Uptime Monitor Tizimi</b>\n\n` +
    `Assalomu alaykum, <b>${ctx.from.first_name}</b>!\n` +
    `Veb-sayt va serverlaringizni 24/7 monitoring qiling, ishlamay qolganda darhol ogohlantirish oling.\n` +
    (isAdmin
      ? `\n👑 <b>Siz tizim administratorisiz.</b>\nQuyidagi tugmalar orqali server qo'shishingiz yoki to'liq <b>Admin Panel</b> (Telegram Mini App)ni ochishingiz mumkin:`
      : `\nQuyidagi menyu orqali serverlaringizni boshqaring:`);

  await ctx.reply(welcomeText, {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
});

// 2. Yangi sayt qo'shish
bot.callbackQuery("add_monitor", async (ctx) => {
  userState[ctx.from.id] = { step: "awaiting_url" };
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Iltimos, monitoring qilmoqchi bo'lgan sayt havolasini yuboring:\n<i>Masalan: https://google.com</i>",
    { parse_mode: "HTML" }
  );
});

// 3. Faqat shu foydalanuvchiga tegishli serverlarni ko'rsatish
bot.callbackQuery("my_servers", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(ctx.from);
  const isAdmin = isUserAdmin(ctx.from.id);

  const monitors = await prisma.monitor.findMany({
    where: { userId: user.id }, // Faqat shu odamning serverlari
    include: { pingLogs: { take: 1, orderBy: { checkedAt: "desc" } } },
  });

  if (monitors.length === 0) {
    return ctx.reply("Siz hali hech qanday server qo'shmadingiz.", {
      reply_markup: getMainMenu(isAdmin),
    });
  }

  const keyboard = new InlineKeyboard();
  monitors.forEach((m) => {
    const lastPing = m.pingLogs[0];
    const statusIcon = !m.isActive ? "⏸" : lastPing?.status === "UP" ? "🟢" : "🔴";
    keyboard.text(`${statusIcon} ${m.name}`, `view_monitor_${m.id}`).row();
  });
  keyboard.text("🔙 Asosiy menyu", "back_to_menu");

  await ctx.reply("📋 <b>Sizning shaxsiy serverlaringiz:</b>", {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
});

// 4. Server tafsilotlari
bot.callbackQuery(/^view_monitor_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  await ctx.answerCallbackQuery();

  // Begona serverni ko'rolmasligi uchun user tekshiriladi
  const user = await getOrCreateUser(ctx.from);
  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, userId: user.id },
    include: { pingLogs: { take: 1, orderBy: { checkedAt: "desc" } } },
  });

  if (!monitor) {
    return ctx.reply("Server topilmadi yoki bu sizga tegishli emas.");
  }

  const lastPing = monitor.pingLogs[0];
  const statusText = !monitor.isActive
    ? "⏸ To'xtatilgan"
    : lastPing?.status === "UP"
    ? "🟢 Ishlamoqda (UP)"
    : "🔴 Yiqilgan (DOWN)";

  const lastCheckedText = lastPing
    ? new Date(lastPing.checkedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })
    : "Hali tekshirilmadi";

  const responseTimeText = lastPing?.responseTime !== undefined ? `${lastPing.responseTime} ms` : "Noma'lum";

  const details =
    `🖥 <b>Server:</b> ${monitor.name}\n` +
    `🔗 <b>URL:</b> ${monitor.url}\n` +
    `📡 <b>Holati:</b> ${statusText}\n` +
    `⏱ <b>Oraliq:</b> Har ${monitor.intervalMinutes} daqiqada\n` +
    `⚡ <b>Oxirgi javob vaqti:</b> ${responseTimeText}\n` +
    `🕒 <b>Oxirgi tekshiruv:</b> ${lastCheckedText}\n` +
    (lastPing?.errorMessage ? `⚠️ <b>Xatolik:</b> <code>${lastPing.errorMessage}</code>\n` : "");

  const actionsKeyboard = new InlineKeyboard()
    .text(monitor.isActive ? "⏸ Pauza qilish" : "▶️ Davom ettirish", `toggle_${monitor.id}`)
    .text("🔄 Hozir tekshirish", `ping_now_${monitor.id}`)
    .row()
    .text("⚙️ Vaqtni o'zgartirish", `edit_interval_prompt_${monitor.id}`)
    .text("🗑 O'chirish", `delete_confirm_${monitor.id}`)
    .row()
    .text("🔙 Serverlar ro'yxati", "my_servers");

  await ctx.reply(details, { reply_markup: actionsKeyboard, parse_mode: "HTML" });
});

// 5. Pauza / Davom ettirish
bot.callbackQuery(/^toggle_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  const user = await getOrCreateUser(ctx.from);

  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, userId: user.id },
  });
  if (!monitor) return ctx.answerCallbackQuery("Ruxsat berilmadi yoki topilmadi");

  const updated = await prisma.monitor.update({
    where: { id: monitorId },
    data: { isActive: !monitor.isActive },
  });

  await ctx.answerCallbackQuery(updated.isActive ? "Monitoring yoqildi!" : "Monitoring to'xtatildi!");
  await ctx.reply(
    updated.isActive
      ? `▶️ <b>${updated.name}</b> monitoringi davom ettirilmoqda.`
      : `⏸ <b>${updated.name}</b> vaqtincha to'xtatildi.`,
    {
      reply_markup: new InlineKeyboard().text("👁 Server tafsilotlari", `view_monitor_${monitorId}`),
      parse_mode: "HTML",
    }
  );
});

// 6. Hozir tekshirish (Ping now)
bot.callbackQuery(/^ping_now_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  const user = await getOrCreateUser(ctx.from);

  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, userId: user.id },
  });
  if (!monitor) return ctx.answerCallbackQuery("Server topilmadi");

  await ctx.answerCallbackQuery("Tekshirilmoqda...");
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

  await ctx.reply(
    `🔄 <b>Natija (${monitor.name}):</b>\n\n` +
      `Status: ${result.status === "UP" ? "🟢 Ishlamoqda" : "🔴 Yiqilgan"}\n` +
      `Kechikish: ${result.responseTime} ms\n` +
      `Status kod: ${result.statusCode ?? "Noma'lum"}` +
      (result.errorMessage ? `\nXatolik: <code>${result.errorMessage}</code>` : ""),
    {
      reply_markup: new InlineKeyboard().text("👁 Serverga qaytish", `view_monitor_${monitorId}`),
      parse_mode: "HTML",
    }
  );
});

// 7. O'chirish tasdig'i
bot.callbackQuery(/^delete_confirm_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text("Ha, o'chirilsin 🗑", `delete_execute_${monitorId}`)
    .text("Bekor qilish ❌", `view_monitor_${monitorId}`);

  await ctx.reply("Ushbu serverni ro'yxatdan butunlay o'chirmoqchimisiz?", {
    reply_markup: keyboard,
  });
});

// 8. O'chirish
bot.callbackQuery(/^delete_execute_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  const user = await getOrCreateUser(ctx.from);
  const isAdmin = isUserAdmin(ctx.from.id);

  await prisma.monitor.deleteMany({
    where: { id: monitorId, userId: user.id },
  });

  await ctx.answerCallbackQuery();
  await ctx.reply("✅ Server o'chirildi.", { reply_markup: getMainMenu(isAdmin) });
});

// 9. Vaqtni tahrirlash
bot.callbackQuery(/^edit_interval_prompt_(.+)$/, async (ctx) => {
  const monitorId = ctx.match[1];
  await ctx.answerCallbackQuery();

  userState[ctx.from.id] = { step: "editing_interval", monitorId };
  await ctx.reply("Yangi tekshiruv vaqt oralig'ini tanlang:", {
    reply_markup: getIntervalKeyboard("edit_interval_"),
  });
});

bot.callbackQuery(/^edit_interval_(\d+)$/, async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state || !state.monitorId) return ctx.answerCallbackQuery("Sessiya topilmadi.");

  const intervalMinutes = parseInt(ctx.match[1], 10);
  const user = await getOrCreateUser(ctx.from);

  await prisma.monitor.updateMany({
    where: { id: state.monitorId, userId: user.id },
    data: { intervalMinutes },
  });

  const mId = state.monitorId;
  delete userState[ctx.from.id];

  await ctx.answerCallbackQuery("Yangilandi!");
  await ctx.reply(`✅ Vaqt har <b>${intervalMinutes}</b> daqiqaga o'rnatildi.`, {
    reply_markup: new InlineKeyboard().text("👁 Server tafsilotlari", `view_monitor_${mId}`),
    parse_mode: "HTML",
  });
});

// Asosiy menyuga qaytish
bot.callbackQuery("back_to_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const isAdmin = isUserAdmin(ctx.from.id);
  await ctx.reply("🤖 Asosiy menyu:", { reply_markup: getMainMenu(isAdmin) });
});

// Havola yozilganda
bot.on("message:text", async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state) return;

  if (state.step === "awaiting_url") {
    let inputUrl = ctx.message.text.trim();

    // 1. Agar foydalanuvchi "http://" yoki "https://" yozmagan bo'lsa, avtomatik qo'shamiz
    if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
      inputUrl = `https://${inputUrl}`;
    }

    try {
      const parsed = new URL(inputUrl);

      // 2. Domen nomi formati tekshiriladi (kamida bitta nuqta bo'lishi kerak yoki localhost)
      if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
        return ctx.reply(
          `❌ <b>Noto'g'ri havola formati!</b>\n\n` +
          `Siz kiritgan <code>${ctx.message.text}</code> manzili yaroqsiz.\n` +
          `Sayt manzili to'liq domen nomiga ega bo'lishi shart (masalan: <code>google.com</code> yoki <code>https://my-site.uz</code>).\n\n` +
          `Iltimos, qaytadan to'g'ri havola yuboring:`,
          { parse_mode: "HTML" }
        );
      }

      const validUrl = parsed.toString();

      await ctx.reply("🔍 <b>Sayt tekshirilmoqda...</b>\n<i>Serverga so'rov yuborilmoqda, iltimos kuting.</i>", {
        parse_mode: "HTML",
      });

      // 3. Serverga haqiqiy tekshiruv so'rovi yuboriladi (Ping)
      const pingTest = await PingService.checkUrl(validUrl);

      // 4. AGAR BIRINCHI SO'ROVIDAYOQ XATOLIK BO'LSA (DOWN, xato kod yoki ulanib bo'lmasa) — QABUL QILINMAYDI!
      if (pingTest.status !== "UP") {
        const errorReason = pingTest.errorMessage || "Sayt javob bermadi yoki server mavjud emas";
        const codeInfo = pingTest.statusCode ? ` (HTTP kod: <b>${pingTest.statusCode}</b>)` : " (Aloqa yo'q)";

        return ctx.reply(
          `❌ <b>Sayt qabul qilinmadi! Tekshiruvda xatolik yuz berdi.</b>\n\n` +
          `🌐 <b>Tekshirilgan manzil:</b> <code>${validUrl}</code>\n` +
          `📡 <b>Holat:</b> 🔴 DOWN${codeInfo}\n` +
          `⚠️ <b>Sabab:</b> <code>${errorReason}</code>\n\n` +
          `📌 <i>Qoida: Faqatgina hozirda ishlab turgan va muvaffaqiyatli (200-399) javob berayotgan saytlarni monitoringga qo'shishingiz mumkin.</i>\n\n` +
          `Iltimos, ishlayotgan boshqa havola yuboring (yoki bekor qilish uchun /start bosing):`,
          { parse_mode: "HTML" }
        );
      }

      // 5. Faqatgina tekshiruv muvaffaqiyatli (UP) bo'lsagina qabul qilinadi
      state.url = validUrl;
      state.name = parsed.hostname;
      state.step = "awaiting_interval";

      await ctx.reply(
        `✅ <b>Sayt muvaffaqiyatli tekshirildi va faol!</b>\n\n` +
          `🌐 <b>Manzil:</b> ${validUrl}\n` +
          `📡 <b>Dastlabki holat:</b> 🟢 Ishlamoqda (UP)\n` +
          `⚡ <b>Javob vaqti:</b> ${pingTest.responseTime} ms\n` +
          `🔢 <b>Status kod:</b> ${pingTest.statusCode || 200} (OK)\n\n` +
          `Ushbu sayt har necha daqiqada tekshirilsin?`,
        { reply_markup: getIntervalKeyboard("interval_"), parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(
        "❌ <b>Noto'g'ri URL kiritildi!</b>\nIltimos, to'g'ri veb-manzil kiriting (masalan: <code>google.com</code>):",
        { parse_mode: "HTML" }
      );
    }
  }
});

// Yangi monitor saqlash
bot.callbackQuery(/^interval_(\d+)$/, async (ctx) => {
  const state = userState[ctx.from.id];

  if (!state || !state.url || !state.name) {
    return ctx.answerCallbackQuery("Sessiya tugagan, /start bosing.");
  }

  const intervalMinutes = parseInt(ctx.match[1], 10);
  const user = await getOrCreateUser(ctx.from);

  const monitor = await prisma.monitor.create({
    data: {
      name: state.name,
      url: state.url,
      intervalMinutes: intervalMinutes,
      userId: user.id,
    },
  });

  const ping = await PingService.checkUrl(state.url);
  await prisma.pingLog.create({
    data: {
      monitorId: monitor.id,
      statusCode: ping.statusCode,
      responseTime: ping.responseTime,
      status: ping.status,
      errorMessage: ping.errorMessage,
    },
  });

  delete userState[ctx.from.id];
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n` +
      `Sayt: <b>${monitor.name}</b>\n` +
      `Oraliq: Har <b>${intervalMinutes}</b> daqiqada.`,
    {
      reply_markup: new InlineKeyboard()
        .text("👁 Serverni ko'rish", `view_monitor_${monitor.id}`)
        .row()
        .text("🖥 Barcha serverlarim", "my_servers"),
      parse_mode: "HTML",
    }
  );
});
