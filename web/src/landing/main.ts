import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/500.css";
import "./landing.css";
import { detect, type Lang } from "../i18n.ts";
import { drawTrencadis } from "../trencadis.ts";

// The page is written in Spanish; these replace it for Catalan and English. Keys match data-t, data-talt and data-ta.
const CA: Record<string, string> = {
  title: "MotoBCN · On aparcar la moto a Barcelona",
  desc: "El mapa de cada vorera i zona moto de Barcelona, amb el que permet l'ordenança a cada tram. Gratuït, sense registre.",
  skip: "Saltar al contingut", langs: "Idioma", open: "Obrir el mapa", how: "Com funciona",
  kicker: "Barcelona · Ordenança de circulació, art. 40",
  h1a: "Aparca la moto a Barcelona.", h1b: "Sense dubtes.",
  lead: "El mapa de totes les voreres i zones moto de la ciutat, amb el que permet l'ordenança a cada tram.",
  trust: "Gratuït · Sense registre · Castellano, català, English",
  altHero: "L'app amb una vorera seleccionada: semibateria, Avinguda Diagonal, vorera de 7,4 m.",
  s1: "quilòmetres de vorera mesurats tram a tram", s2: "zones moto, amb les seves places", s3: "regles de l'ordenança a cada tram",
  k1: "Què fa", h2a: "Tot el que necessites per aparcar, en un mapa.",
  f1: "On, d'un cop d'ull", f1d: "Cada tram de vorera té el seu color: verd o blau si pots aparcar, vermell si no.",
  f2: "I per què", f2d: "Toca una vorera: et diem com aparcar i quin article de l'ordenança s'aplica.",
  f3: "Lloc a prop teu", f3d: "Les zones moto i les voreres permeses més properes, ordenades per distància.",
  f4: "Torna a la teva moto", f4d: "Desa on aparques i torna-hi caminant sense buscar-la.",
  g1: "A prop teu", g2: "Cada vorera, a escala", g3: "La teva moto, desada",
  altNear: "A prop teu: zones moto ordenades per distància.",
  altZebra: "El mapa de prop: voreres de colors, passos de vianants i zones moto amb les seves places.",
  altMoto: "La teva moto: el carrer on has aparcat i el botó per tornar-hi.",
  k2: "L'ordenança en 30 segons", h2b: "Quant fa la vorera? Això decideix.",
  rulerAria: "Fins a 4,3 m: no es pot. De 4,3 a 6 m: en paral·lel. Més de 6 m: en semibateria.",
  r1: "No", r2: "En paral·lel", r3: "Semibateria",
  rulerNote: "Amb la moto a mig metre de la vorada han de quedar 3 m lliures per passar. Per això, en voreres de 4,3 m o menys no s'hi pot aparcar.",
  bayTag: "Zona moto", bayH: "Sempre, la primera opció.",
  bayD: "Si hi ha una zona moto amb lloc, l'ordenança la prefereix a la vorera. El mapa te la mostra amb les seves places.",
  neverTag: "Mai", n1: "A menys de 2 m d'un pas de vianants o d'una parada.", n2: "Davant de càrrega i descàrrega, places PMR, bicis o escoles.",
  n3: "En carrers de vianants, carrils bici i eixos verds.",
  k3: "Dades obertes", h2c: "Fet amb les dades de l'Ajuntament.",
  dataD: "Cada vorera es mesura sobre la cartografia municipal i es creua amb les reserves, les parades, els senyals, els carrils bici, les escoles i els hospitals. Res de suposicions: si no ho sabem, t'ho diem.",
  c1: "Cartografia 1:1000", c2: "Reserves d'aparcament", c3: "Senyals de trànsit", c4: "Parades de bus i tramvia", c5: "Carrils bici",
  c6: "Carrers de vianants", c7: "Escoles i hospitals", c8: "Multes a motos",
  note: "Orientatiu: mana sempre la senyalització. MotoBCN t'explica l'ordenança, no garanteix que no et multin.",
  ctaH: "La teva propera plaça, a un toc.",
  ctaD: "Obre-la al mòbil i afegeix-la a la pantalla d'inici: a l'iPhone, Comparteix i «Afegeix a la pantalla d'inici»; a l'Android, el menú i «Instal·la l'aplicació».",
  made: "· Fet a Barcelona", and: "i", code: "Codi obert a GitHub",
};
const EN: Record<string, string> = {
  title: "MotoBCN · Where to park your motorbike in Barcelona",
  desc: "A map of every sidewalk and moto bay in Barcelona, with what the city ordinance allows on each stretch. Free, no sign-up.",
  skip: "Skip to content", langs: "Language", open: "Open the map", how: "How it works",
  kicker: "Barcelona · Traffic ordinance, art. 40",
  h1a: "Park your motorbike in Barcelona.", h1b: "No doubts.",
  lead: "A map of every sidewalk and moto bay in the city, with what the ordinance allows on each stretch.",
  trust: "Free · No sign-up · Castellano, català, English",
  altHero: "The app with a sidewalk selected: angled parking, Avinguda Diagonal, 7.4 m sidewalk.",
  v1: "2,500+", v2: "17,800+",
  s1: "kilometres of sidewalk measured stretch by stretch", s2: "moto bays, with their places", s3: "ordinance rules checked on every stretch",
  k1: "What it does", h2a: "Everything you need to park, on one map.",
  f1: "Where, at a glance", f1d: "Every stretch of sidewalk has a colour: green or blue if you can park, red if you cannot.",
  f2: "And why", f2d: "Tap a sidewalk to see how to park there and which article of the ordinance applies.",
  f3: "A spot near you", f3d: "The nearest moto bays and allowed sidewalks, sorted by distance.",
  f4: "Back to your moto", f4d: "Save where you park and walk back without searching.",
  g1: "Near you", g2: "Every sidewalk, to scale", g3: "Your moto, saved",
  altNear: "Near you: moto bays sorted by distance.",
  altZebra: "The map up close: coloured sidewalks, pedestrian crossings and moto bays with their places.",
  altMoto: "Your moto: the street where you parked and the button to walk back.",
  k2: "The ordinance in 30 seconds", h2b: "How wide is the sidewalk? That decides.",
  rulerAria: "Up to 4.3 m: no. From 4.3 to 6 m: parallel. Over 6 m: angled.",
  r1: "No", r2: "Parallel", r3: "Angled",
  rulerNote: "With the moto half a metre from the curb, 3 m must stay clear for people to walk. So on sidewalks 4.3 m wide or less you cannot park.",
  bayTag: "Moto bay", bayH: "Always the first choice.",
  bayD: "If a moto bay has room, the ordinance prefers it to the sidewalk. The map shows it with its places.",
  neverTag: "Never", n1: "Closer than 2 m to a pedestrian crossing or a stop.", n2: "In front of loading zones, disabled parking, bike racks or schools.",
  n3: "On pedestrian streets, bike lanes and green axes.",
  k3: "Open data", h2c: "Built on the city's own data.",
  dataD: "Every sidewalk is measured on the city maps and checked against reserved zones, stops, signs, bike lanes, schools and hospitals. No guessing: if we do not know, we say so.",
  c1: "1:1000 city maps", c2: "Parking reserves", c3: "Traffic signs", c4: "Bus and tram stops", c5: "Bike lanes",
  c6: "Pedestrian streets", c7: "Schools and hospitals", c8: "Fines to motorbikes",
  note: "A guide only: the signs always decide. MotoBCN explains the ordinance; it does not promise you will not get a fine.",
  ctaH: "Your next spot, one tap away.",
  ctaD: "Open it on your phone and add it to your home screen: on iPhone, Share and «Add to Home Screen»; on Android, the menu and «Install app».",
  made: "· Made in Barcelona", and: "and", code: "Open source on GitHub",
};

// Storage can be blocked (private mode): the page then just forgets the choice.
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};

// The Spanish texts are read from the page itself, so they are written once.
const ES: Record<string, string> = { title: document.title, desc: document.querySelector('meta[name="description"]')!.getAttribute("content")! };
document.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => { ES[el.dataset.t!] = el.textContent!.trim(); });
document.querySelectorAll<HTMLElement>("[data-talt]").forEach((el) => { ES[el.dataset.talt!] = el.getAttribute("alt")!; });
document.querySelectorAll<HTMLElement>("[data-ta]").forEach((el) => { ES[el.dataset.ta!] = el.getAttribute("aria-label")!; });

function apply(lang: Lang) {
  const D = { es: ES, ca: CA, en: EN }[lang];
  document.documentElement.lang = lang;
  document.title = D.title;
  document.querySelector('meta[name="description"]')!.setAttribute("content", D.desc);
  document.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => { el.textContent = D[el.dataset.t!] ?? ES[el.dataset.t!]; });
  document.querySelectorAll<HTMLElement>("[data-talt]").forEach((el) => el.setAttribute("alt", D[el.dataset.talt!]));
  document.querySelectorAll<HTMLElement>("[data-ta]").forEach((el) => el.setAttribute("aria-label", D[el.dataset.ta!]));
  // Screenshots of the app in the same language.
  document.querySelectorAll<HTMLImageElement>("[data-shot]").forEach((img) => { img.src = `${import.meta.env.BASE_URL}landing/${img.dataset.shot}-${lang}.webp`; });
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

const saved = store.get("motobcn.lang") as Lang | null;
apply(saved && ["es", "ca", "en"].includes(saved) ? saved : detect());
document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => b.addEventListener("click", () => {
  const lang = b.dataset.lang as Lang;
  // The app reads the same key, so it opens in the language chosen here.
  store.set("motobcn.lang", lang);
  apply(lang);
}));

// Whoever opens the map from here has read what it does: skip the app's how-it-works card.
document.querySelectorAll("[data-app]").forEach((a) => a.addEventListener("click", () => store.set("motobcn.intro", "1")));

// The mosaic panels, redrawn when their size or the colour scheme changes.
const canvases = [...document.querySelectorAll<HTMLCanvasElement>("canvas.trencadis")];
const draw = () => canvases.forEach(drawTrencadis);
new ResizeObserver(draw).observe(document.body);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
