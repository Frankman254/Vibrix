# Auditoría de sistemas antiguos — 2026-09-25

Encargo del usuario: _"audita los demás sistemas que no se han tocado en mucho
tiempo"_. Se midió la fecha del último commit de cada carpeta/archivo y se leyó
en su totalidad lo más viejo. Esto es un informe: cada hallazgo dice si ya se
arregló en este mismo pase o si queda pendiente y por qué.

## 1. Qué es "antiguo" aquí

| Área                          | Último commit | Estado del repaso |
| ----------------------------- | ------------- | ----------------- |
| `src/lib/randomize.ts`        | 2026-06-07    | leído completo    |
| `src/features/layout/`        | 2026-06-16    | leído completo    |
| `src/features/recording/`     | 2026-06-19    | leído completo    |
| `src/lib/audio/`              | 2026-07-26    | repaso selectivo  |
| `src/lib/projectHealth.ts`    | 2026-07-26    | leído completo    |
| `src/features/discovery/`     | 2026-09-05    | leído completo    |
| `src/features/flashEdge/`     | 2026-09-05    | grafo verificado  |
| `src/lib/canvas/imageEffects` | 2026-09-05    | repaso selectivo  |

Lección de la auditoría de código muerto de 2026-09 aplicada aquí: **se audita
por grafo de imports, no por nombre**. Todo lo que abajo se llama "muerto" se
comprobó con un `grep` de consumidores reales.

## 2. Hallazgos

### A1 — `randomHarmonyColor()` mentía y no la usaba nadie · **ARREGLADO**

`src/lib/randomize.ts` tenía dos funciones con **el cuerpo idéntico**:
`randomVividColor()` y `randomHarmonyColor()`. La segunda documentaba "un
segundo color armónicamente desplazado respecto a `baseHue`" pero no recibía
ningún `baseHue` ni lo usaba. Consumidores: **ninguno** (el randomizador de
partículas llama dos veces a `randomVividColor`).

Decisión: se borra. Una función de dos líneas que promete armonía y devuelve
azar es peor que no tenerla; el día que se quiera armonía real se escribe con su
argumento y su test.

### A2 — `resolveResponsiveEditorLayout()` es código muerto · **ARREGLADO**

En `src/features/layout/responsiveLayout.ts`. Devolvía `{ editorScale }` y
`editorScale` no aparece en ningún otro archivo del repo: el escalado del editor
se resolvió por otra vía y esta función quedó huérfana. Borrada.

El resto del módulo está sano: los cinco `resolveResponsive*` vivos se usan en
`overlayLayerRegistry`, `OverlayInteractionStage` y `useQuickActionsLayout`, y
las instancias de Spectrum re-ejecutan el pase responsive con sus propios
valores (verificado en `overlayLayerRegistry.ts`, no hay doble escalado).

### A3 — El informe de salud no revisaba tres referencias por imagen · **ARREGLADO**

`createProjectHealthReport` avisaba de slots vacíos para las escenas (nueve
comprobaciones) y para la imagen sólo de `logoProfileSlotId` y
`spectrumProfileSlotId`. Las imágenes también apuntan a
`particlesProfileSlotId`, `rainProfileSlotId` y `looksProfileSlotId`: si el slot
se vaciaba, la imagen quedaba apuntando al vacío **en silencio**. Añadidas las
tres comprobaciones con su test.

`transitionPresetId` (Fase E3) se deja **fuera a propósito**: es sólo una
etiqueta, los cinco valores viven en la imagen, así que un preset borrado nunca
rompe nada y avisar sería ruido.

### A4 — El aviso de carga pesada no ve el Spectrum 2 · **ARREGLADO**

`getVisualWorkloadHint` (`src/features/discovery/workloadHint.ts`) leía sólo el
estado plano, que es el Spectrum 1. Desde el refactor de instancias, un proyecto
con S1 oculto y una instancia en familia `tunnel` con estelas al 0.9 devolvía
`'none'`: el banner no aparecía justo cuando más hacía falta. Ahora también
recorre `spectrumInstances` y, además, considera pesado tener **dos o más
instancias activas**, que es el coste real que midió la auditoría de rendimiento
del Spectrum (N canvas a pantalla completa, no el blur).

### A5 — Mensajes de diagnóstico en inglés y plural roto · **PENDIENTE**

`projectHealth.ts` construye 20 mensajes en inglés a pelo
(`'Active scene slot id does not exist.'`) y los conjuga en singular con N
(`` `${n} stored background asset reference is not present` ``). Es la deuda ya
anotada para `projectHealth.ts` / `offlineExportPlanner.ts`: son módulos `lib`
puros y no pueden importar `i18n` sin romper el contrato de zonas.

Salida propuesta (no hecha aquí para no mezclar dominios): que el módulo emita
sólo `code` + datos (`{ code, severity, count?, name? }`) y que la traducción
viva en la capa de presentación, que ya tiene `useT()`. Es un cambio de forma
del tipo `ProjectHealthIssue` y toca a todos sus consumidores.

### A6 — Etiquetas de formato de grabación sin traducir · **PENDIENTE (menor)**

`recordingMimeSupport.ts` devuelve `label: 'Browser Default'`, `'MP4 (H.264)'`,
`'WebM (VP9)'`… Los códecs son nombres propios y se quedan, pero
`'Browser Default'` es texto de interfaz y debería salir de `i18n`. Mismo patrón
que A5: el módulo devuelve un `id` y la UI decide el texto.

### A7 — `selectNextTrack()` no tiene tests · **PENDIENTE**

Es la función más "de producto" de `src/lib/audio` (modos `energy-match` y
`contrast`, bonus de BPM con medio/doble tiempo, pesos 1.0/0.2/0.3/0.15) y es
pura, así que es trivial de cubrir; su carpeta tiene tests para el analizador y
el mezclador, pero no para ella. Además su docstring no menciona el modo
`manual`, que cae a secuencial, y `excludeIds` se ignora en secuencial (correcto,
pero no dicho).

### A8 — Recordatorio abierto: `spectrumSecondOverride`

No es de esta auditoría pero sigue vivo: la migración v103 borra el campo en
cada carga, mientras el §10.2 del plan de pulido quiere cerrar la asimetría
entre S1 y S2. Decidir una de las dos cosas y quitar la otra.

## 3. Lo que se revisó y está sano

- **`flashEdge`** — vivo y cableado por los dos caminos: `FlashEdgeSection` en
  `BackgroundTab` y `LogoTab`, `drawBgFlashEdge` en `imageCanvasRuntime`,
  `drawLogoFlashEdge` en `overlayLayerRegistry`, y su propio subsistema en la
  exportación. Nada que borrar.
- **`viewportMetrics.ts`** — el `requestAnimationFrame` de retardo tras `resize`
  y el uso de `visualViewport` siguen siendo correctos para el caso de mover la
  ventana entre monitores con distinto DPI.
- **Honestidad de la exportación** — `getRenderStateSnapshot` fuerza
  `performanceMode: 'high'`, y el único sitio que lee el modo **vivo** a
  propósito (`readLiveParticleDpr` en `renderSubsystems/sceneGl.ts`) lo hace y lo
  documenta para que el tamaño de las partículas coincida con el preview. No hay
  degradación oculta en el vídeo.
- **`recording/`** — `getSupportedRecordingFormats` filtra con
  `MediaRecorder.isTypeSupported` y prefiere VP9; la petición de captura de
  pantalla ya usa los hints correctos (`preferCurrentTab`,
  `monitorTypeSurfaces: 'exclude'`).

## 4. Qué haría después, por orden

1. A5 (mensajes por `code` + i18n en la presentación) — es el único hallazgo que
   el usuario vería como "la app me habla en inglés".
2. A7 (tests de `selectNextTrack`) — barato y protege lógica de producto.
3. A6 junto con A5, mismo patrón.
4. A8 — decisión de diseño, no trabajo mecánico.
