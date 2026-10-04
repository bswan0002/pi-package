# sounds

Config-driven macOS sound notifications. Uses `afplay` and is macOS-targeted.

Config lives under `piPackage.sounds` in global `~/.pi/agent/settings.json`, with project `.pi/settings.json` overriding when present:

```json
{
  "piPackage": {
    "sounds": {
      "piEvents": {
        "agent_end": "/System/Library/Sounds/Glass.aiff"
      },
      "extensionEvents": {
        "post-edit:failed": "/System/Library/Sounds/Ping.aiff"
      }
    }
  }
}
```

Pi core events are subscribed with `pi.on`; extension bus events are subscribed with `pi.events.on`. Sound paths may be absolute or use `~`.

If no sounds config exists globally or in the project, the extension bootstraps an `agent_end` sound and an empty `extensionEvents` map into global settings so they are visible and editable. The `post-edit:failed` sound above is an optional customization.
