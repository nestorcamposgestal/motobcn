import { useRef, type ReactNode, type Ref, type UIEvent } from "react";
import { Navigation, Receipt, Scale, X } from "lucide-react";
import { distText, dirURL, fmt, type Model, type Tone } from "../model.ts";
import type { Option } from "../geo.ts";
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

interface SheetProps {
  m: Model | null;
  d: number | null;
  fineYear: string;
  onClose: () => void;
  onBay: () => void;
  ref?: Ref<HTMLElement>;
}
export function Sheet({ m, d, fineYear, onClose, onBay, ref }: SheetProps) {
  const dato = m ? [d != null ? distText(d) : "", m.size].filter(Boolean).join(" · ") : "";
  return (
    <section ref={ref} className="sheet" data-open={m ? "true" : "false"} aria-label="Detalle" aria-live="polite">
      <div className="flex justify-center min-[900px]:hidden">
        <button type="button" className="h-11 w-full grid place-items-center" onClick={onClose} aria-label="Cerrar detalle">
          <span className="block w-10 h-1 rounded-sm bg-linia" />
        </button>
      </div>
      <button type="button" className="icon-btn absolute top-3 right-2 hidden min-[900px]:grid" onClick={onClose} aria-label="Cerrar detalle">
        <X size={22} strokeWidth={1.75} />
      </button>
      {m && (
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain px-4 pb-5 min-[900px]:pt-5 flex flex-col gap-5">
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
            <a className="btn-primary" href={dirURL(m.ll)} target="_blank" rel="noopener">
              <Navigation size={22} strokeWidth={1.75} />Cómo llegar
            </a>
          )}
          <p className="m-0 -mt-1 text-[13px] leading-[18px] text-tinta-suau">Según la ordenanza. Revisa la señalización.</p>
        </div>
      )}
    </section>
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
}
export function Nearby({ cards, isUser, active, onActive, onOpen, onClose }: NearbyProps) {
  const settle = useRef(0);
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
    <section className="flex flex-col gap-2 pointer-events-auto" aria-label="Opciones cercanas">
      <div className="flex items-center gap-2 px-4">
        <p className="float m-0 rounded-2xl px-3 py-1.5 label leading-[18px] whitespace-nowrap">
          {isUser ? "Cerca de ti" : "Cerca del centro del mapa"}{" "}
          <span className="font-mono font-medium normal-case tracking-normal text-tinta-suau">· {cards.length}<span className="sr-only"> {cards.length === 1 ? "opción" : "opciones"}</span></span>
        </p>
        <button type="button" className="icon-btn float ml-auto" onClick={onClose} aria-label="Cerrar opciones cercanas"><X size={20} strokeWidth={1.75} /></button>
      </div>
      <ol className="cards" onScroll={onScroll}>
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
