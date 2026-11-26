import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("all companions keep compact guidance and stable schemas without the retired prompt-mode broker in both load orders", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-prompt-mode-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const script = `
    import assert from 'node:assert/strict';
    import { dirname, join } from 'node:path';
    import { fileURLToPath } from 'node:url';
    import { getCodeModeExtensionToolSnapshot } from '@howaboua/pi-codex-conversion/dist/code-mode-extension-tools.js';
    const sdk = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
    const { loadExtensions } = await import(join(sdk, 'core/extensions/loader.js'));
    const { createEventBus } = await import(join(sdk, 'core/event-bus.js'));
    const paths = ['codex-web-run', 'codex-imagegen', 'browser'].map(p => join(process.cwd(), 'extensions', p, 'index.ts'));
    let baseline;
    for (const order of [paths, [...paths].reverse()]) {
      const events = createEventBus();
      const loaded = await loadExtensions(order, process.env.PI_CODING_AGENT_DIR, events);
      assert.deepEqual(loaded.errors, []);
      const tools = () => new Map(loaded.extensions.flatMap(e => [...e.tools].map(([name, t]) => [name, t.definition])));
      const browserHelp = async () => (await tools().get('browser').execute('help', {command: 'help'}, undefined, undefined, {sessionManager: {getSessionId: () => 'fixture'}})).content;
      const normalHelp = await browserHelp();
      const usages = () => new Map(getCodeModeExtensionToolSnapshot({events, getAllTools: () => [...tools().values()]}, undefined).tools.map(t => [t.name, t.usage]));
      const normalUsages = usages();
      assert.match(tools().get('web_run').promptGuidelines.join(' '), /cite only Markdown links/);
      assert.match(normalUsages.get('image_gen__imagegen'), /MUST NOT print/);
      assert.ok(normalUsages.get('web__run'));
      const snapshot = [...tools()].map(([name, t]) => ({name, description: t.description, parameters: t.parameters})).sort((a, b) => a.name.localeCompare(b.name));
      const current = { snapshot, help: normalHelp, usages: [...normalUsages].sort() };
      if (baseline) assert.deepEqual(current, baseline);
      baseline = current;
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: dir },
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});
