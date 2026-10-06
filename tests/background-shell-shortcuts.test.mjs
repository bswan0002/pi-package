import assert from "node:assert/strict";
import test from "node:test";
import { renderBackgroundBashWidget, registerBackgroundBashWidgetShortcuts } from "@howaboua/pi-codex-conversion/dist/ui/background-bash-widget.js";

const defaults = {
  backgroundShellPrevShortcut: "alt+q",
  backgroundShellNextShortcut: "alt+e",
  backgroundShellToggleShortcut: "alt+w",
  backgroundShellCloseShortcut: "alt+r",
};

function render(platform, config = defaults) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  let lines;
  try {
    Object.defineProperty(process, "platform", { value: platform });
    renderBackgroundBashWidget({ mode: "tui", ui: {
      theme: { fg: (_tone, text) => text },
      setWidget: (_id, value) => { lines = value; },
    } }, { folded: true }, { listSessions: () => [{ id: 47, running: true }] }, config);
    return lines.at(-1);
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

test("background shell uses Option labels on macOS", () => {
  assert.equal(render("darwin"), "╰─ ⌥Q/⌥E select · ⌥W fold/open · ⌥R close");
});

test("background shell retains canonical labels elsewhere", () => {
  for (const platform of ["linux", "win32"]) {
    assert.equal(render(platform), "╰─ alt+q/alt+e select · alt+w fold/open · alt+r close");
  }
});

test("background shell labels respect customized bindings without mutating them", () => {
  const config = { ...defaults, backgroundShellToggleShortcut: "ctrl+alt+x", backgroundShellCloseShortcut: "f8" };
  assert.equal(render("darwin", config), "╰─ ⌥Q/⌥E select · ctrl+⌥X fold/open · f8 close");
  assert.equal(config.backgroundShellToggleShortcut, "ctrl+alt+x");
  const registered = [];
  registerBackgroundBashWidgetShortcuts({ registerShortcut: (key) => registered.push(key) }, {}, {}, config, () => true);
  assert.deepEqual(registered, ["ctrl+alt+x", "alt+q", "alt+e", "f8"]);
});
