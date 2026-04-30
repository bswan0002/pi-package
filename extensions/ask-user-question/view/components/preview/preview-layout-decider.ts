/** Min terminal/pane width for the side-by-side layout to engage. */
export const PREVIEW_MIN_WIDTH = 100;
/** Visual gap between options column and preview column in side-by-side. */
export const PREVIEW_COLUMN_GAP = 2;
/** Max width of the options column when a side-by-side preview is shown. */
export const PREVIEW_LEFT_COLUMN_MAX_WIDTH = 40;
/** 1 col padding inside the preview column (between gap and `│`). */
export const PREVIEW_PADDING_LEFT = 1;
/** Empty rows between options and preview blocks in stacked (narrow) layout. */
export const STACKED_GAP_ROWS = 1;

export type PreviewLayoutMode = "side-by-side" | "stacked";

/**
 * Decide layout mode from terminal + pane widths. Pure of inputs.
 *
 * The terminal-width gate is the AND check from the previous `preview-pane.ts` —
 * lifted here so the decision is computed ONCE per render and threaded explicitly
 * through `previewBlockHeight`. Removes the bug class where `previewBlockHeight`
 * re-derived `sideBySide` from a column width (already < pane width post-split),
 * capping height too short.
 */
export function decideLayout(terminalWidth: number, paneWidth: number): PreviewLayoutMode {
	return terminalWidth >= PREVIEW_MIN_WIDTH && paneWidth >= PREVIEW_MIN_WIDTH ? "side-by-side" : "stacked";
}

/**
 * Width allocation for side-by-side mode:
 *   leftWidth  = min(PREVIEW_LEFT_COLUMN_MAX_WIDTH, paneWidth - gap - 1)
 *   rightWidth = remainder after left + gap
 * The `Math.max(1, ...)` calls keep both columns >= 1 col on extreme inputs.
 */
export function columnWidths(paneWidth: number): { leftWidth: number; rightWidth: number; gap: number } {
	const gap = PREVIEW_COLUMN_GAP;
	const leftWidth = Math.min(PREVIEW_LEFT_COLUMN_MAX_WIDTH, Math.max(1, paneWidth - gap - 1));
	const rightWidth = Math.max(1, paneWidth - leftWidth - gap);
	return { leftWidth, rightWidth, gap };
}

/**
 * Returns the widths actually passed to `options.render` and `previewLines` inside
 * `render()`. Stacked uses the full pane width for both; side-by-side splits via
 * `columnWidths`, with the preview column offset by `PREVIEW_PADDING_LEFT`.
 */
export function bodyWidths(paneWidth: number, mode: PreviewLayoutMode): { optionsWidth: number; previewWidth: number } {
	if (mode === "stacked") return { optionsWidth: paneWidth, previewWidth: paneWidth };
	const { leftWidth, rightWidth } = columnWidths(paneWidth);
	return { optionsWidth: leftWidth, previewWidth: Math.max(1, rightWidth - PREVIEW_PADDING_LEFT) };
}
