# Plan de ataque — congelar Vibrix y arrancar el secuenciador de Lyrixa

> Decide **en qué orden** se hacen las dos cosas que están sobre la mesa y **en
> qué ventana** se hace cada una. Base: la
> [auditoría de congelación](../audits/AUDITORIA_CONGELACION_2026-09-30.md) y la
> [lista viva de fricciones](../../.agents/TAREA_CONGELACION.md).

## Dónde quedó esto — **al día 2026-10-11**

> Este plan se escribió el 2026-09-30 para una entrega que ya no es la que se
> está construyendo. Lo que sigue vivo y lo que caducó, verificado contra los
> commits y contra `src/`, no contra lo que este doc decía:

| Lo que el plan pedía                              | Qué pasó de verdad                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Puerta 1: visto bueno del usuario → **tag**       | El visto bueno llegó. **El tag nunca se creó** — el único que existe es `v0.4.1-alpha`                           |
| Vía 2 · Fase A: manifiesto v1 de slots            | **Hecha** (`640b63c6`, 2026-10-02). Puerta 2 pasada contra el parser real de Lyrixa                              |
| Vía 3 · Fase C en **ventana propia desde el tag** | `resolveVisualStateAt` **ya aterrizó** (`b2db3a74`, 2026-10-04) — sin tag y en el mismo commit que otras 3 fases |
| El modelo del contrato                            | **Sustituido el 2026-10-03** por el v2: imágenes como objetos y activaciones sostenidas por carril               |

**Por qué nos desviamos, sin adornos.** Tres cosas, y sólo una fue una decisión:

1. **El modelo cambió a mejor, y eso es legítimo.** El 2026-10-03 el usuario
   cerró el v2 ([TAREA_COMPOSE_TIMELINE.md](../../.agents/TAREA_COMPOSE_TIMELINE.md)):
   el v1 sólo publicaba slots, y un timeline que no puede colocar **imágenes**
   no sirve para componer un tema. Eso no es deriva, es el plan corrigiéndose.
2. **El tag se evaporó en vez de cumplirse.** Era la condición que este plan le
   ponía a la Fase C, y la Fase C entró igual. Nadie la saltó a propósito:
   simplemente no había nada que la forzara, porque una precondición escrita
   sólo en un doc no bloquea nada.
3. **El commit del v2 metió V2.1 + V2.1b + V2.2 + media V2.3 de una vez**, que
   es exactamente el «un dominio por PR» de AGENTS.md doblado. Y la consecuencia
   se puede medir hoy: `resolveVisualStateAt` tiene 234 líneas y 241 de tests, y
   **nada en `src/` lo importa** (verificado por grep: la única mención fuera de
   su módulo es un comentario). El evaluador está construido, probado y
   desconectado — justo lo que los tests solos no pueden detectar.

**Y después, la atención se fue a otra parte.** De los 21 commits posteriores a
la Fase A, **uno** es del subsistema compose; los otros 20 son export offline,
slideshow, storage, WebGL, stage FX, proyecto demo y barrido de legacy. Trabajo
bueno y de la Fase 1 del plan maestro, pero de **otra vía**: el circuito de
compose se quedó a un paso de cerrar y ahí sigue.

**Lo que falta es poco y es el último tramo.** No hay que rehacer nada: hay que
**conectar** lo que ya existe. Está desarrollado abajo, en la Vía 3.

## La restricción que ordena todo

> **Histórico — 2026-10-02.** Se conserva porque explica por qué los dos repos
> pudieron trabajar en paralelo. La frase «0 ocurrencias de `slotRevision` en
> `src/`» era cierta aquel día y hoy no: el subsistema existe.

> **Actualizado 2026-10-02 — la cadena se rompió a propósito.** Lo de abajo
> describía una dependencia estricta: Lyrixa esperando el manifiesto. Ya no es
> así. El contrato existe
> ([VIBRIX_AUTHORING_CONTRACT.md](../features/VIBRIX_AUTHORING_CONTRACT.md)) y
> trae un **fixture literal** que los dos repos validan en su propia suite, así
> que **Lyrixa construye contra el fixture** y las dos vías corren en paralelo
> desde hoy. Las tareas concretas están en
> [.agents/TAREA_MANIFIESTO.md](../../.agents/TAREA_MANIFIESTO.md) (aquí) y
> `Lyrixa/.agents/TAREA_SECUENCIADOR.md` (allí). Lo único que sigue esperando es
> la **última** comprobación: que un score mueva lo que se ve en Vibrix.

Lyrixa **no podía arrancar de verdad** mientras su primera dependencia fuera
trabajo **de Vibrix**: el secuenciador necesita un manifiesto de slots con
`slotRevision` para saber qué puede poner en la línea temporal y para detectar
que un slot cambió bajo sus pies. Eso sigue sin existir en código (verificado: 0
ocurrencias de `slotRevision` en `src/`), pero **sí existe como contrato con
fixture**, y contra eso se construye.

Así que la cadena con dos puertas de abajo describe el **orden de entrega**, no
una espera.

```
Vía 1 · Congelar Vibrix ──[puerta 1: el usuario da el visto bueno]──▶ tag
                                                                      │
                                       Vía 2 · Fase A (manifiesto) ◀───┘
                                                     │
                            ─[puerta 2: el manifiesto responde]─▶ Vía 3 · Lyrixa
                                                                  + Vibrix Fase C
```

## Vía 1 · Congelar Vibrix — **lista salvo el visto bueno**

> **Al día 2026-10-02:** la [lista viva](../../.agents/TAREA_CONGELACION.md) está
> en cero — F0 pasa y F1, F2 y F3 están hechas. Falta **sólo la puerta 1**, que
> es del usuario: él dice si la mayoría pasa a su juicio, y entonces se etiqueta.

El objetivo no es «arreglar todos los bugs». Es que el usuario pueda **probar el
sistema entero y decir que pasa**. Eso cambia el orden de la cola.

**Primero las dos fricciones que son instrumentos de prueba, no features.** F1
(ver la intro/ending sin mover el tiempo) y F2 (flechas en los selectores de
slot) no son ítems cualesquiera de la lista: son **lo que hace falta para poder
probar lo demás**. Mientras no estén, cada comprobación de la intro cuesta
rebobinar el tema y cada comparación de slots cuesta dos viajes por un
desplegable de 60–120 entradas. Arreglarlos primero acelera todo lo que viene
detrás, incluido encontrar los bugs que aún no sabemos que existen.

Orden:

1. **F1 y F2** — en ese orden; F1 es la que más duele.
2. **Lo que el usuario encuentre probando.** Va a la
   [lista viva](../../.agents/TAREA_CONGELACION.md), con su «qué se siente / por
   qué pasa / dónde se arregla». Se arregla por tandas, no de uno en uno.
3. **Los dos restos baratos**, en el mismo pase que algo de su dominio: borrar el
   id muerto `motion` y marcar en el picker las imágenes sin punto de cara.
4. **F0: el export de punta a punta.** Es del usuario y ya está en curso.

**Puerta 1 — qué significa «congelado»:** el usuario dice que la mayoría pasa a
su juicio. Entonces, y sólo entonces, se etiqueta. El tag es el punto al que se
puede volver cuando la Vía 3 toque lo delicado; sin él, el refactor stateless no
tiene red.

**Lo que NO entra en esta vía:** las fases 1–3 de
[PLAN_RENOVACION_2026-09](PLAN_RENOVACION_2026-09.md). Son ampliación, y el
secuenciador va a mover dónde vive esa configuración.

## Vía 2 · Fase A, el manifiesto — **HECHA (2026-10-02)**

> El usuario dio la **puerta 1** y la Fase A se implementó en la misma ventana:
> `slotRevision.ts`, `authoringManifest.ts`, el export por archivo y el import de
> score con su informe, 54 tests nuevos. La **puerta 2 también está pasada**: el
> manifiesto de un proyecto real (49 slots, 12 familias, tres escenas) lo acepta
> el `parseAuthoringManifest` **real** de Lyrixa. Detalle y desviaciones en
> [.agents/TAREA_MANIFIESTO.md](../../.agents/TAREA_MANIFIESTO.md).
>
> **El tag sigue pendiente.** Es lo único de la Vía 1 que falta, y hace de red
> para la Vía 3.

Es la vía más barata del plan y la que desbloquea a Lyrixa. Tres piezas:

- **`slotRevision`** — un hash del contenido en cada `ProfileSlot`, que cambie
  cuando cambian sus valores y **no** cuando cambia su nombre. **Derivado a
  demanda, no persistido** (ver abajo): sin bump ni migración.
- **El manifiesto** — qué slots existen, de qué familia, con qué `id` y qué
  `slotRevision`. Derivado del estado, puro, testeable por valor.
- **La entrega, por archivo**: `<proyecto>.vibrix-manifest.json`. **No un
  endpoint todavía** — el manifiesto sale del store del _navegador_, que el
  servidor no tiene, y la ruta contra la que apunta el puente de Lyrixa
  (`POST /api/lyrics-bundle`) **no existe** en `backend/server/src/index.mjs`.
  HTTP después, con los mismos bytes.

Va **después** del tag a propósito: así Lyrixa construye contra un Vibrix
etiquetado y estable, no contra uno en movimiento.

**Los dos huecos que había que decidir están decididos**, en la tabla de familias
del [contrato](../features/VIBRIX_AUTHORING_CONTRACT.md), y ninguno salió como se
esperaba:

- **`motion` no es una familia que falte: es una que se borró.**
  `wallpaperStoreMigrations.ts:2974` hace `delete motionProfileSlots`. Era
  partículas+lluvia juntas y hoy se componen por separado. Fuera del contrato; un
  cue `'motion'` no se podría resolver nunca.
- **`background` no es «qué imagen se ve».** `backgroundProfileSlots` son
  perfiles del **envelope de zoom por graves** (los usa `BgZoomAudioSection`), y
  en efecto ninguna escena los referencia. Se publica como **`background-zoom`**
  con `sceneBindable: false`, precisamente para que la UI de Lyrixa **no** prometa
  cambiar la imagen de fondo desde la línea temporal: eso es el pool y los
  setlists, no un slot.

Y una tercera que nadie había mirado: **`slotRevision` no necesita ser una clave
persistida**. Derivarla de `values` a demanda **ahorra el bump de
`STORE_PERSIST_VERSION` y su migración** y elimina la posibilidad de que el hash
y el contenido diverjan. Esta vía ya no toca la persistencia.

**Puerta 2:** el manifiesto responde con slots reales. Ahí se bifurca. **Pasada:**
responde con 49 slots de un proyecto real y Lyrixa los lee.

Y apareció una cuarta decisión que no estaba en la mesa: **la revisión de una
escena tiene que incluir las revisiones de los slots que liga**, o Lyrixa dice
`Current` con el frame ya cambiado. Está en el contrato, §«La revisión de una
escena incluye lo que liga».

## Vía 3 · El último tramo — **conectar el evaluador** (reescrita 2026-10-11)

La versión anterior de esta sección repartía dos ventanas: el secuenciador en
Lyrixa y «el refactor stateless» en Vibrix. La segunda mitad ya no describe el
trabajo que queda, porque el evaluador puro **está hecho**. Lo que queda es
enchufarlo, y eso es un trabajo distinto y más peligroso: toca el runtime.

El diagnóstico que lo motivaba sigue siendo exacto y vale releerlo: hoy el
estado visual en T **depende del camino** —parches encadenados, `null` que
significa «no tocar», `?? state.x` para preservar—, así que reproducir 0→1:42 y
saltar a 1:42 dan frames distintos. `resolveVisualStateAt` resuelve eso **como
función**; nada de eso llega a la pantalla hasta que alguien la llame.
[§4 de la auditoría](../audits/AUDITORIA_CONGELACION_2026-09-30.md).

### Puerta 0 · el tag, decisión del usuario

Sigue sin crearse, y su propósito está **medio gastado**: era la red para la
cirugía, y parte de la cirugía ya entró. Pero la parte de verdad peligrosa —
tocar `activeImageSelection` y `sceneSlot` **en caliente**, durante Play y
seek — es justo la que viene ahora. Así que el tag todavía compra algo.

Dos salidas honestas, y hay que elegir una:

- **Etiquetar ahora.** `main` está verde (174 ficheros / 1938 tests) y es un tag
  sobre un punto conocido. Cuesta un minuto y da el punto de retorno para W3/W4.
- **Retirar el requisito y decirlo.** Si el tag no va a existir, este doc no
  puede seguir pidiéndolo: una precondición que nadie cumple y nadie bloquea es
  peor que no tenerla.

Recomendación: **etiquetar antes de W3**, que es el primer commit que cambia lo
que se ve mientras el audio corre.

### El tramo, un commit por paso

Numerado contra [TAREA_COMPOSE_TIMELINE.md](../../.agents/TAREA_COMPOSE_TIMELINE.md),
que es el doc vivo de este trabajo:

| Paso   | Qué                                                                                                                    | Riesgo                               | De dónde sale       |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------- |
| **W1** | La transición de imagen en el evaluador (la de la imagen **saliente**, en tiempo absoluto)                             | Ninguno: puro y testeable por valor  | V2.3 · 4            |
| **W2** | Modo Compose: dónde vive el score importado y el `confirm()` antes de quitarle al usuario el control manual del tiempo | Medio: **aquí sí** toca persistencia | V2.3 · 6 + V2.2 · 5 |
| **W3** | Conectar el evaluador a preview, Play y **seek**                                                                       | Alto: runtime en caliente            | V2.3 · 5            |
| **W4** | Conectar el mismo evaluador al export offline y medir la paridad                                                       | Medio                                | V2.3 · 5            |
| **W5** | Importar el contenedor `.vibrix-score` de Lyrixa (el JSON suelto se queda como legacy)                                 | Bajo                                 | V2.2 · 6            |

**Por qué este orden.** W1 primero porque es la última pieza pura y no puede
romper nada. W2 antes de W3 porque Play no puede seguir un score que no tiene
dónde vivir — y ojo: **ahí deja de valer la excusa del commit de la Fase A**.
Entonces no se persistía porque nada lo consumía; en W2 ya hay consumidor, así
que toca clave nueva **con bump de `STORE_PERSIST_VERSION` y migración** (hoy va
por 152). W4 después de W3 porque la paridad se mide contra un preview que ya
funciona, no contra dos cosas a medio hacer.

### Lo que es de Lyrixa y no se toca desde aquí

L2.1 entero: importar `.vibrix-authoring`, los carriles, el drag, `Add at
playhead`, `Inherit`, miniaturas, y exportar `.vibrix-score`. **Obligatorio en
una ventana con raíz en ese repo** — AGENTS.md prohíbe tocar el código de un
vecino desde aquí. Lo único que Vibrix le debe todavía es que el paquete v2 se
pueda abrir **desconectado** (V2.1b · 5), que es una comprobación suya.

### La puerta de salida no cambió

Sigue siendo la de TAREA_COMPOSE_TIMELINE, y es la única que cuenta: con un
score **real** de Lyrixa, dos imágenes, dos escenas, un granular y un
`inherit`; **seek a cada corte da el mismo frame que reproducir desde cero**; y
preview y export offline coinciden en los cortes y durante las transiciones.

## Resumen de la decisión de ventanas

| Cuándo                       | Ventanas abiertas                                              |
| ---------------------------- | -------------------------------------------------------------- |
| ~~Hasta puerta 1~~ ✅        | **Una sola**, aquí: F1, F2 y lo que salga probando             |
| ~~Puerta 1 → puerta 2~~ ✅   | **Una sola**, aquí: Fase A (el tag se quedó sin hacer)         |
| ~~Puerta 2 → 2026-10-04~~ ✅ | Aquí: el v2 del contrato y el evaluador puro                   |
| **Ahora**                    | **Dos**: W1→W5 aquí (el tramo de conexión) + L2.1 en `Lyrixa/` |

Bifurcar antes de la puerta 2 no compraba nada; ahora sí, porque las dos mitades
ya no comparten ficheros: Vibrix conecta un evaluador que existe y Lyrixa
construye el timeline contra un paquete que ya se exporta.

**El conflicto de agenda que hay que resolver, no esconder.** La ventana de aquí
está ocupada: [TAREA_EXPORT_RAPIDO_AISLADO.md](../../.agents/TAREA_EXPORT_RAPIDO_AISLADO.md)
tiene las fases B (puntos 1, 3 y 4) y D abiertas y esperando auditoría. W1→W5 y
ese sprint se pisan en `features/export/`, así que van en serie y el usuario
elige cuál primero. Recomendación: **W1 y W2 ya**, que no tocan el export, y
W3/W4 cuando el sprint del export cierre — así la paridad se mide una vez, no
dos.
