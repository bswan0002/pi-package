import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveDefaultBrowser } from "../node_modules/@howaboua/pi-browser/dist/src/browser/default-browser.js";

test("Linux browser start selects the desktop default and CDP_BROWSER overrides it without launching processes", { skip: process.platform !== "linux" }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "browser-default-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "applications"));
  const executable = join(dir, "fixture-browser");
  await writeFile(executable, "fixture only", { mode: 0o700 });
  await writeFile(join(dir, "applications/fixture.desktop"), `[Desktop Entry]\nType=Application\nExec=${executable} --profile-directory=Personal %U\n`);
  const env = { XDG_DATA_HOME: dir, XDG_DATA_DIRS: dir, PATH: dir };
  assert.deepEqual(await resolveDefaultBrowser("fixture.desktop", env), {
    executable, args: ["--profile-directory=Personal"], workingDirectory: undefined,
  });
  await assert.rejects(resolveDefaultBrowser("../fixture.desktop", env), /Could not determine/);
  await writeFile(join(dir, "applications/unsafe.desktop"), `[Desktop Entry]\nType=Application\nExec=${executable} ; touch forbidden\n`);
  await assert.rejects(resolveDefaultBrowser("unsafe.desktop", env), /unsupported desktop Exec quoting/);
  // Exercise the shipped start entrypoint with only process/CDP boundaries stubbed.
  // No systemd unit, real desktop process, or browser endpoint is contacted.
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    encoding: "utf8", timeout: 30_000, env: { ...process.env, ...env, DISPLAY: ":fixture", SSH_CONNECTION: "", BROWSER: "ignored-shell-browser" },
    input: `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      globalThis.launchCalls = [];
      registerHooks({ load(url, context, next) {
        if (url === 'node:child_process') return { format: 'module', shortCircuit: true, source: \`
          import { EventEmitter } from 'node:events';
          export function spawn(command, args, options) {
            globalThis.launchCalls.push({command, args, env: options.env});
            const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
            child.kill = () => {}; child.exitCode = null; child.signalCode = null;
            queueMicrotask(() => {
              const xdg = command === 'xdg-settings';
              const show = args.includes('show');
              child.stdout.emit('data', Buffer.from(xdg ? 'fixture.desktop' : show ? 'not-found' : ''));
              child.exitCode = command.includes('systemd-run') ? 1 : 0;
              child.emit('close', child.exitCode);
            });
            return child;
          }
        \` };
        if (url.endsWith('/cdp/discovery.js')) return { format: 'module', shortCircuit: true,
          source: 'export async function probeDebugPort() { throw new Error("fixture offline"); } export async function sleep() {}' };
        return next(url, context);
      }});
      const { startBrowser } = await import('./node_modules/@howaboua/pi-browser/dist/src/browser/launcher.js');
      for (const override of [undefined, '/fixture/explicit-browser']) {
        if (override) process.env.CDP_BROWSER = override; else delete process.env.CDP_BROWSER;
        process.env.CDP_SYSTEMCTL = '/fixture/systemctl'; process.env.CDP_SYSTEMD_RUN = '/fixture/systemd-run';
        globalThis.launchCalls = [];
        await assert.rejects(startBrowser(), /Could not launch the browser/);
        const queries = launchCalls.filter(c => c.command === 'xdg-settings');
        assert.equal(queries.length, override ? 0 : 1);
        if (!override) assert.equal(queries[0].env.BROWSER, undefined);
        const launches = launchCalls.filter(c => c.command === '/fixture/systemd-run');
        assert.equal(launches.length, 3);
        for (const { args } of launches) {
          assert.equal(args[args.indexOf('--') + 1], override ?? ${JSON.stringify(executable)});
          assert.ok(args.some(a => a.startsWith('--remote-debugging-address=')));
          assert.ok(args.some(a => a.startsWith('--remote-debugging-port=')));
          if (!override) assert.ok(args.includes('--profile-directory=Personal'));
        }
      }
    `,
  });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr + child.stdout);
});
