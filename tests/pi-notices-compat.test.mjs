import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

const allNotices = value => Object.fromEntries(["cacheMisses", "cacheWarming", "compactionCosts", "reasoningDrops"].map(key => [key, value]));
for (const value of [false, true]) {
  test(`Pi migrates legacy notices=${value} without changing explicit tool or model selections`, async t => {
    const root = await mkdtemp(join(tmpdir(), "pi-notices-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const agent = join(root, "agent");
    const cwd = join(root, "project");
    await mkdir(agent);
    await mkdir(join(cwd, ".pi"), { recursive: true });
    const path = join(agent, "settings.json");
    const original = { showCacheMissNotices: value, notices: { reasoningDrops: !value },
      defaultTools: ["read"], enabledModels: ["fixture/model"], cacheWarming: "off",
      unrelated: { preserved: true } };
    await writeFile(path, JSON.stringify(original));
    const projectPath = join(cwd, ".pi/settings.json");
    const project = JSON.stringify({ showCacheMissNotices: !value, notices: { compactionCosts: value } });
    await writeFile(projectPath, project);
    const settings = SettingsManager.create(cwd, agent, { projectTrusted: false });
    assert.deepEqual(settings.getNotices(), { ...allNotices(value), reasoningDrops: !value });
    assert.deepEqual(settings.getDefaultTools(), ["read"]);
    assert.deepEqual(settings.getEnabledModels(), ["fixture/model"]);
    assert.equal(settings.getCacheWarmingMode(), "off");
    assert.equal(settings.getShowCacheMissNotices, undefined);
    assert.equal(settings.setShowCacheMissNotices, undefined);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), original, "read migration does not rewrite the file");
    settings.setNotice("cacheMisses", !value);
    await settings.flush();
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.equal(saved.showCacheMissNotices, undefined);
    assert.deepEqual(saved.notices, { ...allNotices(value), reasoningDrops: !value, cacheMisses: !value });
    assert.deepEqual(saved.defaultTools, original.defaultTools);
    assert.deepEqual(saved.enabledModels, original.enabledModels);
    assert.deepEqual(saved.unrelated, original.unrelated);
    await settings.reload();
    assert.deepEqual(settings.getNotices(), saved.notices);
    settings.setProjectTrusted(true);
    assert.deepEqual(settings.getNotices(), { ...allNotices(!value), compactionCosts: value });
    assert.deepEqual(settings.getDefaultTools(), ["read"]);
    settings.setProjectTrusted(false);
    assert.deepEqual(settings.getNotices(), saved.notices);
    assert.equal(await readFile(projectPath, "utf8"), project, "project migration does not rewrite settings");
    assert.deepEqual(settings.drainErrors(), []);
  });
}
