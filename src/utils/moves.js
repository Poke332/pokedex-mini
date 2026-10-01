import { toProperCase, parseIdFromUrl } from "./api";

// Rank mainline version groups newest-first; the table reads origin + level
// from the most recent group that contains the move.
const GROUP_RANK = {
    "scarlet-violet": 9,
    "brilliant-diamond-shining-pearl": 8,
    "omega-ruby-alpha-sapphire": 7,
    "x-y": 6,
    "heartgold-soulsilver": 5,
    "diamond-pearl": 4,
    "platinum": 3,
    "black-2-white-2": 2,
    "black-white": 1,
};

// PokeAPI move_learn_method names -> how the Pokemon acquires the move.
const METHOD_LABEL = {
    "level-up": "Level Up",
    machine: "Machine",
    "hidden-machine": "Hidden Machine",
    tutor: "Move Tutor",
    egg: "Egg Move",
    stadium: "Stadium",
    train: "Training",
};

function newestDetail(details) {
    const rank = (d) => GROUP_RANK[d.version_group.name] ?? 0;
    return details.reduce((best, d) => (rank(d) > rank(best) ? d : best));
}

export function buildMovesTable(moves, moveDataByName) {
    return (moves || []).map((entry) => {
        const moveName = entry.move?.name;
        const res = (moveDataByName || {})[moveName] || null;
        const name = toProperCase(moveName);

        let origin = "";
        let learned = "";
        if (entry.version_group_details?.length) {
            const detail = newestDetail(entry.version_group_details);
            origin = toProperCase(detail.version_group.name);
            if (detail.level_learned_at > 0) {
                learned = `Lv ${detail.level_learned_at}`;
            } else {
                const method = detail.move_learn_method?.name;
                learned = METHOD_LABEL[method] ?? toProperCase(method ?? "unknown");
            }
        }

        const power = res?.power;
        const pp = res?.pp;
        const type = res?.type ?? null;

        return {
            name,
            origin,
            learned,
            power: power != null ? power : "—",
            pp: pp != null ? pp : "—",
            type,
            status: res ? "ok" : "pending",
        };
    });
}

// --- move display helpers ----------------------------------------------------

export function moveLabel(move) {
    return toProperCase(move.name);
}

// Move type as a badge-ready type name, or null (status moves have no type).
export function moveType(move) {
    return move?.type?.name ?? null;
}

export function moveDamageClass(move) {
    return move?.damage_class?.name ? toProperCase(move.damage_class.name) : null;
}

export function movePower(move) {
    return move?.power != null ? move.power : null;
}

export function movePP(move) {
    return move?.pp != null ? move.pp : null;
}

export function moveAccuracy(move) {
    return move?.accuracy != null ? move.accuracy : null;
}

// English effect text, falling back to any language with text.
export function moveEffectText(move) {
    const entries = move?.effect_entries || [];
    const en = entries.find((e) => e.language?.name === "en" && e.effect?.trim());
    const any = entries.find((e) => e.effect?.trim());
    return (en || any)?.effect || null;
}

export function moveAilment(move) {
    return move?.meta?.ailment?.name ? toProperCase(move.meta.ailment.name) : null;
}

export function moveMachines(move) {
    return move?.machines || [];
}

export function machineIdFromUrl(url) {
    return parseIdFromUrl(url);
}
