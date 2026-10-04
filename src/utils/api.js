const baseURL = 'https://pokeapi.co/api/v2';

// Fast bulk move table (power / pp / accuracy for every move, keyed by
// english name): one ~235KB static file served from raw.githubusercontent.com
// (same host already used for sprites). Used as a performance source only.
// pokedexapi.dev was tested as an alternative but does not resolve here;
// veekun/Showdown dumps 404 on their current paths.
const BULK_MOVES_URL = "https://raw.githubusercontent.com/Purukitto/pokemon-data.json/master/moves.json";

const toProperCase = (str) =>
  (str ?? "")
    .split(/[-\s]/)                          // split on hyphens and spaces
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

async function fetchJson(url, label, timeoutMs) {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to load ${label}: ${response.status}`, { cause: response });
        return await response.json();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const getPokemons = async (offset = 0, limit = 20) => {
    return fetchJson(`${baseURL}/pokemon?offset=${offset}&limit=${limit}`, "Pokemons");
}

const getPokemonByName = async (name) => {
    return fetchJson(`${baseURL}/pokemon/${name}`, `pokemon with the name ${name}`);
}

const parseIdFromUrl = (url) => {
    if (!url) throw new Error("parseIdFromUrl: missing url");
    const parts = url.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

const getSpriteUrl = (id) => {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

const getSpecies = async (url) => {
    return fetchJson(url, "species");
}

const getEvolutionChain = async (url) => {
    return fetchJson(url, "evolution chain");
}

const getEncounters = async (url) => {
    return fetchJson(url, "encounters");
}

// --- move resources (power / pp) ------------------------------------------
// Primary: the fast bulk file. Fallback: authoritative per-move PokeAPI
// fetches for anything the bulk source misses (or when it fails), cached so a
// re-visit or page switch is instant. This guarantees power/pp always resolve.

const normalizeName = (s) => s.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

// Bulk numeric ids do NOT match PokeAPI move ids (bulk id 5 is Mega Punch,
// PokeAPI move 5 is Thunder Punch), so the bulk source is joined on name.
let bulkMovesPromise = null;
const loadBulkMoves = () => {
    if (!bulkMovesPromise) {
        bulkMovesPromise = fetchJson(BULK_MOVES_URL, "bulk moves", 20000).catch(() => null);
    }
    return bulkMovesPromise;
};

const toNumber = (v) => {
    if (v === null || v === undefined || v === "" || v === "—") return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
};

// Cache of authoritative per-move PokeAPI records, keyed by move URL.
const moveByURLCache = new Map();

const fetchMoveByURL = async (url) => {
    if (moveByURLCache.has(url)) return moveByURLCache.get(url);
    try {
        const m = await fetchJson(url, "move", 20000);
        const rec = {
            power: m.power != null ? m.power : null,
            pp: m.pp != null ? m.pp : null,
            type: m.type?.name ?? null,
        };
        moveByURLCache.set(url, rec);
        return rec;
    } catch {
        moveByURLCache.set(url, null);
        return null;
    }
};

const fetchMissingMoves = async (urls, concurrency = 10) => {
    const result = new Map();
    const queue = [...urls];
    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, queue.length)) },
        async () => {
            while (queue.length) {
                const url = queue.shift();
                const rec = await fetchMoveByURL(url);
                result.set(url, rec);
            }
        }
    );
    await Promise.all(workers);
    return result;
};

// Fetch power / pp for pokemon.moves entries (each has move.name + move.url).
// Fast bulk source first; per-move PokeAPI fills any gap.
const getMoveResources = async (moveEntries) => {
    const entries = (moveEntries || []).filter((e) => e?.move?.name);
    const names = [...new Set(entries.map((e) => e.move.name))];
    const out = {};

    const bulk = await loadBulkMoves();
    if (bulk) {
        const byName = new Map(bulk.map((m) => [normalizeName(m.name?.english ?? ""), m]));
        for (const name of names) {
            const m = byName.get(normalizeName(name));
            out[name] = m
                ? { power: toNumber(m.power), pp: toNumber(m.pp), type: m.type ? normalizeName(m.type) : null }
                : null;
        }
    }

    const missingURLs = entries
        .filter((e) => out[e.move.name] == null)
        .map((e) => e.move.url);
    if (missingURLs.length) {
        const fetched = await fetchMissingMoves(new Set(missingURLs));
        for (const e of entries) {
            if (out[e.move.name] == null) {
                const rec = fetched.get(e.move.url);
                out[e.move.name] = rec || null;
            }
        }
    }
    return out;
}

// --- type damage relations --------------------------------------------------

// The 18 in-game types, in PokeAPI id order. The /type list also returns
// legacy/placeholder entries (shadow, stellar, unknown) which are excluded.
const TYPE_NAMES = [
    "normal", "fighting", "flying", "poison", "ground", "rock", "bug",
    "ghost", "steel", "fire", "water", "grass", "electric", "psychic",
    "ice", "dragon", "dark", "fairy",
];

let typeRelationsPromise = null;

// Fetch damage_relations for every type (one list call + 18 detail calls,
// cached module-wide). Returns { types: string[], relations: Record<name, rel> }.
const getTypeDamageRelations = async () => {
    if (typeRelationsPromise) return typeRelationsPromise;
    typeRelationsPromise = (async () => {
        const details = await Promise.all(
            TYPE_NAMES.map((n) => fetchJson(`${baseURL}/type/${n}`, `type ${n}`))
        );
        const relations = {};
        for (const t of details) {
            relations[t.name] = t.damage_relations || {};
        }
        return { types: TYPE_NAMES, relations };
    })();
    return typeRelationsPromise;
};

// --- pokedex types for grid cards -------------------------------------------

// The /pokemon list endpoint returns only { name, url } (no types), so grid
// cards resolve types with per-item pokemon fetches, deduped and cached
// module-wide: paginating back to a seen pokemon costs nothing.
const typesByNameCache = new Map();

const getTypesByPokedexName = async (results, concurrency = 10) => {
    const items = (results || []).filter((r) => r?.name);
    const pending = items.filter((r) => !typesByNameCache.has(r.name));
    const queue = [...pending];
    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, queue.length)) },
        async () => {
            while (queue.length) {
                const r = queue.shift();
                try {
                    const data = await fetchJson(`${baseURL}/pokemon/${r.name}`, `pokemon ${r.name}`);
                    typesByNameCache.set(r.name, (data.types || []).map((t) => t.type?.name));
                } catch {
                    typesByNameCache.set(r.name, null);
                }
            }
        }
    );
    await Promise.all(workers);
    const out = {};
    for (const r of items) out[r.name] = typesByNameCache.get(r.name) || null;
    return out;
};

// --- berries ---------------------------------------------------------------

const getBerries = async () => {
    return fetchJson(`${baseURL}/berry?limit=100`, "berries");
}

const getBerry = async (name) => {
    return fetchJson(`${baseURL}/berry/${name}`, `berry ${name}`);
}

// The /berry list endpoint returns bare { name, url } entries, so grid card
// fields (sprite, growth, flavors) only exist on the single berry resource.
// Batch-fetch them with a module-wide cache + capped concurrency, decoupled
// from the grid's loading gate so cards can fill in progressively.
const berryDetailsCache = new Map();

const fetchBerryDetailByURL = async (url) => {
    if (berryDetailsCache.has(url)) return berryDetailsCache.get(url);
    try {
        const data = await fetchJson(url, "berry detail", 20000);
        berryDetailsCache.set(url, data);
        return data;
    } catch {
        berryDetailsCache.set(url, null);
        return null;
    }
}

const getBerryDetails = async (berries, concurrency = 10) => {
    const missing = berries.filter((b) => !berryDetailsCache.has(b.url));
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const b = queue.shift();
            await fetchBerryDetailByURL(b.url);
        }
    });
    await Promise.all(workers);
    const out = {};
    for (const b of berries) out[b.name] = berryDetailsCache.get(b.url) || null;
    return out;
};

// --- items ------------------------------------------------------------------

const getItems = async (offset = 0, limit = 20) => {
    return fetchJson(`${baseURL}/item?offset=${offset}&limit=${limit}`, "items");
}

const getItem = async (name) => {
    return fetchJson(`${baseURL}/item/${name}`, `item ${name}`);
}

// The /item list returns bare { name, url }; card fields (sprite, category)
// live on the single item resource. Batch + cache per-page so the grid
// renders immediately and cards fill in progressively (revisits are free).
const itemDetailCache = new Map();

const fetchItemDetailByURL = async (url) => {
    if (itemDetailCache.has(url)) return itemDetailCache.get(url);
    try {
        const data = await fetchJson(url, "item detail", 20000);
        itemDetailCache.set(url, data);
        return data;
    } catch {
        itemDetailCache.set(url, null);
        return null;
    }
}

const getItemDetails = async (items, concurrency = 10) => {
    const missing = items.filter((i) => !itemDetailCache.has(i.url));
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const i = queue.shift();
            await fetchItemDetailByURL(i.url);
        }
    });
    await Promise.all(workers);
    const out = {};
    for (const i of items) out[i.name] = itemDetailCache.get(i.url) || null;
    return out;
};

// --- moves & machines -------------------------------------------------------

// Free-form query -> PokeAPI slug ("Thunder Bolt" -> "thunder-bolt").
// PokeAPI lookups are case-insensitive; only the hyphen spacing matters.
const slugify = (input) => (input || "").trim().toLowerCase().replace(/\s+/g, "-");

const getMoves = async (offset = 0, limit = 20) => {
    return fetchJson(`${baseURL}/move?offset=${offset}&limit=${limit}`, "moves");
}

const getMove = async (name) => {
    return fetchJson(`${baseURL}/move/${name}`, `move ${name}`);
}

// /move list returns bare { name, url }; card fields (type, power, pp) live
// on the single move resource. Batch + cache per page so the grid renders
// immediately and fills in progressively (revisits cost nothing).
const moveDetailCache = new Map();

const fetchMoveDetailByURL = async (url) => {
    if (moveDetailCache.has(url)) return moveDetailCache.get(url);
    try {
        const data = await fetchJson(url, "move detail", 20000);
        moveDetailCache.set(url, data);
        return data;
    } catch {
        moveDetailCache.set(url, null);
        return null;
    }
}

const getMoveDetails = async (moves, concurrency = 10) => {
    const missing = moves.filter((m) => !moveDetailCache.has(m.url));
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const m = queue.shift();
            await fetchMoveDetailByURL(m.url);
        }
    });
    await Promise.all(workers);
    const out = {};
    for (const m of moves) out[m.name] = moveDetailCache.get(m.url) || null;
    return out;
};

const getMachines = async (offset = 0, limit = 20) => {
    return fetchJson(`${baseURL}/machine?offset=${offset}&limit=${limit}`, "machines");
}

const getMachine = async (id) => {
    return fetchJson(`${baseURL}/machine/${id}`, `machine ${id}`);
}

// /machine list returns bare URLs (no names at all), so even card identity
// (item, move, version group) only exists on the single machine resource.
const machineDetailCache = new Map();

const fetchMachineDetailByURL = async (url) => {
    if (machineDetailCache.has(url)) return machineDetailCache.get(url);
    try {
        const data = await fetchJson(url, "machine detail", 20000);
        machineDetailCache.set(url, data);
        return data;
    } catch {
        machineDetailCache.set(url, null);
        return null;
    }
}

const getMachineDetails = async (machines, concurrency = 10) => {
    const missing = machines.filter((m) => !machineDetailCache.has(m.url));
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const m = queue.shift();
            await fetchMachineDetailByURL(m.url);
        }
    });
    await Promise.all(workers);
    const out = {};
    for (const m of machines) out[m.url] = machineDetailCache.get(m.url) || null;
    return out;
};

export {
    getPokemons,
    getSpriteUrl,
    parseIdFromUrl,
    getPokemonByName,
    toProperCase,
    getSpecies,
    getEvolutionChain,
    getEncounters,
    getMoveResources,
    getTypeDamageRelations,
    getTypesByPokedexName,
    getBerries,
    getBerry,
    getBerryDetails,
    getItems,
    getItem,
    getItemDetails,
    slugify,
    getMoves,
    getMove,
    getMoveDetails,
    getMachines,
    getMachine,
    getMachineDetails
};
