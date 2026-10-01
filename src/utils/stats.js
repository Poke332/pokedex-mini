// Stat display labels. API slugs map to the game-standard abbreviations.
const STAT_LABELS = {
    hp: "HP",
    attack: "Attack",
    defense: "Defense",
    "special-attack": "Sp. Attack",
    "special-defense": "Sp. Defence",
    speed: "Speed",
};

// One distinct fill per stat so the six bars read as different data series.
const STAT_COLORS = {
    hp: "bg-red-600",
    attack: "bg-orange-500",
    defense: "bg-yellow-500",
    "special-attack": "bg-blue-600",
    "special-defense": "bg-purple-600",
    speed: "bg-emerald-600",
};

export function statLabel(slug) {
    return STAT_LABELS[slug] ?? slug;
}

export function statColorClass(slug) {
    return STAT_COLORS[slug] ?? "bg-blue-800";
}
