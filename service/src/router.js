// C4 sim service — HTTP router (docs/simulation-dto.md §3 endpoints).
//
// Exposes a pure handle(method, path, body) returning { status, body } so the
// endpoints are testable without sockets, and buildApp() that wires handle to a
// node:http server. Rooms live in an in-memory map (battles are ephemeral per
// IMPLEMENTATION.md §5).

import { BattleRoom } from './room.js';
import { validateTeam } from './teams.js';
import { httpError } from './errors.js';

const rooms = new Map(); // battleId -> BattleRoom

// POST /battle { format, p1Team, p2Team?, seed? } -> { battleId, ...firstEnvelope }
function createBattle(body) {
    const format = typeof body.format === 'string' ? body.format : 'gen9ou';
    const room = BattleRoom.create({
        format,
        p1Team: body.p1Team,
        p2Team: body.p2Team,
        seed: body.seed,
    });
    rooms.set(room.id, room);
    const env = room.lastEnvelope;
    return {
        status: 200,
        body: {
            battleId: room.id,
            format: room.format,
            turn: 0,
            log: env.log,
            choiceRequest: env.choiceRequest,
            battleOver: env.battleOver,
            winner: env.winner,
        },
    };
}

// POST /battle/:id/choice { choice } -> that turn's envelope (§2)
function advanceChoice(id, body) {
    const room = rooms.get(id);
    if (!room) throw httpError(404, 'battle not found');
    const env = room.advance(body ? String(body.choice ?? '') : '');
    return { status: 200, body: env };
}

// GET /battle/:id -> most-recent envelope (§2)
function getState(id) {
    const room = rooms.get(id);
    if (!room) throw httpError(404, 'battle not found');
    return { status: 200, body: room.state() };
}

// POST /team/validate { format, team } -> { valid, problems }
function validate(body) {
    const format = typeof body.format === 'string' ? body.format : 'gen9ou';
    const team = body.team;
    if (!Array.isArray(team) || team.length < 1 || team.length > 6) {
        throw httpError(400, 'malformed team', { problems: ['team must be an array of 1-6 PokemonSet'] });
    }
    const { valid, problems } = validateTeam(team, format);
    return { status: 200, body: { valid, problems } };
}

// Pure request handler. path like "/battle" or "/b_xxx/choice" or "/team/validate".
export function handle(method, path, body) {
    const m = String(method || '').toUpperCase();
    const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);

    if (m === 'POST' && parts.length === 1 && parts[0] === 'battle') {
        return createBattle(body || {});
    }
    if (m === 'POST' && parts.length === 3 && parts[0] === 'battle' && parts[2] === 'choice') {
        return advanceChoice(parts[1], body || {});
    }
    if (m === 'GET' && parts.length === 2 && parts[0] === 'battle') {
        return getState(parts[1]);
    }
    if (m === 'POST' && parts.length === 2 && parts[0] === 'team' && parts[1] === 'validate') {
        return validate(body || {});
    }
    throw httpError(404, 'not found');
}

// Wrap handle: HttpError -> {status, body:{error,...}}, other errors -> 500.
export function dispatch(method, path, body) {
    try {
        return handle(method, path, body);
    } catch (e) {
        if (e && e.status) {
            const out = { error: e.error };
            if (e.extra) Object.assign(out, e.extra);
            return { status: e.status, body: out };
        }
        console.error('[sim-service] unhandled error:', e);
        return { status: 500, body: { error: 'internal error', detail: String(e && e.message ? e.message : e) } };
    }
}

// node:http server.
import http from 'node:http';

// CORS for cross-origin prod (Netlify SPA -> Render service). Wildcard is
// safe: the API is stateless (in-memory rooms) and takes no cookies/auth.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export function buildApp() {
    return http.createServer((req, res) => {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, CORS_HEADERS);
            res.end();
            return;
        }
        const method = req.method;
        let body = {};
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', async () => {
            if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }
            const out = await dispatch(method, req.url.split('?')[0], body);
            res.writeHead(out.status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify(out.body));
        });
    });
}

export { rooms };
