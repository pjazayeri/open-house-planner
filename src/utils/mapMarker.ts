/**
 * Decides the number + appearance of a map marker for a planner listing.
 *
 * Background: priority listings used to override the marker number with
 * their priority rank (1, 2, …) instead of their global tour position.
 * That introduced numbering collisions — a priority "1" and a tour-stop
 * "1" could both render on the map. By default every marker shows its
 * global tour stop (`visitOrder`) so numbers are unique; priority is
 * conveyed by `isPriority` (color + ★ badge in the icon). The priority-
 * only view can opt back into showing the priority rank for visible
 * priority listings so the map matches the priority pane.
 */
export interface MarkerSpec {
  num: number;
  isPriority: boolean;
}

export function computeMarkerSpec(
  visitOrder: number | undefined,
  coordIdx: number,
  isPriority: boolean,
  priorityRank?: number,
  usePriorityRank = false
): MarkerSpec {
  if (usePriorityRank && isPriority && priorityRank) {
    return { num: priorityRank, isPriority };
  }
  // `coordIdx` is 0-based; `visitOrder` is 1-based. Fall back to
  // `coordIdx + 1` when visitOrder is missing so the marker is never "0".
  const num = visitOrder ?? coordIdx + 1;
  return { num, isPriority };
}
