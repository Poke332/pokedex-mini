// Q2 — unit tests for the battle audio controller (src/utils/battleAudio.js).
//
// The controller is created with an injectable env (storage + audio
// factories), the same wiring as partyStore.js: the browser uses the
// default export `battleAudio` (no-arg create); the tests build a
// controller with fakes and assert on observable behavior (storage
// writes, element play() calls, oscillator scheduling counts), never on
// the fakes' internals.
//
// Run with `npm test` (node:test).
import test from "node:test";
import assert from "node:assert/strict";

import {
    battleAudio,
    createBattleAudio,
    cryUrlFor,
    CRY_BASE,
    SOUND_TOGGLE_KEY,
} from "./battleAudio.js";

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
// pass `audioFactory` to replace it (e.g. a failing element).
function build(options = {}) {
    const storage = options.storage ?? mapStorage();
    const ctx = options.ctx ?? fakeAudioContext();
    const audio = fakeAudioElement();
    const audioFactory = options.audioFactory ?? ((url) => {
        audio.url = url;
        return audio;
    });
    const controller = createBattleAudio({
        storage,
        audioElement: audioFactory,
        audioContext: options.noCtx ? () => null : () => ctx,
        intervalMs: 200, // speed the BGM scheduler up so tests stay fast
    });
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

test("startBattleMusic: one BGM loop at a time, idempotent restart", () => {
    const { controller, ctx } = build();
    const before = ctx.made.oscillators;
    assert.equal(controller.startBattleMusic(), true);
    const afterStart = ctx.made.oscillators;
    assert.ok(afterStart > before); // the first loop is scheduled up front
    assert.equal(controller.isMusicPlaying(), true);
    // Re-starting while it plays must not open a second loop.
    assert.equal(controller.startBattleMusic(), false);
    assert.equal(ctx.made.oscillators, afterStart);
    assert.equal(controller.stopBattleMusic(), true);
    assert.equal(controller.isMusicPlaying(), false);
});

test("startBattleMusic: silent while sound is off", () => {
    const { controller, ctx } = build();
    controller.toggleSound(false);
    assert.equal(controller.startBattleMusic(), false);
    assert.equal(ctx.made.oscillators, 0);
});

test("stopBattleMusic: safe when not playing; a fresh start schedules new notes", () => {
    const { controller, ctx } = build();
    assert.equal(controller.stopBattleMusic(), false); // nothing to stop
    controller.startBattleMusic();
    const atFirstStart = ctx.made.oscillators;
    assert.ok(atFirstStart > 0);
    assert.equal(controller.stopBattleMusic(), true);
    assert.equal(controller.stopBattleMusic(), false); // already stopped
    // The scheduler is torn down: a restart makes NEW notes (not the old
    // loop's leftovers).
    controller.startBattleMusic();
    assert.ok(ctx.made.oscillators > atFirstStart);
    assert.equal(controller.stopBattleMusic(), true);
});

test("toggleSound off stops a running BGM loop (the master governs it)", () => {
    const { controller } = build();
    assert.equal(controller.startBattleMusic(), true);
    assert.equal(controller.isMusicPlaying(), true);
    assert.equal(controller.toggleSound(false), false);
    assert.equal(controller.isMusicPlaying(), false);
});

test("the default export battleAudio is a ready-made controller", () => {
    assert.equal(typeof battleAudio.toggleSound, "function");
    assert.equal(typeof battleAudio.playSwitchInCry, "function");
    assert.equal(typeof battleAudio.playHit, "function");
    assert.equal(typeof battleAudio.playFaint, "function");
    assert.equal(typeof battleAudio.startBattleMusic, "function");
    assert.equal(typeof battleAudio.stopBattleMusic, "function");
    // Node has no localStorage: default enabled stays true without throwing.
    assert.equal(battleAudio.enabled(), true);
});
