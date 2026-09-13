# Plan de la web de venta — `vibrix-web`

> Estado: **plan aprobado, repo por crear** (2026-09-13).
> Ruta del proyecto: `/Users/frankman254/Desktop/Personal-Projects/vibrix-web`.
> Depende de: [PLAN_MAESTRO_LANZAMIENTO.md](PLAN_MAESTRO_LANZAMIENTO.md) §0.5 y
> tarea 4.4. Mapa de la suite: `.agents/SUITE.md`.

Este documento es lo que un agente abierto en `vibrix-web/` necesita para
construir la web de principio a fin sin volver a preguntar lo básico. Lo que sí
queda abierto está marcado como **Decisión pendiente** con una recomendación.

---

## 1 · Objetivo

Una web que convierta a un creador de música en usuario de Vibrix en menos de
un minuto de lectura, y que se sienta **del mismo nivel que el producto que
vende**: animada, rápida, oscura, con el lenguaje visual de un visualizador de
audio y nada de plantilla genérica de SaaS.

Métrica que manda: **visita → clic en "Crear mi vídeo" (abre la app)**. Todo lo
demás (precios, FAQ, lista de espera) apoya esa conversión.

### Lo que la web NO es

- No es la app. La app sigue en su propio deploy (Vite). La web enlaza a ella.
- No es un blog ni un CMS en `1.0`. Changelog y legal son MDX en el repo.
- No tiene cuentas ni login. La compra la gestiona el Merchant of Record.

---

## 2 · Mensaje

**Titular (ES):** _Tu música, convertida en vídeo._
**Subtítulo:** Visualizadores reactivos, letras sincronizadas tipo karaoke y
export MP4 listo para YouTube, TikTok e Instagram. Todo se renderiza en tu
navegador: sin subir tu audio, sin pagar por minuto.

**Titular (EN):** _Turn your music into video._

Tres ideas que la web repite en cada sección:

1. **Letra → sincronía → visual.** La suite hace la cadena completa.
2. **Render local.** Privacidad y sin coste por minuto (diferencia frente a
   Specterr/VEED, que renderizan en la nube).
3. **Hecho para música.** Spectrum, bajos, BPM, karaoke por palabra: no es un
   editor de vídeo genérico.

> **Honestidad de claims.** Solo se anuncia lo que existe en la versión
> publicada. "Export MP4" aparece cuando la Fase 1 esté cerrada; hasta entonces
> la sección dice "Próximamente" o no sale.

---

## 3 · Stack

| Pieza            | Elección                                                                                          | Por qué                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Framework        | **Next.js (App Router, última estable, 16.x)** + React 19 + TypeScript                            | Pedido explícito; SSG para SEO; misma base que `Landing-page-frankmandev`                   |
| Estilos          | **Tailwind CSS v4** (config en CSS con `@theme`)                                                  | Pedido explícito. v4, no v3: la landing personal está en v3, no copiar su `tailwind.config` |
| Animación        | **Motion** (`motion/react`, sucesor de framer-motion)                                             | Entradas, layout, gestos, `useScroll`/`useTransform` para scroll-driven                     |
| Scroll suave     | `lenis` (opcional, desactivado con `prefers-reduced-motion`)                                      | Sensación premium en el storytelling por scroll                                             |
| Visual del hero  | **Canvas 2D propio** (sin Three.js)                                                               | Un spectrum/partículas ligero que imita a Vibrix sin cargar 700 KB de three                 |
| Componentes      | Primitivas propias + `@radix-ui/*` solo donde haga falta (Accordion FAQ, Dialog de vídeo)         | Evitar un kit genérico que haga que la web parezca de plantilla                             |
| Iconos           | `lucide-react`                                                                                    | Ya usado en la landing personal                                                             |
| i18n             | `next-intl` con rutas `/es` y `/en` (default `en`, detección por `Accept-Language`)               | La app ya es bilingüe                                                                       |
| Contenido        | MDX local (`content/legal`, `content/changelog`)                                                  | Sin CMS en `1.0`                                                                            |
| Formularios      | Server Action + `zod`                                                                             | Lista de espera sin backend propio                                                          |
| Email / waitlist | **Decisión pendiente** — recomendado **Resend** (Audiences) porque ya está en la landing personal | —                                                                                           |
| Pagos            | **Lemon Squeezy** (overlay checkout) — ver plan maestro 4.2                                       | Merchant of Record: impuestos globales resueltos                                            |
| Analítica        | **Plausible** o Umami (sin cookies → sin banner)                                                  | Embudo visita → app → checkout                                                              |
| Deploy           | **Vercel** (o Cloudflare Pages)                                                                   | Preview por PR; imágenes y OG nativos                                                       |
| Paquetes         | **pnpm**                                                                                          | Igual que Vibrix                                                                            |
| Calidad          | ESLint (config de Next) + Prettier + `prettier-plugin-tailwindcss`                                | —                                                                                           |

### Andamiaje

La carpeta `vibrix-web/` ya existe con `AGENTS.md`, `CLAUDE.md` y `.agents/`.
`create-next-app` se niega a correr en una carpeta con esos archivos, así que:

```bash
cd /Users/frankman254/Desktop/Personal-Projects
pnpm create next-app@latest vibrix-web-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack
rsync -a vibrix-web-tmp/ vibrix-web/   # no pisa AGENTS.md / CLAUDE.md / .agents
rm -rf vibrix-web-tmp
```

Luego `git init` (si el scaffold no lo hizo) y primer commit.

---

## 4 · Dirección visual

**Concepto: "la web es un visualizador".** El fondo late con una onda suave;
las secciones aparecen como si el audio las empujara. Oscura, con acento cian
(el mismo de la app) y un segundo acento magenta para el glitch, usado con
mucha moderación.

### Tokens (Tailwind v4 `@theme`)

Tomar como base los tokens reales de la app para que web y app se sientan
del mismo producto (`LiveWallpaperAnimeGlitch/src/ui/tokens/`):

```css
@theme {
	--color-bg: #05070d; /* casi negro azulado */
	--color-surface: #0b1020;
	--color-surface-2: #111831;
	--color-line: rgb(255 255 255 / 0.08);
	--color-fg: rgb(255 255 255 / 0.96);
	--color-fg-mute: rgb(255 255 255 / 0.62);
	--color-accent: #67e8f9; /* = --vibrix-accent de la app */
	--color-accent-2: #f472b6; /* glitch / secundario, dosificado */
	--color-accent-fg: #020617;

	--font-display: 'Space Grotesk', ui-sans-serif, system-ui;
	--font-sans: 'Inter', ui-sans-serif, system-ui;
	--font-mono: 'JetBrains Mono', ui-monospace;

	--radius-card: 1.25rem;
	--shadow-glow: 0 0 24px
		color-mix(in srgb, var(--color-accent) 35%, transparent);
}
```

Fuentes vía `next/font/google` (auto-hospedadas, sin CLS). **Decisión
pendiente:** tipografía display definitiva; Space Grotesk es la recomendación
por su carácter técnico sin ser fría.

### Principios

- Contraste AA mínimo en todo texto; el acento cian nunca como texto largo.
- Movimiento con propósito: cada animación explica algo (flujo, reactividad) o
  guía la vista. Nada de "todo entra con fade" por defecto.
- **Vídeo real del producto > mockups.** Cada claim visual se respalda con un
  clip exportado con Vibrix.
- Móvil primero: el público (creadores de TikTok/Shorts) llega desde el móvil.

---

## 5 · Mapa del sitio

| Ruta                       | Contenido                                                                   | Fase web |
| -------------------------- | --------------------------------------------------------------------------- | -------- |
| `/[locale]`                | Landing completa (sección 6)                                                | W1       |
| `/[locale]/templates`      | Galería de plantillas con vídeo al hover/tap                                | W2       |
| `/[locale]/lyrixa`         | Página del editor de letras                                                 | W2       |
| `/[locale]/pricing`        | Planes + tabla comparativa + FAQ de facturación                             | W3       |
| `/[locale]/changelog`      | MDX, generado a partir del CHANGELOG de Vibrix (copiado a mano por release) | W4       |
| `/[locale]/legal/terms`    | Términos                                                                    | W4       |
| `/[locale]/legal/privacy`  | Privacidad (qué queda local, qué va al servidor de licencias)               | W4       |
| `/[locale]/legal/licenses` | Licencias de terceros (fuentes OFL, three.js, mediabunny…)                  | W4       |
| `/app` → redirect          | A la URL de la app (variable `NEXT_PUBLIC_APP_URL`)                         | W1       |

---

## 6 · La landing, sección por sección

Cada sección es un componente en `src/components/sections/`. Orden y guion:

### 6.1 Navbar

Logo + enlaces (Plantillas, Lyrixa, Precios, FAQ) + selector ES/EN + CTA
"Crear mi vídeo". Transparente arriba; al hacer scroll pasa a `backdrop-blur`
con borde inferior (animado con `useScroll`). En móvil, menú en hoja inferior.

### 6.2 Hero

- Izquierda: titular con **revelado por palabra** (stagger de Motion),
  subtítulo, CTA primario "Crear mi vídeo — gratis" y secundario "Ver demo (40 s)".
- Derecha/fondo: **vídeo del producto en bucle** (MP4 H.264 + WebM, `muted
playsInline autoPlay loop`, `poster` AVIF) dentro de un marco con glow.
- Detrás: canvas `HeroSpectrum` — barras radiales que respiran solas. Si el
  usuario pulsa "Escuchar", carga una pista de demo con licencia y el canvas
  reacciona de verdad (Web Audio `AnalyserNode`). Es el "momento wow" y
  demuestra el producto sin abrir la app.
- `prefers-reduced-motion`: canvas estático, vídeo con `poster` y botón play.

### 6.3 Franja de confianza

"Hecho para YouTube · TikTok · Instagram · OBS" con logos monocromos de
plataformas (uso nominativo, sin sugerir partnership). Cuando haya beta:
contador real de vídeos exportados o citas de beta testers.

### 6.4 Cómo funciona — letra → sincronía → visual

Sección **sticky con scroll-driven animation** (3 pasos, ~300vh):

1. **Sube tu canción.** Aparece una forma de onda que se dibuja.
2. **Sincroniza la letra en Lyrixa.** La onda se convierte en un timeline con
   clips de letra que caen en su sitio.
3. **Elige el visual y exporta.** El timeline se "enciende" y se vuelve el
   vídeo final.

Implementación: `useScroll({ target })` + `useTransform` sobre un contenedor
`sticky`; en móvil se degrada a tres tarjetas con vídeo corto cada una.

### 6.5 Features (bento grid)

Cuadrícula tipo bento con 6 celdas, cada una con microanimación propia:

| Celda                      | Visual                                                         |
| -------------------------- | -------------------------------------------------------------- |
| Spectrum reactivo          | Mini canvas con 3 familias alternando (lineal, radial, pixel)  |
| Letras karaoke por palabra | Línea de texto con el relleno avanzando palabra a palabra      |
| Escenas y slideshow        | Crossfade entre 3 fondos                                       |
| Export para cada red       | Marco que se transforma 16:9 → 9:16 → 1:1 (`layout` animation) |
| Render local y privado     | Icono de candado + "tu audio no sale de tu equipo"             |
| Modo OBS / en vivo         | Punto rojo "LIVE" + ecualizador                                |

Hover en desktop: la celda se ilumina con un spotlight que sigue al cursor
(CSS `radial-gradient` con variables actualizadas en `pointermove`).

### 6.6 Galería de plantillas (teaser)

Carrusel horizontal (scroll-snap nativo, sin librería) con 6 de las 12
plantillas de la Fase 2. Cada tarjeta: poster → vídeo al hover/tap, nombre,
género. CTA "Ver las 12 plantillas".

### 6.7 Lyrixa

Bloque a dos columnas: captura animada del timeline de Lyrixa + texto
"Tu letra, al milisegundo". Menciona exports `.lrc`/`.srt` solo cuando existan
(tarea 2.5).

### 6.8 Comparativa

Tabla "Vibrix vs editores en la nube" con criterios verificables: render local,
coste por minuto, letras por palabra, modo OBS, marca de agua en plan gratis.
**Sin nombrar competidores con datos no verificados**; si se nombran, con
fecha de consulta y fuente.

### 6.9 Precios (resumen)

Dos tarjetas (Free / Pro) con toggle mensual/anual animado (`layoutId` para la
píldora). Precios desde `src/config/pricing.ts`, nunca hardcodeados en JSX.
**Decisión pendiente:** cifras — las define el plan maestro §Fase 4
"Modelo de negocio".

### 6.10 Transcriptor — próximamente

Tarjeta con efecto "scan" y formulario de lista de espera (email + idioma
principal de las canciones). Texto: "Auto-letras con IA: sube la canción y
recibe la letra sincronizada para revisar en Lyrixa." Sin fecha prometida.

### 6.11 FAQ

Accordion Radix con animación de altura. Preguntas mínimas: ¿necesito
instalar algo? ¿Mi audio se sube a algún servidor? ¿Puedo usar música con
copyright? (respuesta: el usuario es responsable de los derechos) ¿Qué
navegadores? ¿Puedo cancelar? ¿Funciona en móvil?

### 6.12 CTA final + Footer

Bloque de ancho completo con el spectrum del hero en grande y el CTA. Footer
con enlaces legales, redes, selector de idioma y "Hecho con Vibrix".

---

## 7 · Sistema de animación

Reglas para que las animaciones se sientan profesionales y no ralenticen:

1. **Solo `transform` y `opacity`** en animaciones de entrada/scroll. Nunca
   `width/height/top` (salvo `layout` de Motion, que usa transform).
2. **Presets compartidos** en `src/lib/motion.ts`:
    ```ts
    export const ease = [0.22, 1, 0.36, 1] as const; // easeOutQuint
    export const fadeUp = {
    	hidden: { opacity: 0, y: 24 },
    	show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } }
    };
    export const stagger = (s = 0.06) => ({
    	show: { transition: { staggerChildren: s } }
    });
    ```
3. Entradas con `whileInView` + `viewport={{ once: true, amount: 0.3 }}`.
4. `MotionConfig reducedMotion="user"` en el layout raíz; Lenis y canvas se
   desactivan con `prefers-reduced-motion`.
5. Canvas del hero: `requestAnimationFrame` pausado cuando sale del viewport
   (`IntersectionObserver`) y cuando la pestaña está oculta; DPR máximo 2.
6. Vídeos: `preload="none"` salvo el del hero; cargan al entrar en viewport.
7. Componentes con animación son `'use client'` y **hojas**: las secciones
   siguen siendo Server Components y solo hidratan la parte animada.

---

## 8 · Rendimiento, SEO y accesibilidad (criterios duros)

| Área                        | Criterio                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Core Web Vitals (móvil, 4G) | LCP ≤ 2,5 s · CLS ≤ 0,05 · INP ≤ 200 ms                                                                                              |
| Lighthouse                  | ≥ 95 en Performance, Accessibility, Best Practices y SEO (landing)                                                                   |
| JS inicial                  | ≤ 180 KB gzip en `/` (medir con `next build` + `@next/bundle-analyzer`)                                                              |
| Vídeo hero                  | ≤ 2,5 MB, 720p, 8–12 s en bucle; AV1/WebM + H.264 de respaldo; poster AVIF                                                           |
| SEO                         | `generateMetadata` por página y locale, `hreflang`, `sitemap.ts`, `robots.ts`, JSON-LD `SoftwareApplication`                         |
| OG                          | Imágenes OG dinámicas con `next/og` por página                                                                                       |
| A11y                        | Navegable con teclado, foco visible (mismo anillo que la app), `aria-label` en controles de vídeo/audio, subtítulos en el vídeo demo |
| Privacidad                  | Sin cookies de terceros → sin banner. Analítica sin cookies                                                                          |

---

## 9 · Estructura del repo

```
vibrix-web/
├── AGENTS.md  CLAUDE.md  .agents/
├── content/
│   ├── changelog/*.mdx
│   └── legal/{es,en}/*.mdx
├── messages/{es,en}.json         # next-intl
├── public/
│   ├── media/hero/…              # vídeos exportados con Vibrix
│   └── media/templates/…
└── src/
    ├── app/[locale]/{page,layout}.tsx, templates/, lyrixa/, pricing/, legal/…
    ├── app/sitemap.ts  robots.ts  opengraph-image.tsx
    ├── components/
    │   ├── sections/             # Hero, HowItWorks, Features, …
    │   ├── motion/               # Reveal, Stagger, Spotlight, MagneticButton
    │   ├── canvas/               # HeroSpectrum (canvas 2D)
    │   └── ui/                   # Button, Card, Badge, Accordion, VideoFrame
    ├── config/{site,pricing,links}.ts
    ├── i18n/
    └── lib/{motion,analytics,waitlist}.ts
```

---

## 10 · Fases de la web

La web vive en otro repo y **no bloquea ni es bloqueada** por la fase activa de
Vibrix, salvo donde se indica.

| Fase   | Entregable                                                                                                                                                                                         | Depende de                                   | Criterio de salida                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **W0** | Scaffold (sección 3), tokens, fuentes, `next-intl`, layout, Navbar/Footer, `src/lib/motion.ts`, deploy preview en Vercel                                                                           | —                                            | `pnpm build` verde, preview online, Lighthouse ≥ 95 en página vacía                                      |
| **W1** | Landing completa con **placeholders** honestos: hero con canvas + vídeo grabado por OBS de la app actual, Cómo funciona, Features, FAQ, lista de espera (Transcriptor + "avísame del lanzamiento") | Resend configurado                           | Todas las secciones de §6 salvo precios/plantillas; formulario guarda email; responsive 360 px → 2560 px |
| **W2** | Vídeos reales exportados con el export offline; galería `/templates`; página `/lyrixa`                                                                                                             | Vibrix Fase 1 (export) y Fase 2 (plantillas) | Cero mockups: todo clip sale de Vibrix                                                                   |
| **W3** | `/pricing` + checkout Lemon Squeezy + página de gracias con la license key                                                                                                                         | Plan maestro 4.2 (licencias)                 | Compra de prueba en modo test end-to-end                                                                 |
| **W4** | Legal (MDX), changelog, OG dinámicos, JSON-LD, sitemap, analítica de embudo                                                                                                                        | Plan maestro 4.5–4.6                         | Criterios de §8 cumplidos y medidos                                                                      |
| **W5** | Lanzamiento: dominio definitivo, redirects, cambio de "lista de espera" a "comprar"                                                                                                                | Plan maestro Fase 5                          | Dominio en producción; checklist de lanzamiento completa                                                 |

**Arranque recomendado:** W0 y W1 pueden empezar ya, en paralelo a la Fase 1 de
Vibrix. Así la lista de espera acumula interesados durante los meses que faltan.

---

## 11 · Decisiones pendientes (con recomendación)

| Decisión                   | Recomendación                                                | Quién / cuándo       |
| -------------------------- | ------------------------------------------------------------ | -------------------- |
| Nombre paraguas y dominio  | Auditar primero (plan maestro 4.8); no comprar dominio antes | Usuario, antes de W5 |
| Proveedor de waitlist      | Resend Audiences                                             | Usuario, antes de W1 |
| Tipografía display         | Space Grotesk                                                | Agente propone en W0 |
| Precios                    | Plan maestro Fase 4                                          | Usuario, antes de W3 |
| Vercel vs Cloudflare Pages | Vercel (OG e imágenes sin config)                            | Usuario, en W0       |
| Pista de audio del hero    | Música propia o CC0 con licencia archivada                   | Usuario, antes de W1 |

---

## 12 · Checklist para el agente antes de cerrar cada fase

- [ ] `pnpm lint` y `pnpm build` verdes; Prettier aplicado.
- [ ] Revisado en móvil (375 px) y desktop (1440 px), claro que no hay scroll
      horizontal.
- [ ] `prefers-reduced-motion` probado.
- [ ] Lighthouse móvil medido y anotado en el PR.
- [ ] Textos en `messages/es.json` **y** `messages/en.json`; nada hardcodeado.
- [ ] Ningún claim de una feature que no esté publicada en la app.
- [ ] Todo asset nuevo con su licencia anotada en `content/legal/assets.md`.
