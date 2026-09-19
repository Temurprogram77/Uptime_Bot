import axios from "axios";

export class TelegramService {
  private static botToken = process.env.TELEGRAM_BOT_TOKEN;

  static async sendAlert(chatId: string, monitorName: string, url: string, reason: string) {
    if (!this.botToken || !chatId) return;

    const text =
      `🚨 <b>DIQQAT: Saytingiz ishlamay qoldi!</b>\n\n` +
      `📌 <b>Nom:</b> ${monitorName}\n` +
      `🔗 <b>URL:</b> ${url}\n` +
      `⚠️ <b>Xatolik:</b> <code>${reason}</code>\n` +
      `⏰ <b>Vaqt:</b> ${new Date().toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`;

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      });
    } catch (error: any) {
      console.error("Telegramga yuborishda xatolik:", error.response?.data || error.message);
    }
  }
}