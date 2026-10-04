// What a place means for the rider: one model, rendered by the sheet and the nearby cards.
import { midpoint, type LngLat } from "./geo.ts";

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

export const fmt = (n: number, d = 1) => n.toLocaleString("es-ES", { maximumFractionDigits: d });
export function distText(m: number) {
  if (m >= 1000) return `${fmt(m / 1000, 1)} km`;
  return `${fmt(m < 100 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10, 0)} m`;
}

const STATUS: Record<string, { tone: Tone; label: string; action: string; law: string }> = {
  paralelo: { tone: "ok", label: "PARALELO", action: "Aparca en paralelo, a medio metro del bordillo.", law: "art. 40.4.a, 40.4.d" },
  semibateria: { tone: "semi", label: "SEMIBATERÍA", action: "Aparca en semibatería, a medio metro del bordillo.", law: "art. 40.4.a, 40.4.e" },
  prohibido: { tone: "no", label: "NO APARCAR", action: "No aparques aquí.", law: "art. 40.4" },
  senal: { tone: "prob", label: "PROBABLE", action: "Probablemente prohibido por una señal cercana.", law: "art. 40.4" },
  sin_datos: { tone: "nodata", label: "SIN DATOS", action: "No hemos podido medir esta acera. Mira la señalización y deja siempre 3 m libres.", law: "art. 40.4.h" },
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

const BAY_KIND: Record<string, string> = { "Batería": "En batería", "Línea": "En línea", "Chaflán": "En chaflán", "Parrilla": "En parrilla" };
const codes = (v: unknown) => String(v ?? "").split("|").filter(Boolean);

export function model(p: Place, meta: Meta | null): Model {
  const ll = midpoint(p.line);
  const P = p.props;
  if (p.kind === "bay") {
    const pl = Number(P.pl) || 0;
    const onSidewalk = P.on === "acera";
    return { tone: "bay", label: onSidewalk ? "ZONA MOTO" : "EN CALZADA", street: streetName(P.calle) || "Zona moto",
      sub: [BAY_KIND[String(P.tipo)] ?? "Plazas reservadas", onSidewalk ? "en la acera" : "en la calzada"].join(" · "),
      size: pl ? `${fmt(pl, 0)} ${pl === 1 ? "plaza" : "plazas"}` : "plazas sin contar",
      body: ["Es la opción preferente de la ordenanza: aparca aquí antes que en la acera."], law: "OCVV art. 40.4",
      bayM: null, fines: null, ll, go: true };
  }
  const T = meta?.texts ?? {};
  const s = STATUS[String(P.st)] ?? STATUS.sin_datos;
  const why = codes(P.r).filter((c) => T[c]);
  const notes = codes(P.n).filter((c) => T[c]);
  const allowed = s.tone === "ok" || s.tone === "semi";
  const first = P.st === "sin_datos" && P.k === "obert"
    ? "Espacio peatonal abierto, como una plaza o un chaflán ancho. Todavía no calculamos cómo aparcar aquí: mira la señalización."
    : allowed || !why.length ? s.action : null;
  const body = [first, ...why.map((c) => T[c][0]), ...(allowed ? notes.map((c) => T[c][0]) : [])].filter((t): t is string => !!t);
  const refs = [...new Set([...why, ...(allowed ? notes : [])].map((c) => T[c][1]))];
  const w = typeof P.w === "number" ? P.w : null;
  return { tone: s.tone, label: s.label, street: streetName(P.calle) || "Acera", sub: "", size: w != null ? `acera ${fmt(w)} m` : "",
    body, law: "OCVV " + (refs.length ? refs.join(" · ") : s.law),
    bayM: typeof P.bay === "number" ? P.bay : null, fines: typeof P.mul === "number" ? P.mul : null, ll, go: allowed || s.tone === "nodata" };
}

export const dirURL = (ll: LngLat, mode?: "walking") =>
  `https://www.google.com/maps/dir/?api=1&destination=${ll[1].toFixed(6)},${ll[0].toFixed(6)}${mode ? `&travelmode=${mode}` : ""}`;

// Barcelona when meta.json gives no bounds: the municipal limit with a small margin.
export const BCN_BOUNDS: [number, number, number, number] = [2.05, 41.31, 2.24, 41.48];
export const BCN_CENTER: LngLat = [2.1700, 41.3870];
