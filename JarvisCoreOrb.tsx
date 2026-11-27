import React from "react";
import { AssistantStatus } from "../types/jarvis";

interface Props {
  status: AssistantStatus;
  intensity: "standard" | "high" | "minimal";
  onClick: () => void;
}

const STATUS_META: Record<AssistantStatus, { label: string; ring: string; glow: string }> = {
  idle: { label: "STANDBY", ring: "border-cyan-400/50", glow: "shadow-[0_0_40px_rgba(0,229,255,0.25)]" },
  listening: { label: "LISTENING", ring: "border-cyan-300", glow: "shadow-[0_0_70px_rgba(0,229,255,0.65)]" },
  thinking: { label: "THINKING", ring: "border-sky-400", glow: "shadow-[0_0_60px_rgba(56,189,248,0.55)]" },
  speaking: { label: "SPEAKING", ring: "border-teal-300", glow: "shadow-[0_0_65px_rgba(45,212,191,0.55)]" },
  executing: { label: "EXECUTING", ring: "border-amber-300", glow: "shadow-[0_0_55px_rgba(251,191,36,0.45)]" },
  awaiting_confirmation: { label: "CONFIRM", ring: "border-amber-400", glow: "shadow-[0_0_55px_rgba(245,158,11,0.5)]" },
  error: { label: "ALERT", ring: "border-rose-400", glow: "shadow-[0_0_50px_rgba(244,63,94,0.5)]" },
};

export const JarvisCoreOrb: React.FC<Props> = ({ status, intensity, onClick }) => {
  const meta = STATUS_META[status];
  const active = status === "listening" || status === "speaking" || status === "thinking";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle JARVIS voice core"
      className="relative mx-auto flex h-52 w-52 items-center justify-center rounded-full focus:outline-none sm:h-60 sm:w-60"
    >
      <span
        className={`absolute inset-0 rounded-full border-2 border-dashed ${meta.ring} ${
          intensity === "minimal" ? "" : "animate-spin-slow"
        }`}
      />
      <span
        className={`absolute inset-4 rounded-full border border-cyan-400/40 ${
          active ? "animate-spin-reverse border-cyan-300" : ""
        }`}
        style={{ borderTopColor: "#00E5FF", borderRightColor: "transparent" }}
      />
      <span
        className={`relative flex h-32 w-32 flex-col items-center justify-center rounded-full border-2 bg-[#040c1d]/95 transition-all duration-300 ${meta.ring} ${meta.glow} ${
          active ? "scale-105" : "scale-100"
        }`}
      >
        <span
          className={`h-12 w-12 rounded-full bg-gradient-to-tr from-sky-500 via-cyan-300 to-white transition-transform duration-300 ${
            active ? "animate-pulse scale-110" : "opacity-85"
          }`}
        />
        <span className="mt-2 font-display text-[10px] tracking-[0.26em] text-cyan-200">
          {meta.label}
        </span>
      </span>
    </button>
  );
};
