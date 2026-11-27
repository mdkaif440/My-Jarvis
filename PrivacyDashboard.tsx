import React, { useEffect, useState } from "react";
import { ShieldCheck, Mic, Bell, Smartphone, Trash2, Lock } from "lucide-react";
import { AuditLogEntry, CompanionStatus } from "../types/jarvis";
import { clearAuditLog } from "../memory/memoryStore";

interface Props {
  companionStatus: CompanionStatus;
  memoryEnabled: boolean;
  auditLog: AuditLogEntry[];
  onRefreshAudit: () => void;
}

export const PrivacyDashboard: React.FC<Props> = ({
  companionStatus,
  memoryEnabled,
  auditLog,
  onRefreshAudit,
}) => {
  const [micPermission, setMicPermission] = useState<string>("checking...");

  useEffect(() => {
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((res) => setMicPermission(res.state))
        .catch(() => setMicPermission("prompt / browser-managed"));
    } else {
      setMicPermission("browser-managed");
    }
  }, []);

  const rows = [
    { icon: Mic, label: "Microphone Access (Browser)", value: micPermission, ok: micPermission === "granted" },
    { icon: Smartphone, label: "Native Android Companion Bridge", value: companionStatus.connected ? "Connected (127.0.0.1)" : "Disconnected", ok: companionStatus.connected },
    { icon: Bell, label: "Android Notification Listener", value: companionStatus.notificationAccessEnabled ? "Authorized" : "Disabled / Unavailable", ok: companionStatus.notificationAccessEnabled },
    { icon: Lock, label: "OpenRouter Secret Key", value: "Server-side only (never in browser)", ok: true },
    { icon: ShieldCheck, label: "Personal Memory Storage", value: memoryEnabled ? "Local device storage only" : "Disabled", ok: true },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <h2 className="font-display text-sm tracking-wider text-white">PRIVACY &amp; PERMISSIONS DASHBOARD</h2>
        <p className="mt-1 text-xs text-slate-400">
          No hidden recording, no silent WhatsApp sending, and no unrestricted device access.
        </p>

        <div className="mt-4 space-y-2.5">
          {rows.map(({ icon: Icon, label, value, ok }) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3.5 py-2.5 text-xs">
              <span className="flex items-center gap-2 text-slate-200">
                <Icon className="h-4 w-4 text-cyan-400" /> {label}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 font-medium ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs tracking-wider text-cyan-300">TOOL &amp; PERMISSION AUDIT LOG</h3>
          <button
            type="button"
            onClick={() => { clearAuditLog(); onRefreshAudit(); }}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {auditLog.length === 0 ? (
            <p className="text-xs text-slate-400">No actions logged yet.</p>
          ) : (
            auditLog.map((e) => (
              <div key={e.id} className="rounded-xl bg-slate-950/65 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-cyan-300">{e.action}</span>
                  <span className="text-[10px] uppercase text-slate-400">{e.outcome}</span>
                </div>
                <p className="mt-1 text-slate-300">{e.detail}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
