# Plan de ataque — congelar Vibrix y arrancar el secuenciador de Lyrixa

> Decide **en qué orden** se hacen las dos cosas que están sobre la mesa y **en
> qué ventana** se hace cada una. Base: la
> [auditoría de congelación](../audits/AUDITORIA_CONGELACION_2026-09-30.md) y la
> [lista viva de fricciones](../../.agents/TAREA_CONGELACION.md).

## La restricción que ordena todo

Lyrixa **no puede arrancar de verdad todavía**, y no por falta de ganas: su
primera dependencia es trabajo **de Vibrix**. El secuenciador necesita un
manifiesto de slots con `slotRevision` para saber qué puede poner en la línea
temporal y para detectar que un slot cambió bajo sus pies. Hoy eso no existe
(verificado: 0 ocurrencias de `slotRevision` en `src/`).

Así que no hay dos frentes en paralelo desde hoy: hay **una cadena con dos
puertas**.

```
Vía 1 · Congelar Vibrix ──[puerta 1: el usuario da el visto bueno]──▶ tag
                                                                      │
                                       Vía 2 · Fase A (manifiesto) ◀───┘
                                                     │
                            ─[puerta 2: el manifiesto responde]─▶ Vía 3 · Lyrixa
                                                                  + Vibrix Fase C
```

## Vía 1 · Congelar Vibrix — **esta ventana, ahora**

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

## Vía 2 · Fase A, el manifiesto — **esta misma ventana, después del tag**

Es la vía más barata del plan y la que desbloquea a Lyrixa. Tres piezas:

- **`slotRevision`** — un hash del contenido en cada `ProfileSlot`, que cambie
  cuando cambian sus valores y no cuando cambia su nombre. Clave persistida
  nueva ⇒ **bump de `STORE_PERSIST_VERSION` + migración** que lo siembre
  calculándolo de lo que ya hay.
- **El manifiesto** — qué slots existen, de qué familia, con qué `id` y qué
  `slotRevision`. Derivado del estado, puro, testeable por valor.
- **El endpoint** que lo publica, sobre el `backend/server/` que ya existe.

Va **después** del tag a propósito: así Lyrixa construye contra un Vibrix
etiquetado y estable, no contra uno en movimiento.

**Hay dos huecos que decidir aquí, y es mejor decidirlos antes de escribir el
manifiesto que después:** `background` y `motion` son familias que el
secuenciador quiere como pista, y hoy **no** son slots de escena — existe
`backgroundProfileSlots` pero ninguna escena lo referencia, y `motion` vive
dentro de `cameraFx`. O el manifiesto las publica como pistas de primera clase,
o Lyrixa nace sin ellas.

**Puerta 2:** el manifiesto responde con slots reales. Ahí se bifurca.

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

| Cuándo                 | Ventanas abiertas                                    |
| ---------------------- | ---------------------------------------------------- |
| Ahora → puerta 1       | **Una sola**, aquí: F1, F2 y lo que salga probando   |
| Puerta 1 → puerta 2    | **Una sola**, aquí: tag + Fase A                     |
| Después de la puerta 2 | **Dos**: Lyrixa (obligatoria aparte) + Vibrix Fase C |

Bifurcar antes de la puerta 2 no compra nada: las dos ventanas tocarían los
mismos ficheros de Vibrix, y la de Lyrixa se quedaría esperando el manifiesto.
