import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Pi's real loader registers bundled conversion once and preserves edit/write in both load orders", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-bundled-load-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const script = `
    import assert from 'node:assert/strict';
    import { dirname, join } from 'node:path';
    import { fileURLToPath } from 'node:url';
    import { readFile } from 'node:fs/promises';
    const sdk = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
    const { loadExtensions } = await import(join(sdk, 'core/extensions/loader.js'));
    const paths = ['extensions/codex-conversion/index.ts', 'extensions/diff/index.ts'].map(p => join(process.cwd(), p));
    for (const order of [paths, [...paths].reverse(), [paths[1]]]) {
      const loaded = await loadExtensions(order, process.env.PI_CODING_AGENT_DIR);
      assert.deepEqual(loaded.errors, []);
      assert.equal(loaded.extensions.filter(e => e.tools.has('apply_patch')).length, order.length === 2 ? 1 : 0);
      const diff = loaded.extensions.find(e => e.entryRenderers?.has('pi-package:apply-patch-diff'));
      assert.deepEqual([...diff.tools.keys()].sort(), ['edit', 'write']);
      const path = join(process.env.PI_CODING_AGENT_DIR, 'ordinary.ts');
      await diff.tools.get('write').definition.execute('write', {path, content: 'const n = 1;\\n'}, undefined, undefined, {});
      await diff.tools.get('edit').definition.execute('edit', {path, edits: [{oldText: 'const n = 1;', newText: 'const n = 2;'}]}, undefined, undefined, {});
      assert.equal(await readFile(path, 'utf8'), 'const n = 2;\\n');
      const conversion = loaded.extensions.find(e => e.tools.has('apply_patch'));
      if (conversion) {
        const entries = [];
        loaded.runtime.appendEntry = (customType, data) => entries.push({customType, data});
        const input = '*** Begin Patch\\n*** Delete File: ' + path + '\\n*** End Patch';
        const result = await conversion.tools.get('apply_patch').definition.execute('delete', {input}, undefined, undefined, {cwd: process.env.PI_CODING_AGENT_DIR});
        for (const handler of conversion.handlers.get('tool_result')) {
          await handler({toolName: 'apply_patch', toolCallId: 'delete', input: {input}, ...result, isError: false});
        }
        for (const handler of conversion.handlers.get('turn_end')) {
          await handler({message: {role: 'assistant', stopReason: 'error'}}, {sessionManager: {getSessionId: () => 'test'}});
        }
        assert.equal(entries.length, 1);
        assert.equal(entries[0].data.files[0].before, 'const n = 2;\\n');
        const component = diff.entryRenderers.get(entries[0].customType)(entries[0], {expanded: true}, {fg: (_role, s) => s, bold: s => s});
        assert.ok(component.render(80).some(line => line.includes('const')));
      }
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: cwd },
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});

test("bundled companions load in either order and Brave follows the model in all modes", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-companion-load-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const script = `
    import assert from 'node:assert/strict';
    import { dirname, join } from 'node:path';
    import { fileURLToPath } from 'node:url';
    const sdk = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
    const { loadExtensions } = await import(join(sdk, 'core/extensions/loader.js'));
    const { syncAdapter } = await import('@howaboua/pi-codex-conversion/dist/adapter/activation/activation.js');
    const { createEventBus } = await import(join(sdk, 'core/event-bus.js'));
    const { getCodeModeExtensionToolSnapshot } = await import('@howaboua/pi-codex-conversion/dist/code-mode-extension-tools.js');
    const { DEFAULT_CODEX_CONVERSION_CONFIG } = await import('@howaboua/pi-codex-conversion/dist/adapter/activation/config.js');
    const { createPiCodeModeBridge } = await import('@howaboua/pi-codex-conversion/dist/adapter/code-mode/pi-tools.js');
    const paths = ['codex-conversion', 'codex-web-run', 'codex-imagegen', 'browser', 'brave-search', 'fast', 'ask-user-question'].map(p => join(process.cwd(), 'extensions', p, 'index.ts'));
    for (const order of [paths, [...paths].reverse()]) {
      const events = createEventBus();
      const loaded = await loadExtensions(order, process.env.PI_CODING_AGENT_DIR, events);
      assert.deepEqual(loaded.errors, []);
      const tools = loaded.extensions.flatMap(e => [...e.tools.values()].map(t => t.definition));
      const names = tools.map(t => t.name);
      assert.equal(names.filter(n => n === 'web_run').length, 1);
      assert.equal(names.filter(n => n === 'imagegen').length, 1);
      assert.equal(names.filter(n => n === 'browser').length, 1);
      assert.equal(loaded.extensions.filter(e => e.commands.has('browser')).length, 1);
      assert.ok(!names.includes('openai_image'));
      assert.ok(!loaded.extensions.some(e => e.commands.has('openai-image')));
      let active = [...names, 'read', 'edit', 'write', 'bash'];
      loaded.runtime.getActiveTools = () => active;
      loaded.runtime.setActiveTools = names => { active = names; };
      loaded.runtime.getAllTools = () => [...new Set([...names, 'read', 'edit', 'write', 'bash'])].map(name => ({name}));
      const pi = { events, getActiveTools: () => active,
        setActiveTools: names => { active = names; }, getAllTools: loaded.runtime.getAllTools };
      const brave = loaded.extensions.find(e => e.tools.has('brave_search'));
      const bridge = createPiCodeModeBridge(pi);
      // Include all explicit names in Pi's callable fixture: gated registrations
      // must reserve their names even when their explicit integration is inactive.
      bridge.prepareLoadout({ callable: [...tools, { name: 'ordinary_extension', description: 'Auto imported', parameters: { type: 'object' } }], getNamespace: () => undefined });
      const config = structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG);
      config.scope.allProviders = 'on';
      const state = { config };
      for (const mode of ['normal', 'code', 'notebook']) {
        state.executionMode = mode;
        for (const model of [
          {provider: 'anthropic', api: 'anthropic-messages', id: 'claude'},
          {provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-6-luna'},
          {provider: 'renamed', api: 'openai-codex-responses', id: 'gpt-6-luna'},
          {provider: 'openai', api: 'openai-responses', id: 'gpt-6-luna'},
        ]) {
          const ctx = {model, hasUI: false};
          for (const fn of brave.handlers.get('model_select')) await fn({}, ctx);
          syncAdapter(pi, ctx, state);
          const snapshot = getCodeModeExtensionToolSnapshot(pi, ctx, { refreshGates: true, eligibleTopLevelNames: names });
          const imported = bridge.getTools(snapshot.allToolNames);
          const nested = [...snapshot.tools, ...imported];
          assert.ok(imported.some(t => t.name === 'ordinary_extension'));
          for (const name of ['brave_search', 'ask_user_question', 'web_run', 'imagegen', 'browser']) {
            assert.ok(!imported.some(t => t.name === name), name + ' explicit integration must win');
            assert.equal(nested.filter(t => (t.topLevelName ?? t.name) === name).length, name === 'brave_search' && model.api === 'openai-codex-responses' ? 0 : 1);
          }
          assert.equal(nested.find(t => t.topLevelName === 'ask_user_question').blocking, true);
          const excluded = getCodeModeExtensionToolSnapshot(pi, ctx, { eligibleTopLevelNames: [] });
          assert.equal(excluded.tools.length, 0, 'Pi tool eligibility remains authoritative');
          assert.ok(excluded.allToolNames.includes('brave_search'), 'ineligible names remain reserved');
          const codex = model.api === 'openai-codex-responses';
          assert.equal(nested.some(t => t.topLevelName === 'brave_search'), !codex);
          assert.ok(nested.some(t => t.topLevelName === 'web_run'));
          assert.ok(nested.some(t => t.topLevelName === 'imagegen'));
          assert.ok(nested.some(t => t.topLevelName === 'browser'));
          assert.equal(active.includes('brave_search'), mode === 'normal' && !codex);
          if (codex) await assert.rejects(
            () => brave.tools.get('brave_search').definition.execute('blocked', {query: 'test'}, undefined, undefined, ctx), /Use web_run/);
        }
      }
      // Without conversion, ordinary Pi still removes and restores Brave.
      active = ['read', 'brave_search'];
      for (const model of [{provider: 'openai-codex'}, {provider: 'anthropic'}]) {
        for (const fn of brave.handlers.get('model_select')) await fn({}, {model});
        assert.equal(active.includes('brave_search'), model.provider !== 'openai-codex');
      }
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: cwd },
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});
