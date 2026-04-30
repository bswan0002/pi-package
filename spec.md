# Spec: Port `rpiv-ask-user-question` into this pi package

## Goal

Port `temp/packages/rpiv-ask-user-question` into this package as a first-class extension named `ask-user-question`, preserving its user-facing behavior while matching this repo's structure and TypeScript style.

The result should add an `ask_user_question` tool that lets the model ask one or more structured clarifying questions with keyboard-driven TUI selection, previews, notes, custom text fallback, chat escape hatch, multi-select, and multi-question review/submit.

## Target location

Create a new extension directory:

```text
extensions/ask-user-question/
  index.ts
  ask-user-question.ts
  state/...
  tool/...
  view/...
  README.md
```

Do **not** create a separate nested package. This repo already exposes all extension subdirectories via `package.json`:

```json
"pi": { "extensions": ["./extensions"] }
```

## Source files to port

Copy/adapt these production modules from `temp/packages/rpiv-ask-user-question`:

```text
ask-user-question.ts
index.ts
state/build-questionnaire.ts
state/input-buffer.ts
state/key-router.ts
state/questionnaire-session.ts
state/row-intent.ts
state/selectors/contract.ts
state/selectors/derivations.ts
state/selectors/focus.ts
state/selectors/projections.ts
state/state-reducer.ts
state/state.ts
tool/format-answer.ts
tool/response-envelope.ts
tool/types.ts
tool/validate-questionnaire.ts
view/body-residual-spacer.ts
view/component-binding.ts
view/components/chat-row-view.ts
view/components/multi-select-view.ts
view/components/option-list-view.ts
view/components/preview/markdown-content-cache.ts
view/components/preview/preview-block-renderer.ts
view/components/preview/preview-box-renderer.ts
view/components/preview/preview-layout-decider.ts
view/components/preview/preview-pane.ts
view/components/submit-picker.ts
view/components/tab-bar.ts
view/components/wrapping-select.ts
view/dialog-builder.ts
view/props-adapter.ts
view/stateful-view.ts
view/tab-components.ts
view/tab-content-strategy.ts
```

Do **not** port temp package metadata, tests, screenshots, `test-fixtures.ts`, or npm publish manifest files. Do **not** add tests for this port at any point; verification is manual plus `npm run typecheck` only.

## Repo consistency requirements

1. **Imports**
   - Prefer this repo's existing style: extension-local relative imports without `.js` suffixes.
   - Existing package code imports schemas from `@mariozechner/pi-ai`; use that where practical:
     ```ts
     import { Type } from "@mariozechner/pi-ai";
     ```
   - Avoid adding a direct `typebox` dependency if a manual TypeScript interface is simple enough. In `tool/types.ts`, replace `Static<typeof ...>` types with explicit interfaces matching the schema.

2. **Dependencies**
   - The port uses `@mariozechner/pi-tui` heavily. Add it to `peerDependencies` and `devDependencies` in root `package.json` for correctness.
   - No config key is needed in `extensions/shared/config.ts`.

3. **Entrypoint**
   - `extensions/ask-user-question/index.ts` should export the default pi extension factory and call `registerAskUserQuestionTool(pi)`.
   - Keep the registered tool name exactly: `ask_user_question`.

4. **Docs**
   - Add `extensions/ask-user-question/README.md` summarizing behavior and key controls.
   - Update root `README.md` extension list with an `ask-user-question` bullet.

5. **Style**
   - Match current repo formatting: tabs, double quotes, semicolons, concise comments where helpful.
   - Keep the temp package's pure state/reducer/view-adapter separation; do not collapse the architecture into one giant component.

## Behavior to preserve

### Tool contract

Register a custom tool:

- `name`: `ask_user_question`
- `label`: `Ask User Question`
- parameters shape:
  ```ts
  {
    questions: Array<{
      question: string;
      header: string;              // max 12 chars
      options: Array<{
        label: string;             // max 60 chars
        description: string;
        preview?: string;
      }>;                          // 2-4 options
      multiSelect?: boolean;
    }>;                            // 1-4 questions
  }
  ```

Constants to preserve:

- `MAX_QUESTIONS = 4`
- `MIN_OPTIONS = 2`
- `MAX_OPTIONS = 4`
- `MAX_HEADER_LENGTH = 12`
- `MAX_LABEL_LENGTH = 60`

Runtime validation should return a normal tool result (not throw) for:

- no UI: `error: "no_ui"`
- no questions
- too many questions
- duplicate question text
- fewer than 2 options
- duplicate option labels within a question
- reserved labels: `"Other"`, `"Type something."`, `"Chat about this"`, `"Next"`

### Result/envelope behavior

Preserve `buildQuestionnaireResponse` behavior:

- Cancel/undefined result -> text: `User declined to answer questions`, `cancelled: true`.
- Success text format is a single-line envelope:
  ```text
  User has answered your questions: "<question>"="<answer>". You can now continue with the user's answers in mind.
  ```
- Multiple answers become multiple quoted segments inside the same envelope.
- Multi-select answers are comma-joined.
- Empty custom text renders as `(no input)`.
- Chat answer renders to the model as:
  ```text
  User wants to chat about this. Continue the conversation to help them decide.
  ```
- If an option with `preview` was selected, include `selected preview: <preview>` in the segment.
- If notes were entered, include `user notes: <notes>` and preserve notes in `details`.

### UI behavior

Preserve the temp package's TUI behavior:

- Single-select questions render numbered options.
- Single-select questions with no previews append `Type something.` as an inline custom text row.
- If any single-select option has a non-empty `preview`, suppress `Type something.` and use preview layout instead.
- Every question has a separate `Chat about this` row in the footer; choosing it ends the questionnaire with `kind: "chat"`.
- Multi-select questions render checkboxes, append a `Next`/`Submit` sentinel, and suppress custom text.
- Multi-question invocations show a tab bar and a final Submit tab.
- Submit tab reviews answered questions, warns about missing ones, and still allows partial submission.
- Previously answered single-select rows show `✔`; prior custom text is restored when returning to its tab.
- Multi-select toggles persist across tab switches.
- Preview pane supports side-by-side or stacked layout depending on terminal width.
- Preview content is markdown-rendered in a bordered box, with width-safe line output.
- Press `n` on a preview-bearing single-select option to add notes before confirming.

Key behavior to preserve:

- `↑`/`↓`: navigate options and chat row as one continuous cycle.
- `Enter`: confirm single-select/custom/chat; in multi-select, toggles regular option rows and commits only on `Next`/`Submit`.
- `Space`: toggles multi-select option rows; ignored on `Next`.
- `Tab`/`Right`: next tab in multi-question mode.
- `Shift+Tab`/`Left`: previous tab in multi-question mode.
- `Esc`: cancel questionnaire, or exit notes mode when notes editor is open.
- Printable text/backspace while on `Type something.` edits the inline input.

## Implementation notes

1. Start by copying the source tree into `extensions/ask-user-question`.
2. Strip `.js` from relative imports for repo consistency, or leave only if typecheck proves they are harmless; prefer consistency.
3. In `tool/types.ts`:
   - Replace `import { type Static, Type } from "typebox"` with `import { Type } from "@mariozechner/pi-ai"`.
   - Define `OptionData`, `QuestionData`, and `QuestionParams` as explicit interfaces matching the schemas.
4. Keep `QuestionnaireSession` as the only owner of mutable interaction state. State transitions should continue flowing through `routeKey` + `reduce` + effect execution + `QuestionnairePropsAdapter.apply`.
5. Keep line-width guards (`truncateToWidth`, `visibleWidth`, `wrapTextWithAnsi`) in view components. Pi TUI render methods must not emit visible lines wider than their `width` argument.
6. Verify all imports resolve under root `tsconfig.json`, whose include is currently `extensions/**/*.ts`.

## Files to update outside the new extension

- `package.json`
  - Add `@mariozechner/pi-tui` to `peerDependencies` and `devDependencies` if absent.
- `README.md`
  - Add the extension bullet.
  - Optionally mention no external system dependencies.

## Acceptance checklist

- `npm run typecheck` passes.
- Running pi with this package exposes the `ask_user_question` tool.
- A single-select question can be answered with an option.
- The `Type something.` row works for non-preview single-select questions.
- The chat row returns the chat continuation envelope.
- A multi-select question can toggle multiple options and submit via `Next`/`Submit`.
- A multi-question flow can tab through questions, review on Submit, and submit partial or complete answers.
- Previewed options render a markdown preview, suppress the custom text row, and support notes via `n`.
- Cancel/no-UI/error cases return structured tool results with `cancelled: true` rather than crashing.
