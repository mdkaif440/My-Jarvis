const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "OpenRouter / OpenAI API key", regex: /\bsk-(?:or-v1-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/i },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{25,}\b/ },
  { label: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "Bearer token", regex: /\bbearer\s+[A-Za-z0-9._-]{20,}\b/i },
  { label: "Password or PIN statement", regex: /\b(password|passcode|atm\s*pin|upi\s*pin|cvv|otp|secret\s*key|api\s*key|private\s*key)\b\s*(is|=|:|hai)?\s*\S+/i },
  { label: "Card number", regex: /\b(?:\d[ -]*?){13,16}\b/ },
];

export function detectSensitiveSecret(text: string): { blocked: boolean; reason?: string } {
  for (const rule of SECRET_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        blocked: true,
        reason: `Blocked for your privacy: JARVIS never stores sensitive credentials (${rule.label}) in personal memory.`,
      };
    }
  }
  return { blocked: false };
}
