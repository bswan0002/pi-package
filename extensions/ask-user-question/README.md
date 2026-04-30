# ask-user-question

Adds the `ask_user_question` tool for asking the user one or more structured clarifying questions in the pi TUI.

## Behavior

- Ask 1–4 questions, each with 2–4 options.
- Single-select questions render numbered options and, when no previews are present, a `Type something.` free-text row.
- Options may include markdown `preview` content; preview questions use a side-by-side or stacked preview pane and suppress the free-text row.
- Multi-select questions render checkboxes and commit with `Next` or `Submit`.
- Multi-question flows include tabs plus a final Submit review tab. Partial submission is allowed.
- Every question includes `Chat about this`, which exits the questionnaire and returns control to the conversation.

## Controls

- `↑` / `↓`: move through rows.
- `Enter`: select/confirm; in multi-select, toggles options and commits on `Next`/`Submit`.
- `Space`: toggle multi-select options.
- `Tab` / `Right`: next tab.
- `Shift+Tab` / `Left`: previous tab.
- `n`: add notes to a preview option before confirming.
- `Esc`: cancel, or leave notes mode.
