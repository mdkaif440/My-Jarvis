import { VoiceLanguage } from "../types/jarvis";

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function resolveRecognitionLang(language: VoiceLanguage): string {
  switch (language) {
    case "hi-IN":
      return "hi-IN";
    case "en-US":
      return "en-US";
    case "hinglish":
    case "en-IN":
    default:
      return "en-IN";
  }
}

export function parseWakePhrase(
  transcript: string,
  wakePhrase: string
): { matchedWakePhrase: boolean; wakeOnly: boolean; command: string } {
  const cleaned = transcript.trim();
  const normalized = cleaned.toLowerCase();
  const primary = wakePhrase.trim().toLowerCase() || "hey jarvis";

  const variants = [
    primary,
    primary.replace(/^hey\s+/, ""),
    "hey jarvis",
    "ok jarvis",
    "jarvis",
    "हे जार्विस",
    "जार्विस",
  ].filter(Boolean);

  for (const variant of variants) {
    const idx = normalized.indexOf(variant);
    if (idx !== -1) {
      const after = cleaned.slice(idx + variant.length).replace(/^[,.:!?\s-]+/, "").trim();
      return {
        matchedWakePhrase: true,
        wakeOnly: after.length === 0,
        command: after,
      };
    }
  }

  return {
    matchedWakePhrase: false,
    wakeOnly: false,
    command: cleaned,
  };
}

export interface VoiceListenerCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (code: string, readableMessage: string) => void;
}

export class JarvisVoiceRecognizer {
  private recognition: BrowserSpeechRecognition | null = null;
  private active = false;
  private shouldKeepListening = false;
  private restartTimer: number | null = null;
  private language: VoiceLanguage = "hinglish";

  public isActive(): boolean {
    return this.active;
  }

  public start(
    language: VoiceLanguage,
    continuous: boolean,
    callbacks: VoiceListenerCallbacks
  ): boolean {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      callbacks.onError?.(
        "UNSUPPORTED",
        "Speech recognition is unavailable in this browser. Use Android Chrome or type your command below."
      );
      return false;
    }

    this.stop();
    this.language = language;
    this.shouldKeepListening = continuous;

    const rec = new Ctor();
    rec.lang = resolveRecognitionLang(language);
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.active = true;
      callbacks.onStart?.();
    };

    rec.onresult = (event) => {
      let interim = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interim += text;
        }
      }

      if (interim.trim()) callbacks.onInterim?.(interim.trim());
      if (finalTranscript.trim()) callbacks.onFinal(finalTranscript.trim());
    };

    rec.onerror = (event) => {
      const code = event.error || "unknown";
      if (code === "no-speech" || code === "aborted") return;
      this.shouldKeepListening = false;
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Enable microphone access in Chrome site settings for JARVIS.",
        "service-not-allowed": "Speech recognition service is blocked by browser permissions.",
        network: "Speech recognition requires an active internet connection on Android Chrome.",
        "audio-capture": "No microphone input was detected.",
      };
      callbacks.onError?.(code, messages[code] || `Speech recognition error (${code}).`);
    };

    rec.onend = () => {
      this.active = false;
      callbacks.onEnd?.();
      if (this.shouldKeepListening) {
        this.restartTimer = window.setTimeout(() => {
          if (this.shouldKeepListening) {
            this.start(this.language, true, callbacks);
          }
        }, 450);
      }
    };

    this.recognition = rec;
    try {
      rec.start();
      return true;
    } catch {
      callbacks.onError?.("START_FAILED", "Could not start microphone listener. Tap the mic again.");
      return false;
    }
  }

  public stop(): void {
    this.shouldKeepListening = false;
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.active = false;
  }
}
