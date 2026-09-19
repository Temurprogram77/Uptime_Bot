import axios from "axios";

export interface PingResult {
  statusCode: number | null;
  responseTime: number;
  status: "UP" | "DOWN";
  errorMessage?: string;
}

export class PingService {
  static async checkUrl(url: string, timeoutMs: number = 10000): Promise<PingResult> {
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: {
          "User-Agent": "UptimeMonitorBot/1.0",
        },
        validateStatus: () => true, // Har qanday status kodni (404, 500) xato deb tashlamaslik uchun
      });

      const responseTime = Date.now() - startTime;
      const isUp = response.status >= 200 && response.status < 400;

      return {
        statusCode: response.status,
        responseTime,
        status: isUp ? "UP" : "DOWN",
        errorMessage: isUp ? undefined : `Qaytgan status kodi: ${response.status}`,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      return {
        statusCode: null,
        responseTime,
        status: "DOWN",
        errorMessage: error.message || "Ulanishda noma'lum xatolik yuz berdi",
      };
    }
  }
}