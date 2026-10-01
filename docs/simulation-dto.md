# Simulation DTO Contract — team + turn envelope + endpoints

C2 deliverable. This file is the cross-boundary ruling: C3/C4/C5/C6 read the exact
field names from here and must not guess. Ruling process: any field a screen needs
that is not in this contract gets added to this contract first (per IMPLEMENTATION.md §4).

Source of truth: `pokemon-showdown@0.11.11` (`sim/teams.ts` `PokemonSet` interface,
`Teams.pack`/`Teams.import`/`Teams.unpack` round-trip, `Side.getSwitchRequestData` /
`Side.getRequestData`, `Pokemon.getMoveRequestData` / `getMoves` / `getHealth`,
`TeamValidator.validateTeam`). Verified by running `Teams.import(export) -> Teams.pack`
against the shipped dist build, not by hand-transcription.

Conventions used below:
- **IDs** are lowercase Showdown ids (`charizard`, `flamethrower`, `choicescarf`, `timid`).
  Where a field carries a **pretty name**, it is the human-readable string the service
  resolves from the id (e.g. `Flamethrower`). The frontend renders names and submits ids.
- Omission rule: fields marked optional may be absent from JSON. `""` is used only where
  the source explicitly emits an empty string (e.g. `item` when no item).

---

## 1. Team = `PokemonSet[]`

An array of 1–6 sets. Exactly the fields `pokemon-showdown`'s `Teams` round-trip uses.
**All fields except `species`, `moves`, `level`, `ability` are optional; the rest have
the default the sim fills in, and omitting them is equivalent to sending the default.**

| Field | Type | Required | Default if omitted | Notes |
|---|---|---|---|---|
| `species` | string (id or name) | yes | — | e.g. `charizard`. Forme incl. suffix (`groudon-primal`? no — `groudon` with item; `mewtwo-y`). |
| `moves` | string[] (move ids, exactly 4 for legal formats) | yes | — | max 4. Order is slot order (slot 1 is the first). |
| `level` | number | no | `100` | 1–100 for play (sim clamps to 9999). |
| `ability` | string (ability id) | no | first listed ability of the species | e.g. `drought`. |
| `item` | string (item id, or `""` for none) | no | `""` | e.g. `choicescarf`. |
| `evs` | StatsTable | no | all `0` | `{hp, atk, def, spa, spd, spe}` each 0–252 (0–255 accepted). |
| `ivs` | StatsTable | no | all `31` | `{hp, atk, def, spa, spd, spe}` each 0–31. |
| `nature` | string (nature id) | no | `hardy` (neutral) | one of 25 ids, e.g. `timid`, `jolly`. |
| `gender` | `"M"` \| `"F"` \| `""` | no | species default | `""` = not set. |
| `name` | string | no | `species` | nickname; omit unless needed. |
| `happiness` | number | no | `255` | 0–255. |
| `shiny` | boolean | no | `false` | |
| `pokeball` | string (item id) | no | — | event-legality hint only. |
| `hpType` | string (type id) | no | — | Hidden Power type; optional Gen 7+. |
| `teraType` | string (type id) | no | — | Gen 9 only. |
| `dynamaxLevel` | number | no | `10` | 0–10. |
| `gigantamax` | boolean | no | `false` | |

`StatsTable` = `{ hp: number, atk: number, def: number, spa: number, spd: number, spe: number }`.

**`name` is NOT a wire field we depend on** — the sim keys Pokémon by `species` (id).
The frontend must not assume `name` round-trips identity; use `species`.

### 1.1 Minimal example team literal (the only shape C5 emits, C4 consumes)

```json
[
  {
    "species": "charizard",
    "moves": ["flamethrower", "dragonpulse", "surf", "roost"],
    "level": 100,
    "ability": "drought",
    "item": "choicescarf",
    "evs": { "hp": 0, "atk": 4, "def": 0, "spa": 252, "spd": 0, "spe": 252 },
    "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 },
    "nature": "timid"
  },
  {
    "species": "garchomp",
    "moves": ["earthquake", "dragonclaw", "swordsdance", "stealthrock"],
    "level": 100,
    "ability": "roughskin",
    "item": "lifeorb",
    "evs": { "hp": 0, "atk": 252, "def": 0, "spa": 0, "spd": 0, "spe": 252 },
    "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 },
    "nature": "jolly"
  }
]
```

### 1.2 Packed form (what actually reaches the sim)

The service does `Teams.pack(team)` → a single string, and feeds it to the sim via
`>player p1 <packed>` / `>player p2 <packed>`. It is **lossy for defaults**: empty
fields collapse (`|`), omitted `evs`/`ivs` collapse, `level` 100 collapses, all-31 `ivs`
collapse. `Teams.unpack` restores defaults (iv→31, ev→0, level→100, happiness→255).
**The frontend never packs or unpacks.** Packing is service-owned. The packed string is
not part of this contract's wire API — it is an internal detail of `POST /battle`.
`Teams.pack(null)` returns `""` (no team).

---

## 2. Per-turn envelope

What the sim service returns **after one choice** (per `POST /battle/:id/choice`).
This is a normalized, machine-readable shape the service builds from the Showdown
protocol (`|request`, `|updateteam`, `|turn`, `|move`, `|faint`, `|win` lines).
The UI renders exactly these fields; it never parses the raw protocol.

```jsonc
{
  "active": [ ActiveMon ],        // exactly 1 for singles. Both sides? NO — see note.
  "bench":  [ BenchMon ],         // the caller's own remaining up-to-5 (lead omitted when active)
  "foe":    FoeMon | null,        // the opposing active (or null if foe fainted / not started)
  "log":    string[],             // that turn's protocol lines (display strings), most recent last
  "choiceRequest": { ... },       // what the caller may do next, or the wait/battleOver state
  "battleOver": boolean,
  "winner": number | null         // side index (0 = p1 = caller, 1 = p2) when battleOver
}
```

> `active` is an **array of length 1** for singles (the caller's active). The caller's
> bench and the opposing active are kept in separate fields so the UI plates map 1:1.
> If the caller's active just fainted and is awaiting a forced switch, `active` holds the
> now-fainted Pokémon until the switch choice is committed.

### 2.1 `ActiveMon` (caller's active)

```jsonc
{
  "ident":    "p1: charizard",      // side id + name (Showdown `ident`)
  "species":  "charizard",          // species id
  "name":     "Charizard",          // display name
  "details":  "Level 100 Charizard @ Choice Scarf",  // Showdown `details` (level, species, item)
  "condition": "100/100",          // HP + status, e.g. "73/100 par". See §2.4 condition grammar.
  "status":   "",                  // status id: "" | brk | par | psn | sleep | frz | toxic | flinch?
                                    // (flinch is a volatile, not a status; not in `status`)
  "moves": [ MoveEntry ],          // the 4 move slots, in slot order
  "position": 0                    // index within this side's team (lead = 0)
}
```

### 2.2 `MoveEntry`

```jsonc
{
  "id":      "flamethrower",       // move id
  "move":    "Flamethrower",       // display name (incl. "Hidden Power Fire" expansion)
  "type":    "fire",               // move type id (UI type badge)
  "category": "Special",           // "Physical" | "Special" | "Status" (UI damage-class chip)
  "pp":      12,                   // remaining PP (0–maxpp)
  "maxpp":   15,
  "target":  "normal",             // target spec: "normal" | "adjacentFoe" | ... | "self" | "randomNormal"
  "disabled": false,               // true → button greyed (e.g. 0 pp, or trapped-by-lock)
  "disabledReason": ""            // "" | "0pp" | "locked" | "taunt" | "healblock" (UI tooltip source)
}
```
`type`/`category` are resolved by the service from the move id via the same Gen dex the
data lane indexes (§4) — the UI does not fetch them separately.

### 2.3 `BenchMon` (caller's non-active team members, up to 5)

```jsonc
{
  "ident":    "p1: garchomp",
  "species":  "garchomp",
  "name":     "Garchomp",
  "details":  "Level 100 Garchomp @ Life Orb",
  "condition": "100/100",
  "status":   "",
  "position": 1                    // team index (0-based); `legalSwitches` references these
}
```

### 2.4 `FoeMon` (opposing active)

Same keys as `ActiveMon` **minus** `moves` (the UI does not render the foe's move slots).
Plus:
```jsonc
{
  "moves": null                    // omitted for the foe
}
```

**Condition grammar** (`condition` on every Mon, from `Pokemon.getHealth`):
`"<hp>/<maxhp>"` where each is `NN/100` in modern gens (percentage, `shared` view the
client gets), optionally followed by a space + status id. E.g. `"100/100"`, `"73/100 par"`,
`"0/100 fnt"` (fainted). HP fraction for the bar = `hp / maxhp` parsed from the two numbers.
Fainted is indicated by `condition` starting `0/` and/or `status`/the fainted log line.

### 2.5 `choiceRequest`

```jsonc
{
  "state": "move" | "teampreview" | "switch" | "wait" | "over",
  "rqid":  "1f2a3b4c",             // Showdown request id (opaque, echoed by the client)
  "legalMoves":   [ MoveEntry ],   // when state = "move" (for the caller's active); [] otherwise
  "legalSwitches": [ number ],    // team positions eligible to switch in; [] when not switchable
  "canSwitch":    false,           // bool convenience: legalSwitches.length > 0 && !trapped
  "trapped":      false,           // active is trapped (Switch button disabled reason)
  "reason": ""                    // switch-disabled reason when !canSwitch: "allbenchfainted" |
                                  // "trapped" | "busy" | "" 
}
```

State semantics (from `Side.activeRequest`):
- `"teampreview"` — battle start, pick the lead. `legalSwitches` = the full team
  positions (0..n-1), the choice is the lead index. This is the **preview phase** of /battle.
- `"move"` — normal turn. `legalMoves` = the active's 4 `MoveEntry` (§2.2).
- `"switch"` — forced switch (active fainted / was sent off). `legalSwitches` populated.
- `"wait"` — waiting on the opponent's simultaneous choice; caller has nothing to do.
- `"over"` — battle ended; no choices.

`rqid` is the protocol request id; the service includes it so the UI (and any logging)
can correlate. The client's choice is submitted as the protocol choice string (see §3.2).

### 2.6 `log`

`string[]` — the raw display lines for that turn, in order, most recent last. These are
the human-readable strings from the protocol (`Charizard used Flamethrower!`,
`Garchomp fainted!`, `The battle ended in a victory for Player 1!`). The service appends
them to an internal full log; the envelope returns only that turn's slice. Turn number
lives on the caller (it is the number of `choice` calls made + 1) — **do not add a
`turn` field**; the preview turn is 0.

### 2.7 `battleOver` / `winner`

- `battleOver: boolean` — true when the sim emitted `|win`.
- `winner: 0 | 1 | null` — `0` = caller (p1) won, `1` = foe (p2) won, `null` when not
  over. Draw (both faint) is not modeled in v1 singles; treat as the side that fainted
  last by the win line, otherwise `0`.

**End-state payload (the last envelope, when `battleOver` true):**
```jsonc
{
  "active": [], "bench": [ ... ], "foe": null,
  "log": [ "The battle ended in a victory for Player 1!" ],
  "choiceRequest": { "state": "over", "rqid": "...", "legalMoves": [], "legalSwitches": [], "canSwitch": false, "trapped": false, "reason": "" },
  "battleOver": true,
  "winner": 0
}
```
The end card's "Turns: N" is `caller's choice count` — the UI tracks this client-side
(it is not a service field).

---

## 3. Endpoints

All JSON over HTTP. Base is the sim service root (same-origin proxy in dev). All
endpoint bodies below are **normalized** (the §1/§2 shapes), not raw protocol.

### 3.1 `POST /battle` — create a battle room

```jsonc
// request
{
  "format": "gen9ou",                 // Showdown format id; parameter, not hardcoded
  "p1Team": [ PokemonSet ],          // caller's team (§1)
  "p2Team": [ PokemonSet ]           // opposing team (preset per format, see C4)
}
// response 200
{
  "battleId": "b_3f9a1c",
  "format":   "gen9ou",
  "turn":     0,                     // preview turn; 0 choices consumed
  "log":      [ ... ],               // team-preview protocol lines
  "choiceRequest": {                 // state = "teampreview", lead-pick (§2.5)
    "state": "teampreview", "rqid": "...",
    "legalMoves": [], "legalSwitches": [0,1,2,3,4,5],
    "canSwitch": false, "trapped": false, "reason": ""
  },
  "battleOver": false, "winner": null
}
// 400 { "error": "invalid team", "problems": [ ...validator problems... ] }
// 422 when TeamValidator rejects a team.
```

### 3.2 `POST /battle/:id/choice` — advance one turn

```jsonc
// request
{ "choice": "move flamethrower" | "switch 1" | "teampreview 2" }
// response 200 → the §2 envelope
```

`choice` is the Showdown choice string for the caller's side:
- team preview: `teampreview <index>` (lead index 0–5)
- move: `move <moveid>`
- switch: `switch <teamPosition>` (position into the caller's team array)

The service advances the sim by the caller's choice **plus** the opponent's auto-
responding choice, then returns the full §2 envelope for that turn.

- `409 { "error": "not your turn" }` when `choiceRequest.state` is not a caller-choice
  state (e.g. `"wait"` with a pending simultaneous choice, or `"over"`).
- `404 { "error": "battle not found" }` when the room id is unknown/expired.

### 3.3 `GET /battle/:id` — state

Returns the **current** §2 envelope (the last-computed one after the latest choice), so
a client that missed the post (or reloaded) can resync. Body shape is identical to the
`choice` response. `404` when the room is gone.

### 3.4 `POST /team/validate` — validate a team in a format

```jsonc
// request
{ "format": "gen9ou", "team": [ PokemonSet ] }
// response 200
{ "valid": true,  "problems": [] }
// or
{ "valid": false, "problems": [ "Charizard: It is not legal in Gen 9 OU (Banned).",
                                "Garchomp: Moves: 'Earthquake' is not legal in Gen 9 OU." ] }
```
Backed by `TeamValidator('<format>').validateTeam(team)`. `problems` is the validator's
flat list of human strings; `valid` = `problems.length === 0`. `400` on malformed team.

---

## 4. Data-lane export shape (party builder source — C3)

The indexed record the **party builder** consumes to render legal moves/abilities/items
per tier, in Showdown's dialect. Keyed by **species id + format id**. This is a *new data
model* alongside PokeAPI — do not reconcile with the existing PokeAPI pipeline.

```jsonc
{
  "charizard": {
    "gen9ou": {
      "species":  "Charizard",        // display
      "dexNum":   6,                  // national dex (UI shows # in red-600)
      "types":    ["fire", "flying"], // 1–2 type ids
      "abilities":[                    // up to 3; index 0 = default
        { "id": "blaze",      "name": "Blaze",      "default": true },
        { "id": "drought",    "name": "Drought",    "default": false },
        { "id": "solarpower", "name": "Solar Power", "default": false }
      ],
      "moves": [                       // legal move ids for this species+gen+format
        { "id": "flamethrower", "name": "Flamethrower", "type": "fire",
          "category": "Special", "power": 90 }
      ],
      "items":   ["choicescarf", "lifeorb", "wikiberry", "" ],  // "" = "No item"
      "levelRange": { "min": 5, "max": 100 },
      "natures":  ["hardy","timid","jolly","modest","adamant"] /* …full available set for species+gen, Showdown ids */
    }
  }
}
```

- The SetEditor's 4 move pickers are sourced from `moves[]` (legal for species+format).
  Each move record carries `type` + `category` so the editor renders the move's
  type badge + damage-class chip without a second fetch (C1 §2.2).
- `abilities[]` drives the ability select (up to 3, first = default). The `default: true`
  flag is what C1's "signature" badge renders against — the UI marks the default-listed
  ability, not a literal "signature" string.
- `items[]` drives the item select (leading `""` = "No item").
- `natures: string[]` is the set of nature ids available for that species in that
  generation (empty = any of the 25). C1's "18 natures" picker renders the useful
  subset; the authoritative list is this array — do not hardcode.
- `levelRange` bounds the level number input (C1 §2.2 default 100, range 5–100).
- All lists are the **validator-legal** set for that tier — the authoritative source is
  the format's `TeamValidator` + the species' Gen-9 pokedex/moves/learnsets, pre-indexed
  by C3. A field a screen needs that is not here is a C2 amendment, not a guess.

---

## 5. What is NOT pinned here (belongs to C4/C5/C6)

- Opposing-team source (preset vs random) — OD-1, tabled at the sign-off gate.
- Any animation/timing, HP-bar thresholds, toast copy, or layout — those are UI
  decisions in C5/C6 reading this envelope, not new fields.
- Replays / persisted history — out of scope v1.

If a screen needs a field that is not in §1–§4, **stop and add it to this file first**
(ruling), then build. This is the only legal way the field set grows.
