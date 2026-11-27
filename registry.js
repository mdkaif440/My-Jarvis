import { z } from "zod";

export const ALLOWED_APPS = [
  "whatsapp", "instagram", "youtube", "chrome", "settings", "phone",
  "camera", "maps", "calendar", "gmail", "spotify", "clock",
  "calculator", "contacts", "messages",
];

const safeHttpUrl = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .transform((val) => (!/^https?:\/\//i.test(val) ? `https://${val}` : val))
  .refine((val) => {
    try {
      const parsed = new URL(val);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Only valid http/https URLs are permitted.");

const safePhoneOrContact = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((val) => !/[<>`${};|&]/.test(val), "Recipient contains disallowed characters.");

const safeShortText = (max = 500) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((val) => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(val), "Text contains invalid control characters.");

const optionalPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s\-()]{3,24}$/, "Invalid phone number format.")
  .optional();

export const TOOL_DEFINITIONS = {
  open_app: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Open a supported installed Android application.",
    schema: z.object({
      app_name: z.string().trim().toLowerCase().refine((v) => ALLOWED_APPS.includes(v), {
        message: `Unsupported app. Allowed apps: ${ALLOWED_APPS.join(", ")}`,
      }),
    }),
    jsonSchema: {
      type: "object",
      properties: { app_name: { type: "string", enum: ALLOWED_APPS } },
      required: ["app_name"],
      additionalProperties: false,
    },
  },
  open_website: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Open a website URL or perform a Google web search.",
    schema: z
      .object({ url: safeHttpUrl.optional(), search_query: safeShortText(300).optional() })
      .refine((d) => Boolean(d.url || d.search_query), "Either url or search_query must be provided."),
    jsonSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        search_query: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  make_call: {
    sensitivity: "sensitive",
    requiresConfirmation: true,
    description: "Initiate a phone call through the Android dialer. Requires explicit confirmation.",
    schema: z.object({ recipient: safePhoneOrContact, phone_number: optionalPhone }),
    jsonSchema: {
      type: "object",
      properties: { recipient: { type: "string" }, phone_number: { type: "string" } },
      required: ["recipient"],
      additionalProperties: false,
    },
  },
  read_notifications: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Read unread notifications accessible via the authorized Android Companion.",
    schema: z.object({
      app_filter: z.enum(["all", "whatsapp"]).default("whatsapp"),
      sender_filter: safeShortText(80).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        app_filter: { type: "string", enum: ["all", "whatsapp"] },
        sender_filter: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  summarize_messages: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Retrieve accessible unread messages grouped by sender for summarization.",
    schema: z.object({
      app_filter: z.enum(["all", "whatsapp"]).default("whatsapp"),
      sender_filter: safeShortText(80).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        app_filter: { type: "string", enum: ["all", "whatsapp"] },
        sender_filter: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  prepare_whatsapp_message: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Draft a WhatsApp message for user review before asking to send.",
    schema: z.object({
      recipient: safePhoneOrContact,
      phone_number: optionalPhone,
      message: safeShortText(2000),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        recipient: { type: "string" },
        phone_number: { type: "string" },
        message: { type: "string" },
      },
      required: ["recipient", "message"],
      additionalProperties: false,
    },
  },
  send_whatsapp_message: {
    sensitivity: "sensitive",
    requiresConfirmation: true,
    description: "Hand off a confirmed WhatsApp message via official deep link or Android Intent.",
    schema: z.object({
      recipient: safePhoneOrContact,
      phone_number: optionalPhone,
      message: safeShortText(2000),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        recipient: { type: "string" },
        phone_number: { type: "string" },
        message: { type: "string" },
      },
      required: ["recipient", "message"],
      additionalProperties: false,
    },
  },
  prepare_forward_message: {
    sensitivity: "sensitive",
    requiresConfirmation: true,
    description: "Locate an accessible notification from a sender and prepare forwarding after confirmation.",
    schema: z.object({
      from_sender: safePhoneOrContact,
      to_recipient: safePhoneOrContact,
      to_phone_number: optionalPhone,
      message_keyword: safeShortText(120).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        from_sender: { type: "string" },
        to_recipient: { type: "string" },
        to_phone_number: { type: "string" },
        message_keyword: { type: "string" },
      },
      required: ["from_sender", "to_recipient"],
      additionalProperties: false,
    },
  },
  create_reminder: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Save a local personal reminder.",
    schema: z.object({
      title: safeShortText(200),
      time_iso: z.string().trim().max(64).optional(),
      notes: safeShortText(400).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        time_iso: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  create_calendar_event: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Open a calendar event composer with title and ISO start time.",
    schema: z.object({
      title: safeShortText(200),
      start_iso: z.string().trim().min(4).max(64),
      end_iso: z.string().trim().max(64).optional(),
      location: safeShortText(200).optional(),
      description: safeShortText(500).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_iso: { type: "string" },
        end_iso: { type: "string" },
        location: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "start_iso"],
      additionalProperties: false,
    },
  },
  share_text: {
    sensitivity: "sensitive",
    requiresConfirmation: true,
    description: "Share text through Web Share API after explicit user confirmation.",
    schema: z.object({ title: safeShortText(120).optional(), text: safeShortText(2000) }),
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  open_navigation: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Launch Google Maps navigation to a destination.",
    schema: z.object({
      destination: safeShortText(250),
      travel_mode: z.enum(["driving", "walking", "transit", "bicycling"]).default("driving"),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        travel_mode: { type: "string", enum: ["driving", "walking", "transit", "bicycling"] },
      },
      required: ["destination"],
      additionalProperties: false,
    },
  },
  get_battery_status: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Read device battery level and charging status.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  get_device_information: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Read device connectivity, platform, and companion status.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  save_memory: {
    sensitivity: "harmless",
    requiresConfirmation: false,
    description: "Save a personal preference, routine, or task locally. Never use for passwords or API keys.",
    schema: z.object({
      content: safeShortText(400),
      category: z.enum(["preference", "routine", "task", "contact_note", "general"]).default("general"),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        category: { type: "string", enum: ["preference", "routine", "task", "contact_note", "general"] },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
};

export const getOpenRouterToolsPayload = () =>
  Object.entries(TOOL_DEFINITIONS).map(([name, def]) => ({
    type: "function",
    function: { name, description: def.description, parameters: def.jsonSchema },
  }));

export function validateToolCall(name, rawArguments) {
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, name)) {
    return { valid: false, error: `Tool "${String(name)}" is not in the JARVIS allowlist and was blocked.` };
  }
  let parsedArgs = rawArguments;
  if (typeof rawArguments === "string") {
    try {
      parsedArgs = rawArguments.trim() ? JSON.parse(rawArguments) : {};
    } catch {
      return { valid: false, error: `Tool "${name}" received malformed JSON arguments.` };
    }
  }
  if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
    return { valid: false, error: `Tool "${name}" arguments must be a JSON object.` };
  }
  const def = TOOL_DEFINITIONS[name];
  const result = def.schema.safeParse(parsedArgs);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    return { valid: false, error: `Invalid arguments for "${name}": ${issues}` };
  }
  return {
    valid: true,
    name,
    arguments: result.data,
    sensitivity: def.sensitivity,
    requiresConfirmation: def.requiresConfirmation,
  };
}
