import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type UsageWindow = {
  used_percent?: number | null;
  reset_after_seconds?: number | null;
  reset_at?: number | null;
};

export type RateLimitBucket = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: UsageWindow | null;
  secondary_window?: UsageWindow | null;
};

export type CodexUsageResponse = {
  rate_limit?: RateLimitBucket | null;
  additional_rate_limits?: Record<string, unknown> | unknown[] | null;
};

export type UsageSnapshot = {
  fiveHourLeftPercent: number | null;
  sevenDayLeftPercent: number | null;
  fiveHourResetInSeconds: number | null;
  sevenDayResetInSeconds: number | null;
  isLimited: boolean;
};

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
export const AUTH_FILE = join(AGENT_DIR, "auth.json");
export const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const SPARK_LIMIT_NAME = "GPT-5.3-Codex-Spark";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function usedToLeftPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return clampPercent(100 - value);
}

export function formatResetCountdown(seconds: number | null): string | null {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${secs}s`;
}

function formatResetClock(
  seconds: number | null,
  options?: { includeDate?: boolean },
): string | null {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const resetDate = new Date(Date.now() + Math.max(0, seconds) * 1000);
  const now = new Date();
  const time = resetDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!options?.includeDate && resetDate.toDateString() === now.toDateString()) return time;
  const weekday = resetDate.toLocaleDateString(undefined, { weekday: "short" });
  if (!options?.includeDate) return `${weekday} ${time}`;
  const date = resetDate.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return `${weekday} ${date} ${time}`;
}

function formatCompactReset(
  label: string,
  seconds: number | null,
  options?: { includeDate?: boolean },
): string | null {
  const countdown = formatResetCountdown(seconds);
  const clock = formatResetClock(seconds, options);
  return countdown && clock ? `${label} ↺ ${countdown} - ${clock}` : null;
}

export function readCodexAuth(): { accessToken: string; accountId: string } | undefined {
  try {
    const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Record<
      string,
      | {
          type?: string;
          access?: string | null;
          accountId?: string | null;
          account_id?: string | null;
        }
      | undefined
    >;
    const entry = auth["openai-codex"];
    if (entry?.type !== "oauth") return undefined;
    const accessToken = entry.access?.trim();
    const accountId = (entry.accountId ?? entry.account_id)?.trim();
    return accessToken && accountId ? { accessToken, accountId } : undefined;
  } catch {
    return undefined;
  }
}

export async function requestCodexUsage(
  signal?: AbortSignal,
): Promise<CodexUsageResponse | undefined> {
  const credentials = readCodexAuth();
  if (!credentials) return undefined;
  const response = await fetch(USAGE_URL, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${credentials.accessToken}`,
      "chatgpt-account-id": credentials.accountId,
    },
    signal,
  });
  if (!response.ok) throw new Error(`Codex usage request failed (${response.status})`);
  return (await response.json()) as CodexUsageResponse;
}

function normalizeRateLimitBucket(value: unknown): RateLimitBucket | null {
  const record = asObject(value);
  if (!record) return null;
  if (
    !(
      "primary_window" in record ||
      "secondary_window" in record ||
      "limit_reached" in record ||
      "allowed" in record
    )
  )
    return null;
  return record as RateLimitBucket;
}

function extractSparkRateLimitFromEntry(value: unknown): RateLimitBucket | null {
  const record = asObject(value);
  if (!record || record.limit_name !== SPARK_LIMIT_NAME) return null;
  return normalizeRateLimitBucket(record.rate_limit);
}

function findSparkRateLimitBucket(data: CodexUsageResponse): RateLimitBucket | null {
  const additional = data.additional_rate_limits;
  if (Array.isArray(additional)) {
    for (const entry of additional) {
      const bucket = extractSparkRateLimitFromEntry(entry);
      if (bucket) return bucket;
    }
  } else {
    const map = asObject(additional);
    if (map) {
      for (const value of Object.values(map)) {
        const bucket = extractSparkRateLimitFromEntry(value);
        if (bucket) return bucket;
      }
    }
  }
  return null;
}

function getResetSeconds(window: UsageWindow | null | undefined): number | null {
  if (typeof window?.reset_after_seconds === "number" && !Number.isNaN(window.reset_after_seconds))
    return window.reset_after_seconds;
  if (typeof window?.reset_at !== "number" || Number.isNaN(window.reset_at)) return null;
  const resetAtSeconds =
    window.reset_at > 100_000_000_000 ? window.reset_at / 1000 : window.reset_at;
  return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

export function parseUsageSnapshot(
  data: CodexUsageResponse,
  modelId: string | undefined,
): UsageSnapshot {
  const bucket =
    modelId === SPARK_MODEL_ID
      ? findSparkRateLimitBucket(data)
      : normalizeRateLimitBucket(data.rate_limit);
  return {
    fiveHourLeftPercent: usedToLeftPercent(bucket?.primary_window?.used_percent),
    sevenDayLeftPercent: usedToLeftPercent(bucket?.secondary_window?.used_percent),
    fiveHourResetInSeconds: getResetSeconds(bucket?.primary_window),
    sevenDayResetInSeconds: getResetSeconds(bucket?.secondary_window),
    isLimited: bucket?.limit_reached === true || bucket?.allowed === false,
  };
}

export function formatPercent(value: number | null): string {
  return typeof value === "number" && !Number.isNaN(value)
    ? `${Math.round(clampPercent(value))}%`
    : "--";
}

export function formatUsageSnapshot(
  snapshot: UsageSnapshot,
  options: { showResetTimes: boolean },
): string {
  const fiveHour = formatPercent(snapshot.fiveHourLeftPercent);
  const sevenDay = formatPercent(snapshot.sevenDayLeftPercent);
  const fiveHourReset = options.showResetTimes
    ? formatResetCountdown(snapshot.fiveHourResetInSeconds)
    : null;
  const sevenDayReset = options.showResetTimes
    ? formatResetCountdown(snapshot.sevenDayResetInSeconds)
    : null;
  const fiveHourText = `5h: ${fiveHour}${fiveHourReset ? ` ↺ ${fiveHourReset}` : ""}`;
  const sevenDayText = `7d: ${sevenDay}${sevenDayReset ? ` ↺ ${sevenDayReset}` : ""}`;
  return `${fiveHourText} | ${sevenDayText}`;
}
