import { VoiceLanguage } from "../types/jarvis";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices();
}

function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI: string,
  language: VoiceLanguage,
  text: string
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  const wantHindi = language === "hi-IN" || containsDevanagari(text);
  if (wantHindi) {
    return voices.find((v) => v.lang.toLowerCase().startsWith("hi")) || voices[0];
  }
  return (
    voices.find((v) => v.lang.toLowerCase() === "en-in") ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en-gb")) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    voices[0]
  );
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function speakText(
  text: string,
  options: {
    voiceURI?: string;
    rate?: number;
    language?: VoiceLanguage;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  } = {}
): void {
  if (!isSpeechSynthesisSupported()) {
    options.onEnd?.();
    return;
  }

  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    options.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleaned);
  const voices = listAvailableVoices();
  const chosen = pickVoice(voices, options.voiceURI || "", options.language || "en-IN", cleaned);
  if (chosen) {
    utterance.voice = chosen;
    utterance.lang = chosen.lang;
  } else {
    utterance.lang = containsDevanagari(cleaned) ? "hi-IN" : "en-IN";
  }

  utterance.rate = Math.min(1.6, Math.max(0.6, options.rate ?? 1.0));
  utterance.pitch = 0.96;

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();

  window.speechSynthesis.speak(utterance);
}
