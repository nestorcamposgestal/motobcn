import numpy as np
import pandas as pd
import shapely

import build


def test_upright_reads_left_to_right():
    # Clockwise rotations: upside-down text turns half a circle, steep text reads bottom to top.
    assert np.allclose(build.upright([0, 30, 170, -170, 85, -95, 270]), [0, 30, -10, 10, -95, -95, -90])


def test_street_key_joins_label_variants():
    assert build.street_key("C. Roger de Llúria") == build.street_key("Carrer de Roger de Llúria")
    assert build.street_key("Pg. de Gràcia") == build.street_key("Passeig de Gràcia")
    assert build.street_key("Carrer d'Aragó") != build.street_key("Carrer de Bailèn")


def test_zebra_axis_runs_across_the_road():
    z = build.zebra_layer(np.array([shapely.box(0, 0, 4, 12), shapely.box(0, 0, 12, 4)]))
    assert [list(shapely.get_coordinates(g).ravel()) for g in z.geometry.values] == [[2, 0, 2, 12], [0, 2, 12, 2]]
    assert list(z.w) == [4, 4]


def test_named_street_takes_the_accented_label():
    lab = pd.DataFrame({"x": [0.0, 50.0, 5.0], "y": [0.0, 0.0, 0.0], "calle": ["Carrer d'Aragó", "Carrer de Bailèn", "Carrer del Rosselló"]})
    pts = shapely.points([10.0, 10.0, 10.0, 10.0], [0.0, 0.0, 0.0, 0.0])
    assert list(build.named_street(["BAILEN, C., DE", "ARAGO, C., D'", "SANTS, C., DE", "ROSSELL, C., DE"], pts, lab)) == \
        ["Carrer de Bailèn", "Carrer d'Aragó", None, None]
