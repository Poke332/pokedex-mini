import test from "node:test";
import assert from "node:assert/strict";
import {
    genFromFormat,
    parseCommonJSDump,
    buildSpeciesRecord,
    buildRecordsForSpecies,
    buildSpeciesList,
    loadShowdownIndex,
} from "./showdownData.js";

// ---------------------------------------------------------------------------
// Synthetic fixture — a minimal but shape-accurate slice of the four sources.
// Mimics the real dump fields the index reads (pokedex.baseSpecies/abilities/
// types/num, learnset tokens with gen prefixes, moves.category/type/basePower,
// items.gen/isNonstandard) so the legal-move / item / ability logic is
// exercised without a network.
// ---------------------------------------------------------------------------
const fixture = () => ({
    pokedex: {
        // base species with a hidden ability + a forme that points back to it
        charizard: {
            num: 6,
            name: "Charizard",
            types: ["Fire", "Flying"],
            abilities: { "0": "Blaze", H: "Solar Power" },
            baseSpecies: undefined,
        },
        // forme (mega) — not in learnsets, must fall back to base species.
        // pokedex keys are toID-normalized (no dashes), matching the real dump.
        charizardmegax: {
            num: 6,
            name: "Charizard-Mega-X",
            types: ["Fire", "Dragon"],
            abilities: { "0": "Tough Claws" },
            baseSpecies: "Charizard",
        },
        // base species with a third (slot "1") ability
        pikachu: {
            num: 25,
            name: "Pikachu",
            types: ["Electric"],
            abilities: { "0": "Static", "1": "Lightning Rod" },
        },
    },
    moves: {
        flamethrower: { name: "Flamethrower", type: "Fire", category: "Special", basePower: 90 },
        dragonpulse: { name: "Dragon Pulse", type: "Dragon", category: "Special", basePower: 85 },
        roost: { name: "Roost", type: "Flying", category: "Status", basePower: 0 },
        swordsdance: { name: "Swords Dance", type: "Normal", category: "Status", basePower: 0 },
    },
    learnsets: {
        // charizard: gen9-learnable moves + a gen8-only + a move not in pool
        charizard: {
            learnset: {
                flamethrower: ["9M", "8L30"], // legal in gen9 and gen8
                dragonpulse: ["9M", "7T"], // legal in gen9 only (of these gens)
                roost: ["8V", "7M"], // NOT legal in gen9, IS legal in gen8
                ghostbolt: ["9M"], // legal in gen9 but move dropped from pool
            },
        },
        // pikachu: gen9 vs gen5 divergence
        pikachu: {
            learnset: {
                swordsdance: ["9M"],
                flamethrower: ["5M"], // only gen5, not gen9
            },
        },
        // note: charizard-megax deliberately absent → falls back to base
    },
    items: {
        choicescarf: { name: "Choice Scarf", gen: 4 },
        lifeorb: { name: "Life Orb", gen: 4 },
        leftovers: { name: "Leftovers", gen: 2 },
        // Past/Future/CAP must be excluded from the standard pool
        ancientbell: { name: "Ancient Bell", gen: 8, isNonstandard: "Past" },
        futureitem: { name: "Future Item", gen: 9, isNonstandard: "Future" },
        capitem: { name: "CAP Item", gen: 9, isNonstandard: "CAP" },
        // an item only available from gen5 — excluded from gen4 pools
        gen5item: { name: "Gen 5 Item", gen: 5 },
    },
});

const gen9 = "gen9ou";
const gen8 = "gen8ou";
const gen4 = "gen4ou";

// ---------------------------------------------------------------------------

test("genFromFormat parses the generation from a format id", () => {
    assert.equal(genFromFormat("gen9ou"), 9);
    assert.equal(genFromFormat("gen8uu"), 8);
    assert.equal(genFromFormat("gen4ou"), 4);
    // no gen prefix → current gen
    assert.equal(genFromFormat("ou"), 9);
    assert.equal(genFromFormat(""), 9);
});

test("parseCommonJSDump evaluates the CommonJS items dump (exports.X = {...};)", () => {
    const text = "exports.BattleItems = {choicescarf:{name:\"Choice Scarf\",gen:4},leftovers:{name:\"Leftovers\",gen:2}};";
    const out = parseCommonJSDump(text);
    const items = out.BattleItems ? out.BattleItems : out;
    assert.equal(items.choicescarf.name, "Choice Scarf");
    assert.equal(items.leftovers.gen, 2);
});

test("parseCommonJSDump fast-paths plain JSON", () => {
    const out = parseCommonJSDump('{"a":1}');
    assert.equal(out.a, 1);
});

test("buildSpeciesRecord emits the exact C2 §4 shape for a known species", () => {
    const rec = buildSpeciesRecord(fixture(), "charizard", gen9);
    // top-level fields, exactly the pinned set
    assert.deepEqual(Object.keys(rec).sort(), [
        "abilities", "dexNum", "items", "levelRange", "moves", "natures", "species", "types",
    ]);
    assert.equal(rec.species, "Charizard");
    assert.equal(rec.dexNum, 6);
    assert.deepEqual(rec.types, ["fire", "flying"]);
    assert.deepEqual(rec.levelRange, { min: 5, max: 100 });
    assert.equal(rec.natures.length, 25);
    assert.ok(rec.natures.includes("hardy"));
    assert.ok(rec.natures.includes("jolly"));
});

test("buildSpeciesRecord abilities: default flag + id + order", () => {
    const rec = buildSpeciesRecord(fixture(), "charizard", gen9);
    // "0" (Blaze) is the default; "H" (Solar Power) is not
    assert.deepEqual(rec.abilities, [
        { id: "blaze", name: "Blaze", default: true },
        { id: "solarpower", name: "Solar Power", default: false },
    ]);
    // three-ability species keeps slot "1" in between
    const pika = buildSpeciesRecord(fixture(), "pikachu", gen9);
    assert.deepEqual(pika.abilities.map((a) => a.id), ["static", "lightningrod"]);
    assert.equal(pika.abilities[0].default, true);
    assert.equal(pika.abilities[1].default, false);
});

test("buildSpeciesRecord moves: only gen-legal, pool-validated moves", () => {
    const rec = buildSpeciesRecord(fixture(), "charizard", gen9);
    const ids = rec.moves.map((m) => m.id);
    // gen9-learnable + in pool: flamethrower, dragonpulse
    assert.ok(ids.includes("flamethrower"));
    assert.ok(ids.includes("dragonpulse"));
    // roost is not gen9-learnable in the fixture
    assert.ok(!ids.includes("roost"));
    // ghostbolt is gen9-learnable but was dropped from the move pool → excluded
    assert.ok(!ids.includes("ghostbolt"));
    // move record carries id/name/type/category/power (power null for Status)
    const roost = rec.moves.find((m) => m.id === "dragonpulse");
    assert.equal(roost.type, "dragon");
    assert.equal(roost.category, "Special");
    assert.equal(roost.power, 85);
});

test("buildSpeciesRecord is generation-sensitive (same species, different gen)", () => {
    const c9 = buildSpeciesRecord(fixture(), "charizard", gen9);
    const c8 = buildSpeciesRecord(fixture(), "charizard", gen8);
    // roost is gen8-learnable but not gen9
    assert.ok(c8.moves.some((m) => m.id === "roost"));
    assert.ok(!c9.moves.some((m) => m.id === "roost"));
    // pika flamethrower: gen5-only, so not in gen9
    const pika9 = buildSpeciesRecord(fixture(), "pikachu", gen9);
    assert.ok(!pika9.moves.some((m) => m.id === "flamethrower"));
    const pika5 = buildSpeciesRecord(fixture(), "pikachu", "gen5ou");
    assert.ok(pika5.moves.some((m) => m.id === "flamethrower"));
});

test("buildSpeciesRecord items: standard pool gated by generation, \"\" leads", () => {
    const g4 = buildSpeciesRecord(fixture(), "charizard", gen4);
    // "" leads the pool
    assert.equal(g4.items[0], "");
    // gen4 standard items present, gen5 item + all non-standard excluded
    assert.ok(g4.items.includes("choicescarf"));
    assert.ok(g4.items.includes("lifeorb"));
    assert.ok(g4.items.includes("leftovers"));
    assert.ok(!g4.items.includes("gen5item"), "gen5 item not in gen4 pool");
    assert.ok(!g4.items.includes("ancientbell"), "Past excluded");
    assert.ok(!g4.items.includes("futureitem"), "Future excluded");
    assert.ok(!g4.items.includes("capitem"), "CAP excluded");
    // gen9 pool gains the gen5 item
    const g9 = buildSpeciesRecord(fixture(), "charizard", gen9);
    assert.ok(g9.items.includes("gen5item"));
    assert.ok(!g9.items.includes("ancientbell"), "Past still excluded at gen9");
});

test("buildSpeciesRecord forme falls back to base species' learnset", () => {
    // charizardmegax has no learnset of its own; base 'charizard' supplies it
    const rec = buildSpeciesRecord(fixture(), "charizardmegax", gen9);
    assert.equal(rec.species, "Charizard-Mega-X");
    assert.deepEqual(rec.types, ["fire", "dragon"]);
    assert.ok(rec.moves.some((m) => m.id === "flamethrower"));
});

test("buildSpeciesRecord returns null for an unknown species", () => {
    assert.equal(buildSpeciesRecord(fixture(), "notasp", gen9), null);
});

test("buildRecordsForSpecies returns the pinned two-level shape", () => {
    const out = buildRecordsForSpecies(fixture(), ["charizard", "pikachu"], [gen9, gen8]);
    assert.deepEqual(Object.keys(out).sort(), ["charizard", "pikachu"]);
    assert.deepEqual(Object.keys(out.charizard).sort(), [gen8, gen9]);
    assert.equal(out.charizard[gen9].species, "Charizard");
    assert.equal(out.pikachu[gen8].species, "Pikachu");
});

test("buildSpeciesList returns sorted pokedex species ids", () => {
    const list = buildSpeciesList(fixture());
    assert.deepEqual(list, ["charizard", "charizardmegax", "pikachu"]);
});

// --- module-wide fetch cache (injectable fetchFn; no network in the test) ---

test("loadShowdownIndex caches the fetch (fetchFn called once)", async () => {
    // The module-wide promise means a second call must NOT refetch. We assert
    // idempotency: the first load triggers the fetch batch, the second returns
    // the same cached object without refetching (fetchFn call-count frozen).
    // Each fetchFn call gets its own Response (Response.body is one-shot).
    let calls = 0;
    const fakeFetch = () => {
        calls += 1;
        return Promise.resolve(new Response(JSON.stringify(fixture()), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
    };
    const first = await loadShowdownIndex(fakeFetch);
    const afterFirst = calls;
    assert.ok(afterFirst >= 4, "first load runs the 4-source fetch batch");
    const second = await loadShowdownIndex(fakeFetch);
    assert.equal(calls, afterFirst, "second load does not refetch (cached)");
    assert.equal(first, second, "same cached object returned");
});
