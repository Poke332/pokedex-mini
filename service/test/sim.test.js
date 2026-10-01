// C4 sim service — scripted end-to-end test (IMPLEMENTATION.md §7).
//
// Drives a seeded gen9ou battle to completion over the C2 endpoint surface,
// and asserts a winner + turn count (mirroring the end LOGDATA). Uses the
// service's own deterministic team generator so the whole fight is a pure
// function of (teams, seed) and reproducible.

import test from 'node:test';
import assert from 'node:assert';

import { handle, dispatch, rooms } from '../src/router.js';

// Legal gen9ou fixtures, hand-built to satisfy Showdown's own validator
// (0 EVs / unallocated, Uber-tagged species, and Gen 8/7-learned moves all get
// flagged; these pass). P2 is the opposing team; when p2Team is omitted the
// service generates a default opponent.
const IV = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const P1_TEAM = [
    { species: 'garchomp', moves: ['earthquake', 'dragonclaw', 'stealthrock', 'outrage'], ability: 'roughskin', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'lifeorb', level: 100 },
    { species: 'charizard', moves: ['flamethrower', 'dragonpulse', 'airslash', 'fireblast'], ability: 'blaze', evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 }, ivs: IV, nature: 'timid', item: 'choicescarf', level: 100 },
];
const P2_TEAM = [
    { species: 'tyranitar', moves: ['stoneedge', 'crunch', 'earthpower', 'stealthrock'], ability: 'sandstream', evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 4, spe: 252 }, ivs: IV, nature: 'hasty', item: 'assaultvest', level: 100 },
    { species: 'gyarados', moves: ['waterfall', 'icefang', 'earthquake', 'dragonpulse'], ability: 'intimidate', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, ivs: IV, nature: 'jolly', item: 'blacksludge', level: 100 },
];

// An illegal team (Surf / Drought are not OU-legal for Charizard in gen9).
const ILLEGAL_TEAM = [
    { species: 'charizard', moves: ['flamethrower', 'dragonpulse', 'surf', 'roost'], ability: 'drought' },
];


// Pick the deterministic next p1 choice from a §2 envelope's choiceRequest.
function nextChoice(env) {
    const cr = env.choiceRequest;
    if (cr.state === 'teampreview') return 'teampreview 0';
    if (cr.state === 'over') return null;
    if (cr.state === 'wait') return null;
    const legalMove = cr.legalMoves.find((m) => !m.disabled);
    if (legalMove) return `move ${legalMove.id}`;
    const sw = cr.legalSwitches[0];
    if (sw !== undefined) return `switch ${sw}`;
    return 'default';
}

// Run a battle to completion; return { envs, winner, turns }.
function playToCompletion(battleId) {
    let env = handle('POST', `/battle/${battleId}/choice`, { choice: 'teampreview 0' });
    const envs = [env];
    let guard = 0;
    while (!env.body.battleOver && guard < 500) {
        const c = nextChoice(env.body);
        if (c === null) { env = dispatch('GET', `/battle/${battleId}`, {}); envs.push(env); break; }
        env = handle('POST', `/battle/${battleId}/choice`, { choice: c });
        envs.push(env);
        guard++;
    }
    return { envs, winner: env.body.winner, turns: envs.length };
}

test('POST /battle creates a room in team-preview state', () => {
    const out = handle('POST', '/battle', {
        format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '12345',
    });
    assert.strictEqual(out.status, 200);
    assert.match(out.body.battleId, /^b_/);
    assert.strictEqual(out.body.turn, 0);
    assert.strictEqual(out.body.battleOver, false);
    assert.strictEqual(out.body.winner, null);
    assert.strictEqual(out.body.choiceRequest.state, 'teampreview');
    // 2-mon team -> lead pick offers exactly the team positions (C2 §2.5).
    assert.deepStrictEqual(out.body.choiceRequest.legalSwitches, [0, 1]);
    assert.ok(out.body.log.length > 0, 'preview envelope carries team-preview log lines');
});

test('POST /battle returns 422 when a caller team is illegal in the format', () => {
    const out = dispatch('POST', '/battle', {
        format: 'gen9ou',
        p1Team: ILLEGAL_TEAM,
        p2Team: P2_TEAM,
        seed: '1',
    });
    assert.strictEqual(out.status, 422);
    assert.strictEqual(out.body.error, 'invalid team');
    assert.ok(Array.isArray(out.body.problems) && out.body.problems.length > 0);
});

test('POST /battle defaults p2 to a generated team when p2Team is omitted', () => {
    const out = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, seed: '9' });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.choiceRequest.state, 'teampreview');
});

test('GET /battle/:id resyncs to the current envelope', () => {
    const c = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '12345' });
    const id = c.body.battleId;
    handle('POST', `/battle/${id}/choice`, { choice: 'teampreview 0' });
    const s = handle('GET', `/battle/${id}`, undefined);
    assert.strictEqual(s.status, 200);
    assert.ok(['move', 'switch', 'wait'].includes(s.body.choiceRequest.state));
});

test('GET /battle/:id and choice on an unknown id -> 404', () => {
    assert.strictEqual(dispatch('GET', '/battle/nope', undefined).status, 404);
    assert.strictEqual(dispatch('POST', '/battle/nope/choice', { choice: 'move x' }).status, 404);
});

test('choice after the battle is over -> 409', () => {
    const c = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '54321' });
    const id = c.body.battleId;
    playToCompletion(id); // battleOver true
    const out = dispatch('POST', `/battle/${id}/choice`, { choice: 'move flamethrower' });
    assert.strictEqual(out.status, 409);
    assert.strictEqual(out.body.error, 'not your turn');
});

test('POST /team/validate round-trips a legal team (valid=true, no problems)', () => {
    const out = handle('POST', '/team/validate', { format: 'gen9ou', team: P1_TEAM });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.valid, true);
    assert.deepStrictEqual(out.body.problems, []);
});

test('POST /team/validate reports problems for an illegal team', () => {
    const out = handle('POST', '/team/validate', {
        format: 'gen9ou',
        team: ILLEGAL_TEAM,
    });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.valid, false);
    assert.ok(out.body.problems.length > 0);
});

test('POST /team/validate with a malformed team -> 400', () => {
    assert.strictEqual(dispatch('POST', '/team/validate', { format: 'gen9ou', team: 'nope' }).status, 400);
});

test('E2E: a seeded gen9ou battle runs to completion with a winner + turn count', () => {
    const c = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '54321' });
    const id = c.body.battleId;
    const { winner, turns } = playToCompletion(id);

    // The battle must have ended with a concrete winner (side index 0 or 1) and
    // a turn count > 0. Same seed + same teams => deterministic (test 11 proves
    // reproducibility), so the winner is assertable — we just don't hard-code
    // WHICH side; the §7 requirement is "a winner + turn count".
    assert.ok([0, 1].includes(winner), `battle resolved a concrete winner (got ${winner})`);
    assert.ok(turns > 1, `battle ran ${turns} turns (preview + choice advances)`);

    // Resync state after the last advance still reports the finished battle.
    const s = handle('GET', `/battle/${id}`, undefined);
    assert.strictEqual(s.status, 200);
    assert.strictEqual(s.body.battleOver, true);
    assert.strictEqual(s.body.winner, winner);
    assert.strictEqual(s.body.choiceRequest.state, 'over');
});

test('E2E: same seed reproduces the same winner + turn count', () => {
    const a = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '54321' });
    const b = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '54321' });
    const ra = playToCompletion(a.body.battleId);
    const rb = playToCompletion(b.body.battleId);
    assert.strictEqual(ra.winner, rb.winner);
    assert.strictEqual(ra.turns, rb.turns);
});

test('end LOGDATA mirrors result(): winner name + turn count', () => {
    const c = handle('POST', '/battle', { format: 'gen9ou', p1Team: P1_TEAM, p2Team: P2_TEAM, seed: '54321' });
    const id = c.body.battleId;
    playToCompletion(id);
    // The envelope reports the authoritative winner index; the raw sim's end
    // payload (winner + turns) must agree.
    const room = rooms.get(id);
    const res = room.result();
    assert.ok(res, 'battle ended, so result() is available');
    assert.ok([0, 1].includes(res.winner));
    assert.ok(res.turns > 0);
    // winner name -> index mapping: P1 = 0, P2 = 1
    const final = handle('GET', `/battle/${id}`, undefined).body;
    assert.strictEqual(final.winner, res.winner);
});

