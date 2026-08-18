// PM2 process definition for MAD Delivery HQ (production).
// - Binds Next.js to 127.0.0.1 only (public traffic arrives via Nginx).
// - No secrets here: the app loads .env at runtime (DATABASE_URL, AUTH_SECRET,
//   ADMIN_*). Only non-secret runtime vars live below.
// - LD_LIBRARY_PATH points at this project's bundled libvips so the Sharp WEBP
//   upload pipeline works at runtime on this linux-x64 host (project-local only;
//   no global library change).
const path = require("node:path");

const PROJECT_ROOT = "/home/labour_care/mad-delivery-hq";
const SHARP_LIBVIPS = path.join(
  PROJECT_ROOT,
  "node_modules/@img/sharp-linux-x64/node_modules/@img/sharp-libvips-linux-x64/lib",
);

module.exports = {
  apps: [
    {
      name: "mad-delivery-hq",
      cwd: PROJECT_ROOT,
      script: "npm",
      args: "run start -- -H 127.0.0.1 -p 3200",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3200",
        HOSTNAME: "127.0.0.1",
        LD_LIBRARY_PATH: SHARP_LIBVIPS,
      },
    },
  ],
};
