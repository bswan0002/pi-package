# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for bswan0002 extensions and skills.

## Contents

### Extensions

- [`readonly-git-permissions`](./extensions/readonly-git-permissions) — blocks non-readonly git operations from the `bash` tool unless confirmed in the UI.
- [`sounds`](./extensions/sounds) — plays distinct macOS sounds on agent end and permission prompts.
- [`post-edit`](./extensions/post-edit) — runs project-configured format/lint/typecheck commands after agent edits.

### Skills

- [`bswan0002-qq`](./skills/bswan0002-qq) — answers questions using only readonly project inspection.

## Install locally

From another project, install this package into pi settings with:

```bash
pi install /Users/benswanson/Dev/pi-package
```

Or try it for one run without installing:

```bash
pi -e /Users/benswanson/Dev/pi-package
```

## Naming convention

Skill names use the Agent Skills-compatible namespace prefix:

```text
bswan0002-<skill-name>
```

Custom extension bus events are scoped as:

```text
bswan0002:<extension-name>:<event-name>
```

For example:

```text
bswan0002:readonly-git-permissions:confirm-needed
```
