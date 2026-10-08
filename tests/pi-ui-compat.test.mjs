import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { UserMessageComponent, getMarkdownTheme, getSelectListTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { TuiAltScreen, TuiMainScreen, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";

const agentEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const { createJiti } = createRequire(agentEntry)("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { theme } = await import(new URL("./modes/interactive/theme/theme.js", agentEntry));
const { KeybindingsManager } = await import(new URL("./core/keybindings.js", agentEntry));
const { patchUserMessageComponent, PolishedEditor } = await jiti.import("../extensions/style/ui.ts");
initTheme("dark", false);

function terminal() {
  return { columns: 100, rows: 40, kittyProtocolActive: false,
    start(onInput) { this.input = onInput; }, stop() {}, write() {}, moveBy() {}, hideCursor() {}, showCursor() {},
    clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {},
    async drainInput() {},
  };
}
function bounded(lines, width) {
  assert.ok(lines.length > 0);
  for (const line of lines) assert.ok(visibleWidth(line) <= width, `line exceeds ${width}: ${line}`);
  return stripTerminalSequences(lines.join("\n"));
}

test("styled user messages retain text, framing and shell zones across resize and padding changes", () => {
  const original = UserMessageComponent.prototype.render;
  try {
    patchUserMessageComponent(theme);
    const message = new UserMessageComponent("Hello **Pi**\n\nA second paragraph with unicode 日本語.", getMarkdownTheme());
    for (const width of [30, 100, 40]) {
      message.setOutputPad(0);
      const lines = message.render(width);
      const text = bounded(lines, width);
      assert.match(text, /Hello Pi/);
      assert.match(text, /日本語/);
      assert.match(text, /│/);
      for (const zone of ["A", "B", "C"]) {
        assert.equal(lines.join("").split(`\x1b]133;${zone}\x07`).length - 1, 1);
      }
      message.setOutputPad(1);
      assert.match(bounded(message.render(width), width), /Hello Pi/);
    }
  } finally {
    UserMessageComponent.prototype.render = original;
  }
});

for (const Host of [TuiMainScreen, TuiAltScreen]) {
  test(`editor renders and resizes on ${Host.name}`, () => {
    const tui = new Host(terminal());
    const editor = new PolishedEditor(tui, {
      borderColor: (s) => theme.fg("border", s), selectList: getSelectListTheme(),
    }, new KeybindingsManager(), theme, () => "gpt-6  fast", () => "high");
    editor.setText("Please review this change");
    for (const width of [40, 100, 50]) {
      assert.match(bounded(editor.render(width), width), /Please review this change/);
      assert.match(bounded(editor.render(width), width), /gpt-6  fast/);
    }
    tui.stop();
  });
}

for (const Host of [TuiMainScreen, TuiAltScreen]) {
  test(`Home/End edit the line and Ctrl+Home/End preserve the cursor on ${Host.name}`, (t) => {
    const term = terminal();
    const tui = new Host(term);
    t.after(() => tui.stop());
    const editor = new PolishedEditor(tui, {
      borderColor: (s) => theme.fg("border", s), selectList: getSelectListTheme(),
    }, new KeybindingsManager(), theme, () => "gpt-6", () => "high");
    tui.addChild(editor);
    tui.setFocus(editor);
    const scrolls = [];
    if (Host === TuiAltScreen) {
      tui.scrollToTop = () => scrolls.push("top");
      tui.scrollToBottom = () => scrolls.push("bottom");
    }
    tui.start();
    for (const [home, end] of [["\x1b[H", "\x1b[F"], ["\x1b[1~", "\x1b[4~"]]) {
      editor.setText("first\nsecond");
      term.input(home);
      term.input("A");
      assert.equal(editor.getText(), "first\nAsecond");
      term.input(end);
      term.input("Z");
      assert.equal(editor.getText(), "first\nAsecondZ");
    }
    assert.deepEqual(scrolls, []);
    editor.setText("first\nsecond");
    term.input("\x1b[D"); // Cursor before the final d.
    term.input("\x1b[1;5H");
    term.input("A");
    term.input("\x1b[1;5F");
    term.input("Z");
    assert.equal(editor.getText(), "first\nseconAZd");
    assert.deepEqual(scrolls, Host === TuiAltScreen ? ["top", "bottom"] : []);
  });
}

test("custom diff renderers survive Pi tool padding, duration and replay", async () => {
  const { ToolExecutionComponent } = await import(new URL("./modes/interactive/components/tool-execution.js", agentEntry));
  const { default: registerDiff } = await jiti.import("../extensions/diff/index.ts");
  const tools = new Map();
  await registerDiff({
    events: { on: () => () => {}, emit() {} }, on() {}, registerEntryRenderer() {},
    registerTool: tool => tools.set(tool.name, tool),
  });
  const ui = { requestRender() {} };
  for (const name of ["edit", "write"]) {
    const tool = tools.get(name);
    assert.ok(tool);
    const args = { path: "fixture.ts", content: "const value = 1;", oldText: "old", newText: "new" };
    const result = { content: [{ type: "text", text: "Fixture edit failed" }], isError: true, durationMs: 42 };
    // The second component simulates reloading the persisted result, without execution-start state.
    for (const replay of [false, true]) {
      const component = new ToolExecutionComponent(name, "fixture", args, { outputPad: 0 }, tool, ui, process.cwd());
      component.setArgsComplete();
      if (!replay) component.markExecutionStarted();
      component.updateResult(result);
      for (const [width, padding] of [[40, 0], [100, 3], [30, 1], [60, 0]]) {
        component.setOutputPad(padding);
        for (const expanded of [false, true]) {
          component.setExpanded(expanded);
          const lines = component.render(width);
          const text = bounded(lines, width);
          assert.match(text, /fixture.ts/);
          assert.match(text, /Fixture edit failed/);
          const header = text.split("\n").find(line => line.includes("fixture.ts"));
          assert.equal(header.length - header.trimStart().length, padding);
        }
      }
    }
  }
});
