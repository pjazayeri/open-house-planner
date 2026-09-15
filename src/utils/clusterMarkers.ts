/**
 * Screen-space grid clustering for map markers.
 *
 * Points are bucketed by a square grid in container pixels; any bucket with
 * two or more points becomes one cluster. `pinned` points (priority pins,
 * the selected/hovered listing) never cluster so they stay individually
 * tappable. Deterministic and dependency-free so it's trivially testable.
 */
export interface ClusterPoint {
  id: string;
  x: number;
  y: number;
  pinned?: boolean;
}

export interface Cluster {
  key: string;
  ids: string[];
}

export const CLUSTER_CELL_PX = 56;
/** Cluster only below this zoom; at street zoom pins are far enough apart. */
export const CLUSTER_MAX_ZOOM = 15;

export function clusterByGrid(points: ClusterPoint[], cell = CLUSTER_CELL_PX): { clusters: Cluster[]; singles: string[] } {
  const buckets = new Map<string, ClusterPoint[]>();
  const singles: string[] = [];
  for (const p of points) {
    if (p.pinned || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      singles.push(p.id);
      continue;
    }
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const b = buckets.get(key);
    if (b) b.push(p); else buckets.set(key, [p]);
  }
  const clusters: Cluster[] = [];
  for (const [key, pts] of buckets) {
    if (pts.length < 2) singles.push(pts[0].id);
    else clusters.push({ key, ids: pts.map((p) => p.id) });
  }
  return { clusters, singles };
}

/** "3–7" for a cluster of tour stops (min–max), or the single number. */
export function stopRangeLabel(stopNumbers: number[]): string {
  const nums = stopNumbers.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return "";
  const min = Math.min(...nums), max = Math.max(...nums);
  return min === max ? String(min) : `${min}–${max}`;
}
