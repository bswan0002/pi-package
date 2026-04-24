# sounds

Plays macOS system sounds for selected pi events.

- Agent end: `/System/Library/Sounds/Glass.aiff`
- Permission prompt: `/System/Library/Sounds/Ping.aiff`

The permission prompt sound listens for the scoped event emitted by `readonly-git-permissions`:

```text
bswan0002:readonly-git-permissions:confirm-needed
```
