import { CircleHelp, X } from "lucide-react";
import { PAL, type Theme } from "../map/style.ts";
import { fmt, type Meta } from "../model.ts";
import { LANGS, locale, t, type Key, type Lang } from "../i18n.ts";

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

// Swatch kind and dictionary key: the description key is the name key plus "D".
const ITEMS: [string, Key][] = [["bay", "lgBay"], ["ok", "lgOk"], ["semi", "lgSemi"], ["no", "lgNo"], ["prob", "lgProb"], ["nodata", "lgNodata"], ["risk", "lgRisk"]];

const SOURCE: Record<string, Key> = {
  reserves: "srcReserves", inca: "srcInca", crossings: "srcCrossings", municipality: "srcMunicipality", transit_stops: "srcTransit",
  bike_lanes: "srcBike", pedestrian_streets: "srcPedestrian", signs: "srcSigns", trees: "srcTrees", schools: "srcSchools",
  hospitals: "srcHospitals", fines: "srcFines",
};
const KM: Record<string, Key> = { paralelo: "kmOk", semibateria: "kmSemi", prohibido: "kmNo", senal: "kmProb", sin_datos: "kmNodata" };
const when = (d?: string) => {
  if (!d) return "";
  if (d.length <= 4) return d;
  return new Date(d + "T12:00:00").toLocaleDateString(locale(), { month: "long", year: "numeric" });
};

interface Props {
  theme: Theme;
  pref: ThemePref;
  onPref: (p: ThemePref) => void;
  risk: boolean;
  onRisk: (v: boolean) => void;
  meta: Meta | null;
  lang: Lang;
  onLang: (l: Lang) => void;
  onClose: () => void;
  onHelp: () => void;
}
export function Legend({ theme, pref, onPref, risk, onRisk, meta, lang, onLang, onClose, onHelp }: Props) {
  const km = meta?.status_km ?? {};
  return (
    <section id="legend" aria-labelledby="legend-title"
      className="absolute z-40 left-0 right-0 bottom-0 max-h-[82%] overflow-auto overscroll-contain bg-pedra-100 rounded-t-[28px] shadow-[var(--shadow-sheet)] px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))]
        min-[900px]:left-auto min-[900px]:right-[88px] min-[900px]:bottom-4 min-[900px]:w-[380px] min-[900px]:max-h-[calc(100%-32px)] min-[900px]:rounded-[28px] min-[900px]:shadow-[var(--shadow-float)]">
      <div className="flex items-start justify-between gap-3">
        <h2 id="legend-title" className="m-0 font-display font-semibold text-xl leading-[26px] pt-2">{t("legend")}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("closeLegend")} autoFocus><X size={22} strokeWidth={1.75} /></button>
      </div>
      <ul className="m-0 mt-2 p-0 list-none grid gap-0.5">
        {ITEMS.map(([k, name]) => (
          <li key={k} className="grid grid-cols-[56px_1fr] gap-3 items-center py-1.5">
            <Swatch kind={k} theme={theme} />
            <div><b className="block label">{t(name)}</b><span className="text-sm leading-5 text-tinta-suau">{t(`${name}D` as Key)}</span></div>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-4 px-3 py-2.5 rounded-[8px] bg-pedra-200 font-bold">{t("indicative")}</p>
      <button type="button" className="linkrow mt-2" onClick={onHelp}><CircleHelp size={20} strokeWidth={1.75} />{t("howItWorks")}</button>

      <h3 className="m-0 mt-6 font-display font-semibold text-base">{t("layersTheme")}</h3>
      <button type="button" role="switch" aria-checked={risk} onClick={() => onRisk(!risk)}
        className="flex items-center justify-between gap-3 w-full min-h-12 mt-1 p-0 border-0 bg-transparent text-left rounded-[8px]">
        {t("lgRisk")}<span className="toggle" aria-hidden="true" />
      </button>
      <div className="flex gap-1 p-1 mt-2 rounded-[12px] bg-pedra-200" role="radiogroup" aria-label={t("theme")}>
        {(["light", "dark", "system"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={pref === p} onClick={() => onPref(p)}
            className="flex-1 min-h-11 rounded-[9px] border-0 bg-transparent font-semibold text-sm text-tinta-suau aria-checked:bg-pedra-100 aria-checked:text-tinta aria-checked:shadow-[0_1px_3px_var(--drop)]">
            {t(({ light: "day", dark: "night", system: "system" } as const)[p])}
          </button>
        ))}
      </div>
      <div className="flex gap-1 p-1 mt-2 rounded-[12px] bg-pedra-200" role="radiogroup" aria-label={t("language")}>
        {LANGS.map(([l, name]) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onLang(l)} lang={l}
            className="flex-1 min-h-11 rounded-[9px] border-0 bg-transparent font-semibold text-sm text-tinta-suau aria-checked:bg-pedra-100 aria-checked:text-tinta aria-checked:shadow-[0_1px_3px_var(--drop)]">
            {name}
          </button>
        ))}
      </div>

      <h3 className="m-0 mt-6 font-display font-semibold text-base">{t("aboutData")}</h3>
      <div className="text-[13px] leading-[18px] text-tinta-suau flex flex-col gap-2 mt-2">
        <p className="m-0">{t("aboutText")}</p>
        {Object.keys(km).length > 0 && (
          <p className="m-0">{t("onMap", { list: Object.entries(km).map(([s, v]) => `${fmt(v)} km ${KM[s] ? t(KM[s]) : s}`).join(", ") })}</p>
        )}
        <p className="m-0">
          Font de les dades: Ajuntament de Barcelona, TMB, AMB, Powered by TRAM Barcelona {t("and")} © OpenStreetMap contributors (ODbL).
          {meta && " " + Object.entries(meta.sources).map(([k, s]) => `${SOURCE[k] ? t(SOURCE[k]) : k} (${when(s.data_date)})`).join(", ") + "."}
        </p>
        {meta?.built && <p className="m-0">{t("built", { d: new Date(meta.built + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) })}</p>}
      </div>
    </section>
  );
}
