import geopandas as gpd
import numpy as np
from shapely import LineString

import sidewalks


def frames(curbs, limits):
    c = gpd.GeoDataFrame(geometry=curbs, crs=25831)
    lim = gpd.GeoDataFrame({"NIVELL": [n for n, _ in limits]}, geometry=[g for _, g in limits], crs=25831)
    return sidewalks.measure(c, lim)


def test_street_with_two_sidewalks():
    # A 20 m street: facades at y=0 and y=20, curbs at y=5 and y=15.
    out = frames(
        [LineString([(0, 5), (100, 5)]), LineString([(0, 15), (100, 15)])],
        [("CON_01_LN", LineString([(0, 0), (100, 0)])), ("CON_01_LN", LineString([(0, 20), (100, 20)]))],
    )
    assert (out.kind == "vorera").all()
    assert np.allclose(out.width_m, 5, atol=0.05)
    first = out[out.seg_id.str.startswith("0-")]
    assert (first.side == -1).all()  # the pedestrian side of the y=5 curb is below it
    assert first.strip.iloc[0].coords[0][1] < 5


def test_median_between_roadways():
    # A 4 m island (curbs at y=10 and y=14) between two roadways, sidewalks at both ends.
    out = frames(
        [LineString([(0, 5), (100, 5)]), LineString([(0, 10), (100, 10)]),
         LineString([(100, 14), (0, 14)]), LineString([(0, 19), (100, 19)])],
        [("CON_01_LN", LineString([(0, 0), (100, 0)])), ("CON_01_LN", LineString([(0, 24), (100, 24)]))],
    )
    island = out[out.seg_id.str.split("-").str[0].isin(["1", "2"])]
    assert (island.kind == "andana").mean() > 0.8
    assert np.allclose(island.width_m, 4, atol=0.1)


def test_open_square():
    # Nothing on the pedestrian side within reach, a facade across the road.
    out = frames([LineString([(0, 50), (100, 50)])], [("CON_01_LN", LineString([(0, 40), (100, 40)]))])
    assert (out.kind == "vorera").all() and np.allclose(out.width_m, 10, atol=0.05)
    out = frames([LineString([(0, 0), (100, 0)])], [("CON_01_LN", LineString([(0, 90), (100, 90)]))])
    assert (out.kind == "obert").all()
