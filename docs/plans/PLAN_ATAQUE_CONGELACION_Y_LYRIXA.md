# Plan de ataque — congelar Vibrix y arrancar el secuenciador de Lyrixa

> Decide **en qué orden** se hacen las dos cosas que están sobre la mesa y **en
> qué ventana** se hace cada una. Base: la
> [auditoría de congelación](../audits/AUDITORIA_CONGELACION_2026-09-30.md) y la
> [lista viva de fricciones](../../.agents/TAREA_CONGELACION.md).

## La restricción que ordena todo

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

## Vía 3 · Lyrixa y el refactor stateless — **ventanas nuevas, una cada uno**

Dos trabajos distintos que ya sí corren en paralelo:

| Trabajo                                          | Dónde                                 | Por qué separado                                                                                                                    |
| ------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| El secuenciador: línea temporal, cues, UI        | Ventana en `Lyrixa/`                  | **Obligatorio**: AGENTS.md prohíbe tocar el código de un proyecto vecino desde aquí. Tiene que ser una sesión con raíz en ese repo. |
| `resolveVisualStateAt(base, score, T)` en Vibrix | Ventana nueva en Vibrix, desde el tag | Es cirugía en `activeImageSelection` + `sceneSlot`, y conviene que no comparta ventana con nada a medio probar.                     |

El refactor es el trabajo real y el doc de Lyrixa no lo dimensiona: hoy el
estado visual en T **depende del camino** —parches encadenados, `null` que
significa «no tocar», `?? state.x` para preservar— así que reproducir 0→1:42 y
saltar a 1:42 dan frames distintos. Eso rompe seek, loop y render por tramos,
que son los tres pilares de una línea temporal. Detalle en la
[§4 de la auditoría](../audits/AUDITORIA_CONGELACION_2026-09-30.md).

## Resumen de la decisión de ventanas

| Cuándo                             | Ventanas abiertas                                    |
| ---------------------------------- | ---------------------------------------------------- |
| ~~Ahora → puerta 1~~ ✅            | **Una sola**, aquí: F1, F2 y lo que salga probando   |
| ~~Puerta 1 → puerta 2~~ ✅         | **Una sola**, aquí: tag + Fase A                     |
| **Ahora** — después de la puerta 2 | **Dos**: Lyrixa (obligatoria aparte) + Vibrix Fase C |

Bifurcar antes de la puerta 2 no compra nada: las dos ventanas tocarían los
mismos ficheros de Vibrix, y la de Lyrixa se quedaría esperando el manifiesto.
