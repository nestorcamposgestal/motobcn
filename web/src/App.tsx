import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Map as MlMap, Marker, addProtocol, setWorkerUrl, type MapGeoJSONFeature, type PointLike } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { PMTiles, Protocol } from "pmtiles";
import type { Feature, Geometry } from "geojson";
import { Layers, LocateFixed, MapPin, Motorbike } from "lucide-react";
import { buildStyle, makeImage, type Filter, type Theme } from "./map/style.ts";
import { dist, distToLine, midpoint, rankNearby, type LngLat } from "./geo.ts";
import { BCN_BOUNDS, BCN_CENTER, model, streetName, type Meta, type Place } from "./model.ts";
import { Detail, Nearby, Panel, ParkedInfo, type Card, type Parked } from "./ui/parts.tsx";
import { Search } from "./ui/Search.tsx";
import { Legend, type ThemePref } from "./ui/Legend.tsx";
import { Welcome } from "./ui/Welcome.tsx";
import { Intro } from "./ui/Intro.tsx";
import { detect, setLang, t, type Lang } from "./i18n.ts";

setWorkerUrl(workerUrl);
const protocol = new Protocol();
addProtocol("pmtiles", protocol.tile);
const BASE = new URL(import.meta.env.BASE_URL, location.href).href;
const tiles = new PMTiles(`${BASE}data/motobcn.pmtiles`);
protocol.add(tiles);

// Storage can be blocked (private mode, embedded views): the app then just forgets.
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const wideMQ = matchMedia("(min-width: 900px)");
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
const dur = (ms: number) => (reduceMQ.matches ? 0 : ms);
function useMedia(mq: MediaQueryList) {
  return useSyncExternalStore((cb) => { mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); }, () => mq.matches);
}

type Kind = Place["kind"];
const LAYER: Record<Kind, string> = { bay: "zonas_moto", piece: "aceras" };
function lines(g: Geometry): LngLat[][] {
  if (g.type === "LineString") return [g.coordinates as LngLat[]];
  if (g.type === "MultiLineString") return g.coordinates as LngLat[][];
  return [];
}
const toPlace = (f: MapGeoJSONFeature | Feature, kind: Kind, line = lines(f.geometry)[0] ?? []): Place =>
  ({ kind, id: kind === "piece" && typeof f.id === "number" ? pieceId(f.id) : String(f.properties?.id ?? ""),
    props: f.properties ?? {}, line });
// tippecanoe 2.49 can give a piece the id string of another piece; the feature id (line * 1000 + piece) is exact.
const pieceId = (fid: number) => `${Math.floor(fid / 1000)}-${fid % 1000}`;
const inChip = (p: Place, filter: Filter) =>
  filter === "todas" || (p.kind === "bay" ? p.props.on === filter : filter === "acera");

// Every feature of a kind in the loaded tiles, one entry per line part.
function loadedPlaces(map: MlMap, kind: Kind): (Place & { st?: string })[] {
  return map.querySourceFeatures("m", { sourceLayer: LAYER[kind] }).flatMap((f) =>
    lines(f.geometry).map((line) => ({ ...toPlace(f, kind, line), st: f.properties?.st as string | undefined })));
}

// Taps: the nearest bay or sidewalk piece within r pixels. A bay wins ties, it is the preferred option.
function hitAt(map: MlMap, x: number, y: number, r = 12): Place | null {
  const layers = ["motos-hit", "aceras-hit"].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
  const box: [PointLike, PointLike] = [[x - r, y - r], [x + r, y + r]];
  type Hit = { d: number; f: MapGeoJSONFeature } | null;
  let bay: Hit = null as Hit, piece: Hit = null as Hit;
  for (const f of map.queryRenderedFeatures(box, { layers })) {
    for (const line of lines(f.geometry)) {
      for (let i = 1; i < line.length; i++) {
        const a = map.project(line[i - 1]), b = map.project(line[i]);
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
        const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
        if (f.layer.id === "motos-hit") { if (!bay || d < bay.d) bay = { d, f }; }
        else if (!piece || d < piece.d) piece = { d, f };
      }
    }
  }
  if (bay && (!piece || bay.d <= piece.d + 6)) return toPlace(bay.f, "bay");
  return piece ? toPlace(piece.f, "piece") : null;
}

interface Near { from: LngLat; isUser: boolean; cards: Card[] }

export default function App() {
  const [lng, setLng] = useState<Lang>(() => {
    const saved = store.get("motobcn.lang") as Lang | null;
    return saved && ["es", "ca", "en"].includes(saved) ? saved : detect();
  });
  // Before the children render, so every t() call of this render reads the chosen language.
  setLang(lng);
  const [pref, setPref] = useState<ThemePref>(() => (["light", "dark"].includes(store.get("motobcn.theme") ?? "") ? store.get("motobcn.theme") as ThemePref : "system"));
  const systemDark = useMedia(darkMQ);
  const wide = useMedia(wideMQ);
  const theme: Theme = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  const [filter, setFilter] = useState<Filter>("todas");
  const [risk, setRisk] = useState(() => store.get("motobcn.risk") === "1");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0.1);
  const [failure, setFailure] = useState("");
  const [sel, setSel] = useState<Place | null>(null);
  const [user, setUser] = useState<LngLat | null>(null);
  const [near, setNear] = useState<Near | null>(null);
  const [active, setActive] = useState(0);
  const [legend, setLegend] = useState(false);
  const [welcome, setWelcome] = useState(() => store.get("motobcn.welcome") !== "1");
  const [intro, setIntro] = useState(() => store.get("motobcn.intro") !== "1");
  const [toast, setToast] = useState("");
  const [parked, setParked] = useState<Parked | null>(() => { try { return JSON.parse(store.get("motobcn.parked") || "null"); } catch { return null; } });
  const [showParked, setShowParked] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const sheetEl = useRef<HTMLElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const motoEl = useMemo(() => Object.assign(document.createElement("div"), { className: "moto-pin" }), []);

  const bounds = useMemo(() => meta?.bounds ?? BCN_BOUNDS, [meta]);
  const hl = sel ?? near?.cards[active]?.o ?? null;
  const styleState = { theme, filter, risk, selPiece: hl?.kind === "piece" ? hl.id : null, selBay: hl?.kind === "bay" ? hl.id : null };
  // Map handlers are bound once; they read the current render through this ref.
  const live = useRef({ styleState, near, filter, meta, select: (_: Place | null) => {}, nearby: (_: LngLat, __: boolean) => {} });

  useEffect(() => {
    if (pref === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pref;
    store.set("motobcn.theme", pref);
  }, [pref]);
  useEffect(() => store.set("motobcn.risk", risk ? "1" : "0"), [risk]);
  useEffect(() => store.set("motobcn.parked", parked ? JSON.stringify(parked) : ""), [parked]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Map: created once meta.json and the tile header say where Barcelona is.
  useEffect(() => {
    let map: MlMap | null = null, dead = false;
    (async () => {
      const [m, header] = await Promise.all([
        fetch(`${BASE}data/meta.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<Meta | null>,
        tiles.getHeader().catch(() => null),
      ]);
      if (dead) return;
      setMeta(m);
      setProgress(0.4);
      if (!header) { setFailure(t("failMap")); return; }
      const b = m?.bounds ?? BCN_BOUNDS, pad = 0.02;
      const center = m?.center ?? (header.centerLon ? [header.centerLon, header.centerLat] as LngLat : BCN_CENTER);
      map = new MlMap({
        container: mapEl.current!, style: buildStyle(live.current.styleState, BASE), center, zoom: wideMQ.matches ? 16.8 : 16.4,
        minZoom: 12, maxZoom: 19.5, maxBounds: [[b[0] - pad, b[1] - pad], [b[2] + pad, b[3] + pad]],
        dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false, renderWorldCopies: false,
        fadeDuration: dur(200),
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.setPadding({ left: wideMQ.matches ? 412 : 0, top: 0, right: 0, bottom: 0 });
      map.setMissingStyleImageResolver((id) => {
        const img = makeImage(id);
        if (img && !map!.hasImage(id)) map!.addImage(id, img.data, img.options);
      });
      map.on("click", (e) => live.current.select(hitAt(map!, e.point.x, e.point.y)));
      map.on("mousemove", (e) => {
        map!.getCanvas().style.cursor = hitAt(map!, e.point.x, e.point.y, 6) ? "pointer" : "";
      });
      map.on("moveend", (e) => {
        // Options around the map centre follow the map when the rider pans it.
        const n = live.current.near;
        if (e.originalEvent && n && !n.isUser) { const c = map!.getCenter(); live.current.nearby([c.lng, c.lat], false); }
      });
      map.on("dataloading", () => setProgress((p) => Math.min(0.9, p + 0.05)));
      map.once("load", () => { setProgress(1); setReady(true); });
      map.on("error", (e) => console.warn(e.error?.message ?? e));
    })();
    return () => { dead = true; map?.remove(); mapRef.current = null; };
  }, []);

  // Style follows the state; setStyle diffs it, so only the changed filters and paints are touched.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setStyle(buildStyle(styleState, BASE));
    if (styleState.selPiece && sel && !reduceMQ.matches) {
      // The one orchestrated moment: the selection rings out once.
      const t0 = performance.now();
      let raf = 0;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 950), e = 1 - (1 - k) ** 3;
        if (!map.getLayer("sel-ping")) return;
        map.setPaintProperty("sel-ping", "line-width", 6 + 34 * e);
        map.setPaintProperty("sel-ping", "line-opacity", +(0.6 * (1 - e)).toFixed(3));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
  }, [ready, theme, filter, risk, styleState.selPiece, styleState.selBay]);

  useEffect(() => { mapRef.current?.setPadding({ left: wide ? 412 : 0, top: 0, right: 0, bottom: 0 }); }, [wide]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !user) return;
    if (!marker.current) {
      const el = document.createElement("div");
      el.className = "me";
      el.setAttribute("aria-hidden", "true");
      marker.current = new Marker({ element: el });
    }
    marker.current.setLngLat(user).addTo(map);
  }, [user, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !parked) return;
    const m = new Marker({ element: motoEl }).setLngLat(parked.ll).addTo(map);
    return () => { m.remove(); };
  }, [parked, ready]);

  // Keep the place clear of the bottom sheet, which covers the lower part of the map on phones.
  const reveal = (ll: LngLat, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    requestAnimationFrame(() => {
      const sh = sheetEl.current;
      // The compact sheet covers only its first block.
      const cover = wideMQ.matches || !sh ? 0
        : sh.offsetHeight - (sh.dataset.peek === "true" ? parseFloat(sh.style.getPropertyValue("--peek")) || 0 : 0);
      const pt = map.project(ll), h = map.getContainer().clientHeight;
      if (!zoom && pt.y < h - cover - 32 && pt.y > 150) return;
      map.easeTo({ center: ll, zoom: zoom ?? map.getZoom(), offset: [0, -cover / 2 + 40], duration: dur(700) });
    });
  };
  const select = (p: Place | null, zoom?: number) => {
    setSel(p);
    setShowParked(false);
    if (p) { setLegend(false); reveal(midpoint(p.line), zoom); }
  };

  const nearby = (from: LngLat, isUser: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const run = () => {
      const f = live.current.filter;
      const cands = [...loadedPlaces(map, "bay"), ...loadedPlaces(map, "piece")].filter((p) => inChip(p, f));
      const cards = rankNearby(from, cands).map((o) => ({ o, m: model(o, live.current.meta) }));
      setNear({ from, isUser, cards });
      setActive(0);
    };
    const c = map.getCenter();
    if (map.getZoom() < 16 || dist(from, [c.lng, c.lat]) > 150) {
      // On phones the cards cover the bottom: keep the point in the upper part of the map.
      map.easeTo({ center: from, zoom: Math.max(map.getZoom(), 16.8), offset: [0, wideMQ.matches ? 0 : -110], duration: dur(800) });
      map.once("idle", run);
    } else if (!map.areTilesLoaded()) map.once("idle", run);
    else run();
  };
  live.current = { styleState, near, filter, meta, select, nearby };

  const withPosition = (ok: (ll: LngLat) => void) => {
    if (!("geolocation" in navigator) || !isSecureContext) {
      setToast(t("geoNone"));
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll: LngLat = [pos.coords.longitude, pos.coords.latitude];
      const [w, s, e, n] = bounds;
      if (ll[0] < w || ll[0] > e || ll[1] < s || ll[1] > n) {
        setToast(t("geoOutside"));
        return;
      }
      setUser(ll);
      ok(ll);
    }, (err) => {
      setToast(err.code === err.PERMISSION_DENIED
        ? t("geoDenied") : t("geoFail"));
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };
  const locate = () => withPosition((ll) => { select(null); nearby(ll, true); });

  // Where the moto is: kept on this device only.
  const openParked = (p: Parked) => {
    setSel(null);
    setNear(null);
    setShowParked(true);
    setLegend(false);
    reveal(p.ll, Math.max(mapRef.current?.getZoom() ?? 0, 17.4));
  };
  const park = (ll: LngLat, street?: string) => {
    const map = mapRef.current;
    const p = { ll, t: Date.now(), street };
    setParked(p);
    openParked(p);
    if (street || !map) return;
    // The street of the nearest sidewalk piece within 40 m; if its tile is not loaded yet, try again when it is.
    const fill = () => {
      let bd = 40, name = "";
      for (const q of loadedPlaces(map, "piece")) {
        const d = distToLine(ll, q.line);
        if (d < bd && q.props.calle) { bd = d; name = streetName(q.props.calle); }
      }
      if (name) setParked((cur) => (cur?.t === p.t ? { ...cur, street: name } : cur));
      return !!name;
    };
    if (!fill()) map.once("idle", fill);
  };
  const motoButton = () => (parked ? openParked(parked) : withPosition((ll) => park(ll)));
  const nearHere = () => {
    const map = mapRef.current;
    if (!map) return;
    if (user) { nearby(user, true); return; }
    const c = map.getCenter();
    setToast(t("nearCenterToast"));
    nearby([c.lng, c.lat], false);
  };
  const goNearestBay = () => {
    const map = mapRef.current;
    if (!map || !sel) return;
    const from = midpoint(sel.line);
    const [best] = rankNearby(from, loadedPlaces(map, "bay").filter((p) => inChip(p, filter)), 1, 0);
    if (best) select(best, Math.max(map.getZoom(), 17.6));
    else setToast(t("bayOut"));
  };
  const pickCard = (i: number, open: boolean) => {
    const card = near?.cards[i], map = mapRef.current;
    if (!card || !map) return;
    setActive(i);
    if (open) select(card.o, Math.max(map.getZoom(), 17.4));
    else { setSel(null); map.easeTo({ center: card.m.ll, zoom: Math.max(map.getZoom(), 17), duration: dur(600) }); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (intro) closeIntro();
      else if (legend) setLegend(false);
      else if (sel || showParked) select(null);
      else if (near) setNear(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [intro, legend, sel, near, showParked]);

  const closeIntro = () => { setIntro(false); store.set("motobcn.intro", "1"); };
  const selModel = sel ? model(sel, meta) : null;
  const fineYear = meta?.sources.fines?.data_date?.slice(0, 4) ?? "2025";
  const nearPanel = near && (
    <Nearby cards={near.cards.map(({ o }) => ({ o, m: model(o, meta) }))} isUser={near.isUser} active={active} side={wide}
      onActive={(i) => pickCard(i, false)} onOpen={(i) => pickCard(i, true)} onClose={() => { setNear(null); setSel(null); }} />
  );
  const chips: [Filter, string][] = [["todas", t("chipAll")], ["calzada", t("chipRoad")], ["acera", t("chipSidewalk")]];

  return (
    <main className="relative h-full overflow-hidden bg-pedra-200">
      <div ref={mapEl} className="absolute inset-0" role="region" aria-label={t("mapRegion")} />
      {failure && (
        <div className="absolute inset-0 z-[60] grid place-items-center p-6 bg-pedra-50 text-center">
          <p className="m-0 max-w-[32ch] text-tinta-suau"><strong className="block mb-1 font-display font-semibold text-xl text-tinta">{t("failTitle")}</strong>{failure}</p>
        </div>
      )}

      <div className="absolute z-20 top-[calc(16px+env(safe-area-inset-top,0px))] left-4 right-4 min-[900px]:right-auto min-[900px]:w-[380px] flex flex-col gap-2">
        <Search bounds={bounds} onPick={(ll) => { setSel(null); setNear(null); mapRef.current?.flyTo({ center: ll, zoom: 17.6, duration: dur(1400), essential: true }); }} />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("show")}>
          {chips.map(([k, t]) => (
            <button key={k} type="button" className="chip float label" aria-pressed={filter === k}
              onClick={() => { setFilter(k); if (sel && !inChip(sel, k)) setSel(null); }}>{t}</button>
          ))}
        </div>
      </div>

      <div className={`absolute z-10 left-0 right-0 min-[900px]:left-[412px] bottom-0 pb-[calc(16px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3 pointer-events-none
        transition-opacity ${!wide && (sel || showParked) ? "opacity-0 invisible" : ""}`}>
        <div className="flex items-end justify-between gap-3 px-4">
          <button type="button" className="float pointer-events-auto flex items-center gap-2 min-h-11 px-4 rounded-[22px] label" onClick={nearHere}>
            <MapPin size={18} strokeWidth={1.75} aria-hidden="true" />{t("nearYou")}
          </button>
          <div className="flex flex-col items-center gap-3 pointer-events-auto">
            <button type="button" className="float w-12 h-12 grid place-items-center rounded-full" aria-label={t("legendBtn")}
              aria-expanded={legend} aria-controls="legend" onClick={() => setLegend((v) => !v)}>
              <Layers size={22} strokeWidth={1.75} />
            </button>
            <button type="button" className={`float w-12 h-12 grid place-items-center rounded-full ${parked ? "!bg-mar text-sobre-mar !border-mar" : ""}`}
              aria-label={t(parked ? "parkedSee" : "parkedSave")} title={t(parked ? "parkedSee" : "parkedSave")} onClick={motoButton}>
              <Motorbike size={22} strokeWidth={1.75} />
            </button>
            <button type="button" className="float w-12 h-12 grid place-items-center rounded-full text-mar" aria-label={t("myLocation")} title={t("myLocation")} onClick={locate}>
              <LocateFixed size={22} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {/* The sheet takes their place on phones; closing it brings them back. */}
        {near && !wide && !sel && !showParked && nearPanel}
      </div>

      {near && wide && nearPanel}
      <Panel ref={sheetEl} open={!!selModel || (showParked && !!parked)} label={t(showParked ? "yourMoto" : "detail")} onClose={() => select(null)}>
        {showParked && parked
          ? <ParkedInfo p={parked} d={user ? dist(user, parked.ll) : null} onForget={() => { setParked(null); select(null); }} />
          : selModel && <Detail m={selModel} d={user ? dist(user, selModel.ll) : null} fineYear={fineYear} onBay={goNearestBay}
            onPark={() => park(selModel.ll, selModel.street)} />}
      </Panel>
      {createPortal(<Motorbike size={18} strokeWidth={2} aria-label={t("yourMoto")} />, motoEl)}
      {legend && <Legend theme={theme} pref={pref} onPref={setPref} risk={risk} onRisk={setRisk} meta={meta} lang={lng} onLang={(l) => { setLng(l); store.set("motobcn.lang", l); }} onClose={() => setLegend(false)}
        onHelp={() => { setLegend(false); setIntro(true); }} />}
      {toast && (
        <p role="status" className="absolute z-[45] left-4 right-4 top-[calc(132px+env(safe-area-inset-top,0px))] min-[900px]:top-auto min-[900px]:bottom-6 min-[900px]:left-[412px] mx-auto max-w-[420px] m-0 px-4 py-3 rounded-[16px] bg-tinta text-pedra-50 text-sm font-medium shadow-[var(--shadow-float)]">
          {toast}
        </p>
      )}
      {intro && !welcome && <Intro onClose={closeIntro} />}
      {welcome && <Welcome progress={progress} theme={theme} onEnter={() => { setWelcome(false); store.set("motobcn.welcome", "1"); }} />}
    </main>
  );
}
