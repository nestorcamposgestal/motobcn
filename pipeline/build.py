"""Builds the map data: data/out/motobcn.pmtiles and data/out/meta.json.

Run with an optional bbox in EPSG:25831 (xmin ymin xmax ymax) to build one area only.
"""

import json
import shutil
import subprocess
import sys
from datetime import date

import geopandas as gpd
import numpy as np
import shapely

import rules
import sidewalks
import sources

OUT = sources.RAW.parent / "out"
FINES_YEAR = 2025
# Fines carry the address position, not the exact spot of the moto.
FINES_REACH_M = 15.0


def pieces_layer(bbox):
    pieces = rules.classify(sidewalks.load(bbox), rules.load_context(bbox))
    fines = sources.fines(FINES_YEAR)
    hits, _ = shapely.STRtree(fines.geometry.values).query(
        pieces.geometry.values, predicate="dwithin", distance=FINES_REACH_M)
    strip = pieces["strip"].values
    # The strip shows where the moto stands; the curb is the fallback when the side is unknown.
    geometry = np.where(shapely.is_empty(strip), pieces.geometry.values, strip)
    return gpd.GeoDataFrame({
        "id": pieces.seg_id,
        "st": pieces.status,
        "w": pieces.width_m.round(1),
        "k": pieces.kind,
        "r": pieces.reasons,
        "n": pieces.notes,
        "bay": pieces.bay_m.round(),
        "mul": np.bincount(hits, minlength=len(pieces)),
    }, geometry=geometry, crs=sources.CRS)


def bays_layer(bbox):
    r = sources.reserves()
    r = r[r.tipus_reserva.isin(rules.BAYS)]
    if bbox is not None:
        r = r[r.intersects(shapely.box(*bbox))]
    return gpd.GeoDataFrame({
        "id": r.id_sit,
        "on": np.where(r.tipus_reserva == "Motos vorera", "acera", "calzada"),
        "pl": r.num_places,
        "tipo": r.tipus_estacionament.fillna(""),
        "calle": r.nom_carrer.fillna(""),
    }, geometry=r.geometry, crs=sources.CRS)


def fines_layer(bbox):
    f = sources.fines(FINES_YEAR)
    if bbox is not None:
        f = f[f.intersects(shapely.box(*bbox))]
    return gpd.GeoDataFrame({"code": f.code, "tow": f.tow}, geometry=f.geometry, crs=sources.CRS)


def main(bbox=None):
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {"aceras": pieces_layer(bbox), "zonas_moto": bays_layer(bbox), "multas": fines_layer(bbox)}
    paths = []
    for name, layer in layers.items():
        path = OUT / f"{name}.geojsonl"
        layer.to_crs(4326).to_file(path, driver="GeoJSONSeq")
        paths.append(f"{name}:{path}")
        print(name, len(layer))
    status = layers["aceras"]
    length = shapely.length(status.geometry.values)
    meta = {
        "built": date.today().isoformat(),
        "sources": json.loads((sources.RAW / "manifest.json").read_text()),
        "texts": rules.TEXTS,
        "status_km": {s: round(float(length[status.st.values == s].sum()) / 1000, 1) for s in status.st.unique()},
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    if shutil.which("tippecanoe") is None:
        sys.exit("tippecanoe is missing: install it (sudo apt install tippecanoe) to write motobcn.pmtiles.")
    # Zoom 16 tiles keep every piece; the map overzooms them for closer views.
    subprocess.run(["tippecanoe", "-o", str(OUT / "motobcn.pmtiles"), "--force", "-Z13", "-z16",
                    "--drop-densest-as-needed", "--extend-zooms-if-still-dropping", "-q"]
                   + [arg for p in paths for arg in ("-L", p)], check=True)


if __name__ == "__main__":
    main(tuple(map(float, sys.argv[1:5])) if len(sys.argv) == 5 else None)
