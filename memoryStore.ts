import { AuditLogEntry, LocalReminder, PersonalMemory } from "../types/jarvis";
import { detectSensitiveSecret } from "./secretGuard";

const MEMORY_KEY = "jarvis_personal_memories_v1";
const REMINDERS_KEY = "jarvis_local_reminders_v1";
const AUDIT_KEY = "jarvis_privacy_audit_v1";

export function loadMemories(): PersonalMemory[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistMemories(list: PersonalMemory[]): void {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(list));
}

export function addMemory(
  content: string,
  category: PersonalMemory["category"] = "general"
): { ok: boolean; memory?: PersonalMemory; error?: string } {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Memory content cannot be empty." };

  const guard = detectSensitiveSecret(trimmed);
  if (guard.blocked) {
    return { ok: false, error: guard.reason };
  }

  const now = new Date().toISOString();
  const item: PersonalMemory = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: trimmed,
    category,
    createdAt: now,
    updatedAt: now,
  };
  const updated = [item, ...loadMemories()].slice(0, 100);
  persistMemories(updated);
  return { ok: true, memory: item };
}

export function updateMemory(
  id: string,
  content: string,
  category: PersonalMemory["category"]
): { ok: boolean; error?: string } {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Memory content cannot be empty." };

  const guard = detectSensitiveSecret(trimmed);
  if (guard.blocked) return { ok: false, error: guard.reason };

  const updated = loadMemories().map((m) =>
    m.id === id ? { ...m, content: trimmed, category, updatedAt: new Date().toISOString() } : m
  );
  persistMemories(updated);
  return { ok: true };
}

export function deleteMemory(id: string): PersonalMemory[] {
  const updated = loadMemories().filter((m) => m.id !== id);
  persistMemories(updated);
  return updated;
}

export function clearAllMemories(): void {
  persistMemories([]);
}

export function loadReminders(): LocalReminder[] {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReminder(title: string, timeIso?: string, notes?: string): LocalReminder {
  const item: LocalReminder = {
    id: `rem_${Date.now()}`,
    title: title.trim(),
    timeIso,
    notes,
    createdAt: new Date().toISOString(),
    completed: false,
  };
  const next = [item, ...loadReminders()].slice(0, 100);
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
  return item;
}

export function loadAuditLog(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function appendAuditLog(
  action: string,
  outcome: AuditLogEntry["outcome"],
  detail: string
): AuditLogEntry[] {
  const entry: AuditLogEntry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    outcome,
    detail,
  };
  const next = [entry, ...loadAuditLog()].slice(0, 80);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(next));
  return next;
}

export function clearAuditLog(): void {
  localStorage.setItem(AUDIT_KEY, JSON.stringify([]));
}
