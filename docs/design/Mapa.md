# Mapa

La capa de aparcamiento es el corazón de la app. Cada tramo se pinta con un color del trencadís, siempre con icono y etiqueta en la leyenda.

| Estado | Token | Etiqueta | Cuándo |
| --- | --- | --- | --- |
| Plaza en calzada | `rajola-blau` | EN CALZADA | Plaza de moto señalizada. La opción preferente de la ordenanza. |
| Acera en paralelo | `rajola-groc` | PARALELO | Acera de 3 a 6 m sin señal que lo prohíba. |
| Acera en semibatería | `rajola-verd` | SEMIBATERÍA | Acera de más de 6 m que deja más de 3 m de paso. |
| Prohibido | `rajola-vermell` | NO APARCAR | Acera de menos de 3 m, accesos a escuelas y hospitales, plataforma única. |

## Cómo se dibuja

- Mapa base: la ciudad como un trencadís. Las manzanas son las teselas, en `pedra-50`, y las calles son la junta, en `rajola-junta`. Edificios, si se dibujan, con contorno en `linia`. Pocas etiquetas, en `tinta-suau`, en mayúsculas y abreviadas ("C. DE MALLORCA").
- Tramos de acera: líneas de 6 px con extremos redondeados, dentro del borde de la manzana. Los amarillos llevan un contorno de 1 px en `rajola-groc-vora` para leerse sobre las manzanas claras; el azul, el verde y el rojo ya llegan a 3:1 sin contorno.
- Plazas en calzada: marcador con chaflán (`xamfra-cut`) de 24 px, relleno `rajola-blau`, anillo del color de la manzana e icono de moto en `sobre-mar`. Se colocan en los chaflanes, que es donde están las plazas de moto del Eixample, nunca en mitad del cruce.
- Seleccionado: el tramo crece a 8 px y gana un contorno de 2 px en `tinta`; el bottom sheet muestra su calle en `title`. Ningún marcador se dibuja pegado al tramo seleccionado ni a la posición del usuario.
- Posición del usuario: punto de 8 px en `mar` con anillo `pedra-100` y halo de 28 px en `mar` al 16 %.
- Todo lo que flota sobre el mapa (buscador, chips, botón "mi ubicación") va en `pedra-100` con borde de 1 px en `linia` y sombra suave, porque en Noche comparte tono con las manzanas. El botón de ubicación es un octógono con chaflán.

## Textos del bottom sheet

Estado en `label` con el color del tramo; la distancia y el ancho en `dato` ("120 m · acera 4,2 m"); la razón en `body`. Cierra siempre con "Según la ordenanza. Revisa la señalización."
