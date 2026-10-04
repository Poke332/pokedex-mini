// S1 regression — doubles "no-substitute": a P1 party that can field only a
// couple of mons in gen9doublesou (no bench to switch into a fainted active).
//
// The card's symptom: when P1's 2nd active faints and there is NO legal bench
// for the forced-switch slot, the service got stuck — the move-state token
// emitted 'move' for a fainted active slot, so the sim rejected P1's choice
// ("You sent more choices than unfainted Pokémon") and the battle never ended
// (battleOver stayed false forever; a client retry then re-created the room
// and saw a 422/500). The natural sim outcome for "you have no Pokémon left to
// field" is that the OPPONENT wins (checkWin), so the correct terminal state
// is a clean battleOver=true envelope with the opponent as winner — not a
// stall/error.
//
// P1 here is a 2-mon team: both mons fielded as actives, so the bench is
// EMPTY. P2 is a full 6-mon team. We play to a bounded step budget and assert
// the battle RESOLVES (battleOver, concrete winner) rather than stalling.
//
// Before the fix this test RED: the loop burns the guard and battleOver is
// still false. After the fix it GREEN: a concrete winner (P2, index 1) lands.

import test from 'node:test';
import assert from 'node:assert';

import { handle, dispatch, rooms } from '../src/router.js';

const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

// No-bench P1: exactly 2 mons, both become active in doubles.
const P1_NOBENCH = [
    { species: 'garchomp', moves: ['earthquake', 'dragonclaw', 'stealthrock', 'outrage'], ability: 'roughskin', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'lifeorb', level: 100 },
    { species: 'tyranitar', moves: ['stoneedge', 'crunch', 'earthpower', 'stealthrock'], ability: 'sandstream', evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 4, spe: 252 }, ivs: IV, nature: 'hasty', item: 'assaultvest', level: 100 },
];
const P2_FULL = [
    { species: 'garchomp', moves: ['earthquake', 'dragonclaw', 'stealthrock', 'outrage'], ability: 'roughskin', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'lifeorb', level: 100 },
    { species: 'charizard', moves: ['flamethrower', 'dragonpulse', 'airslash', 'fireblast'], ability: 'blaze', evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 }, ivs: IV, nature: 'timid', item: 'choicescarf', level: 100 },
    { species: 'tyranitar', moves: ['stoneedge', 'crunch', 'earthpower', 'stealthrock'], ability: 'sandstream', evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 4, spe: 252 }, ivs: IV, nature: 'hasty', item: 'assaultvest', level: 100 },
    { species: 'gyarados', moves: ['waterfall', 'icefang', 'earthquake', 'dragonpulse'], ability: 'intimidate', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'blacksludge', level: 100 },
    { species: 'chandelure', moves: ['shadowball', 'willowisp', 'taunt', 'protect'], ability: 'flamebody', evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 252, spe: 4 }, ivs: IV, nature: 'modest', item: 'lifeorb', level: 100 },
    { species: 'terrakion', moves: ['closecombat', 'stoneedge', 'ironhead', 'rockslide'], ability: 'justified', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'lifeorb', level: 100 },
];

function nextChoice(env) {
    const cr = env.choiceRequest;
    if (cr.state === 'teampreview') return 'teampreview 0';
    if (cr.state === 'over' || cr.state === 'wait') return null;
    if (cr.state === 'switch') {
        // No bench: the only legal resolution is a forced pass, not a switch.
        return cr.canSwitch ? `switch ${cr.legalSwitches[0]}` : 'pass';
    }
    const legalMove = cr.legalMoves.find((m) => !m.disabled);
    if (legalMove) return `move ${legalMove.id}`;
    const sw = cr.legalSwitches[0];
    if (sw !== undefined && cr.canSwitch) return `switch ${sw}`;
    return 'move 0'; // auto-pick the live active (fainted slots auto-pass)
}

// Drive the no-bench battle to a TIGHT step budget. A healthy no-bench battle
// ends the moment P1's last active faints (a handful of sim turns), so a small
// bound is the sharp regression signal: the pre-fix token bug left the sim
// stuck in move-state (P1's choice rejected every round), so battleOver never
// became true and the loop simply burned the guard.
const BUDGET = 12;
function playNoBench(seed) {
    const c = handle('POST', '/battle', { format: 'gen9doublesou', p1Team: P1_NOBENCH, p2Team: P2_FULL, seed });
    assert.strictEqual(c.status, 200, 'no-bench doubles room creates (200)');
    const id = c.body.battleId;
    const room = rooms.get(id);
    let env = handle('POST', `/battle/${id}/choice`, { choice: 'teampreview 0' });
    let guard = 0;
    let sawError = null;
    while (!env.body.battleOver && guard < BUDGET) {
        const choice = nextChoice(env.body);
        if (choice === null) { env = dispatch('GET', `/battle/${id}`, {}); break; }
        const out = dispatch('POST', `/battle/${id}/choice`, { choice });
        if (out.status >= 400) { sawError = out.status; env = out; break; }
        env = out;
        guard++;
    }
    return { env, id, room, guard, sawError };
}

test('S1: no-bench doubles battle RESOLVES with the opponent as winner within a few turns', () => {
    const { env, room } = playNoBench('54321');
    assert.strictEqual(env.status, 200, 'every advance returned 200 (no 422/500): got ' + env.status);
    assert.ok(env.body.battleOver,
        `battle must end within ${BUDGET} advances; it stalled in move-state instead (sim stuck, the token bug)`);
    // P1 fielded no bench -> P1 cannot keep fielding; the natural sim result is
    // that P2 wins when P1's last active is gone (checkWin). Assert the exact
    // winner index in the terminal envelope.
    assert.strictEqual(env.body.winner, 1, 'P2 (the opponent) wins the no-bench battle');
    assert.strictEqual(env.body.choiceRequest.state, 'over');
    // A resolving battle ends fast — pin the root cause, not just "not 200".
    assert.ok(room.battle.turn <= BUDGET, `battle ended quickly (turn ${room.battle.turn} <= ${BUDGET})`);
    assert.strictEqual(room.battle.sides[0].pokemon.filter((p) => !p.fainted).length, 0, 'P1 has no Pokémon left to field');
});

test('S1: a no-bench advance never returns 422/500 and still terminates', () => {
    const { env, room, sawError } = playNoBench('999');
    assert.strictEqual(sawError, null, `no 4xx/5xx during the no-bench fight (saw ${sawError})`);
    assert.ok(env.body.battleOver, 'reaches a terminal envelope within the budget');
    assert.ok([0, 1].includes(env.body.winner), `concrete winner (got ${env.body.winner})`);
});
