// Distances in a local metric frame around Barcelona: good to a few cm inside the city.
export type LngLat = [number, number];

const KX = 111320 * Math.cos((41.39 * Math.PI) / 180);
const KY = 110540;

export const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);

export function distToLine(p: LngLat, line: LngLat[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][0] * KX, ay = line[i - 1][1] * KY;
    const dx = line[i][0] * KX - ax, dy = line[i][1] * KY - ay, l2 = dx * dx + dy * dy;
    const x = p[0] * KX - ax, y = p[1] * KY - ay;
    const t = l2 ? Math.max(0, Math.min(1, (x * dx + y * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - t * dx, y - t * dy));
  }
  return line.length === 1 ? dist(p, line[0]) : best;
}

export function midpoint(line: LngLat[]): LngLat {
  const seg = line.slice(1).map((q, i) => dist(line[i], q));
  let half = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) {
      const t = seg[i] ? half / seg[i] : 0;
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
    }
    half -= seg[i];
  }
  return line[line.length - 1];
}

export interface Candidate {
  kind: "bay" | "piece";
  id: string;
  st?: string;
  line: LngLat[];
}
export type Option<C extends Candidate = Candidate> = C & { d: number };

export const NEAR_M = 300;

// Moto bays first (the ordinance prefers them to any sidewalk), then allowed sidewalk pieces.
// Tiles split features and the pipeline splits curbs into pieces "<curb>-<n>": one option per curb and status.
export function rankNearby<C extends Candidate>(from: LngLat, cands: C[], maxBays = 4, maxPieces = 8): Option<C>[] {
  const best = new Map<string, Option<C>>();
  for (const c of cands) {
    if (c.kind === "piece" && c.st !== "paralelo" && c.st !== "semibateria") continue;
    const d = distToLine(from, c.line);
    if (d > NEAR_M) continue;
    const key = c.kind === "bay" ? `b:${c.id}` : `p:${c.id.replace(/-\d+$/, "")}:${c.st}`;
    const prev = best.get(key);
    if (!prev || d < prev.d) best.set(key, { ...c, d });
  }
  const all = [...best.values()].sort((a, b) => a.d - b.d);
  return [...all.filter((o) => o.kind === "bay").slice(0, maxBays), ...all.filter((o) => o.kind === "piece").slice(0, maxPieces)];
}
