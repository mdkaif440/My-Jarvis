import React from "react";
import { AssistantStatus } from "../types/jarvis";

interface Props {
  bars: number[];
  status: AssistantStatus;
}

export const VoiceWaveform: React.FC<Props> = ({ bars, status }) => {
  const active = status === "listening" || status === "speaking";
  return (
    <div className="flex h-12 items-center justify-center gap-1 px-4" aria-hidden="true">
      {bars.map((level, idx) => {
        const heightPct = active ? Math.max(14, Math.round(level * 100)) : 12;
        return (
          <span
            key={idx}
            className={`w-1 rounded-full transition-all duration-75 ${
              status === "speaking"
                ? "bg-teal-300"
                : status === "listening"
                  ? "bg-cyan-400"
                  : "bg-cyan-900/70"
            }`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
};
