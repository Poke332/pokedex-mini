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
