import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("patched fast toggle persists, respects scope and applies through conversion's lifecycle", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-fast-toggle-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const script = `
    import assert from 'node:assert/strict';
    import { EventEmitter } from 'node:events';
    import { mkdir, writeFile } from 'node:fs/promises';
    import { dirname } from 'node:path';
    import { registerCodexCommand } from '@howaboua/pi-codex-conversion/dist/ui/settings/command.js';
    import { readCodexConversionConfig, readEffectiveCodexConversionConfig, getProjectCodexConversionConfigPath, writeCodexConversionConfig } from '@howaboua/pi-codex-conversion/dist/adapter/activation/config-store.js';
    import { ALL_CODEX_ADAPTER_TOOL_NAMES } from '@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js';
    const bus = new EventEmitter();
    const commands = new Map();
    const notices = [];
    const applied = [];
    let active = ['read', 'edit', 'write', 'bash'];
    const pi = { on() {}, registerShortcut() {}, registerCommand: (name, command) => commands.set(name, command),
      getAllTools: () => [...ALL_CODEX_ADAPTER_TOOL_NAMES, 'read', 'edit', 'write', 'bash'].map(name => ({name})),
      getActiveTools: () => active, setActiveTools: names => { active = names; },
      events: {emit: (...args) => bus.emit(...args)} };
    const state = {config: readCodexConversionConfig()};
    state.config.openai.fast = false;
    assert.ok(writeCodexConversionConfig(state.config).ok);
    const ctx = {cwd: process.env.PI_CODING_AGENT_DIR, hasUI: false,
      model: {provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-6-luna'},
      isProjectTrusted: () => true, isIdle: () => true,
      ui: {notify: (message, level) => notices.push({message, level}), custom: () => assert.fail('must not open settings')} };
    const voice = {onDictationStateChange: () => () => {}};
    registerCodexCommand(pi, state, voice, {}, (config, _ctx, previous) => applied.push({fast: config.openai.fast, previous: previous.openai.fast}));
    const toggle = () => commands.get('codex').handler('fast', ctx);
    await toggle();
    assert.equal(state.config.openai.fast, true);
    assert.equal(readCodexConversionConfig().openai.fast, true);
    await toggle();
    assert.equal(state.config.openai.fast, false);
    assert.deepEqual(applied.map(c => c.fast), [true, false]);
    // A trusted folder override stays in the folder; the global preference is untouched.
    const project = getProjectCodexConversionConfigPath(ctx.cwd);
    await mkdir(dirname(project), {recursive: true});
    await writeFile(project, JSON.stringify({openai: {fast: false}}));
    await toggle();
    assert.equal(state.config.openai.fast, true);
    assert.equal(readCodexConversionConfig().openai.fast, false);
    // Environment pinning must not claim a successful toggle or write ignored settings.
    process.env.PI_CODEX_FAST = '1';
    const count = applied.length;
    await toggle();
    assert.equal(applied.length, count);
    assert.match(notices.at(-1).message, /pinned by PI_CODEX_FAST/);
    delete process.env.PI_CODEX_FAST;
    // Busy runs save immediately and only change transport/runtime when idle.
    let idle = false;
    let settle;
    const ready = new Promise(resolve => { settle = resolve; });
    ctx.isIdle = () => idle;
    ctx.waitForIdle = () => ready;
    await toggle();
    assert.equal(state.config.openai.fast, true);
    assert.equal(readEffectiveCodexConversionConfig({cwd: ctx.cwd, projectTrusted: true}).openai.fast, false);
    await toggle(); // Toggle the saved state, not the still-active state.
    assert.equal(readEffectiveCodexConversionConfig({cwd: ctx.cwd, projectTrusted: true}).openai.fast, true);
    assert.equal(applied.length, count);
    idle = true;
    settle();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(applied.length, count + 1);
    assert.equal(state.config.openai.fast, true);
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: cwd, PI_CODEX_FAST: "" },
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});
