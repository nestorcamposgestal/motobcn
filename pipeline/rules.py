"""Classifies each curb piece by where a two-wheel moto can park on the sidewalk next to it.

Law: Ordenança de circulació de vianants i de vehicles de Barcelona, consolidated text in force since
2025-02-01, art. 40 (https://api-bcnroc.ajuntament.barcelona.cat/api/core/bitstreams/d605b922-f005-441c-a1f2-22b1d670127f/content).
"""

import numpy as np
import pandas as pd
import shapely

import sources

# Art. 40.4 allows sidewalks "de més de tres metres", so 3.00 m is not enough.
NARROW_M = 3.0
# Art. 40.4.a and 40.4.h: 0.5 m to the curb, about 0.8 m of moto and 3 m free for pedestrians.
PARALLEL_MIN_M = 4.3
# Art. 40.4.d and 40.4.e: parallel to the curb up to 6 m, semibateria above.
SEMI_OVER_M = 6.0
# Art. 40.4.b: 2 m from the limits of a pedestrian crossing.
CROSSING_GAP_M = 2.0
# Art. 40.4.b: 2 m from the limits of a public transport stop.
STOP_GAP_M = 2.0
# Art. 40.4.b and 64.19. Assumption: GTFS and OSM put a stop at its pole, and a bus stops with its front door at
# the pole, so the stop runs back from the pole for the length of an 18 m articulated bus.
STOP_BEHIND_M = 18.0
# TMB and OSM points of the same stop are a median 6 m apart, so the zone also covers this length in front of the pole.
STOP_AHEAD_M = 5.0
# Art. 40.4.b. A stop farther than this from all curb pieces (bus station, square) marks nothing.
STOP_SNAP_M = 10.0
# Art. 40.4 and 64.19. Reserve lines lie on the curb or up to about 2.5 m from it (bicycle racks on the sidewalk).
RESERVE_REACH_M = 3.0
# A piece that only touches the end of a reserve or a street axis is not along it.
OVERLAP_M = 0.5
# Art. 40.4.c. Tree pits are about 1 m square at the curb, so a pit this close to the parking line is in the way.
TREE_REACH_M = 1.0
# Art. 40.2. A bike lane line less than this inside the sidewalk is a roadway lane drawn a little off.
BIKE_MARGIN_M = 0.5
# Annex VI. Half the width of the widest pedestrian streets, about 20 m between facades.
STREET_REACH_M = 10.0
# Art. 40.4 names school and hospital surroundings without a distance. Assumption: the curb within this distance of
# the address point, which covers the entrance and a frontage of about 50 m, on both sides of a narrow street.
SCHOOL_REACH_M = 25.0
# Art. 40.4 and 34.3. Hospitals are larger buildings with more entrances, so the same idea with a longer frontage.
HOSPITAL_REACH_M = 50.0
# A piece runs along a street axis when their directions differ by less than this.
PARALLEL_DEG = 30.0
# Signs stand near the curb or on a facade. A sign farther than this and than the sidewalk width from all curb
# pieces is in a square or a street without curbs.
SIGN_SNAP_M = 6.0
# A sign covers its side of the street up to the next corner. This limit stops the walk on long curbs without corners.
SIGN_REACH_M = 200.0
# sidewalks.load(bbox) returns whole curb lines, which can reach some hundred metres past the bbox, and a sign
# covers up to SIGN_REACH_M of curb. Context in this margin around the bbox reaches all those pieces.
MARGIN_M = 600.0
# Piece ends closer than this are the same point of the curb.
SNAP_M = 0.3
# The curb turns at a corner (street intersection) when its direction changes more than this in about 10 m.
CORNER_DEG = 30.0

BAYS = ["Motos calçada", "Motos vorera"]
# Plates A-13 "Motos en vorera", A-14 "Inclús motos en vorera", A-15 "Motos excepte en zones senyalitzades", and
# text plates that include motos, for example "Inclús motos a tot el carrer" or "Motos en andana". Text such as
# "Excepte motos" or "<==== Motos" (A-3) lets motos park, so only these words count. A plate counts only on a
# support with a no parking or no stopping sign, because under a parking sign (S-17) the same plate allows motos.
MOTO_PLATE = r"^(?:A-1[345]|CAJMOTOBICI|GRMOTO|R-30[78]\w*_Motos)"
MOTO_LEGEND = (r"(?:moto|dues rodes).*(?:vorera|andana|tot el|tota la|recinte|ambd|zones senyalitzades)"
               r"|(?:incl|prohibit).*(?:moto|dues rodes)")
NO_PARKING = r"^R-30[78]"
# Plates A-13a, A-13b, A-14a, A-14b and text arrows such as "<==== Motos en vorera" mark one end of a section.
ARROW = r"^A-1[34][ab]"
# Art. 40.4 "entorn escolar": schools with children, not universities or music schools.
SCHOOL_TYPES = r"infantil|primària|secundària|professional|Bressol"
# Art. 40.4 "entorn hospitalari" and 34.3: hospitals, clinics and urgent care, not primary care centres (CAPs).
HOSPITAL_TYPES = r"Hospitals|CUAP"
STREETS = {"plataforma_unica": "plataforma_unica", "sin_vehiculos": "zona_peatonal", "eje_verde": "eje_verde"}
RESERVES = {
    "Càrrega i descàrrega": "reserva_carga",
    "Càrrega i descàrrega DUM": "reserva_carga",
    "Càrrega i descàrrega mercat": "reserva_carga",
    "PMR": "reserva_pmr",
    "Bicicletes calçada": "reserva_bicis",
    "Bicicletes vorera": "reserva_bicis",
    'Entorns escolars "Protegim Escoles"': "reserva_escolar",
    "Salut": "reserva_salud",
}

TEXTS = {
    "acera_estrecha": ("La acera mide 3 m o menos. Solo se puede aparcar en aceras de más de 3 m.", "art. 40.4"),
    "sin_paso_libre": ("La acera es demasiado estrecha: con la moto a 50 cm del bordillo no quedan 3 m libres "
                       "para los peatones.", "art. 40.4.a, 40.4.h"),
    "paso_peatones": ("A menos de 2 m de un paso de peatones.", "art. 40.4.b"),
    "parada_transporte": ("Delante o a menos de 2 m de una parada de bus o tranvía. La grúa puede retirar la moto.",
                          "art. 40.4.b, 64.19"),
    "reserva_carga": ("Delante de una zona de carga y descarga. En su horario, la grúa puede retirar la moto.",
                      "art. 40.4, 64.19"),
    "reserva_pmr": ("Delante de una plaza para personas con movilidad reducida. La grúa puede retirar la moto.",
                    "art. 40.4, 64.19"),
    "reserva_bicis": ("Delante de un aparcamiento de bicicletas.", "art. 40.4"),
    "reserva_escolar": ("Delante de una zona reservada de entorno escolar (Protegim les Escoles).", "art. 40.4"),
    "reserva_salud": ("Delante de una reserva para servicios de salud. La grúa puede retirar la moto.",
                      "art. 40.4, 64.19"),
    "plataforma_unica": ("Calle de plataforma única: solo se puede aparcar donde lo indican señales o marcas.",
                         "anexo VI"),
    "zona_peatonal": ("Calle peatonal: no se puede aparcar.", "anexo VI"),
    "eje_verde": ("Eje verde: está señalizado como prohibido aparcar.", "anexo VI"),
    "entorno_escolar": ("Cerca de la entrada de una escuela. En los entornos escolares no se puede aparcar en la "
                        "acera.", "art. 40.4"),
    "entorno_hospital": ("Cerca de un hospital o clínica. En los entornos hospitalarios no se puede aparcar en la "
                         "acera y la grúa puede retirar la moto.", "art. 40.4, 34.3, 64.19"),
    "carril_bici": ("Hay un carril bici en la acera. No se puede aparcar en él.", "art. 40.2"),
    "senal_motos": ("Probablemente prohibido: cerca hay una señal de estacionamiento prohibido que incluye las motos "
                    "en la acera. Suele valer para este lado de la calle hasta el cruce siguiente. Comprueba la señal.",
                    "art. 40.4, señal R-308 o R-307 con placa A-13, A-14, A-15 o texto «inclús motos»"),
    "alcorques": ("Hay árboles junto al bordillo: aparca entre los alcorques, sin sobresalir de ellos.", "art. 40.4.c"),
}


def classify(pieces, ctx):
    """Returns pieces with status, reasons, notes and bay_m.

    status: 'paralelo', 'semibateria', 'prohibido', 'senal' (a sign alone forbids it) or 'sin_datos'. reasons: the TEXTS codes that forbid parking,
    joined with '|'. notes: the TEXTS codes that only inform. bay_m: distance in m to the nearest moto bay.
    ctx maps layer names (the keys of load_context) to GeoDataFrames in EPSG:25831. A missing layer applies no rule.
    """
    g = pieces.geometry.values
    strip = pieces["strip"].values
    width = pieces["width_m"].round(2).to_numpy()
    kind = pieces["kind"].to_numpy()
    # A doubtful width can still show that the sidewalk is too narrow, but not that it is wide enough.
    unknown = np.isnan(width) | (kind == "obert") | ((kind == "dubtos") & (width >= PARALLEL_MIN_M))
    reasons = {
        "acera_estrecha": ~unknown & (width <= NARROW_M),
        "sin_paso_libre": ~unknown & (width > NARROW_M) & (width < PARALLEL_MIN_M),
        "paso_peatones": _near(g, _geoms(ctx, "crossings"), CROSSING_GAP_M),
    }
    stops = _geoms(ctx, "stops")
    signs = ctx.get("signs")
    signs, arrow = (np.array([]), np.array([], bool)) if signs is None else _moto_signs(signs)
    links = _links(g) if len(stops) or len(signs) else None
    side = pieces["side"].to_numpy()
    # Traffic keeps to the right and bus doors open on the right, so a bus runs with the sidewalk on its right:
    # along the piece when side is -1. Without a side, the stop runs back in both directions.
    behind, ahead = STOP_BEHIND_M + STOP_GAP_M, STOP_AHEAD_M + STOP_GAP_M
    reasons["parada_transporte"] = _zone(g, links, stops, STOP_SNAP_M, np.where(side == 1, ahead, behind),
                                         np.where(side == -1, ahead, behind))
    reserves = ctx.get("reserves")
    if reserves is not None:
        for code in dict.fromkeys(RESERVES.values()):
            lines = reserves.geometry.values[reserves["tipus_reserva"].map(RESERVES).eq(code).to_numpy()]
            reasons[code] = _front(g, lines, RESERVE_REACH_M, OVERLAP_M)
    streets = ctx.get("pedestrian_streets")
    if streets is not None:
        for key, code in STREETS.items():
            # Parallel only, so the curbs of a cross street at the end of an axis do not count.
            axes = streets.geometry.values[(streets["type"] == key).to_numpy()]
            reasons[code] = _front(g, axes, STREET_REACH_M, OVERLAP_M, parallel=True)
    reasons["entorno_escolar"] = _near(g, _geoms(ctx, "schools", SCHOOL_TYPES), SCHOOL_REACH_M)
    reasons["entorno_hospital"] = _near(g, _geoms(ctx, "hospitals", HOSPITAL_TYPES), HOSPITAL_REACH_M)
    reasons["carril_bici"] = _bike_on_sidewalk(g, side, width, _geoms(ctx, "bike_lanes"))
    snap = np.fmax(SIGN_SNAP_M, width)
    reasons["senal_motos"] = (_zone(g, links, signs[~arrow], snap, SIGN_REACH_M, SIGN_REACH_M)
                              | _sections(g, links, signs[arrow], snap))
    notes = {"alcorques": _near(strip, _geoms(ctx, "trees"), TREE_REACH_M)}
    out = pieces.copy()
    out["reasons"] = _join(reasons, len(g))
    out["notes"] = _join(notes, len(g))
    # The section of a sign is an estimate, so a sign alone gives its own, less certain status.
    only_sign = reasons["senal_motos"] & ~np.any([v for k, v in reasons.items() if k != "senal_motos"], axis=0)
    out["status"] = np.select([only_sign, out["reasons"].ne("").to_numpy(), unknown, width > SEMI_OVER_M],
                              ["senal", "prohibido", "sin_datos", "semibateria"], "paralelo")
    out["bay_m"] = _bay_m(g, reserves)
    return out


def load_context(bbox=None):
    """Context layers for classify, for the pieces of sidewalks.load(bbox)."""
    grown = None if bbox is None else tuple(np.add(bbox, [-MARGIN_M, -MARGIN_M, MARGIN_M, MARGIN_M]))

    def clip(layer):
        return layer if grown is None else layer[layer.intersects(shapely.box(*grown))]

    return {
        "crossings": sources.crossings(grown),
        "stops": clip(sources.transit_stops()),
        # All reserves, so bay_m finds the nearest moto bay also outside the bbox.
        "reserves": sources.reserves(),
        "bike_lanes": clip(sources.bike_lanes()),
        "pedestrian_streets": clip(sources.pedestrian_streets()),
        "signs": clip(sources.signs()),
        "trees": clip(sources.trees()),
        "schools": clip(sources.schools()),
        "hospitals": clip(sources.hospitals()),
    }


def _geoms(ctx, name, types=None):
    """Geometries of a context layer, only of the rows whose type matches types when it is given."""
    layer = ctx.get(name)
    if layer is None:
        return np.array([])
    if types:
        layer = layer[layer["type"].str.contains(types, na=False)]
    return layer.geometry.values


def _near(g, others, dist):
    """Marks the pieces within dist m of any of others."""
    mask = np.zeros(len(g), bool)
    if len(others):
        mask[shapely.STRtree(others).query(g, predicate="dwithin", distance=dist)[0]] = True
    return mask


def _front(g, lines, reach, overlap, parallel=False):
    """Marks the pieces within reach m of one of lines for more than overlap m, and parallel to it if asked."""
    mask = np.zeros(len(g), bool)
    if len(lines):
        # Flat caps, so a zone does not grow past the ends of its line.
        zones = shapely.buffer(lines, reach, cap_style="flat")
        i, j = shapely.STRtree(zones).query(g, predicate="intersects")
        keep = shapely.length(shapely.intersection(g[i], zones[j])) > overlap
        if parallel:
            keep[keep] = _parallel(g[i[keep]], lines[j[keep]])
        mask[i[keep]] = True
    return mask


def _parallel(g, lines):
    """True where each piece runs in the direction of its line near the piece."""
    s = shapely.line_locate_point(lines, shapely.centroid(g))
    length = shapely.length(lines)
    ahead = shapely.line_interpolate_point(lines, np.clip(s + 1, 0, length))
    behind = shapely.line_interpolate_point(lines, np.clip(s - 1, 0, length))
    t = shapely.get_coordinates(ahead) - shapely.get_coordinates(behind)
    d = shapely.get_coordinates(shapely.get_point(g, -1)) - shapely.get_coordinates(shapely.get_point(g, 0))
    cos = np.abs((t * d).sum(axis=1)) / (np.hypot(*t.T) * np.hypot(*d.T))
    return cos >= np.cos(np.radians(PARALLEL_DEG))


def _bike_on_sidewalk(g, side, width, lanes):
    """Marks the pieces with a bike lane on their pedestrian surface along at least half of the piece."""
    mask = np.zeros(len(g), bool)
    known = np.flatnonzero((side != 0) & ~np.isnan(width))
    if len(lanes) and len(known):
        i, j = shapely.STRtree(lanes).query(g[known], predicate="dwithin", distance=width[known])
        i = known[i]
        depth = side[i] * width[i]
        band = shapely.difference(shapely.buffer(g[i], depth, single_sided=True),
                                  shapely.buffer(g[i], np.sign(depth) * BIKE_MARGIN_M, single_sided=True))
        runs = shapely.length(shapely.intersection(lanes[j], band)) > shapely.length(g[i]) / 2
        mask[i[runs]] = True
    return mask


def _links(g):
    """Joins the piece ends that touch, so a walk can follow the curb from piece to piece.

    End k belongs to piece k % n: k < n is its start point, k >= n its end point.
    link[k] is the end of the next piece that touches end k, or -1.
    """
    n = len(g)
    ends = np.concatenate([shapely.get_point(g, 0), shapely.get_point(g, -1)])
    a, b = shapely.STRtree(ends).query(ends, predicate="dwithin", distance=SNAP_M)
    keep = a % n != b % n
    link = np.full(2 * n, -1)
    # ponytail: where 3 or more ends touch, one next piece wins by chance. Choose the straightest one if walks go wrong.
    link[a[keep]] = b[keep]
    return shapely.get_coordinates(ends), link


def _walk(xy, link, piece, end, reach):
    """Returns the pieces that follow piece along the curb past its end (0 start, 1 end), until reach m or a corner."""
    n = len(link) // 2
    dirs = [xy[end * n + piece] - xy[(1 - end) * n + piece]]
    found = []
    k = link[end * n + piece]
    # The count limit stops a loop of zero-length pieces.
    while k >= 0 and reach > 0 and len(found) < 1000:
        q, out = k % n, 1 - k // n
        d = xy[out * n + q] - xy[k]
        ref = dirs[max(0, len(dirs) - 2)]
        if d @ ref < np.cos(np.radians(CORNER_DEG)) * np.hypot(*d) * np.hypot(*ref):
            break
        found.append(q)
        dirs.append(d)
        reach -= np.hypot(*d)
        k = link[out * n + q]
    return found


def _along(g, links, piece, point, back, ahead):
    """Returns the pieces of the curb of piece from back m behind to ahead m past the point projected on it."""
    s = shapely.line_locate_point(g[piece], point)
    return ([piece] + _walk(*links, piece, 1, ahead - (shapely.length(g[piece]) - s))
            + _walk(*links, piece, 0, back - s))


def _zone(g, links, points, snap, back, ahead):
    """Marks the curb along the nearest piece of each point, from back m before the point to ahead m past it.

    snap is the largest distance from a point to its nearest piece. snap, back and ahead are one value or one per
    piece, where back and ahead count against and along the direction of the piece.
    """
    mask = np.zeros(len(g), bool)
    if len(points):
        (i, p), d = shapely.STRtree(g).query_nearest(points, return_distance=True, all_matches=False)
        snap, back, ahead = (np.broadcast_to(v, len(g))[p] for v in (snap, back, ahead))
        for k in np.flatnonzero(d <= snap):
            mask[_along(g, links, p[k], points[i[k]], back[k], ahead[k])] = True
    return mask


def _sections(g, links, points, snap):
    """Marks the curb from each arrow sign to the nearest arrow sign on the same curb.

    The direction of an arrow is not known, so the nearest other end closes the section. A sign without another
    end within SIGN_REACH_M marks the curb as _zone does.
    """
    mask = np.zeros(len(g), bool)
    if len(points):
        (i, p), d = shapely.STRtree(g).query_nearest(points, return_distance=True, all_matches=False)
        p = p[d <= np.broadcast_to(snap, len(g))[p]]
        ends, count = np.unique(p, return_counts=True)
        mask[p] = True
        # Two ends on one piece are a section of that piece only.
        for piece in ends[count == 1]:
            others = set(ends) - {piece}
            walks = [_walk(*links, piece, end, SIGN_REACH_M) for end in (0, 1)]
            hits = [next((n for n, q in enumerate(w) if q in others), None) for w in walks]
            found = [(n, w) for n, w in zip(hits, walks) if n is not None]
            if found:
                n, w = min(found, key=lambda f: f[0])
                mask[w[:n + 1]] = True
            else:
                mask[walks[0] + walks[1]] = True
    return mask


def _moto_signs(signs):
    """Returns the supports that forbid motos on the sidewalk, one point each, and if each has an arrow plate."""
    code = signs["code"].fillna("")
    legend = signs["legend"].fillna("").str.lower()
    plate = code.str.match(MOTO_PLATE) | legend.str.contains(MOTO_LEGEND)
    main = code.str.match(NO_PARKING)
    support = signs["support_id"]
    arrow = plate & (code.str.match(ARROW) | legend.str.contains("==", regex=False))
    arrow = arrow.groupby(support).transform("any")
    both = (plate.groupby(support).transform("any") & main.groupby(support).transform("any")).to_numpy()
    keep = ~signs["support_id"][both].duplicated().to_numpy()
    return signs.geometry.values[both][keep], arrow.to_numpy()[both][keep]


def _bay_m(g, reserves):
    bay = np.full(len(g), np.nan)
    if reserves is not None and reserves["tipus_reserva"].isin(BAYS).any():
        bays = reserves.geometry.values[reserves["tipus_reserva"].isin(BAYS).to_numpy()]
        (i, _), d = shapely.STRtree(bays).query_nearest(g, return_distance=True, all_matches=False)
        bay[i] = d
    return bay


def _join(masks, n):
    out = pd.Series("", index=range(n))
    for code, mask in masks.items():
        out[mask] += "|" + code
    return out.str.lstrip("|").to_numpy()
