# Congelación — fricciones encontradas probando

> **Esta es la lista viva.** La auditoría
> [docs/audits/AUDITORIA_CONGELACION_2026-09-30.md](../docs/audits/AUDITORIA_CONGELACION_2026-09-30.md)
> es la foto del 2026-09-30 y no se toca; lo que aparece **probando el sistema a
> mano** se apunta aquí y se tacha al arreglarse.
>
> Criterio de congelación, dicho por el usuario: _"para congelar tengo que
> probar todo el sistema y que la mayoría de cosas pasen a mi juicio"_. Así que
> esto no se cierra por agotar la lista, se cierra cuando él lo diga.

> Orden y reparto de ventanas:
> [docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md](../docs/plans/PLAN_ATAQUE_CONGELACION_Y_LYRIXA.md).

## Regla de trabajo

Cada fricción lleva **qué se siente**, **por qué pasa** (verificado en código, no
supuesto) y **dónde se arregla**. Sin eso es un post-it, no una tarea.

## Bloquea congelar

| #   | Fricción                                                     | Estado                             |
| --- | ------------------------------------------------------------ | ---------------------------------- |
| F0  | Export de vídeo offline probado de punta a punta con un tema | **Pasa** (probado por el usuario)  |
| F1  | No se puede ver la intro/ending sin mover el tiempo del tema | **Hecha** (`15ac2439`, `88d2492e`) |
| F2  | Los selectores de slot son una lista larga sin flechas       | **Hecha** (ver abajo)              |
| F3  | `NotFoundError` de IndexedDB no capturado en cada arranque   | **Siguiente**                      |

## F1 · No hay forma de ver la intro o el ending sin cambiar el tiempo

**Qué se siente.** Para comprobar un cambio en la intro hay que llevar el
playhead al principio del tema, y para el ending al final. Configurar a ciegas y
rebobinar por cada ajuste hace la pestaña inusable para iterar — que es
justamente lo que hay que hacer para darla por buena.

**Por qué pasa.** Verificado: no existe ningún disparador de preview.
`IntroLayer` pregunta por la ventana con `resolveIntroWindow(state,
getCurrentTime(), getDuration())` — el **reloj real del audio** y nada más
([IntroLayer.tsx](../src/features/intro/IntroLayer.tsx)). No hay estado de
«reproduce la ventana ahora»; el único camino es mover el tiempo de verdad.

**Dónde se arregla.** Un reloj de preview que gane sobre el del audio mientras
corre: un estado efímero (**no persistido**, es un gesto, no un ajuste) con la
ventana y el momento de arranque, que `resolveIntroWindow` consulte antes del
reloj real. Botón «Ver la intro» / «Ver el ending» en la cabecera de cada
sub-pestaña, y se cancela solo al terminar o al tocar el transporte. Hay que
cuidar que el exportador **no** lo lea nunca: el archivo se rige por el reloj
del tema.

## F2 · Los selectores de slot obligan a recorrer una lista larga cada vez

**Qué se siente.** Para pasar de un slot al siguiente hay que abrir el
desplegable, bajar por una lista larga y acertar el que toca. Comparar dos slots
seguidos — el gesto normal al calibrar — cuesta dos viajes por la lista.

**Por qué pasa.** Los topes son altos a propósito (spectrum 120, el resto 60,
setlists 100), así que el desplegable es legítimamente largo. Y es **un solo
primitivo**: `Select` ([src/ui/Select.tsx](../src/ui/Select.tsx)), un panel
flotante con la lista entera, usado en 22 sitios de 9 ficheros. No hay
navegación «anterior / siguiente» en ninguna parte.

**Dónde se arregló.** En el primitivo, no en cada pestaña: `Select` acepta
`steppers` y entonces se flanquea con `◀ ▶` que saltan al vecino de `options`
sin abrir la lista. Se saltan los `disabled` y no dan la vuelta en los extremos
— con 120 slots, un «siguiente» que salte al primero es un brinco por todo el
banco. Al ser compartido entró de golpe en los 15 sitios donde se usa. La
búsqueda del vecino vive aparte en `src/ui/lib/stepOption.ts` con cinco tests,
porque no hay harness de DOM en el repo. Verificado también en el navegador:
avanza, aplica, y la flecha se apaga al llegar al extremo.

## F3 · Un `NotFoundError` de IndexedDB salta en cada arranque

**Qué se siente.** Nada, todavía: la app funciona. Pero la consola abre con una
excepción **no capturada** en cada carga.

**Por qué pasa.** Sin diagnosticar. El mensaje es `Failed to execute
'transaction' on 'IDBDatabase': One of the specified object stores was not
found`, y salta en una carga limpia sin tocar nada — verificado recargando la
página sin interactuar. Huele a un `objectStore` que se abre antes de que una
migración de la base lo haya creado.

**Por qué está en la lista.** Un error no capturado al arrancar es exactamente
lo que convierte «no se guardó mi proyecto» en un misterio de media tarde. Antes
de congelar hay que saber qué transacción es y si pierde datos o no.

## Arregladas en este ciclo

- La intro se dibujaba casi al fondo del vídeo exportado (`e1aafebf`).
- La intro de un setlist se comía la del proyecto (`e1aafebf`, store v143).
- El montaje recortaba por el centro imágenes con encuadre puesto (`e1aafebf`).
- Los slots de Camera FX guardaban la capa activa rancia (`e1aafebf`).
- La intro rehacía su reparto en cada cuadro (`4fce8b56`).
- **F1**: ver la intro/ending sin mover el tema, con un reloj de preview
  efímero que el exportador no puede leer (`15ac2439`); y pausarlo, con el
  cuadro congelado pero los ajustes vivos, más el zoom del mosaico
  (`montageImageScale`, store v144) y cuatro movimientos más (`88d2492e`).
- **F2**: flechas «anterior / siguiente» en `Select`, y la ventana Intro &
  ending puesta sobre el contrato de `EditorTabLayout` — interruptor maestro en
  la cabecera, bancos plegados, barra de navegación y transporte fijos, Title y
  Tagline deduplicados y con su cuerpo bajo `FeatureGate`. Auditoría en
  [docs/audits/AUDITORIA_VENTANA_INTRO_2026-09-30.md](../docs/audits/AUDITORIA_VENTANA_INTRO_2026-09-30.md):
  de las 58 claves de la ventana, **ninguna** está muerta; el problema era el
  orden, no el exceso.
- Fuera el grabador en vivo de la pestaña Export (`93486e2e`).

## No hacer mientras esto esté abierto

- Fases 1–3 de [PLAN_RENOVACION_2026-09](../docs/plans/PLAN_RENOVACION_2026-09.md):
  son ampliación, y el sistema de Lyrixa va a mover dónde vive esa configuración.
- Tocar `activeImageSelection` / `sceneSlot` por el refactor stateless de Lyrixa
  (Fase C): no debe arrastrar features a medio probar.
