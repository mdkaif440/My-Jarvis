import {
  BackendConfigStatus,
  PersonalMemory,
  TokenUsage,
  ToolValidationResult,
  ValidatedToolCall,
} from "../types/jarvis";

export interface StreamHandlers {
  onToken: (token: string) => void;
  onToolCalls: (toolCalls: ValidatedToolCall[]) => void;
  onUsage: (usage: TokenUsage, model: string) => void;
  onError: (code: string, message: string) => void;
  onDone: (model: string) => void;
}

export async function fetchBackendStatus(): Promise<BackendConfigStatus> {
  const res = await fetch("/api/config/status");
  if (!res.ok) throw new Error(`Backend status error (${res.status})`);
  return res.json();
}

export async function validateToolOnBackend(
  name: string,
  args: Record<string, unknown>
): Promise<ToolValidationResult> {
  const res = await fetch("/api/tools/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  return res.json();
}

export async function streamJarvisChat(
  payload: {
    model: string;
    messages: Array<{
      role: "user" | "assistant" | "tool";
      content?: string | null;
      tool_call_id?: string;
      name?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }>;
    memories?: Pick<PersonalMemory, "category" | "content">[];
    contextMeta?: {
      currentTime: string;
      language: string;
      companionConnected: boolean;
      notificationAccessEnabled: boolean;
    };
    enableTools?: boolean;
  },
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  if (!navigator.onLine) {
    handlers.onError(
      "OFFLINE",
      "Internet connection is disconnected. Offline mode supports the JARVIS interface, but DeepSeek AI requires internet connectivity."
    );
    return;
  }

  let res: Response;
  try {
    res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError(
      "BACKEND_UNREACHABLE",
      "Unable to reach JARVIS backend server. Confirm the Node.js backend is running on port 5000."
    );
    return;
  }

  if (!res.ok) {
    let errMsg = `Backend request failed (${res.status})`;
    let errCode = "HTTP_ERROR";
    try {
      const json = await res.json();
      errMsg = json.message || errMsg;
      errCode = json.error || errCode;
    } catch {}
    handlers.onError(errCode, errMsg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError("STREAM_ERROR", "Streaming response body was unavailable.");
    return;
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentEvent = "message";
        continue;
      }
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const jsonStr = line.slice(5).trim();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (currentEvent === "token" && typeof data.token === "string") {
          handlers.onToken(data.token);
        } else if (currentEvent === "tool_calls" && Array.isArray(data.tool_calls)) {
          handlers.onToolCalls(data.tool_calls as ValidatedToolCall[]);
        } else if (currentEvent === "usage" && data.usage) {
          handlers.onUsage(data.usage as TokenUsage, String(data.model || payload.model));
        } else if (currentEvent === "error") {
          handlers.onError(
            String(data.code || "AI_ERROR"),
            String(data.message || "AI stream returned an error.")
          );
          return;
        } else if (currentEvent === "done") {
          handlers.onDone(String(data.model || payload.model));
        }
      }
    }
  }
}
