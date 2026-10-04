import { X } from "lucide-react";
import { PAL, type Theme } from "../map/style.ts";
import { fmt, type Meta } from "../model.ts";

export type ThemePref = "system" | "light" | "dark";

function Swatch({ kind, theme }: { kind: string; theme: Theme }) {
  const P = PAL[theme];
  const line = (c: string, w: number, dash = "", cap: "butt" | "round" = "butt", y = 10) =>
    <line key={c + w + dash + y} x1="3" y1={y} x2="53" y2={y} stroke={c} strokeWidth={w} strokeDasharray={dash} strokeLinecap={cap} />;
  const ground = kind === "bay" || kind === "risk" ? P.bg : P.walk;
  const body = {
    ok: [line(P.ok, 5)],
    semi: [line(P.semi, 9), line(P.walk, 9, "2 5.5")],
    no: [line(P.no, 3, "7 4")],
    prob: [line(P.no, 1.2, "7 4", "butt", 7), line(P.no, 1.2, "7 4", "butt", 13)],
    nodata: [line(P.nodata, 3, "0.1 7", "round")],
    bay: [line(P.bayEdge, 11), line(P.bay, 7.5)],
    risk: [<rect key="r" width="56" height="20" fill={`url(#risk-${theme})`} />],
  }[kind];
  return (
    <svg viewBox="0 0 56 20" width="56" height="20" aria-hidden="true">
      <defs><linearGradient id={`risk-${theme}`}><stop offset="0" stopColor={P.heat[0]} /><stop offset=".5" stopColor={P.heat[2]} /><stop offset="1" stopColor={P.heat[3]} /></linearGradient></defs>
      <rect width="56" height="20" fill={ground} />{body}
    </svg>
  );
}

const ITEMS = [
  ["bay", "Zona moto", "Plazas reservadas en la calzada o en la acera. La opción preferente."],
  ["ok", "Paralelo", "Acera de 4,3 a 6 m: aparca en paralelo, a medio metro del bordillo."],
  ["semi", "Semibatería", "Acera de más de 6 m: aparca en semibatería."],
  ["no", "No aparcar", "Acera de 4,3 m o menos, paso de peatones a menos de 2 m, paradas, reservas, escuelas, hospitales, calles peatonales."],
  ["prob", "Probable", "Probablemente prohibido: hay una señal cerca que incluye las motos en la acera. Comprueba la señal."],
  ["nodata", "Sin datos", "Espacio abierto o anchura dudosa. Mira la señalización."],
  ["risk", "Riesgo de multa", "Dónde se multa a motos, con más peso si hubo grúa."],
] as const;

const SOURCE: Record<string, string> = {
  reserves: "Inventario de reservas de aparcamiento", inca: "Accesibilidad de la vía pública", crossings: "Mapa topográfico: pasos de peatones",
  municipality: "Límite municipal", transit_stops: "Paradas de bus y tranvía", bike_lanes: "Carriles bici", pedestrian_streets: "Calles peatonales y ejes verdes",
  signs: "Señales de tráfico", trees: "Arbolado", schools: "Centros educativos", hospitals: "Hospitales y urgencias", fines: "Multas de tráfico",
};
const KM: Record<string, string> = { paralelo: "en paralelo", semibateria: "en semibatería", prohibido: "prohibidos", senal: "probablemente prohibidos", sin_datos: "sin datos" };
const when = (d?: string) => {
  if (!d) return "";
  if (d.length <= 4) return d;
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
};

interface Props {
  theme: Theme;
  pref: ThemePref;
  onPref: (p: ThemePref) => void;
  risk: boolean;
  onRisk: (v: boolean) => void;
  meta: Meta | null;
  onClose: () => void;
}
export function Legend({ theme, pref, onPref, risk, onRisk, meta, onClose }: Props) {
  const km = meta?.status_km ?? {};
  return (
    <section id="legend" aria-labelledby="legend-title"
      className="absolute z-40 left-0 right-0 bottom-0 max-h-[82%] overflow-auto overscroll-contain bg-pedra-100 rounded-t-[28px] shadow-[var(--shadow-sheet)] px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))]
        min-[900px]:left-auto min-[900px]:right-[88px] min-[900px]:bottom-4 min-[900px]:w-[380px] min-[900px]:max-h-[calc(100%-32px)] min-[900px]:rounded-[28px] min-[900px]:shadow-[var(--shadow-float)]">
      <div className="flex items-start justify-between gap-3">
        <h2 id="legend-title" className="m-0 font-display font-semibold text-xl leading-[26px] pt-2">Leyenda</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar leyenda" autoFocus><X size={22} strokeWidth={1.75} /></button>
      </div>
      <ul className="m-0 mt-2 p-0 list-none grid gap-0.5">
        {ITEMS.map(([k, t, d]) => (
          <li key={k} className="grid grid-cols-[56px_1fr] gap-3 items-center py-1.5">
            <Swatch kind={k} theme={theme} />
            <div><b className="block label">{t}</b><span className="text-sm leading-5 text-tinta-suau">{d}</span></div>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-4 px-3 py-2.5 rounded-[8px] bg-pedra-200 font-bold">Orientativo: manda la señalización.</p>

      <h3 className="m-0 mt-6 font-display font-semibold text-base">Capas y tema</h3>
      <button type="button" role="switch" aria-checked={risk} onClick={() => onRisk(!risk)}
        className="flex items-center justify-between gap-3 w-full min-h-12 mt-1 p-0 border-0 bg-transparent text-left rounded-[8px]">
        Riesgo de multa<span className="toggle" aria-hidden="true" />
      </button>
      <div className="flex gap-1 p-1 mt-2 rounded-[12px] bg-pedra-200" role="radiogroup" aria-label="Tema">
        {(["light", "dark", "system"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={pref === p} onClick={() => onPref(p)}
            className="flex-1 min-h-11 rounded-[9px] border-0 bg-transparent font-semibold text-sm text-tinta-suau aria-checked:bg-pedra-100 aria-checked:text-tinta aria-checked:shadow-[0_1px_3px_var(--drop)]">
            {{ light: "Día", dark: "Noche", system: "Sistema" }[p]}
          </button>
        ))}
      </div>

      <h3 className="m-0 mt-6 font-display font-semibold text-base">Sobre los datos</h3>
      <div className="text-[13px] leading-[18px] text-tinta-suau flex flex-col gap-2 mt-2">
        <p className="m-0">El ancho de cada tramo se mide sobre la cartografía municipal y el estado aplica el art. 40 de la Ordenanza de circulación de Barcelona. Las señales se sitúan de forma aproximada. No hay datos de vados ni de contenedores.</p>
        {Object.keys(km).length > 0 && (
          <p className="m-0">En el mapa: {Object.entries(km).map(([s, v]) => `${fmt(v)} km ${KM[s] ?? s}`).join(", ")}.</p>
        )}
        <p className="m-0">
          Font de les dades: Ajuntament de Barcelona, TMB, AMB, TRAM y © colaboradores de OpenStreetMap.
          {meta && " " + Object.entries(meta.sources).map(([k, s]) => `${SOURCE[k] ?? k} (${when(s.data_date)})`).join(", ") + "."}
        </p>
        {meta?.built && <p className="m-0">Datos preparados el {new Date(meta.built + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}.</p>}
      </div>
    </section>
  );
}
