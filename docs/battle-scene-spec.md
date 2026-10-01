# Battle Scene Spec — Let's-Go-style arena layout + CSS animation states

Card: D2 (design doc only — no code. D3 implements §1–§4 as written.)
Grounding: `src/pages/BattlePage.jsx` + `src/components/battle/*` (C6, commit 21b8749)
and the C2 envelope contract (`docs/simulation-dto.md` §2). Reference: the Pokémon
Let's Go battle scene — top-center turn indicator, mirrored side plates, bench row,
animated attack/switch/faint/HP-drain.

Sprite reality check: this lane renders **static** PokeAPI PNGs
(`utils/api.js` `getSpriteUrl` → `sprites/pokemon/{dex}.png`; `battleSprites.js`
adds the silence fallback). PokeAPI's `sprites.other.animated.front_default` is null
for most species, so all motion is **CSS keyframes** — no new animation library,
no GIF asset pipeline, no service change.

Status: READY for D3.

---

## 1. Scene layout

### 1.1 Let's Go element → this app

| Let's Go element | This app | Ruling |
|---|---|---|
| Top-center "Turn N" indicator | Turn indicator surface (§1.2) | Restyle the existing turn strip into a centered pill; sticky in the arena column |
| Opponent side (top-right): trainer + bench + active plate | Foe plate + bench chips | No trainer sprites (§4). The plate carries identity (name, #dex, types, Lv) |
| Player side (bottom-left): trainer + bench + active plate | Your plate + bench chips | Same |
| Bench row of 6 icons (active = silhouette, rest = balls) | Bench row of up to **5** chips + 1 active plate | The C2 envelope omits the active mon from `bench` (§2.3); the active is the plate, so 5 chips + 1 plate = 6 slots. No silhouette/ball icon states |
| Animated attack/switch/faint frames | CSS `bs-*` keyframes (§2) | Keyed off envelope transitions (§2.3) |

Composition: the existing arena column **already** matches Let's Go's vertical mirror —
foe plate on top (mirrored via `direction: rtl` in `PokemonPlate`), your plate below,
controls beneath (§3.2 of C1). Keep this order at both breakpoints; D2 only restyles
the turn surface and adds motion.

### 1.2 Turn indicator surface

- **Mobile (390):** the existing sticky strip (`BattlePage` L453, `sticky top-0 z-10
  lg:static`) becomes a two-row strip:
  - Row 1: centered turn pill — `Turn N` in `rounded-full bg-blue-800 text-white
    px-3 py-1 text-xs font-semibold`, with the state label ("Your move" / "Waiting…" /
    "Choose a replacement") in `text-xs font-medium text-neutral-500` to its right.
  - Row 2: the existing `lastLogLine` (`lg:hidden` truncation stays), centered,
    `text-xs text-neutral-500`.
  - The strip stays `sticky top-0 z-10` — the pill is always visible while scrolling
    the bench/controls.
- **Desktop (lg, verified at 1312):** the strip becomes `static` (existing `lg:static`
  rule is kept but re-centered): the pill centers over the arena column
  (`flex justify-center`) with `lg:sticky lg:top-4` so it pins during scroll of the
  tall arena; the last-log row is dropped on desktop (the sticky right log column owns
  it). The pill is the `bs-turn-pulse` target (§2.1).

### 1.3 Side blocks

Per side, in render order (foe first, then yours):

- **Active plate** (`PokemonPlate`, unchanged content): 96×96 sprite box @390,
  128×128 @lg (existing `h-24 w-24 md:h-32 md:w-32`); name + #dex + type badges +
  status chip + `details` (Lv/item) line + `HpBar` (8px track, green/amber/red
  OD-5 thresholds). This *is* the Let's Go "active mon plate"; D2 changes nothing
  about its content — only the `bs-*` classes mount on it (§2).
- **Bench row** (existing `BenchChip` strip inside the control card): up to 5 chips
  (`w-24`, 32×32 sprite thumb, name, 4px mini HP bar), horizontal scroll-snap @390,
  `flex-wrap` inline @lg. Unchanged; it is the switch surface and the origin point
  for the switch-in animation (§2.1).

### 1.4 Breakpoint composition

| Surface | 390px | 1312px (lg) |
|---|---|---|
| Turn surface | sticky strip, pill + last-log row | centered pill, `lg:sticky lg:top-4`, no log row |
| Foe plate | full width, first in column | left column, first |
| Your plate | under foe plate | under foe plate |
| Controls (moves 2×2 + SWITCH + bench) | stacked under your plate | stacked under your plate |
| Log | collapsible card under controls (existing OD-4) | sticky right column, 20rem (existing, untouched) |

No page-level horizontal scroll at 390: the plate sprite boxes are fixed 96px, and
the only scrollable region is the bench container itself (existing `overflow-x-auto
snap-x`).

## 2. Animation states

All motion = `@keyframes` in one namespaced `bs-*` block appended to
`src/index.css` (Tailwind v4 file; no config change). A FX is a class toggled on a
plate, the turn pill, or the arena wrapper for its duration, then removed. No JS
state machine beyond the envelope diff (§2.3).

### 2.1 States

| Class | Target | Motion | Duration |
|---|---|---|---|
| `bs-attack` | attacker plate | lunge 0 → 4px toward foe → 0 (`--bs-dir` = +1 yours / −1 foe, so `translateX(calc(4px * var(--bs-dir)))`), plus a 100ms white-flash on the sprite box | 200ms |
| `bs-hit` | target plate | plate shake ±3px (`translateX`) + sprite-box background flicker (blue-50 → white ×2) | 150ms |
| — (HP drain) | target `HpBar` | no keyframe: the existing `transition-[width] duration-500 ease-out` *is* the drain; it fires the moment the new width renders on envelope commit | 500ms |
| `bs-switch-in` | incoming plate | opacity 0→1, `translateY(8px)`→0 (yours) / `-8px`→0 (foe), scale 0.95→1 | 300ms |
| `bs-faint` | fainted plate | grayscale 0→1, translateY 0→6px, opacity 1→0.5, `animation-fill-mode: forwards` — it lands exactly on the plate's existing fainted rest style (`opacity-50 grayscale`, `PokemonPlate` L57) | 300ms |
| `bs-turn-pulse` | turn pill + arena wrapper | pill scale 1→1.02→1; arena wrapper border `neutral-200`→`blue-200`→`neutral-200` | 200ms |
| `bs-status` | plate whose status chip just appeared | chip background flicker amber-100→amber-400 ×2; when a status is *removed*, no FX (chip simply unmounts) | 300ms |

Move-turn choreography (own move lands first, then the foe's counter):
`bs-turn-pulse` (0ms) → your `bs-attack` (0–200ms) → foe `bs-hit` at ~150ms + HP
drain running 500ms from the commit → foe `bs-attack` (200–400ms, staggered 200ms)
→ your `bs-hit`. Total window ≈ 950ms. The window starts on envelope commit; if the
service answers slower than the window, FX plays on render and is never cut short —
a new envelope supersedes pending removals (§2.3 rule 4).

### 2.2 Targeting

- **Attacker/target:** the new `|move|` lines in `env.log` carry ids
  `p1a: X` / `p2a: Y` (see `parseLogLine`'s `|move|` case in
  `utils/battleLog.js`). `p1a` = your side, `p2a` = the foe; map each line to the
  plate whose mon it names (match on `mon.name`; fall back to side-ident when the
  name does not resolve — e.g. mid-battle forme swap).
- **Faint:** new `|faint|` line → `bs-faint` on that mon's plate (both, on a
  double KO).
- **Switch-in:** `active[0].species` or `foe.species` differs from the previous
  envelope (a new `|switch|` / `|-switch|` line corroborates). The **incoming**
  plate runs `bs-switch-in`. The outgoing plate is not separately animated: React's
  key-swap unmounts it, so a `bs-switch-out` is an accepted limitation — skip it.
- **Status:** the status token in `condition` (C2 §2.4 grammar, `parseCondition`)
  appears vs the previous envelope → `bs-status` on that plate.

### 2.3 Trigger points (envelope diff, not polling)

`BattlePage.applyEnvelope(env)` runs on every new envelope (start, each
`POST /battle/:id/choice`, the `notYourTurn` resync). D3 adds a `prev` ref and, on
each transition, diffs `prev → env`:

1. Scan `env.log` (this envelope's new lines only): new `|turn|N` → queue
   `bs-turn-pulse`.
2. New `|move|` lines, in log order → queue attacker `bs-attack` + target
   `bs-hit` pairs, staggered 200ms apart.
3. `|switch|`/`|-switch|` lines or an active/foe species change → `bs-switch-in`
   on the incoming plate.
4. New `|faint|` lines → `bs-faint`. Run faints **last** in the queue so the
   fainted mon exits visibly.
5. Status-token appearance (per mon) → `bs-status`.

One-shot rule: each FX adds its class on the next frame, then
`setTimeout(duration)` removes it. A new envelope while a window is open supersedes
pending removals; re-adding the same class to the same element is a no-op, so races
cannot double-fire. While `busy` (the round-trip is in flight) plates are inert —
FX never predicts; it plays on commit, and the move/switch buttons re-enable on
commit, never "after the animation" (§5 last row).

### 2.4 Reduced motion

`@media (prefers-reduced-motion: reduce)` in `index.css`: every `bs-*` keyframe gets
`animation-duration: 0s` (classes remain harmless), the HP fill's
`transition-[width]` becomes `none` (instant drain — the state is still fully
readable), and the busy spinner's `animate-spin` is suppressed (the bordered dot
renders static). Motion is purely visual: the log, the progressbar semantics
(`HpBar` `role="progressbar"` + labels), and the state labels carry everything,
so reduced-motion users lose no information.

## 3. Hover / field rules

- No new modals and no hover cards on plates — a plate is not a button and gets no
  hover/focus treatment. The turn pill is not interactive (no focus state).
- Move tooltips are **D1's** surface (the `MoveButton` `title`/aria row, extended
  per D1) — this spec does not re-spec or override it.
- `BenchChip` hover-lift in the switchable state (existing `hover:-translate-y-0.5`)
  is unchanged; it coexists with `bs-switch-in` because they target different
  elements (the button vs the plate).
- Keyboard: no new focusable elements.

## 4. Scope boundary — explicitly out

- Log pane: `BattleLog` is untouched (sticky right column desktop, collapsible
  mobile, auto-scroll + "↓ new" pill all stay as C6 shipped).
- Team-preview grid: `TeamPreviewGrid` untouched.
- Service / DTO / `utils/*`: the C2 §2 envelope shape is the trigger source as-is;
  no field is requested.
- Trainer sprites / facing art: Let's Go's trainer + ball-bench is mapped to
  plate + chip bench (§1.1); adding art assets is out of scope.
- Audio, GIFs, any animated-frame asset pipeline.

## 5. Acceptance (D3 verifies on the dev server)

- Desktop 1312 and mobile 390 renders: no page-level horizontal scroll; turn pill
  centered; only the bench container scrolls at 390.
- One scripted move turn shows pulse → attack → hit → HP drain; a forced/voluntary
  switch shows the incoming plate's `bs-switch-in`; a faint settles into the
  existing grayscale/opacity-50 rest state.
- With `prefers-reduced-motion: reduce` emulated: zero movement, instant HP bar,
  full state readability.
- Choices are never gated by FX: move/switch buttons enable on envelope commit.

## Open questions for D3

1. Where the diff hook lives — `useBattleFx` inside `BattlePage` vs a new
   `src/utils/battleFx.js` helper (recommended: the hook, one file, no new util).
2. Double-move envelopes (foe counter-attacker acting in the same envelope, or a
   multi-hit move emitting several `|move|` lines): stagger per §2.1 (200ms) —
   confirm the stagger reads well before hardcoding.
3. `|move|` targeting fallback (§2.2): name-match first, side-ident fallback —
   acceptable, or should targeting be side-ident-only?
