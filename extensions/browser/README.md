# Browser

Loads the pinned `@howaboua/pi-browser` extension. Remove any separately enabled
copy and the legacy `browser.toml` custom tool to avoid duplicate tools, run
`npm ci`, and restart Pi.

Requires Node.js 22.19 or newer and a Chrome-family browser with remote debugging
enabled at `chrome://inspect/#remote-debugging`. On macOS, start the browser
normally and enable remote debugging there; bundling does not change browser
settings or launch a browser.

The tool discovers CDP through `CDP_PORT`, port 9222, or `DevToolsActivePort`.
Set `CDP_PORT_FILE` for a non-standard port file. Use `/browser` to configure
optional SSH hosts; local browser use does not require SSH setup.

In ordinary Pi, call `browser` with `command: "help"` first. In Code/Notebook,
start with `await tools.browser("help")`, then pass JSON request strings.
The usual route is `tabs`, then `open`, then `click` or `type` using the returned
`ref_id` and element IDs. Screenshots return local file paths.

This controls browser tabs, not the whole desktop. Ask before consequential
external actions unless already authorized, and never close a shared browser
after a task.

See the [upstream documentation](https://github.com/IgorWarzocha/howaboua-pi-stuff/tree/main/packages/pi-browser)
for full action and remote-host details.
