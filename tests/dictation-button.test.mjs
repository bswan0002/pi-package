import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { registerDictationButton } from "@howaboua/pi-codex-conversion/dist/voice/dictation-button.js";
import { CodexVoiceController } from "@howaboua/pi-codex-conversion/dist/voice/controller.js";
import { visibleWidth, stripTerminalSequences } from "@earendil-works/pi-tui";

const tick = () => new Promise(resolve => setImmediate(resolve));
const theme = { fg: (_color, text) => text, bg: (_color, text) => text };
const click = (x, extra = {}) => ({ type: "click", button: "left", x, y: 0,
  screenX: x, screenY: 0, width: 80, height: 1, shift: false, alt: false, ctrl: false, ...extra });

test("dictation control aligns, handles only button clicks, guards transitions and keeps focus", async () => {
  const handlers = new Map();
  const listeners = new Set();
  const voice = { dictationState: "idle", onDictationStateChange: fn => {
    listeners.add(fn); return () => listeners.delete(fn);
  } };
  let component, renders = 0, calls = 0, finish;
  const notices = [];
  const ctx = { hasUI: true, ui: {
    setWidget: (_key, factory, options) => {
      if (!factory) { component = undefined; return; }
      assert.equal(options.placement, "aboveEditor");
      component = factory({ requestRender: () => renders++ }, theme);
    }, notify: (...args) => notices.push(args),
  } };
  registerDictationButton({ on: (name, fn) => handlers.set(name, fn) }, voice, async current => {
    assert.equal(current, ctx); calls++;
    await new Promise(resolve => { finish = resolve; });
  });
  handlers.get("session_start")({}, ctx);
  assert.match(component.render(80)[0], /\uf130 Dictate/);
  for (const width of [0, 1, 5, 20, 80]) {
    const line = component.render(width)[0];
    assert.ok(visibleWidth(line) <= width);
    if (width >= 20) assert.equal(visibleWidth(line), width);
  }
  component.render(80);
  assert.equal(component.handleMouse(click(0)), undefined);
  assert.equal(component.handleMouse(click(79, { ctrl: true })), undefined);
  const result = component.handleMouse(click(79));
  assert.equal(result.handled, true);
  assert.notEqual(result.focus, true);
  component.handleMouse(click(79));
  await tick();
  assert.equal(calls, 1);
  assert.match(component.render(80)[0], /Connecting/);
  finish(); await tick();
  for (const [state, label] of [["connecting", "Connecting"], ["listening", "Stop · Listening"],
      ["transcribing", "Transcribing"], ["unavailable", "Realtime active"]]) {
    voice.dictationState = state;
    for (const listener of listeners) listener();
    assert.match(stripTerminalSequences(component.render(80)[0]), new RegExp(label));
    if (state !== "listening") {
      component.handleMouse(click(79)); await tick(); assert.equal(calls, 1);
    }
  }
  voice.dictationState = "listening";
  component.render(80); component.handleMouse(click(79)); await tick();
  assert.equal(calls, 2); finish(); await tick();
  assert.ok(renders > 0);
  assert.deepEqual(notices, []);
  handlers.get("session_switch")({}, ctx);
  assert.equal(listeners.size, 1);
  handlers.get("session_shutdown")();
  assert.equal(component, undefined);
  assert.equal(listeners.size, 0);
});

test("controller publishes hotkey/start/finish/failure states and suppresses only dictation footer", async () => {
  const voice = new CodexVoiceController({ events: new EventEmitter() });
  const states = [], statuses = [], notices = [];
  voice.onDictationStateChange(state => states.push(state));
  voice.runtime.context = { ui: { theme,
    setStatus: (...args) => statuses.push(args), notify: (...args) => notices.push(args) } };
  voice.runtime.state = { type: "connecting", mode: "dictation", phase: "authorizing" };
  voice.renderStatus("connecting…");
  assert.equal(states.at(-1), "connecting");
  assert.equal(statuses.at(-1)[1], undefined);
  let resolveFinish, finishes = 0;
  const session = { finish: async () => {
    finishes++; await new Promise(resolve => { resolveFinish = resolve; });
  }, close: async () => {} };
  voice.runtime.state = { type: "dictation", session };
  voice.runtime.announcedMode = "dictation";
  voice.renderStatus("listening");
  assert.equal(states.at(-1), "listening");
  const finishing = voice.finishDictation();
  voice.renderStatus("transcribing"); // Upstream transcriber status has no ellipsis.
  assert.equal(states.at(-1), "transcribing");
  await voice.finishDictation();
  assert.equal(finishes, 1);
  resolveFinish(); await finishing;
  assert.equal(states.at(-1), "idle");
  voice.runtime.state = { type: "conversation", session: { microphoneMuted: false, close: async () => {} } };
  voice.renderStatus("listening");
  assert.equal(states.at(-1), "unavailable");
  assert.match(statuses.at(-1)[1], /voice: listening/);
  voice.runtime.state = { type: "dictation", session };
  voice.fail(new Error("Microphone unavailable"));
  assert.equal(states.at(-1), "idle");
  assert.equal(notices.at(-1)[0], "Microphone unavailable");
  await tick();
});

test("headless sessions do not create a widget; action errors are notified", async () => {
  const handlers = new Map();
  const voice = { dictationState: "idle", onDictationStateChange: () => () => {} };
  registerDictationButton({ on: (name, fn) => handlers.set(name, fn) }, voice, async () => { throw new Error("Denied"); });
  handlers.get("session_start")({}, { hasUI: false });
  let component;
  const notices = [];
  handlers.get("session_start")({}, { hasUI: true, ui: {
    setWidget: (_key, factory) => { component = factory({ requestRender() {} }, theme); },
    notify: (...args) => notices.push(args),
  } });
  component.render(80); component.handleMouse(click(79)); await tick();
  assert.deepEqual(notices, [["Denied", "error"]]);
  assert.match(component.render(80)[0], /Dictate/);
});
