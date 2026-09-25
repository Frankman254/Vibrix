/**
 * Live Wallpaper API server.
 *
 * Two responsibilities, both of which exist because they cannot safely live in
 * the browser:
 *  - `/api/ai/scene-intent` — holds the Anthropic key, caches answers.
 *  - `/api/projects/*`      — holds the database credential, enforces ownership.
 *
 * Plain ESM JavaScript with no build step: this is a small service and a
 * TypeScript toolchain here would add a compile stage to something that runs
 * with `node src/index.mjs`. The client still gets full type safety, because
 * the wire contract is typed on its side and every response is re-validated
 * there.
 */
import { networkInterfaces } from 'node:os';
import express from 'express';
import pg from 'pg';
import { createSceneIntentHandler } from './sceneIntentRoute.mjs';
import { createAnthropicProvider } from './providers/anthropic.mjs';
import { createOllamaProvider } from './providers/ollama.mjs';
import { createOpenAiCompatProvider } from './providers/openaiCompat.mjs';
import { createProjectsRouter } from './projectsRoute.mjs';

const PORT = Number(process.env.PORT ?? 8787);
// All interfaces, so the app reached by LAN or tailnet address — not just
// localhost — can call it. HOST=127.0.0.1 keeps it on this machine only.
const HOST = process.env.HOST ?? '0.0.0.0';
// Comma-separated so the same backend can serve the app on the vite dev
// server, the deployed web origin, and a Tauri shell at once. '*' reflects any
// origin (dev only — do not ship it with DATABASE_URL set).
const ALLOWED_ORIGINS = (
	process.env.LWAG_ALLOWED_ORIGIN ?? 'http://localhost:5173'
)
	.split(',')
	.map(origin => origin.trim());

/** Reflect whichever configured origin the request came from, or none. */
function allowedOriginFor(reqOrigin) {
	if (!reqOrigin) return null;
	if (ALLOWED_ORIGINS.includes('*')) return reqOrigin;
	return ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : null;
}

/**
 * Bearer-token auth.
 *
 * This is a DEVELOPMENT STAND-IN, not a production identity system: tokens are
 * a static list from the environment and the owner id is derived from the
 * token. Replacing it with a real provider (Supabase Auth, Auth0, your own
 * sessions) means changing this one function — everything downstream only
 * reads `req.ownerId`. See the README before deploying.
 */
function createAuth() {
	const tokens = (process.env.LWAG_API_TOKENS ?? '')
		.split(',')
		.map(token => token.trim())
		.filter(Boolean);

	return function requireAuth(req, res, next) {
		if (tokens.length === 0) {
			res.status(503).json({ error: 'sync is not configured' });
			return;
		}
		const header = req.get('authorization') ?? '';
		const token = header.startsWith('Bearer ') ? header.slice(7) : '';
		if (!tokens.includes(token)) {
			res.status(401).json({ error: 'unauthorized' });
			return;
		}
		// Deterministic per-token owner so rows stay stable across restarts.
		req.ownerId = deterministicUuid(token);
		next();
	};
}

/** Stable UUID derived from a token, so the dev auth needs no user table. */
function deterministicUuid(seed) {
	const hash = [...seed].reduce(
		(acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
		7
	);
	const hex = hash.toString(16).padStart(8, '0');
	return `${hex}-0000-4000-8000-${hex}0000`;
}

const app = express();
// Wallpaper state is large (pools, slots, scenes); the default 100kb limit
// would reject a real project.
app.use(express.json({ limit: '32mb' }));

app.use((req, res, next) => {
	const origin = allowedOriginFor(req.headers.origin);
	if (origin) res.set('Access-Control-Allow-Origin', origin);
	res.set('Access-Control-Allow-Headers', 'content-type, authorization');
	res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	if (req.method === 'OPTIONS') {
		// Also serves as the client's capability probe.
		res.status(200).end();
		return;
	}
	next();
});

app.get('/api/health', (_req, res) => {
	void (async () => {
		res.json({
			ok: true,
			sceneIntent: aiProvider
				? { provider: aiProvider.name, ...(await aiProvider.health()) }
				: { ok: false, reason: 'not configured' },
			sync: Boolean(process.env.DATABASE_URL)
		});
	})();
});

// ── AI scene intent ─────────────────────────────────────────────────────────
/**
 * Provider selection. `LWAG_AI_PROVIDER` picks explicitly; otherwise a present
 * `ANTHROPIC_API_KEY` wins and a local Ollama is the fallback. Both implement
 * the same tiny interface, so the route never learns which one ran — and a
 * laptop with Ollama needs no key, no quota and no network.
 */
function selectProvider() {
	const explicit = process.env.LWAG_AI_PROVIDER;
	if (explicit === 'ollama') return createOllamaProvider();
	if (explicit === 'openai') return createOpenAiCompatProvider();
	if (explicit === 'anthropic') {
		return process.env.ANTHROPIC_API_KEY
			? createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
			: null;
	}
	if (process.env.ANTHROPIC_API_KEY) {
		return createAnthropicProvider({
			apiKey: process.env.ANTHROPIC_API_KEY
		});
	}
	// A configured OpenAI-compatible server (vLLM on a DGx, LM Studio) wins
	// over Ollama because pointing one at the server IS the intent to use it.
	// OPENAI_MODEL is optional: without it the adapter asks the server which
	// model it serves, which is what a single-model box wants.
	if (process.env.OPENAI_BASE_URL) {
		return createOpenAiCompatProvider();
	}
	return createOllamaProvider();
}

const aiProvider = selectProvider();

if (aiProvider) {
	app.post(
		'/api/ai/scene-intent',
		createSceneIntentHandler({ provider: aiProvider })
	);
	console.log(`[server] scene intents via ${aiProvider.name}`);
	// Report an unreachable local runtime at boot rather than on first request.
	void aiProvider.health().then(status => {
		if (!status.ok) {
			console.warn(`[server] scene provider not ready: ${status.reason}`);
		}
	});
} else {
	// Explicitly unavailable rather than a 404, so the client can tell "not
	// configured" from "wrong URL". Either way it falls back to the heuristic.
	app.post('/api/ai/scene-intent', (_req, res) => {
		res.status(503).json({ error: 'no scene-intent provider configured' });
	});
	console.warn(
		'[server] no scene-intent provider — falling back to heuristic.'
	);
}

// ── Project sync ────────────────────────────────────────────────────────────
if (process.env.DATABASE_URL) {
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
	const projects = createProjectsRouter({ pool });
	const requireAuth = createAuth();

	app.get('/api/projects', requireAuth, projects.list);
	app.get('/api/projects/:id', requireAuth, projects.load);
	app.put('/api/projects/:id', requireAuth, projects.save);
	app.delete('/api/projects/:id', requireAuth, projects.remove);
	app.get('/api/projects/:id/assets', requireAuth, projects.listAssets);
	app.put('/api/projects/:id/assets', requireAuth, projects.putAsset);
} else {
	console.warn('[server] DATABASE_URL unset — project sync disabled.');
}

app.listen(PORT, HOST, () => {
	console.log(`[server] listening on http://${HOST}:${PORT}`);
	if (HOST === '0.0.0.0') {
		// Print the reachable addresses: the log line above is not one.
		for (const [, entries] of Object.entries(networkInterfaces())) {
			for (const entry of entries ?? []) {
				if (entry.family === 'IPv4' && !entry.internal) {
					console.log(`[server]   http://${entry.address}:${PORT}`);
				}
			}
		}
	}
});
