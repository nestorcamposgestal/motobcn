"""Builds the map data: data/out/motobcn.pmtiles and data/out/meta.json.

Run with an optional bbox in EPSG:25831 (xmin ymin xmax ymax) to build one area only.
A full run also copies both files to web/public/data.
"""

import json
import math
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import date

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import shapely
from pyproj import Transformer

import rules
import sidewalks
import sources

OUT = sources.RAW.parent / "out"
WEB = sources.RAW.parents[1] / "web" / "public" / "data"
FINES_YEAR = 2025
# Fines carry the address position, not the exact spot of the moto.
FINES_REACH_M = 15.0
# Street labels of the municipal toponymy, from the largest (z 2) to the smallest (z 0).
LABELS = {"TOP_20_TX": 2, "TOP_22_TX": 1, "TOP_23_TX": 0}
# Layers of the detail run: tippecanoe must not drop any of their features.
DETAIL = {"aceras": 15, "pasos": 15, "calles": 14, "arboles": 16}
BASE = {"limite": 10, "manzanas": 12, "verde": 12, "suelo": 12, "zonas_moto": 13, "multas": 13}

TO_MERC = Transformer.from_crs(sources.CRS, "EPSG:3857", always_xy=True)


def clip(gdf, bbox):
    return gdf if bbox is None else gdf[gdf.intersects(shapely.box(*bbox))]


def layer(props, geometry):
    return gpd.GeoDataFrame(props, geometry=np.asarray(geometry), crs=sources.CRS)


def mtm(name, codes, bbox, columns=("NIVELL",)):
    where = "NIVELL IN ({})".format(",".join(f"'{c}'" for c in codes))
    gdf = pyogrio.read_dataframe(sources._mtm_gpkg(name), where=where, bbox=bbox, columns=list(columns))
    gdf.geometry = shapely.force_2d(gdf.geometry)
    return gdf.set_crs(sources.CRS, allow_override=True)


def polygons(geoms):
    parts = shapely.get_parts(shapely.make_valid(np.asarray(geoms)))
    return parts[(shapely.get_type_id(parts) == 3) & (shapely.area(parts) > 0.5)]


# ---------- street names ----------

TYPES = {"C.": "Carrer", "Pg.": "Passeig", "Ptge.": "Passatge", "Pl.": "Plaça", "Av.": "Avinguda",
         "Trav.": "Travessera", "Rbla.": "Rambla"}
TYPES |= {k[:-1]: v for k, v in TYPES.items()}
ARTICLES = ("de les ", "de la ", "de l'", "dels ", "del ", "de ", "d'")


def clean(text):
    text = " ".join(str(text).split())
    return text.replace("d' ", "d'").replace("l' ", "l'")


def street_key(text):
    """Groups label variants of one street: 'C. Roger de Llúria' and 'Carrer de Roger de Llúria'."""
    words = text.split(" ", 1)
    kind, rest = (TYPES.get(words[0], words[0]), words[1]) if len(words) == 2 else ("", text)
    rest = next((rest[len(a):] for a in ARTICLES if rest.startswith(a)), rest)
    fold = unicodedata.normalize("NFD", f"{kind} {rest}".lower())
    return "".join(c for c in fold if not unicodedata.combining(c))


def fold(text):
    """Lower case words without accents or punctuation, so 'Carrer d'Aragó' contains 'ARAGO'."""
    text = unicodedata.normalize("NFD", str(text).lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in text if not unicodedata.combining(c))).strip()


def named_street(names, pts, lab):
    """Accented full name of each inventory street name ('BAILEN, C., DE'): the nearest label within 300 m
    whose name contains it. None where no label matches."""
    core = np.array([fold(str(n).split(",")[0]) for n in names], dtype=object)
    names_f = np.array([fold(c) for c in lab.calle.values], dtype=object)
    ri, ti = shapely.STRtree(shapely.points(lab.x.values, lab.y.values)).query(pts, predicate="dwithin", distance=300.0)
    # Whole words only: 'ROSSELL' must not match 'Carrer del Rosselló'.
    ok = np.array([bool(core[r]) and f" {core[r]} " in f" {names_f[t]} " for r, t in zip(ri, ti)], dtype=bool)
    ri, ti = ri[ok], ti[ok]
    d = shapely.distance(pts[ri], shapely.points(lab.x.values[ti], lab.y.values[ti]))
    order = np.lexsort((d, ri))
    ri, ti = ri[order], ti[order]
    first = np.r_[True, ri[1:] != ri[:-1]] if len(ri) else np.zeros(0, bool)
    out = np.full(len(pts), None, dtype=object)
    out[ri[first]] = lab.calle.values[ti[first]]
    return out


def upright(rotate):
    """Clockwise text-rotate values that read left to right on a north-up map. Vertical labels read bottom to top."""
    screen = (np.asarray(rotate) + 180) % 360 - 180
    screen = np.where(screen > 80, screen - 180, screen)
    return np.where(screen <= -100, screen + 180, screen)


def map_rotate(x, y, deg):
    """Converts angles counterclockwise from east in EPSG:25831 into clockwise rotations on the web map."""
    a = np.radians(deg)
    x0, y0 = TO_MERC.transform(x, y)
    x1, y1 = TO_MERC.transform(x + 10 * np.cos(a), y + 10 * np.sin(a))
    return np.round(upright(-np.degrees(np.arctan2(y1 - y0, x1 - x0))), 1)


def labels(bbox):
    """Street labels with x, y, angle (counterclockwise from east), t (text) and calle (full name of the street)."""
    lab = mtm("Topònims - Detall", list(LABELS), bbox, ["NIVELL", "LITERAL", "ANGLE_TXT"])
    lab = lab[lab.LITERAL.notna()].copy()
    pts = shapely.get_geometry(lab.geometry.values, 0)
    lab["x"], lab["y"] = shapely.get_x(pts), shapely.get_y(pts)
    lab["angle"] = lab.ANGLE_TXT.fillna(0)
    lab["t"] = lab.LITERAL.map(clean)
    key = lab.t.map(street_key)
    # The full name is the longest label of the street that does not start with an abbreviation.
    full = lab.t.where(~lab.t.str.split(" ").str[0].isin(TYPES), "")
    best = pd.DataFrame({"key": key, "full": full, "t": lab.t, "n": -full.str.len(), "m": -lab.t.str.len()})
    best = best.sort_values(["n", "m"]).drop_duplicates("key").set_index("key")
    lab["calle"] = key.map(best.full.where(best.full != "", best.t))
    lab["z"] = lab.NIVELL.map(LABELS)
    return lab.reset_index(drop=True)


def nearest_street(pts, tangents, lab):
    """Street name of each point: the label whose axis runs parallel and closest; None if none fits.

    Labels sit on the street axis, one per block or less, so we measure the distance across the axis.
    Points with no parallel label (chamfers) take the nearest label within 35 m.
    """
    lx, ly = lab.x.values, lab.y.values
    ang = np.radians(lab.angle.values)
    ux, uy = np.cos(ang), np.sin(ang)
    ri, ti = shapely.STRtree(shapely.points(lx, ly)).query(pts, predicate="dwithin", distance=260.0)
    dx, dy = shapely.get_x(pts)[ri] - lx[ti], shapely.get_y(pts)[ri] - ly[ti]
    along, across = np.abs(dx * ux[ti] + dy * uy[ti]), np.abs(dy * ux[ti] - dx * uy[ti])
    par = np.abs(tangents[ri, 0] * ux[ti] + tangents[ri, 1] * uy[ti]) > math.cos(math.radians(25))
    dist = np.hypot(dx, dy)
    score = np.where(par & (across < 32), across + 0.05 * along, np.where(dist < 35, 1000 + dist, np.inf))
    ok = np.isfinite(score)
    ri, ti, score = ri[ok], ti[ok], score[ok]
    order = np.lexsort((score, ri))
    ri, ti = ri[order], ti[order]
    first = np.r_[True, ri[1:] != ri[:-1]] if len(ri) else np.zeros(0, bool)
    out = np.full(len(pts), None, dtype=object)
    out[ri[first]] = lab.calle.values[ti[first]]
    return out


# ---------- layers ----------

def pieces_layer(bbox, lab):
    pieces = rules.classify(sidewalks.load(bbox), rules.load_context(bbox))
    fines = sources.fines(FINES_YEAR)
    hits, _ = shapely.STRtree(fines.geometry.values).query(
        pieces.geometry.values, predicate="dwithin", distance=FINES_REACH_M)
    curb = pieces.geometry.values
    tangent = shapely.get_coordinates(shapely.get_point(curb, -1)) - shapely.get_coordinates(shapely.get_point(curb, 0))
    tangent /= np.maximum(np.hypot(*tangent.T), 1e-9)[:, None]
    strip = pieces["strip"].values
    # The strip shows where the moto stands; the curb is the fallback when the side is unknown.
    geometry = np.where(shapely.is_empty(strip), curb, strip)
    # tippecanoe 2.49 can give two different strings the same value when their hashes collide (12 of 528,485
    # ids in the city), so the tile feature id carries the same id as line * 1000 + piece, without that risk.
    line, k = pieces.seg_id.str.split("-", expand=True).astype(np.int64).values.T
    assert k.max() < 1000
    return layer({
        "fid": line * 1000 + k,
        "id": pieces.seg_id,
        "st": pieces.status,
        "w": pieces.width_m.round(1),
        "k": pieces.kind,
        "r": pieces.reasons,
        "n": pieces.notes,
        "bay": pieces.bay_m.round().astype("Int64"),
        "mul": np.bincount(hits, minlength=len(pieces)),
        "calle": nearest_street(shapely.line_interpolate_point(curb, 0.5, normalized=True), tangent, lab),
    }, geometry)


def bays_layer(bbox, lab):
    r = sources.reserves()
    r = clip(r[r.tipus_reserva.isin(rules.BAYS)], bbox)
    # The inventory writes names in capitals without accents; the labels have the official spelling.
    full = named_street(r.nom_carrer.values, shapely.line_interpolate_point(r.geometry.values, 0.5, normalized=True), lab)
    return layer({
        "id": r.id_sit,
        "on": np.where(r.tipus_reserva == "Motos vorera", "acera", "calzada"),
        "pl": r.num_places.round().astype("Int64"),
        "tipo": r.tipus_estacionament,
        "calle": np.where(pd.isna(full), r.nom_carrer, full),
    }, r.geometry)


def zebra_layer(crossings):
    """Each crossing as its axis in the walking direction, with the band width w in metres.

    The map draws the axis as a wide dashed line, so each dash is one stripe. The walking direction
    is taken as the long side of the minimum rectangle: crossings are about 4 m wide and most roads are wider.
    """
    rect = shapely.oriented_envelope(crossings)
    xy = shapely.get_coordinates(shapely.get_exterior_ring(rect)).reshape(-1, 5, 2)[:, :4]
    a, b, c = xy[:, 0], xy[:, 1], xy[:, 2]
    long_ab = np.hypot(*(b - a).T) >= np.hypot(*(c - b).T)
    # Axis from the middle of one short side to the middle of the other.
    start = np.where(long_ab[:, None], (a + xy[:, 3]) / 2, (a + b) / 2)
    end = np.where(long_ab[:, None], (b + c) / 2, (c + xy[:, 3]) / 2)
    width = np.where(long_ab, np.hypot(*(c - b).T), np.hypot(*(b - a).T))
    return layer({"w": width.round(1)}, shapely.linestrings(np.stack([start, end], axis=1)))


def fines_layer(bbox):
    f = clip(sources.fines(FINES_YEAR), bbox)
    return layer({"code": f.code, "tow": f.tow}, f.geometry)


def blocks_layer(bbox):
    # Dissolve the fragmented 1:1000 building polygons; close 0.15 m gaps, keep courtyards as holes.
    b = sources.topo("POLIGONS", ["CON_01pol_PL"], bbox)
    parts = shapely.get_parts(shapely.union_all(shapely.make_valid(b.geometry.values)))
    parts = shapely.buffer(shapely.buffer(parts, 0.15, join_style="mitre"), -0.15, join_style="mitre")
    parts = polygons(parts)
    return layer({}, parts[shapely.area(parts) >= 4])


def ground_layers(bbox):
    """verde (parks, forest, parterres) and suelo (pedestrian ground, squares, water, beach), each with a kind k."""
    base = {"COM_52ZU_pol_PL": "acera", "COM_06PL_pol_PL": "plaza", "COM_53PV_pol_PL": "peatonal",
            "HID_01_pol_PL": "agua", "HID_02_pol_PL": "agua", "HID_09FB_pol_PL": "agua", "VEG_08_PL": "playa",
            "VEG_07P_pol_PL": "parterre"}
    synth = {"COM_52VU_pol_PL": "parque", "COM_52VF_pol_PL": "bosque"}
    g = pd.concat([mtm("Base (Polígons)", list(base), bbox), mtm("Sintètic (Polígons)", list(synth), bbox)])
    k = g.NIVELL.map(base | synth).values
    out = {}
    for name, kinds in (("verde", ["parque", "bosque", "parterre"]), ("suelo", ["acera", "plaza", "peatonal", "agua", "playa"])):
        sel = np.isin(k, kinds)
        geoms, idx = shapely.get_parts(shapely.make_valid(g.geometry.values[sel]), return_index=True)
        ok = (shapely.get_type_id(geoms) == 3) & (shapely.area(geoms) > 0.5)
        out[name] = layer({"k": k[sel][idx[ok]]}, geoms[ok])
    return out


def labels_layer(lab):
    text = "".join(lab.t)
    bad = {ch for ch in text if ord(ch) > 255}
    assert not bad, f"characters outside Latin-1 in street labels: {bad}"
    return layer({"t": lab.t, "r": map_rotate(lab.x.values, lab.y.values, lab.angle.values), "z": lab.z},
                 shapely.points(lab.x.values, lab.y.values))


def main(bbox=None):
    OUT.mkdir(parents=True, exist_ok=True)
    # Pieces near the bbox edge need the labels just outside it.
    lab = labels(None if bbox is None else tuple(np.add(bbox, [-260, -260, 260, 260])))
    layers = {"aceras": pieces_layer(bbox, lab), "calles": labels_layer(lab), "zonas_moto": bays_layer(bbox, lab)}
    del lab
    layers["pasos"] = zebra_layer(polygons(sources.crossings(bbox).geometry.values))
    trees = sources.topo("PUNTS", ["VEG_03_PT"], bbox)
    layers["arboles"] = layer({}, trees.geometry)
    town = sources.municipality()
    layers["limite"] = layer({}, town.geometry)
    layers |= {"manzanas": blocks_layer(bbox), **ground_layers(bbox),
               "multas": fines_layer(bbox)}
    paths = {}
    for name, gdf in layers.items():
        paths[name] = OUT / f"{name}.geojsonl"
        gdf.to_crs(4326).to_file(paths[name], driver="GeoJSONSeq")
        print(name, len(gdf))

    status = layers["aceras"]
    length = shapely.length(status.geometry.values)
    wgs = town.to_crs(4326)
    center = wgs.geometry.union_all().representative_point()
    meta = {
        "built": date.today().isoformat(),
        "sources": json.loads((sources.RAW / "manifest.json").read_text()),
        "texts": rules.TEXTS,
        "status_km": {s: round(float(length[status.st.values == s].sum()) / 1000, 1) for s in status.st.unique()},
        "bounds": [round(float(v), 5) for v in wgs.total_bounds],
        "center": [round(center.x, 5), round(center.y, 5)],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    tiles(paths)
    if bbox is None:
        WEB.mkdir(parents=True, exist_ok=True)
        for f in ("motobcn.pmtiles", "meta.json"):
            shutil.copy2(OUT / f, WEB / f)
        print("copied to", WEB)


def tiles(paths):
    if shutil.which("tippecanoe") is None:
        sys.exit("tippecanoe is missing: install it (sudo apt install tippecanoe) to write motobcn.pmtiles.")

    def run(out, minzooms, extra):
        # The filter gives each layer its own minimum zoom; -r1 keeps every point at every zoom for the heatmap.
        zoom = {name: [">=", "$zoom", z] for name, z in minzooms.items()}
        subprocess.run(["tippecanoe", "-o", str(out), "--force", "-q", "-Z", str(min(minzooms.values())), "-z16",
                        "-r1", "-j", json.dumps(zoom)] + extra
                       + [arg for name in minzooms for arg in ("-L", f"{name}:{paths[name]}")], check=True)

    # Zoom 16 tiles keep every feature of the detail layers; the map overzooms them for closer views.
    run(OUT / "detail.pmtiles", DETAIL, ["--no-tile-size-limit", "--no-feature-limit", "--use-attribute-for-id=fid"])
    run(OUT / "base.pmtiles", BASE, ["--drop-densest-as-needed"])
    subprocess.run(["tile-join", "-o", str(OUT / "motobcn.pmtiles"), "--force", "-q", "--no-tile-size-limit",
                    "-n", "MotoBCN", "-N", "MotoBCN map data", "-A", "Ajuntament de Barcelona, CC BY 4.0",
                    str(OUT / "detail.pmtiles"), str(OUT / "base.pmtiles")], check=True)
    for part in ("detail", "base"):
        (OUT / f"{part}.pmtiles").unlink()
    print("motobcn.pmtiles", round((OUT / "motobcn.pmtiles").stat().st_size / 1e6, 1), "MB")


if __name__ == "__main__":
    main(tuple(map(float, sys.argv[1:5])) if len(sys.argv) == 5 else None)
