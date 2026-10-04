// Q2/S5 — unit tests for the battle audio controller (src/utils/battleAudio.js).
//
// The controller is created with an injectable env (storage + audio factories
// + the .mid fetch), the same wiring as partyStore.js: the browser uses the
// default export `battleAudio` (no-arg create); the tests build a controller
// with fakes and assert on observable behavior (storage writes, element
// play() calls, oscillator scheduling counts), never on the fakes'
// internals.
//
// S5: BGM now plays the DECODED .mid battle track (the default Wild battle
// theme, fetched + parsed via src/utils/midi.js). The tests inject a fake
// fetch that serves the REAL .mid bytes from public/music/, so the BGM
// assertions exercise the genuine track (929 note-on events) end-to-end
// through the oscillator pass. A .mid fetch/decode failure must be a
// silent no-op — the battle never breaks.
//
// Run with `npm test` (node:test).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    battleAudio,
    createBattleAudio,
    cryUrlFor,
    CRY_BASE,
    SOUND_TOGGLE_KEY,
} from "./battleAudio.js";
import { clearMidiCache } from "./midi.js";

// fileURLToPath is REQUIRED (not raw import.meta.url): path.join mangles the
// "file:///..." scheme prefix and TRACK_BYTES() would ENOENT.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_TRACK_NAME = "Pokemon X  Pokemon Y - Battle Wild Pokemon.mid";

// The REAL default battle track's bytes: the fake fetch serves these, so the
// BGM path is tested against the user's actual .mid (not a stub).
const TRACK_BYTES = () =>
    new Uint8Array(readFileSync(join(ROOT, "public", "music", DEFAULT_TRACK_NAME)));

// A fake Response for the .mid fetch: ok=true serves the real bytes.
const okMidiFetch = () => async () => ({
    ok: true,
    arrayBuffer: async () => TRACK_BYTES().buffer,
});

// A fake Response that fails the fetch (404): exercises the silent no-op.
const deadMidiFetch = () => async () => ({
    ok: false,
    arrayBuffer: async () => new ArrayBuffer(0),
});

// A Map-backed fake implementing the localStorage surface the controller
// uses (the same shape as partyStore.js's injectable storage arg).
function mapStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
    };
}

// Minimal Audio element fake: records the calls the controller makes. A
// failed element rejects play() (a 404/absence) to exercise the no-throw
// path.
function fakeAudioElement() {
    const el = {
        url: "",
        calls: { play: 0 },
        failed: false,
        connect: () => {},
        disconnect: () => {},
    };
    el.play = () => {
        el.calls.play += 1;
        if (el.failed) return Promise.reject(new Error("load failed"));
        return Promise.resolve();
    };
    return el;
}

// Minimal Web Audio fake: the controller creates oscillators + gains and
// schedules them; record counts per method instead of running audio.
function fakeAudioContext() {
    const made = { oscillators: 0, gains: 0, starts: 0, stops: 0 };
    const param = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
    });
    const osc = () => {
        made.oscillators += 1;
        const o = {
            type: "sine",
            frequency: param(),
            start() { made.starts += 1; },
            stop() { made.stops += 1; },
            connect() { return o; },
            disconnect() {},
        };
        return o;
    };
    const gain = () => {
        made.gains += 1;
        const g = { gain: param(), connect() { return g; }, disconnect() {} };
        return g;
    };
    return {
        currentTime: 0,
        state: "running",
        resume: () => Promise.resolve(),
        createOscillator: osc,
        createGain: gain,
        destination: {},
        made,
    };
}

// A controller wired to the fakes. `audio` is the shared element the
// default factory returns (so "cached element" is observable through it);
// pass `audioFactory` to replace it (e.g. a failing element). `midiFetch`
// replaces the .mid fetch (default: the real track bytes).
function build(options = {}) {
    const storage = options.storage ?? mapStorage();
    const ctx = options.ctx ?? fakeAudioContext();
    const audio = fakeAudioElement();
    const audioFactory = options.audioFactory ?? ((url) => {
        audio.url = url;
        return audio;
    });
    // No-op timer pair: the BGM pass chain's handles are never fired in
    // tests (each test stops the loop before its timer could re-arm), so
    // pending timers never pin node's event loop between tests.
    const timers = options.timers ?? { setTimeout: () => 0, clearTimeout: () => {} };
    const controller = createBattleAudio({
        storage,
        audioElement: audioFactory,
        audioContext: options.noCtx ? () => null : () => ctx,
        fetchMidi: options.midiFetch ?? okMidiFetch(),
        timers,
    });
    // Every BGM test starts from a fresh session: the .mid fetch cache is
    // module-level (the rematch reuse the task requires), so reset it here
    // — an earlier test's fetch must never leak into the next one.
    clearMidiCache();
    return { controller, storage, audio, ctx };
}

// ----------------------------------------------------------- URL helper
test("cryUrlFor: builds the PokeAPI cries URL from a dex number", () => {
    assert.equal(cryUrlFor(6), `${CRY_BASE}/6.ogg`);
    assert.equal(cryUrlFor(25), `${CRY_BASE}/25.ogg`);
    assert.equal(battleAudio.cryUrlFor(4), `${CRY_BASE}/4.ogg`); // the instance exposes it too
});

test("cryUrlFor: rejects anything that is not a plausible dex number", () => {
    for (const bad of [0, -1, 1.5, 20001, "abc", "", null, undefined, NaN, { 6: "x" }]) {
        assert.equal(cryUrlFor(bad), null, `dexNum ${String(bad)}`);
    }
});

// ------------------------------------------------------- master toggle
test("sound is on by default; toggleSound flips + persists it", () => {
    const { controller, storage, ctx } = build();
    assert.equal(controller.enabled(), true);
    assert.equal(storage.getItem(SOUND_TOGGLE_KEY), null); // no write yet

    controller.toggleSound(false);
    assert.equal(controller.enabled(), false);
    assert.equal(storage.getItem(SOUND_TOGGLE_KEY), "0");

    controller.toggleSound(true);
    assert.equal(controller.enabled(), true);
    assert.equal(storage.getItem(SOUND_TOGGLE_KEY), "1");
    assert.equal(ctx.made.oscillators, 0); // music never started
});

test("toggleSound reads back a persisted off state", () => {
    const { storage, controller } = build();
    storage.setItem(SOUND_TOGGLE_KEY, "0");
    assert.equal(controller.enabled(), false);
});

test("toggleSound without a storage backend stays in-memory (private mode)", () => {
    const { controller } = build({ storage: null });
    assert.equal(controller.enabled(), true);
    controller.toggleSound(false);
    assert.equal(controller.enabled(), false);
    controller.toggleSound(true);
    assert.equal(controller.enabled(), true);
});

// ------------------------------------------------------------- switch-in cry
test("playSwitchInCry: plays the cached element for a valid dexNum", () => {
    const { controller, audio } = build();
    assert.equal(controller.playSwitchInCry(6), true);
    assert.equal(audio.url, `${CRY_BASE}/6.ogg`);
    assert.equal(audio.calls.play, 1);
    // a second switch-in re-plays the SAME cached element (no re-fetch)
    assert.equal(controller.playSwitchInCry(6), true);
    assert.equal(audio.calls.play, 2);
});

test("playSwitchInCry: no dexNum (lane not loaded) is a silent no-op", () => {
    const { controller, audio } = build();
    assert.equal(controller.playSwitchInCry(null), false);
    assert.equal(controller.playSwitchInCry(undefined), false);
    assert.equal(controller.playSwitchInCry(0), false);
    assert.equal(controller.playSwitchInCry("abc"), false);
    assert.equal(audio.calls.play, 0);
});

test("playSwitchInCry: a failed load is a silent no-op, never a throw", async () => {
    let made = 0;
    const factory = (url) => {
        made += 1;
        const el = fakeAudioElement();
        el.url = url;
        el.failed = true;
        return el;
    };
    const { controller } = build({ audioFactory: factory });
    // The first attempt is optimistic: play() rejects async and the
    // rejection is caught internally (no broken promise in the battle flow).
    assert.equal(controller.playSwitchInCry(42), true);
    assert.equal(made, 1);
    await new Promise((r) => setTimeout(r, 0)); // let the rejection settle
    // Marked failed: subsequent calls are no-ops — no re-fetch, no throw.
    assert.equal(controller.playSwitchInCry(42), false);
    assert.equal(made, 1);
    // A different dexNum still gets a fresh attempt.
    assert.equal(controller.playSwitchInCry(25), true);
    assert.equal(made, 2);
});

test("playSwitchInCry: silent while sound is off", () => {
    const { controller, audio } = build();
    controller.toggleSound(false);
    assert.equal(controller.playSwitchInCry(6), false);
    assert.equal(audio.calls.play, 0);
});

// ------------------------------------------------------------- SFX (synth)
test("playHit / playFaint: locked before a gesture -> documented no-op", () => {
    const { controller, ctx } = build();
    assert.equal(controller.playHit(), false);
    assert.equal(controller.playFaint(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("playHit / playFaint: silent no-op while sound is off", async () => {
    const { controller, ctx } = build();
    await controller.unlock();
    controller.toggleSound(false);
    assert.equal(controller.playHit(), false);
    assert.equal(controller.playFaint(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("playHit / playFaint: synthesize when enabled and unlocked", async () => {
    const { controller, ctx } = build();
    assert.equal(await controller.unlock(), true);
    assert.equal(controller.playHit("earthquake"), true);
    assert.equal(controller.playFaint(), true);
    assert.equal(ctx.made.oscillators, 2); // one oscillator per SFX
});

test("playHit / playFaint: no AudioContext -> documented no-op, not a throw", async () => {
    const { controller } = build({ noCtx: true });
    assert.equal(await controller.unlock(), false);
    assert.equal(controller.playHit(), false);
    assert.equal(controller.playFaint(), false);
});

// ------------------------------------------------------------------- BGM
test("unlock: resolves true when the context is running, idempotent", async () => {
    const { controller } = build();
    assert.equal(await controller.unlock(), true);
    assert.equal(await controller.unlock(), true);
});

test("startBattleMusic: the DECODED .mid track schedules a full pass (async)", async () => {
    const { controller, ctx } = build();
    const before = ctx.made.oscillators;
    assert.equal(await controller.startBattleMusic(), true);
    const afterStart = ctx.made.oscillators;
    // The pass schedules EVERY note-on of the real track: 929 oscillators.
    assert.equal(afterStart - before, 929, "one oscillator per decoded note-on");
    assert.equal(ctx.made.starts, afterStart);
    assert.equal(controller.isMusicPlaying(), true);
    // Re-starting while it plays must not open a second loop.
    assert.equal(await controller.startBattleMusic(), false);
    assert.equal(ctx.made.oscillators, afterStart);
    assert.equal(controller.stopBattleMusic(), true);
    assert.equal(controller.isMusicPlaying(), false);
});

test("startBattleMusic: silent while sound is off", async () => {
    const { controller, ctx } = build();
    controller.toggleSound(false);
    assert.equal(await controller.startBattleMusic(), false);
    assert.equal(ctx.made.oscillators, 0);
    assert.equal(controller.isMusicPlaying(), false);
});

test("startBattleMusic: a .mid FETCH failure is a silent no-op, battle continues", async () => {
    const { controller, ctx } = build({ midiFetch: deadMidiFetch() });
    // No throw: the reject is caught inside startBattleMusic (the same
    // no-throw bar as a dead cry URL).
    await assert.doesNotReject(() => controller.startBattleMusic());
    assert.equal(controller.isMusicPlaying(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("startBattleMusic: a DECODE failure (non-MIDI bytes) is a silent no-op", async () => {
    const fakeFetch = async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer, // not MThd
    });
    const { controller, ctx } = build({ midiFetch: fakeFetch });
    await assert.doesNotReject(() => controller.startBattleMusic());
    assert.equal(controller.isMusicPlaying(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("startBattleMusic: no AudioContext -> no-op, not a throw", async () => {
    const { controller } = build({ noCtx: true });
    assert.equal(await controller.startBattleMusic(), false);
});

test("startBattleMusic: a stop DURING the fetch discards the late start (unmount race)", async () => {
    // A fetch that resolves AFTER the page unmounted (stopBattleMusic ran)
    // must not resurrect the loop — the generation guard discards it.
    let releaseFetch;
    const gateFetch = () => new Promise((resolve) => {
        releaseFetch = () => resolve({
            ok: true,
            arrayBuffer: async () => TRACK_BYTES().buffer,
        });
    });
    const { controller, ctx } = build({ midiFetch: gateFetch });
    const p = controller.startBattleMusic(); // in-flight fetch
    controller.stopBattleMusic(); // unmount happens while it's still loading
    releaseFetch();
    assert.equal(await p, false); // the late start was discarded
    assert.equal(controller.isMusicPlaying(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("stopBattleMusic: safe when not playing; a fresh start schedules new notes", async () => {
    const { controller, ctx } = build();
    assert.equal(controller.stopBattleMusic(), false); // nothing to stop
    await controller.startBattleMusic();
    const atFirstStart = ctx.made.oscillators;
    assert.ok(atFirstStart > 0);
    assert.equal(controller.stopBattleMusic(), true);
    assert.equal(controller.stopBattleMusic(), false); // already stopped
    // The scheduler is torn down: a restart makes NEW notes (not the old
    // loop's leftovers).
    await controller.startBattleMusic();
    assert.ok(ctx.made.oscillators > atFirstStart);
    assert.equal(controller.stopBattleMusic(), true);
});

test("toggleSound off stops a running BGM loop (the master governs it)", async () => {
    const { controller } = build();
    assert.equal(await controller.startBattleMusic(), true);
    assert.equal(controller.isMusicPlaying(), true);
    assert.equal(controller.toggleSound(false), false);
    assert.equal(controller.isMusicPlaying(), false);
});

test("setBattleTrack: picks a URL for the next start; rejects junk", async () => {
    const { controller, ctx } = build();
    assert.equal(controller.setBattleTrack(42), false);
    assert.equal(controller.setBattleTrack(""), false);
    assert.equal(controller.setBattleTrack("/music/other.mid"), true);
    // The picker has no fetch override here (the fake fetch serves the real
    // bytes anyway): a start with the picked URL still plays the real track.
    assert.equal(await controller.startBattleMusic(), true);
    assert.equal(ctx.made.oscillators, 929);
    assert.equal(controller.stopBattleMusic(), true);
});

test("the default export battleAudio is a ready-made controller", () => {
    assert.equal(typeof battleAudio.toggleSound, "function");
    assert.equal(typeof battleAudio.playSwitchInCry, "function");
    assert.equal(typeof battleAudio.playHit, "function");
    assert.equal(typeof battleAudio.playFaint, "function");
    assert.equal(typeof battleAudio.setBattleTrack, "function");
    assert.equal(typeof battleAudio.startBattleMusic, "function");
    assert.equal(typeof battleAudio.stopBattleMusic, "function");
    // Node has no localStorage: default enabled stays true without throwing.
    assert.equal(battleAudio.enabled(), true);
});
