"""Open data sources for the pipeline.

Each loader downloads its source into data/raw once and returns a GeoDataFrame in EPSG:25831.
Delete a folder in data/raw to download that source again.
Run this file to load every source and write data/raw/manifest.json with the URLs and dates.
"""

import json
import os
import shutil
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import closing
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import shapely

CRS = "EPSG:25831"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
CKAN = "https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id="
HEADERS = {"User-Agent": "motobcn-pipeline/0.1"}

TOPO_ZIP = "https://w20.bcn.cat/CartoBCN/getFile.ashx?prod=144.BARCELONA.42"
MTM_ZIP = "https://w20.bcn.cat/CartoBCN/getFile.ashx?prod=131.BARCELONA.42"

# (source, cache file, GTFS URL, mode, route types to keep or None for all) in order of preference.
GTFS_FEEDS = [
    ("tmb", "tmb.zip", "https://files.mobilitydatabase.org/mdb-2359/latest.zip", "bus", ["3"]),
    ("amb", "amb.zip", "https://www.ambmobilitat.cat/OpenData/google_transit.zip", "bus", None),
    # TRAM types its T2 route as rail, so keep every route.
    ("tram", "tram_tbx.zip", "https://opendata.tram.cat/GTFS/zip/TBX.zip", "tram", None),
    ("tram", "tram_tbs.zip", "https://opendata.tram.cat/GTFS/zip/TBS.zip", "tram", None),
]
TMB_API = "https://api.tmb.cat/v1/static/datasets/gtfs.zip"
OVERPASS = "https://overpass-api.de/api/interpreter?data="
OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright"
OSM_STOPS = """[out:json][timeout:180];
area["boundary"="administrative"]["admin_level"="8"]["name"="Barcelona"]["wikidata"="Q1492"]->.a;
(nwr["highway"="bus_stop"](area.a); nwr["public_transport"="platform"]["bus"="yes"](area.a);
 nwr["railway"="tram_stop"](area.a); nwr["public_transport"="platform"]["tram"="yes"](area.a););
out center tags;"""


def _tmb_keys(mirror: str) -> str:
    """The official TMB feed when TMB_APP_ID and TMB_APP_KEY are set, else the public mirror.

    The keys stay out of GTFS_FEEDS so that manifest.json, which the app publishes, never holds them.
    """
    app_id, app_key = os.environ.get("TMB_APP_ID"), os.environ.get("TMB_APP_KEY")
    if not (app_id and app_key):
        return mirror
    return f"{TMB_API}?{urllib.parse.urlencode({'app_id': app_id, 'app_key': app_key})}"


def fetch(dest: Path, url) -> Path:
    """Downloads url to dest if dest is missing. url can be a callable, so it resolves only when needed."""
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    request = urllib.request.Request(url() if callable(url) else url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=900) as response, open(part, "wb") as out:
        shutil.copyfileobj(response, out)
        kind = response.headers.get("Content-Type", "")
    # A server that refuses the download answers with an HTML page, which must not enter the cache.
    if dest.suffix == ".zip" and not zipfile.is_zipfile(part):
        head = part.read_bytes()[:300]
        part.unlink()
        raise RuntimeError(f"{dest.name}: expected a ZIP, got {kind!r}: {head!r}")
    part.rename(dest)
    return dest


def ckan_resource(dataset: str, match) -> str:
    """Returns the URL of the newest resource of an Open Data BCN dataset for which match(resource) is true."""
    for attempt in range(4):
        # The CKAN API sometimes answers with an empty body under load, so retry.
        try:
            with urllib.request.urlopen(urllib.request.Request(CKAN + dataset, headers=HEADERS), timeout=60) as r:
                resources = json.load(r)["result"]["resources"]
            break
        except (json.JSONDecodeError, OSError):
            time.sleep(2 * (attempt + 1))
    else:
        raise RuntimeError(f"CKAN did not answer for {dataset}")
    found = [r for r in resources if match(r)]
    if not found:
        raise LookupError(f"No matching resource in {dataset}")
    return max(found, key=lambda r: r.get("last_modified") or r.get("created") or "")["url"]


def _topo_gpkg(kind: str) -> Path:
    gpkg = RAW / "topo1000" / f"TOPO1000_{kind}.gpkg"
    if not gpkg.exists():
        archive = fetch(RAW / "topo1000" / "TOPO1000_GPKG.zip", TOPO_ZIP)
        zipfile.ZipFile(archive).extractall(gpkg.parent)
        archive.unlink()
    return gpkg


def topo(kind: str, codes: list[str], bbox=None) -> gpd.GeoDataFrame:
    """Reads 1:1000 municipal topographic features by NIVELL code.

    kind is LINIES, POLIGONS or PUNTS. The index is the feature id of the source file.
    """
    where = "NIVELL IN ({})".format(",".join(f"'{c}'" for c in codes))
    gdf = pyogrio.read_dataframe(_topo_gpkg(kind), where=where, bbox=bbox, columns=["NIVELL"], fid_as_index=True)
    gdf.geometry = shapely.force_2d(gdf.geometry)
    return gdf.set_crs(CRS, allow_override=True)


def reserves() -> gpd.GeoDataFrame:
    """Reserved parking spaces on the public road (moto bays, loading, PMR, bicycles and others), one line each."""
    csv = fetch(
        RAW / "reserves" / "reserves.csv",
        lambda: ckan_resource("infraestructures-inventari-reserves", lambda r: r["format"].upper() == "CSV"),
    )
    df = pd.read_csv(csv, dtype=str)
    geometry = gpd.GeoSeries.from_wkt(df["geometria_etrs89"], crs=CRS)
    df = df[["id_sit", "tipus_reserva", "tipus_estacionament", "num_places", "longitud_reserva", "horari",
             "nom_carrer", "num_carrer", "nom_barri", "data_alta"]]
    df = df.assign(num_places=pd.to_numeric(df["num_places"]), longitud_reserva=pd.to_numeric(df["longitud_reserva"]))
    return gpd.GeoDataFrame(df, geometry=geometry)


def inca() -> gpd.GeoDataFrame:
    """Sidewalk clear widths and sidewalk obstacles from the INCA accessibility survey, one point each.

    type: AmpladaLliure (a clear width measurement) or Obstacles (an obstacle point).
    clear_m: clear walking width in metres (Mesura, else Mesura mínima, both in cm). NaN for obstacles.
    353 widths are 0 and 55 are more than 20 m (squares), so filter outliers before use.
    min_m: narrowest clear width in metres, where the surveyor recorded a pinch point.
    obstacle: kind of obstacle, for example Pilones (bollards), Escocells (tree pits), Fanals (street lights).
    facade_gap: class of the clear width between the obstacle and the facade, for example '<0.90m' or '>=1.80m'.
    situation: Tram (street segment) or Cruïlla (junction).
    year: survey year (2018 to 2022).
    Each yearly CSV contains the records of the one before, so only the newest is read.
    Source: Ajuntament de Barcelona, Open Data BCN, accessibilitat-via-publica, CC BY 4.0.
    """
    csv = fetch(RAW / "inca" / "inca.csv",
                lambda: ckan_resource("accessibilitat-via-publica", lambda r: r["format"].upper() == "CSV"))
    df = pd.read_csv(csv, dtype=str)
    df = df[df["Incidència"].isin(["AmpladaLliure", "Obstacles"]) & df["Data de Baixa"].isna()]
    cm = lambda column: pd.to_numeric(df[column], errors="coerce") / 100
    out = pd.DataFrame({
        "type": df["Incidència"],
        "clear_m": cm("Mesura").fillna(cm("Mesura mínima")),
        "min_m": cm("Mesura mínima"),
        "obstacle": df["Tipus"],
        "facade_gap": df["ALP Façana"],
        "situation": df["Situació"],
        # Dates mix day-first and month-first formats, so keep only the year.
        "year": df["Data d'Alta"].str.extract(r"/(\d{4}) ", expand=False).astype(int),
    })
    points = gpd.points_from_xy(df["Gis_X"].astype(float), df["Gis_Y"].astype(float))
    return gpd.GeoDataFrame(out, geometry=points, crs=CRS)


def _mtm_gpkg(name: str) -> Path:
    gpkg = RAW / "mtm" / f"{name}.gpkg"
    if not gpkg.exists():
        archive = fetch(RAW / "mtm" / "MTM_GPKG.zip", MTM_ZIP)
        with zipfile.ZipFile(archive) as z:
            for member in z.infolist():
                # The archive stores UTF-8 names without the UTF-8 flag, so zipfile decodes them as cp437.
                if not member.flag_bits & 0x800:
                    member.filename = member.filename.encode("cp437").decode("utf-8")
                z.extract(member, gpkg.parent)
        archive.unlink()
    return gpkg


def crossings(bbox=None) -> gpd.GeoDataFrame:
    """Pedestrian crossings as polygons, one per crossing.

    source 'mtm': crossing polygons (COM_51PV_pol_PL) of the municipal topographic map (MTM).
    source 'topo1000': crossings that only the 1:1000 topographic map has. It draws a crossing as its two
    edge lines (COM_51_LN, median 4.3 m apart), so the polygon fills the gap between edges less than 7 m apart.
    A lone edge line becomes a 4 m band.
    Why both: the MTM polygons are exact, but a quarter of the TOPO1000 edge lines have no MTM polygon.
    In the inventory of painted crossings (infraestructures-inventari-pas-vianants, records to 2025),
    2,793 active points are only on TOPO1000 crossings and 470 only on MTM polygons.
    The inventory itself is not used: it has points only and 11,027 active records, fewer than the crossings.
    Source: Ajuntament de Barcelona, CartoBCN, CC BY 4.0.
    """
    mtm = pyogrio.read_dataframe(_mtm_gpkg("Base (Polígons)"), where="NIVELL = 'COM_51PV_pol_PL'", bbox=bbox,
                                 columns=[]).geometry.values
    mtm = shapely.get_parts(mtm)
    lines = topo("LINIES", ["COM_51_LN"], bbox).geometry.values
    lines = np.delete(lines, shapely.STRtree(mtm).query(lines, predicate="dwithin", distance=3)[0])
    # Grow and shrink by 3.5 m to fill the gap between the two edges of a crossing.
    grown = shapely.union_all(shapely.buffer(lines, 3.5, cap_style="square", join_style="mitre"))
    filled = shapely.get_parts(shapely.buffer(grown, -3.5, join_style="mitre"))
    filled = filled[shapely.area(filled) > 1]
    lone = np.delete(lines, shapely.STRtree(filled).query(lines, predicate="dwithin", distance=0.5)[0])
    bands = shapely.buffer(lone, 2, cap_style="flat")
    bands = bands[shapely.area(bands) > 1]
    source = ["mtm"] * len(mtm) + ["topo1000"] * (len(filled) + len(bands))
    return gpd.GeoDataFrame({"source": source}, geometry=np.concatenate([mtm, filled, bands]), crs=CRS)


def municipality() -> gpd.GeoDataFrame:
    """Boundary of the municipality of Barcelona, one multipolygon (MTM, Ajuntament de Barcelona, CC BY 4.0)."""
    gdf = pyogrio.read_dataframe(_mtm_gpkg("Límit Terme Municipal Barcelona"), columns=[])
    return gdf.set_crs(CRS, allow_override=True)


def _gtfs_stops(path: Path, route_types) -> gpd.GeoDataFrame:
    # Only stops that a trip serves, so stops out of service drop out.
    with zipfile.ZipFile(path) as z:
        read = lambda name, columns: pd.read_csv(z.open(name), usecols=columns, dtype=str)
        stops = read("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"])
        served = read("stop_times.txt", ["trip_id", "stop_id"]).drop_duplicates()
        if route_types:
            trips = read("trips.txt", ["trip_id", "route_id"]).merge(read("routes.txt", ["route_id", "route_type"]))
            served = served[served["trip_id"].isin(trips.loc[trips["route_type"].isin(route_types), "trip_id"])]
    stops = stops[stops["stop_id"].isin(served["stop_id"])]
    points = gpd.points_from_xy(stops["stop_lon"].astype(float), stops["stop_lat"].astype(float), crs="EPSG:4326")
    return gpd.GeoDataFrame({"name": stops["stop_name"].values}, geometry=points).to_crs(CRS)


def _osm_stops() -> gpd.GeoDataFrame:
    for attempt in range(4):
        # Overpass answers 429 or 504 when it is busy, so retry.
        try:
            path = fetch(RAW / "transit" / "osm.json", OVERPASS + urllib.parse.quote(OSM_STOPS))
            break
        except urllib.error.HTTPError:
            if attempt == 3:
                raise
            time.sleep(30 * (attempt + 1))
    elements = json.loads(path.read_text())["elements"]
    tags = [e.get("tags", {}) for e in elements]
    xy = [(e["lon"], e["lat"]) if "lon" in e else (e["center"]["lon"], e["center"]["lat"]) for e in elements]
    mode = ["tram" if t.get("railway") == "tram_stop" or t.get("tram") == "yes" else "bus" for t in tags]
    points = gpd.points_from_xy(*zip(*xy), crs="EPSG:4326")
    return gpd.GeoDataFrame({"name": [t.get("name") for t in tags], "mode": mode}, geometry=points).to_crs(CRS)


def _dedup(gdf: gpd.GeoDataFrame, distance: float) -> gpd.GeoDataFrame:
    # Keeps the first row of each cluster of points closer than distance, so put the preferred rows first.
    blobs = shapely.get_parts(shapely.union_all(shapely.buffer(gdf.geometry.values, distance / 2)))
    row, blob = shapely.STRtree(blobs).query(gdf.geometry.values, predicate="intersects")
    return gdf.iloc[np.sort(pd.Series(row).groupby(blob).min().values)]


def transit_stops() -> gpd.GeoDataFrame:
    """Bus and tram stops in the municipality, one point each, with mode ('bus' or 'tram'), name and source.

    Sources, in order of preference (stops of one mode closer than 5 m become one stop):
    tmb: TMB city buses, GTFS mirrored by the Mobility Database (feed mdb-2359). TMB grants its free licence
    when the app is registered at https://developer.tmb.cat, only for that app, and asks to cite TMB as
    the source with the date of the last update.
    amb: AMB metropolitan, night and airport buses, AMB open data (CC BY 4.0; AMB uses CC BY-ND 4.0
    for data from third parties). Cite AMB and the update date.
    tram: Trambaix and Trambesòs GTFS, TRAM open data terms: do not alter the data, show "Powered by TRAM Barcelona".
    osm: OpenStreetMap stops more than 30 m from any GTFS stop of the same mode. These are interurban and
    tourist buses, and stops that the feeds place elsewhere or do not serve now.
    © OpenStreetMap contributors, ODbL 1.0, so a published copy of this layer must stay under the ODbL.
    Only GTFS stops that a trip serves are kept.
    Open Data BCN estacions-bus is not used: it is from 2021, with one row per line and no stop names.
    """
    gtfs = []
    for source, name, url, mode, route_types in GTFS_FEEDS:
        stops = _gtfs_stops(fetch(RAW / "transit" / name, _tmb_keys(url) if source == "tmb" else url), route_types)
        gtfs.append(stops.assign(mode=mode, source=source))
    gtfs = pd.concat(gtfs, ignore_index=True)
    osm = _osm_stops().assign(source="osm")
    boundary = municipality().geometry.iloc[0]
    gtfs, osm = gtfs[gtfs.within(boundary)], osm[osm.within(boundary)]
    out = []
    for mode, stops in gtfs.groupby("mode"):
        extra = osm[osm["mode"] == mode]
        near = shapely.STRtree(stops.geometry.values).query(extra.geometry.values, predicate="dwithin", distance=30)[0]
        out.append(_dedup(pd.concat([stops, extra.drop(extra.index[near])], ignore_index=True), 5))
    return gpd.GeoDataFrame(pd.concat(out, ignore_index=True)[["mode", "name", "source", "geometry"]], crs=CRS)


def bike_lanes() -> gpd.GeoDataFrame:
    """Bike lanes as lines, with id, name and two_way (True for a two-way lane).

    The data has no attribute that tells if a lane is on the sidewalk (only 5 of 449 names say "vorera"),
    so find that with an overlay on the sidewalks.
    Source: Ajuntament de Barcelona, Open Data BCN, carril-bici (newest quarter), CC BY 4.0.
    """
    path = fetch(RAW / "bike_lanes" / "carril_bici.zip",
                 lambda: ckan_resource("carril-bici", lambda r: r["format"].upper() == "ZIP"))
    gdf = pyogrio.read_dataframe(path, columns=["ID", "TOOLTIP"]).rename(columns={"ID": "id", "TOOLTIP": "name"})
    return gdf.assign(two_way=gdf["name"].str.contains("bidireccional"))


def pedestrian_streets() -> gpd.GeoDataFrame:
    """Streets with pedestrian priority as centre lines (LineString, not polygons), with id and type.

    type 'plataforma_unica': single-platform streets where pedestrians have priority (carrers-plataforma-unica-bcn).
    type 'sin_vehiculos': streets without motor vehicles (carrers-vianants-bcn).
    type 'eje_verde': the Eixample green axes Consell de Cent, Rocafort and Girona (carrers-pacificats-bici-bcn).
    That dataset stopped in 2022 with these 3 lines only, but the newer datasets do not contain them.
    Newest quarter of each. Source: Ajuntament de Barcelona, Open Data BCN, CC BY 4.0.
    """
    parts = []
    for kind, dataset in [("plataforma_unica", "carrers-plataforma-unica-bcn"), ("sin_vehiculos", "carrers-vianants-bcn"),
                          ("eje_verde", "carrers-pacificats-bici-bcn")]:
        path = fetch(RAW / "pedestrian_streets" / f"{kind}.zip",
                     lambda: ckan_resource(dataset, lambda r: r["format"].upper() == "ZIP"))
        parts.append(pyogrio.read_dataframe(path, columns=["ID"]).assign(type=kind))
    return gpd.GeoDataFrame(pd.concat(parts, ignore_index=True).rename(columns={"ID": "id"}), crs=CRS)


def signs() -> gpd.GeoDataFrame:
    """Active vertical traffic signs, one point each.

    code: sign code, for example R-308 (no parking) or A-3 (moto parking).
    description: text of the code table (infraestructures-tipologia-senyals). Empty for about 20,000 signs
    with a code that the table does not have.
    legend: text on the sign (Desc_Llegenda, spaces collapsed). On the plates it holds the rule: A-13
    'Motos en vorera', A-14 'Inclús motos en vorera', A-15 'Motos excepte en zones senyalitzades', A-3 'Motos'.
    The code table only says 'Aparcament prohibit' for A-13 to A-15.
    support_id: the pole. A plate has the same support_id as the R-307 or R-308 sign above it.
    date: date the sign was entered (Data_Alta). Signs with a removal date (Data_Baixa) are left out.
    Source: Ajuntament de Barcelona, Open Data BCN, infraestructures-inventari-senyals, CC BY 4.0.
    """
    csv = lambda r: r["format"].upper() == "CSV"
    df = pd.read_csv(fetch(RAW / "signs" / "senyals.csv", lambda: ckan_resource("infraestructures-inventari-senyals", csv)),
                     dtype=str)
    types = pd.read_csv(fetch(RAW / "signs" / "tipologia.csv", lambda: ckan_resource("infraestructures-tipologia-senyals", csv)),
                        dtype=str, encoding="utf-8-sig")
    df = df[df["Data_Baixa"].isna()]
    # The code table lists R-100 twice.
    names = types.drop_duplicates("Codi_Senyal").set_index("Codi_Senyal")["Descripció_Senyal"]
    out = pd.DataFrame({
        "code": df["Codi_Senyal"],
        "description": df["Codi_Senyal"].map(names),
        "legend": df["Desc_Llegenda"].str.split().str.join(" "),
        "support_id": df["ID_Suport"],
        "date": pd.to_datetime(df["Data_Alta"], format="%Y/%m/%d"),
    })
    points = gpd.points_from_xy(df["X_ETRS89"].astype(float), df["Y_ETRS89"].astype(float))
    return gpd.GeoDataFrame(out, geometry=points, crs=CRS)


def trees() -> gpd.GeoDataFrame:
    """Street trees, one point each, with id, species (scientific name) and kind (tipus_element).

    Source: Ajuntament de Barcelona, Open Data BCN, arbrat-viari (newest quarter), CC BY 4.0.
    """
    path = fetch(RAW / "trees" / "arbrat_viari.csv.zip",
                 lambda: ckan_resource("arbrat-viari", lambda r: r["name"].lower().endswith(".csv.zip")))
    df = pd.read_csv(path, dtype=str, usecols=["codi", "x_etrs89", "y_etrs89", "tipus_element", "cat_nom_cientific"])
    points = gpd.points_from_xy(df["x_etrs89"].astype(float), df["y_etrs89"].astype(float))
    out = df.rename(columns={"codi": "id", "cat_nom_cientific": "species", "tipus_element": "kind"})
    return gpd.GeoDataFrame(out[["id", "species", "kind"]], geometry=points, crs=CRS)


def _facilities(dataset: str, folder: str, category: str) -> gpd.GeoDataFrame:
    # The city facility lists have one row per category and phone number, so group by facility.
    csv = fetch(RAW / folder / f"{folder}.csv", lambda: ckan_resource(dataset, lambda r: r["format"].upper() == "CSV"))
    df = pd.read_csv(csv, encoding="utf-16", dtype=str)
    df = df[df["secondary_filters_fullpath"].str.contains(category, na=False)]
    g = df.groupby("register_id").agg(name=("name", "first"), x=("geo_epgs_25831_x", "first"), y=("geo_epgs_25831_y", "first"),
                                      type=("secondary_filters_name", lambda s: "; ".join(sorted(set(s)))))
    points = gpd.points_from_xy(g["x"].astype(float), g["y"].astype(float))
    return gpd.GeoDataFrame(g[["name", "type"]].reset_index(drop=True), geometry=points, crs=CRS)


def schools() -> gpd.GeoDataFrame:
    """Schools, one point each, with name and type (the categories, for example 'Educació primària').

    From the city facility list equipament-educacio, only its categories under infant and regulated
    education (infant 0-3 and 3-6, primary, secondary, vocational, music, universities). The datasets
    educacio-ensenyament-reglat and educacio-ensenyament-infantil are subsets of it. The file is refreshed daily.
    Source: Ajuntament de Barcelona, Open Data BCN, CC BY 4.0.
    """
    return _facilities("equipament-educacio", "schools", "Ensenyament infantil|Ensenyament reglat")


def hospitals() -> gpd.GeoDataFrame:
    """Hospitals and health centres, one point each, with name and type.

    type is 'Hospitals i clíniques' (this includes small private clinics), 'CAPs' (primary care) or
    'Centres urgències (CUAPs)' (urgent care). From sanitat-hospitals-atencio-primaria, which is
    equipament-sanitat without pharmacies. The file is refreshed daily.
    Source: Ajuntament de Barcelona, Open Data BCN, CC BY 4.0.
    """
    return _facilities("sanitat-hospitals-atencio-primaria", "hospitals", "Hospitals i Centres d'Atenció Primària")


# Offence codes for parking on sidewalks, pedestrian areas and crossings, from denuncies_sancions_transit_bcn_codis.
FINE_CODES = ["1038", "1050", "1051", "1052", "1064", "1080", "1081", "1083", "1133", "1134", "1156", "1158", "1159",
              "1163", "1164", "1165"]


def fines(year: int = 2025) -> gpd.GeoDataFrame:
    """Sidewalk parking fines of motorcycles and mopeds in one year, one point each.

    Rows: vehicle type M (moto), CM (ciclomotor) or VL (velomotor) and an offence code in FINE_CODES.
    date, code, description (short, Catalan), vehicle, tow (True when the tow truck took the vehicle),
    amount (nominal EUR, before discounts), street. The data has no time and no plate, so equal rows
    can be separate fines. Rows without coordinates and quarters that are not published yet are left out.
    Source: Ajuntament de Barcelona, Institut Municipal d'Hisenda, Open Data BCN, CC BY 4.0.
    """
    frames = []
    for quarter in range(1, 5):
        name = f"{year}_{quarter}t"
        match = lambda r: r["name"].startswith(name) and r["format"].upper() == "CSV"
        try:
            csv = fetch(RAW / "fines" / f"{name}.csv", lambda: ckan_resource("denuncies_sancions_transit_bcn_detall", match))
        except LookupError:
            continue
        df = pd.read_csv(csv, dtype=str, usecols=["Data_Infraccio", "Nom_Carrer", "X_ETRS89", "Y_ETRS89", "Infraccio_Codi",
                                                  "Grua", "Tipus_Vehicle_Codi", "Import_Nominal_€"])
        frames.append(df[df["Tipus_Vehicle_Codi"].isin(["M", "CM", "VL"]) & df["Infraccio_Codi"].isin(FINE_CODES)])
    df = pd.concat(frames, ignore_index=True).dropna(subset=["X_ETRS89", "Y_ETRS89"])
    codes = pd.read_csv(fetch(RAW / "fines" / "codis.csv", lambda: ckan_resource(
        "denuncies_sancions_transit_bcn_codis", lambda r: r["format"].upper() == "CSV")), dtype=str)
    out = pd.DataFrame({
        "date": pd.to_datetime(df["Data_Infraccio"], format="%Y-%m-%d"),
        "code": df["Infraccio_Codi"],
        "description": df["Infraccio_Codi"].map(codes.set_index("Infraccio_Codi")["Infraccio_Desc_Curta_CA"]),
        "vehicle": df["Tipus_Vehicle_Codi"],
        "tow": df["Grua"].str.strip() == "X",
        "amount": pd.to_numeric(df["Import_Nominal_€"]),
        "street": df["Nom_Carrer"],
    })
    points = gpd.points_from_xy(pd.to_numeric(df["X_ETRS89"]), pd.to_numeric(df["Y_ETRS89"]))
    return gpd.GeoDataFrame(out, geometry=points, crs=CRS)


def _file_date(path: Path):
    # Newest date that the file records: GeoPackage last change, ZIP entry time or Overpass data time.
    if path.suffix == ".gpkg":
        with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as db:
            return db.execute("SELECT max(last_change) FROM gpkg_contents").fetchone()[0][:10]
    if path.suffix == ".zip":
        # Some archives store the 1980 DOS epoch instead of a real time.
        stamps = [member.date_time for member in zipfile.ZipFile(path).infolist() if member.date_time[0] > 1980]
        return "%04d-%02d-%02d" % max(stamps)[:3] if stamps else None
    if path.suffix == ".json":
        return json.loads(path.read_text())["osm3s"]["timestamp_osm_base"][:10]
    return None


if __name__ == "__main__":
    ODB = "https://opendata-ajuntament.barcelona.cat/data/dataset/"
    newest = lambda paths: max(filter(None, map(_file_date, paths)), default=None)
    modified = lambda paths: pd.read_csv(paths[0], encoding="utf-16", usecols=["modified"])["modified"].max()[:10]
    # name: (loader, raw files, source URLs, newest data date from the loaded frame and the raw files)
    table = {
        "reserves": (reserves, ["reserves/reserves.csv"], [ODB + "infraestructures-inventari-reserves"],
                     lambda g, p: g["data_alta"].max()),
        "inca": (inca, ["inca/inca.csv"], [ODB + "accessibilitat-via-publica"], lambda g, p: str(g["year"].max())),
        "crossings": (crossings, ["mtm/Base (Polígons).gpkg", "topo1000/TOPO1000_LINIES.gpkg"], [MTM_ZIP, TOPO_ZIP],
                      lambda g, p: newest(p)),
        "municipality": (municipality, ["mtm/Límit Terme Municipal Barcelona.gpkg"], [MTM_ZIP], lambda g, p: newest(p)),
        "transit_stops": (transit_stops, ["transit/*"], [url for _, _, url, _, _ in GTFS_FEEDS] + [OSM_COPYRIGHT],
                          lambda g, p: newest(p)),
        "bike_lanes": (bike_lanes, ["bike_lanes/*.zip"], [ODB + "carril-bici"], lambda g, p: newest(p)),
        "pedestrian_streets": (pedestrian_streets, ["pedestrian_streets/*.zip"],
                               [ODB + d for d in ("carrers-plataforma-unica-bcn", "carrers-vianants-bcn",
                                                  "carrers-pacificats-bici-bcn")], lambda g, p: newest(p)),
        "signs": (signs, ["signs/*.csv"], [ODB + "infraestructures-inventari-senyals", ODB + "infraestructures-tipologia-senyals"],
                  lambda g, p: str(g["date"].max().date())),
        "trees": (trees, ["trees/*.zip"], [ODB + "arbrat-viari"], lambda g, p: newest(p)),
        "schools": (schools, ["schools/schools.csv"], [ODB + "equipament-educacio"], lambda g, p: modified(p)),
        "hospitals": (hospitals, ["hospitals/hospitals.csv"], [ODB + "sanitat-hospitals-atencio-primaria"],
                      lambda g, p: modified(p)),
        "fines": (fines, ["fines/2025_*.csv", "fines/codis.csv"],
                  [ODB + "denuncies_sancions_transit_bcn_detall", ODB + "denuncies_sancions_transit_bcn_codis"],
                  lambda g, p: str(g["date"].max().date())),
    }
    manifest = {}
    for name, (load, files, urls, date) in table.items():
        gdf = load()
        assert len(gdf) and gdf.crs == CRS, name
        paths = sorted(p for pattern in files for p in RAW.glob(pattern) if not p.name.endswith(".part"))
        downloaded = time.strftime("%Y-%m-%d", time.localtime(max(p.stat().st_mtime for p in paths)))
        manifest[name] = {"url": urls, "downloaded": downloaded, "data_date": date(gdf, paths), "rows": len(gdf)}
        print(f"{name}: {len(gdf)} rows, data date {manifest[name]['data_date']}, downloaded {downloaded}")
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
