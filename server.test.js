import test from "node:test";
import assert from "node:assert/strict";
import { validateToolCall } from "../src/tools/registry.js";
import { createApp } from "../src/server.js";

test("allowlisted harmless tool passes validation", () => {
  const res = validateToolCall("open_app", { app_name: "WhatsApp" });
  assert.equal(res.valid, true);
  assert.equal(res.arguments.app_name, "whatsapp");
  assert.equal(res.requiresConfirmation, false);
});

test("arbitrary shell command tool is blocked", () => {
  const res = validateToolCall("run_shell", { cmd: "ls" });
  assert.equal(res.valid, false);
});

test("javascript: URI injection is rejected", () => {
  const res = validateToolCall("open_website", { url: "javascript:alert(1)" });
  assert.equal(res.valid, false);
});

test("sensitive tools enforce confirmation flag", () => {
  const res = validateToolCall("send_whatsapp_message", { recipient: "Rahul", message: "I will call you tomorrow." });
  assert.equal(res.valid, true);
  assert.equal(res.requiresConfirmation, true);
});

test("/api/config/status never exposes OPENROUTER_API_KEY", async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/config/status`);
    const text = await res.text();
    const json = JSON.parse(text);
    assert.equal(res.status, 200);
    assert.equal(typeof json.openRouterConfigured, "boolean");
    assert.equal("openRouterApiKey" in json, false);
  } finally {
    server.close();
  }
});
