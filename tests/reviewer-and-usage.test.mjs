import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { analyzeGitCommand } = await jiti.import("../extensions/readonly-git-permissions/shell.ts");
const { isReadonlyGitCommand, _test } = await jiti.import("../extensions/readonly-git-permissions/index.ts");
const { inspectReviewTool } = await jiti.import("../extensions/readonly-git-permissions/inspection.ts");
const { parseUsageSnapshot, formatUsageSnapshot } = await jiti.import("../extensions/better-openai/src/usage.ts");

test("Git detection distinguishes quoted data and heredocs from executable Git", async () => {
  const nonGit = [
    "python3 - <<'PY'\nimport pathlib,json\nif 'git' in k.lower(): print(k)\nPY\nherdr agent prompt pi-validation /openai-usage",
    "echo git", "printf '%s' 'git reset --hard'", "# git reset --hard\necho okay",
    "cat <<'EOF'\n$(git reset --hard)\nEOF", "python3 -c 'print(\"git\")'",
  ];
  for (const command of nonGit) assert.equal((await analyzeGitCommand(command)).hasGit, false, command);
  const git = [
    "git status", "/usr/bin/git status", "sh -c 'git reset --hard'", "env FOO=1 git status",
    "sh <<'SH'\ngit reset --hard\nSH", 'echo "$(git status)"', "cat <<EOF\n$(git status)\nEOF",
    "printf main | xargs git checkout", "python3 -c 'import subprocess; subprocess.run([\"git\", \"status\"])'",
    "herdr pane run w4D:p2 'git reset --hard'", "g=git; $g reset --hard",
  ];
  for (const command of git) assert.equal((await analyzeGitCommand(command)).hasGit, true, command);
});

test("mixed commands, redirections and dynamic execution cannot bypass whole-command review", async () => {
  assert.equal(await isReadonlyGitCommand("git status && git diff --stat"), true);
  for (const command of ["git status > output", "git status; rm x", "git status $(touch x)", "git -c alias.x='!touch x' x", "git diff --output=x", "sh -c 'git status'", "echo git"]) {
    assert.equal(await isReadonlyGitCommand(command), false, command);
  }
});

test("bounded inspection reads scripts but refuses credentials, binaries, outside paths and arbitrary execution", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-review-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "script.sh"), "git status\n".repeat(2000));
  await writeFile(join(cwd, "auth.json"), "secret");
  await writeFile(join(cwd, "binary"), Buffer.from([0, 1]));
  await symlink(join(cwd, "auth.json"), join(cwd, "safe-looking"));
  const inspect = (name, args, command = "sh script.sh") => inspectReviewTool(name, args, cwd, command, new AbortController().signal);
  assert.match(await inspect("read_review_file", { path: "script.sh" }), /truncated/);
  for (const path of ["auth.json", "safe-looking", "binary", "/etc/hosts"]) await assert.rejects(inspect("read_review_file", { path }));
  for (const args of [{ cli: "sh", subcommands: ["-c", "touch x"] }, { cli: "git", subcommands: ["custom-alias"] }, { cli: "herdr", subcommands: ["pane", "run", "w4D:p2"] }, { cli: "herdr", subcommands: ["pane", "--help;touch x"] }]) {
    await assert.rejects(inspect("review_cli_help", args));
  }
  await assert.rejects(inspect("bash", { command: "touch x" }));
  assert.match(await inspect("review_cli_help", { cli: "git", subcommands: ["status"] }), /usage: git status/i);
});

test("reviewer completes an inspection/tool-result loop and honors cancellation", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-review-loop-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "script.sh"), "git status\n");
  const verdict = { verdict: "read-only", summary: "Reads Git status.", writes: [] };
  let calls = 0;
  const ctx = { cwd, modelRegistry: {
    find: () => ({ id: "gpt-6-luna" }),
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fixture" }),
    streamSimple: (_model, context, options) => ({ result: async () => {
      assert.ok(options.signal);
      if (++calls === 1) {
        assert.ok(context.tools.some((tool) => tool.name === "read_review_file"));
        return { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "inspect", name: "read_review_file", arguments: { path: "script.sh" } }] };
      }
      assert.equal(context.messages.at(-1).role, "toolResult");
      assert.equal(context.messages.at(-1).content[0].text, "git status\n");
      return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: JSON.stringify(verdict) }] };
    } }),
  } };
  const config = { enabled: true, provider: "openai-codex", model: "gpt-6-luna", autoAllowReadOnly: true };
  const result = await _test.explainBlockedCommand("sh script.sh git", ctx, config);
  assert.equal(result.status, "available");
  assert.deepEqual(result.review, verdict);
  assert.equal(calls, 2);
  assert.equal(_test.isAutoAllowableReview(result, config), true);
  assert.equal(_test.isAutoAllowableReview({ ...result, review: { ...verdict, verdict: "unknown" } }, config), false);
  assert.equal(_test.isAutoAllowableReview({ ...result, review: { ...verdict, writes: ["file"] } }, config), false);
  await assert.rejects(inspectReviewTool("read_review_file", { path: "script.sh" }, cwd, "", AbortSignal.abort()));
});

test("usage windows follow their actual durations, regardless of slot order", () => {
  const weekly = { used_percent: 16, limit_window_seconds: 604800, reset_after_seconds: 335711 };
  const fiveHour = { used_percent: 20, limit_window_seconds: 18000, reset_after_seconds: 3600 };
  const parse = (rate_limit) => parseUsageSnapshot({ rate_limit }, "gpt-6-luna");
  const format = (snapshot) => formatUsageSnapshot(snapshot, { showResetTimes: true });
  assert.equal(format(parse({ primary_window: weekly, secondary_window: null })), "7d: 84% ↺ 3d21h");
  for (const rate_limit of [{ primary_window: weekly, secondary_window: fiveHour }, { primary_window: fiveHour, secondary_window: weekly }]) {
    assert.equal(format(parse(rate_limit)), "5h: 80% ↺ 1h0m | 7d: 84% ↺ 3d21h");
  }
  assert.equal(format(parse({ primary_window: { used_percent: 2, limit_window_seconds: 7200 } })), "2h: 98%");
  assert.equal(format(parse({ secondary_window: { used_percent: 3 } })), "Secondary: 97%");
  assert.equal(format(parse({ primary_window: { used_percent: Infinity, limit_window_seconds: -1 } })), "Primary: --");
  assert.equal(format(parse({ primary_window: { used_percent: 1, limit_window_seconds: 5400 } })), "1h30m: 99%");
  assert.equal(format(parse(null)), "Usage unavailable");
  assert.equal(formatUsageSnapshot(parse({ primary_window: weekly }), { showResetTimes: false }), "7d: 84%");
});


test("reviewer does not auto-approve failed, malformed or over-budget reviews", async () => {
  const config = { enabled: true, provider: "openai-codex", model: "gpt-6-luna", autoAllowReadOnly: true };
  for (const response of [
    { stopReason: "error", content: [{ type: "text", text: '{"verdict":"read-only","summary":"OK","writes":[]}' }] },
    { stopReason: "stop", content: [{ type: "text", text: "looks safe" }] },
    { stopReason: "toolUse", content: Array.from({ length: 5 }, (_, i) => ({ type: "toolCall", id: String(i), name: "read_review_file", arguments: { path: "never-read" } })) },
  ]) {
    const ctx = { cwd: process.cwd(), modelRegistry: {
      find: () => ({ id: "gpt-6-luna" }),
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fixture" }),
      streamSimple: () => ({ result: async () => response }),
    } };
    const result = await _test.explainBlockedCommand("git example", ctx, config);
    assert.equal(result.status, "unavailable");
    assert.equal(_test.isAutoAllowableReview(result, config), false);
  }
});
