"""Prepares the data for the MotoBCN design prototype. Throwaway code.

Run: cd pipeline && ~/.local/bin/uv run python ../design/prototipo/prep.py
Writes WGS84 GeoJSON files into design/prototipo/data/.

Widths come from sidewalks.py and the status from rules.py.
"""

import json
import math
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
import shapely
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "pipeline"))
import rules  # noqa: E402
import sidewalks  # noqa: E402
import sources  # noqa: E402

MTM = sources.RAW / "mtm"
OUT = HERE / "data"
FINES = Path("/tmp/claude-1001/-home-nestor-projects-motobcn/75696faf-792e-4c3a-905d-3800858d4c94"
             "/scratchpad/data/denuncies_2025_4t.csv")
FINE_CODES = {1038, 1050, 1051, 1052, 1064, 1080, 1081, 1083, 1133, 1134, 1156, 1158, 1159, 1163, 1164, 1165}

# Demo area: a rectangle aligned with the Cerda grid. u runs along the sea-parallel streets (towards
# the Besos), v runs towards the mountain. The origin is the Placa de Catalunya label.
ORIGIN = np.array([430609.0, 4582054.0])
GRID = math.radians(44.35)  # angle of the sea-parallel streets in EPSG:25831, measured from curbs and labels
AXIS_U = np.array([math.cos(GRID), math.sin(GRID)])
AXIS_V = np.array([-math.sin(GRID), math.cos(GRID)])
U_RANGE, V_RANGE = (-430.0, 1090.0), (-150.0, 2830.0)


# Status codes of a sidewalk piece. The page uses the same numbers.
PARALELO, SEMIBATERIA, ESTRECHA, SIN_3M, PASO, SIN_DATOS = range(6)


def rule_status(st, reasons):
    """Maps a rules.py status to the page code. Prohibitions other than width use code PASO."""
    if st not in ("prohibido", "senal"):
        return {"paralelo": PARALELO, "semibateria": SEMIBATERIA}.get(st, SIN_DATOS)
    codes = reasons.split("|")
    return ESTRECHA if "acera_estrecha" in codes else SIN_3M if "sin_paso_libre" in codes else PASO


def uv_to_xy(u, v):
    return ORIGIN + np.outer(u, AXIS_U) + np.outer(v, AXIS_V)


corners = uv_to_xy(np.array([U_RANGE[0], U_RANGE[1], U_RANGE[1], U_RANGE[0]]),
                   np.array([V_RANGE[0], V_RANGE[0], V_RANGE[1], V_RANGE[1]]))
AREA = shapely.Polygon(corners)
shapely.prepare(AREA)
MARGIN = 60.0
BBOX = tuple(np.r_[corners.min(axis=0) - MARGIN, corners.max(axis=0) + MARGIN])
AREA_PAD = AREA.buffer(MARGIN, join_style="mitre")

TO_WGS = Transformer.from_crs(sources.CRS, "EPSG:4326", always_xy=True)
TO_MERC = Transformer.from_crs(sources.CRS, "EPSG:3857", always_xy=True)


def merc_angle(x, y, deg):
    """Converts angles measured counterclockwise from east in EPSG:25831 into the same angle on the web map."""
    x, y, a = np.asarray(x, float), np.asarray(y, float), np.radians(deg)
    x0, y0 = TO_MERC.transform(x, y)
    x1, y1 = TO_MERC.transform(x + 10 * np.cos(a), y + 10 * np.sin(a))
    return np.degrees(np.arctan2(y1 - y0, x1 - x0))


# Map bearing that puts the mountain at the top, as locals read Barcelona.
_c = uv_to_xy(np.array([500.0]), np.array([1400.0]))[0]
BEARING = float(90 - merc_angle(_c[0], _c[1], math.degrees(GRID) + 90))


def upright(rotate):
    """MapLibre text-rotate values made readable on screen at BEARING. Vertical labels read bottom to top."""
    screen = (np.asarray(rotate) - BEARING + 180) % 360 - 180
    screen = np.where(screen > 80, screen - 180, screen)
    screen = np.where(screen <= -100, screen + 180, screen)
    return screen + BEARING


def label_rotate(x, y, angle_txt):
    return np.round(upright(-merc_angle(x, y, angle_txt)), 1)


# ---------- reading ----------

def read_mtm(name, codes, columns=("NIVELL",)):
    where = "NIVELL IN ({})".format(",".join(f"'{c}'" for c in codes))
    gdf = pyogrio.read_dataframe(MTM / f"{name}.gpkg", bbox=BBOX, where=where, columns=list(columns))
    gdf.geometry = shapely.force_2d(gdf.geometry)
    return gdf


def clip_polys(geoms, simplify):
    geoms = shapely.intersection(shapely.make_valid(np.asarray(geoms)), AREA)
    geoms = shapely.simplify(geoms, simplify)
    parts = shapely.get_parts(geoms)
    return parts[(shapely.get_type_id(parts) == 3) & (shapely.area(parts) > 0.5)]


# ---------- writing ----------

def lonlat(coords):
    lon, lat = TO_WGS.transform(coords[:, 0], coords[:, 1])
    return np.round(np.c_[lon, lat], 6)


def to_wgs(geom):
    return shapely.transform(geom, lonlat)


def write(name, features):
    text = json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False,
                      separators=(",", ":"))
    (OUT / name).write_text(text, encoding="utf-8")
    print(f"{name}: {len(features)} features, {len(text) / 1e6:.2f} MB")


def feature(geom, props=None, fid=None):
    f = {"type": "Feature", "properties": props or {},
         "geometry": json.loads(shapely.to_geojson(to_wgs(geom)))}
    if fid is not None:
        f["id"] = fid
    return f


def check_glyphs(text):
    # The page ships glyphs 0-255 only.
    bad = {ch for ch in text if ord(ch) > 255}
    assert not bad, f"characters outside 0-255 in labels: {bad}"


# ---------- street names ----------

TYPES = {"C": "Carrer", "C.": "Carrer", "Pg": "Passeig", "Pg.": "Passeig", "Ptge": "Passatge",
         "Ptge.": "Passatge", "Pl": "Plaça", "Pl.": "Plaça", "Av": "Avinguda", "Av.": "Avinguda",
         "Trav.": "Travessera", "Rbla.": "Rambla", "Rbla": "Rambla"}
ARTICLES = ("de les ", "de la ", "de l'", "dels ", "del ", "de ", "d'")


def clean(text):
    text = " ".join(str(text).split())
    for a in ("d' ", "l' "):
        text = text.replace(a, a[:-1])
    return text


def street_key(text):
    """Groups label variants of one street: 'C. Roger de Lluria' and 'Carrer de Roger de Lluria'."""
    words = text.split(" ", 1)
    kind, rest = (TYPES.get(words[0], words[0]), words[1]) if len(words) == 2 else ("", text)
    for a in ARTICLES:
        if rest.startswith(a):
            rest = rest[len(a):]
            break
    fold = unicodedata.normalize("NFD", f"{kind} {rest}".lower())
    return "".join(c for c in fold if not unicodedata.combining(c))


def nearest_street(pts, tangents, labels):
    """Street index of each point: the label whose axis runs parallel and closest; -1 if none fits.

    Labels sit on the street axis, one per block or less, so we measure the distance across the axis.
    Points with no parallel label (chamfers) take the nearest label within 35 m.
    """
    lx, ly = labels.x.values, labels.y.values
    ang = np.radians(labels.ANGLE_TXT.fillna(0).values)
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
    out = np.full(len(pts), -1)
    out[ri[first]] = labels.n.values[ti[first]]
    return out


def main():
    OUT.mkdir(exist_ok=True)
    print("bearing", round(BEARING, 2), "bbox", [round(b) for b in BBOX])

    # Ground: pedestrian surface bounded by curbs, squares, green, water.
    base = read_mtm("Base (Polígons)", ["COM_52ZU_pol_PL", "COM_06PL_pol_PL", "COM_53PV_pol_PL",
                                        "VEG_07P_pol_PL", "HID_09FB_pol_PL", "COM_51PV_pol_PL"])
    parks = read_mtm("Sintètic (Polígons)", ["COM_52VU_pol_PL"])
    kinds = {"COM_52ZU_pol_PL": "i", "COM_06PL_pol_PL": "p", "COM_53PV_pol_PL": "v",
             "VEG_07P_pol_PL": "g", "HID_09FB_pol_PL": "a"}
    ground = []
    for code, k in kinds.items():
        geoms = clip_polys(base.geometry[base.NIVELL == code].values, 0.2)
        if k == "i":
            walk = shapely.union_all(geoms)  # used below to find the sidewalk side of each curb
        ground += [feature(g, {"k": k}) for g in geoms]
    ground += [feature(g, {"k": "q"}) for g in clip_polys(parks.geometry.values, 0.5)]
    write("suelo.json", ground)
    shapely.prepare(walk)

    # Blocks: dissolve the fragmented 1:1000 building polygons, keep courtyards as holes.
    buildings = sources.topo("POLIGONS", ["CON_01pol_PL"], BBOX)
    buildings = buildings[buildings.intersects(AREA_PAD)]
    blocks = shapely.union_all(shapely.make_valid(buildings.geometry.values))
    blocks = shapely.buffer(shapely.buffer(blocks, 0.15, join_style="mitre"), -0.15, join_style="mitre")
    out = []
    for poly in shapely.get_parts(shapely.intersection(blocks, AREA)):
        if shapely.get_type_id(poly) != 3 or poly.area < 4:
            continue
        holes = [r for r in poly.interiors if shapely.Polygon(r).area >= 12]
        poly = shapely.simplify(shapely.Polygon(poly.exterior, holes), 0.3)
        if not poly.is_empty:
            out.append(feature(poly))
    write("manzanas.json", out)
    del buildings, blocks

    # Crossings as centre lines with their width, drawn as zebra dashes by the page.
    crossings = clip_polys(base.geometry[base.NIVELL == "COM_51PV_pol_PL"].values, 0.1)
    zebra = []
    for poly in crossings:
        env = shapely.oriented_envelope(poly)
        if shapely.get_type_id(env) != 3:
            continue
        rect = np.asarray(env.exterior.coords)[:4]
        best = None
        for a in (0, 1):
            p0, p1, p2, p3 = rect[a], rect[a + 1], rect[a + 2], rect[(a + 3) % 4]
            ends = [(p0 + p3) / 2, (p1 + p2) / 2]  # walking axis runs between these two points
            touch = sum(walk.distance(shapely.Point(e)) < 1.0 for e in ends)
            width = float(np.hypot(*(p0 - p3)))
            length = float(np.hypot(*(ends[1] - ends[0])))
            score = (touch, length)
            if best is None or score > best[0]:
                best = (score, ends, width)
        (_, length), ends, width = best
        if length > 1.5 and 1.5 < width < 12:
            zebra.append(feature(shapely.LineString(ends), {"w": round(width, 1)}))
    write("pasos.json", zebra)

    # Street labels from the municipal toponymy, rotated like the official map.
    lab = read_mtm("Topònims - Detall", ["TOP_20_TX", "TOP_22_TX", "TOP_23_TX", "ADR_01_TX"],
                   ["NIVELL", "LITERAL", "ANGLE_TXT"])
    lab = lab[lab.geometry.within(AREA)].copy()
    lab["LITERAL"] = lab.LITERAL.map(clean)
    xy = np.array([(g.geoms[0].x, g.geoms[0].y) for g in lab.geometry])
    lab["x"], lab["y"] = xy[:, 0], xy[:, 1]
    lab["rot"] = label_rotate(lab.x, lab.y, lab.ANGLE_TXT.fillna(0))
    streets = lab[lab.NIVELL != "ADR_01_TX"].copy()
    numbers = lab[lab.NIVELL == "ADR_01_TX"].copy()
    streets["key"] = streets.LITERAL.map(street_key)
    names = []
    for key, g in streets.groupby("key", sort=False):
        full = [t for t in g.LITERAL if t.split(" ", 1)[0] not in TYPES]
        name = max(full or list(g.LITERAL), key=len)
        lo, la = TO_WGS.transform(g.x.values, g.y.values)
        names.append({"key": key, "name": name,
                      "bbox": [round(min(lo), 6), round(min(la), 6), round(max(lo), 6), round(max(la), 6)]})
    names.sort(key=lambda n: street_key(n["name"]))
    index = {n["key"]: i for i, n in enumerate(names)}
    streets["n"] = streets.key.map(index)
    size = {"TOP_20_TX": 2, "TOP_22_TX": 1, "TOP_23_TX": 0}
    label_feats = [feature(shapely.Point(r.x, r.y), {"t": r.LITERAL, "r": r.rot, "z": size[r.NIVELL], "n": int(r.n)})
                   for r in streets.itertuples()]
    feats = label_feats

    # Neighbourhoods, districts, heritage buildings and metro stations.
    adm = read_mtm("Topònims - Bàsic", ["ADM_02_RT", "ADM_03_RT"], ["NIVELL", "LITERAL"])
    adm = adm[adm.geometry.within(AREA)]
    for r in adm.itertuples():
        p = r.geometry.geoms[0]
        feats.append(feature(p, {"t": clean(r.LITERAL), "r": round(BEARING, 1),
                                 "z": 4 if r.NIVELL == "ADM_02_RT" else 3}))
    txt = read_mtm("Topogràfic (Textos)", ["TOP_06_TX", "TOP_17_TX"], ["NIVELL", "LITERAL"])
    txt = txt[txt.geometry.within(AREA)]
    heritage = txt[txt.NIVELL == "TOP_06_TX"].drop_duplicates("LITERAL")
    for r in heritage.itertuples():
        t = clean(r.LITERAL).replace('"', "")
        if len(t) <= 34 and not t.lower().startswith("edificació"):
            feats.append(feature(r.geometry.geoms[0], {"t": t, "r": round(BEARING, 1), "z": 5}))
    metro = txt[txt.NIVELL == "TOP_17_TX"].copy()
    metro["LITERAL"] = metro.LITERAL.map(clean).str.replace("Metro ", "", regex=False)
    for name, g in metro.groupby("LITERAL"):
        c = shapely.centroid(shapely.union_all(g.geometry.values))
        feats.append(feature(c, {"t": name, "r": round(BEARING, 1), "z": 6}))
    write("portales.json", [feature(shapely.Point(r.x, r.y), {"t": r.LITERAL, "r": r.rot})
                            for r in numbers.itertuples() if isinstance(r.LITERAL, str)])

    # Trees and street lamps: one MultiPoint each keeps the file small.
    pts = sources.topo("PUNTS", ["VEG_03_PT", "ENE_06_PT"], BBOX)
    pts = pts[pts.geometry.within(AREA)]
    write("puntos.json", [feature(shapely.union_all(pts.geometry[pts.NIVELL == code].values), {"k": k})
                          for code, k in (("VEG_03_PT", "arbol"), ("ENE_06_PT", "farola"))])

    # Moto bays.
    res = sources.reserves()
    res = res[res.tipus_reserva.isin(["Motos calçada", "Motos vorera"]) & res.intersects(AREA_PAD)].copy()
    res = res[~res.geometry.is_empty].reset_index(drop=True)
    kind = {"Batería": "bateria", "Línea": "linea", "Chaflán": "chaflan"}
    g = res.geometry.values
    tang = (shapely.get_coordinates(shapely.line_interpolate_point(g, 1.0, normalized=True))
            - shapely.get_coordinates(shapely.line_interpolate_point(g, 0.0, normalized=True)))
    tang /= np.maximum(np.hypot(tang[:, 0], tang[:, 1]), 1e-9)[:, None]
    bay_street = nearest_street(shapely.line_interpolate_point(g, 0.5, normalized=True), tang, streets)
    bays = []
    for i, r in res.iterrows():
        places = int(r.num_places) if pd.notna(r.num_places) else None
        bays.append(feature(r.geometry, {"p": places, "e": kind.get(r.tipus_estacionament, "otro"),
                                         "v": int(r.tipus_reserva == "Motos vorera"), "n": int(bay_street[i])},
                            fid=i))
    write("motos.json", bays)
    print("bays with street", int((bay_street >= 0).sum()), "of", len(bay_street))

    # Fines to motorcycles for sidewalk parking, Q4 2025, grouped by position.
    fines = pd.read_csv(FINES, usecols=["Infraccio_Codi", "Tipus_Vehicle_Codi", "X_ETRS89", "Y_ETRS89"],
                        dtype={"Tipus_Vehicle_Codi": str})
    fines = fines[fines.Infraccio_Codi.isin(FINE_CODES) & fines.Tipus_Vehicle_Codi.str.strip().isin(["M", "CM", "VL"])]
    fines = fines.assign(x=pd.to_numeric(fines.X_ETRS89, errors="coerce"),
                         y=pd.to_numeric(fines.Y_ETRS89, errors="coerce")).dropna(subset=["x", "y"])
    spots = fines.groupby([fines.x.round(1), fines.y.round(1)]).size().rename("n").reset_index()
    spot_pts = shapely.points(spots.x.values, spots.y.values)
    keep = shapely.contains_xy(AREA_PAD, spots.x.values, spots.y.values)
    print("fines kept", len(fines), "spots", len(spots), "in area", int(keep.sum()))
    write("multas.json", [feature(p, {"n": int(n)}) for p, n, k in zip(spot_pts, spots.n, keep)
                          if k and shapely.contains(AREA, p)])

    # ---------- sidewalk pieces ----------
    sw = rules.classify(sidewalks.load(BBOX), rules.load_context(BBOX))
    sw = sw[shapely.contains_xy(AREA, *shapely.get_coordinates(
        shapely.line_interpolate_point(sw.geometry.values, 0.5, normalized=True)).T)]
    # The page draws every piece with its sidewalk on the right (positive line-offset). side 1 means
    # the sidewalk is on the left, so those curb lines run backwards, pieces in reverse order too,
    # so that consecutive pieces still join end to start.
    sw = sw.assign(line=sw.seg_id.str.split("-").str[0], k=sw.seg_id.str.split("-").str[1].astype(int))
    sw = sw.assign(order=np.where(sw.side.values == 1, -sw.k.values, sw.k.values))
    sw = sw.sort_values(["line", "order"], kind="stable").reset_index(drop=True)
    geoms = sw.geometry.values
    flip = sw.side.values == 1
    geoms[flip] = shapely.reverse(geoms[flip])
    pieces = np.asarray(geoms)
    kinds = sw.kind.values
    width = np.where(np.isin(kinds, ["obert", "dubtos"]), np.nan, sw.width_m.values.astype(float))
    t = (shapely.get_coordinates(shapely.get_point(pieces, -1))
         - shapely.get_coordinates(shapely.get_point(pieces, 0)))
    t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-9)[:, None]
    dirs = np.c_[t[:, 1], -t[:, 0]]  # from the curb into the sidewalk: right of the piece
    mid_pts = shapely.line_interpolate_point(pieces, 0.5, normalized=True)
    mids = shapely.get_coordinates(mid_pts)
    sided = sw.side.values != 0
    check = sided & ~shapely.is_empty(sw.strip.values)
    # The strip of sidewalks.py lies 0.9 m into the sidewalk: it must be on the right of every sided piece.
    strip_mid = shapely.get_coordinates(shapely.line_interpolate_point(sw.strip.values[check], 0.5, normalized=True))
    on_right = (np.einsum("ij,ij->i", strip_mid - mids[check], dirs[check]) > 0).mean()
    assert on_right > 0.99, on_right
    print("pieces", len(pieces), "kinds", sw.kind.value_counts().to_dict())

    bay_i, bay_d = np.full(len(pieces), -1), np.full(len(pieces), np.inf)
    (qi, ti), dist = shapely.STRtree(res.geometry.values).query_nearest(
        mid_pts, max_distance=1500, return_distance=True, all_matches=False)
    bay_i[qi], bay_d[qi] = ti, dist

    fine_count = np.zeros(len(pieces), int)
    ri, ti = shapely.STRtree(spot_pts).query(pieces, predicate="dwithin", distance=15.0)
    np.add.at(fine_count, ri, spots.n.values[ti])

    # Street of each piece: the nearest label that runs parallel to the piece.
    street_of = nearest_street(mid_pts, np.c_[-dirs[:, 1], dirs[:, 0]], streets)
    print("pieces with street", int((street_of >= 0).sum()), "of", len(street_of))

    du, dv = dirs @ AXIS_U, dirs @ AXIS_V
    lado = np.where(np.abs(dv) >= np.abs(du), np.where(dv > 0, 0, 1), np.where(du > 0, 2, 3))

    # Keys with their default value are left out to keep the file small: w (no width), f 0, n -1, l (no side),
    # k (vorera or andana; 1 obert, 2 dubtos).
    feats, counts = [], np.zeros(6, int)
    for i, geom in enumerate(pieces):
        w = None if np.isnan(width[i]) else round(float(width[i]), 1)
        s = rule_status(sw.status.values[i], sw.reasons.values[i])
        counts[s] += 1
        props = {"s": s}
        if sw.reasons.values[i]:
            props["r"] = sw.reasons.values[i]
        if sw.notes.values[i]:
            props["o"] = sw.notes.values[i]
        if sided[i]:
            props["l"] = int(lado[i])
        if kinds[i] in ("obert", "dubtos"):
            props["k"] = 1 if kinds[i] == "obert" else 2
        if w is not None:
            props["w"] = w
        if fine_count[i]:
            props["f"] = int(fine_count[i])
        if street_of[i] >= 0:
            props["n"] = int(street_of[i])
        if bay_i[i] >= 0:
            props["b"] = int(round(bay_d[i] / 5) * 5)
            props["bi"] = int(bay_i[i])
        feats.append(feature(geom, props, fid=i))
    write("aceras.json", feats)

    # One more label per block: the source has about one label every 250 m, too few to read a street.
    extra = 0
    for r in streets.sort_values("NIVELL").drop_duplicates("n").itertuples():
        on = street_of == r.n
        a = math.radians(0 if pd.isna(r.ANGLE_TXT) else r.ANGLE_TXT)
        u, across = np.array([math.cos(a), math.sin(a)]), np.array([-math.sin(a), math.cos(a)])
        rel = mids[on] - [r.x, r.y]
        t, c = rel @ u, rel @ across
        parallel = np.abs(dirs[on] @ across) > math.cos(math.radians(20))  # dirs is across the curb
        near = (np.abs(c) < 40) & parallel
        if near.sum() < 6:
            continue
        t, centre = np.sort(t[near]), float(np.median(c[near]))
        gaps = np.where(np.diff(t) > 8)[0]
        have = streets.loc[streets.n == r.n, ["x", "y"]].values
        for t0, t1 in zip(np.r_[t[0], t[gaps + 1]], np.r_[t[gaps], t[-1]]):
            q = np.array([r.x, r.y]) + (t0 + t1) / 2 * u + centre * across
            if t1 - t0 < 60 or not AREA.contains(shapely.Point(q)) or np.hypot(*(have - q).T).min() < 70:
                continue
            have = np.vstack([have, q])
            rot = float(label_rotate(np.array([q[0]]), np.array([q[1]]), np.array([math.degrees(a)]))[0])
            label_feats.append(feature(shapely.Point(q), {"t": r.LITERAL, "r": rot, "z": size[r.NIVELL], "n": int(r.n)}))
            extra += 1
    print("extra street labels", extra)
    check_glyphs("".join(f["properties"]["t"] for f in label_feats))
    write("calles.json", label_feats)
    print("status counts", dict(zip(["paralelo", "semibateria", "estrecha", "sin3m", "paso", "sindatos"],
                                    counts.tolist())))

    lon, lat = TO_WGS.transform(corners[:, 0], corners[:, 1])
    cx, cy = TO_WGS.transform(*uv_to_xy(np.array([80.0]), np.array([760.0]))[0])
    sx, sy = TO_WGS.transform(*uv_to_xy(np.array([40.0]), np.array([540.0]))[0])  # first view: Pg. de Gracia at Arago
    meta = {
        "area": [[round(a, 6), round(b, 6)] for a, b in zip(lon, lat)],
        "bearing": round(BEARING, 2),
        "center": [round(cx, 6), round(cy, 6)],
        "start": [round(sx, 6), round(sy, 6)],
        "calles": [[n["name"], n["bbox"]] for n in names],
        "fechas": {"topo1000": "2026-07-11", "mtm": "2026-08-18", "reservas": str(res.data_alta.max())[:10],
                   "multas": "2025-10-01/2025-12-31"},
        "textos": rules.TEXTS,
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("meta.json", len(names), "streets")


if __name__ == "__main__":
    main()
