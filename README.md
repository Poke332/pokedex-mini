# pokedex-mini

A Pokemon companion SPA: browse Pokemon via PokeAPI, build a battle team
(`#/party`), and run deterministic battles against a generated opponent
(`#/battle`).

## Two deployables

| Deployable | What it is | Where it runs |
|---|---|---|
| Frontend | Vite React 19 SPA. `npm run build` -> static `dist/`. HashRouter (no server-side route rewrites needed). | Netlify |
| Sim service | `service/` tree — Node ESM service wrapping `pokemon-showdown` BattleStream. No build step; runs source. Battle room = one stream, driven one turn at a time over the C2 endpoint contract (`docs/simulation-dto.md`). | Render |

The SPA talks to the service in dev only via a relative `/sim/*` URL, proxied
by Vite. In production the SPA is built with `VITE_SIM_SERVICE` set to the
service's public URL.

## Run locally

```bash
# frontend (default port 5173; Vite proxies /sim/* -> :4040, so dev is same-origin)
npm run dev

# sim service (default port 4040)
cd service && npm start
```

With both running, `#/party` and `#/battle` work fully in the browser; all
other pages are pure PokeAPI client-side and need no service.

Tests: `npm test` (root) and `cd service && npm test`.

## Deploy

For the Netlify + Render deploy runbook, see [DEPLOYMENT.md](./DEPLOYMENT.md).
