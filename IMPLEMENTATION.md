# IMPLEMENTATION.md — Simulation Section (Party Building + Battle)

Status: LIVE — living plan for the `pokedex-mini` board's Simulation card chain.
Decision owner: user (ruling recorded in card C1 lineage).

§6 status-sync (C8): card states + commit SHAs.

| Card | Title | State | SHA |
|---|---|---|---|
| C1 | Design spec (/party + /battle) | Done | `b7ef7ac` |
| C2 | Shared-DTO contract (docs/simulation-dto.md) | Done | `df2352e` |
| C3 | Data lane — Showdown pokedex index | Done | `4d8b18e` |
| C4 | Sim service (pokemon-showdown BattleStream) | Done | `df0d945` |
| C5 | Party builder UI (/party) + nav | Done | `b1be6eb` |
| C6 | Battle UI (/battle) | Done | `21b8749` |
| C7 | QA gate (reviewer) | PASS (approved) | — (review; non-blocking finding logged: C3 tier-legal move-pool tightening) |
| C8 | Commit + draft PR refresh (this sync) | Done | this commit |

Last sync: this commit (C8).

## 1. Decision record

The Simulation nav section (currently empty in `src/components/Sidebar.jsx`) is built as
a **full-rules battle simulator + party builder** using the **`pokemon-showdown` Node
library as a backend service**.

- **Chosen: Option B** — a Node process wrapping `pokemon-showdown`'s `Sim.BattleStream`,
  exposed to the React SPA over an interactive one-turn-at-a-time API.
- **Rejected: Option A** — hand-rolled client-side `battle.js` (no abilities/status/items,
  approximate rules). Ruled out by the user in favor of authoritative Gen 1–9 rules.
- **Rejected: live online play** (SockJS to `sim3.psim.us`) — out of scope; "Simulation"
  means a local sim, not ranked play against the public server.

### Standing rules relaxed, on purpose (recorded so a reviewer doesn't flag them)
| Rule | Status | Why |
|---|---|---|
| No new npm libraries | **Relaxed (backend only)** | Backend service adds `pokemon-showdown`. The React SPA adds **no** new runtime deps — it still only fetches the service. Frontend `package.json` untouched. |
| Client-only + `localStorage` persistence | **Relaxed** | The app now talks to a separate Node service. Party/team state can still persist client-side; battle state lives in the service. |

These two relaxations are scoped to the Simulation feature. Encyclopedia pages keep the
existing PokeAPI + static-bulk architecture and gain no dependencies.

### Battle scope (v1)
Full team of **up to 6 Pokémon with switching** — i.e. standard singles: one active,
a bench of up to 5, switch affordances in the UI. Team data model = Showdown `PokemonSet[]`
so abilities, items, EVs, IVs, and nature are all legal inputs and the validator accepts
them. Default format: `gen9ou` (6-team singles, full movesets/abilities/items) — but the
format is a **parameter**, not hardcoded; any Showdown format id + its `TeamValidator`
works.

## 2. Architecture

```
React SPA (client-only)                Node service (NEW, separate process)
  /party  -> picks team, emits          Sim.BattleStream (pokemon-showdown)
  PokemonSet[]  -- pack ----->          >start {formatid}
  /battle -> drives one turn at a time  >player p1 {team} / p2 {team}
                                       >p1 move N / switch N  (per turn)
   ^                                      |
   |  clean JSON envelope per turn        |  reads back protocol lines,
   +--------------------------------------+  parses active HP / faints / move
     (HTTP + WS, one turn's worth)        effects / next choice request
```

- **Service owns the sim.** One `BattleStream` per battle room. Frontend sends a single
  choice; service advances the sim, returns only that turn's events + the next choice
  request. No full battle log shipped at once.
- **Service also owns team packing + validation.** `Teams.pack(team)` and
  `TeamValidator('<format>')` run here, so a team is legal **in Showdown's own dialect**
  before it reaches the sim (the sim itself does not validate teams).
- **Frontend stays client-only.** It fetches the service (same as it already fetches
  PokeAPI + static bulk files). New frontend code = 2 pages + a service client module; no
  new frontend deps.

## 3. Lanes & ownership (who builds what)

| Lane | Owner profile | Deliverable |
|---|---|---|
| Design doc (battle + party screens) | `uiux-designer` | Spec: single-active + bench layout, where the log lives, switch affordances, mobile 390px, how turn results render. Design only — no code. |
| **Shared-DTO contract** | `backend-dev` (authored), `frontend-coder` (signs) | One written contract, not prose: (a) team = `PokemonSet[]` exact field names/types, (b) per-turn envelope shape, (c) service endpoint list. This is the cross-boundary ruling — see §4. |
| Data lane | `backend-dev` | Runtime-fetch + index `play.pokemonshowdown.com/data/pokedex.json` (+ per-gen learnsets in `data/mods/*`) into a static source so the party builder shows **legal moves/abilities/items per tier in Showdown's dialect**. This is a *new data model* alongside PokeAPI — do not try to reconcile it with the existing PokeAPI pipeline. |
| Sim service | `backend-dev` | The Node service: `BattleStream` lifecycle, per-turn drive, envelope parsing, team pack/validate, room management. |
| Party builder UI | `frontend-coder` | `/party`: pick up to 6, assign moves/ability/item/level/IV/EVs, emit `PokemonSet[]`. Sourced from the data lane. |
| Battle UI | `frontend-coder` | `/battle`: team-preview order step (pick active from 6), per-turn move/switch buttons, HP bars, bench, battle log. Drives the service. |
| Nav | `frontend-coder` (folded into party card) | Two entries into the empty **Simulation** section of `NAV_SECTIONS` in `Sidebar.jsx`. |
| QA gate | `reviewer` | Verify against live service + live dev server; findings only, no fixes. |
| Commit / PR | `merge-arbiter` | Local-only commit; user merges. |

## 4. The shared-DTO risk (pre-flight — rule it before anyone builds)

The **team shape** and the **per-turn envelope** cross the frontend↔backend boundary.
This is the exact class of bug that silently breaks every downstream screen: if
`PokemonSet` field names/types or the turn envelope drift between what the service emits
and what the frontend renders, the party→pack→sim→log pipeline breaks with no error until
a page crashes.

**Before C3/C4 are dispatched, C2 must land a written contract** (a file, e.g.
`docs/simulation-dto.md`) pinning:
- Team = `PokemonSet[]` — the field set Showdown's `Teams` actually uses
  (species, moves, ability, item, level, evs, ivs, nature, hp/type/gen). Use `Teams.pack`
  round-trip as the source of truth, not hand-transcribed names.
- Per-turn envelope: exact JSON the service returns per choice — `{ active, bench, log[],
  choiceRequest { legalMoves[], legalSwitches[], rqid? }, battleOver?, winner? }`.
- Endpoint list: `POST /battle` (create), `POST /battle/:id/choice` (advance one turn),
  `GET /battle/:id` (state), `POST /team/validate`.

C3 and C4 both read from this file. If a screen needs a field not in the contract, it
gets added to the contract first (a ruling), not guessed at.

## 5. Out of scope for v1 (decided, not deferred-by-accident)
- Online/ladder play, replays, tournament features.
- Anything the `pokemon-showdown` sim does not itself model.
- Persisting battle history (client keeps party/team in `localStorage`; battles are
  ephemeral per session).

## 6. Card chain (manual dispatch, wired topologically — see board)

C1 design → C2 DTO contract → C3 data lane → C4 sim service → C5 party UI (+nav)
→ C6 battle UI → C7 reviewer gate → C8 commit/PR.

- C5 is parented on BOTH C3 (data) and C4 (service) so the party builder has legal-move
  data and a live service to validate against.
- C3 and C4 are serialized (both `backend-dev`, same repo tree) to avoid two backend
  workers racing one checkout — the data lane feeds the service's test fixtures anyway.
- Branch: one long-lived `feat/simulation` branch + one open draft PR; C3–C6 land on it,
  C8 refreshes the PR head. User merges at their chosen point.

## 7. Verification
- Service: run a seeded `gen9ou` battle to completion, assert a winner + turn count
  (the `end LOGDATA` message carries both).
- SPA: reviewer drives `/battle` on the live dev server (desktop + 390px), confirms
  switching, HP animation, log, and team-preview order step. No screenshot verdicts —
  the user judges visuals on the live server; reviewer does non-visual DOM/console checks.
