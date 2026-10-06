# Nivel 00 — Fundamentos (explicado desde cero)

> Este documento **no asume que sabes programar**. Cada palabra técnica se
> explica con una analogía del mundo real la primera vez que aparece. Si algo
> te suena a chino, no es tu culpa: avísame y lo explico todavía más.
>
> Léelo despacio. Es la base de toda la serie.

---

## 0. Antes de empezar: 5 palabras que vas a oír siempre

Vamos a desarmar el vocabulario mínimo. Imagina que el proyecto es **un teatro
que monta una obra**. Con esa imagen en la cabeza, todo encaja:

| Palabra técnica         | Qué es, en cristiano                                         | Analogía del teatro                                                   |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Código**              | Las instrucciones escritas que la computadora obedece.       | El **guion** de la obra.                                              |
| **Navegador (browser)** | El programa donde corre todo esto: Chrome, Brave, Edge…      | El **teatro** donde se monta la obra.                                 |
| **Estado (state)**      | La foto, en este instante, de cómo están las cosas.          | Quién está en el escenario, qué luces hay, qué suena **ahora mismo**. |
| **Renderizar (render)** | Tomar el estado y _dibujarlo en pantalla_.                   | Que los actores **actúen** lo que dice el guion.                      |
| **Componente**          | Una pieza reutilizable de la pantalla (un botón, un panel…). | Un **actor o utilería** que puedes reusar en varias escenas.          |

Guárdate la analogía del teatro. La voy a usar todo el rato.

---

## 1. ¿Qué es este proyecto, en una frase?

> Es un **editor de "fondos de pantalla vivos" que reaccionan a la música**, y
> que funciona entero dentro del navegador (sin instalar nada).

Desglosemos esa frase, porque cada parte importa:

- **"Fondos de pantalla vivos"** → no es una imagen quieta. Hay imágenes de
  fondo, cosas encima (logos, texto, letras de canciones), y efectos
  (partículas que flotan, lluvia, luces de concierto, barras que bailan con el
  sonido).
- **"Que reaccionan a la música"** → si pones una canción, las cosas se mueven
  al ritmo: las barras suben con los graves, el logo late, las luces parpadean.
- **"Editor"** → no solo _miras_ el resultado; puedes _cambiarlo_. Subes tus
  imágenes, mueves cosas, eliges colores, guardas tu diseño.
- **"Dentro del navegador"** → no es una app que instalas. Abres una página web
  y ahí vive todo.

### Dos modos: "editar" y "ver"

El proyecto tiene **dos pantallas**, pero son la misma obra montada de dos
maneras:

- **Editor** → la mesa de control. Ves el wallpaper _y_ tienes paneles para
  modificarlo.
- **Preview (vista previa)** → solo el wallpaper, a pantalla completa, limpio,
  como lo vería el espectador final.

Lo importante: **el motor que dibuja es el mismo en los dos**. Solo cambia si
te muestra los controles o no. (Como un teatro con ensayo general vs función:
mismo escenario, en uno hay directores gritando y en el otro no.)

---

## 2. La idea más importante de todo el proyecto

Si te quedas con UNA sola cosa de este documento, que sea esta. Todo el código
sigue **una línea de producción de 4 pasos**, y la información viaja **siempre
en la misma dirección**: de "los datos" hacia "los píxeles en pantalla".

Imagina una **fábrica con 4 estaciones en fila**:

```
  DATOS                                                    PANTALLA
  ─────►  [Estación 1]  ─►  [Estación 2]  ─►  [Estación 3]  ─►  [Estación 4]  ─►  👁️
          El almacén        El traductor       El director       Los obreros
          (todo guardado)   (lo ordena)        (reparte tareas)  (cada uno dibuja
                                                                  su parte)
```

Veamos cada estación con su nombre real en el código:

### 🏬 Estación 1 — El almacén: **el "store"**

`src/store/wallpaperStore.ts`

Un **store** (almacén) es donde se guarda **todo el estado**: cada ajuste, cada
imagen elegida, cada color, qué efectos están encendidos. Es **la única fuente
de la verdad**: si quieres saber "¿qué color tiene el logo?", la respuesta vive
aquí y en ningún otro lado.

> **Analogía:** es el **libreto maestro** de la obra. Si dice "el actor lleva
> sombrero rojo", entonces lleva sombrero rojo. Nadie improvisa por su cuenta.

La herramienta concreta que usamos para este almacén se llama **Zustand** (es
una librería, o sea, código de otros que reutilizamos). No necesitas saber nada
de Zustand todavía; solo que "el store está hecho con Zustand".

### 🔁 Estación 2 — El traductor: **`layers.ts`**

`src/lib/layers.ts`

El almacén es enorme y está organizado para que la _interfaz_ (los paneles del
editor) sea cómoda, no para dibujar. Así que hay un paso que **traduce** ese
estado gigante a una lista limpia y ordenada de **"capas"**.

Una **capa (layer)** es cada cosa apilable que se dibuja: "la imagen de fondo"
es una capa, "el logo" es otra, "las barras de espectro" otra, etc. Como las
**transparencias apiladas** de una animación antigua: el fondo abajo, los
personajes encima.

> **Analogía:** el traductor toma el libreto maestro (desordenado, lleno de
> notas) y arma una **lista de cue cards** ordenadas: "primero el telón de
> fondo, luego el actor, luego las luces…".

### 🎬 Estación 3 — El director: **`WallpaperViewport`**

`src/components/wallpaper/WallpaperViewport.tsx`

Toma esa lista de capas y **decide tres cosas**:

1. **Quién dibuja cada capa** (no todas se dibujan igual; ya verás por qué).
2. **En qué orden** se apilan (qué va delante y qué detrás).
3. **Qué cosas existen solo en el editor** (por ejemplo, las cajitas para
   arrastrar elementos — el espectador final no debe verlas).

> **Analogía:** el **director de escena**. No actúa él; reparte: "tú, luces;
> tú, sonido; tú, telón". Y coordina el orden.

### 🎨 Estación 4 — Los obreros: **los "renderers"**

Aquí está **el gran secreto del proyecto**, y la causa de que sea difícil de
entender. Préstale mucha atención:

> **No hay un solo dibujante. Hay TRES formas distintas de dibujar**, y cada
> tipo de capa usa la suya.

¿Por qué tres? Porque cada técnica es buena para cosas distintas, igual que en
una obra usas pintura para el telón, pero luces de verdad para los focos:

| Forma de dibujar                                        | Nombre técnico  | Qué dibuja aquí                                                 | Por qué se eligió                                            |
| ------------------------------------------------------- | --------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Elementos de página web normales                     | **DOM + CSS**   | la imagen de fondo, las imágenes que pones encima               | es lo más barato y simple; las transiciones salen suaves     |
| 2. Un "lienzo" donde se pinta a mano, cuadro por cuadro | **Canvas 2D**   | las barras de espectro, el logo que late, las letras, las luces | da control total cuadro-a-cuadro, ideal para movimiento fino |
| 3. Dibujo acelerado por la tarjeta gráfica              | **WebGL / GPU** | las partículas que flotan, la lluvia                            | puede mover MILES de cositas a la vez sin trabarse           |

Te explico cada una sin tecnicismos:

- **DOM + CSS:** El **DOM** es, simplemente, "la estructura de una página web":
  los recuadros, textos e imágenes que el navegador ya sabe mostrar de fábrica.
  **CSS** es el lenguaje de estilos (colores, tamaños, posiciones). Cuando una
  imagen de fondo se dibuja "con DOM", es básicamente una `<imagen>` de página
  web normal y corriente.

- **Canvas 2D:** Imagina **un lienzo en blanco y un pincel**. En vez de poner
  elementos prefabricados, el código _pinta a mano_ cada cuadro: "dibuja una
  barra aquí, otra allá, de este alto". 60 veces por segundo. Eso permite que
  las barras bailen con la música con total precisión.

- **WebGL / GPU:** La **GPU** (o tarjeta gráfica) es un chip especializado en
  dibujar muchísimas cosas en paralelo, lo mismo que usan los videojuegos.
  **WebGL** es la forma de hablarle a esa GPU desde el navegador. Se usa para
  partículas y lluvia porque ahí hay miles de puntitos moviéndose a la vez, y
  pintarlos "a mano" sería lentísimo.

> **Por qué esto te importa en la práctica:** cuando algo visual se rompe, la
> primera pregunta NO es "¿dónde está el bug?", sino **"¿en cuál de los tres
> dibujantes vive esta capa?"**. El problema casi nunca salta de un dibujante a
> otro. Saber esto te ahorra horas.

### El recorrido completo, de un vistazo

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. STORE            Guarda TODO el estado (la verdad).                 │
│    wallpaperStore     "el logo es rojo, hay lluvia activada, ..."      │
└───────────────┬──────────────────────────────────────────────────────┘
               │  alguien lee el estado
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. layers.ts        Traduce ese estado a una LISTA DE CAPAS ordenada.  │
│                       [fondo, logo, espectro, partículas, lluvia, ...] │
└───────────────┬──────────────────────────────────────────────────────┘
               │  entrega la lista
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. WallpaperViewport  Reparte cada capa a su dibujante y define el     │
│                       orden y qué es solo-editor.                      │
└───────────────┬──────────────────────────────────────────────────────┘
               │  despacha cada capa
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. LOS 3 DIBUJANTES                                                    │
│    · DOM/CSS    → imágenes de fondo y encima                           │
│    · Canvas 2D  → espectro, logo, letras, luces                       │
│    · WebGL/GPU  → partículas, lluvia                                   │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼   👁️  lo que ves en pantalla
```

---

## 3. Las herramientas que usa el proyecto (y para qué sirve cada una)

El proyecto no está hecho desde cero: usa **librerías**, que son "cajas de
código ya hechas por otra gente" que reutilizamos para no reinventar la rueda.
Como comprar tornillos en vez de fabricarlos. Estas son las principales:

| Herramienta                      | En cristiano, ¿qué hace?                                                                                          | Analogía                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **React**                        | Construye la interfaz (botones, paneles) y la mantiene sincronizada con el estado.                                | El **sistema de tramoya** que arma y reacomoda el escenario solo. |
| **react-router**                 | Decide qué pantalla mostrar según la dirección (`/editor` o `/preview`).                                          | El **acomodador** que te lleva a la sala correcta.                |
| **Zustand**                      | Hace el "almacén" (store) del que ya hablamos.                                                                    | El **archivador** del libreto maestro.                            |
| **Three.js + React Three Fiber** | Habla con la GPU para las partículas y la lluvia (el dibujante #3).                                               | El **equipo de efectos especiales**.                              |
| **Vite**                         | Junta todo el código y lo sirve para que el navegador lo entienda. Es lo que corre cuando escribes `npm run dev`. | El **escenógrafo** que monta el set antes de la función.          |
| **Tailwind**                     | Forma rápida de dar estilos (colores, espaciados) a la interfaz.                                                  | La **paleta de pintura** lista para usar.                         |
| **lucide-react**                 | Un paquete de iconitos (la lupa, la flecha, etc.).                                                                | La **caja de utilería** chica.                                    |

> No tienes que aprender ninguna de estas ahora. Solo reconocer el nombre
> cuando aparezca y saber **qué papel juega**.

### ¿Dónde se guarda todo? Tres "cajones" del navegador

El navegador ofrece sitios para guardar cosas. El proyecto usa tres, y es clave
no confundirlos:

1. **localStorage** → un cajón pequeño para **texto**. Aquí se guarda **tu
   configuración** (colores, ajustes, qué está encendido). Es ligero. La
   "etiqueta" de ese cajón se llama `vibrix-state`.

2. **IndexedDB** → un cajón grande para **archivos pesados**. Aquí van **las
   imágenes, el logo, los audios** que subes. ¿Por qué separado? Porque las
   imágenes pesan demasiado para el cajón de texto.

    > **Analogía:** localStorage es tu **agenda de bolsillo** (notas cortas).
    > IndexedDB es el **trastero** donde guardas las cajas grandes.

3. **Web Audio API** → no es un cajón, es un **"oído"**: una herramienta del
   navegador que escucha el sonido y lo convierte en números que los efectos
   pueden usar (cuánto grave, cuánto agudo hay en este instante). De aquí salen
   los famosos **"bins"** (ver glosario).

> ⚠️ **Nota importante para quien edite el código** (`AGENTS.md`): este proyecto
> **se mudó de una herramienta vieja (Next.js) a Vite**. Si encuentras
> menciones sueltas a "Next", ignóralas: son fósiles. Y como las librerías
> pueden tener cambios respecto a versiones anteriores, antes de escribir código
> conviene revisar la guía dentro de `node_modules`.

---

## 4. ¿Qué pasa, paso a paso, cuando abres la app?

Esto es como ver "qué ocurre entre que enciendes el teatro y empieza la
función". Está verificado contra el código actual:

1. **Se prende la luz.** El archivo `src/main.tsx` arranca todo y lo "engancha"
   a la página web (a un hueco llamado `#root`).

2. **El acomodador elige sala.** `src/App.tsx` mira la dirección:
    - si entras a la raíz, te manda a `/editor`,
    - `/editor` muestra la pantalla de edición,
    - `/preview` muestra la vista limpia.

    > Detalle técnico menor: usa direcciones con `#` (ej. `…/#/editor`). Es un
    > truco para que funcione sin un servidor complicado. No te preocupes por el
    > porqué.

3. **Se montan los "ayudantes de fondo" (providers).** Antes de dibujar nada,
   se encienden unos servicios que estarán disponibles para toda la app:
    - el de **idiomas** (para mostrar textos en español o inglés),
    - el de **audio** (el "oído"),
    - el de **diálogos** (las ventanitas de "¿estás seguro?"),
    - y un par que evitan que la pantalla se duerma mientras suena música.

    > **Analogía:** son los **servicios del teatro** (megafonía, luces de
    > emergencia, taquilla) que deben estar encendidos antes de que entre el
    > público.

4. **Se recupera tu configuración.** El store **rehidrata**: lee del cajón
   `localStorage` tus ajustes guardados y los carga. ("Rehidratar" = volver a
   llenar el estado con lo que tenías la última vez. Como echar agua a la sopa
   deshidratada.)

5. **Migraciones, si hace falta.** Si tus ajustes guardados son de una versión
   vieja del programa, pasan por unas **migraciones** que los actualizan al
   formato nuevo. (Lo veremos en el Nivel 01; hoy la versión va por la **85**.)

    > **Analogía:** si guardaste el libreto en un formato viejo, un asistente lo
    > pasa al formato nuevo antes de la función, para que nada se rompa.

6. **Se traen las imágenes del trastero.** Una pieza llamada
   `useRestoreWallpaperAssets` saca tus imágenes/logo/audios de IndexedDB y los
   vuelve a meter en escena (recuerda: no viven en el cajón de texto).

7. **Se monta la escena.** `WallpaperViewport` (el director) compone todo.

8. **Si hay pase de diapositivas, arranca el cronómetro.** Un componente
   llamado `SlideshowManager` no dibuja nada: solo va cambiando cuál imagen es
   la "activa" cada cierto tiempo, como un temporizador.

9. **Si activas el audio**, se crea el "oído" adecuado (según si el sonido viene
   de tu escritorio, del micrófono o de un MP3) y empieza a producir números del
   sonido.

10. **Función en marcha.** Cada dibujante lee el estado + los números del audio
    y **redibuja ~60 veces por segundo**. Mientras tú editas, el store **guarda
    los cambios solito** en el cajón.

---

## 5. El mapa del repositorio (dónde vive cada cosa)

Un **repositorio** (o "repo") es simplemente **la carpeta con todo el código**
del proyecto. Dentro hay una subcarpeta `src/` ("source", o sea "fuente") que es
donde vive lo que importa. Aquí está el plano, con comentarios en español:

```
src/
├── main.tsx, App.tsx       ← el encendido y el acomodador (pasos 1 y 2)
│
├── pages/                  ← las DOS pantallas: EditorPage y PreviewPage
│
├── store/                  ← 🏬 ESTACIÓN 1: el almacén / la verdad
│   ├── wallpaperStore.ts      el almacén principal
│   ├── slices/                el almacén partido en 12 "secciones" (ver abajo)
│   ├── wallpaperStoreTypes.ts  la "lista de qué cosas existen" en el almacén
│   ├── wallpaperStoreMigrations.ts  los actualizadores de versión vieja→nueva
│   └── wallpaperStorePersistence.ts qué se guarda y qué no
│
├── types/wallpaper.ts      ← la "ficha técnica" que describe cada ajuste posible
│
├── lib/                    ← cajón de herramientas y lógica suelta
│   ├── layers.ts              🔁 ESTACIÓN 2: el traductor estado→capas
│   ├── constants.ts           valores por defecto
│   ├── i18n/                  los textos en español (es.ts) e inglés (en.ts)
│   ├── audio/                 los tres "oídos" (escritorio, micro, archivo)
│   └── db/imageDb.ts          el código que habla con el trastero (IndexedDB)
│
├── context/
│   └── AudioDataContext.tsx ← el "cerebro del audio" que coordina los oídos
│
├── components/             ← las piezas visuales (los actores y utilería)
│   ├── app/                   los providers/ayudantes de fondo (paso 3)
│   ├── wallpaper/             🎬🎨 ESTACIONES 3 y 4: el director y dibujantes
│   │   ├── WallpaperViewport.tsx   el director
│   │   ├── layers/            dibujantes de imágenes (DOM/Canvas)
│   │   ├── ParticleField.tsx  dibujante de partículas (GPU)
│   │   └── RainLayer.tsx      dibujante de lluvia (GPU)
│   ├── audio/                 sólo el <canvas> de las capas de audio
│   └── controls/             ⭐ los armazones del editor y sus pestañas
│       └── tabs/              las pestañas que mezclan varios subsistemas
│
├── features/               ← ⭐ los subsistemas. Cada uno es UNA carpeta con
│   │                          TODO lo suyo: motor, dibujo y su pestaña.
│   ├── spectrum/             el motor de las barras de sonido (es enorme)
│   ├── lyrics/               las letras de canciones (sistema "Lyrixa")
│   ├── background/           el fondo: encuadre, slideshow, transiciones
│   ├── aiDirector/           la IA que propone escenas a partir de la imagen
│   ├── audioLayers/          título de pista, "Now Playing", carátula
│   ├── stageFx/              luces y "cámara" de concierto
│   ├── export/               exportar el wallpaper como video/imagen
│   └── (logo, particles, rain, calibration, scenes, presets, ...)
│
├── services/               ← guardar, cargar, restaurar y sincronizar el
│   │                          proyecto. Habla con el almacén; no dibuja nada.
│
├── ui/                     ← el "kit de piezas" reutilizables de la interfaz
│   │                          (botones, deslizadores, interruptores estándar)
│   └── tokens/                los colores, tamaños y espaciados "oficiales"
│
├── hooks/                  ← ayudantes reutilizables de React (lo veremos luego)
├── shaders/                ← programitas que corren en la GPU (.glsl)
└── styles/                 ← estilos globales
```

> **¿"slices"?** El almacén creció tanto que se partió en **13 secciones**
> (slices = "rebanadas"), una por tema: una para el fondo, otra para el audio,
> otra para el espectro, etc. (En la carpeta verás 14 archivos sin contar tests:
> uno es una caja de herramientas interna de la rebanada del fondo, no una
> rebanada.)
> Es como dividir un almacén gigante en pasillos señalizados. Lo desmenuzamos
> en el Nivel 01.

### Truco para encontrar cualquier cosa

Casi cualquier funcionalidad ("feature") está repartida en **3 o 4 sitios
fijos**. Si entiendes este patrón, encuentras todo:

1. ¿Es un **ajuste guardable**? → vive en una rebanada de `store/slices/` y su
   ficha en `types/wallpaper.ts`.
2. **Todo lo demás de ese subsistema** —los botones, el cálculo y el dibujo—
   vive en **una sola carpeta**: `features/<nombre>/`, con `controls/` para su
   pestaña, `domain/` para las reglas y `renderers/`+`runtime/` para el dibujo.
3. ¿Es el **compositor de la escena entera** (quién va encima de quién)? → eso
   sí es `components/wallpaper/`.

> **Ésta es la prueba de fuego del proyecto:** si alguien te pregunta "¿dónde
> viven las Letras?", la respuesta tiene que ser **una carpeta**
> (`src/features/lyrics/`), no una lista de seis sitios. Durante 2026 se
> movieron ~20.000 líneas justamente para que esa respuesta fuera corta.

> **Ejemplo mental:** la lluvia tiene (1) sus ajustes en una rebanada del store
> y (2) su carpeta `features/rain/` con la sección de la pestaña. El dibujante
> WebGL (`RainLayer.tsx`) todavía está en `components/wallpaper/` porque es una
> capa registrada del compositor — es la excepción, y está anotada como tal.

---

## 6. Glosario (lo que vas a leer una y otra vez)

Vuelve aquí cuando una palabra te frene:

- **Estado (state):** la foto de cómo están las cosas _ahora_. Vive en el store.
- **Store / almacén:** donde se guarda todo el estado. La única fuente de la
  verdad.
- **Slice / rebanada:** una sección del store dedicada a un tema (fondo, audio…).
- **Capa (layer):** cada cosa apilable que se dibuja (fondo, logo, espectro…).
- **Renderizar / render:** dibujar el estado en la pantalla.
- **Renderer / dibujante:** el código que dibuja un tipo de capa. Hay tres
  familias: DOM, Canvas 2D y WebGL.
- **Componente:** una pieza reutilizable de la interfaz o de la escena.
- **Hook:** un ayudante reutilizable de React (un "enchufe" que da una
  capacidad: "dame el audio", "guarda este dato"). Los vemos más adelante.
- **Provider / proveedor:** un servicio de fondo que está disponible para toda
  la app (idiomas, audio, diálogos).
- **Persistir:** guardar algo para que sobreviva al cerrar la página.
- **Rehidratar:** volver a cargar el estado guardado al abrir la app.
- **Migración:** convertir datos guardados de un formato viejo a uno nuevo.
- **Bins:** los números crudos del sonido que produce el "oído" (cuánta energía
  hay en cada franja de frecuencia). De ahí salen los graves, medios y agudos.
- **Bandas:** los bins agrupados en grupos útiles (grave / medio / agudo) que
  los efectos usan para reaccionar.
- **Adapter / adaptador de audio:** la pieza que abstrae **de dónde** viene el
  sonido (escritorio, micrófono o archivo), para que el resto no tenga que
  saberlo.
- **Setlist:** una lista curada de imágenes con nombre (decides qué wallpapers
  entran al pase de diapositivas).
- **Scene / escena guardable:** una "foto" de qué efectos están encendidos y
  cómo, que puedes guardar y recuperar de golpe.
- **Profile / slot:** un preset (ajuste predefinido) guardable _tuyo_ para un
  efecto concreto (logo, espectro, luces…).
- **Preset de fábrica:** ajustes predefinidos que vienen "de serie" con la app.
- **Lyrixa:** el sistema de letras de canciones. Las letras vienen de un
  paquete externo; aquí solo se importan, se estilizan y se dibujan.
- **Stage FX:** efectos de "concierto": luces y movimientos de cámara que
  envuelven toda la escena.
- **legacy / modern:** conviven dos generaciones de la interfaz del editor. La
  vieja ("legacy") y la nueva ("modern"). El kit `src/ui/` es la base de la
  nueva.
- **`STORE_PERSIST_VERSION` (= 150):** el número de versión del formato en que se
  guarda tu configuración. Cada vez que se cambia algo importante del formato,
  sube y se escribe una migración.

---

## 7. Reglas de oro al tocar este código

Estas no son opcionales: nacieron de errores reales o de decisiones tomadas.

1. **Una cosa a la vez.** Antes de cambiar algo, identifica **qué subsistema es
   el dueño**. No expandas el trabajo "ya que estoy aquí".
2. **Borrar/limpiar SIEMPRE pregunta antes.** Cualquier botón destructivo
   (limpiar, borrar, resetear) debe mostrar un "¿estás seguro?" y esperar
   confirmación. _Ya se perdieron 25 imágenes una vez por saltarse esto._
3. **No inventes ventanas a pantalla completa** que tapen el wallpaper. La idea
   es ver el resultado mientras lo configuras. Mejor paneles que se despliegan
   en el sitio.
4. **Lo que muestra el editor como "vista previa" debe verse EXACTO** a como
   saldrá de verdad (misma forma, mismas proporciones). Nada de aproximar.
5. **Cuidado al copiar el estado completo de golpe:** una función llamada
   `structuredClone` _revienta_ con este store por cómo está hecho. Hay una
   forma segura de hacerlo (lo verás si toca).

---

## 8. Resumen en una frase

> Todo tu estado (colores, imágenes, efectos) vive en **un almacén** (store).
> Un **traductor** (`layers.ts`) lo convierte en una **lista de capas**. Un
> **director** (`WallpaperViewport`) reparte cada capa a **uno de tres
> dibujantes** (página web normal, lienzo a mano, o tarjeta gráfica). El sonido
> entra por **un solo oído coordinador** sin importar de dónde venga. Y
> **editor** y **preview** son la misma obra montada de dos formas.

---

**Siguiente:** [`01-estado-y-store.md`](./01-estado-y-store.md) — abrimos el
almacén por dentro: las 12 rebanadas, la ficha técnica de ajustes, y el sistema
de migraciones que ya va por la versión 85.
