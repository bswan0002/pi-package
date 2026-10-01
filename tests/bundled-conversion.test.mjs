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
