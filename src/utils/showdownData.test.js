import test from "node:test";
import assert from "node:assert/strict";
import {
    genFromFormat,
    parseCommonJSDump,
    buildSpeciesRecord,
    buildRecordsForSpecies,
    buildSpeciesList,
    buildSpeciesListForGen,
    GEN_DEX_END,
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
        // `requiredItem` is the D1 (fix 4) form-gate flag: this forme only
        // battles while the Mega Stone is held.
        charizardmegax: {
            num: 6,
            name: "Charizard-Mega-X",
            baseSpecies: "Charizard",
            forme: "Mega-X",
            requiredItem: "Charizardite X",
            types: ["Fire", "Dragon"],
            abilities: { "0": "Tough Claws" },
        },
        // Gmax forme (D1 fix 4): forme "Gmax" — runs its base form in v1
        // (the dump carries no equippable Gmax item, so the gate item is "").
        charizardgmax: {
            num: 6,
            name: "Charizard-Gmax",
            baseSpecies: "Charizard",
            forme: "Gmax",
            types: ["Fire", "Flying"],
            abilities: { "0": "Solar Power" },
        },
        pikachugmax: {
            num: 25,
            name: "Pikachu-Gmax",
            baseSpecies: "Pikachu",
            forme: "Gmax",
            types: ["Electric"],
            abilities: { "0": "Static" },
        },
        // base species with a third (slot "1") ability
        pikachu: {
            num: 25,
            name: "Pikachu",
            types: ["Electric"],
            abilities: { "0": "Static", "1": "Lightning Rod" },
        },
        // G4 (single-gen window): the card's grounding species. The pokedex dump
        // has no per-gen field, so `num` (the intro dex number) is the
        // availability discriminator: a species belongs to generation G iff
        // num is in (GEN_DEX_END[G-1], GEN_DEX_END[G]]. Id forms match the live
        // dump (no num-suffix on the base id; forme sub-ids are separate keys):
        //   abomasnow #460 + garchomp #445 are gen-4 mons (below the offered
        //   floors) — never in an offered-gen pool.
        //   victini #494 sits just inside the gen-5 window floor (493,649].
        //   palafin #964 + ogerpon #1017 are gen9-only (the card's examples).
        //   pecharunt #1025 sits exactly at the gen9 window end (1025) — the
        //   "mon at the boundary" case.
        abomasnow: {
            num: 460,
            name: "Abomasnow",
            types: ["Grass", "Ice"],
            abilities: { "0": "Snow Warning" },
        },
        garchomp: {
            num: 445,
            name: "Garchomp",
            types: ["Ground", "Dragon"],
            abilities: { "0": "Sand Veil" },
        },
        victini: {
            num: 494,
            name: "Victini",
            types: ["Psychic", "Fire"],
            abilities: { "0": "Victory Star" },
        },
        palafin: {
            num: 964,
            name: "Palafin",
            types: ["Water"],
            abilities: { "0": "Torrent" },
        },
        ogerpon: {
            num: 1017,
            name: "Ogerpon",
            types: ["Grass"],
            abilities: { "0": "Moxie" },
        },
        pecharunt: {
            num: 1025,
            name: "Pecharunt",
            types: ["Poison", "Ground"],
            abilities: { "0": "Poison Point" },
        },
        // G2: a forme sub-id with NO `num` (the 37 live num-less formes, e.g.
        // Burmy-Sandy) — must be dropped by the gen pool, never a crash.
        burmysandy: {
            num: undefined,
            name: "Burmy-Sandy",
            baseSpecies: "Burmy",
            forme: "Sandy",
            types: ["Bug"],
            abilities: { "0": "Shrink" },
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
        choicescarf: { name: "Choice Scarf", gen: 4, shortDesc: "Holder's Speed is 1.5×." },
        lifeorb: { name: "Life Orb", gen: 4, shortDesc: "Holder's attacks do 1.3× damage; loses 1/10 max HP." },
        leftovers: { name: "Leftovers", gen: 2, shortDesc: "At end of every turn, holder restores 1/16 of its max HP." },
        // P2 (fix 1): an item with only `desc` (no shortDesc) — the effect
        // text must fall back to desc.
        mysticwater: { name: "Mystic Water", gen: 8, desc: "Mystic Water: weak healing item." },
        // D1 (fix 4): the Charizard-Mega-X gate item. toID("Charizardite X")
        // = "charizarditex" (the live dump's key — spaces stripped), so the
        // formGate carries item id "charizarditex". A dump gap (no matching
        // key) degrades the gate item to "" (no equippable gate).
        charizarditex: { name: "Charizardite X", gen: 6 },
        // Past/Future/CAP must be excluded from the standard pool
        ancientbell: { name: "Ancient Bell", gen: 8, isNonstandard: "Past" },
        futureitem: { name: "Future Item", gen: 9, isNonstandard: "Future" },
        capitem: { name: "CAP Item", gen: 9, isNonstandard: "CAP" },
        // an item only available from gen5 — excluded from gen4 pools
        gen5item: { name: "Gen 5 Item", gen: 5 },
    },
    // P2 (fix 2): the same-host abilities dump (BattleAbilities shape —
    // shortDesc/desc per ability). The lane enriches record.abilityDescriptions
    // from this; unknown abilities degrade to "" (additive).
    abilities: {
        blaze: { name: "Blaze", shortDesc: "At 1/3 or less of its max HP, this Pokemon's Fire moves have 1.5× power." },
        solarpower: { name: "Solar Power", desc: "If Sun is active, this Pokemon's Sp. Atk is 1.5×; loses 1/8 max HP per turn." },
        static: { name: "Static", shortDesc: "30% chance a Pokemon making contact with this Pokemon will be paralyzed." },
        lightningrod: { name: "Lightning Rod", desc: "This Pokemon is immune to Electric-type moves and raises Sp. Atk by 1." },
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
        "abilities", "abilityDescriptions", "dexNum", "formGate", "gatedForms", "isGmax",
        "isMega", "itemEffects", "itemNames", "items",
        "levelRange", "moves", "natures", "species", "types",
    ]);
    assert.equal(rec.species, "Charizard");
    assert.equal(rec.dexNum, 6);
    assert.deepEqual(rec.types, ["fire", "flying"]);
    assert.deepEqual(rec.levelRange, { min: 5, max: 100 });
    assert.equal(rec.natures.length, 25);
    assert.ok(rec.natures.includes("hardy"));
    assert.ok(rec.natures.includes("jolly"));
    // D1 (fix 4) gate fields on a base species: flags default false, and the
    // base record lists the gated sibling formes (gatedForms).
    assert.equal(rec.isMega, false);
    assert.equal(rec.isGmax, false);
    assert.equal(rec.formGate, null, "no formGate on a base record");
    assert.ok(Array.isArray(rec.gatedForms), "base record exposes its gated formes");
    const mega = rec.gatedForms.find((f) => f.form === "charizardmegax");
    assert.equal(mega.itemName, "Charizardite X");
    assert.equal(mega.item, "charizarditex", "the gate item id (toID of the item name)");
    const gmax = rec.gatedForms.find((f) => f.form === "charizardgmax");
    assert.equal(gmax.item, "", "Gmax has no equippable v1 item (gate item \"\")");
});

// P2 (fix 1): the record ships itemNames (id -> display) and itemEffects
// (id -> effect text), keyed by the same item id the wire value uses. The
// wire item value stays the Showdown id; only display changes.
test("buildSpeciesRecord ships itemNames + itemEffects keyed by item id", () => {
    const rec = buildSpeciesRecord(fixture(), "charizard", gen9);
    // known id maps to its dump name (with spaces)
    assert.equal(rec.itemNames.lifeorb, "Life Orb");
    assert.equal(rec.itemNames.leftovers, "Leftovers");
    assert.equal(rec.itemNames[""], "", "\"\" entry is empty");
    // effect text prefers shortDesc, falls back to desc, else ""
    assert.equal(rec.itemEffects.lifeorb, "Holder's attacks do 1.3× damage; loses 1/10 max HP.");
    assert.equal(
        rec.itemEffects.mysticwater,
        "Mystic Water: weak healing item.",
        "item with only desc uses the desc fallback",
    );
    assert.equal(rec.itemEffects.charizarditex, "", "no desc/shortDesc -> \"\"");
    // every item in the pool has a name entry
    for (const id of rec.items) {
        assert.ok(id in rec.itemNames, `itemNames covers pool id "${id}"`);
        assert.ok(id in rec.itemEffects, `itemEffects covers pool id "${id}"`);
    }
});

// P2 (fix 2): the record ships abilityDescriptions keyed by ability id for
// the species' own ability pool. Unknown/dump-absent abilities map to "".
test("buildSpeciesRecord ships abilityDescriptions for the ability pool", () => {
    const rec = buildSpeciesRecord(fixture(), "charizard", gen9);
    // charizard pool: blaze (default) + solarpower (hidden)
    assert.ok("blaze" in rec.abilityDescriptions);
    assert.ok("solarpower" in rec.abilityDescriptions);
    assert.equal(
        rec.abilityDescriptions.blaze,
        "At 1/3 or less of its max HP, this Pokemon's Fire moves have 1.5× power.",
        "shortDesc wins",
    );
    assert.equal(
        rec.abilityDescriptions.solarpower,
        "If Sun is active, this Pokemon's Sp. Atk is 1.5×; loses 1/8 max HP per turn.",
        "desc fallback when no shortDesc",
    );
    // every pooled ability id has an entry (even if "")
    for (const ab of rec.abilities) {
        assert.ok(ab.id in rec.abilityDescriptions, `abilityDescriptions covers ${ab.id}`);
    }
});

// P2 (fix 2, additive): a record built from data WITHOUT an abilities dump
// still renders — every ability description degrades to "".
test("buildSpeciesRecord without an abilities dump still renders (additive)", () => {
    const data = fixture();
    delete data.abilities; // simulate the abilities.js fetch degrading to {}
    const rec = buildSpeciesRecord(data, "charizard", gen9);
    assert.ok(rec, "record still built");
    assert.ok("blaze" in rec.abilityDescriptions, "ability key still present");
    assert.equal(rec.abilityDescriptions.blaze, "", "unknown dump -> \"\" (never a wrong desc)");
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

test("buildSpeciesList returns sorted pokedex species ids (incl. forme sub-ids)", () => {
    const list = buildSpeciesList(fixture());
    assert.deepEqual(list, [
        "abomasnow", "burmysandy", "charizard", "charizardgmax", "charizardmegax",
        "garchomp", "ogerpon", "palafin", "pecharunt",
        "pikachu", "pikachugmax", "victini",
    ]);
});

// G4 (single-gen window): the picker's pool for generation G is ONLY that
// generation's introductions — the num window (GEN_DEX_END[G-1],
// GEN_DEX_END[G]] (strict lower, inclusive upper). G2's cumulative rule
// (num <= end[G]) is gone: gen-4 mons (Abomasnow #460, Garchomp #445) are
// hidden under every offered gen (5–9), gen-9 mons (Ogerpon #1017, Palafin
// #964) are hidden under older gens, and a num-less forme sub-id (burmysandy)
// never appears in any pool and never crashes the filter.
test("GEN_DEX_END carries the G4 floor (gen 4) next to the gen 5–9 ends", () => {
    // The 4:493 entry exists solely as the FLOOR of the Gen 5 window; gens
    // 5–9 are the ones PARTY_FORMATS offers.
    assert.deepEqual(GEN_DEX_END, { 4: 493, 5: 649, 6: 721, 7: 809, 8: 905, 9: 1025 });
});

test("buildSpeciesListForGen gen5: the single-gen window (493,649] — Victini in, older mons out", () => {
    const pool = buildSpeciesListForGen(fixture(), 5);
    assert.ok(pool.includes("victini"), "Victini #494 is just inside the gen5 floor → shown");
    assert.ok(!pool.includes("charizard"), "Charizard #6 < floor 493 → hidden (Gen 1 mon)");
    assert.ok(!pool.includes("abomasnow"), "Abomasnow #460 < floor 493 → hidden");
    assert.ok(!pool.includes("garchomp"), "Garchomp #445 < floor 493 → hidden");
    assert.ok(!pool.includes("ogerpon"), "Ogerpon #1017 > end 649 → hidden");
    assert.ok(!pool.includes("palafin"), "Palafin #964 > end 649 → hidden");
    assert.ok(!pool.includes("pecharunt"), "Pecharunt #1025 > end 649 → hidden");
    // the num-less forme sub-id is dropped, not retained (and no crash).
    assert.ok(!pool.includes("burmysandy"), "num-less forme id is dropped, not retained");
});

test("buildSpeciesListForGen gen9: the single-gen window (905,1025] — Ogerpon/Palafin in, Garchomp out", () => {
    const pool = buildSpeciesListForGen(fixture(), 9);
    assert.ok(pool.includes("ogerpon"), "Ogerpon #1017 in (905,1025] → shown in gen9");
    assert.ok(pool.includes("palafin"), "Palafin #964 in (905,1025] → shown in gen9");
    assert.ok(pool.includes("pecharunt"), "Pecharunt #1025 == window end → shown (inclusive upper)");
    assert.ok(!pool.includes("garchomp"), "Garchomp #445 < floor 905 → hidden under a Gen 9 format");
    assert.ok(!pool.includes("abomasnow"), "Abomasnow #460 < floor 905 → hidden under a Gen 9 format");
    assert.ok(!pool.includes("charizard"), "Charizard #6 → hidden (Gen 1 mon)");
    assert.ok(!pool.includes("burmysandy"), "num-less forme still dropped in gen9");
});

test("buildSpeciesListForGen: a mon exactly at a window end (num==end) is in that gen only", () => {
    // Pecharunt #1025 is exactly the gen9 window end (inclusive upper):
    // shown in gen9, hidden in every offered older gen (their ends are lower).
    assert.ok(buildSpeciesListForGen(fixture(), 9).includes("pecharunt"), "gen9 window end 1025: shown");
    assert.ok(!buildSpeciesListForGen(fixture(), 8).includes("pecharunt"), "gen8 window (809,905]: hidden");
    // The same boundary logic for the card's gen9-only examples, one gen lower.
    assert.ok(!buildSpeciesListForGen(fixture(), 8).includes("ogerpon"), "Ogerpon #1017 > 905 → hidden in gen8");
    assert.ok(!buildSpeciesListForGen(fixture(), 8).includes("palafin"), "Palafin #964 > 905 → hidden in gen8");
    assert.ok(buildSpeciesListForGen(fixture(), 9).includes("ogerpon"), "…but shown in gen9");
});

test("buildSpeciesListForGen: an unknown gen returns an EMPTY pool, never the cumulative fallback", () => {
    // A gen not in GEN_DEX_END (3, 10, …) has no window: show NOTHING rather
    // than degrade to G2's cumulative rule. No crash, no partial pool.
    for (const gen of [3, 10, 0, undefined]) {
        assert.doesNotThrow(() => buildSpeciesListForGen(fixture(), gen), `gen ${gen} does not throw`);
        assert.deepEqual(buildSpeciesListForGen(fixture(), gen), [], `gen ${gen} → empty pool`);
    }
});

test("buildSpeciesListForGen: a num-less forme id never appears and never throws", () => {
    for (const gen of [3, 4, 5, 6, 7, 8, 9, 10]) {
        assert.doesNotThrow(() => buildSpeciesListForGen(fixture(), gen), `gen ${gen} does not throw`);
        assert.ok(!buildSpeciesListForGen(fixture(), gen).includes("burmysandy"), `gen ${gen} drops num-less forme`);
    }
});

// D1 (fix 4): a FORM record carries its formGate (the required item + the
// base it resolves to); the base record's gatedForms are covered above.
test("buildSpeciesRecord on a gated FORM carries its formGate", () => {
    const mega = buildSpeciesRecord(fixture(), "charizardmegax", gen9);
    assert.equal(mega.isMega, true);
    assert.equal(mega.isGmax, false);
    assert.deepEqual(mega.formGate, {
        form: "charizardmegax",
        base: "charizard",
        item: "charizarditex",
        itemName: "Charizardite X",
        formName: "Charizard-Mega-X",
        baseName: "Charizard",
    });

    const gmax = buildSpeciesRecord(fixture(), "charizardgmax", gen9);
    assert.equal(gmax.isMega, false);
    assert.equal(gmax.isGmax, true);
    assert.equal(gmax.formGate.item, "", "Gmax gate has no equippable v1 item");
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
    assert.ok(afterFirst >= 5, "first load runs the 5-source fetch batch (4 core + abilities)");
    const second = await loadShowdownIndex(fakeFetch);
    assert.equal(calls, afterFirst, "second load does not refetch (cached)");
    assert.equal(first, second, "same cached object returned");
});
