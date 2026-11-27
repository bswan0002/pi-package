import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { convertToLlm, estimateTokens } from "@earendil-works/pi-coding-agent";
import { takeProgramResumeToken } from "@earendil-works/pi-tui";

test("Pi terminal resume retains profile and explicit restrictions, and refuses a changed cwd", async t => {
  const dir = await mkdtemp(join(tmpdir(), "pi-resume-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sessionFile = join(dir, "session.jsonl");
  await writeFile(sessionFile, "");
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PI_CODING_AGENT_DIR: dir, FIXTURE_SESSION: sessionFile },
    input: `
      import assert from 'node:assert/strict';
      import { parseArgs } from '@earendil-works/pi-coding-agent';
      const entry = import.meta.resolve('@earendil-works/pi-coding-agent');
      const { getProgramResumeCommand } = await import(new URL('./modes/interactive/interactive-mode.js', entry));
      const flags = ['--tools', 'read', '--exclude-tools', 'bash,write,edit', '--no-extensions',
        '-e', './extensions', '--no-mcp', '--no-skills', '--no-context-files',
        '--system-prompt', 'Fixture instructions', '--no-approve'];
      const parsed = parseArgs([...flags, '--api-key', 'fixture-secret', 'fixture message']);
      assert.deepEqual(parsed.resumeFlags, flags);
      const session = { isPersisted: () => true, getSessionFile: () => process.env.FIXTURE_SESSION,
        usesDefaultSessionDir: () => true, getSessionId: () => 'fixture-session', getCwd: () => process.cwd() };
      const command = getProgramResumeCommand(session, parsed.resumeFlags);
      assert.deepEqual(command, { argv: ['pi', '--agent-dir', process.env.PI_CODING_AGENT_DIR,
        '--session', 'fixture-session', ...flags], cwd: process.cwd() });
      assert.equal(JSON.stringify(command).includes('fixture-secret'), false);
      assert.equal(getProgramResumeCommand({...session, getCwd: () => process.env.PI_CODING_AGENT_DIR}, flags), undefined);
      assert.equal(getProgramResumeCommand({...session, isPersisted: () => false}, flags), undefined);
    `,
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});

test("Pi consumes the terminal resume token before child environments inherit it", () => {
  const env = { OSC7577_TOKEN: "fixture-token", UNRELATED: "preserved" };
  assert.equal(takeProgramResumeToken(env), "fixture-token");
  assert.deepEqual(env, { UNRELATED: "preserved" });
  assert.equal(takeProgramResumeToken(env), undefined);
});

test("excluded shell output contributes neither LLM messages nor estimated compaction tokens", () => {
  const shell = { role: "bashExecution", command: "fixture", output: "x".repeat(100_000),
    exitCode: 0, cancelled: false, truncated: false, timestamp: 1 };
  const hidden = { ...shell, excludeFromContext: true };
  assert.deepEqual(convertToLlm([hidden]), []);
  assert.equal(estimateTokens(hidden), 0);
  assert.ok(convertToLlm([shell]).length > 0);
  assert.ok(estimateTokens(shell) > 25_000);
});
