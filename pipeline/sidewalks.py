"""Sidewalk width along every curb piece, from the 1:1000 topographic map.

The map has curb lines but no sidewalk polygons. For each curb piece we cast rays perpendicular to
the curb. A ray on the pedestrian side crosses an even number of curbs before it meets a facade,
a ray on the roadway side an odd number. The width is the distance from the curb to the first
limit on the pedestrian side.
"""

import geopandas as gpd
import numpy as np
import shapely
from shapely.ops import substring

import sources

CURBS = ["COM_17LS_LN", "COM_17LN_LN", "COM_17ES_LN"]
# Facades always face pedestrian space, so they close the curb count of the side test.
FACADES = ["CON_01_LN", "CON_02_LN", "CON_08_LN"]
# Walls, fences, water, stairs, kiosks and shelters end the sidewalk. Pavement limits (COM_03) do
# not: they only mark a change of paving inside the sidewalk, for example on Passeig de Gràcia.
SOLID = [
    "CON_06_LN", "CON_07_LN", "CON_10_LN", "CON_14LN_LN", "CON_14LS_LN", "CON_15_LN", "CON_16_LN",
    "CON_17_LN", "CON_19_LN", "CON_09_LN", "CON_22_LN", "CON_23_LN", "CON_32_LN", "CON_34_LN",
    "CON_35_LN", "HID_05LS_LN", "HID_05LN_LN",
]
# Railings and road fences are solid too, except when they stand on the curb edge with the
# sidewalk behind them.
RAILS = ["CON_20_LN", "COM_16_LN"]
# Planted areas end the sidewalk because a moto cannot park on them. But a curb behind them still
# makes the strip an island ('andana').
GREEN = ["VEG_04_LN", "VEG_05_LN", "VEG_06_LN", "VEG_07LN_LN", "VEG_07LS_LN"]
CURB, FACADE, WALL, RAIL, PLANT = range(5)

STEP = 5.0  # piece length
CAP = 40.0  # a wider pedestrian surface is 'obert'
REACH = 100.0  # ray length for the side test, enough to cross the widest avenues
STRIP = 0.9  # 0.5 m gap to the curb plus half of a 0.8 m moto
TWIN = 0.25  # a curb line closer than this to another one is the other edge of the same curb
EDGE = 0.5  # a rail closer than this to the curb stands on the curb edge
W = 2  # weight of a facing curb in the side vote
AT = np.array([1 / 6, 1 / 2, 5 / 6])  # ray positions along each piece


def load(bbox=None) -> gpd.GeoDataFrame:
    """Curb pieces with the width of the pedestrian surface next to them.

    With a bbox, returns the pieces of the curb lines that intersect it.
    """
    grown = None if bbox is None else (bbox[0] - REACH, bbox[1] - REACH, bbox[2] + REACH, bbox[3] + REACH)
    curbs = sources.topo("LINIES", CURBS, grown)
    limits = sources.topo("LINIES", FACADES + SOLID + RAILS + GREEN, grown)
    out = measure(curbs, limits)
    if bbox is not None:
        keep = curbs.index[curbs.intersects(shapely.box(*bbox))].astype(str)
        out = out[out.seg_id.str.split("-").str[0].isin(keep)].reset_index(drop=True)
    return out


def measure(curbs: gpd.GeoDataFrame, limits: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Width, kind and pedestrian side of every STEP piece of the curb lines.

    limits has a NIVELL column. Every curb is also an obstacle for the rays of the other curbs.
    """
    lines = curbs.geometry.values
    length = shapely.length(lines)
    count = np.maximum(np.ceil(length / STEP), 1).astype(int)
    line = np.repeat(np.arange(len(lines)), count)
    k = np.arange(len(line)) - np.repeat(np.cumsum(count) - count, count)
    start = k * STEP
    end = np.minimum(start + STEP, length[line])
    geometry = [substring(lines[i], a, b) for i, a, b in zip(line, start, end)]

    sample_line = np.repeat(line, len(AT))
    at = (start[:, None] + (end - start)[:, None] * AT).ravel()
    point, normal = frame(lines[sample_line], at, length[sample_line])

    targets = np.concatenate([lines, limits.geometry.values])
    code = limits.NIVELL.values
    cls = np.concatenate([np.full(len(lines), CURB), np.select(
        [np.isin(code, FACADES), np.isin(code, RAILS), np.isin(code, GREEN)], [FACADE, RAIL, PLANT], WALL)])
    tree = shapely.STRtree(targets)
    left = look(point, normal, targets, tree, cls)
    right = look(point, -normal, targets, tree, cls)

    side = vote(sample_line, len(lines), left, right)
    for _ in range(2):
        side = vote(sample_line, len(lines), left, right,
                    facing(side, lines, point, normal, left) - facing(side, lines, point, -normal, right))
    side = side[sample_line]
    ped = {key: np.where(side > 0, left[key], right[key]) for key in left}
    width = np.minimum(ped["stop"], ped["curb"])
    sample_kind = np.select(
        [side == 0, width > CAP, ped["curb"] < ped["solid"]], ["dubtos", "obert", "andana"], "vorera")
    width = np.where(side == 0, np.nan, np.minimum(width, CAP))
    width_m, piece_kind = summarize(width.reshape(-1, len(AT)), sample_kind.reshape(-1, len(AT)))

    piece_side = side[:: len(AT)]
    strip = shapely.offset_curve(np.array(geometry), STRIP * np.where(piece_side == 0, 1, piece_side))
    strip[piece_side == 0] = shapely.LineString()
    return gpd.GeoDataFrame(
        {
            "seg_id": [f"{f}-{j}" for f, j in zip(curbs.index.values[line], k)],
            "width_m": width_m,
            "kind": piece_kind,
            "side": piece_side,
            "strip": gpd.GeoSeries(strip, crs=curbs.crs),
        },
        geometry=geometry,
        crs=curbs.crs,
    )


def frame(lines, at, length):
    """Point at distance at along each line and the unit normal to its left."""
    point = shapely.get_coordinates(shapely.line_interpolate_point(lines, at))
    ahead = shapely.get_coordinates(shapely.line_interpolate_point(lines, np.minimum(at + 0.5, length)))
    behind = shapely.get_coordinates(shapely.line_interpolate_point(lines, np.maximum(at - 0.5, 0)))
    tangent = ahead - behind
    tangent /= np.hypot(tangent[:, 0], tangent[:, 1])[:, None]
    return point, np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)


def look(point, direction, targets, tree, cls, chunk=200_000):
    """What a ray from each point meets.

    Returns distances to the first curb, first solid limit, first limit of any class and first
    facade, and the number of curbs crossed before that facade.
    """
    n = len(point)
    out = {key: np.full(n, np.inf) for key in ("curb", "solid", "stop", "facade")}
    out["crossings"] = np.zeros(n, int)
    out["next"] = np.full(n, -1)
    for lo in range(0, n, chunk):
        o, d = point[lo : lo + chunk], direction[lo : lo + chunk]
        rays = shapely.linestrings(np.stack([o, o + d * REACH], axis=1))
        ray, target = tree.query(rays, predicate="intersects")
        xy, part = shapely.get_coordinates(shapely.intersection(rays[ray], targets[target]), return_index=True)
        ray, target = ray[part], target[part]
        c = cls[target]
        dist = np.einsum("ij,ij->i", xy - o[ray], d[ray])
        keep = ~(((c == CURB) & (dist < TWIN)) | ((c == RAIL) & (dist < EDGE)))
        ray, c, dist, target = ray[keep] + lo, c[keep], dist[keep], target[keep]
        for key, mask in (("curb", c == CURB), ("solid", (c != CURB) & (c != PLANT)), ("stop", c != CURB),
                          ("facade", c == FACADE)):
            np.minimum.at(out[key], ray[mask], dist[mask])
        curb = c == CURB
        r, x, t = ray[curb], dist[curb], target[curb]
        order = np.lexsort((x, r))
        r, x, t = r[order], x[order], t[order]
        head = np.r_[True, r[1:] != r[:-1]][: len(r)]
        out["next"][r[head]] = t[head]
        # Crossings closer than TWIN are one curb, for example a ray through the joint of two lines.
        new = (head | np.r_[True, np.diff(x) >= TWIN][: len(r)]) & (x < out["facade"][r])
        np.add.at(out["crossings"], r[new], 1)
    return out


def facing(side, lines, point, direction, s):
    """+1 where a ray meets a curb first and that curb's pedestrian side looks back at the ray,
    -1 where it looks away, 0 otherwise."""
    other = s["next"]
    ok = (other >= 0) & (s["curb"] < s["stop"]) & (side[np.maximum(other, 0)] != 0)
    hit = shapely.points(point[ok] + direction[ok] * s["curb"][ok, None])
    b = lines[other[ok]]
    _, n = frame(b, shapely.line_locate_point(b, hit), shapely.length(b))
    back = np.einsum("ij,ij->i", n * side[other[ok], None], direction[ok]) < 0
    out = np.zeros(len(point), int)
    out[ok] = np.where(back, 1, -1)
    return out


def vote(sample_line, n_lines, left, right, facing=0):
    """Pedestrian side of each line: +1 left, -1 right, 0 unknown.

    Each sample scores both sides and the line takes the sign of the sum. Curb parity counts
    double when no curb or one curb lies before the facade, because more crossings can also come
    from a roadway that a wall bounds. A side whose first hit is a limit and not a curb scores one
    more. On a tie, the side with the nearer limit wins.
    """
    def score(s):
        k = s["crossings"]
        parity = np.select([np.isinf(s["facade"]), k == 0, k == 1, k % 2 == 0], [0, 2, -2, 1], -1)
        return parity + (s["stop"] < s["curb"]) - (s["curb"] < s["stop"])

    total = np.bincount(sample_line, score(left) - score(right) + W * facing, n_lines)
    nearer = np.bincount(sample_line, (left["stop"] < right["stop"]).astype(int) - (right["stop"] < left["stop"]), n_lines)
    return np.sign(np.where(total != 0, total, nearer)).astype(int)


def summarize(width, kind):
    """Median width and majority kind per piece from its samples. 'dubtos' when they disagree."""
    median = np.median(width, axis=1)
    near = np.abs(width - median[:, None]) <= np.maximum(0.5, 0.2 * median[:, None])
    agree = (kind[:, :, None] == kind[:, None, :]).sum(axis=2)
    top = kind[np.arange(len(kind)), agree.argmax(axis=1)]
    return median, np.where((near.sum(axis=1) < 2) | (agree.max(axis=1) < 2), "dubtos", top)
