// Direction A "Panot" of design/prototipo, ported to the vector tiles of the pipeline.
import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

export type Theme = "light" | "dark";
export type Filter = "todas" | "calzada" | "acera";

// Every colour of the map lives here, as chosen in the prototype.
export const PAL = {
  light: {
    bg: "#AEB3B6", walk: "#E8E3D9", tile: "#DCD5C8", curb: "#9A958C", plaza: "#ECE7DD", peat: "#E6DCC5", park: "#BCD0A0",
    green: "#A6C189", water: "#A5C8D4", zebra: "#F7F6F2", block: "#D8C6A8", facade: "#B39C78",
    tree: "#5F8740", treeA: 0.28, pit: "#8C8069", text: "#39342D", halo: "#EFEBE3",
    ok: "#1E8A4F", semi: "#0B6F8F", no: "#C9362C", nodata: "#8F8A82", bay: "#2344C4", bayEdge: "#FFFFFF", bayText: "#FFFFFF",
    sel: "#16140F", selHalo: "#FFFFFF",
    heat: ["rgba(255,214,77,0.40)", "rgba(245,150,40,0.58)", "rgba(215,58,34,0.70)", "rgba(165,24,24,0.80)"],
    edge: "#8F8A82",
  },
  dark: {
    bg: "#1B1E21", walk: "#2F2D29", tile: "#3A3732", curb: "#5A564F", plaza: "#33312C", peat: "#39342B", park: "#2F3D27",
    green: "#34462A", water: "#22404A", zebra: "#CFCBC3", block: "#473E32", facade: "#63574A",
    tree: "#6E9A4E", treeA: 0.26, pit: "#1E1C19", text: "#E6E0D5", halo: "#1B1E21",
    ok: "#4CC585", semi: "#3DB5DA", no: "#FF6B5E", nodata: "#7F7A71", bay: "#8398FF", bayEdge: "#1B1E21", bayText: "#0B1236",
    sel: "#FFFFFF", selHalo: "#000000",
    heat: ["rgba(255,214,77,0.35)", "rgba(245,150,40,0.55)", "rgba(255,90,60,0.68)", "rgba(255,60,50,0.80)"],
    edge: "#6F6A62",
  },
} as const;
export type Palette = (typeof PAL)[Theme];

// Widths in metres: MapLibre uses 512 px tiles, so one metre at zoom z is PPM0 * 2^z pixels here.
const PPM0 = 512 / (40075016.686 * Math.cos((41.396 * Math.PI) / 180));
const px = (m: number, z: number) => +(m * PPM0 * 2 ** z).toFixed(2);
const zx = (...s: unknown[]) => ["interpolate", ["exponential", 2], ["zoom"], ...s];
const zl = (...s: unknown[]) => ["interpolate", ["linear"], ["zoom"], ...s];
// Real size at high zoom, never thinner than floor pixels.
function metres(m: number, floor: number) {
  const z = Math.log2(floor / (m * PPM0));
  if (z >= 19.9) return floor;
  if (z <= 14) return zx(14, px(m, 14), 20, px(m, 20));
  return zx(14, floor, +z.toFixed(2), floor, 20, px(m, 20));
}
const FONT = { r: ["noto-sans-regular"], m: ["noto-sans-medium"] };
const SRC = "m";
const st = (...v: string[]) => ["in", ["get", "st"], ["literal", v]];
const idIs = (id: string | null) => ["==", ["get", "id"], id ?? ""];
// Pieces match on the feature id, line * 1000 + piece, because their id property is not always exact.
const pieceIs = (id: string | null) => {
  const [line, k] = (id ?? "-1-0").split("-").map(Number);
  return ["==", ["id"], line * 1000 + k];
};

export interface StyleState {
  theme: Theme;
  filter: Filter;
  risk: boolean;
  selPiece: string | null;
  selBay: string | null;
}

export function buildStyle(s: StyleState, base: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    sources: { [SRC]: { type: "vector", url: `pmtiles://${base}data/motobcn.pmtiles` } },
    layers: buildLayers(s) as LayerSpecification[],
  };
}

function buildLayers({ theme, filter, risk, selPiece, selBay }: StyleState) {
  const P = PAL[theme];
  const L: Record<string, unknown>[] = [];
  const vis = (on: boolean) => ({ visibility: on ? "visible" : "none" });
  const add = (layer: Record<string, unknown>, layer_: string, show = true) =>
    L.push({ source: SRC, "source-layer": layer_, ...layer, layout: { ...(layer.layout as object), ...vis(show) } });
  const pieces = filter !== "calzada";
  // EN CALZADA shows the roadway bays, ACERA the sidewalk pieces and the bays drawn on the sidewalk.
  const bayFilter = filter === "todas" ? ["literal", true] : ["==", ["get", "on"], filter];

  // Ground: the map background is the roadway, everything else sits on it.
  const k = (...v: string[]) => ["in", ["get", "k"], ["literal", v]];
  L.push({ id: "bg", type: "background", paint: { "background-color": P.bg } });
  add({ id: "suelo-acera", type: "fill", filter: k("acera"), paint: { "fill-color": P.walk } }, "suelo");
  add({ id: "panot", type: "fill", filter: k("acera"), minzoom: 17, paint: { "fill-pattern": `panot-${theme}`, "fill-opacity": zl(17, 0, 18, 1) } }, "suelo");
  add({ id: "suelo-plaza", type: "fill", filter: k("plaza", "playa"), paint: { "fill-color": P.plaza } }, "suelo");
  add({ id: "suelo-peatonal", type: "fill", filter: k("peatonal"), paint: { "fill-color": P.peat } }, "suelo");
  add({ id: "verde-parque", type: "fill", filter: k("parque", "bosque"), paint: { "fill-color": P.park } }, "verde");
  add({ id: "verde-parterre", type: "fill", filter: k("parterre"), paint: { "fill-color": P.green } }, "verde");
  add({ id: "suelo-agua", type: "fill", filter: k("agua"), paint: { "fill-color": P.water } }, "suelo");
  // ponytail: crossings are polygons now, so a flat tint stands in for the prototype's zebra dashes.
  add({ id: "pasos", type: "fill", minzoom: 15, paint: { "fill-color": P.zebra, "fill-opacity": zl(15, 0, 16, 0.55, 18, 0.8) } }, "pasos");
  add({ id: "bordillo", type: "line", filter: k("acera"), minzoom: 15, paint: { "line-color": P.curb, "line-width": zl(15, 0.4, 18, 1, 20, 2) } }, "suelo");
  add({ id: "manzanas", type: "fill", paint: { "fill-color": P.block } }, "manzanas");
  add({ id: "fachada", type: "line", minzoom: 15.5, paint: { "line-color": P.facade, "line-width": zl(15.5, 0.3, 18, 0.8, 20, 1.5) } }, "manzanas");
  add({ id: "arboles", type: "circle", minzoom: 16,
    paint: { "circle-color": P.tree, "circle-opacity": zl(16, 0, 17, P.treeA), "circle-radius": metres(3.2, 1.5), "circle-pitch-alignment": "map" } }, "arboles");
  add({ id: "escocells", type: "circle", minzoom: 17.5,
    paint: { "circle-color": P.pit, "circle-opacity": zl(17.5, 0, 18.2, 0.85), "circle-radius": metres(0.55, 1) } }, "arboles");

  // Fine risk: density of fines to motorcycles, with towing weighing more.
  add({ id: "riesgo", type: "heatmap",
    paint: { "heatmap-weight": ["case", ["boolean", ["get", "tow"], false], 0.6, 0.35],
      "heatmap-radius": zx(14, 9, 17, px(24, 17), 19.5, px(20, 19.5)), "heatmap-intensity": zl(14, 0.7, 18, 1.1), "heatmap-opacity": 0.85,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.15, P.heat[0], 0.45, P.heat[1], 0.75, P.heat[2], 1, P.heat[3]] } },
  "multas", risk);

  // Sidewalk status. The pipeline already places each line where the moto stands, so no offset is needed.
  // Parallel is a slim solid band, angled a wide band with ticks, prohibited dashed, probable a dashed outline, no data dotted.
  const A = "aceras";
  add({ id: "st-nodata", type: "line", filter: st("sin_datos"), layout: { "line-cap": "round" },
    paint: { "line-color": P.nodata, "line-width": metres(0.3, 1.4), "line-dasharray": [0.1, 2.4] } }, A, pieces);
  add({ id: "st-prohibido", type: "line", filter: st("prohibido"),
    paint: { "line-color": P.no, "line-width": metres(0.35, 1.6), "line-dasharray": [2.2, 1.3] } }, A, pieces);
  add({ id: "st-senal", type: "line", filter: st("senal"),
    paint: { "line-color": P.no, "line-width": metres(0.12, 1), "line-gap-width": metres(0.35, 1.6), "line-dasharray": [2.2, 1.3] } }, A, pieces);
  add({ id: "st-semi", type: "line", filter: st("semibateria"),
    paint: { "line-color": P.semi, "line-width": metres(1.5, 2.6) } }, A, pieces);
  add({ id: "st-semi-marcas", type: "line", filter: st("semibateria"), minzoom: 16.6,
    paint: { "line-color": P.walk, "line-width": metres(1.5, 2.6), "line-dasharray": [0.22, 0.6], "line-opacity": zl(16.6, 0, 17.2, 0.9) } }, A, pieces);
  add({ id: "st-paralelo", type: "line", filter: st("paralelo"),
    paint: { "line-color": P.ok, "line-width": metres(0.8, 2) } }, A, pieces);

  // Moto bays: a band on the curb and, from z16, the chamfered marker with its place count.
  const B = "zonas_moto";
  add({ id: "motos-borde", type: "line", filter: bayFilter, layout: { "line-cap": "butt" },
    paint: { "line-color": P.bayEdge, "line-width": zx(14, 4, 17, 7.5, 20, px(2.4, 20) + 5) } }, B);
  add({ id: "motos", type: "line", filter: bayFilter, layout: { "line-cap": "butt" },
    paint: { "line-color": P.bay, "line-width": zx(14, 2.4, 17, 5, 20, px(2.2, 20)) } }, B);

  // Selection, and invisible hit areas for taps.
  add({ id: "sel-piece-halo", type: "line", filter: pieceIs(selPiece), layout: { "line-cap": "round" },
    paint: { "line-color": P.selHalo, "line-width": zx(14, 9, 17, 12, 20, px(2.2, 20) + 8), "line-opacity": 0.9 } }, A);
  add({ id: "sel-piece", type: "line", filter: pieceIs(selPiece), layout: { "line-cap": "round" },
    paint: { "line-color": P.sel, "line-width": zx(14, 4, 17, 6, 20, px(1.6, 20)) } }, A);
  add({ id: "sel-ping", type: "line", filter: pieceIs(selPiece), layout: { "line-cap": "round" },
    paint: { "line-color": P.sel, "line-width": 8, "line-opacity": 0 } }, A);
  add({ id: "sel-bay", type: "line", filter: idIs(selBay), layout: { "line-cap": "round" },
    paint: { "line-color": P.sel, "line-width": zx(14, 6, 17, 10, 20, px(3, 20)), "line-gap-width": zx(14, 3, 17, 5, 20, px(2.2, 20)) } }, B);
  add({ id: "aceras-hit", type: "line", paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 18 } }, A, pieces);
  add({ id: "motos-hit", type: "line", filter: bayFilter, paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 22 } }, B);

  // Icon only: a text label would be dropped on bays shorter than the label, so the count is drawn in the image.
  add({ id: "motos-placas", type: "symbol", minzoom: 16, filter: bayFilter,
    layout: { "symbol-placement": "line-center", "icon-image": ["concat", `bay-${theme}-`, ["to-string", ["coalesce", ["get", "pl"], 0]]],
      "icon-rotation-alignment": "viewport", "icon-padding": 1, "symbol-sort-key": ["-", 0, ["coalesce", ["get", "pl"], 0]] },
    paint: { "icon-opacity": zl(16, 0, 16.4, 1) } }, B);

  // Street labels from the municipal toponymy, rotated like the official map; z ranks the street.
  const street = (z: number, minzoom: number, sizes: number[], font: string[]) => add({ id: `lbl-calle-${z}`, type: "symbol", minzoom,
    filter: ["==", ["get", "z"], z],
    layout: { "text-field": ["get", "t"], "text-font": font, "text-size": zl(...sizes), "text-rotate": ["coalesce", ["get", "r"], 0],
      "text-rotation-alignment": "map", "text-pitch-alignment": "viewport", "text-padding": 4, "text-max-width": 40, "text-letter-spacing": 0.01 },
    paint: { "text-color": P.text, "text-halo-color": P.halo, "text-halo-width": 1.4, "text-halo-blur": 0.3 } }, "calles");
  street(0, 16.4, [16.4, 10, 18, 12, 19.5, 14], FONT.r);
  street(1, 15.3, [15.3, 10, 17, 12, 19.5, 15], FONT.m);
  street(2, 14.4, [14.4, 10.5, 17, 13, 19.5, 16], FONT.m);

  // ponytail: only the city edge is drawn; a mask outside it needs an inverted polygon from the pipeline.
  add({ id: "limite", type: "line", paint: { "line-color": P.edge, "line-width": 1.2, "line-dasharray": [3, 2] } }, "limite");
  return L;
}

// Images drawn on demand from the palette: the panot texture and the bay markers with their count.
export function makeImage(id: string): { data: ImageData; options: { pixelRatio: number } } | null {
  const [kind, theme, count] = id.split("-");
  const P = PAL[theme as Theme];
  if (!P) return null;
  const r = 2;
  const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = w * r;
    c.height = h * r;
    const g = c.getContext("2d")!;
    g.scale(r, r);
    draw(g);
    return { data: g.getImageData(0, 0, w * r, h * r), options: { pixelRatio: r } };
  };
  if (kind === "panot") {
    // Hexagonal panot with a small flower: a texture, not a literal tile size.
    return canvas(24, 42, (g) => {
      const centres = [[0, 0], [24, 0], [12, 21], [0, 42], [24, 42]];
      g.fillStyle = P.walk;
      g.fillRect(0, 0, 24, 42);
      g.strokeStyle = P.tile;
      g.lineWidth = 1;
      for (const [x, y] of centres) {
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          g.lineTo(x + 7 * Math.cos(a), y + 7 * Math.sin(a));
        }
        g.closePath();
        g.stroke();
      }
      g.fillStyle = P.tile;
      for (const [x, y] of centres) {
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          g.beginPath();
          g.arc(x + 2.2 * Math.cos(a), y + 2.2 * Math.sin(a), 1.2, 0, 7);
          g.fill();
        }
      }
    });
  }
  if (kind === "bay") {
    return canvas(26, 26, (g) => {
      const oct = (o: number) => {
        g.beginPath();
        g.moveTo(7 + o, o); g.lineTo(19 - o, o); g.lineTo(26 - o, 7 + o); g.lineTo(26 - o, 19 - o);
        g.lineTo(19 - o, 26 - o); g.lineTo(7 + o, 26 - o); g.lineTo(o, 19 - o); g.lineTo(o, 7 + o);
        g.closePath();
      };
      oct(0); g.fillStyle = P.bayEdge; g.fill();
      oct(2); g.fillStyle = P.bay; g.fill();
      if (count && count !== "0") {
        g.fillStyle = P.bayText;
        g.font = `700 ${count.length > 2 ? 9 : 11}px "Noto Sans", "Helvetica Neue", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(count, 13, 13.5);
      }
    });
  }
  return null;
}
