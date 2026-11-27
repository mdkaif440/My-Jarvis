export type AssistantStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "executing"
  | "awaiting_confirmation"
  | "error";

export type VoiceLanguage = "en-IN" | "en-US" | "hi-IN" | "hinglish";

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ToolValidationResult {
  valid: boolean;
  name?: string;
  arguments?: Record<string, unknown>;
  sensitivity?: "harmless" | "sensitive";
  requiresConfirmation?: boolean;
  error?: string;
}

export interface ValidatedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  validation: ToolValidationResult;
}

export interface ToolExecutionReport {
  toolName: string;
  status: "success" | "cancelled" | "blocked" | "requires_companion" | "error";
  summary: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  toolReports?: ToolExecutionReport[];
  usage?: TokenUsage | null;
  model?: string;
  isError?: boolean;
}

export interface PendingConfirmation {
  id: string;
  toolName: string;
  title: string;
  description: string;
  recipient?: string;
  messagePreview?: string;
  channelNote: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

export interface AccessibleNotification {
  id: string;
  packageName: string;
  appName: string;
  sender: string;
  text: string;
  timestamp: number;
  conversationTitle?: string;
}

export interface PersonalMemory {
  id: string;
  content: string;
  category: "preference" | "routine" | "task" | "contact_note" | "general";
  createdAt: string;
  updatedAt: string;
}

export interface LocalReminder {
  id: string;
  title: string;
  timeIso?: string;
  notes?: string;
  createdAt: string;
  completed: boolean;
}

export interface JarvisSettings {
  model: string;
  voiceURI: string;
  speakingRate: number;
  language: VoiceLanguage;
  wakePhrase: string;
  requireWakePhrase: boolean;
  continuousListening: boolean;
  autoSpeakResponses: boolean;
  memoryEnabled: boolean;
  companionUrl: string;
  companionToken: string;
  hudIntensity: "standard" | "high" | "minimal";
}

export interface BackendConfigStatus {
  openRouterConfigured: boolean;
  defaultModel: string;
  recommendedModels: Array<{ id: string; label: string }>;
  rateLimitPerMinute: number;
  availableTools: Array<{
    name: string;
    sensitivity: "harmless" | "sensitive";
    requiresConfirmation: boolean;
    description: string;
  }>;
}

export interface CompanionStatus {
  connected: boolean;
  version?: string;
  notificationAccessEnabled: boolean;
  foregroundVoiceActive: boolean;
  accessibilityHelperEnabled: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  outcome: "allowed" | "confirmed" | "cancelled" | "blocked" | "error";
  detail: string;
}
