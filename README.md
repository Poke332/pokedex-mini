# pokedex-mini

A Pokemon companion SPA: browse Pokemon data via PokeAPI, build a legal team
for a chosen battle format (`#/party`), and run a deterministic battle against
a generated opponent (`#/battle`) — with an animated battle scene, move
targeting, and battle audio.

## Two deployables

| Deployable | What it is | Where it runs |
|---|---|---|
| Frontend | Vite React 19 SPA. `npm run build` -> static `dist/`. HashRouter (no server-side route rewrites needed). | Netlify |
| Sim service | `service/` tree — Node ESM service wrapping `pokemon-showdown` BattleStream. No build step; runs source. One battle room = one stream, driven one turn at a time over the C2 endpoint contract (`docs/simulation-dto.md`). | Render |

The SPA talks to the service in dev only via a relative `/sim/*` URL, proxied
by Vite. In production the SPA is built with `VITE_SIM_SERVICE` set to the
service's public URL.

## What's in the app

- **Browse pages** (`#/pokemon`, `#/type-advantage`, `#/berries`, `#/items`,
  `#/moves`, `#/machines`): pure PokeAPI client-side, no service needed.
- **Party builder** (`#/party`): legal team sets per battle format. Formats
  span Gen 5–9 (OU, Ubers, UU, Doubles OU, Monotype); the species picker shows
  only the selected generation's Pokemon (national-dex window), and each set
  editor gates moves/items/abilities to the format's generation with a 510-EV
  total cap. Form-gated transforms (Mega/Gigantamax) default to the base form
  and unlock only when the required held item is equipped. The team persists to
  versioned `localStorage`.
- **Battle** (`#/battle`): Let's-Go-style animated scene (turn indicator, HP
  plates, bench row, CSS attack/switch/faint animations, `prefers-reduced-motion`
  off-switch) with battle music, SFX, and switch-in cries. Singles and doubles:
  doubles renders two actives per side, move targeting, and a two-lead preview.
  The log shows human battle lines only (duplicates and protocol noise are
  filtered), and each move button's tooltip reports its type effectiveness
  against the active opponent. Held items are hidden on both plates.

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
