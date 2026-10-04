# MotoBCN

Mapa de los sitios donde se puede aparcar una moto en Barcelona, también en la acera. Aplica el artículo 40 de la Ordenança de circulació de vianants i de vehicles a los datos abiertos del Ayuntamiento.

## Estructura

- `pipeline/`: descarga los datos y calcula el estado de cada tramo de acera.
- `design/`: prototipos visuales.
- `docs/investigacion.md`: normativa, fuentes de datos y decisiones técnicas.

## Pipeline

Requiere `uv` y `tippecanoe`.

    cd pipeline
    uv run pytest -q
    uv run python build.py

`build.py` genera `data/out/motobcn.pmtiles` y `meta.json` y los copia a `web/public/data/`. Los datos descargados se guardan en `data/raw/`: para descargar una fuente otra vez, borra su carpeta. Con las variables `TMB_APP_ID` y `TMB_APP_KEY` usa el GTFS oficial de TMB (por ejemplo, `uv run --env-file .env python build.py`).

## Web

    cd web
    npm install
    npm run dev

## Publicación

`.github/workflows/deploy.yml` compila la web y la publica en GitHub Pages en cada push a `main`. Los datos del mapa salen de la release `data`, porque CartoBCN corta las descargas grandes desde GitHub. Para actualizar los datos:

    cd pipeline
    uv run --env-file .env python build.py
    gh release upload data ../data/out/motobcn.pmtiles ../data/out/meta.json --clobber
    gh workflow run deploy.yml
