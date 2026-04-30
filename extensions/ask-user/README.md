# ask-user extension

Adds the interactive `ask_user` tool for explicit user decisions.

Use `ask_user` when intent is ambiguous, a choice is high-stakes, or several valid paths exist. Ask one focused question and include concise context from prior investigation.

## Parameters

| Name            | Type               | Notes                                                                  |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `question`      | string             | Required question to ask.                                              |
| `context`       | string             | Optional context shown with the question.                              |
| `options`       | array              | Strings or `{ title, description? }` choices. Omit for freeform input. |
| `allowMultiple` | boolean            | Multi-select choices. Default `false`.                                 |
| `allowFreeform` | boolean            | Include a custom answer option. Default `true`.                        |
| `allowComment`  | boolean            | Collect optional comment after selection. Default `false`.             |
| `displayMode`   | `overlay`/`inline` | Per-call UI mode.                                                      |
| `timeout`       | number             | Milliseconds before returning cancelled.                               |

## Result details

```ts
type AskResponse =
  | { kind: "selection"; selections: string[]; comment?: string }
  | { kind: "freeform"; text: string };

interface AskToolDetails {
  question: string;
  context?: string;
  options: QuestionOption[];
  response: AskResponse | null;
  cancelled: boolean;
}
```

## Display mode config

```json
{
  "piPackage": {
    "askUser": { "displayMode": "inline" }
  }
}
```

Order: per-call `displayMode`, `piPackage.askUser.displayMode`, `PI_ASK_USER_DISPLAY_MODE`, then `overlay`.

RPC falls back to dialog `select`/`input` methods when custom UI is unavailable. Print/JSON headless modes cannot prompt and return an error prompt for manual answer.
