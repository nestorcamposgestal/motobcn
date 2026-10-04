import numpy as np

import build


def test_upright_reads_left_to_right():
    # Clockwise rotations: upside-down text turns half a circle, steep text reads bottom to top.
    assert np.allclose(build.upright([0, 30, 170, -170, 85, -95, 270]), [0, 30, -10, 10, -95, -95, -90])


def test_street_key_joins_label_variants():
    assert build.street_key("C. Roger de Llúria") == build.street_key("Carrer de Roger de Llúria")
    assert build.street_key("Pg. de Gràcia") == build.street_key("Passeig de Gràcia")
    assert build.street_key("Carrer d'Aragó") != build.street_key("Carrer de Bailèn")
