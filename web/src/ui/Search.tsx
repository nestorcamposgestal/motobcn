import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import type { LngLat } from "../geo.ts";

interface Hit {
  label: string;
  kind: string;
  ll: LngLat;
}
const KIND: Record<string, string> = { address: "Dirección", street: "Calle", topo: "Lugar", pk: "Punto", venue: "Lugar" };

// ICGC geocoder: open CORS, no key, GeoJSON out. The rectangle keeps results inside Barcelona.
async function geocode(text: string, b: [number, number, number, number], signal: AbortSignal): Promise<Hit[]> {
  const q = new URLSearchParams({ text, size: "6", "boundary.rect.min_lon": String(b[0]), "boundary.rect.min_lat": String(b[1]),
    "boundary.rect.max_lon": String(b[2]), "boundary.rect.max_lat": String(b[3]) });
  const res = await fetch(`https://eines.icgc.cat/geocodificador/autocompletar?${q}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  return (json.features ?? []).map((f: { geometry: { coordinates: LngLat }; properties: Record<string, string> }) => ({
    label: (f.properties.etiqueta || f.properties.nom || "").replace(/, Barcelona$/, ""),
    kind: KIND[f.properties.layer] ?? "Lugar",
    ll: f.geometry.coordinates,
  }));
}

export function Search({ bounds, onPick }: { bounds: [number, number, number, number]; onPick: (ll: LngLat) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) { setHits(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      geocode(text, bounds, ctl.signal)
        .then((h) => { setHits(h); setError(false); setActive(-1); })
        .catch((e) => { if (e.name !== "AbortError") setError(true); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, bounds]);

  const pick = (h: Hit) => {
    setQ(h.label);
    setOpen(false);
    input.current?.blur();
    onPick(h.ll);
  };
  const shown = open && q.trim().length >= 3 && (hits || error);
  return (
    <form className="relative m-0" role="search" autoComplete="off"
      onSubmit={(e) => { e.preventDefault(); const h = hits?.[Math.max(0, active)]; if (h) pick(h); }}>
      <label className="float flex items-center gap-3 h-[52px] pl-4 pr-1 rounded-[16px] focus-within:outline-2 focus-within:outline-[var(--focus)] focus-within:outline-offset-1">
        <SearchIcon size={22} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Buscar calle o lugar</span>
        <input ref={input} type="search" value={q} placeholder="Buscar calle o lugar" role="combobox" aria-autocomplete="list"
          aria-expanded={!!shown} aria-controls="search-results" aria-activedescendant={active >= 0 ? `hit-${active}` : undefined}
          enterKeyHint="search" spellCheck={false}
          className="flex-1 min-w-0 h-full border-0 outline-0 bg-transparent text-[1.0625rem] placeholder:text-tinta-suau [&::-webkit-search-cancel-button]:hidden"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            const n = hits?.length ?? 0;
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
              e.preventDefault();
              setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
            } else if (e.key === "Escape") setOpen(false);
          }} />
        {q && (
          <button type="button" className="icon-btn" aria-label="Borrar búsqueda" onClick={() => { setQ(""); setHits(null); input.current?.focus(); }}>
            <X size={22} strokeWidth={1.75} />
          </button>
        )}
      </label>
      {shown && (
        <ul id="search-results" role="listbox" aria-label="Calles y lugares"
          className="float absolute top-[calc(100%+8px)] left-0 right-0 m-0 p-1.5 list-none rounded-[16px] max-h-[min(320px,50vh)] overflow-auto z-10">
          {error ? <li className="min-h-11 px-3 py-2.5 text-tinta-suau">No podemos buscar ahora. Revisa la conexión.</li>
            : hits!.length ? hits!.map((h, i) => (
              <li key={h.label + i} id={`hit-${i}`} role="option" aria-selected={i === active}
                className="min-h-11 px-3 py-2.5 rounded-[8px] flex items-center justify-between gap-3 cursor-pointer hover:bg-mar-suau aria-selected:bg-mar-suau"
                onPointerDown={(e) => { e.preventDefault(); pick(h); }}>
                <span>{h.label}</span><small className="flex-none text-[13px] text-tinta-suau">{h.kind}</small>
              </li>
            )) : <li className="min-h-11 px-3 py-2.5 text-tinta-suau">Nada se llama así en Barcelona.</li>}
        </ul>
      )}
    </form>
  );
}
