export type ScrollState = "top" | "up" | "down";

/** Ignore jitter smaller than this (px) so momentum wobble doesn't flicker the UI. */
const JITTER_PX = 6;
/** Treat anything this close to the top as "top". */
const TOP_PX = 8;

/**
 * Next scroll state for hide-on-scroll chrome (like iOS toolbars): "top" near
 * the top, "down" while scrolling down, "up" while scrolling up. Small deltas
 * keep the previous state.
 */
export function nextScrollState(prevTop: number, top: number, prev: ScrollState): ScrollState {
  if (top <= TOP_PX) return "top";
  const delta = top - prevTop;
  if (prev === "top") return delta >= 0 ? "down" : "up"; // just left the top: any move counts
  if (delta > JITTER_PX) return "down";
  if (delta < -JITTER_PX) return "up";
  return prev;
}
