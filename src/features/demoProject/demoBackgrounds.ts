/**
 * The demo project's background images, painted at first run.
 *
 * Three of them, not one, because the parts of the app worth showing — the
 * slideshow, per-image scenes, "the mark follows the picture", Keep Covered —
 * only exist once there is more than one picture. Painted rather than shipped so
 * the bundle carries no image licence, and deliberately different from each
 * other in colour and composition so switching between them is visible.
 *
 * Each one is a seeded sketch: same output every time, which keeps the demo
 * reproducible when something looks wrong.
 */
const WIDTH = 1600;
const HEIGHT = 900;

/** mulberry32 — small, fast, and stable across browsers. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function paintGrain(
	ctx: CanvasRenderingContext2D,
	random: () => number,
	amount: number
): void {
	// Flat digital gradients look like placeholder art; grain is what makes a
	// painted background read as an image.
	ctx.save();
	ctx.globalAlpha = amount;
	for (let index = 0; index < 9000; index += 1) {
		const x = random() * WIDTH;
		const y = random() * HEIGHT;
		const shade = Math.floor(random() * 255);
		ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
		ctx.fillRect(x, y, 2, 2);
	}
	ctx.restore();
}

function paintVignette(ctx: CanvasRenderingContext2D): void {
	const vignette = ctx.createRadialGradient(
		WIDTH / 2,
		HEIGHT / 2,
		HEIGHT * 0.25,
		WIDTH / 2,
		HEIGHT / 2,
		HEIGHT * 0.95
	);
	vignette.addColorStop(0, 'rgba(0,0,0,0)');
	vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** Sunset bands, a low sun and a skyline. Warm, high contrast. */
function paintNeonDusk(ctx: CanvasRenderingContext2D): void {
	const random = seededRandom(0x5eed01);
	const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
	// The warm half has to finish ABOVE the horizon: everything below it is
	// silhouette, so stops pushed further down are simply painted over.
	sky.addColorStop(0, '#1b0633');
	sky.addColorStop(0.38, '#5d1a74');
	sky.addColorStop(0.6, '#d8406a');
	sky.addColorStop(0.74, '#ff8a5c');
	sky.addColorStop(0.8, '#ffc978');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	const horizon = HEIGHT * 0.8;
	const sun = ctx.createRadialGradient(
		WIDTH * 0.52,
		horizon,
		0,
		WIDTH * 0.52,
		horizon,
		HEIGHT * 0.42
	);
	sun.addColorStop(0, 'rgba(255,240,200,0.95)');
	sun.addColorStop(0.35, 'rgba(255,160,120,0.5)');
	sun.addColorStop(1, 'rgba(255,120,90,0)');
	ctx.fillStyle = sun;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	// Retro bands cut across the sun, thinning towards the horizon.
	ctx.fillStyle = 'rgba(30,6,40,0.5)';
	for (let index = 0; index < 16; index += 1) {
		const y = horizon - index * index * 1.5 - 6;
		if (y < HEIGHT * 0.34) break;
		ctx.fillRect(0, y, WIDTH, Math.max(1, 11 - index * 0.65));
	}

	// Skyline: blocks of varying height on the horizon line.
	ctx.fillStyle = '#17061f';
	let x = -40;
	while (x < WIDTH + 40) {
		const width = 40 + random() * 90;
		const height = 30 + random() * 170;
		ctx.fillRect(x, horizon - height, width, height + 4);
		x += width + random() * 18;
	}
	ctx.fillStyle = '#17061f';
	ctx.fillRect(0, horizon, WIDTH, HEIGHT - horizon);

	paintGrain(ctx, random, 0.05);
	paintVignette(ctx);
}

/** A perspective grid running to a glowing horizon. Cool, graphic. */
function paintGlitchGrid(ctx: CanvasRenderingContext2D): void {
	const random = seededRandom(0x5eed02);
	ctx.fillStyle = '#05060f';
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	const horizon = HEIGHT * 0.52;
	const glow = ctx.createRadialGradient(
		WIDTH / 2,
		horizon,
		0,
		WIDTH / 2,
		horizon,
		WIDTH * 0.55
	);
	glow.addColorStop(0, 'rgba(83,230,255,0.55)');
	glow.addColorStop(0.4, 'rgba(120,61,255,0.22)');
	glow.addColorStop(1, 'rgba(5,6,15,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	ctx.strokeStyle = 'rgba(83,230,255,0.42)';
	ctx.lineWidth = 1.4;
	for (let index = -16; index <= 16; index += 1) {
		ctx.beginPath();
		ctx.moveTo(WIDTH / 2 + index * 26, horizon);
		ctx.lineTo(WIDTH / 2 + index * 220, HEIGHT + 40);
		ctx.stroke();
	}
	for (let index = 0; index < 18; index += 1) {
		// Geometric spacing: the illusion of distance comes from the rows
		// bunching up towards the horizon, not from the line count.
		const y = horizon + Math.pow(index, 2.05) * 1.35;
		if (y > HEIGHT) break;
		ctx.globalAlpha = 1 - index / 22;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(WIDTH, y);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;

	// RGB-split slabs above the horizon: the "glitch" of the name.
	for (let index = 0; index < 11; index += 1) {
		// Kept to the lower sky: a split band near the horizon reads as a
		// glitch, the same band across the top reads as a colour bar.
		const y = horizon * (0.45 + random() * 0.54);
		const height = 2 + random() * 9;
		const shift = (random() - 0.5) * 70;
		ctx.fillStyle =
			index % 3 === 0
				? 'rgba(255,45,120,0.30)'
				: index % 3 === 1
					? 'rgba(83,230,255,0.26)'
					: 'rgba(196,61,255,0.24)';
		ctx.fillRect(shift, y, WIDTH, height);
	}

	paintGrain(ctx, random, 0.06);
	paintVignette(ctx);
}

/** A single bloom with light shafts. Dark, soft, the calm one of the three. */
function paintCrimsonBloom(ctx: CanvasRenderingContext2D): void {
	const random = seededRandom(0x5eed03);
	ctx.fillStyle = '#0a0308';
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	const bloom = ctx.createRadialGradient(
		WIDTH * 0.44,
		HEIGHT * 0.44,
		0,
		WIDTH * 0.44,
		HEIGHT * 0.44,
		HEIGHT * 0.95
	);
	bloom.addColorStop(0, 'rgba(255,86,86,0.85)');
	bloom.addColorStop(0.28, 'rgba(198,36,72,0.45)');
	bloom.addColorStop(0.7, 'rgba(70,12,48,0.3)');
	bloom.addColorStop(1, 'rgba(10,3,8,0)');
	ctx.fillStyle = bloom;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	// A cool counter-glow in the far corner: without it the right third of the
	// frame is flat black, which looks like a half-painted image rather than a
	// dark one.
	const counter = ctx.createRadialGradient(
		WIDTH * 0.92,
		HEIGHT * 0.86,
		0,
		WIDTH * 0.92,
		HEIGHT * 0.86,
		HEIGHT * 0.7
	);
	counter.addColorStop(0, 'rgba(70,190,210,0.3)');
	counter.addColorStop(0.5, 'rgba(40,90,150,0.12)');
	counter.addColorStop(1, 'rgba(10,3,8,0)');
	ctx.fillStyle = counter;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	ctx.save();
	ctx.globalCompositeOperation = 'screen';
	ctx.translate(WIDTH * 0.44, HEIGHT * 0.44);
	ctx.rotate(-0.42);
	for (let index = 0; index < 7; index += 1) {
		const width = 18 + random() * 80;
		const alpha = 0.04 + random() * 0.07;
		ctx.fillStyle = `rgba(255,214,186,${alpha})`;
		ctx.fillRect(-WIDTH, -index * 120 - 40, WIDTH * 2.4, width);
	}
	ctx.restore();

	paintGrain(ctx, random, 0.07);
	paintVignette(ctx);
}

const DEMO_BACKGROUNDS = [
	{ name: 'Demo · Neon Dusk', paint: paintNeonDusk },
	{ name: 'Demo · Glitch Grid', paint: paintGlitchGrid },
	{ name: 'Demo · Crimson Bloom', paint: paintCrimsonBloom }
] as const;

export const DEMO_BACKGROUND_COUNT = DEMO_BACKGROUNDS.length;

async function toFile(
	name: string,
	paint: (ctx: CanvasRenderingContext2D) => void
): Promise<File | null> {
	const canvas = document.createElement('canvas');
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	paint(ctx);
	const blob = await new Promise<Blob | null>(resolve =>
		canvas.toBlob(resolve, 'image/png')
	);
	if (!blob) return null;
	return new File([blob], `${name}.png`, { type: 'image/png' });
}

export type DemoBackgroundFile = { name: string; file: File };

/** In display order. Entries the browser could not paint are left out. */
export async function createDemoBackgroundFiles(): Promise<
	DemoBackgroundFile[]
> {
	const painted = await Promise.all(
		DEMO_BACKGROUNDS.map(
			async (entry): Promise<DemoBackgroundFile | null> => {
				const file = await toFile(entry.name, entry.paint);
				return file ? { name: entry.name, file } : null;
			}
		)
	);
	return painted.filter(
		(entry): entry is DemoBackgroundFile => entry !== null
	);
}
