import { toProperCase } from "./api";

// Human label for how a child is reached from its parent, from an
// evolution_details entry. Null for the base form or when nothing is stated.
function conditionLabel(detail) {
    if (!detail) return null;
    const parts = [];
    if (detail.min_level && detail.min_level > 0) parts.push(`Level ${detail.min_level}`);
    if (detail.item?.name) parts.push(`Use ${toProperCase(detail.item.name)}`);
    if (detail.min_happiness != null) parts.push("High friendship");
    if (detail.min_beauty != null) parts.push("High beauty");
    if (detail.min_affinity != null) parts.push("High affinity");
    const trigger = detail.trigger?.name;
    if (trigger && !parts.includes(toProperCase(trigger))) parts.push(toProperCase(trigger));
    if (parts.length) return parts.join(" · ");
    if (detail.version_group?.name) return `In ${toProperCase(detail.version_group.name)}`;
    return null;
}

// Walk PokeAPI's recursive evolution chain into a renderable tree. Each node:
// { name, condition (how to reach it from its parent), children: [childNode] }.
// NOTE: children is always an array of node objects. The recursive call returns
// the subtree's children array (walk(c).children), NOT the subtree object, so a
// line of N generations keeps all N levels instead of collapsing at depth 2.
export function buildEvolutionTree(chain) {
    if (!chain) return null;
    const walk = (node) => {
        const child = (node.evolves_to || []).map((c) => ({
            name: c.species?.name,
            condition: conditionLabel(c.evolution_details?.[0]),
            children: walk(c).children,
        }));
        return { name: node.species?.name, condition: null, children: child };
    };
    return walk(chain);
}
