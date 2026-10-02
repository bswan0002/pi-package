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
const { QuestionnaireSession } = await jiti.import("../extensions/ask-user-question/state/questionnaire-session.ts");
const { buildItemsForQuestion } = await jiti.import("../extensions/ask-user-question/ask-user-question.ts");
initTheme("dark", false);

function terminal() {
  return { columns: 100, rows: 40, kittyProtocolActive: false,
    start() {}, stop() {}, write() {}, moveBy() {}, hideCursor() {}, showCursor() {},
    clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
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
  test(`editor and questionnaire render, resize and accept input on ${Host.name}`, () => {
    const tui = new Host(terminal());
    const editor = new PolishedEditor(tui, {
      borderColor: (s) => theme.fg("border", s), selectList: getSelectListTheme(),
    }, new KeybindingsManager(), theme, () => "gpt-6  fast", () => "high");
    editor.setText("Please review this change");
    for (const width of [40, 100, 50]) {
      assert.match(bounded(editor.render(width), width), /Please review this change/);
      assert.match(bounded(editor.render(width), width), /gpt-6  fast/);
    }
    const question = { header: "Approach", question: "Which approach?", options: [
      { label: "First", description: "Keep existing behavior", preview: "## First preview\n\nPreserve behavior." },
      { label: "Second", description: "Try another approach", preview: "## Second preview\n\nAlternative behavior." },
    ] };
    let result;
    const session = new QuestionnaireSession({ tui, theme, params: { questions: [question] },
      itemsByTab: [buildItemsForQuestion(question)], done: (value) => { result = value; } });
    for (const width of [40, 120, 60]) {
      tui.terminal.columns = width;
      session.component.invalidate();
      assert.match(bounded(session.component.render(width), width), /Which approach/);
    }
    session.component.handleInput("\x1b[B");
    session.component.handleInput("\r");
    assert.ok(result, "Enter completes the single question");
    assert.equal(result.cancelled, false);
    assert.match(JSON.stringify(result), /Second/);
    tui.stop();
  });
}
