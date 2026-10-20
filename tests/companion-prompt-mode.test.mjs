import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("all companions switch compact GPT guidance and restore ordinary contracts in both load orders", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-prompt-mode-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const script = `
    import assert from 'node:assert/strict';
    import { dirname, join } from 'node:path';
    import { fileURLToPath } from 'node:url';
    import { registerGptPromptModeBroker } from '@howaboua/pi-codex-conversion/prompt-mode';
    const sdk = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
    const { loadExtensions } = await import(join(sdk, 'core/extensions/loader.js'));
    const { createEventBus } = await import(join(sdk, 'core/event-bus.js'));
    const paths = ['codex-web-run', 'codex-imagegen', 'browser'].map(p => join(process.cwd(), 'extensions', p, 'index.ts'));
    for (const order of [paths, [...paths].reverse()]) {
      const events = createEventBus();
      let active = false;
      const broker = registerGptPromptModeBroker({events}, () => active);
      const loaded = await loadExtensions(order, process.env.PI_CODING_AGENT_DIR, events);
      assert.deepEqual(loaded.errors, []);
      const tools = () => new Map(loaded.extensions.flatMap(e => [...e.tools].map(([name, t]) => [name, t.definition])));
      const ordinary = tools();
      const before = new Map([...ordinary].map(([name, t]) => [name, {description: t.description, parameters: JSON.stringify(t.parameters)}]));
      const browserHelp = async () => (await tools().get('browser').execute('help', {command: 'help'}, undefined, undefined, {sessionManager: {getSessionId: () => 'fixture'}})).content;
      const normalHelp = await browserHelp();
      active = true;
      broker.prepare({}, {toolSnippets: {}, toolGuidelines: {}});
      for (const name of ['web_run', 'imagegen', 'browser']) {
        if (name !== 'browser') assert.notEqual(tools().get(name).description, before.get(name).description, name);
        assert.equal(JSON.stringify(tools().get(name).parameters), before.get(name).parameters, name + ' schema');
      }
      assert.notDeepEqual(await browserHelp(), normalHelp, 'browser uses compact on-demand help');
      active = false;
      broker.prepare({}, {toolSnippets: {}, toolGuidelines: {}});
      for (const name of ['web_run', 'imagegen', 'browser']) assert.equal(tools().get(name).description, before.get(name).description);
      assert.deepEqual(await browserHelp(), normalHelp);
      broker.dispose();
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: dir },
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});
