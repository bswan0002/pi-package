# post-edit

Runs project-configured commands after each agent response when files changed.

The extension is globally installable, but inactive unless the current project has:

```text
.pi/post-edit.json
```

## Example

```json
{
  "enabled": true,
  "maxRetries": 3,
  "jobs": [
    {
      "name": "format",
      "files": ["**/*.{ts,tsx,js,jsx,json,md}"],
      "command": "bun",
      "args": ["prettier", "--write", "{files}"],
      "mode": "files"
    },
    {
      "name": "typecheck",
      "files": ["**/*.{ts,tsx}"],
      "command": "bun",
      "args": ["tsc", "--noEmit"],
      "mode": "project"
    }
  ]
}
```

## Config

- `enabled` — optional, defaults to `true`.
- `maxRetries` — optional, defaults to `3`. This is retries after the first attempt.
- `ignore` — optional additional ignore globs. Common build/vendor folders are ignored by default.
- `jobs` — ordered list of jobs.

Job fields:

- `name` — display/event name.
- `files` — globs matched against changed project-relative paths. Defaults to `["**/*"]`.
- `command` — executable to run.
- `args` — argv array. Use `{files}` to expand matching changed files as separate args.
- `mode` — `"files"` or `"project"`. Defaults to `"files"`.
- `timeoutMs` — optional command timeout. Defaults to 120 seconds.
- `runIfNoFiles` — optional, defaults to `false`.

## Events

All events are scoped:

- `bswan0002:post-edit:started`
- `bswan0002:post-edit:job-started`
- `bswan0002:post-edit:job-finished`
- `bswan0002:post-edit:retry`
- `bswan0002:post-edit:failed`
- `bswan0002:post-edit:completed`
