import React, { useEffect, useState } from "react";
import { RefreshCw, Trash2, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { BackendConfigStatus, CompanionStatus, JarvisSettings, VoiceLanguage } from "../types/jarvis";
import { listAvailableVoices } from "../voice/speechSynthesis";

interface Props {
  settings: JarvisSettings;
  backendStatus: BackendConfigStatus | null;
  companionStatus: CompanionStatus;
  canInstallPwa: boolean;
  isPwaInstalled: boolean;
  onInstallPwa: () => void;
  onUpdateSettings: (patch: Partial<JarvisSettings>) => void;
  onTestCompanion: () => void;
  onClearHistory: () => void;
}

export const SettingsPanel: React.FC<Props> = ({
  settings,
  backendStatus,
  companionStatus,
  canInstallPwa,
  isPwaInstalled,
  onInstallPwa,
  onUpdateSettings,
  onTestCompanion,
  onClearHistory,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [customModel, setCustomModel] = useState(settings.model);

  useEffect(() => {
    const load = () => setVoices(listAvailableVoices());
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, []);

  return (
    <div className="space-y-4 pb-6">
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h2 className="font-display text-sm tracking-wider text-white">OPENROUTER &amp; DEEPSEEK AI</h2>
        <div className="flex items-center gap-2 rounded-xl bg-slate-950/70 p-3 text-xs">
          {backendStatus?.openRouterConfigured ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-200">Server OpenRouter API key is configured securely in backend/.env (hidden from browser).</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-amber-200">Backend OPENROUTER_API_KEY not detected. Set it in backend/.env and restart the Node server.</span>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">DeepSeek Model Preset</label>
          <select
            value={settings.model}
            onChange={(e) => {
              setCustomModel(e.target.value);
              onUpdateSettings({ model: e.target.value });
            }}
            className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {(backendStatus?.recommendedModels || [
              { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (Default)" },
              { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
              { id: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner" },
            ]).map((m) => (
              <option key={m.id} value={m.id}>{m.label} ({m.id})</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Custom OpenRouter model ID"
            className="flex-1 rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <button
            type="button"
            onClick={() => onUpdateSettings({ model: customModel.trim() || "deepseek/deepseek-chat" })}
            className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h2 className="font-display text-sm tracking-wider text-white">VOICE &amp; WAKE PHRASE</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Recognition Language</label>
            <select
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value as VoiceLanguage })}
              className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="hinglish">Hinglish (English + Hindi Mix)</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (हिन्दी)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Assistant Voice</label>
            <select
              value={settings.voiceURI}
              onChange={(e) => onUpdateSettings({ voiceURI: e.target.value })}
              className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Auto (Match Language)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Speaking Speed</span>
            <span className="text-cyan-300">{settings.speakingRate.toFixed(2)}x</span>
          </label>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={settings.speakingRate}
            onChange={(e) => onUpdateSettings({ speakingRate: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Wake Phrase (Active App Only)</label>
          <input
            type="text"
            value={settings.wakePhrase}
            onChange={(e) => onUpdateSettings({ wakePhrase: e.target.value })}
            className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Browser PWAs listen for wake phrases only while open. For background wake-word listening, enable the Foreground Voice Service in the optional Kotlin Android Companion.
          </p>
        </div>

        <div className="space-y-2 pt-1 text-xs">
          <label className="flex items-center justify-between">
            <span>Require wake phrase in continuous mode</span>
            <input type="checkbox" checked={settings.requireWakePhrase} onChange={(e) => onUpdateSettings({ requireWakePhrase: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
          </label>
          <label className="flex items-center justify-between">
            <span>Continuous conversation mode (while active)</span>
            <input type="checkbox" checked={settings.continuousListening} onChange={(e) => onUpdateSettings({ continuousListening: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
          </label>
          <label className="flex items-center justify-between">
            <span>Speak JARVIS responses aloud</span>
            <input type="checkbox" checked={settings.autoSpeakResponses} onChange={(e) => onUpdateSettings({ autoSpeakResponses: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
          </label>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm tracking-wider text-white">ANDROID NATIVE COMPANION</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${companionStatus.connected ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
            {companionStatus.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <input
          type="url"
          value={settings.companionUrl}
          onChange={(e) => onUpdateSettings({ companionUrl: e.target.value })}
          placeholder="http://127.0.0.1:8765"
          className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-xs text-white"
        />
        <input
          type="password"
          value={settings.companionToken}
          onChange={(e) => onUpdateSettings({ companionToken: e.target.value })}
          placeholder="Paste Pairing Token from JARVIS Android Companion"
          className="w-full rounded-xl border border-cyan-500/20 bg-slate-950 px-3 py-2 text-xs text-white"
        />
        <button
          type="button"
          onClick={onTestCompanion}
          className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-950/40 px-3.5 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-900/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Test Companion Connection
        </button>
        {companionStatus.error && <p className="text-[11px] text-amber-300">{companionStatus.error}</p>}
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h2 className="font-display text-sm tracking-wider text-white">APP, HUD &amp; HISTORY</h2>
        <div className="flex items-center justify-between text-xs">
          <span>HUD Animation Intensity</span>
          <select
            value={settings.hudIntensity}
            onChange={(e) => onUpdateSettings({ hudIntensity: e.target.value as JarvisSettings["hudIntensity"] })}
            className="rounded-lg border border-cyan-500/20 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          >
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="minimal">Minimal (Battery Saver)</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {canInstallPwa && (
            <button type="button" onClick={onInstallPwa} className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-slate-950">
              <Download className="h-4 w-4" /> Install JARVIS PWA
            </button>
          )}
          {isPwaInstalled && <span className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">Installed as Android PWA</span>}
          <button type="button" onClick={onClearHistory} className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2 text-xs text-rose-200">
            <Trash2 className="h-4 w-4" /> Clear Conversation History
          </button>
        </div>
      </div>
    </div>
  );
};
