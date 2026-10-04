// What a place means for the rider: one model, rendered by the sheet and the nearby cards.
import { midpoint, type LngLat } from "./geo.ts";
import { locale, rule, t, type Key } from "./i18n.ts";

export interface Meta {
  built: string;
  sources: Record<string, { data_date?: string; url?: string[] }>;
  texts: Record<string, [string, string]>;
  status_km?: Record<string, number>;
  bounds?: [number, number, number, number];
  center?: LngLat;
}

export type Tone = "ok" | "semi" | "no" | "prob" | "nodata" | "bay";
export type Props = Record<string, string | number | boolean | null | undefined>;
export interface Place {
  kind: "piece" | "bay";
  id: string;
  props: Props;
  line: LngLat[];
}
export interface Model {
  tone: Tone;
  label: string;
  street: string;
  sub: string;
  // Width of the sidewalk or number of places, for the dato line.
  size: string;
  body: string[];
  law: string;
  bayM: number | null;
  fines: number | null;
  ll: LngLat;
  go: boolean;
}

export const fmt = (n: number, d = 1) => n.toLocaleString(locale(), { maximumFractionDigits: d });
export function distText(m: number) {
  if (m >= 1000) return `${fmt(m / 1000, 1)} km`;
  return `${fmt(m < 100 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10, 0)} m`;
}

// label and action are dictionary keys: the action key is the label key plus "Do".
const STATUS: Record<string, { tone: Tone; label: Key; law: string }> = {
  paralelo: { tone: "ok", label: "stOk", law: "art. 40.4.a, 40.4.d" },
  semibateria: { tone: "semi", label: "stSemi", law: "art. 40.4.a, 40.4.e" },
  prohibido: { tone: "no", label: "stNo", law: "art. 40.4" },
  senal: { tone: "prob", label: "stProb", law: "art. 40.4" },
  sin_datos: { tone: "nodata", label: "stNodata", law: "art. 40.4.h" },
};
export const toneOf = (st: unknown): Tone => STATUS[String(st)]?.tone ?? "nodata";

// The reserves inventory writes names as "BAILEN, C., DE"; the map shows them as people read them.
const VIA: Record<string, string> = { "C.": "Carrer", "AV.": "Avinguda", "PG.": "Passeig", "PL.": "Plaça", "RBLA.": "Rambla",
  "TRAV.": "Travessera", "PTGE.": "Passatge", "RDA.": "Ronda", "GV.": "Gran Via", "VIA": "Via", "BDA.": "Baixada", "CTRA.": "Carretera" };
export function streetName(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s || s !== s.toUpperCase()) return s;
  const [name, via = "", link = ""] = s.split(/\s*,\s*/);
  const title = (w: string) => w.toLowerCase().replace(/(^|[\s'·-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|Dels|La|Les|I|D')\b/g, (m) => m.toLowerCase());
  const linkText = link.toLowerCase();
  const join = linkText.endsWith("'") ? linkText : linkText ? linkText + " " : "";
  return [VIA[via.toUpperCase()] ?? title(via), join + title(name)].filter(Boolean).join(" ").trim();
}

const BAY_KIND: Record<string, Key> = { "Batería": "kindBattery", "Línea": "kindLine", "Chaflán": "kindChamfer", "Parrilla": "kindGrid" };
const places = (n: number) => (n === 1 ? t("place1") : t("placesN", { n: fmt(n, 0) }));
const codes = (v: unknown) => String(v ?? "").split("|").filter(Boolean);

export function model(p: Place, meta: Meta | null): Model {
  const ll = midpoint(p.line);
  const P = p.props;
  if (p.kind === "bay") {
    const pl = Number(P.pl) || 0;
    const onSidewalk = P.on === "acera";
    const kind = BAY_KIND[String(P.tipo)];
    return { tone: "bay", label: t(onSidewalk ? "bayTag" : "roadTag"), street: streetName(P.calle) || t("bay"),
      sub: [kind ? t(kind) : t("reserved"), t(onSidewalk ? "onSidewalk" : "onRoad")].join(" · "),
      size: pl ? places(pl) : t("placesUnknown"),
      body: [t("bayBody")], law: "OCVV art. 40.4",
      bayM: null, fines: null, ll, go: true };
  }
  const T = meta?.texts ?? {};
  const text = (c: string) => rule(c, T[c]);
  const s = STATUS[String(P.st)] ?? STATUS.sin_datos;
  const why = codes(P.r).filter((c) => text(c));
  const notes = codes(P.n).filter((c) => text(c));
  const allowed = s.tone === "ok" || s.tone === "semi";
  const first = P.st === "sin_datos" && P.k === "obert" ? t("openSpace")
    : allowed || !why.length ? t(`${s.label}Do` as Key) : null;
  const body = [first, ...why.map((c) => text(c)![0]), ...(allowed ? notes.map((c) => text(c)![0]) : [])].filter((x): x is string => !!x);
  const refs = [...new Set([...why, ...(allowed ? notes : [])].map((c) => text(c)![1]))];
  const w = typeof P.w === "number" ? P.w : null;
  return { tone: s.tone, label: t(s.label), street: streetName(P.calle) || t("sidewalk"), sub: "", size: w != null ? t("sidewalkW", { w: fmt(w) }) : "",
    body, law: "OCVV " + (refs.length ? refs.join(" · ") : s.law),
    bayM: typeof P.bay === "number" ? P.bay : null, fines: typeof P.mul === "number" ? P.mul : null, ll, go: allowed || s.tone === "nodata" };
}

export const dirURL = (ll: LngLat, mode?: "walking") =>
  `https://www.google.com/maps/dir/?api=1&destination=${ll[1].toFixed(6)},${ll[0].toFixed(6)}${mode ? `&travelmode=${mode}` : ""}`;

// Barcelona when meta.json gives no bounds: the municipal limit with a small margin.
export const BCN_BOUNDS: [number, number, number, number] = [2.05, 41.31, 2.24, 41.48];
export const BCN_CENTER: LngLat = [2.1700, 41.3870];
