# Package cleanup spec

Status: finalized from owner decisions on 2026-04-29.

## Goals

- Remove unnecessary `bswan0002` namespacing from user-facing extension concepts while keeping the package identity personal.
- Make screenshot picking fast to invoke via `/ss`.
- Make sounds configurable instead of hard-coded.
- Move extension configuration toward one shared package config.
- Update public README guidance so it no longer references local personal paths.
- Clearly describe the package as targeting the owner's macOS workflow, while acknowledging some pieces may work on Linux.
- Remove local smoke-test artifacts from the public package.

## Decisions

- Keep `@bswan0002/pi-package` as the package name because this is a personal package and `bswan0002` is the GitHub username.
- Rename user-facing extension commands/events/config keys and skill names as a breaking change. Do not keep `bswan0002-*` compatibility aliases.
- Use `/ss` as the screenshot picker command and `/ss-clear` as the staged-screenshot clear command.
- Add shared internal constants for cross-extension event names.
- Extract only config/constants where helpful; do not do a large screenshot-picker or diff modularization pass now.
- Use shared package config for screenshot picker, sounds, diff, and style.
- Move style config out of `zentui.json` and into shared package config.
- Put shared package config in pi settings, with global settings as the base and project settings as an override when present.
- Use explicit sounds config sections for pi core events vs extension bus events because they are subscribed via `pi.on` and `pi.events.on` respectively.
- Sounds should be config-driven, with no hidden hard-coded playback fallback. If no sounds config exists, bootstrap/generate global config containing the current useful defaults so users can see and edit it.
- README caveat should say the package targets macOS but may work on Linux.
- Add platform and per-extension external dependency matrices to the README.
- Remove `post-edit-smoke-test.txt`.
- Tests are not part of this spec.
- Existing README extension sort/order change is intentional; preserve it.

## Requirements

### 1. Naming cleanup

1. Keep `package.json` package identity as `@bswan0002/pi-package`.
2. Remove `bswan0002` prefixes from user-facing extension commands, config keys, widget IDs, event names, and documentation.
3. Use neutral extension-scoped names:
   - command: `/ss`
   - command: `/ss-clear`
   - event: `readonly-git-permissions:confirm-needed`
   - event: `post-edit:completed`
   - widget ID: `screenshot-picker:staged`
4. Make this a breaking rename. Do not register old `/bswan0002-*` command aliases. Do not emit/listen for old `bswan0002:*` event aliases. Do not support old `bswan0002-*` config keys.
5. Introduce shared constants for internal extension event names so producers and consumers do not duplicate event strings.
6. Update all root and extension READMEs, comments, config examples, and widget IDs to match the new names.
7. Rename skills to remove unnecessary `bswan0002` namespacing too. Skill names are user-facing through `/skill:<name>` commands and the available-skills prompt.
8. Keep only the package name namespaced as `@bswan0002/pi-package`.

### 2. Skill renames

1. Rename `skills/bswan0002-pr-review` to `skills/pr-review`.
2. Update that skill's frontmatter name from `bswan0002-pr-review` to `pr-review`.
3. Update internal docs/script references from `skills/bswan0002-pr-review/...` to `skills/pr-review/...`.
4. Rename `skills/bswan0002-qq` to `skills/qq`.
5. Update that skill's frontmatter name from `bswan0002-qq` to `qq`.
6. Ensure each skill name matches its parent directory, per Agent Skills rules.
7. Update root README skill entries to use the new names.
8. Do not keep duplicate old skill directories as aliases.

### 3. Shared package config

1. Add a shared config loader for this package.
2. Load config from:
   1. global `~/.pi/agent/settings.json`
   2. project `.pi/settings.json`, when present, as an override
3. Do not use extension-specific standalone config files for screenshot picker, diff, sounds, or style after this cleanup.
4. Remove style's dependency on `getAgentDir()/zentui.json`.
5. Do not create project `.pi/settings.json` automatically.
6. If config is missing, extensions should use built-in defaults, except sounds, which has explicit bootstrap behavior below.
7. Prefer a single top-level key in settings JSON:

```json
{
  "piPackage": {
    "screenshotPicker": {
      "sources": ["~/Pictures/Screenshots"]
    },
    "sounds": {
      "piEvents": {
        "agent_end": "/System/Library/Sounds/Glass.aiff"
      },
      "extensionEvents": {
        "readonly-git-permissions:confirm-needed": "/System/Library/Sounds/Ping.aiff"
      }
    },
    "diff": {
      "theme": "midnight",
      "colors": {}
    },
    "style": {
      "icons": {},
      "colors": {}
    }
  }
}
```

8. Rename existing config concepts into the shared shape:
   - screenshot picker: old `bswan0002-screenshot-picker.sources` -> `piPackage.screenshotPicker.sources`
   - diff: old top-level `diffTheme` -> `piPackage.diff.theme`
   - diff: old top-level `diffColors` -> `piPackage.diff.colors`
   - style: old `zentui.json` content -> `piPackage.style`
   - sounds: use `piPackage.sounds`
9. Because this is intentionally breaking, do not add old-config compatibility aliases unless explicitly requested later.

### 4. Screenshot command

1. Register `/ss` as the primary screenshot-picker command.
2. Register `/ss-clear` to clear staged screenshots.
3. Remove old `/bswan0002-screenshot-picker` and `/bswan0002-screenshot-picker-clear` registrations.
4. Update all docs/comments to present `/ss` and `/ss-clear` as the only slash commands.
5. Keep `Ctrl+Shift+S` to open the picker.
6. Keep `Ctrl+Shift+X` to clear staged screenshots.
7. Read screenshot sources from `piPackage.screenshotPicker.sources`.
8. Rename screenshot widget ID from `bswan0002:screenshot-picker:staged` to `screenshot-picker:staged`.

### 5. Configurable sounds

1. Replace hard-coded sound subscriptions/paths in `extensions/sounds` with config-driven behavior.
2. Read sounds config from `piPackage.sounds` in the shared package config.
3. The config must explicitly separate pi core events from extension bus events.
4. Pi core events must be subscribed with `pi.on(...)`.
5. Extension events must be subscribed with `pi.events.on(...)`.
6. Sound paths must support absolute paths and `~` expansion.
7. Missing files, invalid JSON, invalid config entries, unsupported event names, or playback failures must fail silently or warn non-disruptively; they must not break agent execution.
8. Keep macOS `afplay` as the initial playback backend.
9. Document that sounds target macOS. Linux may be unsupported unless a later playback backend is added.
10. When no `piPackage.sounds` config exists in either global or project settings, generate/bootstrap this config into global `~/.pi/agent/settings.json` so users can edit or remove it. Avoid hidden hard-coded fallback playback after config loading.
11. Current default generated mappings:
    - pi event `agent_end` -> `/System/Library/Sounds/Glass.aiff`
    - extension event `readonly-git-permissions:confirm-needed` -> `/System/Library/Sounds/Ping.aiff`
12. Document the config schema in `extensions/sounds/README.md` and root `README.md`.

### 6. Event constants and limited extraction

1. Add a small shared constants module for event names, for example `extensions/shared/events.ts` or equivalent.
2. Use the shared event constants in:
   - `readonly-git-permissions`
   - `post-edit`
   - `sounds`
   - any README/config examples that should match emitted event names
3. Add/extract shared config loading helpers as needed.
4. Do not split up `screenshot-picker/index.ts` or `diff/index.ts` beyond config/constants extraction required by this spec.

### 7. Public README updates

1. Remove install examples that reference `/Users/ben/Dev/pi-package` or any other personal filesystem path.
2. Add a caveat near the top:
   - this is a personal package
   - it targets the owner's macOS workflow
   - some extensions may work on Linux, but Linux is not the primary target
3. Recommend copying/degit-ing the repository for anyone who wants to use or customize it.
4. Provide generic install examples, for example:

```bash
npx degit bswan0002/pi-package ~/Dev/pi-package
pi install ~/Dev/pi-package
```

5. Provide a one-run example using a generic local path:

```bash
pi -e ~/Dev/pi-package
```

6. Remove the old naming convention section that documents `bswan0002:<extension-name>:<event-name>`.
7. Replace it with a short note explaining:
   - the package name retains `bswan0002` because this is a personal package tied to the GitHub username
   - skill names, extension commands, events, and config keys should avoid unnecessary personal namespacing
8. Update the contents list so screenshot invocation references `/ss` and skills are listed as `pr-review` and `qq`.
9. Preserve the existing intentional README extension sort/order.
10. Document the shared config shape.
11. Add a short platform support matrix.
12. Add a per-extension external dependency matrix.

Suggested platform matrix:

| Area                                                       | macOS   | Linux          | Notes                                                                    |
| ---------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------ |
| Package target                                             | primary | may work       | Personal workflow targets macOS.                                         |
| screenshot-picker                                          | yes     | partial/yes    | Linux paths and `xdg-open` exist, thumbnail support depends on terminal. |
| sounds                                                     | yes     | no/unsupported | Uses `afplay`.                                                           |
| style/diff/post-edit/readonly-git-permissions/brave-search | yes     | likely         | Mostly Node/pi behavior; external tools may vary.                        |

Suggested dependency matrix:

| Extension                | Optional/required tools                                                           | Notes                                                           |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| brave-search             | `BRAVE_SEARCH_API_KEY`                                                            | Environment variable required to use the tool.                  |
| diff                     | Shiki dependencies from npm package                                               | No major system tool expected.                                  |
| post-edit                | project-configured commands                                                       | Runs whatever `.pi/post-edit.json` config asks for.             |
| readonly-git-permissions | `git`                                                                             | Intercepts `bash` git invocations.                              |
| screenshot-picker        | macOS `defaults`, macOS `open`, Linux `xdg-open`, terminal image protocol support | Image previews need Kitty/iTerm2/Ghostty/WezTerm-style support. |
| sounds                   | macOS `afplay`                                                                    | Configurable sounds are macOS-targeted.                         |
| style                    | `git`, optional `gh`                                                              | GitHub PR footer segment uses GitHub CLI when available.        |

### 8. Cleanup

1. Remove tracked local smoke-test artifact `post-edit-smoke-test.txt`.
2. Confirm `.pi/post-edit.json` remains untracked/local-only unless intentionally documented as a sample.

## Non-goals

- Do not rename the package away from `@bswan0002/pi-package`.
- Do not keep compatibility aliases for old commands/events/config keys.
- Do not do broad screenshot-picker or diff modularization.
- Do not add tests as part of this spec.
