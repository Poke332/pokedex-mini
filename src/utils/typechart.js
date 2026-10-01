// Pure type-chart logic. Given the type names and each type's
// damage_relations, build the single-type effectiveness matrix:
// matrix[atkIndex][defIndex] = 2 | 1 | 0.5 | 0

const contains = (list, defName) =>
    (list || []).some((t) => t.name === defName);

export function multiplierFor(atk, def, relations) {
    const rel = relations[atk] || {};
    if (contains(rel.no_damage_to, def)) return 0;
    if (contains(rel.double_damage_to, def)) return 2;
    if (contains(rel.half_damage_to, def)) return 0.5;
    return 1;
}

export function buildTypeMatrix(types, relations) {
    return types.map((atk) =>
        types.map((def) => multiplierFor(atk, def, relations))
    );
}

// Semantic cell data for a multiplier. Presentation (classes) lives in the
// component; this only returns the label text + a tone key.
export function cellMeta(mult) {
    switch (mult) {
        case 2:
            return { text: "2×", tone: "super" };
        case 0.5:
            return { text: "½", tone: "weak" };
        case 0:
            return { text: "×", tone: "immune" };
        default:
            return { text: "", tone: "neutral" };
    }
}

// D1 (fix 3): combined move->foe effectiveness for the move tooltip.
// The single-type matrix (multiplierFor) composed across the FOE's type
// list: 0 short-circuits (immune); otherwise the product is rounded to the
// nearest QUARTER-step, so duelling doubles read as "4×" (not "4") and
// stacked weak resistances keep their legitimate 0.25× ("¼×").
export function effectivenessFor(atkType, defTypes, relations) {
    if (!atkType || !Array.isArray(defTypes) || defTypes.length === 0 || !relations) return null;
    let product = 1;
    for (const def of defTypes) {
        const m = multiplierFor(atkType, def, relations);
        if (m === 0) return 0;
        product *= m;
    }
    return Math.round(product * 4) / 4;
}

// Human label + tone for a combined multiplier (the tooltip copy).
// null/undefined (uncomputable — no atk type, unknown foe types, or a
// move with no power) renders "—", never a guessed number.
export function effectivenessLabel(mult) {
    if (mult == null) return { text: "—", tone: "neutral" };
    if (mult === 0) return { text: "No effect", tone: "immune" };
    if (mult === 2) return { text: "Super effective (2×)", tone: "super" };
    if (mult === 4) return { text: "Highly effective (4×)", tone: "super" };
    if (mult === 0.5) return { text: "Not very effective (½×)", tone: "weak" };
    if (mult === 0.25) return { text: "Very weak (¼×)", tone: "weak" };
    return { text: "Neutral", tone: "neutral" };
}
