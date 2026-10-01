# Auditoría de la ventana Intro & ending — 2026-09-30

Encargo del usuario: _"ya probé la ui en intro & ending y duele usarla jaja (...)
no veo las flechas para cambiar de spectrum en el selector y las configuraciones
están enredadas, audita toda la ventana y pule la ui y analiza qué sirve y qué
no y qué se repite"_.

Tres preguntas, tres respuestas medidas: **qué sirve**, **qué no**, **qué se
repite**. Todo lo de abajo se verificó ejecutándolo o contándolo con un script,
no leyendo el fichero por encima. Lo que ya se arregló en este mismo pase va
marcado; lo que queda, con el motivo.

## 1. Base medida

| Medida                                   | Antes            | Después          |
| ---------------------------------------- | ---------------- | ---------------- |
| `IntroSequenceTab.tsx`                   | 1 570 líneas     | 1 740 líneas     |
| Claves de `IntroSequenceSettings`        | 58               | 58               |
| ...sin consumidor en el render           | **0**            | **0**            |
| ...sin control en la UI                  | **0**            | **0**            |
| `<Select>` en el fichero                 | 12               | 10               |
| `<SegmentedControl>` en el fichero       | 10               | 9                |
| `<FeatureGate>` en el fichero            | **0**            | 2                |
| Fila de sub-pestañas (ventana de 768 px) | y≈662 (**86 %**) | y≈318 (**40 %**) |
| Primer ajuste de la sub-pestaña          | bajo el pliegue  | visible          |

El fichero crece 170 líneas y aun así hay menos controles escritos: lo que se
fue en duplicación volvió en un componente compartido, en los dos `FeatureGate`
y en los comentarios que explican por qué cada pieza está donde está.

## 2. Qué sirve

**Todo.** Es el hallazgo más importante de la auditoría y va en contra de lo que
parecía: la ventana no tiene ni un ajuste muerto.

Se comprobó por script, no por vista: se extraen las 58 claves de
`IntroSequenceSettings` de `src/types/wallpaper.ts` y se busca cada una en los
dos lados por separado — el camino de render (`src/features/intro/` sin
`controls/`) y la UI (`src/features/intro/controls/`). **Las 58 aparecen en los
dos.** Ninguna clave se dibuja sin poder tocarse, y ninguna se toca sin dibujar
nada.

Así que el problema **nunca fue el exceso de ajustes**. Fue el orden, el adorno
y la duplicación. Eso cambia qué se arregla: no hay nada que borrar, hay que
reordenar.

## 3. Qué no sirve — y se quitó

### 3.1 La pestaña se saltaba el contrato de `EditorTabLayout`

`EditorTabLayout` fija la anatomía de toda pestaña del editor: `header` (título +
**el único sitio** para el interruptor maestro) → `savedProfiles` → `children` →
`footer`. Esta pestaña tenía las tres primeras regiones mal:

- La cabecera (`IntroTab.tsx`) sólo llevaba un icono `Clapperboard` decorativo:
  41 px de alto que no decían nada.
- El interruptor maestro iba suelto dentro del cuerpo, en una tarjeta
  «Generated intro» con su propio título — un segundo encabezado debajo del
  primero, diciendo casi lo mismo.
- El banco de animaciones guardadas iba suelto en el cuerpo en vez de en
  `savedProfiles`, y abierto, así que **lo primero que veías al entrar era una
  rejilla de slots vacíos**.

Consecuencia medida, y es la que explica el «duele usarla»: en una ventana de
768 px la fila de sub-pestañas — lo único con lo que se navega — empezaba al
**86 %** de la altura, y el primer ajuste de cualquier sub-pestaña caía bajo el
pliegue. Había que hacer scroll antes de poder tocar nada.

**Arreglado.** El interruptor vive en `EditorTabHeader`, y el selector
Intro/Ending va a su lado en la cabecera porque los dos son la misma pregunta:
el interruptor siempre manda sobre la ventana que estás mirando, y sólo hay uno
en pantalla. `IntroTab.tsx` pasa a ser un paso directo de 13 líneas. La fila de
sub-pestañas sube al 40 %.

### 3.2 Siete bloques antes del primer ajuste, cinco de ellos repetidos

Entre el borde de la pestaña y el primer control de cualquier sub-pestaña había
siete bloques, y cinco eran idénticos en las **2 ventanas × 5 sub-pestañas = 10
combinaciones**: cabecera decorativa, tarjeta «Generated intro», banco de slots,
fila de sub-pestañas, transporte, «Quick looks», y recién entonces la tarjeta de
la sección. «Quick looks» solo son ~160 px permanentes en las diez.

**Arreglado.** «Animaciones guardadas» y «Quick looks» pasan a
`CollapsibleSection`, plegadas por defecto y **con memoria**: quien viva en el
banco lo deja abierto. Son sitios a los que vuelves, no sitios donde empiezas.
El banco lleva además un contador de slots llenos en el título, para no tener
que abrirlo sólo para ver si hay algo.

### 3.3 El transporte se iba con el scroll

El botón de preview es el **instrumento** de la pestaña: la razón de ser de F1
fue poder iterar sin rebobinar el tema. Pero scrolleaba hacia arriba junto con
todo lo demás, así que en cuanto bajabas a un ajuste dejabas de ver lo que te
dice si el ajuste funcionó.

**Arreglado.** La fila de sub-pestañas y el transporte viajan juntos en una
barra `sticky` al principio del scroller, con fondo opaco. Lo que te dice dónde
estás y lo que te deja mirar no se mueven de sitio. La frase que explica el
transporte sí scrollea: es una explicación de una vez, no un mando.

### 3.4 Diez controles rancios en la sub-pestaña Text

El patrón estricto del editor es: interruptor en la cabecera de la sección,
cuerpo sólo mientras esté encendido — es exactamente lo que hace `FeatureGate`,
usado en otras **7** pestañas y **cero** veces aquí. Con Title o Tagline
apagados seguías viendo su texto, su fuente, su tamaño, su revelado, su marco y
su color: unos diez controles que no cambiaban nada en pantalla.

**Arreglado.** Cada bloque de texto lleva su interruptor en la cabecera de la
tarjeta y su cuerpo dentro de un `FeatureGate`; apagado dice una línea. La
ventana entera, igual: con el interruptor maestro apagado el cuerpo es una
línea, y el banco de animaciones sigue a mano.

### 3.5 La información del tooltip del interruptor

Al subir el interruptor a la cabecera se perdía su tooltip, que decía algo que
hay que saber: la ventana **cubre** la cabeza (o la cola) de la línea de tiempo,
**no añade duración**, así que el audio no se desfasa.

**Arreglado sin perderlo.** La clave pasa a llamarse `intro_duration_hint` y la
frase se muestra junto al slider de duración, que es donde surge la pregunta.
La clave `intro_enabled` (la etiqueta «Generarlo») sí se borró: el título de la
pestaña y el interruptor ya lo dicen.

## 4. Qué se repite

### 4.1 Title y Tagline eran el mismo instrumento escrito dos veces

Dos tarjetas de ~95 líneas cada una con el mismo juego de controles —
interruptor, texto, fuente, fuente de estilo, tamaño, revelado, color — y la
misma condición `view === 'text'` comprobada dos veces seguidas. Lo único que
difiere de verdad: el marco (sólo el título) y la línea de cierre (sólo el
tagline).

**Arreglado.** Un `IntroTextBlock` usado dos veces. Lo que difiere entra desde
fuera: el marco por `extra`, la línea por `hint`. Se escribe prop a prop en vez
de con un prefijo `'title' | 'tagline'` a propósito: así las claves de
`IntroSequenceSettings` siguen siendo grepeables y el patch sigue tipado sin un
solo cast.

### 4.2 Los selectores eran una lista larga sin flechas (F2)

El tope de slots de spectrum es 120 **a propósito**, así que el desplegable es
legítimamente largo — la captura del usuario mostraba 68 entradas casi idénticas
(«1 · Horizontal Bars», «2 · Horizontal Bars», …). Comparar dos slots seguidos,
que es el gesto normal al calibrar, costaba dos viajes por la lista.

**Arreglado en el primitivo, no en la pestaña.** `Select` acepta `steppers`, y
entonces se flanquea con `◀ ▶` que saltan al vecino sin abrir la lista. Las
flechas se saltan los `disabled` y **no dan la vuelta** en los extremos: con 120
slots, un «siguiente» que salte al primero es un brinco por todo el banco, que
no es lo que espera la mano. Al ser el primitivo compartido, entra de golpe en
los 15 sitios donde se usa.

La búsqueda del vecino vive aparte en `src/ui/lib/stepOption.ts` para que el
suite de Node la pueda cubrir — no hay harness de DOM en este repo, así que la
alternativa era no probarla. Cinco tests: avance en ambos sentidos, saltarse los
`disabled`, muerte en los dos extremos, valor que ya no está en la lista (un
slot borrado bajo el selector) y una cola entera de `disabled`.

### 4.3 Lo que sigue repetido, y por qué se queda

- **Color + relleno + color secundario** aparece dos veces en Text (el color del
  texto y el del marco) y otra vez en Montage. Es el mismo trío de controles,
  pero cada uno tiene su propia fuente de color adaptativa y su propio
  significado; juntarlos pediría un componente con más excepciones que cuerpo.
  Se queda hasta que haya un tercer caso que pida lo mismo.
- **Las dos ventanas comparten todos los controles** — eso no es duplicación,
  es el diseño: lo que aprendes en la intro se aplica al ending. Un solo
  `IntroWindowEditor` parametrizado por `kind`.

## 5. Lo que esta auditoría no toca

- **F3**, el `NotFoundError` de IndexedDB sin capturar en cada arranque, sigue
  pendiente y sin diagnosticar.
- **El tamaño del fichero.** 1 740 líneas en un componente es mucho, y la salida
  natural es partir cada sub-pestaña en su propio fichero. No se hizo en este
  pase a propósito: mover 1 400 líneas de sitio en el mismo commit que cambia su
  comportamiento hace imposible revisar ninguna de las dos cosas.
