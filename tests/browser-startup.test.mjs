import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const voiceOnly of [false, true]) {
  test(`cold browser loader starts with conversion installed (voiceOnly=${voiceOnly})`, async t => {
    const dir = await mkdtemp(join(tmpdir(), "browser-startup-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, "pi-browser.json"), JSON.stringify({ voiceOnly }));
    const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
      encoding: "utf8", timeout: 30_000,
      env: { ...process.env, PI_CODING_AGENT_DIR: dir, PI_BROWSER_CONFIG: join(dir, "pi-browser.json") },
      input: `
        import assert from 'node:assert/strict';
        import { dirname, join } from 'node:path';
        import { fileURLToPath } from 'node:url';
        import { registerHooks } from 'node:module';
        const loadedModules = [];
        registerHooks({ load(url, context, next) { loadedModules.push(url); return next(url, context); } });
        const sdk = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
        const { loadExtensions } = await import(join(sdk, 'core/extensions/loader.js'));
        const loaded = await loadExtensions([join(process.cwd(), 'extensions/browser/index.ts')], process.env.PI_CODING_AGENT_DIR);
        assert.deepEqual(loaded.errors, []);
        assert.equal(loaded.extensions.length, 1);
        assert.equal(loaded.extensions[0].commands.has('browser'), true);
        assert.equal(loaded.extensions[0].tools.has('browser'), ${!voiceOnly});
        assert.equal(loadedModules.some(url => url.endsWith('/pi-browser/dist/index.js')), false);
        if (${voiceOnly}) assert.equal(loadedModules.some(url => /browser-tool|browser-registration/.test(url)), false);
      `,
    });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
  });
}
