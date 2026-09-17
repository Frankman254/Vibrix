# API server

Two endpoints groups, both of which exist because they cannot safely live in
the browser.

| Route                       | Holds                   | Client                                                |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| `POST /api/ai/scene-intent` | The Anthropic key       | `src/features/aiDirector/client/sceneIntentClient.ts` |
| `/api/projects/*`           | The database credential | `src/lib/sync/remoteSyncRepository.ts`                |

## The rule that shapes everything here

**Anything prefixed `VITE_` is compiled into the browser bundle and is
therefore public.** The Anthropic key and `DATABASE_URL` live in this server's
environment and are never sent to the client — which is the whole reason this
process exists.

## Run it

```bash
cd backend && docker compose up -d      # Postgres, applies schema on first boot
cd server && npm install
cp .env.example .env                    # fill in ANTHROPIC_API_KEY
node --env-file=.env src/index.mjs
```

The Vite dev server proxies `/api` to `http://localhost:8787`, so the app talks
to it same-origin with no configuration.

Check what came up:

```bash
curl -s localhost:8787/api/health
```

Each capability is independent. Without `ANTHROPIC_API_KEY` the scene endpoint
returns 503 and the app falls back to its offline heuristic — which is a
supported mode, not a broken one. Without `DATABASE_URL` the sync routes are
not mounted at all.

## Scene intents — hosted or local

The provider is pluggable and all three implement the same small interface, so
the route never learns which one ran.

| `LWAG_AI_PROVIDER` | Needs                              | Notes                                                                  |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| `ollama`           | A local Ollama and a pulled model  | No key, no quota, no network                                           |
| `openai`           | `OPENAI_BASE_URL` + `OPENAI_MODEL` | Any OpenAI-compatible server: vLLM, LM Studio, llama.cpp, Ollama `/v1` |
| `anthropic`        | `ANTHROPIC_API_KEY`                | Best quality; costs money                                              |

Unset picks Anthropic when a key is present, then an OpenAI-compatible server
when `OPENAI_BASE_URL` + `OPENAI_MODEL` are set, and falls back to local Ollama.
`LWAG_ALLOWED_ORIGIN` is a comma-separated list; `*` reflects any origin.

### Running fully local

```bash
ollama serve            # usually already running
ollama pull qwen3:8b
LWAG_AI_PROVIDER=ollama OLLAMA_MODEL=qwen3:8b node src/index.mjs
```

`GET /api/health` reports whether the runtime is up and the model is pulled.

This works better than it sounds because the model only authors a ~15-field
`SceneIntent` — an 8B model handles that, and Ollama enforces the JSON Schema
through its `format` parameter rather than the prompt asking nicely. Measured on
an M3 Pro with `qwen3:8b`: **~10 s per call**, so a 200-image pool clustered
into 8 groups costs about 80 seconds, once.

**A vision model is optional.** The signature already carries the palette,
brightness, contrast, detail density and the pixel-art flag, so a text-only
model has enough to work with. Set `OLLAMA_VISION=1` only if the configured
model actually accepts images — text-only models reject them.

**Small models get scales wrong.** `qwen3:8b` answers the 0..1 axes as
percentages (`energy: 30`) no matter how explicitly the prompt says otherwise.
The client's validator recovers this deterministically rather than trusting the
model to comply — see `PERCENT_SCALE_THRESHOLD` in `sceneIntent.ts`. Expect a
local model to need more hand-tuning in the intent editor than a hosted one;
that is what the editor is for.

## How it works

The client sends an image signature (plus a 256px rendition and an optional
free-text steer) and gets back a `SceneIntent` — about 15 fields. A
deterministic compiler on the client expands that into the ~190 store keys, so
the model never authors raw configuration and the prompt stays small.

Answers are cached in-process by signature hash plus prompt version, so a pool
of near-identical images does not pay per image. The cache is per-process:
restarting the server clears it, and multiple instances do not share it. Move
it to Redis before running more than one.

## Auth is a development stand-in

`LWAG_API_TOKENS` is a static list of bearer tokens, and the owner id is
derived from the token. **This is not a production identity system.** It exists
so the sync API can be exercised end to end without committing to a provider.

Replacing it means changing one function (`createAuth` in `src/index.mjs`) —
everything downstream only reads `req.ownerId`. Options, none of which are
picked here because the choice is yours:

- **Supabase** — use `auth.users` as the ownership source and verify its JWT.
- **Auth0 / Clerk** — verify the provider's JWT, map `sub` to `owner_id`.
- **Your own sessions** — a `users` table plus signed cookies.

## What is deliberately missing

- **Object storage.** The schema tracks asset metadata (hash, size, MIME type,
  storage path); the bytes belong in S3/Supabase Storage. Until that is chosen,
  `RemoteSyncRepository.getAsset` returns null and blobs stay in the client's
  local IndexedDB.
- **Rate limiting and quota.** The scene endpoint will happily forward every
  request it receives. Put a limiter in front of it before exposing it.
- **A canonical snapshot format.** Projects store the raw wallpaper state plus
  its `store_persist_version`, and the client migrates on read. That works, but
  `STORE_PERSIST_VERSION` moves every sprint — freeze a translating
  `projectSchemaVersion` before this serves more than one client build.
