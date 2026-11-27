import { env, isOpenRouterConfigured } from "../config/env.js";
import { getOpenRouterToolsPayload, validateToolCall } from "../tools/registry.js";

const BASE_SYSTEM_PROMPT = `You are JARVIS, a calm, sharp, personal AI voice assistant running on the user's Android device (PWA + optional Native Android Companion).
Rules:
1. Match English, Hindi (Devanagari), or Hinglish naturally. Keep spoken answers crisp (1-3 sentences unless summarizing messages).
2. Never claim you accessed private WhatsApp databases or sent/forwarded a message unless a verified tool result says so.
3. Use structured tools whenever the user asks to open apps/websites, read/summarize accessible notifications, prepare/send/forward WhatsApp messages, make calls, create reminders/calendar events, navigate, check battery/device info, or save local memory.
4. Never save passwords, PINs, OTPs, or API keys in memory. Sensitive actions always require explicit user confirmation.`;

export function buildSystemMessages(memories = [], contextMeta = {}) {
  const sections = [BASE_SYSTEM_PROMPT];
  if (contextMeta && typeof contextMeta === "object") {
    const lines = [];
    if (contextMeta.currentTime) lines.push(`Local time: ${contextMeta.currentTime}`);
    if (contextMeta.language) lines.push(`Speech language: ${contextMeta.language}`);
    if (typeof contextMeta.companionConnected === "boolean") {
      lines.push(`Android Companion: ${contextMeta.companionConnected ? "CONNECTED" : "DISCONNECTED (PWA only)"}`);
    }
    if (typeof contextMeta.notificationAccessEnabled === "boolean") {
      lines.push(`Notification Access: ${contextMeta.notificationAccessEnabled ? "GRANTED" : "NOT GRANTED"}`);
    }
    if (lines.length) sections.push(`Device Runtime Context:\n${lines.join("\n")}`);
  }
  if (Array.isArray(memories) && memories.length > 0) {
    const memLines = memories
      .slice(0, 25)
      .map((m) => `- [${m.category || "general"}] ${String(m.content || "").slice(0, 300)}`)
      .join("\n");
    sections.push(`Local Personal Memories:\n${memLines}`);
  }
  return [{ role: "system", content: sections.join("\n\n") }];
}

const buildHeaders = () => ({
  Authorization: `Bearer ${env.openRouterApiKey}`,
  "Content-Type": "application/json",
  "HTTP-Referer": env.appSiteUrl,
  "X-Title": env.appSiteName,
});

function formatOpenRouterError(status, bodyText) {
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || bodyText;
  } catch {}
  if (status === 401 || status === 403) {
    return { code: "OPENROUTER_AUTH_ERROR", status: 502, message: "OpenRouter rejected OPENROUTER_API_KEY. Verify backend/.env." };
  }
  if (status === 402) {
    return { code: "OPENROUTER_CREDITS_ERROR", status: 402, message: "Insufficient OpenRouter credits for this model." };
  }
  if (status === 429) {
    return { code: "DEEPSEEK_RATE_LIMIT", status: 429, message: "DeepSeek / OpenRouter rate limit hit. Wait briefly and retry." };
  }
  return { code: "OPENROUTER_API_ERROR", status: status >= 400 && status < 600 ? status : 502, message: `OpenRouter API error (${status}): ${String(detail).slice(0, 240)}` };
}

export async function createChatCompletion({ messages, model, memories, contextMeta, enableTools = true }) {
  if (!isOpenRouterConfigured()) {
    throw { code: "OPENROUTER_NOT_CONFIGURED", status: 503, message: "OPENROUTER_API_KEY is missing in backend/.env." };
  }
  const targetModel = model || env.defaultModel;
  const payload = {
    model: targetModel,
    messages: [...buildSystemMessages(memories, contextMeta), ...messages],
    temperature: 0.4,
    stream: false,
    ...(enableTools ? { tools: getOpenRouterToolsPayload(), tool_choice: "auto" } : {}),
  };
  const response = await fetch(env.openRouterBaseUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw formatOpenRouterError(response.status, await response.text());
  const data = await response.json();
  const choice = data.choices?.[0];
  const rawToolCalls = choice?.message?.tool_calls || [];
  return {
    id: data.id,
    model: data.model || targetModel,
    content: choice?.message?.content || "",
    tool_calls: rawToolCalls.map((tc) => ({
      id: tc.id || `call_${Date.now()}`,
      type: "function",
      function: { name: tc.function?.name || "unknown", arguments: tc.function?.arguments || "{}" },
      validation: validateToolCall(tc.function?.name, tc.function?.arguments || "{}"),
    })),
    usage: data.usage || null,
  };
}

export async function streamChatCompletion({ messages, model, memories, contextMeta, enableTools = true, signal, onEvent }) {
  if (!isOpenRouterConfigured()) {
    onEvent("error", { code: "OPENROUTER_NOT_CONFIGURED", message: "OPENROUTER_API_KEY is missing in backend/.env." });
    return;
  }
  const targetModel = model || env.defaultModel;
  const payload = {
    model: targetModel,
    messages: [...buildSystemMessages(memories, contextMeta), ...messages],
    temperature: 0.4,
    stream: true,
    stream_options: { include_usage: true },
    ...(enableTools ? { tools: getOpenRouterToolsPayload(), tool_choice: "auto" } : {}),
  };

  let response;
  try {
    response = await fetch(env.openRouterBaseUrl, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") return;
    onEvent("error", { code: "NETWORK_ERROR", message: "Could not reach OpenRouter API." });
    return;
  }

  if (!response.ok) {
    const err = formatOpenRouterError(response.status, await response.text());
    onEvent("error", { code: err.code, message: err.message });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onEvent("error", { code: "STREAM_UNAVAILABLE", message: "Stream body unavailable." });
    return;
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const toolAcc = new Map();
  let finalUsage = null;
  let resolvedModel = targetModel;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const dataStr = line.slice(5).trim();
      if (dataStr === "[DONE]") continue;
      let chunk;
      try { chunk = JSON.parse(dataStr); } catch { continue; }
      if (chunk.error) {
        onEvent("error", { code: "OPENROUTER_STREAM_ERROR", message: chunk.error.message || "Stream error" });
        return;
      }
      if (chunk.model) resolvedModel = chunk.model;
      if (chunk.usage) finalUsage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        onEvent("token", { token: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) || { id: tc.id || `call_${Date.now()}_${idx}`, type: "function", function: { name: "", arguments: "" } };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.function.name += tc.function.name;
          if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
    }
  }

  if (toolAcc.size > 0) {
    const validated = Array.from(toolAcc.entries())
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({ ...tc, validation: validateToolCall(tc.function.name, tc.function.arguments || "{}") }));
    onEvent("tool_calls", { tool_calls: validated });
  }
  if (finalUsage) onEvent("usage", { usage: finalUsage, model: resolvedModel });
  onEvent("done", { model: resolvedModel });
}
