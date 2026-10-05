// A trencadís of shards cut from a jittered grid, drawn once per size and theme.
export function drawTrencadis(cv: HTMLCanvasElement) {
  const box = cv.getBoundingClientRect();
  if (!box.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = box.width, h = box.height;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim();
  const pal = ["--rajola-blau", "--rajola-blau", "--rajola-groc", "--rajola-groc", "--rajola-groc", "--rajola-verd", "--rajola-verd",
    "--rajola-vermell", "--rajola-vermell", "--tile-mar", "--tile-mar", "--tessela", "--tessela"].map(v);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = v("--rajola-junta");
  g.fillRect(0, 0, w, h);
  const cell = Math.max(70, Math.min(w, h) / 4.6), cols = Math.ceil(w / cell) + 2, rows = Math.ceil(h / cell) + 2;
  const pts: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    pts[j] = [];
    for (let i = 0; i <= cols; i++) pts[j][i] = [(i - 1 + (rnd() - 0.5) * 0.7) * cell, (j - 1 + (rnd() - 0.5) * 0.7) * cell];
  }
  const shard = (tri: [number, number][]) => {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    g.beginPath();
    tri.forEach(([x, y], i) => {
      const k = Math.min(0.5, 7 / (Math.hypot(cx - x, cy - y) || 1));
      g[i ? "lineTo" : "moveTo"](x + (cx - x) * k, y + (cy - y) * k);
    });
    g.closePath();
    g.fillStyle = pal[Math.floor(rnd() * pal.length)];
    g.fill();
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
    if (rnd() < 0.5) { shard([a, b, c]); shard([a, c, d]); } else { shard([a, b, d]); shard([b, c, d]); }
  }
}
