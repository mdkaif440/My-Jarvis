import React from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import { PendingConfirmation } from "../types/jarvis";

interface Props {
  confirmation: PendingConfirmation | null;
}

export const ConfirmationModal: React.FC<Props> = ({ confirmation }) => {
  if (!confirmation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass-card w-full max-w-md rounded-2xl border-amber-400/40 p-5 text-slate-100">
        <div className="flex items-center gap-3 text-amber-300">
          <ShieldAlert className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-display text-xs tracking-widest uppercase">Action Confirmation Required</p>
            <h2 className="text-base font-semibold text-white">{confirmation.title}</h2>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-300">{confirmation.description}</p>

        {confirmation.recipient && (
          <div className="mt-3 rounded-xl bg-slate-950/70 p-3 text-xs">
            <span className="text-cyan-400 uppercase tracking-wider">Recipient</span>
            <p className="mt-1 text-sm font-medium text-white">{confirmation.recipient}</p>
          </div>
        )}

        {confirmation.messagePreview && (
          <div className="mt-2 rounded-xl bg-slate-950/70 p-3 text-xs">
            <span className="text-cyan-400 uppercase tracking-wider">Exact Message</span>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">{confirmation.messagePreview}</p>
          </div>
        )}

        <p className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/30 p-2.5 text-xs text-cyan-200">
          {confirmation.channelNote}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => confirmation.resolve(false)}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => confirmation.resolve(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            <Check className="h-4 w-4" /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
