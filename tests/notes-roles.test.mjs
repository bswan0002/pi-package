import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Notes roles respect inactive defaults and reject stale handoffs", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-roles-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const { createJiti } = require("jiti");
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const { createModelRoles } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/model-roles.ts");
  const { readSettings } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/settings.ts");
  await mkdir(join(dir, "notes-compaction"));
  await writeFile(join(dir, "notes-compaction/model-roles.json"), JSON.stringify({ enabled: false, roles: [
    { id: "review", description: "Review work", provider: "fixture", model: "reviewer", reasoning: "high" },
  ] }));
  const handlers = new Map(), changes = [];
  let thinking = "low";
  const target = { provider: "fixture", id: "reviewer" };
  const pi = { on: (name, fn) => handlers.set(name, fn), getThinkingLevel: () => thinking,
    setThinkingLevel: value => { thinking = value; }, setModel: async model => { changes.push(model); return true; } };
  const activation = { settings: readSettings(join(dir, "fresh.json")), refreshActivation() {} };
  const lifecycle = { active: false };
  const roles = createModelRoles(pi, activation, lifecycle);
  const ctx = { model: { provider: "fixture", id: "original" },
    modelRegistry: { find: () => target, getApiKeyAndHeaders: async () => ({ ok: true }) },
    sessionManager: { getSessionId: () => "session" } };
  assert.equal(handlers.get("before_agent_start")({}, ctx), undefined);
  await assert.rejects(roles.prepare("review", ctx), /Notes must be active/);
  lifecycle.active = true;
  await assert.rejects(roles.prepare("review", ctx), /Notes must be active/, "empty whitelist still blocks roles");
  activation.settings = { ...activation.settings, active: "all" };
  const handoff = await roles.prepare("review", ctx);
  await assert.rejects(handoff.activate({ ...ctx, sessionManager: { getSessionId: () => "other" } }), /session or model settings changed/);
  assert.deepEqual(changes, []);
  await handoff.activate(ctx);
  assert.deepEqual(changes, [target]);
  assert.equal(thinking, "high");
});
