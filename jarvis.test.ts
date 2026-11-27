import { describe, it, expect } from "vitest";
import { parseWakePhrase } from "../voice/speechRecognition";
import { detectSensitiveSecret } from "../memory/secretGuard";

describe("JARVIS Voice & Security Guards", () => {
  it("parses English and Hindi wake phrases cleanly", () => {
    expect(parseWakePhrase("Hey Jarvis open WhatsApp", "hey jarvis")).toEqual({
      matchedWakePhrase: true,
      wakeOnly: false,
      command: "open WhatsApp",
    });
    expect(parseWakePhrase("Hey Jarvis", "hey jarvis")).toEqual({
      matchedWakePhrase: true,
      wakeOnly: true,
      command: "",
    });
    expect(parseWakePhrase("हे जार्विस YouTube खोलो", "hey jarvis").matchedWakePhrase).toBe(true);
  });

  it("blocks passwords and API keys from personal memory", () => {
    expect(detectSensitiveSecret("My OpenRouter key is sk-or-v1-1234567890abcdef123456").blocked).toBe(true);
    expect(detectSensitiveSecret("My UPI PIN is 4829").blocked).toBe(true);
    expect(detectSensitiveSecret("My favourite language is Python").blocked).toBe(false);
  });
});
