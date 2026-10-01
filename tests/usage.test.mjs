import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { parseUsageSnapshot, formatUsageSnapshot } = await jiti.import("../extensions/better-openai/src/usage.ts");

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


