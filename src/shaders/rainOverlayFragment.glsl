uniform float uTime;
uniform float uRainIntensity;
uniform int   uDropCount;
uniform float uRainAngle;    // radians
uniform float uRainSpeed;
uniform float uRainLength;   // UV units, streak length
uniform float uRainWidth;    // UV units, half-width of each drop
uniform float uRainBlur;     // edge feather width
uniform float uRainVariation;
uniform vec3  uRainColor;
uniform int   uColorMode;    // 0=solid 1=rainbow 2=completeRotate
uniform int   uUsePaletteRainbow;
uniform int   uPaletteCount;
uniform vec3  uPaletteColors[6];
uniform int   uParticleType; // 0=lines 1=drops 2=dots 3=bars
uniform float uRainTiles;    // copies of the authored pattern per mesh axis
varying vec2 vUv;

float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  rgb = rgb * rgb * (3.0 - 2.0 * rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

vec3 getPaletteColor(float t) {
  if (uPaletteCount <= 0) return uRainColor;
  if (uPaletteCount == 1) return uPaletteColors[0];
  float scaled = clamp(t, 0.0, 1.0) * float(uPaletteCount - 1);
  int lowerIndex = int(floor(scaled));
  int upperIndex = min(uPaletteCount - 1, lowerIndex + 1);
  float alpha = scaled - float(lowerIndex);
  return mix(uPaletteColors[lowerIndex], uPaletteColors[upperIndex], alpha);
}

void main() {
  // Early-out: at intensity 0 the user effectively wants the layer off, but
  // the mesh stays mounted (parent doesn't unmount). Without this discard
  // every fragment still runs the up-to-100-iteration drop loop and pays
  // for the trig + random + smoothstep work, then gets thrown away at the
  // bottom. Short-circuiting here drops the cost to a single uniform read.
  if (uRainIntensity < 0.001) discard;

  // Rotate UV around center for rain angle
  float cosA = cos(uRainAngle);
  float sinA = sin(uRainAngle);
  vec2 centered = vUv - 0.5;
  vec2 rotUV = vec2(
    cosA * centered.x + sinA * centered.y,
    -sinA * centered.x + cosA * centered.y
  ) + 0.5;

  // The pattern tiles. Camera Motion slides this plane, so the plane has to be
  // bigger than the frame or its own edge rides into the picture; `uRainTiles`
  // is how many copies of the authored pattern fit in that bigger plane, so the
  // drops keep the size, speed and density the dials ask for however far the
  // camera travels. Wrapping is also why nothing is ever cut: a streak that
  // leaves one side comes back on the other.
  vec2 tileUV = vec2(fract(rotUV.x * uRainTiles), rotUV.y * uRainTiles);

  float rain = 0.0;
  vec3 rainColor = vec3(0.0);
  float halfW = max(uRainWidth, 0.0005);
  float blur  = max(uRainBlur, 0.0001);
  float variation = clamp(uRainVariation, 0.0, 1.0);

  float n = float(uDropCount);
  // Widest a drop can get once per-drop variation is applied, plus the feather.
  // `localHalfW` is `mix(1.0, 0.55 + r * 1.25, variation) * halfW` with r in
  // [0,1], so this is its exact upper bound — nothing that could contribute is
  // ever rejected by it.
  float maxReachX = halfW * mix(1.0, 1.8, variation) + blur;

  for (int i = 0; i < 100; i++) {
    if (i >= uDropCount) break;

    float fi = float(i);

    // Even distribution across full [0,1] width with per-drop jitter
    float dropX = (fi + 0.5 + (random(vec2(fi, 9.3)) - 0.5) * 0.6) / n;
    // Circular distance: the column pattern wraps with the tile, so a drop
    // sitting on the seam is still the nearest one to the pixels beside it.
    float dx = tileUV.x - dropX;
    dx -= floor(dx + 0.5);

    // Horizontal reject FIRST. This loop runs for every fragment on a
    // full-screen quad — ~2M times at 1080p — and every `random()` is a `sin`.
    // The per-drop constants below cost five more of them, and for a typical
    // pixel only one or two of the drops are anywhere near it, so computing
    // them before knowing that was ~6x the transcendental work per pixel for
    // nothing. Every drop type's contribution is bounded by `xW` (dots reach
    // this bound through `dist >= abs(dx)`), so an early exit here is exact.
    if (abs(dx) > maxReachX) continue;

    float localHalfW = halfW * mix(1.0, 0.55 + random(vec2(fi, 4.1)) * 1.25, variation);

    // Horizontal proximity weight (common to all types)
    float xW = 1.0 - smoothstep(localHalfW, localHalfW + blur, abs(dx));
    if (xW <= 0.001) continue;

    float localLength = max(0.002, uRainLength * mix(1.0, 0.65 + random(vec2(fi, 6.4)) * 1.1, variation));
    float alphaJitter = mix(1.0, 0.7 + random(vec2(fi, 7.8)) * 0.65, variation);

    float spd    = uRainSpeed * (0.55 + random(vec2(fi, 1.1)) * 0.9);
    float phase  = random(vec2(fi, 2.7));
    // headY: leading edge, falls 1→0 (top to bottom in Three.js UV)
    float headY  = 1.0 - fract(uTime * spd * 0.22 + phase);

    // Wrapped for the same reason as `dx`: a trail leaving the tile continues
    // into the next one instead of ending at a straight edge.
    float trailDY = mod(tileUV.y - headY, 1.0); // 0 at the head, grows upward

    float contrib = 0.0;

    if (uParticleType == 0) {
      // Lines: tapered streak trailing above the head
      if (trailDY >= 0.0 && trailDY < localLength) {
        contrib = xW * (1.0 - trailDY / localLength);
      }
    } else if (uParticleType == 1) {
      // Drops: teardrop — wide at head, narrow tail
      float stretchY = max(trailDY, 0.0) / max(localLength * 0.4, 0.001);
      float dist = sqrt(dx * dx * 3.0 + stretchY * stretchY);
      contrib = (1.0 - smoothstep(0.0, localHalfW + blur, dist)) * xW;
      if (trailDY < 0.0 || trailDY > localLength * 0.55) contrib = 0.0;
    } else if (uParticleType == 2) {
      // Dots: circular splat at head position. The vertical distance is signed
      // and wrapped so the splat stays round where the tile wraps (`trailDY`
      // measures 0..1 upward from the head, so the bottom of the splat sits
      // just under 1.0).
      float dyDot = trailDY - localHalfW;
      dyDot -= floor(dyDot + 0.5);
      float dist = sqrt(dx * dx + dyDot * dyDot);
      contrib = 1.0 - smoothstep(0.0, localHalfW + blur, dist);
    } else {
      // Bars: uniform solid rectangle
      if (trailDY >= 0.0 && trailDY < localLength) {
        contrib = xW;
      }
    }

    vec3 dropColor = uRainColor;
    if (uColorMode == 2) {
      // Complete cycle: the hue wheel for most of the loop, then pure black
      // and pure white, which a plain rainbow can never reach.
      float t = fract(fi / max(n, 1.0) + uTime * 0.04 + random(vec2(fi, 11.3)) * 0.18);
      // Image / theme sources sweep their own palette; manual uses the wheel.
      vec3 hueStart = uUsePaletteRainbow == 1 ? getPaletteColor(0.0) : hsv2rgb(vec3(0.0, 1.0, 1.0));
      vec3 hueEnd = uUsePaletteRainbow == 1 ? getPaletteColor(1.0) : hsv2rgb(vec3(1.0, 1.0, 1.0));
      if (t < 0.70) {
        float h = t / 0.70;
        dropColor = uUsePaletteRainbow == 1 ? getPaletteColor(h) : hsv2rgb(vec3(h, 1.0, 1.0));
      } else if (t < 0.80) {
        dropColor = mix(hueEnd, vec3(0.0), (t - 0.70) / 0.10);
      } else if (t < 0.90) {
        dropColor = mix(vec3(0.0), vec3(1.0), (t - 0.80) / 0.10);
      } else {
        dropColor = mix(vec3(1.0), hueStart, (t - 0.90) / 0.10);
      }
    } else if (uColorMode == 1) {
      if (uUsePaletteRainbow == 1) {
        float paletteT = fract(fi / max(n, 1.0) + random(vec2(fi, 11.3)) * 0.08);
        dropColor = getPaletteColor(paletteT);
      } else {
        float hue = fract(fi / max(n, 1.0) + uTime * 0.04 + random(vec2(fi, 11.3)) * 0.18);
        dropColor = hsv2rgb(vec3(hue, 0.82, 1.0));
      }
    } else {
      dropColor *= mix(1.0, 0.75 + random(vec2(fi, 5.7)) * 0.5, variation);
    }

    float weighted = contrib * alphaJitter;
    rain += weighted;
    rainColor += dropColor * weighted;
  }

  if (rain <= 0.001) discard;

  float totalRain = rain;
  rain = clamp(rain, 0.0, 1.0);
  vec3 finalColor = rainColor / max(totalRain, 0.001);
  gl_FragColor = vec4(finalColor, rain * uRainIntensity * 0.7);
}
