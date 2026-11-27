import React, { useState } from "react";
import { Brain, Plus, Trash2, Edit3, Check, X, ShieldAlert } from "lucide-react";
import { PersonalMemory } from "../types/jarvis";
import { addMemory, deleteMemory, updateMemory } from "../memory/memoryStore";

interface Props {
  memories: PersonalMemory[];
  memoryEnabled: boolean;
  onToggleMemory: (enabled: boolean) => void;
  onRefresh: () => void;
}

export const MemoryPanel: React.FC<Props> = ({ memories, memoryEnabled, onToggleMemory, onRefresh }) => {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<PersonalMemory["category"]>("preference");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = addMemory(content, category);
    if (!res.ok) {
      setError(res.error || "Could not save memory.");
      return;
    }
    setContent("");
    onRefresh();
  };

  const handleSaveEdit = (m: PersonalMemory) => {
    setError("");
    const res = updateMemory(m.id, editText, m.category);
    if (!res.ok) {
      setError(res.error || "Update blocked.");
      return;
    }
    setEditingId(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="font-display text-sm tracking-wider text-white">PERSONAL MEMORY</h2>
              <p className="text-xs text-slate-400">Stored locally on this device only. Passwords &amp; API keys are automatically blocked.</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-cyan-300">
            <input
              type="checkbox"
              checked={memoryEnabled}
              onChange={(e) => onToggleMemory(e.target.checked)}
              className="h-4 w-4 accent-cyan-400"
            />
            {memoryEnabled ? "Enabled" : "Disabled"}
          </label>
        </div>

        <form onSubmit={handleAdd} className="mt-4 space-y-2">
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PersonalMemory["category"])}
              className="rounded-xl border border-cyan-500/20 bg-slate-950/90 px-3 py-2 text-xs text-slate-200"
            >
              <option value="preference">Preference</option>
              <option value="routine">Daily Routine</option>
              <option value="task">Important Task</option>
              <option value="contact_note">Contact Note</option>
              <option value="general">General</option>
            </select>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder='e.g. "My favourite language is Python"'
              className="flex-1 rounded-xl border border-cyan-500/20 bg-slate-950/90 px-3 py-2 text-sm text-white placeholder-slate-500"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
            >
              <Plus className="h-4 w-4" /> Save
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-200">
              <ShieldAlert className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </form>
      </div>

      <div className="space-y-2">
        {memories.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center text-sm text-slate-400">
            No personal memories saved yet. Tell JARVIS “Remember that my favourite language is Python” or add one above.
          </div>
        ) : (
          memories.map((m) => (
            <div key={m.id} className="glass-card flex items-start justify-between gap-3 rounded-xl p-3.5">
              <div className="flex-1">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-300">
                  {m.category}
                </span>
                {editingId === m.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 rounded-lg border border-cyan-400/40 bg-slate-950 px-2.5 py-1.5 text-sm text-white"
                    />
                    <button onClick={() => handleSaveEdit(m)} className="rounded-lg bg-cyan-400 p-1.5 text-slate-950" aria-label="Save edit">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg bg-slate-800 p-1.5 text-slate-300" aria-label="Cancel edit">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-100">{m.content}</p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setEditingId(m.id); setEditText(m.content); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
                  aria-label="Edit memory"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { deleteMemory(m.id); onRefresh(); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
                  aria-label="Delete memory"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
