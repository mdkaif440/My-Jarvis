import { JarvisSettings } from "../types/jarvis";

const SETTINGS_KEY = "jarvis_settings_v1";

export const DEFAULT_SETTINGS: JarvisSettings = {
  model: "deepseek/deepseek-chat",
  voiceURI: "",
  speakingRate: 1.02,
  language: "hinglish",
  wakePhrase: "hey jarvis",
  requireWakePhrase: false,
  continuousListening: false,
  autoSpeakResponses: true,
  memoryEnabled: true,
  companionUrl: "http://127.0.0.1:8765",
  companionToken: "",
  hudIntensity: "standard",
};

export function loadSettings(): JarvisSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      speakingRate: Math.min(1.6, Math.max(0.6, Number(parsed.speakingRate) || DEFAULT_SETTINGS.speakingRate)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: JarvisSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
