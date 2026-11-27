import { AccessibleNotification, CompanionStatus } from "../types/jarvis";

export class CompanionBridgeClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token.trim();
  }

  private isSafeLoopback(): boolean {
    try {
      const parsed = new URL(this.baseUrl);
      return (
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
        (parsed.protocol === "http:" || parsed.protocol === "https:")
      );
    } catch {
      return false;
    }
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST"; body?: Record<string, unknown>; timeoutMs?: number } = {}
  ): Promise<T> {
    if (!this.isSafeLoopback()) {
      throw new Error("Companion bridge URL must point to localhost (127.0.0.1) for security.");
    }
    if (!this.token) {
      throw new Error("Companion pairing token is missing. Copy the token from the JARVIS Android Companion app.");
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 3500);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Jarvis-Token": this.token,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || `Companion rejected request (${res.status})`);
      }
      return data as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error("Native Android Companion timed out. Ensure the companion bridge service is active.");
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  public async checkStatus(): Promise<CompanionStatus> {
    if (!this.token) {
      return {
        connected: false,
        notificationAccessEnabled: false,
        foregroundVoiceActive: false,
        accessibilityHelperEnabled: false,
        lastCheckedAt: new Date().toISOString(),
        error: "Pairing token not configured",
      };
    }

    try {
      const data = await this.request<{
        version: string;
        notificationAccessEnabled: boolean;
        foregroundVoiceActive: boolean;
        accessibilityHelperEnabled: boolean;
      }>("/bridge/status", { timeoutMs: 2500 });

      return {
        connected: true,
        version: data.version,
        notificationAccessEnabled: Boolean(data.notificationAccessEnabled),
        foregroundVoiceActive: Boolean(data.foregroundVoiceActive),
        accessibilityHelperEnabled: Boolean(data.accessibilityHelperEnabled),
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        connected: false,
        notificationAccessEnabled: false,
        foregroundVoiceActive: false,
        accessibilityHelperEnabled: false,
        lastCheckedAt: new Date().toISOString(),
        error: (err as Error).message,
      };
    }
  }

  public async launchApp(appName: string): Promise<{ launched: boolean; message: string }> {
    return this.request("/bridge/command", {
      method: "POST",
      body: { command: "open_app", params: { app_name: appName } },
    });
  }

  public async dialPhone(phoneOrContact: string): Promise<{ launched: boolean; message: string }> {
    return this.request("/bridge/command", {
      method: "POST",
      body: { command: "make_call", params: { target: phoneOrContact } },
    });
  }

  public async getNotifications(
    appFilter: "all" | "whatsapp" = "whatsapp",
    limit = 20
  ): Promise<{ notifications: AccessibleNotification[]; notificationAccessEnabled: boolean }> {
    return this.request("/bridge/command", {
      method: "POST",
      body: { command: "read_notifications", params: { app_filter: appFilter, limit } },
    });
  }

  public async prepareWhatsAppSend(params: {
    recipient: string;
    phoneNumber?: string;
    message: string;
  }): Promise<{ opened: boolean; message: string }> {
    return this.request("/bridge/command", {
      method: "POST",
      body: { command: "whatsapp_handoff", params },
    });
  }

  public async getDeviceStatus(): Promise<{
    batteryPercent: number;
    isCharging: boolean;
    model: string;
    androidVersion: string;
  }> {
    return this.request("/bridge/command", {
      method: "POST",
      body: { command: "device_status", params: {} },
    });
  }
}
