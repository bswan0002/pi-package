/**
 * pi-diff — Shiki-powered terminal diff renderer for pi.
 *
 * @module pi-diff
 * @see https://github.com/buddingnewinsights/pi-diff
 *
 * Architecture (like OpenTUI / delta):
 *   1. Syntax-highlight full code blocks via Shiki → ANSI (fg-only codes)
 *   2. Layer diff background colors underneath (composites at cell level)
 *   3. For word-level changes, inject brighter bg at changed char positions
 *   4. Result: syntax fg + diff bg + word emphasis — all three visible together
 *
 * Views:
 *   • Split (side-by-side) — edit tool, auto-falls back to unified on narrow terminals
 *   • Unified (stacked)    — write tool overwrites
 *
 * Performance:
 *   • Singleton Shiki highlighter (managed by @shikijs/cli)
 *   • LRU memo cache per highlighted block
 *   • Large-diff fallback (skip highlighting, still show diff)
 *   • Async rendering with invalidate() for non-blocking preview
 */


import { existsSync, readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { loadPiPackageConfig } from "../shared/config";

import { codeToANSI } from "@shikijs/cli";
import * as Diff from "diff";
import type { BundledLanguage, BundledTheme } from "shiki";

// ---------------------------------------------------------------------------
// Diff Theme System — presets, auto-derive, and per-color overrides
//
// Resolution chain (per color, highest priority first):
//   1. Environment variable override (e.g. DIFF_BG_ADD="#1a3320")
//   2. piPackage.diff.colors.bgAdd from .pi/settings.json (explicit per-color hex)
//   3. piPackage.diff.theme preset value (named preset like "midnight")
//   4. Auto-derived from pi theme fg colors (default behavior)
//   5. Hardcoded fallback
// ---------------------------------------------------------------------------

/** Hex color palette for a diff theme preset. All values "#RRGGBB". */
interface DiffPreset {
	name: string;
	description: string;
	shikiTheme?: string;
	bgAdd?: string;
	bgDel?: string;
	bgAddHighlight?: string;
	bgDelHighlight?: string;
	bgGutterAdd?: string;
	bgGutterDel?: string;
	bgBase?: string;
	bgEmpty?: string;
	bgHunk?: string;
	fgAdd?: string;
	fgDel?: string;
	fgDim?: string;
	fgLnum?: string;
	fgRule?: string;
	fgHunk?: string;
	fgStripe?: string;
	fgSafeMuted?: string;
}

/** User diff config read from .pi/settings.json */
interface DiffUserConfig {
	theme?: string;
	colors?: Record<string, string>;
}

const DIFF_PRESETS: Record<string, DiffPreset> = {
	default: {
		name: "default",
		description: "Neutral full-block background with GitHub-like hunk and change tints",
		bgAdd: "#263a31",
		bgDel: "#462b2b",
		bgAddHighlight: "#2d5a41",
		bgDelHighlight: "#643434",
		bgGutterAdd: "#263f33",
		bgGutterDel: "#482f2f",
		bgBase: "#303030",
		bgEmpty: "#303030",
		bgHunk: "#1f314e",
		fgDim: "#8f8f8f",
		fgLnum: "#a0a0a0",
		fgRule: "#4a4a4a",
		fgHunk: "#9bbcff",
		fgStripe: "#303030",
		fgSafeMuted: "#b8c0ca",
	},
	midnight: {
		name: "midnight",
		description: "Subtle tints for pure black (#000000) terminal backgrounds",
		bgAdd: "#17251d",
		bgDel: "#2b1c1c",
		bgAddHighlight: "#254a33",
		bgDelHighlight: "#552c2c",
		bgGutterAdd: "#16291d",
		bgGutterDel: "#2a1818",
		bgBase: "#202020",
		bgEmpty: "#202020",
		bgHunk: "#182a45",
		fgDim: "#7a7a7a",
		fgLnum: "#8a8a8a",
		fgRule: "#383838",
		fgHunk: "#8fb0ee",
		fgStripe: "#202020",
		fgSafeMuted: "#aeb6c0",
	},
	subtle: {
		name: "subtle",
		description: "Minimal backgrounds — barely-there tints for a clean look",
		bgAdd: "#223027",
		bgDel: "#342424",
		bgAddHighlight: "#294f38",
		bgDelHighlight: "#543030",
		bgGutterAdd: "#223328",
		bgGutterDel: "#3a2828",
		bgBase: "#282828",
		bgEmpty: "#282828",
		bgHunk: "#1c2f4a",
		fgDim: "#808080",
		fgLnum: "#909090",
		fgRule: "#404040",
		fgHunk: "#93b3ef",
		fgStripe: "#282828",
		fgSafeMuted: "#aeb6c0",
	},
	neon: {
		name: "neon",
		description: "Higher contrast backgrounds for better visibility",
		bgAdd: "#274836",
		bgDel: "#583030",
		bgAddHighlight: "#35784f",
		bgDelHighlight: "#7a4141",
		bgGutterAdd: "#284935",
		bgGutterDel: "#553332",
		bgBase: "#303030",
		bgEmpty: "#303030",
		bgHunk: "#203b63",
		fgDim: "#9a9a9a",
		fgLnum: "#b0b0b0",
		fgRule: "#505050",
		fgHunk: "#a8c8ff",
		fgStripe: "#303030",
		fgSafeMuted: "#c5ccd6",
	},
};

/** Parse 24-bit ANSI color code → RGB. Works for both fg and bg escapes. */
function parseAnsiRgb(ansi: string): { r: number; g: number; b: number } | null {
	const esc = "\u001b";
	const m = ansi.match(new RegExp(`${esc}\\[(?:38|48);2;(\\d+);(\\d+);(\\d+)m`));
	return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

/** Convert "#RRGGBB" hex → ANSI 24-bit background escape. */
function hexToBgAnsi(hex: string): string {
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[48;2;${r};${g};${b}m`;
}

/** Convert "#RRGGBB" hex → ANSI 24-bit foreground escape. */
function hexToFgAnsi(hex: string): string {
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

/** Derive a muted background ANSI code from a foreground ANSI code.
 *  Scales the fg RGB by `intensity` (0.0–1.0) to produce a subtle tint. */
function deriveBgFromFg(fgAnsi: string, intensity: number): string {
	const rgb = parseAnsiRgb(fgAnsi);
	if (!rgb) return "";
	const r = Math.round(rgb.r * intensity);
	const g = Math.round(rgb.g * intensity);
	const b = Math.round(rgb.b * intensity);
	return `\x1b[48;2;${r};${g};${b}m`;
}

/** Mix an accent color into a base color at the given intensity (0.0–1.0).
 *  Returns an ANSI 24-bit background escape. Used to derive diff backgrounds
 *  that blend with the tool box background (toolSuccessBg). */
function mixBg(
	base: { r: number; g: number; b: number },
	accent: { r: number; g: number; b: number },
	intensity: number,
): string {
	const r = Math.round(base.r + (accent.r - base.r) * intensity);
	const g = Math.round(base.g + (accent.g - base.g) * intensity);
	const b = Math.round(base.b + (accent.b - base.b) * intensity);
	return `\x1b[48;2;${r};${g};${b}m`;
}

/** Whether auto-derive from theme is still pending (runs lazily on first render). */
let _autoDerivePending = true;

/** Whether user set explicit bg config (via preset or per-color overrides). */
let _hasExplicitBgConfig = false;

/** Auto-derive changed-line background colors from the pi theme's fg diff colors.
 *  Uses the neutral diff-block background as the mixing base so context,
 *  changed rows, and line-number cells read as one coherent tool surface. */
function autoDeriveBgFromTheme(theme: any): void {
	if (!theme?.getFgAnsi) return;
	try {
		const fgAdd = theme.getFgAnsi("toolDiffAdded");
		const fgDel = theme.getFgAnsi("toolDiffRemoved");
		const addRgb = parseAnsiRgb(fgAdd);
		const delRgb = parseAnsiRgb(fgDel);
		if (!addRgb || !delRgb) return;

		// Keep the whole diff block on a consistent neutral tool background,
		// then tint changed rows from that same base so context lines are not muted.
		let base = parseAnsiRgb(BG_BASE) ?? { r: 48, g: 48, b: 48 };
		if (theme.getBgAnsi && BG_BASE === BG_DEFAULT) {
			try {
				base = parseAnsiRgb(theme.getBgAnsi("toolSuccessBg")) ?? base;
			} catch {
				/* keep default base */
			}
		}

		// Line backgrounds — GitHub-like, clearly tinted but not saturated.
		BG_ADD = mixBg(base, addRgb, 0.16);
		BG_DEL = mixBg(base, delRgb, 0.18);

		// Word-level highlights — stronger patches inside changed rows.
		BG_ADD_W = mixBg(base, addRgb, 0.34);
		BG_DEL_W = mixBg(base, delRgb, 0.36);

		// Line-number cells match their changed row color; no separate gutter striping.
		BG_GUTTER_ADD = mixBg(base, addRgb, 0.2);
		BG_GUTTER_DEL = mixBg(base, delRgb, 0.22);
		BG_EMPTY = BG_BASE;
		BG_HUNK = mixBg(base, { r: 80, g: 135, b: 210 }, 0.24);

		// Rebuild derived constants
		DIVIDER = `${BG_BASE} ${RST}`;
	} catch {
		// Fall back to defaults silently
	}
}

/** Load diff theme config from shared piPackage settings. */
function loadDiffConfig(): DiffUserConfig {
	return loadPiPackageConfig().diff ?? {};
}

/** Apply diff palette from settings → preset → (auto-derive deferred) → defaults.
 *  Called once during extension initialization. */
function applyDiffPalette(): void {
	const config = loadDiffConfig();

	// Load preset if specified
	const preset = config.theme ? DIFF_PRESETS[config.theme] : null;
	if (preset) _hasExplicitBgConfig = true;

	// Per-color overrides from settings
	const ov = config.colors ?? {};
	if (Object.keys(ov).length > 0) _hasExplicitBgConfig = true;

	// Helper: apply a hex bg color if not env-overridden
	const applyBg = (envName: string | null, key: string, presetVal: string | undefined, set: (v: string) => void) => {
		if (envName && process.env[envName]) return; // env override wins
		const hex = ov[key] ?? presetVal;
		if (hex) {
			const a = hexToBgAnsi(hex);
			if (a) set(a);
		}
	};
	// Helper: apply a hex fg color if not env-overridden
	const applyFg = (envName: string | null, key: string, presetVal: string | undefined, set: (v: string) => void) => {
		if (envName && process.env[envName]) return;
		const hex = ov[key] ?? presetVal;
		if (hex) {
			const a = hexToFgAnsi(hex);
			if (a) set(a);
		}
	};

	// --- Apply backgrounds ---
	applyBg("DIFF_BG_ADD", "bgAdd", preset?.bgAdd, (v) => {
		BG_ADD = v;
	});
	applyBg("DIFF_BG_DEL", "bgDel", preset?.bgDel, (v) => {
		BG_DEL = v;
	});
	applyBg("DIFF_BG_ADD_HL", "bgAddHighlight", preset?.bgAddHighlight, (v) => {
		BG_ADD_W = v;
	});
	applyBg("DIFF_BG_DEL_HL", "bgDelHighlight", preset?.bgDelHighlight, (v) => {
		BG_DEL_W = v;
	});
	applyBg("DIFF_BG_GUTTER_ADD", "bgGutterAdd", preset?.bgGutterAdd, (v) => {
		BG_GUTTER_ADD = v;
	});
	applyBg("DIFF_BG_GUTTER_DEL", "bgGutterDel", preset?.bgGutterDel, (v) => {
		BG_GUTTER_DEL = v;
	});
	applyBg("DIFF_BG_BASE", "bgBase", preset?.bgBase, (v) => {
		BG_BASE = v;
	});
	applyBg(null, "bgEmpty", preset?.bgEmpty, (v) => {
		BG_EMPTY = v;
	});
	applyBg("DIFF_BG_HUNK", "bgHunk", preset?.bgHunk, (v) => {
		BG_HUNK = v;
	});

	// --- Apply foregrounds ---
	applyFg("DIFF_FG_ADD", "fgAdd", preset?.fgAdd, (v) => {
		FG_ADD = v;
	});
	applyFg("DIFF_FG_DEL", "fgDel", preset?.fgDel, (v) => {
		FG_DEL = v;
	});
	applyFg(null, "fgDim", preset?.fgDim, (v) => {
		FG_DIM = v;
	});
	applyFg(null, "fgLnum", preset?.fgLnum, (v) => {
		FG_LNUM = v;
	});
	applyFg(null, "fgRule", preset?.fgRule, (v) => {
		FG_RULE = v;
	});
	applyFg(null, "fgHunk", preset?.fgHunk, (v) => {
		FG_HUNK = v;
	});
	applyFg(null, "fgStripe", preset?.fgStripe, (v) => {
		FG_STRIPE = v;
	});
	applyFg(null, "fgSafeMuted", preset?.fgSafeMuted, (v) => {
		FG_SAFE_MUTED = v;
	});

	// --- Shiki syntax theme ---
	const shiki = ov.shikiTheme ?? preset?.shikiTheme;
	if (shiki) THEME = shiki as BundledTheme;

	// --- Rebuild derived constants ---
	DIVIDER = `${BG_BASE} ${RST}`;
	DEFAULT_DIFF_COLORS = { fgAdd: FG_ADD, fgDel: FG_DEL, fgCtx: FG_DIM };

	// If no explicit bg config, auto-derive will run on first render
	_autoDerivePending = !_hasExplicitBgConfig;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let THEME: BundledTheme = (process.env.DIFF_THEME as BundledTheme | undefined) ?? "dark-plus";

function envInt(name: string, fallback: number): number {
	const v = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Parse env hex color "#RRGGBB" → ANSI 24-bit fg/bg escape, or return fallback. */
function envFg(name: string, fallback: string): string {
	const hex = process.env[name];
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}
function envBg(name: string, fallback: string): string {
	const hex = process.env[name];
	if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[48;2;${r};${g};${b}m`;
}

// --- Split-view thresholds ---
// Split is preferred when there's real room. At narrow widths, a clean stacked
// (unified) view is better than a cramped split with wrapping.
const SPLIT_MIN_WIDTH = envInt("DIFF_SPLIT_MIN_WIDTH", 150); // need ≥150 cols for split to breathe
const SPLIT_MIN_CODE_WIDTH = envInt("DIFF_SPLIT_MIN_CODE_WIDTH", 60); // ≥60 code cols per side
const SPLIT_MAX_WRAP_RATIO = 0.2; // if >20% lines wrap in split, fall back to stacked
const SPLIT_MAX_WRAP_LINES = 8; // absolute cap before unified fallback

// --- Terminal bounds ---
const DEFAULT_TERM_WIDTH = 200; // safe default when terminal width is unavailable

// --- Rendering limits ---
const MAX_PREVIEW_LINES = 60; // was 50 — show slightly more context in edit preview
const MAX_RENDER_LINES = 150; // was 120 — show more of the diff in write tool
const MAX_HL_CHARS = 80_000; // was 50k — allow syntax hl for larger diffs
const CACHE_LIMIT = 192; // was 128 — bigger cache for multi-file sessions

// --- Word diff ---
const WORD_DIFF_MIN_SIM = 0.15; // was 0.2 — show word diffs for slightly less similar lines

// --- Wrapping ---
// Adaptive: narrow terminals wrap less, wide terminals wrap more.
// Override with DIFF_WRAP_ROWS for all widths, or DIFF_WRAP_ROWS_WIDE/MED/NARROW.
// Actual wrap rows are computed per-render via adaptiveWrapRows().
const MAX_WRAP_ROWS_WIDE = envInt("DIFF_WRAP_ROWS_WIDE", envInt("DIFF_WRAP_ROWS", 8)); // ≥180 cols
const MAX_WRAP_ROWS_MED = envInt("DIFF_WRAP_ROWS_MED", envInt("DIFF_WRAP_ROWS", 6)); // 120–179 cols
const MAX_WRAP_ROWS_NARROW = envInt("DIFF_WRAP_ROWS_NARROW", envInt("DIFF_WRAP_ROWS", 4)); // <120 cols

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------

let RST = "\x1b[0m";
const BOLD = "\x1b[1m";

// Diff backgrounds — opencode/GitHub-inspired: a full neutral tool block
// with clearly tinted changed rows. Override via env: DIFF_BG_ADD="#1a3320" etc.
let BG_ADD = envBg("DIFF_BG_ADD", "\x1b[48;2;38;58;49m");
let BG_DEL = envBg("DIFF_BG_DEL", "\x1b[48;2;70;43;43m");
let BG_ADD_W = envBg("DIFF_BG_ADD_HL", "\x1b[48;2;45;90;65m");
let BG_DEL_W = envBg("DIFF_BG_DEL_HL", "\x1b[48;2;100;52;52m");
let BG_GUTTER_ADD = envBg("DIFF_BG_GUTTER_ADD", "\x1b[48;2;38;63;51m");
let BG_GUTTER_DEL = envBg("DIFF_BG_GUTTER_DEL", "\x1b[48;2;72;47;47m");
let BG_BASE = envBg("DIFF_BG_BASE", "\x1b[48;2;48;48;48m");
let BG_EMPTY = BG_BASE;
let BG_HUNK = envBg("DIFF_BG_HUNK", "\x1b[48;2;31;49;78m");

// Diff foregrounds — override via env: DIFF_FG_ADD="#50d264" etc.
let FG_ADD = envFg("DIFF_FG_ADD", "\x1b[38;2;100;200;130m");
let FG_DEL = envFg("DIFF_FG_DEL", "\x1b[38;2;235;110;110m");
let FG_DIM = "\x1b[38;2;143;143;143m";
let FG_LNUM = "\x1b[38;2;160;160;160m";
let FG_RULE = "\x1b[38;2;74;74;74m";
let FG_HUNK = "\x1b[38;2;155;188;255m";
let FG_SAFE_MUTED = "\x1b[38;2;184;192;202m";

let FG_STRIPE = "\x1b[38;2;48;48;48m"; // retained for settings compatibility; no hatch rendering

/** Fill empty split-side cells with the same neutral tool background. */
function emptyFill(w: number, _rowOffset: number): string {
	return BG_EMPTY + " ".repeat(w) + RST;
}

let DIVIDER = `${BG_BASE} ${RST}`;
const ESC_RE = "\u001b";
const ANSI_RE = new RegExp(`${ESC_RE}\\[[0-9;]*m`, "g");
const ANSI_CAPTURE_RE = new RegExp(`${ESC_RE}\\[([^m]*)m`, "g");
const ANSI_PARAM_CAPTURE_RE = new RegExp(`${ESC_RE}\\[([0-9;]*)m`, "g");
const BG_DEFAULT = "\x1b[49m"; // reset to terminal default background

// ---------------------------------------------------------------------------
// Theme-aware diff colors
// ---------------------------------------------------------------------------

/** Resolved ANSI colors for diff rendering — theme overrides hardcoded defaults. */
interface DiffColors {
	fgAdd: string;
	fgDel: string;
	fgCtx: string;
}

let DEFAULT_DIFF_COLORS: DiffColors = { fgAdd: FG_ADD, fgDel: FG_DEL, fgCtx: FG_DIM };

/** Resolve diff fg colors from theme (if available), falling back to hardcoded ANSI.
 *  On first call with a valid theme, auto-derives bg colors if no explicit config was set. */
function resolveDiffColors(theme?: any): DiffColors {
	// Auto-derive bg colors from theme on first render (if no explicit preset/overrides)
	if (_autoDerivePending && theme?.getFgAnsi) {
		autoDeriveBgFromTheme(theme);
		_autoDerivePending = false;
	}

	if (!theme?.getFgAnsi) return DEFAULT_DIFF_COLORS;
	try {
		const fgAdd = theme.getFgAnsi("toolDiffAdded") || FG_ADD;
		const fgDel = theme.getFgAnsi("toolDiffRemoved") || FG_DEL;
		const fgCtx = theme.getFgAnsi("toolDiffContext") || FG_DIM;
		return { fgAdd, fgDel, fgCtx };
	} catch {
		return DEFAULT_DIFF_COLORS;
	}
}

// ---------------------------------------------------------------------------
// Adaptive helpers
// ---------------------------------------------------------------------------

/** Returns max wrap rows based on current terminal width. Narrow = truncate, wide = allow wrapping. */
function adaptiveWrapRows(tw?: number): number {
	const w = tw ?? termW();
	if (w >= 180) return MAX_WRAP_ROWS_WIDE;
	if (w >= 120) return MAX_WRAP_ROWS_MED;
	return MAX_WRAP_ROWS_NARROW;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffLine {
	type: "add" | "del" | "ctx" | "sep";
	oldNum: number | null;
	newNum: number | null;
	content: string;
}

interface ParsedDiff {
	lines: DiffLine[];
	added: number;
	removed: number;
	chars: number;
	fullOldContent?: string;
	fullNewContent?: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function strip(s: string): string {
	return s.replace(ANSI_RE, "");
}

function tabs(s: string): string {
	return s.replace(/\t/g, "  ");
}

function termW(): number {
	// Try multiple sources — process.stdout.columns may be undefined in piped/subagent contexts.
	const raw =
		process.stdout.columns ||
		(process.stderr as any).columns ||
		Number.parseInt(process.env.COLUMNS ?? "", 10) ||
		DEFAULT_TERM_WIDTH;
	return Math.max(80, raw - 4); // -4 safety margin for pi TUI padding
}

function cellWidth(ch: string): number {
	const cp = ch.codePointAt(0) ?? 0;
	if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
	if (
		(cp >= 0x0300 && cp <= 0x036f) ||
		(cp >= 0xfe00 && cp <= 0xfe0f) ||
		(cp >= 0x1ab0 && cp <= 0x1aff) ||
		(cp >= 0x1dc0 && cp <= 0x1dff)
	)
		return 0;
	if (
		cp >= 0x1100 &&
		(cp <= 0x115f ||
			cp === 0x2329 ||
			cp === 0x232a ||
			(cp >= 0x2e80 && cp <= 0xa4cf) ||
			(cp >= 0xac00 && cp <= 0xd7a3) ||
			(cp >= 0xf900 && cp <= 0xfaff) ||
			(cp >= 0xfe10 && cp <= 0xfe19) ||
			(cp >= 0xfe30 && cp <= 0xfe6f) ||
			(cp >= 0x2600 && cp <= 0x27bf) ||
			(cp >= 0xff00 && cp <= 0xff60) ||
			(cp >= 0xffe0 && cp <= 0xffe6) ||
			(cp >= 0x1f300 && cp <= 0x1faff))
	)
		return 2;
	return 1;
}

function displayWidth(s: string): number {
	let w = 0;
	for (const ch of strip(s)) w += cellWidth(ch);
	return w;
}

/** Pad/truncate `s` to exactly `w` terminal cells. ANSI-aware. */
function fit(s: string, w: number): string {
	if (w <= 0) return "";
	const plainW = displayWidth(s);
	if (plainW <= w) return s + " ".repeat(w - plainW);
	// Truncated — show content + dim › indicator
	const showW = w > 2 ? w - 1 : w;
	let vis = 0,
		i = 0;
	while (i < s.length && vis < showW) {
		if (s[i] === "\x1b") {
			const e = s.indexOf("m", i);
			if (e !== -1) {
				i = e + 1;
				continue;
			}
		}
		const cp = s.codePointAt(i) ?? s.charCodeAt(i);
		const ch = String.fromCodePoint(cp);
		const cw = cellWidth(ch);
		if (vis + cw > showW) break;
		vis += cw;
		i += ch.length;
	}
	return w > 2 ? `${s.slice(0, i)}${RST}${FG_DIM}›${RST}` : `${s.slice(0, i)}${RST}`;
}

/** Fill a complete terminal-width row with `bg`, preserving it across ANSI resets in content. */
function bgLine(s: string, w = termW(), bg = BG_BASE): string {
	return bg + fit(s, w).replaceAll(RST, `${RST}${bg}`) + RST;
}

/** Extract last active fg + bg ANSI codes from a string. Used for wrapping continuations. */
function ansiState(s: string): string {
	let fg = "",
		bg = "";
	for (const match of s.matchAll(ANSI_CAPTURE_RE)) {
		const p = match[1] ?? "";
		const seq = match[0] ?? "";
		if (p === "0") {
			fg = "";
			bg = "";
		} else if (p === "39") {
			fg = "";
		} else if (p.startsWith("38;")) {
			fg = seq;
		} else if (p.startsWith("48;")) {
			bg = seq;
		}
	}
	return bg + fg;
}

function isLowContrastShikiFg(params: string): boolean {
	if (params === "30" || params === "90") return true;
	if (params === "38;5;0" || params === "38;5;8") return true;
	if (!params.startsWith("38;2;")) return false;
	const parts = params.split(";").map(Number);
	if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return false;
	const [, , r, g, b] = parts;
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance < 72;
}

function normalizeShikiContrast(ansi: string): string {
	return ansi.replace(ANSI_PARAM_CAPTURE_RE, (seq, params: string) =>
		isLowContrastShikiFg(params) ? FG_SAFE_MUTED : seq,
	);
}

/** Wrap ANSI-encoded string into rows of `w` visible chars. Max `maxRows` rows; last row truncates with ›. */
function wrapAnsi(s: string, w: number, maxRows = adaptiveWrapRows(), fillBg = ""): string[] {
	if (w <= 0) return [""];
	const plainW = displayWidth(s);
	if (plainW <= w) {
		const pad = w - plainW;
		return pad > 0 ? [s + fillBg + " ".repeat(pad) + (fillBg ? RST : "")] : [s];
	}

	const rows: string[] = [];
	let row = "",
		vis = 0,
		i = 0;
	let onLastRow = false;
	let effW = w;

	while (i < s.length) {
		// When we reach the last allowed row, reserve 1 char for › indicator
		if (!onLastRow && rows.length >= maxRows - 1) {
			onLastRow = true;
			effW = w > 2 ? w - 1 : w;
		}

		// Pass through ANSI escapes
		if (s[i] === "\x1b") {
			const end = s.indexOf("m", i);
			if (end !== -1) {
				row += s.slice(i, end + 1);
				i = end + 1;
				continue;
			}
		}

		const cp = s.codePointAt(i) ?? s.charCodeAt(i);
		const ch = String.fromCodePoint(cp);
		const chW = cellWidth(ch);

		// Row full
		if (vis + chW > effW && vis > 0) {
			if (onLastRow) {
				// Check if remaining string has visible chars
				let hasMore = false;
				for (let j = i; j < s.length; ) {
					if (s[j] === "\x1b") {
						const e2 = s.indexOf("m", j);
						if (e2 !== -1) {
							j = e2 + 1;
							continue;
						}
					}
					const cp2 = s.codePointAt(j) ?? s.charCodeAt(j);
					const ch2 = String.fromCodePoint(cp2);
					if (cellWidth(ch2) > 0) {
						hasMore = true;
						break;
					}
					j += ch2.length;
				}
				if (hasMore && w > 2) row += `${RST}${FG_DIM}›${RST}`;
				else row += fillBg + " ".repeat(Math.max(0, w - vis)) + RST;
				rows.push(row);
				return rows;
			}
			// Normal wrap — carry ANSI state forward
			const state = ansiState(row);
			rows.push(row + fillBg + " ".repeat(Math.max(0, w - vis)) + RST);
			row = state + fillBg;
			vis = 0;
			if (rows.length >= maxRows - 1) {
				onLastRow = true;
				effW = w > 2 ? w - 1 : w;
			}
		}

		row += ch;
		vis += chW;
		i += ch.length;
	}

	// Final row, padded
	if (row.length > 0 || rows.length === 0) {
		rows.push(row + fillBg + " ".repeat(Math.max(0, w - vis)) + RST);
	}
	return rows;
}

function lnum(n: number | null, w: number, fg = FG_LNUM, reset = RST): string {
	if (n === null) return " ".repeat(w);
	const v = String(n);
	return `${fg}${" ".repeat(Math.max(0, w - v.length))}${v}${reset}`;
}

function shortPath(cwd: string, home: string, p: string): string {
	if (!p) return "";
	const r = relative(cwd, p);
	if (!r.startsWith("..") && !r.startsWith("/")) return r;
	return p.replace(home, "~");
}

function summarize(a: number, d: number): string {
	if (a === 0 && d === 0) return `${FG_DIM}no changes${RST}`;
	return `${FG_ADD}+${a}${RST} ${FG_DEL}-${d}${RST}`;
}

function editSectionSeparator(_diffs: ParsedDiff[], width = termW()): string {
	return bgLine("", width, BG_HUNK);
}

/**
 * Decide whether split view is readable for the given terminal width.
 * Prefers split view — side-by-side is always easier to scan.
 * Falls back to unified only when code columns would be too cramped
 * or too many lines would wrap even with adaptive truncation.
 */
function shouldUseSplit(diff: ParsedDiff, tw: number, maxRows = MAX_PREVIEW_LINES): boolean {
	if (!diff.lines.length) return false;
	if (tw < SPLIT_MIN_WIDTH) return false;

	const nw = Math.max(2, String(Math.max(...diff.lines.map((l) => l.oldNum ?? l.newNum ?? 0), 0)).length);
	const half = Math.floor((tw - 1) / 2); // -1 for center divider
	const gw = nw + 3; // line number + sign + two-cell padding
	const cw = Math.max(12, half - gw);
	if (cw < SPLIT_MIN_CODE_WIDTH) return false;

	// Estimate how many lines would need wrapping at this code width
	const vis = diff.lines.slice(0, maxRows);
	let contentLines = 0;
	let wrapCandidates = 0;
	for (const l of vis) {
		if (l.type === "sep") continue;
		contentLines++;
		if (tabs(l.content).length > cw) wrapCandidates++;
	}
	if (contentLines === 0) return true;

	const wrapRatio = wrapCandidates / contentLines;
	if (wrapCandidates >= SPLIT_MAX_WRAP_LINES) return false;
	if (wrapRatio >= SPLIT_MAX_WRAP_RATIO) return false;
	return true;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXT_LANG: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	rb: "ruby",
	rs: "rust",
	go: "go",
	java: "java",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	swift: "swift",
	kt: "kotlin",
	html: "html",
	css: "css",
	scss: "scss",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	md: "markdown",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	lua: "lua",
	php: "php",
	dart: "dart",
	xml: "xml",
	graphql: "graphql",
	svelte: "svelte",
	vue: "vue",
};

function lang(fp: string): BundledLanguage | undefined {
	return EXT_LANG[extname(fp).slice(1).toLowerCase()];
}

// ---------------------------------------------------------------------------
// Shiki ANSI cache + pre-warm
// ---------------------------------------------------------------------------

// Pre-warm the Shiki singleton (loads WASM grammars + theme) so the first
// diff render doesn't pay the ~200-500ms startup cost.
codeToANSI("", "typescript", THEME).catch(() => {});

const _cache = new Map<string, string[]>();

function _touch(k: string, v: string[]): string[] {
	_cache.delete(k);
	_cache.set(k, v);
	while (_cache.size > CACHE_LIMIT) {
		const first = _cache.keys().next().value;
		if (first === undefined) break;
		_cache.delete(first);
	}
	return v;
}

async function hlBlock(code: string, language: BundledLanguage | undefined): Promise<string[]> {
	if (!code) return [""];
	if (!language || code.length > MAX_HL_CHARS) return code.split("\n");

	const k = `${THEME}\0${language}\0${code}`;
	const hit = _cache.get(k);
	if (hit) return _touch(k, hit);

	try {
		const ansi = normalizeShikiContrast(await codeToANSI(code, language, THEME));
		const out = (ansi.endsWith("\n") ? ansi.slice(0, -1) : ansi).split("\n");
		return _touch(k, out);
	} catch {
		return code.split("\n");
	}
}

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

function parseDiff(oldContent: string, newContent: string, ctx = 3, includeFullContent = false): ParsedDiff {
	const patch = Diff.structuredPatch("", "", oldContent, newContent, "", "", { context: ctx });
	const oldAll = oldContent.split("\n");
	const lines: DiffLine[] = [];
	let added = 0,
		removed = 0;

	for (let hi = 0; hi < patch.hunks.length; hi++) {
		if (hi > 0) {
			const prev = patch.hunks[hi - 1];
			const oldEnd = prev.oldStart + prev.oldLines;
			const newEnd = prev.newStart + prev.newLines;
			const gap = patch.hunks[hi].oldStart - oldEnd;
			// Tiny gaps are more distracting as a hunk separator than as real context.
			if (gap > 0 && gap <= 2) {
				for (let g = 0; g < gap; g++) {
					lines.push({ type: "ctx", oldNum: oldEnd + g, newNum: newEnd + g, content: oldAll[oldEnd - 1 + g] ?? "" });
				}
			} else {
				lines.push({ type: "sep", oldNum: null, newNum: gap > 0 ? gap : null, content: "" });
			}
		}
		const h = patch.hunks[hi];
		let oL = h.oldStart,
			nL = h.newStart;
		for (const raw of h.lines) {
			if (raw === "\\ No newline at end of file") continue;
			const ch = raw[0],
				text = raw.slice(1);
			if (ch === "+") {
				lines.push({ type: "add", oldNum: null, newNum: nL++, content: text });
				added++;
			} else if (ch === "-") {
				lines.push({ type: "del", oldNum: oL++, newNum: null, content: text });
				removed++;
			} else {
				lines.push({ type: "ctx", oldNum: oL++, newNum: nL++, content: text });
			}
		}
	}
	return {
		lines,
		added,
		removed,
		chars: oldContent.length + newContent.length,
		...(includeFullContent ? { fullOldContent: oldContent, fullNewContent: newContent } : {}),
	};
}

function offsetParsedDiff(diff: ParsedDiff, offset: number): ParsedDiff {
	if (offset <= 0) return diff;
	return {
		...diff,
		lines: diff.lines.map((line) => ({
			...line,
			oldNum: line.oldNum === null ? null : line.oldNum + offset,
			newNum: line.newNum === null ? null : line.newNum + offset,
		})),
	};
}

function lineOffsetAt(content: string, index: number): number {
	return index <= 0 ? 0 : content.slice(0, index).split("\n").length - 1;
}

function reconstructPreEditContent(content: string, operations: Array<{ oldText: string; newText: string }>): string {
	let out = content;
	for (let i = operations.length - 1; i >= 0; i--) {
		const { oldText, newText } = operations[i];
		if (!newText) continue;
		const index = out.indexOf(newText);
		if (index >= 0) out = out.slice(0, index) + oldText + out.slice(index + newText.length);
	}
	return out;
}

function readEditBaseContent(filePath: string, operations: Array<{ oldText: string; newText: string }>): string {
	let content = "";
	try {
		if (filePath && existsSync(filePath)) content = readFileSync(filePath, "utf-8");
	} catch {
		content = "";
	}

	// renderCall may re-run after the edit has executed (for example when ctrl+o
	// toggles expansion). In that case oldText no longer exists in the file, so
	// reconstruct the pre-edit content by reversing the submitted operations.
	const needsReconstruction = operations.some(
		(operation) => !content.includes(operation.oldText) && !!operation.newText && content.includes(operation.newText),
	);
	return needsReconstruction ? reconstructPreEditContent(content, operations) : content;
}

function applyEditOperations(
	content: string,
	operations: Array<{ oldText: string; newText: string }>,
): { content: string; applied: number } {
	let out = content;
	let searchStart = 0;
	let applied = 0;
	for (const operation of operations) {
		let index = out.indexOf(operation.oldText, searchStart);
		if (index < 0) index = out.indexOf(operation.oldText);
		if (index < 0) continue;
		out = out.slice(0, index) + operation.newText + out.slice(index + operation.oldText.length);
		searchStart = index + operation.newText.length;
		applied++;
	}
	return { content: out, applied };
}

function parseCombinedEditDiff(
	filePath: string,
	operations: Array<{ oldText: string; newText: string }>,
): ParsedDiff | null {
	if (!operations.length) return null;
	const oldContent = readEditBaseContent(filePath, operations);
	if (!oldContent) return null;
	const applied = applyEditOperations(oldContent, operations);
	if (applied.applied !== operations.length || applied.content === oldContent) return null;
	return parseDiff(oldContent, applied.content, 3, true);
}

function parseEditDiffs(filePath: string, operations: Array<{ oldText: string; newText: string }>): ParsedDiff[] {
	const oldContent = readEditBaseContent(filePath, operations);

	let searchStart = 0;
	return operations.map((operation) => {
		let index = oldContent.indexOf(operation.oldText, searchStart);
		if (index < 0) index = oldContent.indexOf(operation.oldText);
		if (index >= 0) searchStart = index + operation.oldText.length;
		return offsetParsedDiff(parseDiff(operation.oldText, operation.newText), index >= 0 ? lineOffsetAt(oldContent, index) : 0);
	});
}

function parseEditDiff(filePath: string, oldText: string, newText: string): ParsedDiff {
	return parseCombinedEditDiff(filePath, [{ oldText, newText }]) ?? parseDiff(oldText, newText);
}

// ---------------------------------------------------------------------------
// Word diff + bg injection
//
// Key insight: Shiki's codeToANSI only emits fg codes (\x1b[38;...m and
// \x1b[39m). It never sets backgrounds.  So we can layer a diff bg underneath
// and it persists through all fg switches.  For word-level emphasis we swap
// the bg to a brighter shade at changed character positions.
// ---------------------------------------------------------------------------

/**
 * Combined word diff analysis — single Diff.diffWords() call returns both
 * similarity score and character ranges for emphasis highlighting.
 * Replaces separate wordDiffRanges + wordDiffSimilarity (which called diffWords twice).
 */
function wordDiffAnalysis(
	a: string,
	b: string,
): {
	similarity: number;
	oldRanges: Array<[number, number]>;
	newRanges: Array<[number, number]>;
} {
	if (!a && !b) return { similarity: 1, oldRanges: [], newRanges: [] };
	const parts = Diff.diffWords(a, b);
	const oldRanges: Array<[number, number]> = [];
	const newRanges: Array<[number, number]> = [];
	let oPos = 0,
		nPos = 0,
		same = 0;
	for (const p of parts) {
		if (p.removed) {
			oldRanges.push([oPos, oPos + p.value.length]);
			oPos += p.value.length;
		} else if (p.added) {
			newRanges.push([nPos, nPos + p.value.length]);
			nPos += p.value.length;
		} else {
			const len = p.value.length;
			same += len;
			oPos += len;
			nPos += len;
		}
	}
	const maxLen = Math.max(a.length, b.length);
	return { similarity: maxLen > 0 ? same / maxLen : 1, oldRanges, newRanges };
}

/**
 * Inject diff background into Shiki ANSI output.
 * `baseBg` on unchanged spans, `hlBg` on changed character ranges.
 * Re-injects bg after any full reset (\x1b[0m).
 *
 * Uses sorted-range pointer scan instead of Set (avoids O(totalChars) Set creation).
 */
function injectBg(ansiLine: string, ranges: Array<[number, number]>, baseBg: string, hlBg: string): string {
	if (!ranges.length) return baseBg + ansiLine + RST;

	let out = baseBg;
	let vis = 0;
	let inHL = false;
	let ri = 0; // current range index
	let i = 0;

	while (i < ansiLine.length) {
		if (ansiLine[i] === "\x1b") {
			const m = ansiLine.indexOf("m", i);
			if (m !== -1) {
				const seq = ansiLine.slice(i, m + 1);
				out += seq;
				// Re-inject bg after full reset
				if (seq === "\x1b[0m") out += inHL ? hlBg : baseBg;
				i = m + 1;
				continue;
			}
		}
		// Advance past exhausted ranges
		while (ri < ranges.length && vis >= ranges[ri][1]) ri++;
		const want = ri < ranges.length && vis >= ranges[ri][0] && vis < ranges[ri][1];
		if (want !== inHL) {
			inHL = want;
			out += inHL ? hlBg : baseBg;
		}
		out += ansiLine[i];
		vis++;
		i++;
	}
	return out + RST;
}

/** Simple word diff (no syntax hl) — fallback when Shiki isn't available. */
function plainWordDiff(oldText: string, newText: string): { old: string; new: string } {
	const parts = Diff.diffWords(oldText, newText);
	let o = "",
		n = "";
	for (const p of parts) {
		if (p.removed) o += `${BG_DEL_W}${p.value}${RST}${BG_DEL}`;
		else if (p.added) n += `${BG_ADD_W}${p.value}${RST}${BG_ADD}`;
		else {
			o += p.value;
			n += p.value;
		}
	}
	return { old: o, new: n };
}

// ---------------------------------------------------------------------------
// Stacked (unified) view — clean single-column layout
//
// Modelled after Shiki diff/GitHub stacked view:
//   • Single line-number column (shows old num for del/ctx, new num for add)
//   • Compact line-number cells: "NNN-" or "NNN+" or "NNN "
//   • Full-width code — no side-by-side cramming
//   • Hunk separators as a plain blue band
//   • Paired del/add lines adjacent with word-level emphasis
// ---------------------------------------------------------------------------

async function renderUnified(
	diff: ParsedDiff,
	language: BundledLanguage | undefined,
	max = MAX_RENDER_LINES,
	dc: DiffColors = DEFAULT_DIFF_COLORS,
	width?: number,
): Promise<string> {
	if (!diff.lines.length) return "";

	const vis = diff.lines.slice(0, max);
	const tw = width ?? termW();
	const nw = Math.max(2, String(Math.max(...vis.map((l) => l.oldNum ?? l.newNum ?? 0), 0)).length);
	const gw = nw + 3; // line number + sign + two-cell padding
	const cw = Math.max(20, tw - gw);
	const hasFullContent = diff.fullOldContent !== undefined && diff.fullNewContent !== undefined;
	const hlChars = hasFullContent ? diff.fullOldContent!.length + diff.fullNewContent!.length : diff.chars;
	const canHL = hlChars <= MAX_HL_CHARS && vis.length <= MAX_RENDER_LINES;

	// Prefer full-file highlighting so visible hunks retain syntax state from omitted context.
	// Fall back to highlighting only visible rows for synthetic/large diffs.
	const oldSrc: string[] = [],
		newSrc: string[] = [];
	for (const l of vis) {
		if (l.type === "ctx" || l.type === "del") oldSrc.push(l.content);
		if (l.type === "ctx" || l.type === "add") newSrc.push(l.content);
	}
	const [oldHL, newHL] = canHL
		? await Promise.all([
				hlBlock(hasFullContent ? diff.fullOldContent! : oldSrc.join("\n"), language),
				hlBlock(hasFullContent ? diff.fullNewContent! : newSrc.join("\n"), language),
			])
		: [oldSrc, newSrc];
	const oldLineHL = (line: DiffLine, fallbackIndex: number) =>
		canHL && hasFullContent && line.oldNum !== null
			? (oldHL[line.oldNum - 1] ?? line.content)
			: (oldHL[fallbackIndex] ?? line.content);
	const newLineHL = (line: DiffLine, fallbackIndex: number) =>
		canHL && hasFullContent && line.newNum !== null
			? (newHL[line.newNum - 1] ?? line.content)
			: (newHL[fallbackIndex] ?? line.content);

	let oI = 0,
		nI = 0,
		idx = 0;
	const out: string[] = [];

	/** Emit a single stacked row with compact line numbers and no extra gutter rails. */
	function emitRow(
		num: number | null,
		sign: string,
		gutterBg: string,
		signFg: string,
		body: string,
		bodyBg = "",
	): void {
		const changedFg = sign === "-" ? dc.fgDel : sign === "+" ? dc.fgAdd : "";
		const numFg = changedFg || FG_LNUM;
		const padBg = bodyBg || BG_BASE;
		const gutter = `${gutterBg}${lnum(num, nw, numFg, "")}${signFg}${sign}${RST}${padBg}  ${RST}`;
		const contGutter = `${gutterBg}${" ".repeat(nw + 1)}${padBg}  ${RST}`;
		const rows = wrapAnsi(tabs(body), cw, adaptiveWrapRows(), bodyBg);
		out.push(`${gutter}${rows[0]}${RST}`);
		for (let r = 1; r < rows.length; r++) out.push(`${contGutter}${rows[r]}${RST}`);
	}

	while (idx < vis.length) {
		const l = vis[idx];

		// Hunk separator — collapsed context, highlighted with a plain blue band.
		if (l.type === "sep") {
			out.push(bgLine("", tw, BG_HUNK));
			idx++;
			continue;
		}

		// Context line — normal syntax color, not dimmed.
		if (l.type === "ctx") {
			const hl = newLineHL(l, nI);
			emitRow(l.newNum, " ", BG_BASE, dc.fgCtx, `${BG_BASE}${hl}`, BG_BASE);
			oI++;
			nI++;
			idx++;
			continue;
		}

		// Collect del/add blocks
		const dels: Array<{ l: DiffLine; hl: string }> = [];
		while (idx < vis.length && vis[idx].type === "del") {
			dels.push({ l: vis[idx], hl: oldLineHL(vis[idx], oI) });
			oI++;
			idx++;
		}
		const adds: Array<{ l: DiffLine; hl: string }> = [];
		while (idx < vis.length && vis[idx].type === "add") {
			adds.push({ l: vis[idx], hl: newLineHL(vis[idx], nI) });
			nI++;
			idx++;
		}

		// 1:1 paired → word diff emphasis
		const isPaired = dels.length === 1 && adds.length === 1;
		const wd = isPaired ? wordDiffAnalysis(dels[0].l.content, adds[0].l.content) : null;

		if (isPaired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && canHL) {
			const delBody = injectBg(dels[0].hl, wd.oldRanges, BG_DEL, BG_DEL_W);
			const addBody = injectBg(adds[0].hl, wd.newRanges, BG_ADD, BG_ADD_W);
			emitRow(dels[0].l.oldNum, "-", BG_GUTTER_DEL, `${dc.fgDel}${BOLD}`, delBody, BG_DEL);
			emitRow(adds[0].l.newNum, "+", BG_GUTTER_ADD, `${dc.fgAdd}${BOLD}`, addBody, BG_ADD);
			continue;
		}
		if (isPaired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && !canHL) {
			const pwd = plainWordDiff(dels[0].l.content, adds[0].l.content);
			emitRow(dels[0].l.oldNum, "-", BG_GUTTER_DEL, `${dc.fgDel}${BOLD}`, `${BG_DEL}${pwd.old}`, BG_DEL);
			emitRow(adds[0].l.newNum, "+", BG_GUTTER_ADD, `${dc.fgAdd}${BOLD}`, `${BG_ADD}${pwd.new}`, BG_ADD);
			continue;
		}

		// Multi-line blocks — syntax highlighted with diff bg
		for (const d of dels) {
			const body = canHL ? `${BG_DEL}${d.hl}` : `${BG_DEL}${d.l.content}`;
			emitRow(d.l.oldNum, "-", BG_GUTTER_DEL, `${dc.fgDel}${BOLD}`, body, BG_DEL);
		}
		for (const a of adds) {
			const body = canHL ? `${BG_ADD}${a.hl}` : `${BG_ADD}${a.l.content}`;
			emitRow(a.l.newNum, "+", BG_GUTTER_ADD, `${dc.fgAdd}${BOLD}`, body, BG_ADD);
		}
	}

	if (diff.lines.length > vis.length) {
		out.push(bgLine(`${FG_DIM}  … ${diff.lines.length - vis.length} more lines${RST}`));
	}
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Split view (auto-fallback to unified when narrow)
// ---------------------------------------------------------------------------

async function renderSplit(
	diff: ParsedDiff,
	language: BundledLanguage | undefined,
	max = MAX_PREVIEW_LINES,
	dc: DiffColors = DEFAULT_DIFF_COLORS,
	width?: number,
): Promise<string> {
	const tw = width ?? termW();
	if (!shouldUseSplit(diff, tw, max)) return renderUnified(diff, language, max, dc, tw);
	if (!diff.lines.length) return "";

	// Build rows
	type Row = { left: DiffLine | null; right: DiffLine | null };
	const rows: Row[] = [];
	let i = 0;
	while (i < diff.lines.length) {
		const l = diff.lines[i];
		if (l.type === "sep" || l.type === "ctx") {
			rows.push({ left: l, right: l });
			i++;
			continue;
		}
		const dels: DiffLine[] = [],
			adds: DiffLine[] = [];
		while (i < diff.lines.length && diff.lines[i].type === "del") {
			dels.push(diff.lines[i]);
			i++;
		}
		while (i < diff.lines.length && diff.lines[i].type === "add") {
			adds.push(diff.lines[i]);
			i++;
		}
		const n = Math.max(dels.length, adds.length);
		for (let j = 0; j < n; j++) rows.push({ left: dels[j] ?? null, right: adds[j] ?? null });
	}

	const vis = rows.slice(0, max);
	const leftPaneW = Math.floor((tw - 1) / 2); // -1 for center divider/gap
	const rightPaneW = tw - 1 - leftPaneW;
	const nw = Math.max(2, String(Math.max(...diff.lines.map((l) => l.oldNum ?? l.newNum ?? 0), 0)).length);
	const gw = nw + 3; // line number + sign + two-cell padding
	const leftCw = Math.max(12, leftPaneW - gw);
	const rightCw = Math.max(12, rightPaneW - gw);
	const hasFullContent = diff.fullOldContent !== undefined && diff.fullNewContent !== undefined;
	const hlChars = hasFullContent ? diff.fullOldContent!.length + diff.fullNewContent!.length : diff.chars;
	const canHL = hlChars <= MAX_HL_CHARS && vis.length * 2 <= MAX_RENDER_LINES * 2;

	// Prefer full-file highlighting so each side preserves syntax state across omitted hunks.
	const leftSrc: string[] = [],
		rightSrc: string[] = [];
	for (const r of vis) {
		if (r.left && r.left.type !== "sep") leftSrc.push(r.left.content);
		if (r.right && r.right.type !== "sep") rightSrc.push(r.right.content);
	}
	const [leftHL, rightHL] = canHL
		? await Promise.all([
				hlBlock(hasFullContent ? diff.fullOldContent! : leftSrc.join("\n"), language),
				hlBlock(hasFullContent ? diff.fullNewContent! : rightSrc.join("\n"), language),
			])
		: [leftSrc, rightSrc];
	const leftLineHL = (line: DiffLine, fallbackIndex: number) =>
		canHL && hasFullContent && line.oldNum !== null
			? (leftHL[line.oldNum - 1] ?? line.content)
			: (leftHL[fallbackIndex] ?? line.content);
	const rightLineHL = (line: DiffLine, fallbackIndex: number) =>
		canHL && hasFullContent && line.newNum !== null
			? (rightHL[line.newNum - 1] ?? line.content)
			: (rightHL[fallbackIndex] ?? line.content);

	let lI = 0,
		rI = 0;
	let fillerRow = 0; // retained as a stable filler-row offset

	// Returns { gutter, contGutter, body } for wrapping composition
	type HalfResult = { gutter: string; contGutter: string; bodyRows: string[] };

	function half_build(
		line: DiffLine | null,
		hl: string,
		ranges: Array<[number, number]> | null,
		side: "left" | "right",
		codeWidth: number,
	): HalfResult {
		// Empty filler — same neutral background as the rest of the tool block.
		if (!line) {
			const g = `${BG_EMPTY}${" ".repeat(nw + 3)}${RST}`;
			return { gutter: g, contGutter: g, bodyRows: [emptyFill(codeWidth, fillerRow)] };
		}
		// Hunk separator — blue band, matching GitHub's hunk styling.
		if (line.type === "sep") {
			const g = `${BG_HUNK}${" ".repeat(nw + 3)}${RST}`;
			return { gutter: g, contGutter: g, bodyRows: [`${BG_HUNK}${" ".repeat(codeWidth)}${RST}`] };
		}

		const isDel = line.type === "del",
			isAdd = line.type === "add";
		const gBg = isDel ? BG_GUTTER_DEL : isAdd ? BG_GUTTER_ADD : BG_BASE;
		const cBg = isDel ? BG_DEL : isAdd ? BG_ADD : BG_BASE;
		const sFg = isDel ? dc.fgDel : isAdd ? dc.fgAdd : dc.fgCtx;
		const sign = isDel ? "-" : isAdd ? "+" : " ";
		const num = isDel ? line.oldNum : isAdd ? line.newNum : side === "left" ? line.oldNum : line.newNum;

		const changedFg = isDel ? dc.fgDel : isAdd ? dc.fgAdd : "";
		const numFg = changedFg || FG_LNUM;

		let body: string;
		if (ranges && ranges.length > 0) {
			body = injectBg(hl, ranges, cBg, isDel ? BG_DEL_W : BG_ADD_W);
		} else if (isDel || isAdd) {
			body = `${cBg}${hl}`;
		} else {
			body = `${BG_BASE}${hl}`;
		}

		const gutter = `${gBg}${lnum(num, nw, numFg, "")}${sFg}${BOLD}${sign}${RST}${cBg}  ${RST}`;
		const contGutter = `${gBg}${" ".repeat(nw + 1)}${cBg}  ${RST}`;
		const bodyRows = wrapAnsi(tabs(body), codeWidth, adaptiveWrapRows(), cBg);
		return { gutter, contGutter, bodyRows };
	}

	const out: string[] = [];

	for (const r of vis) {
		const leftLine = r.left,
			rightLine = r.right;
		const paired = leftLine && rightLine && leftLine.type === "del" && rightLine.type === "add";
		const wd = paired ? wordDiffAnalysis(leftLine.content, rightLine.content) : null;

		let lResult: HalfResult, rResult: HalfResult;

		if (paired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && canHL) {
			const lhl = leftLineHL(leftLine, lI++);
			const rhl = rightLineHL(rightLine, rI++);
			lResult = half_build(leftLine, lhl, wd.oldRanges, "left", leftCw);
			rResult = half_build(rightLine, rhl, wd.newRanges, "right", rightCw);
		} else if (paired && wd && wd.similarity >= WORD_DIFF_MIN_SIM && !canHL) {
			const pwd = plainWordDiff(leftLine.content, rightLine.content);
			lI++;
			rI++;
			lResult = half_build(leftLine, pwd.old, null, "left", leftCw);
			rResult = half_build(rightLine, pwd.new, null, "right", rightCw);
		} else {
			const lhl = leftLine && leftLine.type !== "sep" ? leftLineHL(leftLine, lI++) : "";
			const rhl = rightLine && rightLine.type !== "sep" ? rightLineHL(rightLine, rI++) : "";
			lResult = half_build(leftLine, lhl, null, "left", leftCw);
			rResult = half_build(rightLine, rhl, null, "right", rightCw);
		}

		// Compose wrapped rows — pad shorter side with plain neutral continuation rows.
		const maxRows = Math.max(lResult.bodyRows.length, rResult.bodyRows.length);
		const leftIsEmpty = !r.left;
		const rightIsEmpty = !r.right;
		const centerGap = leftLine?.type === "sep" || rightLine?.type === "sep" ? `${BG_HUNK} ${RST}` : DIVIDER;
		for (let row = 0; row < maxRows; row++) {
			const lg = row === 0 ? lResult.gutter : lResult.contGutter;
			const rg = row === 0 ? rResult.gutter : rResult.contGutter;
			const lb =
				lResult.bodyRows[row] ?? (leftIsEmpty ? emptyFill(leftCw, fillerRow) : `${BG_EMPTY}${" ".repeat(leftCw)}${RST}`);
			const rb =
				rResult.bodyRows[row] ??
				(rightIsEmpty ? emptyFill(rightCw, fillerRow) : `${BG_EMPTY}${" ".repeat(rightCw)}${RST}`);
			out.push(`${lg}${lb}${centerGap}${rg}${rb}`);
			fillerRow++;
		}
	}

	if (rows.length > vis.length) {
		out.push(bgLine(`${FG_DIM}  … ${rows.length - vis.length} more lines${RST}`));
	}
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const __testing = {
	normalizeShikiContrast,
	parseCombinedEditDiff,
	parseDiff,
	renderSplit,
	renderUnified,
};

export default function diffRendererExtension(pi: any): void {
	// Apply diff theme palette from settings/presets before rendering
	applyDiffPalette();

	let createWriteTool: any, createEditTool: any, TextComponent: any;
	try {
		const sdk = require("@mariozechner/pi-coding-agent");
		createWriteTool = sdk.createWriteTool;
		createEditTool = sdk.createEditTool;
		TextComponent = require("@mariozechner/pi-tui").Text;
	} catch {
		return;
	}
	if (!createWriteTool || !createEditTool || !TextComponent) return;

	const cwd = process.cwd();
	const home = process.env.HOME ?? "";
	const sp = (p: string) => shortPath(cwd, home, p);

	function textComponentWithRenderWidth(ctx: any): any {
		const text = ctx.lastComponent ?? new TextComponent("", 0, 0);
		if (!text.__diffWidthPatched && typeof text.render === "function") {
			const originalRender = text.render.bind(text);
			text.render = (width: number) => {
				if (ctx.state._renderWidth !== width) {
					ctx.state._renderWidth = width;
					ctx.invalidate?.();
				}
				return originalRender(width);
			};
			text.__diffWidthPatched = true;
		}
		return text;
	}

	// =======================================================================
	// write
	// =======================================================================

	const origWrite = createWriteTool(cwd);

	pi.registerTool({
		...origWrite,
		name: "write",

		async execute(tid: string, params: any, sig: any, upd: any, ctx: any) {
			const fp = params.path ?? params.file_path ?? "";
			let old: string | null = null;
			try {
				if (fp && existsSync(fp)) old = readFileSync(fp, "utf-8");
			} catch {
				old = null;
			}

			const result = await origWrite.execute(tid, params, sig, upd, ctx);
			const content = params.content ?? "";

			// Store in details — the only custom field TUI preserves in renderResult
			if (old !== null && old !== content) {
				const diff = parseDiff(old, content, 3, true);
				const lg = lang(fp);
				(result as any).details = { _type: "diff", summary: summarize(diff.added, diff.removed), diff, language: lg };
			} else if (old === null) {
				const lineCount = content ? content.split("\n").length : 0;
				(result as any).details = { _type: "new", lines: lineCount, content: content ?? "", filePath: fp };
			} else if (old === content) {
				(result as any).details = { _type: "noChange" };
			}
			return result;
		},

		renderCall(args: any, theme: any, ctx: any) {
			const fp = args?.path ?? args?.file_path ?? "";
			const isNew = !fp || !existsSync(fp);
			const label = isNew ? "create" : "write";
			const text = ctx.lastComponent ?? new TextComponent("", 0, 0);
			const hdr = `${theme.fg("toolTitle", theme.bold(label))} ${theme.fg("accent", sp(fp))}`;

			// Streaming
			if (args?.content && !ctx.argsComplete) {
				const n = String(args.content).split("\n").length;
				text.setText(`${hdr}  ${theme.fg("muted", `(${n} lines…)`)}`);
				return text;
			}

			// New file preview with Shiki
			if (args?.content && ctx.argsComplete && isNew) {
				const previewKey = `create:${fp}:${String(args.content).length}`;
				if (ctx.state._previewKey !== previewKey) {
					ctx.state._previewKey = previewKey;
					ctx.state._previewText = hdr;
					const lg = lang(fp);
					hlBlock(args.content, lg)
						.then((lines: string[]) => {
							if (ctx.state._previewKey !== previewKey) return;
							const maxShow = ctx.expanded ? lines.length : 16;
							const preview = lines.slice(0, maxShow).join("\n");
							const rem = lines.length - maxShow;
							let out = `${hdr}\n\n${preview}`;
							if (rem > 0) out += `\n${theme.fg("muted", `… (${rem} more lines, ${lines.length} total)`)}`;
							ctx.state._previewText = out;
							ctx.invalidate();
						})
						.catch(() => {});
				}
				text.setText(ctx.state._previewText ?? hdr);
				return text;
			}

			text.setText(hdr);
			return text;
		},

		renderResult(result: any, _opt: any, theme: any, ctx: any) {
			const text = ctx.lastComponent ?? new TextComponent("", 0, 0);
			if (ctx.isError) {
				const e =
					result.content
						?.filter((c: any) => c.type === "text")
						.map((c: any) => c.text || "")
						.join("\n") ?? "Error";
				text.setText(`\n${theme.fg("error", e)}`);
				return text;
			}
			const d = result.details;
			if (d?._type === "diff") {
				const w = termW();
				const key = `wd:${w}:${d.summary}:${d.diff?.lines?.length ?? 0}:${d.language ?? ""}`;
				if (ctx.state._wdk !== key) {
					ctx.state._wdk = key;
					ctx.state._wdt = `  ${d.summary}\n${theme.fg("muted", "  rendering diff…")}`;
					const dc = resolveDiffColors(theme);
					renderSplit(d.diff, d.language, MAX_RENDER_LINES, dc)
						.then((rendered: string) => {
							if (ctx.state._wdk !== key) return;
							ctx.state._wdt = `  ${d.summary}\n${rendered}`;
							ctx.invalidate();
						})
						.catch(() => {
							if (ctx.state._wdk !== key) return;
							ctx.state._wdt = `  ${d.summary}`;
							ctx.invalidate();
						});
				}
				text.setText(ctx.state._wdt ?? `  ${d.summary}`);
				return text;
			}
			if (d?._type === "noChange") {
				text.setText(`  ${theme.fg("muted", "✓ no changes")}`);
				return text;
			}
			if (d?._type === "new") {
				const { lines: lineCount, content: rawContent, filePath: fp } = d;
				const pk = `nf:${fp}:${lineCount}`;
				if (ctx.state._nfk !== pk) {
					ctx.state._nfk = pk;
					ctx.state._nft = `  ${theme.fg("success", `✓ new file (${lineCount} lines)`)}`;
					const lg = lang(fp);
					if (rawContent) {
						hlBlock(rawContent, lg)
							.then((hlLines: string[]) => {
								if (ctx.state._nfk !== pk) return;
								const maxShow = ctx.expanded ? hlLines.length : 12;
								const preview = hlLines.slice(0, maxShow).join("\n");
								const rem = hlLines.length - maxShow;
								let out = `  ${theme.fg("success", `✓ new file (${lineCount} lines)`)}\n${preview}`;
								if (rem > 0) out += `\n${theme.fg("muted", `  … ${rem} more lines`)}`;
								ctx.state._nft = out;
								ctx.invalidate();
							})
							.catch(() => {});
					}
				}
				text.setText(ctx.state._nft ?? `  ${theme.fg("success", `✓ new file (${lineCount} lines)`)}`);
				return text;
			}
			text.setText(`  ${theme.fg("dim", String(result?.content?.[0]?.text ?? "written").slice(0, 120))}`);
			return text;
		},
	});

	// =======================================================================
	// edit
	// =======================================================================

	const origEdit = createEditTool(cwd);

	function getEditOperations(input: any): Array<{ oldText: string; newText: string }> {
		if (Array.isArray(input?.edits)) {
			return input.edits
				.map((edit: any) => ({
					oldText:
						typeof edit?.oldText === "string" ? edit.oldText : typeof edit?.old_text === "string" ? edit.old_text : "",
					newText:
						typeof edit?.newText === "string" ? edit.newText : typeof edit?.new_text === "string" ? edit.new_text : "",
				}))
				.filter((edit: { oldText: string; newText: string }) => edit.oldText && edit.oldText !== edit.newText);
		}

		const oldText =
			typeof input?.oldText === "string" ? input.oldText : typeof input?.old_text === "string" ? input.old_text : "";
		const newText =
			typeof input?.newText === "string" ? input.newText : typeof input?.new_text === "string" ? input.new_text : "";
		return oldText && oldText !== newText ? [{ oldText, newText }] : [];
	}

	function summarizeEditOperations(operations: Array<{ oldText: string; newText: string }>) {
		const diffs = operations.map((edit) => parseDiff(edit.oldText, edit.newText));
		const totalAdded = diffs.reduce((sum, diff) => sum + diff.added, 0);
		const totalRemoved = diffs.reduce((sum, diff) => sum + diff.removed, 0);
		return {
			diffs,
			totalAdded,
			totalRemoved,
			summary: summarize(totalAdded, totalRemoved),
		};
	}

	pi.registerTool({
		...origEdit,
		name: "edit",

		async execute(tid: string, params: any, sig: any, upd: any, ctx: any) {
			const fp = params.path ?? params.file_path ?? "";
			const operations = getEditOperations(params);
			const result = await origEdit.execute(tid, params, sig, upd, ctx);

			if (operations.length === 0) return result;

			const { diffs, summary } = summarizeEditOperations(operations);
			if (operations.length === 1) {
				let editLine = 0;
				try {
					if (fp && existsSync(fp)) {
						const f = readFileSync(fp, "utf-8");
						const idx = f.indexOf(operations[0].newText);
						if (idx >= 0) editLine = f.slice(0, idx).split("\n").length;
					}
				} catch {
					editLine = 0;
				}
				(result as any).details = { _type: "editInfo", summary, editLine };
				return result;
			}

			(result as any).details = {
				_type: "multiEditInfo",
				summary,
			};
			return result;
		},

		renderCall(args: any, theme: any, ctx: any) {
			const fp = args?.path ?? args?.file_path ?? "";
			const operations = getEditOperations(args);
			const text = textComponentWithRenderWidth(ctx);
			const renderWidth = ctx.state._renderWidth ?? termW();
			const hdr = `${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", sp(fp))}`;
			const blankLine = () => bgLine("", renderWidth);
			const headerLine = (suffix = "") => bgLine(` ${hdr}${suffix ? ` ${suffix}` : ""}`, renderWidth);
			const pendingSummary = operations.length > 0 ? summarizeEditOperations(operations).summary : "";
			const pendingHeader = `${blankLine()}\n${headerLine(pendingSummary)}\n${blankLine()}`;

			if (!(ctx.argsComplete && operations.length > 0)) {
				text.setText(pendingHeader);
				return text;
			}

			const pk = JSON.stringify({ fp, operations, w: renderWidth, expanded: ctx.expanded });
			if (ctx.state._pk !== pk) {
				ctx.state._pk = pk;
				ctx.state._pt = pendingHeader;
				const lg = lang(fp);
				const dc = resolveDiffColors(theme);

				const combinedDiff = parseCombinedEditDiff(fp, operations);
				if (combinedDiff) {
					const summary = summarize(combinedDiff.added, combinedDiff.removed);
					const previewLines = ctx.expanded ? MAX_RENDER_LINES : MAX_PREVIEW_LINES;
					renderSplit(combinedDiff, lg, previewLines, dc, renderWidth)
						.then((rendered) => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summary)}\n${blankLine()}\n${rendered}\n${blankLine()}`;
							ctx.invalidate();
						})
						.catch(() => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summary)}`;
							ctx.invalidate();
						});
				} else if (operations.length === 1) {
					const diff = parseEditDiff(fp, operations[0].oldText, operations[0].newText);
					const previewLines = ctx.expanded ? MAX_RENDER_LINES : MAX_PREVIEW_LINES;
					renderSplit(diff, lg, previewLines, dc, renderWidth)
						.then((rendered) => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summarize(diff.added, diff.removed))}\n${blankLine()}\n${rendered}\n${blankLine()}`;
							ctx.invalidate();
						})
						.catch(() => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summarize(diff.added, diff.removed))}`;
							ctx.invalidate();
						});
				} else {
					const diffs = parseEditDiffs(fp, operations);
					const summary = summarize(
						diffs.reduce((sum, diff) => sum + diff.added, 0),
						diffs.reduce((sum, diff) => sum + diff.removed, 0),
					);
					Promise.all(
						diffs.map((diff) =>
							renderSplit(diff, lg, MAX_PREVIEW_LINES, dc, renderWidth).catch(() => summarize(diff.added, diff.removed)),
						),
					)
						.then((sections) => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summary)}\n${blankLine()}\n${sections.join(`\n${editSectionSeparator(diffs, renderWidth)}\n`)}\n${blankLine()}`;
							ctx.invalidate();
						})
						.catch(() => {
							if (ctx.state._pk !== pk) return;
							ctx.state._pt = `${blankLine()}\n${headerLine(summary)}`;
							ctx.invalidate();
						});
				}
			}

			text.setText(ctx.state._pt ?? hdr);
			return text;
		},

		renderResult(result: any, _opt: any, theme: any, ctx: any) {
			const text = ctx.lastComponent ?? new TextComponent("", 0, 0);
			if (ctx.isError) {
				const e =
					result.content
						?.filter((c: any) => c.type === "text")
						.map((c: any) => c.text || "")
						.join("\n") ?? "Error";
				text.setText(`\n${theme.fg("error", e)}`);
				return text;
			}
			if (result.details?._type === "editInfo" || result.details?._type === "multiEditInfo") {
				text.setText("");
				return text;
			}
			text.setText(`  ${theme.fg("dim", String(result?.content?.[0]?.text ?? "edited").slice(0, 120))}`);
			return text;
		},
	});
}
