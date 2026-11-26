// Explicit VM runtime smoke check with disposable state and fixture tools only.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VmCodeClient } from '@howaboua/pi-codex-conversion/dist/tools/vm-mode/client.js';
const dir = await mkdtemp(join(tmpdir(), 'pi-vm-'));
const client = new VmCodeClient({ maxHeapMiB: 128, agentDir: dir, prepareToolInput: (_tool, input) => input });
let session = 'first';
const ctx = { cwd: dir, extensionContext: { sessionManager: { getSessionId: () => session, getBranch: () => [] } } };
let calls = 0;
const fixture = { name: 'fixture', kind: 'function', usage: 'tools.fixture(input)', deferLoading: false,
  invoke: async input => { calls++; return input; } };
const execute = async (source, tools = []) => {
  let result = await client.execute(source, ctx, undefined, tools);
  const deadline = Date.now() + 120_000;
  const items = [...result.contentItems];
  while (result.kind === 'yielded') {
    assert.ok(Date.now() < deadline, 'VM Code execution timed out');
    result = await client.wait(result.cellId, 1000, ctx);
    items.push(...result.contentItems);
  }
  assert.equal(result.kind, 'result');
  return { ...result, text: items.filter(item => item.type === 'input_text').map(item => item.text).join('\n') };
};
const run = async (source, tools) => {
  const result = await execute(source, tools);
  assert.equal(result.errorText, undefined);
  return result.text;
};
try {
  await run('let counter = 41; globalThis.marker = "retained"; store("retained", {count: 3});');
  assert.match(await run('counter++; text(counter); text(marker); text(load("retained"));'), /42[\s\S]*retained[\s\S]*3/);
  assert.match((await execute('let counter = 0;')).errorText, /already been declared/);
  assert.equal(await run('text(counter);'), '42');
  assert.match(await run('text(typeof process); text(typeof require); text(typeof fetch);'), /^undefined\nundefined\nundefined$/);
  assert.ok((await execute('await import("node:fs");')).errorText, 'host imports stay unavailable');
  assert.ok((await execute('Function("return 1")();')).errorText, 'dynamic code generation stays disabled');

  // Persisted handles must never bypass the current cell's tool list or admission hooks.
  await run('var savedTool = tools.fixture; text(await savedTool({ok: true}));', [fixture]);
  assert.equal(calls, 1);
  assert.ok((await execute('await savedTool({});')).errorText, 'removed tools cannot execute through old handles');
  assert.equal(calls, 1);
  ctx.preflight = async () => { throw new Error('fixture denied'); };
  assert.match((await execute('await savedTool({});', [fixture])).errorText, /fixture denied/);
  assert.equal(calls, 1, 'denied tools never execute');
  const caught = await execute('try { await savedTool({}); } catch (error) { text("handled"); }', [fixture]);
  assert.deepEqual(caught.nestedFailures, [{name: 'fixture', error: 'fixture denied', count: 1}], 'handled nested failures still reach the outer result');
  assert.equal(calls, 1);
  delete ctx.preflight;

  const inventory = await client.bindingInventory(ctx);
  assert.equal(inventory.kind, 'bindings');
  assert.ok(inventory.names.includes('counter'));
  assert.equal(await run('text(typeof yield_control);'), 'undefined');
  await run('// @exec: {"reset":true}');
  assert.equal(await run('text(typeof counter); text(typeof marker); text(load("retained"));'), 'undefined\nundefined\n{"count":3}');
  await run('let sessionBinding = 7; store("retained", 9);');
  session = 'second';
  assert.equal(await run('text(typeof sessionBinding); text(load("retained"));'), 'undefined\nundefined');
  console.log('VM Code: cross-cell bindings/store, explicit/session reset, tool revocation/admission and host isolation checks passed.');
} finally {
  await client.shutdown();
  await rm(dir, { recursive: true, force: true });
}
