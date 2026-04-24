# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for bswan0002 extensions and skills.

## Contents

### Extensions

- [`readonly-git-permissions`](./extensions/readonly-git-permissions) — blocks non-readonly git operations from the `bash` tool unless confirmed in the UI.
- [`sounds`](./extensions/sounds) — plays distinct macOS sounds on turn end and permission prompts.

### Skills

- Skills will live under [`skills/`](./skills).

## Install locally

From another project, install this package into pi settings with:

```bash
pi install /Users/benswanson/Dev/pi-setup
```

Or try it for one run without installing:

```bash
pi -e /Users/benswanson/Dev/pi-setup
```

## Event naming convention

Custom extension bus events are scoped as:

```text
bswan0002:<extension-name>:<event-name>
```

For example:

```text
bswan0002:readonly-git-permissions:confirm-needed
```
