# Uptime Monitor & Telegram Bot Backend 🚀

Multi-Tenant Uptime & Server Health Monitor backend service with automated cron health checks, Telegram Bot integration (Grammy), and Telegram Mini App (TWA) Admin REST APIs.

## Tech Stack
- **Runtime**: Node.js & TypeScript
- **Framework**: Express.js 5 + Helmet + CORS
- **Database & ORM**: Prisma ORM (SQLite / PostgreSQL)
- **Telegram Bot**: Grammy Bot Framework
- **Task Scheduler**: node-cron

---

## 🛠 Features
- **Multi-Tenant Server Monitoring**: Regular users can add, pause, test, and delete their own monitored sites.
- **Downtime Alerts**: Real-time Telegram alerts sent directly to users on state change to `DOWN`.
- **Admin REST API (`/api/admin`)**:
  - `GET /api/admin/stats`: Total users, monitors, and live UP/DOWN counts.
  - `GET /api/admin/users`: Full user profiles with monitor counts and latest pings.
  - `DELETE /api/admin/users/:id`: Kick/delete user with cascade deletion.
  - `POST /api/admin/users/:id/message`: Send direct admin alert to user via bot.
  - `GET /api/admin/monitors`: Global view of all monitored servers.
  - `PATCH /api/admin/monitors/:id/toggle`: Pause or resume any server.
  - `POST /api/admin/monitors/:id/ping`: Instant on-demand ping check.
  - `PATCH /api/admin/monitors/:id/interval`: Change check interval (1m to 24h).
  - `GET /api/admin/monitors/:id/logs`: History of last 20 ping checks.

---

## 🚀 Render.com Deployment

1. Create a new **Web Service** on [Render.com](https://dashboard.render.com).
2. Connect this repository (`Temurprogram77/Uptime_Bot`).
3. Set the following settings:
   - **Environment**: `Node`
   - **Build Command**:
     ```bash
     pnpm install && pnpm run build
     ```
   - **Start Command**:
     ```bash
     pnpm run prisma:push && pnpm run start
     ```
4. Add the following **Environment Variables**:
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
   - `TELEGRAM_BOT_TOKEN`: `YOUR_TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`: `6150067773`
   - `DATABASE_URL`: `file:./dev.db`
   - `WEBAPP_URL`: `https://YOUR_VERCEL_FRONTEND.vercel.app`
