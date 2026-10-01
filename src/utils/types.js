const TYPE_COLORS = {
    normal: ["bg-neutral-100", "text-neutral-700"],
    fire: ["bg-orange-100", "text-orange-800"],
    water: ["bg-blue-100", "text-blue-800"],
    electric: ["bg-yellow-100", "text-yellow-800"],
    grass: ["bg-green-100", "text-green-800"],
    ice: ["bg-cyan-100", "text-cyan-800"],
    fighting: ["bg-red-100", "text-red-800"],
    poison: ["bg-purple-100", "text-purple-800"],
    ground: ["bg-amber-100", "text-amber-800"],
    flying: ["bg-sky-100", "text-sky-800"],
    psychic: ["bg-pink-100", "text-pink-800"],
    bug: ["bg-lime-100", "text-lime-800"],
    rock: ["bg-stone-100", "text-stone-700"],
    ghost: ["bg-violet-100", "text-violet-800"],
    dragon: ["bg-indigo-100", "text-indigo-800"],
    dark: ["bg-neutral-200", "text-neutral-700"],
    steel: ["bg-slate-200", "text-slate-700"],
    fairy: ["bg-fuchsia-100", "text-fuchsia-800"],
};

const TYPE_ABBR = {
    normal: "Nrm",
    fighting: "Fig",
    flying: "Fly",
    poison: "Psn",
    ground: "Grd",
    rock: "Rck",
    bug: "Bug",
    ghost: "Gst",
    steel: "Stl",
    fire: "Fir",
    water: "Wtr",
    grass: "Grs",
    electric: "Elc",
    psychic: "Psc",
    ice: "Ice",
    dragon: "Drg",
    dark: "Drk",
    fairy: "Fry",
};

const TAG_TONES = {
    neutral: ["bg-neutral-100", "text-neutral-700"],
    blue: ["bg-blue-50", "text-blue-800"],
};

const TYPE_ICON_BASE = "https://raw.githubusercontent.com/partywhale/pokemon-type-icons/main/icons";

export function typeIconUrl(type) {
    return `${TYPE_ICON_BASE}/${type}.svg`;
}

export function typeClasses(type) {
    return TYPE_COLORS[type] ?? TYPE_COLORS.normal;
}

export function typeAbbr(type) {
    return TYPE_ABBR[type] ?? type;
}

export function toneClasses(tone) {
    return TAG_TONES[tone] ?? TAG_TONES.neutral;
}
