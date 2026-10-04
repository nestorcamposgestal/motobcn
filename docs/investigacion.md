# Investigación

Estado a 1 de octubre de 2026. Este documento recoge la normativa, los datos disponibles y las decisiones técnicas del proyecto.

## Normativa

### Texto en vigor

La norma es el artículo 40 de la Ordenança de circulació de vianants i de vehicles (OCVV) de Barcelona. El Plenari aprobó la última modificación el 29 de noviembre de 2024. Está en vigor desde el 1 de febrero de 2025. No hay modificaciones posteriores.

- [Texto consolidado de la OCVV](https://api-bcnroc.ajuntament.barcelona.cat/api/core/bitstreams/d605b922-f005-441c-a1f2-22b1d670127f/content)
- [Anuncio de la aprobación definitiva en el BOPB](https://bop.diba.cat/anunci/3709347/aprovacio-definitiva-de-la-modificacio-de-l-ordenanca-de-circulacio-de-vianants-i-de-vehicles-ajuntament-de-barcelona)
- [Página municipal sobre la moto](https://www.barcelona.cat/mobilitat/ca/mitjans-de-transport/moto)

### Artículo 40

1. Las motos de dos ruedas aparcan en los espacios reservados para ellas. Si no hay, aparcan en la calzada en semibatería, con un máximo de 1,5 m de ancho.
2. Está prohibido aparcar en rampas de peatones, vados, carriles bici y delante de contenedores.
3. Está prohibido aparcar más de 8 días seguidos en el mismo sitio.
4. La calzada es la opción preferente. La acera solo es posible "cuando no sea posible" lo anterior, y si no hay prohibición, entorno escolar u hospitalario, ni reserva de carga y descarga, de PMR o de aparcabicis. La acera, andén o paseo debe medir más de 3 m. Condiciones:
   - a) a 50 cm del bordillo;
   - b) a 2 m de los límites de un paso de peatones o de una parada de transporte público;
   - c) entre los alcorques, sin sobresalir;
   - d) en paralelo al bordillo si mide de 3 a 6 m;
   - e) en semibatería si mide más de 6 m;
   - f) acceso a la acera con el motor parado;
   - g) sin atar la moto al mobiliario urbano;
   - h) siempre con 3 m libres para los peatones.
5. Las motos de más de dos ruedas siguen las normas de los coches. Nunca aparcan en la acera.

Consecuencias para el cálculo:

- Una acera de 3,00 m exactos no cumple ("més de tres metres").
- Con 0,5 m de separación, unos 0,8 m de moto y 3 m libres, el paralelo necesita unos 4,3 m de acera.
- La preferencia por la calzada no fija ninguna distancia. La app la muestra como recomendación, no como prohibición.

### Otras reglas

- Art. 64.19: la grúa puede actuar en una acera permitida si la moto está delante de una carga y descarga en horario, una plaza PMR, una salida de emergencia, un hospital o una parada de transporte público.
- Anexo VI: en plataforma única y zonas de peatones solo se aparca en los sitios señalizados. Las fuentes municipales se contradicen sobre las aceras de plataforma única. El proyecto aplica la lectura prudente: prohibido salvo plaza marcada.
- Los ejes verdes (Consell de Cent, Rocafort, Comte Borrell, Girona) tienen señales de prohibición.
- Art. 9.6: las motos no pueden entrar en los parques.
- En marzo de 2025 había 4.372 tramos de acera con señal de prohibición para motos ([nota de prensa](https://ajuntament.barcelona.cat/premsa/2025/03/10/barcelona-arriba-a-mes-de-4-300-trams-de-vorera-senyalitzats-amb-la-prohibicio-daparcar-hi-motos/)).

### Lo que no existe

Barcelona no tiene una regla de "no aparcar en la acera si hay una zona moto a menos de 50 m". El texto consolidado no la contiene. Madrid tiene una regla parecida, de 100 m y solo para el motosharing.

### Multas y grúa

- Multa de 50 € en los casos generales y de 100 € en entornos escolares u hospitalarios, rampas y carriles bici ([campaña municipal de 2026](https://www.barcelona.cat/infobarcelona/ca/la-moto-ben-aparcada_1620637.html)).
- Grúa para una moto: 77 € más el depósito ([tarifas de la grúa municipal](https://gruamunicipal.ajuntament.barcelona.cat/ca/tarifes)).
- Las plazas AREA Motos son gratuitas, 24 h, para vehículos de hasta 3 ruedas ([AREA](https://www.areaverda.cat/ca/informacio/tipus-de-places/reserva-motos)).

## Datos

Los datos del Ayuntamiento tienen licencia CC BY 4.0. La atribución es "Font de les dades: Ajuntament de Barcelona", con la fecha de actualización y la indicación de que los datos están modificados.

| Necesidad | Fuente | Notas |
|---|---|---|
| Zonas moto | Open Data BCN `infraestructures-inventari-reserves` | 17.507 tramos "Motos calçada" y 370 "Motos vorera", unas 100.000 plazas. Líneas en ETRS89. Actualización semanal. También trae carga y descarga, PMR, aparcabicis, entornos escolares y salud. |
| Bordillos, fachadas, pasos, árboles | CartoBCN, Cartografia Topogràfica Municipal 1:1000 en GeoPackage (producto 144) | 41.016 líneas de bordillo (2.538 km), 48.174 de fachada, 32.822 franjas de paso de peatones, 405.977 árboles. Actualizada en julio de 2026. No hay polígonos de acera. |
| Polígonos de paso de peatones, parterres, topónimos | CartoBCN, Mapa Topogràfic Municipal en GeoPackage (producto 131) | Actualizado en agosto de 2026. |
| Validación del ancho | Open Data BCN `accessibilitat-via-publica` (encuesta INCA) | Unas 20.000 medidas de paso libre en cm, de 2018 a 2022. |
| Paradas de transporte | GTFS de TMB (copia de Mobility Database), GTFS de AMB, GTFS de TRAM y OpenStreetMap | 2.687 paradas. OSM solo añade las que están a más de 30 m de una parada oficial. |
| Carril bici | Open Data BCN `carril-bici` | Trimestral. |
| Calles peatonales y plataforma única | Open Data BCN `carrers-plataforma-unica-bcn`, `carrers-vianants-bcn`, `carrers-pacificats-bici-bcn` | Los ejes verdes solo tienen datos hasta 2022. |
| Señales | Open Data BCN `infraestructures-inventari-senyals` y `infraestructures-tipologia-senyals` | Placas A-13, A-14 y A-15 ("motos en vorera"). Cada señal es un punto: el tramo que cubre se deduce. |
| Árboles de calle | Open Data BCN `arbrat-viari` | 145.562 árboles. Trimestral. |
| Multas | Open Data BCN `denuncies_sancions_transit_bcn_detall` y `denuncies_sancions_transit_bcn_codis` | Con coordenadas. En el cuarto trimestre de 2025 hubo 5.527 multas a motos por aparcar mal en la acera, y la grúa actuó en el 63 % de los casos. |
| Terrazas | Open Data BCN `terrasses-comercos-vigents` | Semestral. Sin uso por ahora. |

Fuentes descartadas o secundarias:

- OpenStreetMap no sirve para las aceras ni para las zonas moto. Tiene 407 aparcamientos de moto en Barcelona y el ancho solo en el 1 % de las aceras.
- Los vados no tienen geometría abierta. Los portales del Catastro (INSPIRE) son una aproximación.
- Ningún servicio actual (SMOU, mapa de AREA, Plànol BCN) muestra dónde aparcar la moto en la acera.

### Ancho de acera

El ancho es la distancia perpendicular desde el bordillo hasta el primer límite del lado del peatón: fachada, muro o valla. En una mediana es la distancia hasta el otro bordillo. Una prueba con el método más simple (fachada más cercana) dio una mediana de 5,2 m en el Eixample, donde las aceras miden 5 m. Ese método falla en paseos con medianas, y el pipeline usa un método que detecta el lado del peatón. Hay un trabajo previo con la misma cartografía: [Valls y Clua 2023, PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0284630).

## Decisiones técnicas

| Parte | Elección | Motivo |
|---|---|---|
| Pipeline | Python, uv, GeoPandas y Shapely 2 | Las operaciones de buffer y recorte sobre 500.000 tramos caben en memoria. |
| Teselas | tippecanoe a un único fichero PMTiles | Un fichero estático, sin servidor. |
| Web | Vite, React, TypeScript, MapLibre GL JS 6, Tailwind v4, shadcn con Base UI | Ecosistema maduro y camino directo a móvil. |
| Mapa base | Extracto de Protomaps de Barcelona (unos 24 MB) | Sin claves y con estilos claro y oscuro desde el mismo fichero. |
| Buscador | Geocodificador del ICGC | Gratuito, sin clave y con CORS abierto. |
| Alojamiento | GitHub Pages | Acepta peticiones Range para PMTiles. Cloudflare Pages las ignoró en las pruebas. |
| Móvil | Capacitor 8 | Reutiliza la web. Si no rinde, la alternativa es Expo con MapLibre React Native. |

Descartes: Next.js (no hace falta renderizar en servidor), Mapbox y Google Maps (claves y coste), Flutter (sale del ecosistema React), backend (no hace falta en la primera versión), `vaul` (abandonado) y OpenFreeMap en producción (sin garantía de servicio).

## Pendiente antes de publicar

- Registrar la app en el portal de desarrolladores de TMB. Su licencia gratuita exige el registro y citar a TMB con la fecha de actualización.
- Confirmar si el GTFS de AMB es CC BY 4.0 o CC BY-ND 4.0.
- Mostrar "Powered by TRAM Barcelona" en los créditos.
- Mostrar "© OpenStreetMap contributors" (mapa base y paradas de OSM, licencia ODbL).

## Límites conocidos

- La app es orientativa. La señalización y la Guàrdia Urbana tienen prioridad.
- No hay datos de vados ni de contenedores.
- El ancho es total, de fachada a bordillo. El paso libre real es menor por los obstáculos.
- El tramo que cubre una señal se deduce de su posición. Los entornos escolares y hospitalarios no tienen distancia legal.
- Las restricciones temporales (obras, eventos) no están en los datos.
