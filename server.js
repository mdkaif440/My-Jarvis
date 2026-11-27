import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { apiRateLimiter, sanitizeRequestBody } from "./middleware/security.js";
import { apiRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({
    origin: (origin, cb) => (!origin || env.corsOrigins.includes(origin) || env.nodeEnv !== "production" ? cb(null, true) : cb(new Error("CORS blocked"))),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  }));
  app.use(express.json({ limit: "256kb" }));
  app.use(sanitizeRequestBody);
  app.use("/api", apiRateLimiter, apiRouter);

  const frontendDist = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res, next) => (req.path.startsWith("/api/") ? next() : res.sendFile(path.join(frontendDist, "index.html"))));
  }

  app.use((err, _req, res, _next) => {
    res.status(err?.status || 500).json({ error: "SERVER_ERROR", message: err?.message || "Unexpected error" });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createApp().listen(env.port, () => {
    console.log(`[JARVIS Backend] http://localhost:${env.port} | Model: ${env.defaultModel}`);
  });
}
