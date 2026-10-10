import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { registerDictationButton } from "@howaboua/pi-codex-conversion/dist/voice/dictation-button.js";
import { CodexVoiceController } from "@howaboua/pi-codex-conversion/dist/voice/controller.js";
import { visibleWidth } from "@earendil-works/pi-tui";

const tick = () => new Promise(resolve => setImmediate(resolve));
const theme = { fg: (_color, text) => text, bg: (_color, text) => text };
const click = x => ({ type: "click", button: "left", x, y: 0,
  screenX: x, screenY: 0, width: 100, height: 1, shift: false, alt: false, ctrl: false });

test("paired voice controls align, share a guard, stop chat and report failures", async () => {
  const handlers = new Map();
  const voice = new CodexVoiceController({ events: new EventEmitter() });
  let component, renders = 0, dictations = 0, chats = 0, finish;
  const notices = [];
  const ctx = { hasUI: true, ui: {
    setWidget: (_key, factory) => { component = factory?.({ requestRender: () => renders++ }, theme); },
    notify: (...args) => notices.push(args),
  } };
  registerDictationButton({ on: (name, fn) => handlers.set(name, fn) }, voice,
    async () => { dictations++; }, async current => {
      assert.equal(current, ctx);
      chats++;
      await new Promise(resolve => { finish = resolve; });
      if (chats === 3) throw new Error("Audio unavailable");
    });
  handlers.get("session_start")({}, { hasUI: false });
  assert.equal(component, undefined);
  handlers.get("session_start")({}, ctx);
  for (const width of [0, 1, 5, 20, 40, 100]) assert.ok(visibleWidth(component.render(width)[0]) <= width);
  let line = component.render(100)[0];
  assert.match(line, /\uf130 Dictate.*\u{f147d} Voice chat/u);
  assert.equal(visibleWidth(line), 100);
  const dictationX = () => visibleWidth(component.render(100)[0].split("Dictate")[0]);
  assert.equal(component.handleMouse(click(0)), undefined);
  const x = dictationX();
  assert.equal(component.handleMouse(click(99)).focus, undefined);
  component.handleMouse(click(x));
  component.handleMouse(click(99));
  await tick();
  assert.equal(chats, 1);
  assert.equal(dictations, 0);
  assert.match(component.render(100)[0], /Connecting chat/);
  finish(); await tick();

  for (const state of [{ type: "connecting", mode: "realtime" }, { type: "reconnecting" }]) {
    voice.runtime.state = state;
    voice.publishDictationState();
    assert.match(component.render(100)[0], /Realtime active.*Connecting chat/);
    component.handleMouse(click(99)); await tick();
    assert.equal(chats, 1);
  }
  voice.runtime.state = { type: "conversation" };
  voice.publishDictationState();
  line = component.render(100)[0];
  assert.match(line, /Realtime active.*Stop chat/);
  component.handleMouse(click(visibleWidth(line.split("Realtime active")[0])));
  component.handleMouse(click(99)); await tick();
  assert.equal(dictations, 0);
  assert.equal(chats, 2);
  // Controller becomes idle before asynchronous session.close resolves.
  voice.runtime.state = { type: "idle" };
  voice.publishDictationState();
  assert.match(component.render(100)[0], /Stopping/);
  component.handleMouse(click(dictationX())); await tick();
  assert.equal(dictations, 0);
  finish(); await tick();

  voice.runtime.state = { type: "dictation" };
  voice.publishDictationState();
  assert.match(component.render(100)[0], /Stop · Listening.*Dictation active/);
  component.handleMouse(click(99)); await tick();
  assert.equal(chats, 2);
  voice.runtime.state = { type: "failed" };
  voice.publishDictationState();
  component.render(100); component.handleMouse(click(99)); await tick();
  finish(); await tick();
  assert.deepEqual(notices, [["Audio unavailable", "error"]]);
  assert.match(component.render(100)[0], /Voice chat/);
  assert.ok(renders > 0);
  handlers.get("session_switch")({}, ctx);
  assert.equal(voice.dictationListeners.size, 1);
  handlers.get("session_shutdown")();
  assert.equal(component, undefined);
  assert.equal(voice.dictationListeners.size, 0);
});

test("voice controls follow handoff reservation, forwarded stop and transfer completion", async () => {
  const voice = new CodexVoiceController({ events: new EventEmitter() });
  const changes = [];
  voice.onDictationStateChange(() => changes.push([voice.dictationState, voice.realtimeState]));
  const reservation = voice.reserveHandoffArrival();
  assert.deepEqual(changes.at(-1), ["unavailable", "connecting"]);
  reservation.release();
  assert.deepEqual(changes.at(-1), ["idle", "idle"]);
  voice.runtime.config = {};
  voice.runtime.state = { type: "conversation", session: { microphoneMuted: false } };
  const handoff = voice.captureHandoffAudio();
  voice.runtime.state = { type: "idle" };
  let stops = 0;
  const forwarded = { onSessionEvent: () => () => {}, stop: async () => { stops++; } };
  handoff.transferred(undefined, forwarded);
  assert.deepEqual(changes.at(-1), ["unavailable", "active"]);
  assert.equal(voice.activeMode, "realtime");
  for (const state of [{ type: "connecting", mode: "realtime" }, { type: "reconnecting" }]) {
    voice.runtime.state = state;
    voice.renderStatus("connecting");
    assert.deepEqual(changes.at(-1), ["unavailable", "connecting"]);
  }
  voice.runtime.state = { type: "idle" };
  handoff.finished();
  assert.deepEqual(changes.at(-1), ["idle", "idle"]);
  handoff.transferred(undefined, forwarded);
  await voice.stop();
  assert.equal(stops, 1);
  assert.deepEqual(changes.at(-1), ["idle", "idle"]);
});

test("voice startup respects another provider's active ownership", async () => {
  const bus = new EventEmitter();
  const voice = new CodexVoiceController({ events: bus });
  bus.on("@howaboua/pi/active-voice/v1", request => request.refuse("another provider"));
  for (const mode of ["dictation", "realtime"]) {
    await assert.rejects(() => voice.start({}, {}, mode), /another provider voice or dictation is active/);
    assert.equal(voice.dictationState, "idle");
    assert.equal(voice.realtimeState, "idle");
  }
});
