import {
  AccessibleNotification,
  CompanionStatus,
  JarvisSettings,
  PendingConfirmation,
  ToolExecutionReport,
  ValidatedToolCall,
} from "../types/jarvis";
import { CompanionBridgeClient } from "../services/companionBridge";
import { addMemory, appendAuditLog, saveReminder } from "../memory/memoryStore";

export interface ToolExecutionContext {
  settings: JarvisSettings;
  companionStatus: CompanionStatus;
  requestConfirmation: (
    prompt: Omit<PendingConfirmation, "id" | "resolve">
  ) => Promise<boolean>;
  onMemoriesChanged: () => void;
  onRemindersChanged: () => void;
  onNotificationsLoaded: (items: AccessibleNotification[]) => void;
}

const PWA_APP_FALLBACK_URLS: Record<string, { url: string; label: string; nativeOnly?: boolean }> = {
  whatsapp: { url: "https://wa.me/", label: "WhatsApp" },
  instagram: { url: "https://www.instagram.com/", label: "Instagram" },
  youtube: { url: "https://www.youtube.com/", label: "YouTube" },
  chrome: { url: "https://www.google.com/", label: "Chrome / Google" },
  maps: { url: "https://maps.google.com/", label: "Google Maps" },
  calendar: { url: "https://calendar.google.com/", label: "Google Calendar" },
  gmail: { url: "https://mail.google.com/", label: "Gmail" },
  spotify: { url: "https://open.spotify.com/", label: "Spotify" },
  settings: { url: "", label: "Android Settings", nativeOnly: true },
  camera: { url: "", label: "Android Camera", nativeOnly: true },
  phone: { url: "tel:", label: "Android Dialer" },
  clock: { url: "", label: "Clock", nativeOnly: true },
  calculator: { url: "", label: "Calculator", nativeOnly: true },
  contacts: { url: "", label: "Contacts", nativeOnly: true },
  messages: { url: "sms:", label: "Messages" },
};

function sanitizePhoneDigits(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/[^0-9+]/g, "");
}

function groupNotificationsBySender(items: AccessibleNotification[]): Record<string, AccessibleNotification[]> {
  return items.reduce<Record<string, AccessibleNotification[]>>((acc, item) => {
    const key = item.sender || "Unknown Sender";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function buildIcsCalendarDownload(args: {
  title: string;
  start_iso: string;
  end_iso?: string;
  location?: string;
  description?: string;
}) {
  const toIcsDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const start = toIcsDate(args.start_iso) || toIcsDate(new Date(Date.now() + 3600_000).toISOString())!;
  const end =
    (args.end_iso && toIcsDate(args.end_iso)) ||
    toIcsDate(new Date(new Date(args.start_iso).getTime() + 3600_000).toISOString()) ||
    start;

  const gcalUrl = new URL("https://calendar.google.com/calendar/render");
  gcalUrl.searchParams.set("action", "TEMPLATE");
  gcalUrl.searchParams.set("text", args.title);
  gcalUrl.searchParams.set("dates", `${start}/${end}`);
  if (args.location) gcalUrl.searchParams.set("location", args.location);
  if (args.description) gcalUrl.searchParams.set("details", args.description);

  return { gcalUrl: gcalUrl.toString() };
}

export async function executeValidatedTool(
  toolCall: ValidatedToolCall,
  ctx: ToolExecutionContext
): Promise<ToolExecutionReport> {
  const now = new Date().toISOString();
  const toolName = toolCall.function.name;

  if (!toolCall.validation || !toolCall.validation.valid) {
    const reason = toolCall.validation?.error || `Tool "${toolName}" failed validation.`;
    appendAuditLog(toolName, "blocked", reason);
    return { toolName, status: "blocked", summary: reason, timestamp: now };
  }

  const args = (toolCall.validation.arguments || {}) as Record<string, unknown>;
  const companion = new CompanionBridgeClient(
    ctx.settings.companionUrl,
    ctx.settings.companionToken
  );

  try {
    switch (toolName) {
      case "open_app": {
        const appName = String(args.app_name || "").toLowerCase();
        if (ctx.companionStatus.connected) {
          const res = await companion.launchApp(appName);
          appendAuditLog("open_app", "allowed", `Companion launched ${appName}: ${res.message}`);
          return {
            toolName,
            status: res.launched ? "success" : "error",
            summary: res.message,
            details: { channel: "android_companion", app_name: appName },
            timestamp: now,
          };
        }

        const fallback = PWA_APP_FALLBACK_URLS[appName];
        if (!fallback || fallback.nativeOnly) {
          const msg = `Opening ${fallback?.label || appName} directly requires the JARVIS Native Android Companion app.`;
          appendAuditLog("open_app", "blocked", msg);
          return { toolName, status: "requires_companion", summary: msg, timestamp: now };
        }

        window.open(fallback.url, "_blank", "noopener,noreferrer");
        const msg = `Opened ${fallback.label} via browser/Android app link.`;
        appendAuditLog("open_app", "allowed", msg);
        return { toolName, status: "success", summary: msg, timestamp: now };
      }

      case "open_website": {
        const rawUrl = args.url ? String(args.url) : "";
        const searchQuery = args.search_query ? String(args.search_query) : "";
        const finalUrl = rawUrl
          ? rawUrl
          : `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

        const parsed = new URL(finalUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          appendAuditLog("open_website", "blocked", `Disallowed protocol: ${parsed.protocol}`);
          return { toolName, status: "blocked", summary: "Blocked unsafe URL protocol.", timestamp: now };
        }

        window.open(finalUrl, "_blank", "noopener,noreferrer");
        const summary = searchQuery
          ? `Opened Google search for "${searchQuery}".`
          : `Opened website ${parsed.hostname}.`;
        appendAuditLog("open_website", "allowed", summary);
        return { toolName, status: "success", summary, details: { url: finalUrl }, timestamp: now };
      }

      case "make_call": {
        const recipient = String(args.recipient || "");
        const phoneNumber = sanitizePhoneDigits(args.phone_number ? String(args.phone_number) : recipient);

        const approved = await ctx.requestConfirmation({
          toolName: "make_call",
          title: "Confirm Phone Dialer Action",
          description: `Open Android dialer to call ${recipient}?`,
          recipient: phoneNumber || recipient,
          channelNote: ctx.companionStatus.connected
            ? "Uses Android Companion ACTION_DIAL intent."
            : "Opens your Android phone dialer via tel: URI.",
          args,
        });

        if (!approved) {
          appendAuditLog("make_call", "cancelled", `User cancelled call to ${recipient}`);
          return { toolName, status: "cancelled", summary: `Cancelled call to ${recipient}.`, timestamp: now };
        }

        if (ctx.companionStatus.connected) {
          const res = await companion.dialPhone(phoneNumber || recipient);
          appendAuditLog("make_call", "confirmed", res.message);
          return { toolName, status: res.launched ? "success" : "error", summary: res.message, timestamp: now };
        }

        if (!phoneNumber || phoneNumber.length < 3) {
          return {
            toolName,
            status: "requires_companion",
            summary: `To call "${recipient}" by name without a phone number, connect the JARVIS Android Companion or say the phone number explicitly.`,
            timestamp: now,
          };
        }

        window.location.href = `tel:${encodeURIComponent(phoneNumber)}`;
        const summary = `Opened the Android dialer with ${phoneNumber}.`;
        appendAuditLog("make_call", "confirmed", summary);
        return { toolName, status: "success", summary, timestamp: now };
      }

      case "read_notifications":
      case "summarize_messages": {
        const appFilter = (args.app_filter as "all" | "whatsapp") || "whatsapp";
        const senderFilter = args.sender_filter ? String(args.sender_filter).toLowerCase() : "";
        const limit = Number(args.limit) || 20;

        if (!ctx.companionStatus.connected) {
          const msg =
            "Notification reading requires the optional JARVIS Native Android Companion app with Notification Access granted. Browser PWAs cannot read WhatsApp notifications or private chat databases.";
          appendAuditLog(toolName, "blocked", msg);
          return { toolName, status: "requires_companion", summary: msg, timestamp: now };
        }

        const res = await companion.getNotifications(appFilter, limit);
        if (!res.notificationAccessEnabled) {
          const msg =
            "Android Notification Access is currently disabled for JARVIS Companion. Enable it in Android Settings → Notification access.";
          appendAuditLog(toolName, "blocked", msg);
          return { toolName, status: "requires_companion", summary: msg, timestamp: now };
        }

        let items = res.notifications || [];
        if (senderFilter) {
          items = items.filter((n) => n.sender.toLowerCase().includes(senderFilter));
        }

        ctx.onNotificationsLoaded(items);
        const grouped = groupNotificationsBySender(items);
        const senderCount = Object.keys(grouped).length;

        const summary =
          items.length === 0
            ? `No accessible unread ${appFilter === "whatsapp" ? "WhatsApp " : ""}notifications are currently available.`
            : `Retrieved ${items.length} accessible unread notification(s) across ${senderCount} conversation(s).`;

        appendAuditLog(toolName, "allowed", summary);
        return {
          toolName,
          status: "success",
          summary,
          details: { count: items.length, groupedBySender: grouped, notifications: items },
          timestamp: now,
        };
      }

      case "prepare_whatsapp_message": {
        const recipient = String(args.recipient || "");
        const message = String(args.message || "");
        const summary = `Draft prepared for ${recipient}: "${message}". Say "send it" or confirm to open WhatsApp.`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: { recipient, message, draftOnly: true }, timestamp: now };
      }

      case "send_whatsapp_message": {
        const recipient = String(args.recipient || "");
        const phone = sanitizePhoneDigits(args.phone_number ? String(args.phone_number) : "");
        const message = String(args.message || "");

        const approved = await ctx.requestConfirmation({
          toolName: "send_whatsapp_message",
          title: "Confirm WhatsApp Message",
          description: `Prepare WhatsApp handoff to ${recipient}? JARVIS will NEVER send a message silently without your approval.`,
          recipient: phone ? `${recipient} (${phone})` : recipient,
          messagePreview: message,
          channelNote: ctx.companionStatus.connected
            ? "Hands off to official WhatsApp via Android Intent. Tap Send inside WhatsApp to complete delivery."
            : "Opens official WhatsApp deep link with pre-filled text so you can verify and tap Send in WhatsApp.",
          args,
        });

        if (!approved) {
          appendAuditLog("send_whatsapp_message", "cancelled", `User cancelled WhatsApp message to ${recipient}`);
          return { toolName, status: "cancelled", summary: `Cancelled sending WhatsApp message to ${recipient}.`, timestamp: now };
        }

        if (ctx.companionStatus.connected) {
          const res = await companion.prepareWhatsAppSend({
            recipient,
            phoneNumber: phone || undefined,
            message,
          });
          appendAuditLog("send_whatsapp_message", "confirmed", res.message);
          return { toolName, status: res.opened ? "success" : "error", summary: res.message, timestamp: now };
        }

        const waUrl = phone
          ? `https://wa.me/${encodeURIComponent(phone.replace(/^\+/, ""))}?text=${encodeURIComponent(message)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");
        const summary = `Opened official WhatsApp handoff for ${recipient} with your exact message pre-filled. Please confirm and tap Send inside WhatsApp.`;
        appendAuditLog("send_whatsapp_message", "confirmed", summary);
        return { toolName, status: "success", summary, timestamp: now };
      }

      case "prepare_forward_message": {
        const fromSender = String(args.from_sender || "");
        const toRecipient = String(args.to_recipient || "");
        const toPhone = sanitizePhoneDigits(args.to_phone_number ? String(args.to_phone_number) : "");
        const keyword = args.message_keyword ? String(args.message_keyword).toLowerCase() : "";

        if (!ctx.companionStatus.connected) {
          const msg = "Cannot locate the original WhatsApp message because the Native Android Companion is disconnected.";
          appendAuditLog(toolName, "blocked", msg);
          return { toolName, status: "requires_companion", summary: msg, timestamp: now };
        }

        const notifRes = await companion.getNotifications("whatsapp", 30);
        if (!notifRes.notificationAccessEnabled) {
          return {
            toolName,
            status: "requires_companion",
            summary: "Notification Access is disabled in Android Settings.",
            timestamp: now,
          };
        }

        const match = (notifRes.notifications || []).find((n) => {
          const senderMatch = n.sender.toLowerCase().includes(fromSender.toLowerCase());
          const keyMatch = !keyword || n.text.toLowerCase().includes(keyword);
          return senderMatch && keyMatch;
        });

        if (!match) {
          return {
            toolName,
            status: "error",
            summary: `No accessible unread WhatsApp notification from "${fromSender}" was found to forward.`,
            timestamp: now,
          };
        }

        const approved = await ctx.requestConfirmation({
          toolName: "prepare_forward_message",
          title: "Confirm Forward WhatsApp Message",
          description: `Forward ${match.sender}'s accessible message to ${toRecipient}?`,
          recipient: toPhone ? `${toRecipient} (${toPhone})` : toRecipient,
          messagePreview: match.text,
          channelNote: "Hands off the exact text to WhatsApp via Android Share/WhatsApp intent so you can verify and tap Send.",
          args: { ...args, resolvedMessage: match.text },
        });

        if (!approved) {
          appendAuditLog(toolName, "cancelled", `Cancelled forwarding ${match.sender}'s message to ${toRecipient}`);
          return { toolName, status: "cancelled", summary: `Cancelled forwarding ${match.sender}'s message to ${toRecipient}.`, timestamp: now };
        }

        const handoff = await companion.prepareWhatsAppSend({
          recipient: toRecipient,
          phoneNumber: toPhone || undefined,
          message: match.text,
        });
        appendAuditLog(toolName, "confirmed", handoff.message);
        return { toolName, status: handoff.opened ? "success" : "error", summary: handoff.message, timestamp: now };
      }

      case "create_reminder": {
        const title = String(args.title || "");
        const timeIso = args.time_iso ? String(args.time_iso) : undefined;
        const notes = args.notes ? String(args.notes) : undefined;
        const saved = saveReminder(title, timeIso, notes);
        ctx.onRemindersChanged();

        const summary = timeIso
          ? `Reminder saved locally: "${title}" (${timeIso}).`
          : `Reminder saved locally: "${title}".`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: { reminder: saved }, timestamp: now };
      }

      case "create_calendar_event": {
        const title = String(args.title || "");
        const start_iso = String(args.start_iso || new Date().toISOString());
        const end_iso = args.end_iso ? String(args.end_iso) : undefined;
        const location = args.location ? String(args.location) : undefined;
        const description = args.description ? String(args.description) : undefined;

        const { gcalUrl } = buildIcsCalendarDownload({ title, start_iso, end_iso, location, description });
        window.open(gcalUrl, "_blank", "noopener,noreferrer");
        const summary = `Opened Calendar event composer for "${title}".`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: { gcalUrl }, timestamp: now };
      }

      case "share_text": {
        const text = String(args.text || "");
        const title = args.title ? String(args.title) : "Shared from JARVIS AI";

        const approved = await ctx.requestConfirmation({
          toolName: "share_text",
          title: "Confirm Share Text",
          description: "Share this text using Android / Web Share sheet?",
          messagePreview: text,
          channelNote: "Uses standard Web Share API.",
          args,
        });

        if (!approved) {
          appendAuditLog(toolName, "cancelled", "User cancelled share_text");
          return { toolName, status: "cancelled", summary: "Cancelled sharing text.", timestamp: now };
        }

        if (navigator.share) {
          await navigator.share({ title, text });
          appendAuditLog(toolName, "confirmed", "Shared text via Web Share API");
          return { toolName, status: "success", summary: "Opened system share sheet.", timestamp: now };
        }
        await navigator.clipboard?.writeText(text);
        return {
          toolName,
          status: "success",
          summary: "Web Share API is unavailable in this browser; copied text to your clipboard instead.",
          timestamp: now,
        };
      }

      case "open_navigation": {
        const destination = String(args.destination || "");
        const mode = String(args.travel_mode || "driving");
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(mode)}`;
        window.open(mapsUrl, "_blank", "noopener,noreferrer");
        const summary = `Opened Google Maps navigation to ${destination} (${mode}).`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: { mapsUrl }, timestamp: now };
      }

      case "get_battery_status": {
        if (ctx.companionStatus.connected) {
          const dev = await companion.getDeviceStatus();
          const summary = `Battery is at ${dev.batteryPercent}% (${dev.isCharging ? "charging" : "not charging"}).`;
          appendAuditLog(toolName, "allowed", summary);
          return { toolName, status: "success", summary, details: dev, timestamp: now };
        }

        const navAny = navigator as unknown as {
          getBattery?: () => Promise<{ level: number; charging: boolean }>;
        };
        if (typeof navAny.getBattery === "function") {
          const battery = await navAny.getBattery();
          const pct = Math.round(battery.level * 100);
          const summary = `Battery is at ${pct}% (${battery.charging ? "charging" : "discharging"}).`;
          appendAuditLog(toolName, "allowed", summary);
          return { toolName, status: "success", summary, timestamp: now };
        }

        return {
          toolName,
          status: "requires_companion",
          summary: "Battery Status API is not exposed by this browser. Connect the JARVIS Android Companion to read device battery telemetry.",
          timestamp: now,
        };
      }

      case "get_device_information": {
        const baseInfo: Record<string, unknown> = {
          online: navigator.onLine,
          platform: navigator.platform || "Android / Web",
          language: navigator.language,
          companionConnected: ctx.companionStatus.connected,
        };
        const summary = `Device online: ${baseInfo.online ? "Yes" : "No"}, Companion: ${ctx.companionStatus.connected ? "Connected" : "Disconnected (PWA mode)"}.`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: baseInfo, timestamp: now };
      }

      case "save_memory": {
        if (!ctx.settings.memoryEnabled) {
          return {
            toolName,
            status: "blocked",
            summary: "Personal Memory is currently disabled in Settings. Enable it to save memories.",
            timestamp: now,
          };
        }
        const content = String(args.content || "");
        const category = (args.category as "preference" | "routine" | "task" | "contact_note" | "general") || "general";
        const result = addMemory(content, category);
        if (!result.ok) {
          appendAuditLog(toolName, "blocked", result.error || "Memory blocked");
          return { toolName, status: "blocked", summary: result.error || "Memory could not be saved.", timestamp: now };
        }
        ctx.onMemoriesChanged();
        const summary = `Saved to local memory: "${content}".`;
        appendAuditLog(toolName, "allowed", summary);
        return { toolName, status: "success", summary, details: { memory: result.memory }, timestamp: now };
      }

      default:
        return { toolName, status: "blocked", summary: `Unsupported tool "${toolName}".`, timestamp: now };
    }
  } catch (err) {
    const message = (err as Error)?.message || "Tool execution failed.";
    appendAuditLog(toolName, "error", message);
    return { toolName, status: "error", summary: message, timestamp: now };
  }
}
