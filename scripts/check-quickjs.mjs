// Explicit runtime smoke check; may download upstream's pinned runtime into a temporary directory.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsCodeClient } from '@howaboua/pi-codex-conversion/dist/tools/js-mode/client.js';
const dir = await mkdtemp(join(tmpdir(), 'pi-quickjs-'));
const client = new JsCodeClient({ agentDir: dir, maxHeapMiB: 128 });
let session = 'first';
const ctx = { cwd: dir, extensionContext: { sessionManager: { getSessionId: () => session, getBranch: () => [] } } };
const run = async source => {
  let result = await client.execute(source, ctx);
  const deadline = Date.now() + 120_000;
  const items = [...result.contentItems];
  while (result.kind === 'yielded') {
    assert.ok(Date.now() < deadline, 'QuickJS execution timed out');
    result = await client.wait(result.cellId, 1000, ctx);
    items.push(...result.contentItems);
  }
  assert.equal(result.kind, 'result');
  assert.equal(result.errorText, undefined);
  return items.filter(item => item.type === 'input_text').map(item => item.text).join('\n');
};
try {
  await run('globalThis.transient = 42; store("retained", {count: 3});');
  assert.match(await run('text(typeof globalThis.transient); text(load("retained"));'), /undefined[\s\S]*3/);
  session = 'second';
  assert.match(await run('text(load("retained"));'), /undefined/);
  console.log('QuickJS: fresh globals, conversation-local JSON, session reset passed.');
} finally {
  await client.shutdown();
  await rm(dir, { recursive: true, force: true });
}
