import dotenv from "dotenv";

dotenv.config();

const parseOrigins = (raw) =>
  (raw || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  openRouterApiKey: (process.env.OPENROUTER_API_KEY || "").trim(),
  defaultModel: (process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat").trim(),
  openRouterBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  appSiteUrl: (process.env.APP_SITE_URL || "http://localhost:5173").trim(),
  appSiteName: (process.env.APP_SITE_NAME || "JARVIS AI Assistant").trim(),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 30,
};

export const isOpenRouterConfigured = () =>
  Boolean(env.openRouterApiKey && env.openRouterApiKey.length >= 10);
