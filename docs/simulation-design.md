# Simulation Design Spec — /party & /battle

Card: C1 (design only — no implementation code, no service scaffolding).
Grounding: `IMPLEMENTATION.md` (Option B, pokemon-showdown service, full team of 6 with
switching, `gen9ou` default, format is a parameter).
Dependency: the DTO contract card C2 (`docs/simulation-dto.md`) pins exact field names.
This spec designs to the **abstract shape** only — see §0. Do not hardcode field names
in UI components; C2 owns them.

Status: DRAFT — open decisions (§5) go to the sign-off gate before C5/C6 implementation.

---

## 0. Scope and data shape (abstract)

Everything below assumes:

- Team = a list of up to 6 sets. Each set conceptually carries: species, moves (4),
  ability, item (optional), level, IVs, EVs, nature, plus HP/type/gen metadata as
  needed by the sim.
- Per turn, the service answers with: the active Pokémon (both sides), the bench, the
  log entries for that turn, a choice request (which moves are legal, whether
  switching is legal), and a battle-over flag with winner when the battle ends.
- Format is a parameter; the UI treats it as a single selector value (default `gen9ou`).

**The UI never speaks the protocol directly** — it renders whatever C2's envelope
carries. This spec defines what that data *means* on screen, not its key names.

---

## 1. Design tokens (established pokedex system)

| Token | Value | Use |
|---|---|---|
| Page canvas | `bg-neutral-50` | Every page's `<main>` |
| Card | `bg-white border border-neutral-200 rounded-lg` | All panels: slots, editor, arena, log |
| Structure | `blue-800` | Header band bg, active nav, section titles, focus targets |
| Action accent | `red-600` | Primary buttons, dex numbers, focus ring, validation error |
| Type badges | existing `TypeBadge` | Everywhere a type is shown |
| Crisp text | `font-semibold` headings, `text-sm`/`text-xs` body, `tracking-tight` titles | No heavy rounding anywhere; corner radius capped at `rounded-lg` |
| Touch target | `min-h-11` (44px) | All buttons/inputs (project convention) |
| Breakpoints | 1 col mobile · 2 at `md:` · 3 at `lg:` | Grid convention; **mobile min 390px** |

Existing `ViewCard` uses `rounded-xl`; do **not** retrofit it. New simulation
components use `rounded-lg` per the card ruling.

---

## 2. /party — Team Builder

### 2.1 Page layout

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER BAND (blue-800, border-b-4 red-600)                  │
│  "Party Builder" · Format selector [gen9ou ▾] · Team 3/6   │
├──────────────────────────────────────────────────────────────┤
│  [set editor card — visible only when a slot is selected]    │
├──────────────────────────────────────────────────────────────┤
│  TEAM GRID — 6 slots, 1 col / md 2 / lg 3                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ sprite      │ │ sprite      │ │  dashed      │            │
│  │ #25 Charz.  │ │ #6 Pika.    │ │  empty slot  │            │
│  │ [Fire][Flying]│ │ [Electric] │ │  + Add       │            │
│  │ 4 moves · Sit│ │ 3 moves ⚠   │ │              │            │
│  │ [Edit][Remove]│ │ [Edit][Remove]│             │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
├──────────────────────────────────────────────────────────────┤
│  ADD TO PARTY                                                │
│  [SearchBar — reuses existing component]                     │
│  candidate grid (ViewCard layout + red "Add" button)         │
│  ← Prev · Page 1 of N · Next → (existing pagination row)     │
├──────────────────────────────────────────────────────────────┤
│  [ Start Battle ] (red-600, disabled until team ≥ 1)         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Components

**EmptySlotCard.** Dashed `border-neutral-300`, centered "+ Add Pokémon" ghost
button that scrolls the page to the search section and focuses the search input.
No other content.

**FilledSlotCard.** Sprite (existing sprite URL convention), `#<dex>` in
`red-600 text-xs font-semibold`, name in `neutral-900 font-semibold`, type badges
in a row, then a compact two-line summary:
`Moves: 2 of 4` (or the 4 move names, truncated with ellipsis) and
`Ability · Item · Lv.`. Footer: `Edit` (blue outline) and `Remove` (red outline)
buttons, both `min-h-9` is too small — keep `min-h-11`.
Set-completeness signal: if a set is missing moves or its moves are not all legal
in the current format, show an amber `⚠ n unresolved` chip on the card. No green
checkmark — "no warnings" is the resting state.

**CandidateCard.** ViewCard geometry (sprite, dex #, name, type badges) with the
card body ending in a red-600 `Add` button spanning the card width. `Add` is
disabled (opacity-40) when the party is full (6/6). Adding a species already in
the party is allowed (two of the same is legal in Showdown) — the button stays
enabled; the card shows a small `×2 in party` note when applicable.

**SetEditor (one instance, opened by `Edit`).** A full-width card inserted above
the team grid. Fields:

| Field | Control | Notes |
|---|---|---|
| Moves (4) | 4 rows, each a picker of legal moves for species + generation + format (options sourced by the C3 data lane) | Each row: index chip (`1`–`4` in `neutral-200` rounded-lg), move name, type badge, damage class chip. Picker = searchable select; rows are independent (duplicates allowed — legality is the service's call) |
| Ability | Select (species's available abilities, up to 3 with a badge showing "signature") | Defaults to the first listed |
| Item | Select with a leading "No item" entry | |
| Level | Number input 5–100, default `100` | |
| Natures | Select (18 natures) | Default "Hardy" (neutral) |
| IVs | 6 selects (0–31) in a 2×3 grid | Preset buttons: `31s` `0s` (mark which preset is active) |
| EVs | 6 number inputs (0–252) in a 2×3 grid + a `Total: n/252` line | Total line turns `red-600` when > 252 — hint only; the service validator is the authority (OD-3) |

Editor header: species sprite + name, and a `Done` (red-600) button that closes
and saves into the slot. `Cancel` (neutral outline) discards without saving.
On `md+` the editor is two-column internally (moves left, rest right); at
390px it stacks in one column.

### 2.3 States

- **Empty team (0 slots):** the team grid renders 6 empty slots; the Add
  section is moved above the grid (swap order) with the heading
  "Search for your first Pokémon". `Start Battle` disabled, helper line
  "Add at least 1 Pokémon".
- **Loading legal moves (per-selected-species data lane fetch):** the 4 move
  pickers show a skeleton row (gray shimmer bar, `neutral-100`) and are disabled;
  everything else in the editor is usable.
- **Data-lane error:** banner card at the top of the page: red-600 border-l-4,
  "Could not load legal move data — retry" with a retry button. Search remains
  functional (picking species still works; configuring moves is deferred).
- **Format change:** if the selected format is dropped from the page, sets that
  contain moves/items now illegal are marked with the `⚠` chip (§2.2). The
  service validator is final — the chip is advisory.
- **Persistence:** team state persists to `localStorage` (IMPLEMENTATION.md §5);
  on load, restore silently — no "restored" toast.

### 2.4 Accessibility (/party)

- Every SetEditor field has a visible label; selects expose `aria-label` naming
  the Pokémon + field (e.g. "Charizard, move 2").
- Opening the editor moves focus to the editor's first field; `Done`/`Cancel`
  restore focus to the slot card's `Edit` button.
- Slot additions/removals announce via an `aria-live="polite"` status line in
  the header band ("Team 4 of 6").
- All interactive targets ≥ 44px tall; focus ring is the project standard
  (`focus-visible:ring-2 ring-red-600`).
- No color-only signaling: the `⚠` chip carries text, not just hue.

### 2.5 Mobile 390px (/party)

- Header band: title row + format selector on one row; team count on a second row.
- Team grid: single column, cards full-width. SetEditor expands inline below the
  selected slot card (accordion) instead of inserting above the grid — at 390px
  the top-inserted editor would scroll the user off their slot.
- Candidate grid: single column (2-up would be 432px incl. gaps > 390).
- `Start Battle` becomes a full-width sticky footer button (safe-area padded) so
  it is always reachable while scrolling; it does not cover content (content gets
  bottom padding = button height).
- No horizontal scroll anywhere; the pagination row wraps to a centered
  three-item row at 390px.

---

## 3. /battle

Two sub-phases on the same route: **Preview** (pick the lead) and **Battle**
(the fight itself). Plus the **End** state.

### 3.1 Phase — Team Preview (lead selection)

Reached by navigating to /battle (or `Start Battle` from /party).

```
┌──────────────────────────────────────────────────────────┐
│ HEADER BAND: "Battle — choose your lead" + format badge  │
├──────────────────────────────────────────────────────────┤
│ GRID of the 6 team cards (1 / md 2 / lg 3)               │
│  card = sprite, #dex, name, types, move count, level    │
│  tap → card gains red-600 ring-2 (selection state)      │
├──────────────────────────────────────────────────────────┤
│ [ Start Battle ]  red-600, disabled until a lead is set  │
│ helper: "Your lead acts first in the opening turn"      │
└──────────────────────────────────────────────────────────┘
```

- Exactly one card selected at a time; re-tapping the selected card deselects.
- On 390px: cards are single-column; selection state is ring **and** a "LEAD"
  chip in the card's top-right corner (color-only rings are hard to perceive at
  small size).
- `Start Battle` commits the lead and transitions to the battle view. There is
  no undo afterward (ephemeral battles, §3.4) — the helper line says so
  ("restarting the battle reshuffles this step").

### 3.2 Phase — Battle view

**Desktop layout (lg):** main column (arena + controls, fluid) and a fixed-width
side column (log, `w-80`, `sticky top-4`, its own scroll, max-height to
viewport). The log lives in the **right side column** on desktop.

```
┌────────────────────────────────┬─────────────────────────┐
│ TURN STRIP: "Turn 4 · Your move" │ BATTLE LOG (side col) │
├────────────────────────────────┤  auto-scroll, bottom-  │
│            ┌──────────────┐     │  anchored, aria-live   │
│    foe sprite+plate ──────┤ │  · Turn 4 · ...            │
│            └──────────────┘ │  · ...                     │
│                              │                            │
│ ┌──────────────┐             │                            │
│  your sprite+plate          │                            │
│ └──────────────┘             │                            │
├────────────────────────────────┴─────────────────────────┤
│ MOVES (2×2 grid)                    [ ⇄ SWITCH ]         │
│  [Move A · Fire] [Move B · Fire]                        │
│  [Move C · Flying][Move D · …]                          │
│ BENCH: [chip1][chip2][chip3][chip4][chip5]              │
└──────────────────────────────────────────────────────────┘
```

**Arena plates.** One card per active Pokémon (`bg-white border rounded-lg`):
sprite (clamped to `h-24` at 390, `h-32` on desktop), name + `#dex`
(red-600) + type badges, a status-condition icon row (burn/sleep/… each with a
tooltip on hover and an `aria-label`), and the **HP bar**:

- 8px-tall track (`neutral-100` rounded-full, same geometry as `StatBar`),
  filled proportionally; fill color: green-500 (≥ 50%), amber-400 (20–49%),
  `red-600` (< 20%). Functional colors outside the neutral/blue/red structural
  palette — flagged in OD-4.
- `role="progressbar"` with `aria-valuenow/min/max` and an `aria-label`
  ("Charizard, 340 of 512 HP"). Foe plate mirrors the same structure.
- Fainted plate: sprite grayscale + `opacity-50`, "Fainted" label, HP track
  empty.

**Move buttons.** 2×2 grid on desktop, `min-h-11`. Each button: move name
(`font-medium`), type badge, and (if shown — OD-6) a `PP 3/15` chip in
`text-xs text-neutral-500`. Fill: white card, 1px `neutral-200` border, red-600
hover fill — moves are *content*, not the primary action; the primary action
class (red fill) is reserved for battle-level commits (preview start, rematch).
Disabled state (illegal this turn — e.g. a move just used with no PP, or the
active is confused): `opacity-40`, cursor-not-allowed, **tooltip explaining why**
("No PP remaining"). While the service is processing the user's choice, all
buttons are disabled and the turn strip shows a spinner + "…".

**Switch affordance (must be obvious — design ruling, not OD).** A dedicated
`⇄ SWITCH` button, visually a class apart from the move buttons: solid
`blue-800` fill, white text, swap arrow icon, same `min-h-11` footprint,
positioned to the right of the move grid on desktop (row-aligned), **full-width
and directly below the move grid on mobile** (see §3.3). It is:

- enabled only when the service's choice request says switching is legal this
  turn (bench has a live Pokémon AND the active is not trapped);
- when disabled, tooltip: "Cannot switch — <reason: all bench fainted / trapped /
  busy effect>";
- tapping it reveals/enables the bench row: bench chips get the red focus ring
  on hover and the row gets a one-line instruction above it: "Choose a Pokémon
  to switch to". Tapping a chip commits the switch **immediately** (no
  confirmation dialog) and the turn proceeds; a toast ("Sent Pikachu to battle")
  confirms. Re-tapping SWITCH again collapses the bench back to passive display.

**Bench row.** Up to 5 chips in one horizontal row (desktop) — each: sprite
thumb (`h-8` rounded-lg, blue-50 bg like `ViewCard`), name, a 4px mini HP
bar under the name. States: passive (default), switchable (when SWITCH is
active — chips lift on hover, ring on focus), fainted (grayscale + "Fainted"
label, unselectable). The **lead's slot is omitted** (it's in the arena);
bench = the remaining up to 5.

**Battle log.** Right side column on desktop (`w-80` sticky, internal scroll,
bottom-anchored, `aria-live="polite"` so screen readers hear new entries
without the user scrolling). Rows: one line per event, `text-sm`;
faint events are `font-semibold` with the species name in red-600; turn
boundaries render as a hairline `border-t` divider with a "Turn N" label
(`text-xs uppercase tracking-wider text-neutral-500`). Auto-scroll: only when
the user is already at the bottom (standard chat scroller rule); otherwise a
floating "↓ new" pill appears at the log's bottom edge.

**Turn strip.** Thin bar above the arena: `Turn N · Your move` / `Turn N · …`
(service pending) / `Turn N · <foe> acted`. On mobile this strip also carries
the most recent log line (truncated) because the log itself is below (§3.3).

**End state (`battleOver`).** The arena + controls collapse into a single
centered card in the main column; the log side column remains visible (desktop)
so the full fight is still readable:

- Victory: `blue-800` band header "Victory", subtitle "Turns: N · Format: gen9ou".
- Defeat: `neutral-900` band header "Defeat" (red-600 text on the band), same
  subtitle.
- Buttons: `Rematch` (red-600 — same teams, re-run preview) and `Edit Party`
  (blue outline → /party). No replay/persist (out of scope, IMPLEMENTATION.md §5).
- On 390px the end card is full width, log above it in read order.

**Service error mid-battle.** Full-arena banner card (red-600 left border):
"Battle service unreachable — the battle state lives on the service and is lost.
[Retry]" — Retry re-runs preview with the same team (OD-8: no mid-battle
resume in v1).

### 3.3 Mobile 390px (battle)

```
Turn strip (with last-log line, truncated)
┌─────────────────────────────────────┐
│  [foe plate, centered]             │
│  [your plate, centered]            │
├─────────────────────────────────────┤
│ MOVES 2×2 (each min-h-11, gap-2)   │
│ [ ⇄ SWITCH full-width, blue-800 ]  │
│ BENCH: horizontal scroll-snap row  │
│   [chip][chip][chip]…  (peek 2nd)  │
├─────────────────────────────────────┤
│ BATTLE LOG (collapsed card:        │
│ "Battle Log — 42 entries [Expand]")│
└─────────────────────────────────────┘
```

- No side column; the log renders **below** everything, as a collapsed card
  showing its entry count with an expand toggle (OD-4 alternative considered:
  always-open — rejected for 390px: it pushes the controls off-screen every
  turn).
- Plates stack: foe plate then your plate, both `h-16` sprites, full width.
- Bench row is a horizontal scroll-snap strip (chips `w-24`, next chip peeks
  to signal scrollability); vertical space is the scarce resource at 390px.
- The turn strip is sticky top so "Your move" is never lost between scrolling
  the bench and the log.
- Clipping check targets: the 2×2 move grid + full-width switch fit inside
  `390 − 2×16px` padding without horizontal scroll; bench chip peek is ≤ 1 chip.

### 3.4 States (battle)

| State | Rendering |
|---|---|
| Service connecting (battle create) | Arena skeleton (plates shimmer, controls disabled), turn strip "Connecting…" |
| Your choice pending | All move buttons + switch disabled, spinner in turn strip, double-submit impossible |
| Foe choice revealed | Foe plate animates (single 150ms nudge), log appends |
| Active fainted (your side) | Plate → fainted state; if bench remains and auto-… no auto-switch: choice request offers switch-or-move per sim; if only bench remains playable, controls show switch-only (OD-9) |
| battleOver | End card (§3.2) |
| Service offline | Banner + Retry (§3.2) |
| Leaving the page mid-battle | No confirmation dialog in v1 (ephemeral — OD-8), header band gains a small "abandon" indicator if re-entered |

### 3.5 Accessibility (battle)

- HP bars: `progressbar` semantics (§3.2); delta changes announced via
  `aria-live="polite"` region tied to the log (one source of truth).
- Move buttons announce type + damage class in `aria-label`
  ("Flamethrower, fire, special").
- Switch button's enabled/disabled reason is in `aria-label`, not just tooltip
  (tooltips are pointer-only).
- End state: the card is announced (`role="alert"` for defeat, `status` for
  victory) so screen-reader users don't have to hunt for the result.
- Focus order: turn strip → moves → switch → bench → log (desktop); bench and
  log follow in DOM order on mobile.

---

## 4. Navigation handoff note (for the C5 lane, not this card)

Two items enter the empty Simulation section of `NAV_SECTIONS`:
`{ to: "/party", label: "Party" }`, `{ to: "/battle", label: "Battle" }`.
`/battle` without an active battle shows the preview phase (§3.1).

---

## 5. Open design decisions (sign-off gate)

| # | Decision | Default in this spec | Alternative |
|---|---|---|---|
| OD-1 | Opposing team source | Preset team per format, shown in preview | Random legal team generated server-side |
| OD-2 | IV/EV editor defaults | IVs default 31s, EVs default 0/0/0/0/0/0, presets `31s`/`0s` | Per-nature recommended presets (heavier data lane) |
| OD-3 | EV cap enforcement | Hint-only in UI; service validator is authority | Hard UI block at 252 |
| OD-4 | Log on mobile | Collapsed card with entry count + expand | Always-open below bench |
| OD-5 | HP bar colors | green-500/amber-400/red-600 (functional, outside structural palette) | Neutral-filled bar + text % only |
| OD-6 | Move PP display | Show `PP n/15` chip on move buttons | Hide PP (cleaner buttons, less state) |
| OD-7 | Switch confirmation | Immediate commit on chip tap + toast | Two-step (tap chip → "Confirm switch" bar) |
| OD-8 | Leaving mid-battle | No confirm dialog; battle is lost | Confirm dialog naming what's lost |
| OD-9 | All-bench-fainted / no move | Switch-only control state (moves disabled) | Auto end-turn semantics per sim |

Sign-off gate resolves these before C5 (party UI) and C6 (battle UI) start;
any field a screen needs that isn't in C2's contract gets added to the
contract first (ruling), per IMPLEMENTATION.md §4.

---

## 6. What is NOT in this spec

- `PokemonSet` / turn-envelope field names, types, endpoint shapes — C2
  (`docs/simulation-dto.md`). This spec references them abstractly.
- Legal-moves data pipeline — C3. The SetEditor assumes it exists and renders
  whatever options arrive, tagged per species + generation + format.
- Sim service behavior — C4. This spec assumes the per-turn envelope described
  abstractly in §0.
- Wireframes above are layout intent, not pixel specs: final class choices come
  from the token table (§1), which is the project's established system.

## 7. Verification notes (for the C7 gate)

- Desktop: gutter balance of main column + `w-80` log column at lg (no orphan
  gutter > 24px on either side of the arena).
- Mobile 390px: no horizontal scroll on either screen; move 2×2 grid + switch
  row fit within `390 − 32px` padding; bench peek ≤ 1 chip; sticky turn strip
  does not overlap the log card on expand.
- Interaction pass: switch affordance discoverable in under 5s by a new user
  (adversarial-ux-test at implementation time, not this card).
- A11y pass: focus order §3.5, progressbar + live-region announcements, all
  targets ≥ 44px.
- This card ships the spec document only; no mockups rendered. Visual verdicts
  happen on the live dev server during C7.
