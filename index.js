// Root entrypoint for Render and Node environments
const { execSync } = require("child_process");

try {
  console.log("Database migratsiyasi tekshirilmoqda (prisma db push)...");
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  console.log("Database jadvallari tayyor!");
} catch (err) {
  console.error("Database migratsiyasida ogohlantirish:", err.message);
}

require("./dist/server.js");
