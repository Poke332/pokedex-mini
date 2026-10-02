// C4 sim service — one battle room = one pokemon-showdown BattleStream.
//
// A room drives the sim one turn at a time over the C2 contract: the CALLER is
// p1 and submits a choice; the opponent p2 is driven autonomously (deterministic
// when a seed is supplied, so a reviewer can assert winner + turn count from the
// end LOGDATA per IMPLEMENTATION.md §7). Only that turn's envelope ships back.
//
// DOUBLES (gen9doublesou, format.gameType === 'doubles'): each side fields TWO
// actives, so a Showdown choice token is one sub-token PER PENDING ACTIVE,
// comma-joined ("move <id> <loc>, move" | "switch N, move"). The caller's token
// carries their sub-choice first; the remaining pending actives are auto-filled
// with bare 'move' / 'switch' sub-tokens (the sim's autoChoose determinism). A
// target sub-token only needs a location for foe/ally-targeting move types —
// self-typed moves ship no target.

import { BattleStream, getPlayerStreams } from './deps.js';
import {
    packTeam, validateTeam, generateTeam, normalizeSeed, toID,
} from './teams.js';
import { httpError } from './errors.js';
import { buildEnvelope } from './envelope.js';

// Move target types that need no explicit target location in a choice token
// (the sim resolves them; a bare 'move <id>' sub-token is complete).
const NO_TARGET = new Set([
    'self', 'normalSelf', 'allAdjacentFoes', 'all', 'foeSide', 'allies', 'foe',
    'allySide', 'alliesSide',
]);

// Move target types that take a TARGET LOCATION sub-token ("move <id> <loc>"),
// where <loc> is the signed relative position (0 = left of both foes, +1/+2 =
// first/second foe, -1/-2 = self / ally).
const LOC_TARGETS = new Set([
    'normal', 'randomNormal', 'any', 'adjacentFoe', 'adjacentAlly',
    'adjacentAllyOrSelf',
]);

// A single BattleStream room.
export class BattleRoom {
    constructor({ format, p1Team, p2Team, seed }) {
        this.id = 'b_' + Math.random().toString(36).slice(2, 8);
        this.format = toID(format);
        this.seed = normalizeSeed(seed);
        this.p1Team = p1Team;
        this.p2Team = p2Team;

        this.stream = new BattleStream();
        this.streams = getPlayerStreams(this.stream);
        this.battle = null;
        this.log = [];              // accumulated |display| lines for the room
        this._battleLogPos = 0;    // cursor into battle.log already captured
        this.lastEnvLogLen = 0;    // slice point for the next per-turn log
        this.rqid = 0;
        this.lastEnvelope = null;
        this._start();
    }

    // Kick off the sim: >start {formatid, seed} + >player p1/p2 <packed team>.
    // BattleStream creates the Battle object synchronously on the write, so
    // this.battle is ready by the time this returns.
    _start() {
        const spec = { formatid: this.format };
        if (this.seed) spec.seed = this.seed;
        this.streams.omniscient.write(
            `>start ${JSON.stringify(spec)}\n` +
            `>player p1 ${JSON.stringify({ name: 'P1', team: packTeam(this.p1Team) })}\n` +
            `>player p2 ${JSON.stringify({ name: 'P2', team: packTeam(this.p2Team) })}`,
        );
        this.battle = this.stream.battle;
    }

    // Pull new |display| lines off battle.log into this.log. Request lines are
    // never in battle.log (they ship on the player sub-streams), so we keep all
    // non-empty lines.
    _captureLog() {
        if (!this.battle) return;
        for (const line of this.battle.log.slice(this._battleLogPos || 0)) {
            if (line) this.log.push(line);
        }
        this._battleLogPos = this.battle.log.length;
    }

    // Opponent auto-respond: commit `default` on p2 until it has no pending
    // choice, so the caller's single advance resolves exactly one turn. A turn
    // can chain a simultaneous move + a forced switch on p2's side, so we loop
    // (capped) rather than writing a single `default`.
    _autoOpponent() {
        const p2 = this.battle.sides[1];
        let guard = 0;
        while (!this.battle.ended && !p2.isChoiceDone() && guard < 16) {
            this.streams.p2.write('default');
            guard++;
        }
    }

    // Build the per-turn envelope and attach that turn's log slice.
    _finalize() {
        this.rqid += 1;
        const env = buildEnvelope(this.battle, String(this.rqid));
        env.log = this.log.slice(this.lastEnvLogLen);
        this.lastEnvLogLen = this.log.length;
        this.lastEnvelope = env;
        return env;
    }

    // ------------------------------------------------------------------ create
    // Gate the CALLER's teams (Showdown's own dialect) before touching the sim.
    // p2 defaults to a tier-generated team when not supplied; a generated team is
    // trusted (the sim itself does not validate), so it is not hard-gated.
    // Returns the room; its first envelope (state "teampreview") is lastEnvelope.
    static create({ format, p1Team, p2Team, seed }) {
        if (!Array.isArray(p1Team) || p1Team.length < 1 || p1Team.length > 6) {
            throw httpError(400, 'invalid team', { problems: ['p1Team must be an array of 1-6 PokemonSet'] });
        }
        const callerProvidedP2 = Array.isArray(p2Team) && p2Team.length > 0;
        const p2 = callerProvidedP2 ? p2Team : generateTeam(format, seed, 6);
        const p1v = validateTeam(p1Team, format);
        const problems = [...p1v.problems];
        if (callerProvidedP2) problems.push(...validateTeam(p2, format).problems);
        if (problems.length) {
            throw httpError(422, 'invalid team', { problems });
        }
        const room = new BattleRoom({ format, p1Team, p2Team: p2, seed });
        room._captureLog(); // move the team-preview lines off battle.log into room.log
        room._finalize(); // first envelope (teampreview)
        return room;
    }

    // ------------------------------------------------------------- advance one
    // Take the caller's C2 choice, write p1's Showdown token, auto-respond p2,
    // and return that turn's envelope (only this turn's log).
    advance(choice) {
        if (!this.battle) throw httpError(404, 'battle not found');
        const p1 = this.battle.sides[0];
        if (this.battle.ended) throw httpError(409, 'not your turn', { reason: 'battle over' });
        if (p1.requestState === '') throw httpError(409, 'not your turn');

        const token = this._translateChoice(p1.requestState, String(choice ?? ''));
        this.streams.p1.write(token);
        this._autoOpponent();
        this._captureLog();
        return this._finalize();
    }

    // True for gen* doubles formats (`battle.format.gameType === 'doubles'` —
    // the sim's own field, reliable for gen9doublesou & co.).
    _isDoubles() {
        return !!(this.battle && this.battle.format && this.battle.format.gameType === 'doubles');
    }

    // C2 choice string -> Showdown choice token for p1.
    //   teampreview <i> (0-based)  -> team <i+1>
    //   move <id>                  -> move <id>
    //   switch <i> (0-based pos)   -> switch <i+1>
    // DOUBLES: a choice covers ONE PENDING ACTIVE per sub-token, comma-joined —
    // the caller's pick first, then a bare auto-fill ('move'/'switch') per
    // remaining active. The bare fill is the sim's autoChoose: deterministic.
    _translateChoice(rs, choiceStr) {
        const s = choiceStr.trim();
        if (rs === 'teampreview') {
            const m = /^teampreview(?:\s+(\d+))?/.exec(s);
            const idx = m && m[1] !== undefined ? Number(m[1]) : 0;
            return `team ${idx + 1}`;
        }
        if (!this._isDoubles()) {
            if (/^move\b/.test(s)) return s;                 // "move <id>" passthrough
            if (/^switch\b/.test(s)) {
                const idx = Number(s.replace(/^switch\b\s*/i, '').trim());
                return Number.isInteger(idx) ? `switch ${idx + 1}` : 'default';
            }
            return 'default';
        }
        return this._doublesToken(rs, s, this.battle.sides[0]);
    }

    // Doubles token builder. The sim wants ONE sub-token per PENDING ACTIVE
    // (the non-null slots of `p1.activeRequest.active`), comma-joined. The
    // caller's pick lands on the FIRST pending slot; every other pending slot
    // gets a bare auto-fill sub-token ('move', or 'switch' when that slot is
    // force-switched) — the sim's autoChoose, deterministic under a seed.
    _doublesToken(rs, s, p1) {
        const entries = ((p1.activeRequest && p1.activeRequest.active) || [])
            .map((e, i) => (e ? i : null))
            .filter((i) => i !== null);
        if (rs === 'switch') {
            const m = /^switch\s+(\d+)$/.exec(s.trim());
            const callerTok = m ? `switch ${Number(m[1]) + 1}` : 'switch';
            const owner = entries.length ? entries[0] : 0;
            return entries.map((i) => {
                const e = p1.activeRequest.active[i];
                if (i === owner) return callerTok;
                return e && e.forceSwitch ? 'switch' : 'move';
            }).join(', ');
        }
        // move state (and anything else the sim routes to p1 in doubles)
        const m = /^move\s+(\S+)(?:\s+([+-]?\d+))?$/.exec(s.trim());
        let callerTok;
        if (!m || m[1] === '0') {
            callerTok = 'move';                              // auto pick
        } else {
            const moveId = toID(m[1]);
            const src = p1.active[entries[0]];               // slot that owns the caller pick
            const loc = m[2] !== undefined ? m[2] : this._defaultTargetLoc(moveId, src);
            callerTok = loc !== '' ? `move ${moveId} ${loc}` : 'move';
        }
        if (!entries.length) return callerTok;
        return entries.map((i, n) => (n === 0 ? callerTok : 'move')).join(', ');
    }

    // Pick a deterministic default target location for the caller's move in
    // doubles: foe-targeting moves take the first legal foe slot, ally-
    // targeting the nearest ally; self/side/all-typed moves ship no location.
    // Returns '' when no location is legal (caller falls back to bare 'move').
    _defaultTargetLoc(moveId, src) {
        const md = moveId && this.battle.dex.moves.get(moveId);
        if (!md) return '';
        const target = String(md.target || '');
        if (NO_TARGET.has(target)) return '';
        if (!LOC_TARGETS.has(target)) return '';
        const ally = target === 'adjacentAlly' || target === 'adjacentAllyOrSelf';
        const candidates = ally ? [-2, -1, 0, 1, 2] : [0, 1, 2, -1, -2];
        for (const loc of candidates) {
            try {
                if (this.battle.validTargetLoc(loc, src, target)) {
                    return loc === 0 ? '0' : (loc > 0 ? `+${loc}` : String(loc));
                }
            } catch { /* try the next candidate */ }
        }
        return '';
    }

    // ----------------------------------------------------------------- state()
    // Most-recent envelope (resync for a client that reloaded).
    state() {
        if (!this.battle || !this.lastEnvelope) throw httpError(404, 'battle not found');
        return this.lastEnvelope;
    }

    // Authoritative result (winner index + total turn count) — mirrors the
    // end LOGDATA message, which carries the same winner name + turn count.
    result() {
        if (!this.battle || !this.battle.ended) return null;
        const winner = this.battle.winner === ''
            ? 0
            : this.battle.sides.findIndex((s) => s.name === this.battle.winner);
        return { winner: winner < 0 || winner > 1 ? 0 : winner, turns: this.battle.turn };
    }

}
