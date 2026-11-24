// Exercise the new default TS Notebook using only disposable agent/session state.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TsCodeModeClient } from '@howaboua/pi-codex-conversion/dist/tools/ts-mode/client.js';
const dir = await mkdtemp(join(tmpdir(), 'pi-ts-'));
const client = new TsCodeModeClient({ agentDir: dir, maxHeapMiB: 512, prepareToolInput: (_tool, input) => input });
let session = 'first';
const ctx = { cwd: dir, extensionContext: { sessionManager: { getSessionId: () => session, getBranch: () => [] } } };
const run = async source => {
  let result = await client.execute(source, ctx);
  const deadline = Date.now() + 120_000;
  const items = [...result.contentItems];
  while (result.kind === 'yielded') {
    assert.ok(Date.now() < deadline, 'TS execution timed out');
    result = await client.wait(result.cellId, 1000, ctx);
    items.push(...result.contentItems);
  }
  assert.equal(result.kind, 'result');
  assert.equal(result.errorText, undefined);
  return items.filter(item => item.type === 'input_text').map(item => item.text).join('\n');
};
try {
  await run('let count: number = 41;');
  assert.equal(await run('count++; text(count);'), '42');
  session = 'second';
  await run('let count: number = 9;');
  assert.equal(await run('text(count);'), '9');
  console.log('TS Notebook: typed execution, cross-cell persistence and separate sessions passed.');
} finally {
  await client.shutdown();
  await rm(dir, { recursive: true, force: true });
}
