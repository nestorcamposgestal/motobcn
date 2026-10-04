import { useEffect, useRef, type ReactNode } from "react";
import { Hand, MapPin, Motorbike, X } from "lucide-react";
import { useSwipeDown } from "./parts.tsx";

// The four map colours, as short bars: what the first tip explains.
const Colours = () => (
  <span className="grid gap-[3px] w-6" aria-hidden="true">
    {["--st-ok", "--st-semi", "--st-bay", "--st-no"].map((c) => <span key={c} className="block h-[5px] rounded-[3px]" style={{ background: `var(${c})` }} />)}
  </span>
);

const TIPS: [ReactNode, string, string][] = [
  [<Colours />, "Verde o azul:", "aparca. Rojo: no."],
  [<Hand size={22} strokeWidth={1.75} />, "Toca una acera", "y te decimos cómo aparcar y por qué."],
  [<MapPin size={22} strokeWidth={1.75} />, "Cerca de ti", "te enseña los mejores sitios a tu alrededor."],
  [<Motorbike size={22} strokeWidth={1.75} />, "Guarda tu moto", "y vuelve a ella sin buscar."],
];

// First visit: what the app does, in four lines. It can be opened again from the legend.
export function Intro({ onClose }: { onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const swipe = useSwipeDown(onClose);
  // Focus for keyboards and screen readers, without the ring on a card that opens by itself.
  useEffect(() => btn.current?.focus({ focusVisible: false } as FocusOptions), []);
  return (
    <div className="absolute inset-0 z-[55] grid items-end min-[900px]:place-items-center bg-[color-mix(in_srgb,var(--tinta)_28%,transparent)] intro-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="intro-title" {...swipe}
        className="intro-card relative w-full min-[900px]:w-[420px] bg-pedra-100 rounded-t-[28px] min-[900px]:rounded-[28px] shadow-[var(--shadow-sheet)]
          px-6 pt-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] transition-transform duration-200">
        <span className="block w-10 h-1 mx-auto -mt-2 mb-4 rounded-sm bg-linia min-[900px]:hidden" aria-hidden="true" />
        <button type="button" className="icon-btn absolute top-3 right-3" onClick={onClose} aria-label="Cerrar"><X size={22} strokeWidth={1.75} /></button>
        <p className="m-0 label text-mar">Cómo funciona</p>
        <h2 id="intro-title" className="m-0 mt-1 font-display font-semibold text-[28px] leading-8 tracking-[-0.01em]">Aparca sin dudas</h2>
        <ul className="m-0 mt-5 p-0 list-none flex flex-col gap-3.5">
          {TIPS.map(([icon, lead, rest], i) => (
            <li key={lead} className="intro-tip flex items-center gap-3.5" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="flex-none w-11 h-11 grid place-items-center rounded-[12px] bg-mar-suau text-mar">{icon}</span>
              <span className="text-[16px] leading-[22px]"><b className="font-bold">{lead}</b> {rest}</span>
            </li>
          ))}
        </ul>
        <button ref={btn} type="button" className="btn-primary w-full mt-6" onClick={onClose}>Empezar</button>
        <p className="m-0 mt-3 text-center text-[13px] leading-[18px] text-tinta-suau">Orientativo: manda la señalización.</p>
      </section>
    </div>
  );
}
