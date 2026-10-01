# Auditoría de congelación y traspaso a Lyrixa — 2026-09-30

Encargo del usuario: _"revisa el estado actual del proyecto ya que le metimos
nuevas features, como intro, ending, efectos de camera en motion; detecta
incongruencias y capas infinitas y bugs que se pueden producir para ir cerrando
esto (...) ya quiero congelar la aplicación, resolver los bugs y meter un nuevo
sistema comandado por Lyrixa (...) la idea es que Vibrix deje listos los slots
de cada cosa y en Lyrixa reutilizarlos en la línea temporal de una canción"_.

Cada hallazgo de abajo se **verificó ejecutándolo**, no leyéndolo, y dice si ya
se arregló en este mismo pase o si queda pendiente y por qué. Los hallazgos que
resultaron ser falsos también están, marcados como tales: un catálogo de bugs
que no se corrige a sí mismo no sirve para congelar nada.

## 1. Base medida

| Medida                                                 | Valor al cerrar este pase                                 |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `APP_VERSION`                                          | `0.7.0-alpha`                                             |
| `STORE_PERSIST_VERSION`                                | **143**                                                   |
| Tests                                                  | 144 ficheros / 1603 tests, verdes                         |
| `lint`                                                 | 0 errores, 12 warnings (todos `react-refresh`, preexist.) |
| `architecture:check`                                   | 3172 imports, 5 deudas congeladas, 0 ciclos               |
| `structure` / `docs` / `i18n` / `test:types` / `build` | verdes                                                    |
| Bundle principal                                       | 2 564 kB (629 kB gzip) — avisa por encima de 800 kB       |

El bundle es el único número incómodo, y es conocido: `three-core` son otros
724 kB aparte. No es un bug; es el trabajo de code-splitting que el plan maestro
tiene en su fase de rendimiento.

## 2. Bugs

| #   | Hallazgo                                           | Veredicto                          | Estado                   |
| --- | -------------------------------------------------- | ---------------------------------- | ------------------------ |
| B1  | La intro se dibuja casi al fondo del MP4           | Bug crítico                        | **Corregido** `e1aafebf` |
| B2  | Camera FX guarda la capa activa rancia             | Bug                                | **Corregido** `e1aafebf` |
| B3  | La intro del setlist nunca se restauraba           | Bug                                | **Corregido** `e1aafebf` |
| B4  | El montaje recortaba por el centro con foco puesto | Bug, causa distinta a la anunciada | **Corregido** `e1aafebf` |
| B5  | «Doc contra código» en escenas                     | **No es un bug**                   | Reclasificado (§2.5)     |
| B6  | La intro rehacía su reparto en cada rAF            | Bug de rendimiento                 | **Corregido** `4fce8b56` |
| B7  | `motion` es un id de subsistema muerto             | Deuda inocua                       | **Pendiente** (§2.7)     |

### 2.1 · B1 — la intro se dibujaba casi al fondo del vídeo exportado

Ejecuté `resolveSubsystemDrawOrder` con el estado por defecto. El orden real del
MP4 era:

```
globalBackground → background → motion → overlays → introSequence →
stageLights → particles → rain → particlesForeground → spectrum →
spectrum2 → logo → trackTitle → lyrics → flashLight → hud
```

`introSequence` en la **cuarta** posición. En vivo la ventana va en z 95, por
encima de todo menos del HUD; en el export no es una capa de escena, así que no
estaba ni en `FIXED_Z` ni en el mapa de z de
[frameComposition.ts](../../src/features/export/frameComposition.ts) y caía al
`?? 0`. El spectrum, el logo, el track title, las letras y el flash se pintaban
**encima de una cortina que debe ser opaca**: la feature nueva, entera, no
existía en el archivo.

Arreglo: una constante compartida,
[`INTRO_LAYER_Z_INDEX`](../../src/features/intro/introPlan.ts) (95), que leen
tanto `WallpaperViewport` como `FIXED_Z`, de modo que ya **no pueden divergir**.
Test de regresión en `frameComposition.test.ts`.

### 2.2 · B2 — Camera FX guardaba una instantánea vieja de la capa activa

Las capas de movimiento comparten con las de efectos una regla no obvia: **los
valores vivos de la capa activa son las claves planas** (`cameraMotion*`), y su
entrada en `motionLayers` es una instantánea que sólo se refresca al cambiar de
capa. Looks ya lo resolvía llamando `syncActiveEffectLayer` al extraer el
perfil; `extractCameraFxProfileSettings` copiaba el array tal cual.

Lo reproduje: con la capa 2 activa y Amount a 99, el slot guardaba
`flat = 99` pero `motionLayers[1].settings.cameraMotionAmount = 1`. Afectaba a
slots de Camera FX, capturas de escena, composición global, export de proyecto
y `cameraFxOverride` por imagen — es decir, a todo lo que Lyrixa va a querer
reutilizar como pista.

Arreglo: la simetría que faltaba, en
[featureProfiles.ts:966](../../src/store/featureProfiles.ts). Los dos tests de
`cameraFxProfileIntegrity.test.ts` se comprobaron **fallando** sin el fix.

### 2.3 · B3 — la intro ligada a un setlist se comía la del proyecto

Esto es exactamente lo que reportaste. Un setlist es una curación, no una
edición destructiva — desactivarlo devuelve el pool entero — y su intro no
obedecía esa regla. Cuatro síntomas de la misma causa:

1. desactivar el setlist devolvía sólo `{ activeSetlistId: null }`, así que la
   intro del show se quedaba **de global, para siempre**;
2. pasar a un setlist sin binding conservaba la del anterior;
3. `bindSetlistIntroSlot` sólo guardaba el id: apuntar una intro al setlist
   activo **no hacía nada visible** hasta desactivar y reactivar, lo que hacía
   parecer muerto al control (y el selector sólo aparece para el setlist
   activo, así que ese es el caso normal, no el raro);
4. borrar el setlist activo dejaba su intro instalada.

Arreglo: las ventanas del proyecto se **aparcan** en `setlistIntroFallback`
(store **v143** + migración que siembra `null`) mientras un setlist ligado
manda, y vuelven al salir de él por cualquiera de las cuatro puertas. El
aparcado ocurre **una sola vez**, así que encadenar setlists ligados no pisa lo
global con lo del primero. Los cuatro puntos de entrada pasan ahora por un
único helper, `resolveSetlistIntroWindows`
([setlistsSlice.ts:49](../../src/store/slices/setlistsSlice.ts)). 6 tests
nuevos, uno por síntoma más el encadenado.

### 2.4 · B4 — el montaje recortaba por el centro imágenes que sí tenían foco

**Mi diagnóstico inicial estaba mal y lo corrijo aquí.** Anuncié que
`resolveIntroFocusMap` "ignora `focusX/focusY`" como si fuera un olvido. No lo
es: `types/wallpaper.ts` documenta que `faceFocusX/Y` es la anotación de
recorte y que el encuadre del usuario "se queda sin tocar". Ese reparto de
papeles está bien.

El hueco real es otro y sigue siendo un bug: la intro arma su pool desde el
setlist **sin preguntar**, así que en un proyecto donde nadie recorrió el panel
de Puntos imagen por imagen, ninguna carta tiene cara medida y **todas** se
recortan por el centro — el recorte que el punto existe para evitar — mientras
el foco de encuadre que el usuario sí colocó a mano, en ese mismo panel, se
queda sin leer. La cadena ahora es **cara → encuadre → centro**
([introColors.ts:175](../../src/features/intro/introColors.ts)), 4 tests.

Queda fuera, como mejora de UI y no como bug: marcar en el picker qué imágenes
no tienen punto de cara.

### 2.5 · B5 — no es un bug

Anuncié que [sceneSlot.ts](../../src/features/scenes/sceneSlot.ts) promete "no
scene → base visual state + legacy per-image overrides" y que
`buildActiveImageSelectionPatch` no restauraba nada. Al leerlo entero: el tipo
describe **exactamente** ese comportamiento, y
[activeImageSelection.ts:124](../../src/store/activeImageSelection.ts) devuelve
un parche _sobre el estado actual_ a propósito.

No es una divergencia doc↔código. Es la **dependencia de camino**, que está
diseñada así — y que es justo el bloqueo de Lyrixa (§4). No se toca hasta ese
refactor.

### 2.6 · B6 — la intro rehacía su reparto sesenta veces por segundo

El bucle de [IntroLayer.tsx](../../src/features/intro/IntroLayer.tsx) rehacía el
pool, volvía a elegir los ids, hacía un `find` lineal por carta y otro dentro de
`resolveIntroFocusMap` en **cada rAF**, justo en los segundos más caros del
render. Ninguna de las cuatro entradas puede cambiar dentro de una ventana.
Memorizado por identidad; por cuadro sólo se busca la imagen ya decodificada,
que es lo único que va llegando mientras el montaje ya se reproduce.

### 2.7 · B7 — `motion` es un id de subsistema muerto (pendiente)

`'motion'` está en la unión `RenderSubsystemId` y en `RENDER_SUBSYSTEM_ORDER`
([renderFrameContext.ts](../../src/features/export/renderFrameContext.ts)) pero
**nunca** se registra en `installDefaultRenderSubsystems`: los ids realmente
registrados son `globalBackground, background, stageLights, particles,
particlesForeground, rain, spectrum, spectrum2, logo, trackTitle, lyrics,
overlays, flashLight, introSequence, hud`.

Es inocuo — un hueco en el orden que nadie dibuja — pero contamina el orden de
capas que Lyrixa va a leer. Borrarlo es una línea y no se hizo aquí para no
mezclar dominios en el mismo pase.

## 3. «Capas infinitas»: no hay ningún contador suelto, hay 9 autoridades apiladas

Todos los topes existen y se comprobaron: movimiento 6, efectos 6, spectrum 2,
escenas 40, setlists 100, slots 60–120. **No hay nada infinito.**

La incongruencia real no es de cantidad, es de **autoridad**: cuántos sistemas
distintos pueden decidir el mismo píxel. Hoy, en orden de aplicación:

1. estado plano (las claves vivas)
2. overrides legacy por imagen
3. escena por imagen (`sceneSlotId`)
4. `defaultSceneSlotId`
5. composición global (`globalCompositionOverride`, que **veta** 3 y 4)
6. binding de intro por setlist
7. AI Director
8. `effectLayers` (la de arriba gana)
9. `motionLayers`

Más `introPresets`, que es una décima por fuera. Dos de ellas — 8 y 9 —
comparten la trampa de «el valor vivo no está en el array», y hasta este pase
sólo una la resolvía al guardar: **eso era B2**. Ese es el hallazgo estructural
del informe, y es también el argumento más fuerte para congelar: cada autoridad
nueva multiplica las combinaciones que hay que probar.

## 4. Qué significa esto para el sistema comandado por Lyrixa

Leído: `Lyrixa/docs/03-vibrix-composition-sequencer.md`. Su regla central es
_el estado visual en T es función únicamente del score y de T_.

**Vibrix hoy es lo contrario, y a propósito.** `buildActiveImageSelectionPatch`
devuelve un parche sobre el estado actual y lee `state.logoEnabled` /
`spectrumEnabled` para preservarlos; `buildSceneSlotActivationPatch` usa
`patch.spectrumInstances ?? state.spectrumInstances`, donde `null` significa
literalmente «no tocar»; y
[slideshowSegments.ts](../../src/features/export/video/slideshowSegments.ts) lo
dice en su propio comentario de cabecera: _"chained in the same order"_.

Consecuencia medible: reproducir 0→1:42 y **saltar** a 1:42 dan frames
distintos. Eso rompe seek, loop y render por tramos — los tres pilares de una
línea temporal.

### Lo que sí está listo

- `SceneSlot` ya es el agregado por referencias que el doc pide en su §2.
- Todos los slots tienen `id` estable desde v104 (nunca por índice).
- El export ya comparte lógica **pura** con el preview (`renderFrameAt`,
  `frameComposition`), y B1 cerró la última divergencia conocida entre ambos.
- Ya hay transporte HTTP de bundles (`loadLyricsBundleFromUrl`) y `backend/server/`.

### Lo que falta, y que el doc de Lyrixa no dimensiona

- **No existe `slotRevision`.** Verificado: 0 ocurrencias en `src/`. Los
  `ProfileSlot` no tienen hash de contenido, así que Lyrixa no puede detectar
  que un slot cambió bajo sus pies.
- **No hay manifiesto ni endpoint** que publique los slots disponibles.
- **Dos familias que Lyrixa quiere como pistas no están en `SceneSlot`**:
  `background` (existe `backgroundProfileSlots`, pero ninguna escena lo
  referencia — verificado: 0 menciones en `features/scenes/`) y `motion` (vive
  dentro de `cameraFx`, no como pista propia).
- **La intro tampoco es un slot de escena**; es su propio módulo con su propio
  banco (`introProfileSlots`).
- Si se quiere la Fase 4 del plan de renovación —disparar una animación a mitad
  del tema— la onda del intro es **sintética y determinista a propósito**
  ([introSpectrum.ts](../../src/features/intro/introSpectrum.ts)), así que
  mid-song no sirve tal cual: habría que darle una fuente de audio real.

## 5. Recomendación: congelar, pero después del Bloque 0

### Bloque 0 — antes de congelar · **HECHO**

B1, B2, B3, B4 y B6. No eran features, era «terminar lo empezado»: sin B1 la
intro no existe en el MP4, y sin B3 el control que el usuario tiene delante
parece roto. Entraron en `e1aafebf` y `4fce8b56`, cada uno con tests de
regresión, y los de B2 se comprobaron fallando sin el fix.

Se hizo además, por petición explícita, la **limpieza de la pestaña Export**
(`93486e2e`): fuera el grabador en vivo `getDisplayMedia` + `MediaRecorder`
entero, no determinista y a los FPS de la máquina, más 18 claves de i18n, el
harness `#/dev/recording-smoke` y dos diagnósticos muertos del planificador. El
exportador offline es ya el único camino a archivo.

### Bloque 1 — congelar aquí

Falta **una sola cosa**, y no la puede firmar un agente: **probar el export de
vídeo de punta a punta con un tema completo**. El pipeline está implementado y
cubierto por unidad, pero ningún render largo está firmado. Está anotado como
tal en `CURRENT_SYSTEM_STATUS.md` §Known limitations.

Hecho también en este pase: el status doc **no tenía ni una sección de
Intro/Ending** pese a ser 24 de los últimos 25 commits — sólo aparecía en la
tabla de migraciones, y `docs:check` no lo detecta porque sólo valida versiones
y rutas. Ahora existe, con el z-index compartido, la cadena de foco y la regla
del aparcado v143.

### Bloque 2 — primer corte de Lyrixa

- **Fase A (manifiesto + `slotRevision`)** es barata y se puede hacer ya:
  añadir hash de contenido a los slots y un endpoint que los publique.
- **Fase C es el trabajo real**, y el doc de Lyrixa no lo menciona:
  `resolveCompositionAtTime` exige convertir el modelo de parches encadenados en
  resolución **stateless** — una `resolveVisualStateAt(base, score, T)` que
  siempre parta de una base conocida y aplique cues por prioridad, en vez de
  `{...state, ...patch}`. Es cirugía en `activeImageSelection` + `sceneSlot`.

Y ésa es la razón de fondo para congelar ahora: **no conviene que ese refactor
arrastre además features a medio hacer.**

### Lo que NO haría antes de congelar

Las fases 1, 2 y 3 de `../plans/PLAN_RENOVACION_2026-09.md` (buscador del pool,
más divisiones, más animaciones, modos de color). Son ampliación, y el sistema
de Lyrixa va a mover **dónde vive** esa configuración.

## 6. Pendientes concretos que deja este informe

| Pendiente                                                                                                                 | Tamaño                     |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| QA del export offline con un tema completo (**bloquea congelar**)                                                         | manual                     |
| Fricciones de UI que salgan probando → lista viva en [`.agents/TAREA_CONGELACION.md`](../../.agents/TAREA_CONGELACION.md) | —                          |
| Ver la intro/ending sin mover el tiempo del tema (F1)                                                                     | mediano                    |
| Flechas anterior/siguiente en los selectores de slot (F2)                                                                 | pequeño                    |
| Borrar el id muerto `motion` de `RenderSubsystemId` + el orden                                                            | 1 línea                    |
| Marcar en el picker las imágenes sin punto de cara                                                                        | pequeño                    |
| Code-splitting del bundle de 2 564 kB                                                                                     | fase perf del plan maestro |
| Lyrixa Fase A: `slotRevision` + manifiesto                                                                                | mediano                    |
| Lyrixa Fase C: `resolveVisualStateAt(base, score, T)`                                                                     | grande                     |
| Pistas que faltan como slot de escena: `background`, `motion`                                                             | mediano                    |
