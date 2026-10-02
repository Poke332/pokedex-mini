// C4 sim service — per-turn envelope builders (docs/simulation-dto.md §2).
//
// Everything is derived from the LIVE battle object (`stream.battle`) plus the
// battle's dex (source of truth for move type/category and item display names).
// The UI never parses raw protocol; it renders exactly these §2 shapes.
//
// Convention (C2 §0): ids are lowercase Showdown ids; where a field carries a
// pretty name it is resolved from the id here — the service owns that resolution.

// §2.2 MoveEntry. `m` is one of `getMoveRequestData().moves[]` — the raw Showdown
// request move ({move (display), id, pp, maxpp, target, disabled}). type/category
// are resolved from the move id via the battle dex (C2 §2.2 note: "the service
// resolves them from the move id via the same Gen dex the data lane indexes").
export function moveEntry(m, dex) {
    const md = m.id ? dex.moves.get(m.id) : null;
    let disabledReason = '';
    if (m.disabled) disabledReason = m.pp === 0 ? '0pp' : 'locked';
    return {
        id: m.id,
        move: m.move,
        type: md ? String(md.type).toLowerCase() : null,
        category: md ? md.category : null,
        pp: m.pp,
        maxpp: m.maxpp,
        target: m.target,
        disabled: !!m.disabled,
        disabledReason,
    };
}

// "Level <lvl> <Species> @ <Item>" — the C2 §2.1 details value shape
// ("Level 100 Charizard @ Choice Scarf"). Item clause omitted when no item.
function detailsFor(p, dex) {
    const item = p.item ? dex.items.get(p.item) : null;
    const itName = item && item.name ? item.name : '';
    return `Level ${p.level} ${p.species.name}${itName ? ' @ ' + itName : ''}`;
}

// Common mon fields (ident/species/name/details/condition/status/position).
// `ident` = "<side id>: <species id>" (C2 §2.1 example: "p1: charizard").
function monBase(p, side, dex) {
    const health = p.getHealth();
    return {
        ident: `${side.id}: ${p.species.id}`,
        species: p.species.id,
        name: p.species.name,
        details: detailsFor(p, dex),
        condition: health.shared,
        status: p.status || '',
        position: p.position,
    };
}

// §2.1 ActiveMon — the caller's active (adds the 4 move slots).
export function activeMon(p, side, dex) {
    const req = p.getMoveRequestData();
    return { ...monBase(p, side, dex), moves: (req.moves || []).map((m) => moveEntry(m, dex)) };
}

// §2.3 BenchMon — a non-active team member.
export function benchMon(p, side, dex) {
    return monBase(p, side, dex);
}

// §2.4 FoeMon — the opposing active, same keys as ActiveMon minus moves
// (moves is null; the UI does not render the foe's move slots).
export function foeMon(p, side, dex) {
    return { ...benchMon(p, side, dex), moves: null };
}

// §2.5 choiceRequest. `side` is the CALLER's side (sides[0]); its
// `activeRequest` + `requestState` drive the state machine.
//   - "" (null activeRequest)      -> over
//   - { wait: true }              -> wait
//   - requestState teampreview    -> teampreview (lead pick)
//   - requestState switch         -> switch (forced)
//   - requestState move           -> move
export function choiceRequestFor(battle, side, dex, rqid) {
    const R = side.activeRequest;
    const cr = {
        state: 'over',
        rqid,
        legalMoves: [],
        legalSwitches: [],
        canSwitch: false,
        trapped: false,
        reason: '',
    };
    if (!battle.ended && R && R.wait) { cr.state = 'wait'; return cr; }
    if (battle.ended || !R) { cr.state = 'over'; return cr; }

    const rs = side.requestState; // "teampreview" | "switch" | "move"
    const benchPositions = side.pokemon.filter((p) => !p.isActive && !p.fainted).map((p) => p.position);
    if (rs === 'teampreview') {
        cr.state = 'teampreview';
        cr.legalSwitches = side.pokemon.map((p) => p.position); // full team = lead pick
        cr.canSwitch = false;
        return cr;
    }
    if (rs === 'switch') {
        cr.state = 'switch';
        cr.legalSwitches = benchPositions;
        cr.canSwitch = benchPositions.length > 0;
        cr.reason = cr.canSwitch ? '' : 'allbenchfainted';
        return cr;
    }
    // move
    cr.state = 'move';
    const act = (R.active && R.active[0]) || null;
    cr.legalMoves = act ? (act.moves || []).map((m) => moveEntry(m, dex)) : [];
    cr.trapped = !!(act && act.trapped);
    cr.legalSwitches = cr.trapped ? [] : benchPositions;
    cr.canSwitch = cr.legalSwitches.length > 0 && !cr.trapped;
    cr.reason = cr.canSwitch ? '' : cr.trapped ? 'trapped' : 'allbenchfainted';
    return cr;
}

// §2 full envelope (no `log` — the room fills the per-turn slice). Caller's
// perspective = sides[0]. `winner` is the side INDEX (0 = caller/p1).
export function buildEnvelope(battle, rqid) {
    const p1 = battle.sides[0];
    const p2 = battle.sides[1];
    const dex = battle.dex;
    const over = battle.ended;

    let active;
    if (over) active = [];
    else active = p1.active.filter((p) => p).map((p) => activeMon(p, p1, dex));

    const bench = p1.pokemon.filter((p) => !p.isActive).map((p) => benchMon(p, p1, dex));

    const cr = choiceRequestFor(battle, p1, dex, rqid);
    // The caller's two foes in doubles: one FoeMon per p2 active slot, ordered
    // by position (empty slots skipped, same rule as `active` above). ADDITIVE
    // to the C2 §2 wire: `foe` stays `foes[0]` (singles: single element), so
    // every existing consumer keeps its shape.
    const foes = (!over && cr.state !== 'teampreview' && cr.state !== 'wait' && p2.active)
        ? p2.active.filter((p) => p).map((p) => foeMon(p, p2, dex))
        : [];
    const foe = foes[0] || null;

    let winner = null;
    if (over) {
        // Tie (winner === "") is not modeled in v1 singles -> the caller's side (0).
        winner = battle.winner === '' ? 0 : battle.sides.findIndex((s) => s.name === battle.winner);
        if (winner < 0 || winner > 1) winner = 0;
    }

    return {
        active,
        bench,
        foe,
        foes,
        log: [], // the room attaches that turn's slice
        choiceRequest: cr,
        battleOver: over,
        winner,
    };
}
