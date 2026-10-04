import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexUsagePayload, codexUsageStatus } from "@howaboua/pi-codex-conversion/dist/codex-usage/payload.js";
import { buildStatusText } from "@howaboua/pi-codex-conversion/dist/adapter/activation/tool-set.js";
import { renderCodexStatus } from "@howaboua/pi-codex-conversion/dist/ui/status.js";

test("quota percentages and reset timestamps follow actual durations, not slot order", (t) => {
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  const five = { used_percent: 20, limit_window_seconds: 18000, reset_after_seconds: 3600 };
  const week = { used_percent: 68, limit_window_seconds: 604800, reset_at: 1_800_151_200 };
  for (const [primary_window, secondary_window] of [[five, week], [week, five]]) {
    const status = codexUsageStatus(parseCodexUsagePayload({ rate_limit: { primary_window, secondary_window } }));
    assert.deepEqual(status, { fiveHourUsageLeft: 80, weeklyUsageLeft: 32, fiveHourResetsAt: 1_800_003_600, weeklyResetsAt: 1_800_151_200 });
    const text = buildStatusText({ usageStatus: status });
    assert.match(text, /5h: 80% left · 1h0m ↺/);
    assert.match(text, /weekly: 32% left · 1d18h ↺/);
  }
});

test("missing, unknown, and nearly-five-hour windows never get guessed reset labels", () => {
  for (const window of [undefined, { used_percent: 3, reset_at: 123 }, { used_percent: 3, limit_window_seconds: 7200, reset_at: 123 }, { used_percent: 3, limit_window_seconds: 17999, reset_at: 123 }]) {
    const status = codexUsageStatus(parseCodexUsagePayload({ rate_limit: { primary_window: window } }));
    assert.doesNotMatch(buildStatusText({ usageStatus: status }), /5h:|weekly:|↺/);
  }
  assert.equal(buildStatusText({ usageStatus: { fiveHourUsageLeft: 80 } }), "Codex adapter • 5h: 80% left");
});

test("reset formatting handles milliseconds, expired deadlines and elapsed time without fetching", (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const status = codexUsageStatus(parseCodexUsagePayload({ rate_limit: {
    primary_window: { used_percent: 20, limit_window_seconds: 18000, reset_at: now + 3600000 },
  } }));
  assert.match(buildStatusText({ usageStatus: status }), /1h0m ↺/);
  now += 60000;
  assert.match(buildStatusText({ usageStatus: status }), /59m ↺/);
  now += 3600000;
  assert.match(buildStatusText({ usageStatus: status }), /0s ↺/);
  assert.doesNotMatch(buildStatusText({ usageStatus: { fiveHourUsageLeft: 80, fiveHourResetsAt: NaN } }), /↺/);
});

test("real conversion status renders countdowns and ANSI together while respecting status-off", (t) => {
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  let rendered;
  const ctx = { hasUI: true, model: { api: "openai-codex-responses" }, ui: {
    setStatus: (_key, value) => { rendered = value; },
    theme: { fg: (_role, value) => `\x1b[2m${value}\x1b[22m` },
  } };
  const state = {
    config: { ui: { statusLine: true }, scope: { allProviders: "off" }, openai: { fast: true } },
    usageStatus: { weeklyUsageLeft: 32, weeklyResetsAt: 1_800_151_200 },
  };
  const plan = { kind: "notebook", effectiveOpenAICodex: true };
  renderCodexStatus(ctx, state, plan);
  assert.match(rendered, /weekly: 32% left · 1d18h ↺/);
  assert.match(rendered, /\x1b\[2m/);
  assert.doesNotMatch(rendered, /5h:|\bfast\b/);
  state.config.ui.statusLine = false;
  renderCodexStatus(ctx, state, plan);
  assert.equal(rendered, undefined);
});
