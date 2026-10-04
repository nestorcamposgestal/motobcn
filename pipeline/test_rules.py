import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString, Point, box
from shapely.ops import substring

import rules


def cut(*points):
    """5 m pieces along the polyline through points."""
    line = LineString(points)
    return [substring(line, a, min(a + 5, line.length)) for a in np.arange(0, line.length, 5)]


def pieces(lines, width=5.0, side=1, kind="vorera"):
    """Curb pieces with the pedestrian surface on the left of each line when side is 1."""
    return gpd.GeoDataFrame({
        "seg_id": [str(k) for k in range(len(lines))],
        "width_m": width,
        "kind": kind,
        "side": side,
        "strip": gpd.GeoSeries([shapely.offset_curve(line, 0.9 * side) for line in lines]),
    }, geometry=lines, crs="EPSG:25831")


def curb(n=20, width=5.0):
    """n pieces from x 0 along y 0, sidewalk to +y."""
    return pieces(cut((0, 0), (5 * n, 0)), width)


def street():
    """The curb at y 0 (sidewalk to +y) and the other curb of a 10 m roadway at y -10 (sidewalk to -y)."""
    both = pd.concat([curb(), pieces(cut((0, -10), (100, -10)), side=-1)], ignore_index=True)
    return gpd.GeoDataFrame(both, crs="EPSG:25831")


def layer(geoms, **columns):
    return gpd.GeoDataFrame(columns, geometry=list(geoms), crs="EPSG:25831")


def starts(out, mask):
    """x, y of the start of the pieces where mask is true."""
    return [tuple(np.round(line.coords[0], 1)) for line in out.geometry[mask]]


def test_width_thresholds():
    widths = [3.00, 3.01, 4.29, 4.30, 4.3 - 1e-9, 6.00, 6.01, np.nan]
    out = rules.classify(curb(len(widths), widths), {})
    assert list(out.status) == ["prohibido", "prohibido", "prohibido", "paralelo", "paralelo", "paralelo",
                                "semibateria", "sin_datos"]
    assert list(out.reasons) == ["acera_estrecha", "sin_paso_libre", "sin_paso_libre", "", "", "", "", ""]


def test_open_space_and_unknown_width():
    out = rules.classify(pieces(cut((0, 0), (10, 0)), [8.0, np.nan], kind="obert"), {})
    assert list(out.status) == ["sin_datos", "sin_datos"]
    out = rules.classify(curb(2, np.nan), {"crossings": layer([box(4, -8, 6, 0)])})
    assert list(out.status) == ["prohibido", "prohibido"]
    assert list(out.reasons) == ["paso_peatones", "paso_peatones"]


def test_doubtful_width_only_forbids():
    out = rules.classify(pieces(cut((0, 0), (15, 0)), [2.5, 3.5, 9.0], kind="dubtos"), {})
    assert list(out.status) == ["prohibido", "prohibido", "sin_datos"]


def test_crossing_distance():
    # The crossing ends 1.9 m after the piece 15-20 and 2.1 m before the piece 25-30.
    out = rules.classify(curb(8), {"crossings": layer([box(21.9, -8, 22.9, 0)])})
    assert list(out.status) == ["paralelo"] * 3 + ["prohibido"] * 2 + ["paralelo"] * 3


def test_stop_zone():
    # Buses keep the sidewalk on their right, so they run to -x at y 0 and to +x at y -10. The zone runs 20 m back
    # from the pole and 7 m ahead of it, on the side of the stop only.
    out = rules.classify(street(), {"stops": layer([Point(50.5, 1.0), Point(30.5, -11.0)])})
    hit = out.reasons == "parada_transporte"
    assert starts(out, hit) == [(x, 0) for x in range(40, 75, 5)] + [(x, -10) for x in range(10, 40, 5)]


def test_reserve_in_front():
    # A PMR space along the curb, a bicycle rack drawn across it at x 52 (it forbids 3 m to each side) and a moto bay.
    reserves = layer([LineString([(20, -1), (30, -1)]), LineString([(52, 0), (52, -3.9)]),
                      LineString([(70, -1), (75, -1)])], tipus_reserva=["PMR", "Bicicletes calçada", "Motos calçada"])
    out = rules.classify(street(), {"reserves": reserves})
    assert starts(out, out.status == "prohibido") == [(20, 0), (25, 0), (45, 0), (50, 0)]
    assert set(out.reasons) == {"", "reserva_pmr", "reserva_bicis"}
    assert out.bay_m[14] == 1.0
    assert abs(out.bay_m[0] - np.hypot(65, 1)) < 1e-9


def test_sign_coverage():
    # Curb A runs 100 m along y 0 and turns 45 degrees at a chamfer. Curb B runs along y 20.
    a = cut((0, 0), (100, 0), (110, -10), (110, -40))
    b = cut((0, 20), (100, 20))
    signs = layer([Point(50, 0.6)] * 2 + [Point(50, 20.6)] + [Point(20, 20.6)] * 2,
                  code=["R-308", "A-13", "R-308", "S-17", "A-13"],
                  legend=[None, "Motos en vorera", None, None, "Motos en vorera"],
                  support_id=["1", "1", "2", "3", "3"])
    out = rules.classify(pieces(a + b), {"signs": signs})
    hit = out.reasons == "senal_motos"
    assert starts(out, hit) == [(x, 0) for x in range(0, 100, 5)]
    assert (out.status[hit] == "senal").all()
    # Text plates count under a no parking or no stopping sign, unless they let motos park.
    for code, legend, forbids in [("C-7d", "Inclús motos en vorera", True),
                                  ("CAJ", "Inclús motos a tot el carrer", True),
                                  ("CAJ", "Excepte motos en  zones senyalitzades", True),
                                  ("CAJ", "Excepte motos", False),
                                  ("A-3a", "<==== Motos", False)]:
        signs = layer([Point(80, 20.6)] * 2, code=["R-307", code], legend=[None, legend], support_id=["4", "4"])
        out = rules.classify(pieces(a + b), {"signs": signs})
        hit = starts(out, out.reasons == "senal_motos")
        assert hit == ([(x, 20) for x in range(0, 100, 5)] if forbids else []), legend


def test_sign_section_between_arrows():
    # Two arrow signs at x 32 and x 57 close a section. One arrow sign alone marks its curb up to the corner.
    a = cut((0, 0), (100, 0))
    b = cut((0, 20), (100, 20))
    signs = layer([Point(32, 0.6)] * 2 + [Point(57, 0.6)] * 2 + [Point(50, 20.6)] * 2,
                  code=["R-308", "A-13a", "R-308", "CAJ", "R-308", "A-13b"],
                  legend=[None, "<==== Motos en vorera", None, "====> Inclús motos en vorera", None, "Motos en vorera"],
                  support_id=["1", "1", "2", "2", "3", "3"])
    out = rules.classify(pieces(a + b), {"signs": signs})
    hit = starts(out, out.reasons == "senal_motos")
    assert hit == [(x, 0) for x in range(30, 60, 5)] + [(x, 20) for x in range(0, 100, 5)]


def test_pedestrian_street_along_axis():
    # An axis 4 m from the curb, and the axis of a street that meets the curb at a right angle.
    streets = layer([LineString([(0, 4), (40, 4)]), LineString([(72, 30), (72, 0)])],
                    type=["sin_vehiculos", "plataforma_unica"])
    out = rules.classify(curb(), {"pedestrian_streets": streets})
    assert list(out.reasons) == ["zona_peatonal"] * 8 + [""] * 12


def test_school_surroundings():
    # 25 m from a school entrance 8 m behind the curb: pieces up to 23.7 m to each side of x 50.
    # A university does not count.
    schools = layer([Point(50, 8), Point(90, 8)], type=["Educació primària; Educació secundària", "Universitats"])
    out = rules.classify(curb(), {"schools": schools})
    assert starts(out, out.reasons == "entorno_escolar") == [(x, 0) for x in range(25, 75, 5)]


def test_bike_lane_on_sidewalk_only():
    lanes = layer([LineString([(0, 2), (20, 2)]), LineString([(20, -1.5), (40, -1.5)])])
    out = rules.classify(curb(8), {"bike_lanes": lanes})
    assert list(out.reasons) == ["carril_bici"] * 4 + [""] * 4


def test_trees_note():
    trees = layer([Point(12, 0.9), Point(32, -1.5)])
    out = rules.classify(curb(8), {"trees": trees})
    assert list(out.notes) == ["", "", "alcorques", "", "", "", "", ""]
    assert set(out.status) == {"paralelo"}


def test_texts_cover_codes():
    codes = {"acera_estrecha", "sin_paso_libre", "paso_peatones", "parada_transporte", "entorno_escolar",
             "entorno_hospital", "carril_bici", "senal_motos", "alcorques"}
    assert set(rules.TEXTS) == codes | set(rules.RESERVES.values()) | set(rules.STREETS.values())
    assert all(text and ref for text, ref in rules.TEXTS.values())
