import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { _test, isReadonlyGitCommand } = await jiti.import("../extensions/readonly-git-permissions/index.ts");
const config = { enabled: true, provider: "openai-codex", model: "gpt-6-luna", autoAllowReadOnly: true };

const cases = [
  ["printf test >> test.ts; git diff", "mutating", "read-only", ["test.ts"], true],
  ["git diff > report.txt", "mutating", "read-only", ["report.txt"], true],
  ["python3 edit.py; git status", "mutating", "read-only", ["src/app.ts"], true],
  ["printf test >> test.ts", "mutating", "none", ["test.ts"], true],
  ["git status; git add test.ts", "mutating", "mutating", ["Git index"], false],
  ["git commit -m test", "mutating", "mutating", ["Git history"], false],
  ["git branch feature", "mutating", "mutating", ["Git refs"], false],
  ["git reset --hard", "destructive", "destructive", ["worktree", "Git index"], false],
  ["git restore test.ts", "destructive", "destructive", ["test.ts"], false],
  ["git clean -fd", "destructive", "destructive", ["untracked files"], false],
  ["git push --force", "destructive", "destructive", ["remote refs"], false],
  ["printf test > .git/config; git status", "mutating", "mutating", [".git/config"], false],
  ["sh unresolved.sh git", "unknown", "unknown", [], false],
];

test("approval uses Git effects, not ordinary file writes (fixture verdicts)", async () => {
  for (const [command, verdict, gitEffect, writes, expected] of cases) {
    const review = { verdict, gitEffect, writes, summary: `Effects of ${command}` };
    const ctx = { cwd: process.cwd(), modelRegistry: {
      find: () => ({ id: config.model }),
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fixture" }),
      streamSimple: (_model, context) => {
        assert.match(context.systemPrompt, /git add and git commit ALWAYS/);
        assert.match(context.systemPrompt, /not a general filesystem-write gate/);
        return { result: async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: JSON.stringify(review) }] }) };
      },
    } };
    const result = await _test.explainBlockedCommand(command, ctx, config);
    assert.equal(result.status, "available", command);
    assert.equal(_test.isAutoAllowableReview(result, config), expected, command);
    assert.equal(_test.isAutoAllowableReview(result, { ...config, autoAllowReadOnly: false }), false);
    if (gitEffect !== "none") assert.equal(await isReadonlyGitCommand(command), false, command);
  }
});

test("missing/invalid Git assessment fails closed; overall readonly cannot conceal Git mutations", () => {
  const base = { verdict: "read-only", writes: [], summary: "Reads status." };
  for (const gitEffect of [undefined, null, "safe", 1]) {
    assert.equal(_test.parseSafetyReview(JSON.stringify({ ...base, gitEffect })), undefined);
    assert.equal(_test.isAutoAllowableReview({ status: "available", label: "fixture", review: { ...base, gitEffect } }, config), false);
  }
  for (const gitEffect of ["mutating", "destructive", "unknown"]) {
    assert.equal(_test.isAutoAllowableReview({ status: "available", label: "fixture", review: { ...base, gitEffect } }, config), false);
  }
});
