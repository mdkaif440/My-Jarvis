import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests to JARVIS backend. Please wait a moment and retry.",
  },
});

export function sanitizeRequestBody(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    const clean = (val) => {
      if (typeof val === "string") return val.replace(/\u0000/g, "");
      if (Array.isArray(val)) return val.map(clean);
      if (val && typeof val === "object") {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
          out[k] = clean(v);
        }
        return out;
      }
      return val;
    };
    req.body = clean(req.body);
  }
  next();
}
