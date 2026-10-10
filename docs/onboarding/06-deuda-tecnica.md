# Nivel 06 — El mapa de la deuda técnica (honesto y accionable)

> Requisitos: toda la serie, especialmente [01](./01-estado-y-store.md)
> (store/migraciones) y [02](./02-pipeline-render.md) (rendimiento).
>
> **Qué es "deuda técnica":** decisiones que en su día aceleraron el trabajo
> pero que hoy cobran "intereses": cada cambio cuesta un poco más por su
> culpa. Como una hipoteca: no es malo tenerla, es malo no saber cuánta hay
> ni dónde. Este documento es el extracto bancario.
>
> Importante: aquí no hay culpas. Casi toda esta deuda fue **el precio
> correcto de avanzar rápido**. Lo que no se perdona es ignorarla.

---

## 0. El resumen para impacientes

Por orden de riesgo real, no de fealdad:

| #   | Deuda                                                                 | Riesgo que pagas                                                         |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **Cero tests automatizados**                                          | Cada refactor es a pulmón; las regresiones se descubren a ojo            |
| 2   | **El monolito del estado** (migrador de 3.518 líneas, tipos de 1.685) | Añadir un ajuste toca 5 archivos; equivocarse rompe la carga de usuarios |
| 3   | **La verdad duplicada del fondo (BG)**                                | Claves espejo que hay que sincronizar a mano; fuente clásica de bugs     |
| 4   | **Coste de render arquitectónico** (N lienzos full-screen)            | El techo de rendimiento no se arregla optimizando funciones              |
| 5   | **Archivos gigantes de UI**                                           | Cuesta encontrar y revisar; invita al copy-paste                         |
| 6   | **Pendientes registrados** (useShallow, Rain V2, stubs de export)     | Trabajo conocido sin terminar que confunde si no se conoce               |

Y la regla de operación vigente (directiva de consolidación): **no se paga
deuda "de pasada"**. Un feature a la vez, identifica el subsistema dueño, sin
expandir el scope.

---

## 1. Deuda nº 1: no hay tests (y qué hay en su lugar)

Los números, verificados hoy: **0 archivos de test** en `src/`, sin
configuración de vitest/jest. Las únicas redes de seguridad automáticas son:

- `npm run build` → el **compilador de TypeScript** (`tsc -b`): garantiza
  que los tipos cuadran. Es una red real — la "ficha técnica" del Nivel 01
  atrapa muchísimos errores — pero solo errores de _forma_, no de
  _comportamiento_.
- `npm run lint` / `format:check` → estilo y errores comunes.

> **Analogía:** tenemos un corrector ortográfico excelente, pero **nadie que
> lea el ensayo**. "El logo late al doble de velocidad de la que debería" es
> gramaticalmente perfecto.

**Dónde dolería menos empezar** (si algún día se ataca): las piezas puras y
sin pantalla, que son justamente las más críticas:

1. `wallpaperStoreMigrations.ts` — "dado un estado guardado v60, ¿sale un
   estado v85 válido?" Es la función con más usuarios afectados si falla.
2. `utils/audioEnvelope.ts`, `lib/audio/audioChannels.ts` — matemática pura,
   entradas y salidas claras.
3. `features/scenes/sceneSlot.ts`, `store/featureProfiles.ts` — los
   normalizadores de referencias y perfiles.

Nada de eso necesita navegador ni GPU: son funciones de "números entran,
números salen". El coste de arrancar es bajo; lo caro es seguir sin nada.

---

## 2. Deuda nº 2: el monolito del estado

Síntomas medibles (cuenta de líneas real):

| Archivo                             | Líneas | Qué es                                                                               |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `lib/canonicalFactoryPresets.ts`    | 6.244  | Los presets de fábrica "canónicos" (generados/importados con `pnpm defaults:import`) |
| `store/wallpaperStoreMigrations.ts` | 3.518  | El normalizador universal del Nivel 01                                               |
| `types/wallpaper.ts`                | 1.685  | La ficha técnica de TODO el estado                                                   |
| `store/wallpaperStoreTypes.ts`      | 1.087  | Las firmas de TODAS las acciones                                                     |
| `store/featureProfiles.ts`          | 1.006  | Extractores/hidratadores de todos los perfiles                                       |
| `store/defaultState.ts`             | 815    | Los valores de fábrica                                                               |

Los problemas concretos, no estéticos:

- **El migrador no versiona:** es UNA función que normaliza todo siempre
  (Nivel 01, sección 5). Funciona, pero crece sin límite (167 rellenos
  `?? DEFAULT_STATE` y subiendo) y no se puede razonar "qué cambió entre v83
  y v84" leyéndola. Cada feature nueva la engorda.
- **El checklist de 5+ archivos por ajuste** (Nivel 01, sección 7) es fácil
  de fallar en el paso 4 (migración): a ti te funciona, al resto le llega
  `undefined`.
- **El clon del spectrum añadió 212 claves espejo** (`spectrumClone*`,
  Nivel 04): la decisión evitó duplicar el motor (bien), pero pagó con
  superficie de estado (cada feature nueva del spectrum son DOS juegos de
  claves).
- **Los presets canónicos** (5.136 líneas) están acoplados a los nombres de
  claves del estado: renombrar un ajuste implica regenerarlos.

**Mitigaciones que ya existen** (no partir de cero): el estado plano con
prefijos ES navegable; las slices ya parten las acciones por dueño;
`config/ranges.ts` centraliza rangos; `spectrumProfileHydrate` y los
hidratadores de perfiles amortiguan datos viejos.

---

## 3. Deuda nº 3: la verdad duplicada del fondo (BG)

La describimos en el Nivel 01 (sección 6.2) y es la duplicación más
importante del proyecto: **la configuración de la imagen activa vive dos
veces** — en su ficha dentro de `backgroundImages[]` y en las claves planas
espejo (`imageScale`, `imagePositionX`, `imageOpacity`, …, unas 20).

- Cada cambio de imagen activa requiere copiar ficha → claves planas; cada
  edición, claves planas → ficha. Esa sincronización es manual y está
  repartida (slice de fondo, `backgroundCollectionActions`,
  `useRestoreWallpaperAssets`, el migrador).
- El síntoma típico de bug: "cambié de imagen y conservó el zoom de la
  anterior" / "el slider muestra un valor pero la ficha guarda otro".
- Por qué existe: las claves planas dan lecturas baratas a sliders y
  renderers, y son anteriores al pool múltiple. Es deuda de evolución, no de
  descuido.

La salida limpia conocida (cuando toque, y solo como proyecto propio, no de
pasada): que la imagen activa se _derive_ de la ficha (una sola verdad) y
las claves planas desaparezcan tras una migración. Es cirugía mayor: toca
slice, persistencia, migrador y todos los lectores.

---

## 4. Deuda nº 4: el techo de rendimiento es arquitectónico

Diagnóstico cerrado en el audit de rendimiento del spectrum (y explicado en
el Nivel 02, sección 6): cuando va lento a pantalla completa, **no hay un
bug que cazar** — el coste es estructural:

- **Un lienzo full-screen por capa de audio** encendida, repintado entero
  cada cuadro.
- **`shadowBlur`** (el difuminado de Canvas 2D) es desproporcionadamente
  caro y el look del proyecto lo usa generosamente.
- Más píxeles (4K, fullscreen) = proporcionalmente más lento. No es lineal
  con "lo optimizado que esté el código".

Lo que YA se hizo (para no rediagnosticar): capas apagadas no calculan nada;
caps de FPS 30/45/60 por `performanceMode` en los tres dibujantes; calidad
degradada honesta en perf-low (blur reducido de verdad, no sliders mentirosos);
early-outs en StageLights; el clon recortado a su anillo.

Lo que costaría de verdad (decisiones, no parches): componer capas de audio
en UN solo lienzo (pierdes flexibilidad de blend/z-index), sustituir
shadowBlur por glow pre-rendrizado (cambia el look), o mover el composite a
WebGL (proyecto grande). **Ninguna es "de pasada".**

---

## 5. Deuda nº 5: los archivos gigantes de UI

El top de la zona de interfaz (líneas reales):

| Archivo                                                  | Líneas | Nota                                       |
| -------------------------------------------------------- | ------ | ------------------------------------------ |
| `components/controls/tabs/main/TrackTitleTab.tsx`        | 1.459  | La pestaña del widget Now Playing          |
| `components/controls/ControlPanel.tsx`                   | 1.356  | El shell del editor entero                 |
| `components/wallpaper/quickActions/…ViewModel.tsx`       | 1.336  | El "cerebro" del panel de acciones rápidas |
| `features/lyrics/controls/LyricsTabBody.tsx`             | 1.231  | La pestaña de letras                       |
| `features/particles/controls/ParticlesAppearanceSection` | 1.077  | Apariencia de partículas                   |
| `components/wallpaper/ParticleField.tsx`                 | 975    | El dibujante GPU de partículas             |
| `components/controls/tabs/main/SceneTab.tsx`             | 970    | La pestaña de escenas                      |
| `components/wallpaper/quickActions/…Configs.tsx`         | 962    | Configuración de acciones rápidas          |

(La vieja `SpectrumCloneSection.tsx` — 1.125 líneas — ya no está en esta
lista: desapareció cuando el clon se convirtió en instancias de spectrum.)

No es deuda crítica (no rompe a usuarios), pero sí fricción diaria: revisar
un cambio de 30 líneas dentro de un archivo de 1.200 cuesta; y los archivos
grandes invitan a duplicar secciones en vez de extraer componentes. La
medicina ya existe y está probada: el patrón de las pestañas modernas
(EditorTabLayout + secciones extraídas + FeatureGate) y el desglose que ya se
hizo con la BG view (4 sub-tabs, secciones colapsables).

Relacionado y registrado: **la migración a `useShallow` quedó a medias** —
`ControlPanel` y `MediaDock` la tienen; ~18 pestañas siguen con selectores
que devuelven objetos nuevos (redibujados de más al mover cualquier slider).
Es trabajo mecánico, por pestaña, perfecto para hacer feature a feature
cuando se toque cada una.

---

## 6. Pendientes conocidos y fósiles (para no redescubrirlos)

Trabajo a medias **a propósito**, registrado para que no te sorprenda:

- **Rain V2:** la lluvia actual está congelada; el plan escrito (TODO en
  `RainLayer.tsx` y `RainSection.tsx` — por cierto, los únicos 2 TODOs de
  todo `src/`) es fusionarla en el emisor de partículas. No añadir features
  a la lluvia V1.
- **Export offline incompleto:** los render subsystems de audio están;
  varios siguen siendo stubs (`renderSubsystems/stubs.ts`). El export
  offline aún no reproduce todas las capas.
- **Oscilloscope radial sin mirror:** el fold radial cubre las familias de
  bins; el oscilloscope radial quedó fuera (y liquid "rígido" no aplica por
  diseño).
- **Fósiles de nombre:** `CircularSpectrum.ts` dibuja todo, no solo lo
  circular; la carpeta `tabs/main/` ya no tiene contraparte "legacy" (el
  flag `editorUiVariant` se eliminó); "imageDb" también guarda audio. Renombrar
  sería bonito pero es churn — saberlo basta.
- **Docs históricas desactualizadas:** `docs/ARQUITECTURA_GENERAL.md` y
  compañía (ver README de esta serie). En conflicto, gana esta serie.

---

## 7. Riesgos al tocar: la lista de "no te dispares en el pie"

Las cinco formas más probables de romper algo, todas con cicatriz histórica:

1. **Añadir un ajuste persistido sin migración ni subir
   `STORE_PERSIST_VERSION`** → a otros usuarios les llega `undefined`.
   Checklist completo en Nivel 01, sección 7.
2. **`structuredClone` sobre el estado** → revienta (funciones dentro).
   Copias superficiales; mira cómo lo hace el export de proyecto.
3. **Persistir blob URLs** → tickets caducados; solo se persisten
   `assetId`s (Nivel 01, sección 4.2).
4. **Botón destructivo sin confirmación** → ya costó 25 imágenes una vez.
   Todo `variant=destructive` espera el confirm del diálogo. Sin
   excepciones.
5. **Previews que aproximan** → la preview debe usar la geometría real del
   render (mismas mates que el renderer). Y **nada de modales fullscreen**
   que tapen el wallpaper.

Y la meta-regla: antes de tocar, identifica el **subsistema dueño** (para
eso existe esta serie) y no expandas el scope.

---

## 8. Cómo se paga esta deuda (estrategia, no heroísmo)

La forma realista, alineada con cómo ya trabaja el proyecto:

1. **Por oportunidad, no por cruzada:** cuando un feature te lleve a una
   pestaña sin `useShallow`, migra ESA pestaña. Cuando toques una sección de
   un archivo gigante, extráela. Nunca "semana de refactor global".
2. **Tests donde duele primero:** migraciones y matemática de audio (sección
   1). Un puñado de tests ahí protege a todos los usuarios con estado
   guardado.
3. **Las cirugías mayores (BG única verdad, composite de lienzos) son
   proyectos con nombre propio**, con su doc de plan en `docs/plans/`, no
   tareas de viernes.
4. **Documentar decisiones al cerrarlas** (como hasta ahora: `docs/status/`,
   CHANGELOG): la deuda más cara es la que hay que redescubrir.

---

## 9. Resumen en una frase

> La deuda real, por orden: **el estado es un monolito** (migrador-normalizador
> de 3.518 líneas y checklist de 5 archivos por ajuste), **el fondo tiene la
> verdad duplicada** (ficha + claves espejo sincronizadas a mano), **el techo de
> rendimiento es arquitectónico** (N lienzos full-screen + shadowBlur) y **hay
> UI gigante con useShallow a medias**. Todo está localizado, casi todo tiene
> plan, y la regla de pago es: por oportunidad, feature a feature, sin expandir
> el scope — y las cirugías mayores, con nombre y plan propio.

> **Corregido (2026-09-05):** este resumen empezaba diciendo "no hay tests".
> Eso dejó de ser cierto: hay **984 tests en 77 archivos**, con fixtures de
> migración que prueban cada versión persistida. También decía que la
> dirección de dependencias era un problema; hoy son **5 aristas de deuda
> sobre 2.474 imports, con 0 ciclos**, y `pnpm architecture:check` lo verifica
> en cada commit. Y esas 5 son _declaraciones de tipo_, que TypeScript borra al
> compilar: **en el programa que corre no queda ninguna**. Un documento de
> deuda que no se actualiza se convierte él mismo en deuda.

---

**Fin de la serie.** Si llegaste aquí desde cero: ya sabes más del código de
este proyecto que la mayoría de la gente que abre un repo ajeno después de
meses. Vuelve al [README](./README.md) cuando necesites el índice, y al
glosario de cada nivel cuando una palabra se te escape.
