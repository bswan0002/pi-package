/**
 * Better OpenAI for pi.
 *
 * Enables OpenAI priority processing for allow-listed models. Codex requests use
 * a custom provider so the body and transport routing identity stay in sync.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_BASENAME, STATUS_KEY } from "./src/identity";
import { formatTokens, sanitizeStatusText, truncateToWidth, visibleWidth } from "./src/format";
import {
  DEFAULT_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  DEFAULT_SUPPORTED_MODELS,
  FOOTER_MODES,
  IMAGE_OUTPUT_FORMATS,
  IMAGE_SAVE_MODES,
  configPaths,
  type ResolvedConfig,
  type SupportedModel,
  isRecord,
  parseModelKey,
  normalizeModelKeys,
  parseModels,
  readRawConfig,
  resolveConfig,
  writeConfig,
} from "./src/config";
import {
  AUTH_FILE,
  type UsageSnapshot,
  formatPercent,
  formatResetCountdown,
  formatUsageSnapshot,
  parseUsageSnapshot,
  readCodexAuth,
  requestCodexUsage,
} from "./src/usage";
import { registerOpenAIImage, _imageTest } from "./src/image";
import { registerFastCodexProvider } from "./src/provider";
import { setBetterOpenAIState } from "../shared/better-openai-state";

const COMMAND = "fast";
const OPENAI_STATUS_COMMAND = "openai-usage";
const OPENAI_SETTINGS_COMMAND = "openai-settings";
const FLAG = "fast";
const SERVICE_TIER = "priority";
type SettingsPickerItem = {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];
  submenu?: (
    currentValue: string,
    done: (selectedValue?: string) => void,
  ) => { render(width: number): string[]; invalidate(): void; handleInput?(data: string): void };
};

function currentModelKey(ctx: ExtensionContext): string {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
}

function supportsFast(ctx: ExtensionContext, supportedModels: SupportedModel[]): boolean {
  const current = ctx.model;
  if (!current) return false;
  return supportedModels.some(
    (model) => model.provider === current.provider && model.id === current.id,
  );
}

function modelList(supportedModels: SupportedModel[]): string {
  return supportedModels.length > 0
    ? supportedModels.map((model) => `${model.provider}/${model.id}`).join(", ")
    : "none configured";
}

function stateText(
  ctx: ExtensionContext,
  desiredActive: boolean,
  active: boolean,
  supportedModels: SupportedModel[],
): string {
  const model = currentModelKey(ctx);
  if (active) return `Fast mode is on for ${model}.`;
  if (desiredActive) {
    return `Fast mode is requested, but inactive for unsupported model ${model}. Supported models: ${modelList(supportedModels)}.`;
  }
  return `Fast mode is off. Current model: ${model}.`;
}

function isOpenAISubscriptionModel(ctx: ExtensionContext, cfg: ResolvedConfig): boolean {
  if (!ctx.model || (ctx.model.provider !== "openai" && ctx.model.provider !== "openai-codex"))
    return false;
  return !cfg.usage.showOnlyOnSubscriptionModels || ctx.modelRegistry.isUsingOAuth(ctx.model);
}

export default function betterOpenAI(pi: ExtensionAPI): void {
  let desiredActive = false;
  let active = false;
  let cachedConfig: ResolvedConfig | undefined;
  let usageSnapshot: UsageSnapshot | undefined;
  let usageUpdatedAt: number | undefined;
  let usageError: string | undefined;
  let usageLastFetchAt: number | undefined;
  let usageTimer: ReturnType<typeof setInterval> | undefined;
  let footerTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let usageRefreshInFlight = false;
  let queuedUsageRefresh: { ctx: ExtensionContext; modelId?: string; notify?: boolean } | undefined;
  let shuttingDown = false;
  let usageAbortController: AbortController | undefined;
  let footerInstalled = false;
  let statusInstalled = false;
  let requestFooterRender: (() => void) | undefined;
  let lastInjectedAt: number | undefined;
  let lastInjectedModel: string | undefined;
  let lastInjectedTier: string | undefined;

  const fastCodexProvider = registerFastCodexProvider(pi, () => active);

  function refresh(ctx: ExtensionContext): ResolvedConfig {
    cachedConfig = resolveConfig(ctx.cwd || process.cwd());
    return cachedConfig;
  }

  function config(ctx: ExtensionContext): ResolvedConfig {
    return cachedConfig ?? refresh(ctx);
  }

  function persist(nextConfig: ResolvedConfig): void {
    cachedConfig = { ...nextConfig, active, desiredActive };
    if (!nextConfig.persistState) return;
    writeConfig(nextConfig.configPath, {
      ...readRawConfig(nextConfig.configPath),
      active,
      desiredActive,
    });
  }

  function applyDesiredFastState(ctx: ExtensionContext, cfg = config(ctx)): void {
    active = desiredActive && supportsFast(ctx, cfg.supportedModels);
  }

  function setActive(ctx: ExtensionContext, next: boolean): void {
    const nextConfig = refresh(ctx);
    const wasActive = active;
    desiredActive = next;
    applyDesiredFastState(ctx, nextConfig);
    if (active !== wasActive) fastCodexProvider.reset(ctx.sessionManager.getSessionId());
    persist(nextConfig);
    updateFooter(ctx);
    if (next && !active) {
      ctx.ui.notify(
        `Fast mode requested, but ${currentModelKey(ctx)} is unsupported. It will activate automatically when you switch to a supported model: ${modelList(nextConfig.supportedModels)}.`,
        "warning",
      );
      return;
    }
    ctx.ui.notify(stateText(ctx, desiredActive, active, nextConfig.supportedModels), "info");
  }

  async function refreshUsage(
    ctx: ExtensionContext,
    modelId = ctx.model?.id,
    options?: { notify?: boolean },
  ): Promise<void> {
    if (shuttingDown || !ctx.hasUI) return;
    if (usageRefreshInFlight) {
      queuedUsageRefresh = { ctx, modelId, notify: queuedUsageRefresh?.notify || options?.notify };
      return;
    }
    usageRefreshInFlight = true;
    const cfg = config(ctx);
    try {
      if (!cfg.usage.enabled) {
        usageSnapshot = undefined;
        usageError = "Usage display is disabled.";
        if (!shuttingDown) updateFooter(ctx);
        return;
      }
      if (!isOpenAISubscriptionModel(ctx, cfg)) {
        if (!shuttingDown) updateFooter(ctx);
        return;
      }
      usageAbortController = new AbortController();
      const timeoutSignal = AbortSignal.timeout(10_000);
      const signal = ctx.signal
        ? AbortSignal.any([ctx.signal, timeoutSignal, usageAbortController.signal])
        : AbortSignal.any([timeoutSignal, usageAbortController.signal]);
      const data = await requestCodexUsage(signal);
      usageLastFetchAt = Date.now();
      usageSnapshot = data ? parseUsageSnapshot(data, modelId) : undefined;
      usageUpdatedAt = usageSnapshot ? Date.now() : undefined;
      usageError = data ? undefined : `Missing openai-codex OAuth credentials in ${AUTH_FILE}.`;
      if (!shuttingDown) updateFooter(ctx);
      if (!shuttingDown && options?.notify)
        ctx.ui.notify(formatUsageStatus(ctx), usageSnapshot ? "info" : "warning");
    } catch (error) {
      if (shuttingDown) return;
      usageError = error instanceof Error ? error.message : String(error);
      updateFooter(ctx);
      if (options?.notify) ctx.ui.notify(formatUsageStatus(ctx), "warning");
    } finally {
      usageAbortController = undefined;
      usageRefreshInFlight = false;
      if (!shuttingDown && queuedUsageRefresh) {
        const next = queuedUsageRefresh;
        queuedUsageRefresh = undefined;
        void refreshUsage(next.ctx, next.modelId, { notify: next.notify });
      }
    }
  }

  function startUsageRefresh(ctx: ExtensionContext): void {
    if (usageTimer) clearInterval(usageTimer);
    const cfg = config(ctx);
    if (!cfg.usage.enabled) return;
    void refreshUsage(ctx);
    usageTimer = setInterval(() => void refreshUsage(ctx), cfg.usage.refreshIntervalMs);
    usageTimer.unref?.();
  }

  function refreshFooterTotals(ctx: ExtensionContext): void {
    footerTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "message" || entry.message.role !== "assistant") continue;
      footerTotals.input += entry.message.usage.input;
      footerTotals.output += entry.message.usage.output;
      footerTotals.cacheRead += entry.message.usage.cacheRead;
      footerTotals.cacheWrite += entry.message.usage.cacheWrite;
      footerTotals.cost += entry.message.usage.cost.total;
    }
  }

  function formatUsageDebug(ctx: ExtensionContext): string {
    const cfg = config(ctx);
    const auth = readCodexAuth();
    return [
      `Usage enabled: ${cfg.usage.enabled}`,
      `Current model: ${currentModelKey(ctx)}`,
      `Current model eligible: ${isOpenAISubscriptionModel(ctx, cfg)}`,
      `Requires subscription model: ${cfg.usage.showOnlyOnSubscriptionModels}`,
      `Auth: ${auth ? "found" : "missing"}`,
      `Account ID: ${auth?.accountId ?? "none"}`,
      `Last fetch: ${usageLastFetchAt ? new Date(usageLastFetchAt).toLocaleTimeString() : "never"}`,
      `Last successful update: ${usageUpdatedAt ? new Date(usageUpdatedAt).toLocaleTimeString() : "never"}`,
      `Last error: ${usageError ?? "none"}`,
      `Refresh interval: ${cfg.usage.refreshIntervalMs}ms`,
      `Endpoint: https://chatgpt.com/backend-api/wham/usage`,
    ].join("\n");
  }

  function formatUsageStatus(ctx: ExtensionContext): string {
    const cfg = config(ctx);
    if (!cfg.usage.enabled) return "Usage display is disabled.";
    if (!isOpenAISubscriptionModel(ctx, cfg))
      return "Usage hidden: current model is not an OpenAI subscription model.";
    if (!usageSnapshot) return `Usage unavailable${usageError ? `: ${usageError}` : "."}`;
    const stale =
      usageUpdatedAt && Date.now() - usageUpdatedAt > cfg.usage.refreshIntervalMs * 2
        ? ` | stale ${formatResetCountdown((Date.now() - usageUpdatedAt) / 1000)}`
        : "";
    return `${formatUsageSnapshot(usageSnapshot, cfg.usage)}${stale}`;
  }

  pi.registerFlag(FLAG, {
    description: "Start with OpenAI fast mode enabled (service_tier=priority)",
    type: "boolean",
    default: false,
  });

  function formatDebugStatus(ctx: ExtensionContext): string {
    const cfg = config(ctx);
    return [
      `Fast desired: ${desiredActive}`,
      `Fast active: ${active}`,
      `Current model: ${currentModelKey(ctx)}`,
      `Supported model: ${supportsFast(ctx, cfg.supportedModels)}`,
      `Configured service_tier: ${SERVICE_TIER}`,
      `Last injected: ${lastInjectedAt ? `${new Date(lastInjectedAt).toLocaleTimeString()} (${lastInjectedModel}, ${lastInjectedTier})` : "never"}`,
      `Footer mode: ${cfg.footer.mode}`,
      "",
      formatUsageDebug(ctx),
      "",
      `Image enabled: ${cfg.image.enabled}`,
      `Image default save: ${cfg.image.defaultSave}`,
      `Config: ${cfg.configPath}`,
    ].join("\n");
  }

  function formatOpenAIStatus(ctx: ExtensionContext): string {
    refresh(ctx);
    return formatUsageStatus(ctx);
  }

  pi.registerCommand(COMMAND, {
    description: "Toggle OpenAI fast mode",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) return setActive(ctx, !desiredActive);
      ctx.ui.notify("Usage: /fast", "error");
    },
  });

  pi.registerCommand(OPENAI_STATUS_COMMAND, {
    description: "Show OpenAI subscription usage status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatOpenAIStatus(ctx), "info");
    },
  });

  function textPanel(title: string, lines: string[], done: () => void) {
    return {
      render(width: number) {
        const clipped = lines.map((line) => truncateToWidth(line, width, "..."));
        return [title, "", ...clipped, "", "Esc/q to go back"];
      },
      invalidate() {},
      handleInput(data: string) {
        if (data.includes("\x1b") || data === "escape" || data === "q" || data === "\x03") done();
      },
    };
  }

  function buildSettingsItems(ctx: ExtensionContext, cfg: ResolvedConfig): SettingsPickerItem[] {
    return [
      {
        id: "fast.enabled",
        label: "Fast mode",
        currentValue: String(desiredActive),
        values: ["true", "false"],
        description: `Request OpenAI fast mode. Activates for supported models: ${modelList(cfg.supportedModels)}.`,
      },
      {
        id: "persistState",
        label: "Persist fast state",
        currentValue: String(cfg.persistState),
        values: ["true", "false"],
        description: "Remember fast-mode state across sessions.",
      },
      {
        id: "footer.mode",
        label: "Footer mode",
        currentValue: cfg.footer.mode,
        values: [...FOOTER_MODES],
        description:
          "status = add Better OpenAI usage/status below the existing footer, off = hide Better OpenAI footer/status and leave other footers untouched.",
      },
      {
        id: "usage.enabled",
        label: "Usage display",
        currentValue: String(cfg.usage.enabled),
        values: ["true", "false"],
        description: "Fetch and display OpenAI subscription usage windows.",
      },
      {
        id: "usage.refreshIntervalMs",
        label: "Usage refresh",
        currentValue: String(cfg.usage.refreshIntervalMs),
        values: ["15000", "30000", "60000", "120000", "300000", "600000"],
        description: "Usage refresh interval in milliseconds.",
      },
      {
        id: "usage.showOnlyOnSubscriptionModels",
        label: "Usage only on OAuth",
        currentValue: String(cfg.usage.showOnlyOnSubscriptionModels),
        values: ["true", "false"],
        description: "Only show usage when the current OpenAI model uses subscription/OAuth auth.",
      },
      {
        id: "usage.showResetTimes",
        label: "Usage reset times",
        currentValue: String(cfg.usage.showResetTimes),
        values: ["true", "false"],
        description: "Include compact reset countdowns and local reset times.",
      },
      {
        id: "image.enabled",
        label: "Image tool",
        currentValue: String(cfg.image.enabled),
        values: ["true", "false"],
        description: "Allow the openai_image tool to make image requests.",
      },
      {
        id: "image.defaultModel",
        label: "Image model",
        currentValue: cfg.image.defaultModel,
        values: ["gpt-5.5", "gpt-5.4", "gpt-5.2", "gpt-5"],
        description:
          "Mainline model used for image generation when current model is not openai-codex.",
      },
      {
        id: "image.defaultSave",
        label: "Image save",
        currentValue: cfg.image.defaultSave,
        values: [...IMAGE_SAVE_MODES],
        description: "Where generated images are saved by default.",
      },
      {
        id: "image.outputFormat",
        label: "Image format",
        currentValue: cfg.image.outputFormat,
        values: [...IMAGE_OUTPUT_FORMATS],
        description: "Generated image file format.",
      },
      {
        id: "image.timeoutMs",
        label: "Image timeout",
        currentValue: String(cfg.image.timeoutMs),
        values: ["30000", "60000", "120000", "180000", "300000"],
        description: "Image request timeout in milliseconds.",
      },
      {
        id: "debug",
        label: "Debug info",
        currentValue: "open",
        description: "Show Better OpenAI diagnostics.",
        submenu: (_value, done) =>
          textPanel("Debug info", formatDebugStatus(ctx).split("\n"), () => done()),
      },
      {
        id: "config.path",
        label: "Config path",
        currentValue: cfg.configPath,
        description: `Project: ${cfg.projectConfigPath}\nGlobal: ${cfg.globalConfigPath}`,
      },
      {
        id: "config.print",
        label: "Print config",
        currentValue: "open",
        description: "Show the selected raw config JSON.",
        submenu: (_value, done) =>
          textPanel(
            "Config",
            JSON.stringify(readRawConfig(cfg.configPath), null, 2).split("\n"),
            () => done(),
          ),
      },
    ];
  }

  function writeSetting(ctx: ExtensionContext, id: string, rawValue: string): void {
    const cfg = refresh(ctx);
    const current = readRawConfig(cfg.configPath);
    const bool = rawValue === "true";
    const num = Number(rawValue);
    if (id === "fast.enabled") {
      const wasActive = active;
      desiredActive = bool;
      applyDesiredFastState(ctx, cfg);
      if (active !== wasActive) fastCodexProvider.reset(ctx.sessionManager.getSessionId());
      if (cfg.persistState) {
        current.active = active;
        current.desiredActive = desiredActive;
      }
    } else if (id === "persistState") current.persistState = bool;
    else if (id.startsWith("usage.")) {
      const usage = isRecord(current.usage) ? current.usage : {};
      const key = id.slice("usage.".length);
      usage[key] = key === "refreshIntervalMs" ? num : bool;
      current.usage = usage;
    } else if (id === "footer.mode") {
      const footer = isRecord(current.footer) ? current.footer : {};
      footer.mode = rawValue;
      current.footer = footer;
    } else if (id.startsWith("image.")) {
      const image = isRecord(current.image) ? current.image : {};
      const key = id.slice("image.".length);
      image[key] =
        key === "timeoutMs"
          ? num
          : rawValue === "true"
            ? true
            : rawValue === "false"
              ? false
              : rawValue;
      current.image = image;
    }
    writeConfig(cfg.configPath, current);
    const next = refresh(ctx);
    if (id.startsWith("usage.")) {
      if (usageTimer) clearInterval(usageTimer);
      usageTimer = undefined;
      if (next.usage.enabled) startUsageRefresh(ctx);
      else {
        usageSnapshot = undefined;
        usageError = "Usage display is disabled.";
      }
    }
    updateFooter(ctx);
  }

  async function showSettingsPicker(ctx: ExtensionContext): Promise<void> {
    const [{ getSettingsListTheme }, { Container, SettingsList }] = await Promise.all([
      import("@earendil-works/pi-coding-agent"),
      import("@earendil-works/pi-tui"),
    ]);
    await ctx.ui.custom((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(
        new (class {
          render(_width: number) {
            const cfg = config(ctx);
            return [
              theme.fg("accent", theme.bold("Better OpenAI Settings")),
              theme.fg("dim", cfg.configPath),
              "",
            ];
          }
          invalidate() {}
        })(),
      );
      const settingsList = new SettingsList(
        buildSettingsItems(ctx, refresh(ctx)),
        13,
        getSettingsListTheme(),
        (id, newValue) => {
          writeSetting(ctx, id, newValue);
          settingsList.updateValue(
            id,
            buildSettingsItems(ctx, config(ctx)).find((item) => item.id === id)?.currentValue ??
              newValue,
          );
          tui.requestRender();
        },
        () => done(undefined),
        { enableSearch: true },
      );
      container.addChild(settingsList);
      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          settingsList.handleInput(data);
          tui.requestRender();
        },
      };
    });
  }

  pi.registerCommand(OPENAI_SETTINGS_COMMAND, {
    description: "Open Better OpenAI settings picker",
    handler: async (_args, ctx) => {
      await showSettingsPicker(ctx);
    },
  });

  registerOpenAIImage(pi, config);

  function installFooter(_ctx: ExtensionContext): void {
    // Intentionally disabled in this package: the style extension owns the footer.
    // Better OpenAI contributes via ctx.ui.setStatus(), which the style footer
    // renders on a dedicated row below the main footer.
  }

  function clearFooter(_ctx: ExtensionContext): void {
    footerInstalled = false;
    requestFooterRender = undefined;
  }

  function setStatus(ctx: ExtensionContext, text: string | undefined): void {
    if (!text && !statusInstalled) return;
    ctx.ui.setStatus(STATUS_KEY, text);
    statusInstalled = text !== undefined;
  }

  function updateFooter(ctx: ExtensionContext): void {
    const cfg = config(ctx);

    // Never install a replacement footer from this extension. The pi-package style
    // extension owns the footer and renders extension statuses on an extra row, so
    // old configs that requested "replace" are treated like "status" instead of
    // stomping the existing UI footer.
    clearFooter(ctx);

    if (cfg.footer.mode === "off") {
      setBetterOpenAIState({ fastLabel: undefined });
      setStatus(ctx, undefined);
      return;
    }

    const fast =
      active && supportsFast(ctx, cfg.supportedModels)
        ? `${ctx.model?.id ?? "model"} fast`
        : undefined;
    setBetterOpenAIState({ fastLabel: fast ? "fast" : undefined });

    const usage =
      usageSnapshot && cfg.usage.enabled && isOpenAISubscriptionModel(ctx, cfg)
        ? formatUsageSnapshot(usageSnapshot, cfg.usage)
        : undefined;
    setStatus(ctx, usage);
  }

  pi.on("session_start", (_event, ctx) => {
    const nextConfig = refresh(ctx);
    desiredActive = nextConfig.persistState ? nextConfig.desiredActive : false;
    if (pi.getFlag(FLAG) === true) desiredActive = true;
    applyDesiredFastState(ctx, nextConfig);
    if (desiredActive !== nextConfig.desiredActive || active !== nextConfig.active)
      persist(nextConfig);
    if (desiredActive && !active) {
      ctx.ui.notify(
        `Fast mode requested, but ${currentModelKey(ctx)} is unsupported. It will activate automatically when you switch to a supported model: ${modelList(nextConfig.supportedModels)}.`,
        "warning",
      );
    }
    refreshFooterTotals(ctx);
    updateFooter(ctx);
    startUsageRefresh(ctx);
    if (active)
      ctx.ui.notify(stateText(ctx, desiredActive, active, nextConfig.supportedModels), "info");
  });

  pi.on("turn_end", (_event, ctx) => {
    refreshFooterTotals(ctx);
    updateFooter(ctx);
    void refreshUsage(ctx);
  });

  pi.on("session_compact", (_event, ctx) => {
    refreshFooterTotals(ctx);
    updateFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    refreshFooterTotals(ctx);
    updateFooter(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    const cfg = config(ctx);
    const wasActive = active;
    applyDesiredFastState(ctx, cfg);
    if (active !== wasActive) {
      fastCodexProvider.reset(ctx.sessionManager.getSessionId());
      persist(cfg);
      ctx.ui.notify(
        active
          ? stateText(ctx, desiredActive, active, cfg.supportedModels)
          : `Fast mode inactive for unsupported model ${currentModelKey(ctx)}.`,
        active ? "info" : "warning",
      );
    }
    updateFooter(ctx);
    void refreshUsage(ctx, event.model.id);
  });

  pi.on("session_shutdown", () => {
    shuttingDown = true;
    queuedUsageRefresh = undefined;
    usageAbortController?.abort();
    usageAbortController = undefined;
    if (usageTimer) clearInterval(usageTimer);
    usageTimer = undefined;
  });

  pi.on("before_provider_request", (event, ctx) => {
    const nextConfig = config(ctx);
    if (!active || !supportsFast(ctx, nextConfig.supportedModels) || !isRecord(event.payload))
      return;
    lastInjectedAt = Date.now();
    lastInjectedModel = currentModelKey(ctx);
    lastInjectedTier = SERVICE_TIER;
    return { ...event.payload, service_tier: SERVICE_TIER };
  });
}

export const _test = {
  CONFIG_BASENAME,
  DEFAULT_SUPPORTED_MODELS,
  DEFAULT_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  SERVICE_TIER,
  configPaths,
  parseModelKey,
  normalizeModelKeys,
  parseModels,
  resolveConfig,
  readRawConfig,
  supportsFast,
  parseUsageSnapshot,
  formatPercent,
  formatUsageSnapshot,
  readCodexAuth,
  imageTest: _imageTest,
};
