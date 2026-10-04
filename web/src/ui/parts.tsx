import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type TouchEvent, type UIEvent } from "react";
import { Motorbike, Navigation, Receipt, Scale, SquareParking, X } from "lucide-react";
import { distText, dirURL, fmt, type Model, type Tone } from "../model.ts";
import type { LngLat, Option } from "../geo.ts";
import type { Place } from "../model.ts";

// Status marks drawn like Lucide (1.75 px stroke): each state has its own shape, never colour alone.
const TONE: Record<Tone, ReactNode> = {
  ok: <path d="M20 6 9 17l-5-5" />,
  semi: <path d="M5 18 11 6M13 18l6-12" />,
  no: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  prob: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></>,
  nodata: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></>,
  bay: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" /></>,
};
export const ToneIcon = ({ tone, size = 16 }: { tone: Tone; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TONE[tone]}</svg>
);
export const Tag = ({ m }: { m: Pick<Model, "tone" | "label"> }) => (
  <span className={`tag label t-${m.tone}`}><ToneIcon tone={m.tone} />{m.label}</span>
);

// Phones: drag down to close. The element follows the finger and closes past 80 px.
// A gesture that starts sideways, or while the content is scrolled, is left to the browser.
// base is where the element rests now (px down); settle, if given, decides what a release does.
interface SwipeOpts {
  scroller?: () => HTMLElement | null;
  base?: () => number;
  settle?: (dy: number, v: number) => void;
}
export function useSwipeDown(onClose: () => void, { scroller, base, settle }: SwipeOpts = {}) {
  const g = useRef<{ x: number; y: number; py: number; pt: number; dy: number; v: number; base: number; on: boolean | null } | null>(null);
  const end = (e: TouchEvent<HTMLElement>) => {
    const s = g.current, el = e.currentTarget;
    g.current = null;
    if (!s?.on) return;
    const reset = () => { el.style.transition = ""; el.style.transform = ""; };
    // A short drag can still fire a click when the finger lifts; it must not undo what the drag did.
    const swallow = (c: MouseEvent) => c.stopPropagation();
    el.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 400);
    // Clear the drag offset after the new state renders, so the sheet moves on from where the finger left it.
    if (settle) settle(s.dy, s.v);
    else if (s.dy > 80) onClose();
    else return reset();
    requestAnimationFrame(reset);
  };
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0], b = base?.() ?? 0;
      g.current = matchMedia("(min-width: 900px)").matches || (!b && (scroller?.()?.scrollTop ?? 0) > 0)
        ? null : { x: t.clientX, y: t.clientY, py: t.clientY, pt: e.timeStamp, dy: 0, v: 0, base: b, on: null };
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      const s = g.current, t = e.touches[0];
      if (!s || s.on === false) return;
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (s.on === null) {
        if (Math.hypot(dx, dy) < 8) return;
        // Up only when there is room to rise, as from the compact sheet.
        s.on = Math.abs(dy) > Math.abs(dx) && (dy > 0 || s.base > 0);
        if (!s.on) return;
      }
      // Speed in px/ms over the last move, to tell a flick from a slow drag.
      s.v = (t.clientY - s.py) / Math.max(1, e.timeStamp - s.pt);
      s.py = t.clientY;
      s.pt = e.timeStamp;
      s.dy = Math.max(-s.base, dy);
      e.currentTarget.style.transition = "none";
      e.currentTarget.style.transform = `translateY(${s.base + s.dy}px)`;
    },
    onTouchEnd: end,
    onTouchCancel: end,
  };
}

interface PanelProps {
  open: boolean;
  label: string;
  onClose: () => void;
  ref?: RefObject<HTMLElement | null>;
  children: ReactNode;
}
// The bottom sheet on phones, the side panel on wide screens.
// On phones a calm drag down leaves it compact, with only the first block in view, so the rider can tap
// place after place on the map; a flick or a long drag closes it, a tap or a drag up opens it again.
export function Panel({ open, label, onClose, ref, children }: PanelProps) {
  const own = useRef<HTMLElement>(null);
  const el = ref ?? own;
  const body = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState(false);
  useEffect(() => { if (!open) setPeek(false); }, [open]);
  // --peek moves the sheet down until only the first block shows. Measured on every render: the content changes.
  useLayoutEffect(() => {
    const s = el.current, head = body.current?.firstElementChild;
    if (!peek || !s || !head) return;
    const shown = head.getBoundingClientRect().bottom - s.getBoundingClientRect().top + 16;
    s.style.setProperty("--peek", `${Math.max(0, s.offsetHeight - shown - parseFloat(getComputedStyle(s).paddingBottom))}px`);
  });
  const swipe = useSwipeDown(onClose, {
    scroller: () => body.current,
    base: () => (peek ? parseFloat(el.current?.style.getPropertyValue("--peek") ?? "") || 0 : 0),
    settle: (dy, v) => {
      if (peek) {
        if (dy < -30 || v < -0.4) setPeek(false);
        else if (dy > 30 || v > 0.6) onClose();
      } else if ((v > 0.5 && dy > 140) || dy > (el.current?.offsetHeight ?? 0) * 0.6) onClose();
      // A short flick or a calm drag leaves it compact.
      else if (dy > 60 || (v > 0.3 && dy > 15)) setPeek(true);
    },
  });
  return (
    <section ref={el} className="sheet" data-open={open ? "true" : "false"} data-peek={peek ? "true" : "false"} aria-label={label}
      aria-live="polite" {...swipe} onClick={() => peek && setPeek(false)}>
      <div className="flex justify-center min-[900px]:hidden">
        <button type="button" className="h-11 w-full grid place-items-center" onClick={peek ? undefined : onClose} aria-label={peek ? "Ampliar" : "Cerrar"}>
          <span className="block w-10 h-1 rounded-sm bg-linia" />
        </button>
      </div>
      <button type="button" className="icon-btn absolute top-3 right-2 hidden min-[900px]:grid" onClick={onClose} aria-label="Cerrar">
        <X size={22} strokeWidth={1.75} />
      </button>
      {open && <div ref={body} className="flex-1 min-h-0 overflow-auto overscroll-contain px-4 pb-5 min-[900px]:pt-5 flex flex-col gap-5">{children}</div>}
    </section>
  );
}

interface DetailProps {
  m: Model;
  d: number | null;
  fineYear: string;
  onBay: () => void;
  onPark: () => void;
}
export function Detail({ m, d, fineYear, onBay, onPark }: DetailProps) {
  const dato = [d != null ? distText(d) : "", m.size].filter(Boolean).join(" · ");
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2 pr-11">
          <Tag m={m} />
          {dato && <span className="dato">{dato}</span>}
        </div>
        <h2 className="m-0 mt-1 font-display font-semibold text-[28px] leading-8 tracking-[-0.01em] text-balance [overflow-wrap:anywhere]">{m.street}</h2>
        {m.sub && <p className="m-0 text-sm text-tinta-suau">{m.sub}</p>}
      </div>
      {m.body.map((t) => <p key={t} className="m-0 max-w-[60ch]">{t}</p>)}
      <ul className="m-0 p-0 list-none flex flex-col gap-2 -mt-2">
        {m.bayM != null && m.tone !== "bay" && (
          <li>
            <button type="button" className="linkrow" onClick={onBay}>
              <ToneIcon tone="bay" size={20} />
              {m.bayM <= 100 ? "Zona moto cerca: es la opción preferente" : "Zona moto más cercana"}
              <span className="dato">{distText(m.bayM)}</span>
            </button>
          </li>
        )}
        {m.fines != null && (
          <li className="flex items-center gap-2.5 text-[15px] text-tinta">
            <Receipt size={20} strokeWidth={1.75} />
            {m.fines ? `${fmt(m.fines, 0)} ${m.fines === 1 ? "multa" : "multas"} a motos cerca de este tramo en ${fineYear}.` : `Ninguna multa a motos cerca de este tramo en ${fineYear}.`}
          </li>
        )}
        <li className="flex items-center gap-2.5 text-[13px] leading-[18px] text-tinta-suau">
          <Scale size={20} strokeWidth={1.75} className="text-tinta" />{m.law}
        </li>
      </ul>
      {m.go && (
        <div className="flex flex-col gap-2">
          <a className="btn-primary" href={dirURL(m.ll)} target="_blank" rel="noopener">
            <Navigation size={22} strokeWidth={1.75} />Cómo llegar
          </a>
          <button type="button" className="linkrow" onClick={onPark}>
            <SquareParking size={20} strokeWidth={1.75} />He aparcado aquí
          </button>
        </div>
      )}
      <p className="m-0 -mt-1 text-[13px] leading-[18px] text-tinta-suau">Según la ordenanza. Revisa la señalización.</p>
    </>
  );
}

export interface Parked {
  ll: LngLat;
  // Time it was saved, in ms since the epoch.
  t: number;
  street?: string;
}
const ago = (t: number) => {
  const min = Math.round((Date.now() - t) / 60000);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (min < 1) return "ahora mismo";
  if (min < 60) return rtf.format(-min, "minute");
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / 1440), "day");
};
export function ParkedInfo({ p, d, onForget }: { p: Parked; d: number | null; onForget: () => void }) {
  const when = new Date(p.t).toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2 pr-11">
          <span className="tag label t-moto"><Motorbike size={16} strokeWidth={2.25} aria-hidden="true" />TU MOTO</span>
          <span className="dato">{[d != null ? distText(d) : "", ago(p.t)].filter(Boolean).join(" · ")}</span>
        </div>
        <h2 className="m-0 mt-1 font-display font-semibold text-[28px] leading-8 tracking-[-0.01em] text-balance [overflow-wrap:anywhere]">{p.street || "Donde aparcaste"}</h2>
        <p className="m-0 text-sm text-tinta-suau">Guardada el {when}. Solo se guarda en este dispositivo.</p>
      </div>
      <div className="flex flex-col gap-2">
        <a className="btn-primary" href={dirURL(p.ll, "walking")} target="_blank" rel="noopener">
          <Navigation size={22} strokeWidth={1.75} />Volver a la moto
        </a>
        <button type="button" className="linkrow" onClick={onForget}>
          <X size={20} strokeWidth={1.75} />Ya la he recogido
        </button>
      </div>
    </>
  );
}

export interface Card {
  o: Option<Place & { st?: string }>;
  m: Model;
}
interface NearbyProps {
  cards: Card[];
  isUser: boolean;
  active: number;
  onActive: (i: number) => void;
  onOpen: (i: number) => void;
  onClose: () => void;
  // Wide screens: a vertical list in the left column instead of the swipeable row.
  side?: boolean;
}
export function Nearby({ cards, isUser, active, onActive, onOpen, onClose, side }: NearbyProps) {
  const settle = useRef(0);
  const swipe = useSwipeDown(onClose);
  // A swipe that settles on a card highlights it on the map; a tap opens its detail.
  const onScroll = (e: UIEvent<HTMLOListElement>) => {
    const el = e.currentTarget;
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bd = Infinity;
      [...el.children].forEach((li, i) => {
        const c = li as HTMLElement, dd = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best !== active) onActive(best);
    }, 140);
  };
  return (
    <section className={side ? "side-panel absolute z-20 left-4 top-[136px] w-[380px] max-h-[calc(100%-152px)] flex flex-col"
      : "flex flex-col gap-2 pointer-events-auto transition-transform duration-200"} aria-label="Opciones cercanas" {...(side ? {} : swipe)}>
      <div className={`flex items-center gap-2 ${side ? "pl-5 pr-2 pt-3 pb-1" : "px-4"}`}>
        <p className={`m-0 label leading-[18px] whitespace-nowrap ${side ? "" : "float rounded-2xl px-3 py-1.5"}`}>
          {isUser ? "Cerca de ti" : "Cerca del centro del mapa"}{" "}
          <span className="font-mono font-medium normal-case tracking-normal text-tinta-suau">· {cards.length}<span className="sr-only"> {cards.length === 1 ? "opción" : "opciones"}</span></span>
        </p>
        <button type="button" className={`icon-btn ml-auto ${side ? "" : "float !bg-pedra-100"}`} onClick={onClose} aria-label="Cerrar opciones cercanas"><X size={20} strokeWidth={1.75} /></button>
      </div>
      <ol className={side ? "m-0 px-3 pt-1 pb-3 list-none flex flex-col gap-3 overflow-auto overscroll-contain" : "cards"} onScroll={side ? undefined : onScroll}>
        {cards.length ? cards.map(({ o, m }, i) => (
          <li key={o.kind + o.id} className="card float rounded-[16px] p-3.5 flex flex-col gap-3" aria-current={i === active}>
            <button type="button" className="flex flex-col gap-1.5 w-full p-0 border-0 bg-transparent text-left rounded-[8px]"
              onClick={() => onOpen(i)} aria-label={`${m.label}, ${m.street}, a ${distText(o.d)}. Ver detalle`}>
              <span className="flex items-center justify-between gap-2"><Tag m={m} /><span className="dato">{distText(o.d)}</span></span>
              <span className="font-display font-semibold text-xl leading-tight line-clamp-2">{m.street}</span>
              <span className="text-sm text-tinta-suau">{o.kind === "bay" ? `${m.size} · ${m.sub.split(" · ")[0].toLowerCase()}` : m.size || "acera sin medir"}</span>
            </button>
            <a className="btn-primary !min-h-11 text-[15px]" href={dirURL(m.ll)} target="_blank" rel="noopener">
              <Navigation size={20} strokeWidth={1.75} />Cómo llegar
            </a>
          </li>
        )) : (
          <li className="card float rounded-[16px] p-3.5 text-tinta-suau">Nada para aparcar a menos de 300 m. Mueve el mapa y vuelve a probar.</li>
        )}
      </ol>
    </section>
  );
}
