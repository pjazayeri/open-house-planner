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

/** Minimum centre-to-centre distance (px) before two bubbles are merged. */
export const CLUSTER_MERGE_PX = 44;

/**
 * Second pass: merge clusters whose pixel centroids are closer than
 * `minDist` (adjacent grid cells can each hold a bubble that half-covers
 * the other), then absorb unpinned singles that sit under a bubble.
 */
export function mergeNearby(
  points: ClusterPoint[],
  result: { clusters: Cluster[]; singles: string[] },
  minDist = CLUSTER_MERGE_PX,
): { clusters: Cluster[]; singles: string[] } {
  const byId = new Map(points.map((p) => [p.id, p]));
  const centroid = (ids: string[]) => {
    let x = 0, y = 0, n = 0;
    for (const id of ids) { const p = byId.get(id); if (p) { x += p.x; y += p.y; n++; } }
    return n ? { x: x / n, y: y / n } : { x: NaN, y: NaN };
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  let clusters = result.clusters.map((c) => ({ ...c, ids: [...c.ids] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (dist(centroid(clusters[i].ids), centroid(clusters[j].ids)) < minDist) {
          clusters[i] = { key: `${clusters[i].key}+${clusters[j].key}`, ids: [...clusters[i].ids, ...clusters[j].ids] };
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  const singles: string[] = [];
  for (const id of result.singles) {
    const p = byId.get(id);
    const host = p && !p.pinned ? clusters.find((c) => dist(centroid(c.ids), p) < minDist / 2) : undefined;
    if (host) host.ids.push(id); else singles.push(id);
  }
  clusters = clusters.filter((c) => c.ids.length >= 2);
  return { clusters, singles };
}
