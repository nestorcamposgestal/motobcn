# MotoBCN

Mapa de los sitios donde se puede aparcar una moto en Barcelona, también en la acera. Aplica el artículo 40 de la Ordenança de circulació de vianants i de vehicles a los datos abiertos del Ayuntamiento.

## Estructura

- `pipeline/`: descarga los datos y calcula el estado de cada tramo de acera.
- `design/`: prototipos visuales.
- `docs/investigacion.md`: normativa, fuentes de datos y decisiones técnicas.

## Pipeline

Requiere `uv`.

    cd pipeline
    uv run pytest -q

Los datos descargados se guardan en `data/raw/`. Para descargar una fuente otra vez, borra su carpeta.
