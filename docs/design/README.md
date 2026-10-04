# Xamfrà

Sistema de diseño de MotoBCN (nombre provisional de la app): aparca la moto en Barcelona, sin dudas. El sistema se llama Xamfrà por el chaflán del Eixample, que es su forma de marca; en la interfaz y en los textos la app se llama siempre MotoBCN.

MotoBCN es una app de mapa: el mapa es el protagonista y todo lo demás se aparta. La interfaz es minimalista y neutra, en tonos piedra, y Barcelona aparece en tres gestos concretos: el **azul mar** como color de marca, el **chaflán** del Eixample como forma, y el **trencadís** como capa de color que da significado al mapa. Si una pantalla tiene los tres a la vez, sobra uno.

## Principios

**El mapa manda.** La UI vive en un bottom sheet y un buscador flotante; nada tapa el mapa sin motivo. Fondo en `pedra-50`, superficies en `pedra-100` con `shadow-sheet`, y líneas en `linia` antes que sombras.

**Un color, un significado.** Los cuatro colores del trencadís (`rajola-blau`, `rajola-groc`, `rajola-verd`, `rajola-vermell`) están reservados para decir dónde se puede aparcar. No se usan como decoración en la UI, ni para botones ni para texto. La marca es `mar`.

**Respuesta primero.** La pantalla responde a "¿puedo aparcar aquí?" antes de explicar por qué: estado arriba, en `label`; la razón debajo, en `body`.

**Barcelona con discreción.** El trencadís completo solo aparece en el icono, la pantalla de bienvenida y los estados vacíos, nunca detrás de texto. El chaflán (`xamfra-cut`) es la forma de los marcadores del mapa, del botón "mi ubicación" y del icono, y de nada más.

## Voz

Tuteo, frases cortas, verbos al principio. "Aparca en paralelo, a medio metro del bordillo", no "Se recomienda estacionar…". Los nombres de calles van tal cual en catalán (Carrer de Mallorca, Passeig de Gràcia). La app informa de la ordenanza, no garantiza que no haya multa: di "según la ordenanza" cuando hables de aceras, y recuerda mirar la señalización.

## Color

Dos temas, Día y Noche, con los mismos nombres de token. El modo Noche no es una inversión: el fondo es grafito (`pedra-50` #121416), `mar` se aclara para mantener el contraste y `rajola-groc` pasa a ser el anillo de foco.

- Texto siempre en `tinta` o `tinta-suau` sobre `pedra-50`, `pedra-100` o `pedra-200`.
- Botón primario: relleno `mar`, texto `sobre-mar`, `radius-md`. Un solo primario por pantalla.
- Selección y chip activo: fondo `mar-suau`, texto `mar`.
- `rajola-groc` nunca va como texto ni como icono sobre fondo claro (no llega a 3:1). En el mapa y en la leyenda lleva el contorno `rajola-groc-vora`.
- Los estados del mapa se distinguen también por luminosidad (amarillo claro, azul y verde medios, rojo), y además llevan icono y etiqueta: nunca dependas solo del color.

## Tipografía

Space Grotesk para títulos (`display`, `title`, `heading`), Manrope para texto (`body`, `body-sm`, `label`) e IBM Plex Mono para datos (`dato`): distancias, anchos de acera y tiempos. Las tres son de Google Fonts. El título del bottom sheet es siempre el nombre de la calle en `title`.

## Espaciado y forma

Rejilla de 4 px. Margen de pantalla `space-4`, separación entre bloques `space-6`. Tarjetas y botones con `radius-md`; el bottom sheet con `radius-lg` arriba. El chaflán es el único corte recto de la marca: esquinas cortadas a 45° al `xamfra-cut` del lado, como una manzana del Eixample vista desde arriba.

## Iconografía

Lucide, trazo 1.75 px, esquinas redondeadas, a 20 o 24 px, en `tinta`. Sin iconos rellenos salvo los marcadores del mapa. En Logos están el icono de la app y la marca simple.

## Accesibilidad

Objetivos táctiles de al menos 44 px. Texto a 4.5:1 en ambos temas (los tokens de texto ya lo cumplen sobre las superficies indicadas). Foco visible: anillo de 2 px en `mar` (Día) o `rajola-groc` (Noche).
