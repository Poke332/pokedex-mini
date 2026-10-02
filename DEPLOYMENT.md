# DEPLOYMENT.md — Netlify (frontend) + Render (sim service)

Deploy runbook for pokedex-mini. Two independent services:

- **Frontend** — the Vite React SPA, built to static `dist/`, hosted on **Netlify**.
- **Sim service** — the `service/` Node tree (pokemon-showdown BattleStream),
  hosted on **Render**. The SPA only talks to the service for battle/team
  validation (`#/party`, `#/battle`); everything else is client-side PokeAPI.

## Prereqs

- The GitHub repo `Poke332/pokedex-mini` (this repo, pushed to `main`).
- A **Render** account.
- A **Netlify** account.

## STEP A — Render (sim service)

Deploy the service **first** — you need its public URL before the frontend can
be configured.

1. Render dashboard -> **New** -> **Web Service**.
2. Connect the repo: `Poke332/pokedex-mini`, branch `main`.
3. Service settings:
   - **Root Directory**: `service`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
   - **Runtime**: Linux
   - Leave **Port** unset — Render injects `$PORT` automatically; the service
     reads it (`process.env.PORT || 4040` in `service/src/server.js`).
   - No environment variables are required for the service.
4. **Deploy.** After the deploy succeeds, copy the public URL
   (`https://<svc>.onrender.com`).
5. **Verify**: `curl https://<svc>.onrender.com/` — the service returns JSON
   (or a 404 JSON body with `Content-Type: application/json`), **not** HTML.
   A 404 JSON response is fine: it proves the Node process is serving, not a
   dead default page. Also check the response headers include
   `Access-Control-Allow-Origin: *`.
   > Note: the free Render plan spins idle services down; the first request
   > after idle may take a few seconds to cold-start.

## STEP B — Netlify (frontend)

1. Netlify -> **Add new site** -> **Import an existing project** -> GitHub,
   select `Poke332/pokedex-mini`, branch `main`.
   - `netlify.toml` at the repo root already sets:
     - Build command: `npm run build`
     - Publish directory: `dist`
     No [redirects] config is needed (HashRouter — `src/App.jsx`).
2. Set the env var that points the SPA at your Render service:
   - **Site settings -> Environment variables** -> add
     `VITE_SIM_SERVICE` = the Render public URL from STEP A
     (e.g. `https://<svc>.onrender.com`).
   - Vite inlines `VITE_*` vars at build time (`src/utils/simService.js`), so
     the URL is baked into the static bundle.
3. **Redeploy** (Rebuild site) so the build picks up the new env var — the
   first deploy happened before the var existed and would ship with an empty
   service base.
4. Open the deployed site URL.

## Deploy order (and why)

1. **Render first** (STEP A) — it has no dependencies and produces the URL.
2. **Netlify second** (STEP B) — its `VITE_SIM_SERVICE` env var needs that URL
   to have a real value.

Setting the Netlify var before the Render service exists just means the value
is dead until Render is up; the reverse means the SPA ships with no service.
Render-first avoids the broken state.

## End-to-end verification

On the deployed site:

1. Load `#/party` — build a team; team validation hits the service
   (`POST /sim/team/validate` in the network tab, cross-origin to Render).
2. Load `#/battle` — start a battle and advance at least one turn.
   This is the **only** path that hits the service:
   `POST /sim/battle`, then `POST /sim/battle/:id/choice` per turn
   (`GET /sim/battle/:id` on resync).
3. Confirm the battle progresses turn-by-turn and HP changes render.

All other pages (dex browsing, etc.) are pure client-side PokeAPI — no
backend involvement, no deploy dependency.

## LINK-CHANGES note

If the Render URL ever changes — service rename/recreate, moving to a custom
domain — **only the frontend changes**:

1. Update `VITE_SIM_SERVICE` in Netlify (Site settings -> Environment variables).
2. Rebuild/redeploy the Netlify site.

The service itself is link-blind: it never references or calls back to the
frontend, so no Render-side change is ever needed. A custom domain for the
service can be added later; it is **not** required for this deploy (the bare
`*.onrender.com` subdomain is sufficient and is what the env var points at
today).
