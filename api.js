import express from "express";
import { z } from "zod";
import { env, isOpenRouterConfigured } from "../config/env.js";
import { createChatCompletion, streamChatCompletion } from "../services/openrouterService.js";
import { TOOL_DEFINITIONS, validateToolCall } from "../tools/registry.js";

export const apiRouter = express.Router();

const chatRequestSchema = z.object({
  model: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9._:/-]+$/).optional(),
  enableTools: z.boolean().default(true),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "tool"]),
    content: z.string().max(12000).nullable().optional(),
    tool_call_id: z.string().max(128).optional(),
    name: z.string().max(64).optional(),
    tool_calls: z.array(z.object({
      id: z.string().max(128),
      type: z.literal("function"),
      function: z.object({ name: z.string().max(64), arguments: z.string().max(8000) }),
    })).optional(),
  })).min(1).max(40),
  memories: z.array(z.object({ category: z.string().max(40).optional(), content: z.string().max(400) })).max(30).optional(),
  contextMeta: z.object({
    currentTime: z.string().max(80).optional(),
    language: z.string().max(30).optional(),
    companionConnected: z.boolean().optional(),
    notificationAccessEnabled: z.boolean().optional(),
  }).optional(),
});

apiRouter.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

apiRouter.get("/config/status", (_req, res) => {
  res.json({
    openRouterConfigured: isOpenRouterConfigured(),
    defaultModel: env.defaultModel,
    recommendedModels: [
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (Default)" },
      { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (Fast)" },
      { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3 0324" },
      { id: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    rateLimitPerMinute: env.rateLimitMax,
    availableTools: Object.entries(TOOL_DEFINITIONS).map(([name, def]) => ({
      name,
      sensitivity: def.sensitivity,
      requiresConfirmation: def.requiresConfirmation,
      description: def.description,
    })),
  });
});

apiRouter.post("/tools/validate", (req, res) => {
  const { name, arguments: args } = req.body || {};
  const result = validateToolCall(name, args ?? {});
  res.status(result.valid ? 200 : 400).json(result);
});

apiRouter.post("/chat", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid chat request.", details: parsed.error.issues });
  }
  try {
    const result = await createChatCompletion(parsed.data);
    return res.json(result);
  } catch (err) {
    return res.status(err?.status || 500).json({ error: err?.code || "INTERNAL_ERROR", message: err?.message || "Unexpected error." });
  }
});

apiRouter.post("/chat/stream", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid chat request.", details: parsed.error.issues });
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  await streamChatCompletion({
    ...parsed.data,
    signal: abortController.signal,
    onEvent: (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
  });
  if (!res.writableEnded) res.end();
});
