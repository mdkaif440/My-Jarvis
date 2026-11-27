import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Send, Settings, Brain, Shield, Cpu, RotateCcw,
  MessageSquare, Youtube, Phone, Bell, Battery, Download, WifiOff, VolumeX
} from "lucide-react";
import {
  AccessibleNotification, AssistantStatus, AuditLogEntry, BackendConfigStatus,
  ChatMessage, CompanionStatus, JarvisSettings, PendingConfirmation, PersonalMemory,
  TokenUsage, ValidatedToolCall
} from "./types/jarvis";
import { loadSettings, saveSettings } from "./settings/settingsStore";
import { loadAuditLog, loadMemories } from "./memory/memoryStore";
import { fetchBackendStatus, streamJarvisChat } from "./services/apiClient";
import { CompanionBridgeClient } from "./services/companionBridge";
import { JarvisVoiceRecognizer, parseWakePhrase } from "./voice/speechRecognition";
import { speakText, stopSpeaking } from "./voice/speechSynthesis";
import { LiveAudioWaveform } from "./voice/audioAnalyser";
import { executeValidatedTool } from "./automation/toolExecutor";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { JarvisCoreOrb } from "./components/JarvisCoreOrb";
import { VoiceWaveform } from "./components/VoiceWaveform";
import { ConfirmationModal } from "./components/ConfirmationModal";
import { MemoryPanel } from "./pages/MemoryPanel";
import { PrivacyDashboard } from "./pages/PrivacyDashboard";
import { SettingsPanel } from "./pages/SettingsPanel";

type Tab = "core" | "memory" | "privacy" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("core");
  const [settings, setSettings] = useState<JarvisSettings>(() => loadSettings());
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recognizedCommand, setRecognizedCommand] = useState("");
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array(24).fill(0.12));
  const [online, setOnline] = useState(navigator.onLine);

  const [backendStatus, setBackendStatus] = useState<BackendConfigStatus | null>(null);
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus>({
    connected: false,
    notificationAccessEnabled: false,
    foregroundVoiceActive: false,
    accessibilityHelperEnabled: false,
  });
  const [memories, setMemories] = useState<PersonalMemory[]>(() => loadMemories());
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => loadAuditLog());
  const [recentNotifications, setRecentNotifications] = useState<AccessibleNotification[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const recognizerRef = useRef<JarvisVoiceRecognizer | null>(null);
  const audioRef = useRef<LiveAudioWaveform | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  const updateSettings = useCallback((patch: Partial<JarvisSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const refreshCompanion = useCallback(async (cfg: JarvisSettings) => {
    const client = new CompanionBridgeClient(cfg.companionUrl, cfg.companionToken);
    const st = await client.checkStatus();
    setCompanionStatus(st);
  }, []);

  useEffect(() => {
    fetchBackendStatus().then(setBackendStatus).catch(() => {});
    refreshCompanion(settings);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const stopAudioLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.stop();
    setWaveformBars(Array(24).fill(0.12));
  }, []);

  const startAudioLoop = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new LiveAudioWaveform();
    const ok = await audioRef.current.start();
    const tick = () => {
      if (ok && audioRef.current) {
        setWaveformBars(audioRef.current.sampleBars(24));
      } else {
        setWaveformBars(Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.55));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const requestConfirmation = useCallback(
    (prompt: Omit<PendingConfirmation, "id" | "resolve">) =>
      new Promise<boolean>((resolve) => {
        setStatus("awaiting_confirmation");
        setPendingConfirmation({
          ...prompt,
          id: `conf_${Date.now()}`,
          resolve: (approved) => {
            setPendingConfirmation(null);
            resolve(approved);
          },
        });
      }),
    []
  );

  const speakResponse = useCallback(
    (text: string) => {
      if (!settings.autoSpeakResponses || !text.trim()) {
        setStatus("idle");
        return;
      }
      speakText(text, {
        voiceURI: settings.voiceURI,
        rate: settings.speakingRate,
        language: settings.language,
        onStart: () => setStatus("speaking"),
        onEnd: () => setStatus("idle"),
        onError: () => setStatus("idle"),
      });
    },
    [settings.autoSpeakResponses, settings.voiceURI, settings.speakingRate, settings.language]
  );

  const runDeepSeekTurn = useCallback(
    async (conversationHistory: ChatMessage[], allowTools = true): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("thinking");
      setStreamingText("");
      setErrorBanner(null);

      let accumulatedText = "";
      let receivedTools: ValidatedToolCall[] = [];
      let turnUsage: TokenUsage | null = null;
      let resolvedModel = settings.model;
      let streamFailed = false;

      const apiMessages = conversationHistory.slice(-18).map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      }));

      await streamJarvisChat(
        {
          model: settings.model,
          messages: apiMessages,
          memories: settings.memoryEnabled
            ? memories.map(({ category, content }) => ({ category, content }))
            : [],
          contextMeta: {
            currentTime: new Date().toLocaleString(),
            language: settings.language,
            companionConnected: companionStatus.connected,
            notificationAccessEnabled: companionStatus.notificationAccessEnabled,
          },
          enableTools: allowTools,
        },
        {
          onToken: (tok) => {
            accumulatedText += tok;
            setStreamingText(accumulatedText);
          },
          onToolCalls: (tcs) => {
            receivedTools = tcs;
          },
          onUsage: (usage, model) => {
            turnUsage = usage;
            resolvedModel = model;
            setLastUsage(usage);
          },
          onError: (_code, msg) => {
            streamFailed = true;
            setErrorBanner(msg);
            setStatus("error");
            const errMsg: ChatMessage = {
              id: `err_${Date.now()}`,
              role: "assistant",
              content: msg,
              timestamp: new Date().toISOString(),
              isError: true,
            };
            setMessages((prev) => [...prev, errMsg]);
            speakResponse(msg);
          },
          onDone: (model) => {
            resolvedModel = model;
          },
        },
        controller.signal
      );

      if (streamFailed) return;

      if (receivedTools.length > 0) {
        setStatus("executing");
        const assistantToolRequestMsg: ChatMessage = {
          id: `ast_tc_${Date.now()}`,
          role: "assistant",
          content: accumulatedText || "",
          timestamp: new Date().toISOString(),
          tool_calls: receivedTools.map((tc) => ({
            id: tc.id,
            type: "function",
            function: tc.function,
          })),
          model: resolvedModel,
          usage: turnUsage,
        };

        const toolResultMessages: ChatMessage[] = [];
        for (const tc of receivedTools) {
          const report = await executeValidatedTool(tc, {
            settings,
            companionStatus,
            requestConfirmation,
            onMemoriesChanged: () => setMemories(loadMemories()),
            onRemindersChanged: () => {},
            onNotificationsLoaded: (items) => setRecentNotifications(items),
          });
          setAuditLog(loadAuditLog());
          toolResultMessages.push({
            id: `tool_${Date.now()}_${tc.id}`,
            role: "tool",
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify(report),
            timestamp: new Date().toISOString(),
            toolReports: [report],
          });
        }

        const nextHistory = [...conversationHistory, assistantToolRequestMsg, ...toolResultMessages];
        setMessages(nextHistory);
        setStreamingText("");
        await runDeepSeekTurn(nextHistory, false);
        return;
      }

      const finalAssistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: "assistant",
        content: accumulatedText.trim() || "Command processed.",
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        usage: turnUsage,
      };
      setMessages((prev) => [...prev, finalAssistantMsg]);
      setStreamingText("");
      setLastFailedPrompt(null);
      speakResponse(finalAssistantMsg.content);
    },
    [settings, memories, companionStatus, requestConfirmation, speakResponse]
  );

  const submitCommand = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      stopSpeaking();
      setRecognizedCommand(text);
      setLastFailedPrompt(text);

      const userMsg: ChatMessage = {
        id: `usr_${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      await runDeepSeekTurn(nextHistory, true);
    },
    [runDeepSeekTurn]
  );

  const toggleListening = useCallback(() => {
    stopSpeaking();
    if (!recognizerRef.current) recognizerRef.current = new JarvisVoiceRecognizer();

    if (recognizerRef.current.isActive()) {
      recognizerRef.current.stop();
      stopAudioLoop();
      setStatus("idle");
      setLiveTranscript("");
      return;
    }

    setErrorBanner(null);
    const started = recognizerRef.current.start(settings.language, settings.continuousListening, {
      onStart: () => {
        setStatus("listening");
        startAudioLoop();
      },
      onInterim: (interim) => setLiveTranscript(interim),
      onFinal: (finalText) => {
        setLiveTranscript(finalText);
        const parsed = parseWakePhrase(finalText, settings.wakePhrase);

        if (settings.continuousListening && settings.requireWakePhrase && !parsed.matchedWakePhrase) {
          return;
        }
        if (parsed.matchedWakePhrase && parsed.wakeOnly) {
          const greeting = "Yes sir, how can I help you?";
          setRecognizedCommand(finalText);
          setMessages((prev) => [
            ...prev,
            { id: `u_${Date.now()}`, role: "user", content: finalText, timestamp: new Date().toISOString() },
            { id: `a_${Date.now() + 1}`, role: "assistant", content: greeting, timestamp: new Date().toISOString() },
          ]);
          speakResponse(greeting);
          return;
        }
        const cmd = parsed.matchedWakePhrase ? parsed.command : finalText;
        if (!settings.continuousListening) {
          recognizerRef.current?.stop();
          stopAudioLoop();
        }
        submitCommand(cmd);
      },
      onEnd: () => {
        if (!settings.continuousListening) {
          stopAudioLoop();
          setStatus((s) => (s === "listening" ? "idle" : s));
        }
      },
      onError: (_code, msg) => {
        stopAudioLoop();
        setErrorBanner(msg);
        setStatus("error");
      },
    });

    if (!started) stopAudioLoop();
  }, [settings, startAudioLoop, stopAudioLoop, speakResponse, submitCommand]);

  const quickActions = [
    { icon: MessageSquare, label: "Open WhatsApp", cmd: "Open WhatsApp" },
    { icon: Bell, label: "Unread WhatsApp", cmd: "Read my unread WhatsApp messages" },
    { icon: Cpu, label: "Summarize", cmd: "Summarize all my unread WhatsApp messages" },
    { icon: Youtube, label: "YouTube", cmd: "Open YouTube" },
    { icon: Phone, label: "Dialer", cmd: "Open Phone" },
    { icon: Battery, label: "Battery", cmd: "Check my battery status" },
  ];

  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);

  return (
    <div className="hud-grid flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cyan-500/15 bg-[#020617]/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#00E5FF]" />
          <div>
            <h1 className="font-display text-sm font-bold tracking-[0.22em] text-white">JARVIS</h1>
            <p className="text-[10px] uppercase tracking-widest text-cyan-300/80">
              {status.replace("_", " ")} • {companionStatus.connected ? "Native Linked" : "PWA Mode"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!online && (
            <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-1 text-[10px] text-rose-300">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
          {canInstall && (
            <button
              type="button"
              onClick={promptInstall}
              className="flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-medium text-cyan-200"
            >
              <Download className="h-3 w-3" /> Install
            </button>
          )}
          {status === "speaking" && (
            <button
              type="button"
              onClick={() => { stopSpeaking(); setStatus("idle"); }}
              className="rounded-full border border-slate-700 bg-slate-900 p-1.5 text-slate-300"
              aria-label="Stop speaking"
            >
              <VolumeX className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4 pb-24">
        {errorBanner && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-100">
            <span>{errorBanner}</span>
            {lastFailedPrompt && (
              <button
                type="button"
                onClick={() => submitCommand(lastFailedPrompt)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-500/30 px-2.5 py-1 font-medium text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </button>
            )}
          </div>
        )}

        {tab === "core" && (
          <>
            <section className="glass-card rounded-3xl px-4 py-6 text-center">
              <JarvisCoreOrb status={status} intensity={settings.hudIntensity} onClick={toggleListening} />
              <div className="mt-3">
                <VoiceWaveform bars={waveformBars} status={status} />
              </div>

              <div className="mt-2 min-h-[2.2rem] px-2">
                {liveTranscript ? (
                  <p className="text-sm text-cyan-200">“{liveTranscript}”</p>
                ) : recognizedCommand ? (
                  <p className="text-xs text-slate-400">Recognized command: <span className="text-cyan-300">{recognizedCommand}</span></p>
                ) : (
                  <p className="text-xs text-slate-400">Tap the orb or microphone and speak in English, Hindi, or Hinglish</p>
                )}
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all ${
                    status === "listening"
                      ? "border-cyan-200 bg-cyan-400 text-slate-950 glow-cyan scale-105"
                      : "border-cyan-400/60 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                  }`}
                  aria-label={status === "listening" ? "Stop listening" : "Start listening"}
                >
                  {status === "listening" ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                </button>
              </div>
            </section>

            {(streamingText || latestAssistant) && (
              <section className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-cyan-400">
                  <span>JARVIS Response</span>
                  {lastUsage?.total_tokens && (
                    <span className="font-mono text-slate-400">{lastUsage.total_tokens} tokens</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {streamingText || latestAssistant?.content}
                </p>
              </section>
            )}

            <section className="grid grid-cols-3 gap-2">
              {quickActions.map(({ icon: Icon, label, cmd }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => submitCommand(cmd)}
                  className="glass-card flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200"
                >
                  <Icon className="h-4 w-4 text-cyan-400" />
                  <span>{label}</span>
                </button>
              ))}
            </section>

            {recentNotifications.length > 0 && (
              <section className="glass-card rounded-2xl p-4">
                <h3 className="font-display text-xs tracking-wider text-cyan-300">
                  ACCESSIBLE NOTIFICATIONS ({recentNotifications.length})
                </h3>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {recentNotifications.map((n) => (
                    <div key={n.id} className="rounded-xl bg-slate-950/70 p-2.5 text-xs">
                      <span className="font-semibold text-cyan-200">{n.sender}</span>
                      <p className="mt-0.5 text-slate-200">{n.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!textInput.trim()) return;
                submitCommand(textInput);
                setTextInput("");
              }}
              className="glass-card flex items-center gap-2 rounded-2xl p-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a command for JARVIS (English / Hindi / Hinglish)..."
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-cyan-400 p-2.5 text-slate-950 hover:bg-cyan-300"
                aria-label="Send command"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <section className="glass-card rounded-2xl p-4">
              <h3 className="font-display text-xs tracking-wider text-slate-300">CONVERSATION LOG</h3>
              <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto">
                {messages.filter((m) => m.role !== "tool").length === 0 ? (
                  <p className="text-xs text-slate-500">Say “Hey Jarvis” or tap a quick action to begin.</p>
                ) : (
                  messages
                    .filter((m) => m.role !== "tool" && m.content)
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-xl p-3 text-xs ${
                          m.role === "user"
                            ? "ml-6 border border-cyan-500/20 bg-cyan-950/35 text-cyan-100"
                            : "mr-6 border border-slate-700/50 bg-slate-950/75 text-slate-200"
                        }`}
                      >
                        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-400">
                          <span>{m.role === "user" ? "You" : "JARVIS"}</span>
                          <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    ))
                )}
              </div>
            </section>
          </>
        )}

        {tab === "memory" && (
          <MemoryPanel
            memories={memories}
            memoryEnabled={settings.memoryEnabled}
            onToggleMemory={(enabled) => updateSettings({ memoryEnabled: enabled })}
            onRefresh={() => setMemories(loadMemories())}
          />
        )}

        {tab === "privacy" && (
          <PrivacyDashboard
            companionStatus={companionStatus}
            memoryEnabled={settings.memoryEnabled}
            auditLog={auditLog}
            onRefreshAudit={() => setAuditLog(loadAuditLog())}
          />
        )}

        {tab === "settings" && (
          <SettingsPanel
            settings={settings}
            backendStatus={backendStatus}
            companionStatus={companionStatus}
            canInstallPwa={canInstall}
            isPwaInstalled={isInstalled}
            onInstallPwa={promptInstall}
            onUpdateSettings={updateSettings}
            onTestCompanion={() => refreshCompanion(settings)}
            onClearHistory={() => { setMessages([]); setStreamingText(""); setRecognizedCommand(""); }}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-cyan-500/20 bg-[#020617]/95 backdrop-blur-lg">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {[
            { id: "core" as Tab, label: "Core", icon: Cpu },
            { id: "memory" as Tab, label: "Memory", icon: Brain },
            { id: "privacy" as Tab, label: "Privacy", icon: Shield },
            { id: "settings" as Tab, label: "Settings", icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
                tab === id ? "text-cyan-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <ConfirmationModal confirmation={pendingConfirmation} />
    </div>
  );
}
