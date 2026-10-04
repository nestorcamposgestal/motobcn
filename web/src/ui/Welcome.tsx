import { useEffect, useRef } from "react";

// The simple mark: chamfered octagon and scooter, from docs/design/assets/marca-simple.svg.
export function Mark({ fill, fg, bg, stroke = "none", sw = 0, className }: { fill: string; fg: string; bg: string; stroke?: string; sw?: number; className?: string }) {
  const h = sw / 2;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={`30,${h} 70,${h} ${100 - h},30 ${100 - h},70 70,${100 - h} 30,${100 - h} ${h},70 ${h},30`}
        style={{ fill, stroke }} strokeWidth={sw} strokeLinejoin="round" />
      <svg x="18" y="28.4" width="64" height="45" viewBox="358 340 316 222">
        <rect x="392" y="390" width="120" height="28" rx="14" style={{ fill: fg }} />
        <path d="M378 480 C 370 438 396 412 440 412 L 522 412 C 536 412 542 424 538 438 L 528 480 Z" style={{ fill: fg }} />
        <rect x="500" y="456" width="84" height="24" rx="12" style={{ fill: fg }} />
        <path d="M566 480 L 590 362 C 592 352 610 352 612 362 L 636 468 C 638 476 632 482 624 482 Z" style={{ fill: fg }} />
        <path d="M570 350 L 624 344" style={{ stroke: fg, fill: "none" }} strokeWidth="18" strokeLinecap="round" />
        {[414, 614].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="502" r="56" style={{ fill: bg }} />
            <circle cx={cx} cy="502" r="40" style={{ stroke: fg, fill: "none" }} strokeWidth="20" />
            <circle cx={cx} cy="502" r="10" style={{ fill: fg }} />
          </g>
        ))}
      </svg>
    </svg>
  );
}

// A trencadís of shards cut from a jittered grid, drawn once per size and theme.
function drawTrencadis(cv: HTMLCanvasElement) {
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

export function Welcome({ progress, theme, onEnter }: { progress: number; theme: string; onEnter: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const draw = () => cv.current && drawTrencadis(cv.current);
    // Next frame: the parent applies the theme attribute after this effect runs.
    const raf = requestAnimationFrame(draw);
    addEventListener("resize", draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", draw); };
  }, [theme]);
  useEffect(() => btn.current?.focus(), []);
  const pct = Math.round(progress * 100);
  return (
    <div className="absolute inset-0 z-50 flex flex-col min-[900px]:flex-row bg-pedra-50" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="relative flex-1 min-h-0 overflow-hidden bg-[var(--rajola-junta)]">
        <canvas ref={cv} className="absolute inset-0 w-full h-full" aria-hidden="true" />
        <Mark className="absolute left-1/2 top-1/2 w-[min(60%,300px)] max-h-[82%] aspect-square -translate-x-1/2 -translate-y-1/2"
          fill="var(--oct-fill)" stroke="var(--rajola-junta)" sw={4} fg="var(--mar)" bg="var(--oct-fill)" />
      </div>
      <div className="flex-none flex flex-col gap-2.5 px-6 pt-7 pb-[calc(24px+env(safe-area-inset-bottom,0px))] min-[900px]:w-[440px] min-[900px]:justify-center min-[900px]:p-12">
        <h1 id="welcome-title" className="m-0 font-display font-semibold text-[40px] leading-[44px] tracking-[-0.02em]">MotoBCN</h1>
        <p className="m-0 text-lg leading-[1.45] text-tinta-suau">Aparca la moto en Barcelona, sin dudas.</p>
        <div className="w-[120px] h-1.5 mt-2.5 mb-1.5 rounded-[3px] bg-linia overflow-hidden" role="progressbar" aria-label="Cargando el mapa"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className="block h-full bg-mar transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <button ref={btn} type="button" className="btn-primary" onClick={onEnter}>Entrar al mapa</button>
      </div>
    </div>
  );
}
