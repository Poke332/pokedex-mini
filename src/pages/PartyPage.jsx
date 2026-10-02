import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSpeciesListForGen, getRecordsForSpecies, genFromFormat } from "../utils/showdownData";
import { blankSet, buildTeam } from "../utils/pokemonSets";
import { loadParty, saveParty, resetParty } from "../utils/partyStore";
import { validateTeam } from "../utils/simService";
import { PARTY_FORMATS, unresolvedMoves, setFormatIssues } from "../utils/party";
import SearchBar from "../components/SearchBar";
import EmptySlotCard from "../components/party/EmptySlotCard";
import FilledSlotCard from "../components/party/FilledSlotCard";
import CandidateCard from "../components/party/CandidateCard";
import SetEditor from "../components/party/SetEditor";

const TEAM_SIZE = 6;
const PER_PAGE = 20;
const SEARCH_LIMIT = 24;

// Merge a stored team slot onto a fresh blank set so every draft is complete
// (the data lane may still be loading, so record-derived defaults are applied
// where they exist). `rec` is the C2 §4 record or null.
const hydrateSet = (stored, rec) => {
    const base = blankSet(stored?.species, rec);
    const merged = { ...base, ...stored };
    merged.moves = (Array.isArray(stored?.moves) ? stored.moves : base.moves)
        .map((m) => String(m ?? ""))
        .concat(["", "", "", ""])
        .slice(0, 4);
    if (!merged.ability && rec?.abilities?.length) {
        merged.ability = rec.abilities.find((a) => a.default)?.id ?? rec.abilities[0]?.id;
    }
    return merged;
};

/**
 * C5 — /party: the team builder. Picks up to 6 Pokémon from the SHOWDOWN data
 * lane (tier-legal moves/abilities/items per C2 §4), edits each set's 4 moves,
 * ability, item, level, IVs, EVs, nature and type metadata, persists the party
 * in versioned localStorage, and gates "Start battle" on the C4 service's
 * POST /team/validate before handing off to /battle (C6).
 */
export default function PartyPage() {
    const navigate = useNavigate();

    // --- party state (hydrated from versioned localStorage on first render) ---
    const [party] = useState(loadParty);
    // G2 back-compat: a stored format still in PARTY_FORMATS loads as-is; a
    // format id that no longer exists in the list (an old/foreign value)
    // falls back to the default instead of leaving a blank select.
    const [format, setFormat] = useState(
        () => (PARTY_FORMATS.some((f) => f.id === party.format) ? party.format : PARTY_FORMATS[0].id),
    );
    const [team, setTeam] = useState(party.team);

    // --- SHOWDOWN data lane (species list + per-format records) -------------
    const [speciesList, setSpeciesList] = useState(null);
    // C2 §4 shape: { [speciesId]: { [formatId]: record|null } } — the exact
    // top-level shape getRecordsForSpecies returns; accumulated across formats.
    const [speciesRecords, setSpeciesRecords] = useState({});
    const [laneErrorFor, setLaneErrorFor] = useState(null);
    const [retryTick, setRetryTick] = useState(0);
    const laneError = laneErrorFor === format;

    // --- add section (search-to-add) ----------------------------------------
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);

    // --- set editor ----------------------------------------------------------
    const [editingIndex, setEditingIndex] = useState(null);
    const [draft, setDraft] = useState(null);

    // --- start battle ---------------------------------------------------------
    const [validating, setValidating] = useState(false);
    const [problems, setProblems] = useState([]);

    const searchRef = useRef(null);
    const focusSearch = () => searchRef.current?.focus();

    const records = useMemo(() => {
        const out = {};
        for (const [sp, perFormat] of Object.entries(speciesRecords)) {
            out[sp] = perFormat?.[format] ?? null;
        }
        return out;
    }, [speciesRecords, format]);

    // Persist the party silently on every change (C1 §2.3: no "restored" toast).
    useEffect(() => {
        saveParty({ format, team });
    }, [format, team]);

    // Species pool for the add section (module-wide cache in the data lane).
    // G4 (single-gen window): the pool is gated by the SELECTED format's
    // generation — getSpeciesListForGen keeps ONLY that gen's introductions
    // (the dex-num window (end[G-1], end[G]] — G2's cumulative "num <= end[G]"
    // is gone, so a Gen 9 pool never lists Garchomp/Abomasnow and a Gen 5
    // pool never lists Ogerpon/Palafin). Forme sub-ids without a `num`
    // (37 of them) are dropped; an unknown gen yields an empty pool, not a
    // fallback. When the format changes the effect re-runs and the pool
    // re-filters to the new gen's window. The lane-error banner keys off
    // `format` (laneErrorFor === format), so a stale error from a previous
    // format never shows; no synchronous reset.
    useEffect(() => {
        let cancelled = false;
        getSpeciesListForGen(genFromFormat(format))
            .then((ids) => { if (!cancelled) setSpeciesList(ids); })
            .catch(() => { if (!cancelled) setLaneErrorFor(format); });
        return () => { cancelled = true; };
    }, [format, retryTick]);

    // Batch records for the visible candidates + team slots (the
    // getTypesByPokedexName pattern, pointed at the SHOWDOWN lane).
    const visibleCandidateIds = useMemo(() => {
        if (!speciesList) return [];
        const q = query.trim().toLowerCase();
        const nameOf = (id) => (records[id]?.species || id).toLowerCase();
        const matches = q
            ? speciesList.filter((id) => id.includes(q) || nameOf(id).includes(q))
            : speciesList;
        if (q) return matches.slice(0, SEARCH_LIMIT);
        const start = (page - 1) * PER_PAGE;
        return matches.slice(start, start + PER_PAGE);
    }, [speciesList, query, page, records]);

    const wantedKey = useMemo(
        () => [...new Set([...team.map((t) => t.species), ...visibleCandidateIds])].filter(Boolean).join(","),
        [team, visibleCandidateIds],
    );

    // G4 (single-gen window) format-switch re-gate. Team members whose species
    // falls outside the picked format's generation window (dex `num` below
    // the floor or above the end — e.g. a Garchomp stored in a Gen 9 team)
    // are surfaced as per-set problems — NOT silently dropped.
    // Advisory until the lane records resolve (null record -> no report); the
    // service validator remains the final authority on start.
    const genProblems = useMemo(() => {
        const gen = genFromFormat(format);
        return team
            .map((s) => s && s.species ? setFormatIssues(s, records[s.species], gen) : null)
            .filter(Boolean);
    }, [team, records, format]);

    useEffect(() => {
        if (!wantedKey) return;
        const ids = wantedKey.split(",");
        let cancelled = false;
        getRecordsForSpecies(ids, [format])
            .then((res) => {
                if (cancelled) return;
                // res is the C2 §4 top-level shape { [speciesId]: { [format]: record|null } }
                // — merge it into the per-species accumulator.
                setSpeciesRecords((prev) => ({ ...prev, ...res }));
                setLaneErrorFor(null);
            })
            .catch(() => { if (!cancelled) setLaneErrorFor(format); });
        return () => { cancelled = true; };
    }, [wantedKey, format, retryTick]);

    // --- add-section derived state -------------------------------------------
    const totalMatches = useMemo(() => {
        if (!speciesList) return 0;
        const q = query.trim().toLowerCase();
        if (!q) return speciesList.length;
        return speciesList.filter((id) => id.includes(q) || (records[id]?.species || id).toLowerCase().includes(q)).length;
    }, [speciesList, query, records]);
    const maxPage = Math.max(1, Math.ceil(totalMatches / PER_PAGE));

    // --- team operations -------------------------------------------------------
    const effectiveSet = (i) => hydrateSet(team[i], records[team[i]?.species]);

    const addSpecies = (id) => {
        setProblems([]);
        setTeam((t) => (t.length >= TEAM_SIZE ? t : [...t, blankSet(id, records[id])]));
    };
    const removeSpecies = (i) => {
        setProblems([]);
        if (editingIndex === i) { setEditingIndex(null); setDraft(null); }
        setTeam((t) => t.filter((_, idx) => idx !== i));
    };
    // G4 (single-gen window) format switch: keep the whole team — only the
    // selected format changes. The lane re-queries records for the new format
    // (the wantedKey effect re-keys on `format`), the picker re-filters to the
    // new gen's single-gen pool, and team members outside that gen's window
    // are surfaced by `genProblems` below (never dropped). Page counter is
    // reset so the re-filtered pool opens at page 1, and the service-level
    // problems are cleared (the team has not been re-validated yet).
    const onFormatChange = (e) => {
        setFormat(e.target.value);
        setProblems([]);
        setQuery("");
        setPage(1);
    };
    const openEditor = (i) => {
        setEditingIndex(i);
        setDraft({ ...hydrateSet(team[i], records[team[i]?.species]) });
        setProblems([]);
    };
    const closeEditor = (commit) => {
        if (commit && editingIndex != null && draft) {
            setTeam((t) => t.map((s, idx) => (idx === editingIndex ? { ...draft } : s)));
        }
        setEditingIndex(null);
        setDraft(null);
    };
    const resetAll = () => {
        resetParty();
        setTeam([]);
        setFormat(PARTY_FORMATS[0].id);
        setEditingIndex(null);
        setDraft(null);
        setProblems([]);
    };

    // --- start battle (C4 gate) ------------------------------------------------
    const teamComplete = team.length > 0 && team.every((s) => (s.moves || []).filter(Boolean).length === 4);
    // G2: the advisory problem display is the service-level `problems` plus the
    // lane-level per-set re-gate mismatches (genProblems — team members whose
    // species is not available in the picked gen; never dropped, surfaced at
    // load + on every format switch). Start is blocked on either.
    const displayProblems = problems.concat(genProblems);
    const startBattle = async () => {
        if (!team.length || !teamComplete || displayProblems.length > 0 || validating) return;
        setValidating(true);
        setProblems([]);
        try {
            // D1 (fix 4): resolve form-gated species against the current-format
            // records (base form + equipped gate item → the transformed form).
            const result = await validateTeam(buildTeam(team, records), format);
            if (!result.reachable) {
                setProblems(["Battle service unreachable — start the sim service and retry."]);
                return;
            }
            setProblems(result.problems);
            if (result.valid) navigate("/battle");
        } finally {
            setValidating(false);
        }
    };

    // The editor's effective set: the draft with record-derived defaults applied
    // where the user hasn't chosen yet (the record may arrive late).
    const editorSet = draft != null ? hydrateSet(draft, records[draft?.species]) : null;
    const editorRecord = editorSet ? records[editorSet.species] : null;
    const editorLoading = editorSet ? !editorRecord && !laneError : false;

    const editorInstance = editorSet ? (
        <SetEditor
            set={editorSet}
            record={editorRecord}
            format={format}
            loading={editorLoading}
            onUpdate={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onDone={() => closeEditor(true)}
            onCancel={() => closeEditor(false)}
        />
    ) : null;

    // Slot completeness warnings (advisory — C1 §2.2; the service is final).
    const slotWarnings = team.map((s, i) => ({
        index: i,
        n: s ? unresolvedMoves(s, records[s.species]) : 0,
    }));

    // G4 (single-gen window): the legibility line for the generation gate.
    // The picker's species pool is re-filtered to ONLY this format's gen's
    // introductions (getSpeciesListForGen's num window), so an empty/short
    // list reads as "only this generation's Pokémon", not "broken".
    const gateGen = genFromFormat(format);
    const gateFormatLabel = PARTY_FORMATS.find((f) => f.id === format)?.label || format;
    const genGateHint = `${gateFormatLabel} — Gen ${gateGen} Pokémon only`;

    const addSection = (
        <section id="add-to-party" aria-label="Add to party" className="w-full border border-neutral-200 bg-white p-4 rounded-lg">
            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    {team.length ? "Add to party" : "Search for your first Pokémon"}
                </h2>
                <SearchBar onSearch={(q) => { setQuery(q); setPage(1); }} placeholder="Search Pokémon by name" />
                {/* G4 (single-gen window): the generation gate in plain words
                    — the pool below is ONLY this format's gen's introductions,
                    so name the window instead of a mystery short list. */}
                <p className="text-xs text-neutral-400">{genGateHint}</p>
                {!speciesList
                    ? <p className="text-sm text-neutral-500">Loading Pokémon list…</p>
                    : query.trim()
                        ? <p className="text-sm text-neutral-500">{totalMatches} match{totalMatches === 1 ? "" : "es"}</p>
                        : <p className="text-sm text-neutral-500">{speciesList.length} Pokémon · page {page} of {maxPage}</p>}
            </div>

            {speciesList && (
                <div className="mt-4 flex flex-row flex-wrap justify-center gap-4">
                    {visibleCandidateIds.map((id) => (
                        <CandidateCard
                            key={id}
                            speciesId={id}
                            record={records[id] || null}
                            countInParty={team.filter((s) => s.species === id).length}
                            full={team.length >= TEAM_SIZE}
                            onAdd={addSpecies}
                        />
                    ))}
                    {visibleCandidateIds.length === 0 && <p className="text-sm text-neutral-500">No matches.</p>}
                </div>
            )}

            {!query.trim() && speciesList && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                    <button
                        type="button"
                        className="min-h-11 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                    >
                        Previous
                    </button>
                    <span className="text-sm text-neutral-500">Page {page} of {maxPage}</span>
                    <button
                        type="button"
                        className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => setPage(page + 1)}
                        disabled={page >= maxPage}
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );

    const teamGrid = (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: TEAM_SIZE }, (_, i) =>
                    team[i] ? (
                        <FilledSlotCard
                            key={i}
                            set={effectiveSet(i)}
                            record={records[team[i].species] || null}
                            warnings={slotWarnings[i].n}
                            onEdit={() => openEditor(i)}
                            onRemove={() => removeSpecies(i)}
                        />
                    ) : (
                        <EmptySlotCard key={`empty-${i}`} onAdd={focusSearch} />
                    ),
                )}
            </div>
            {/* Mobile only (C1 §2.5): the editor expands inline below the
                selected slot, full-width, in its own row — a top-inserted
                editor would scroll the user off their slot at 390px. */}
            {editingIndex != null && team[editingIndex] && (
                <div className="mt-4 md:hidden">{editorInstance}</div>
            )}
        </div>
    );

    // G2: render the format list grouped by generation (PARTY_FORMATS is
    // pre-grouped: all of a gen's tiers are contiguous, newest-first).
    const formatGroups = [];
    for (const f of PARTY_FORMATS) {
        const last = formatGroups[formatGroups.length - 1];
        if (last && last.group === f.group) last.items.push(f);
        else formatGroups.push({ group: f.group, items: [f] });
    }

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            {/* Header band (C1 §2.1) */}
            <div className="w-full border-b-4 border-red-600 bg-blue-800 px-6 py-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Party Builder</h1>
                    <label className="text-sm font-medium text-blue-100">
                        Format
                        <select
                            value={format}
                            onChange={onFormatChange}
                            aria-label="Battle format"
                            className="ml-2 min-h-11 rounded-lg border border-blue-600 bg-blue-900 px-3 py-2.5 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                            {formatGroups.map((g) => (
                                <optgroup key={g.group} label={g.group}>
                                    {g.items.map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <span aria-live="polite" className="ml-auto text-sm font-medium text-blue-100">
                        Team {team.length} of {TEAM_SIZE}
                    </span>
                    <button
                        type="button"
                        onClick={resetAll}
                        className="min-h-11 rounded-lg border border-blue-600 px-3 py-2.5 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                        Reset
                    </button>
                </div>
            </div>

            <div className="flex w-full flex-1 flex-col items-stretch gap-5 px-4 py-6 md:px-6 md:pb-28">
                {/* Data-lane error banner (C1 §2.3) */}
                {laneError && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-white p-4">
                        <p className="text-sm text-red-600">Could not load legal move data</p>
                        <button
                            type="button"
                            onClick={() => { setLaneErrorFor(null); setRetryTick((t) => t + 1); }}
                            className="min-h-11 shrink-0 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Set editor — desktop: above the grid (C1 §2.1) */}
                {editingIndex != null && (
                    <div className="hidden md:block">{editorInstance}</div>
                )}

                {/* Add section: above the grid when the team is empty
                    (C1 §2.3), below it once the first Pokémon is in. */}
                {team.length === 0 && <div ref={searchRef}>{addSection}</div>}

                {teamGrid}

                {team.length > 0 && <div ref={searchRef}>{addSection}</div>}

                {/* Start battle (C1 §2.1) — full-width sticky footer on mobile (§2.5) */}
                <section className="w-full rounded-lg border border-neutral-200 bg-white p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                            <button
                                type="button"
                                onClick={startBattle}
                                disabled={!team.length || !teamComplete || displayProblems.length > 0 || validating}
                                className="min-h-11 w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
                            >
                                {validating ? "Checking team…" : "Start battle"}
                            </button>
                            <p className="text-sm text-neutral-500">
                                {!team.length
                                    ? "Add at least 1 Pokémon"
                                    : !teamComplete
                                        ? "Every set needs 4 moves"
                                        : displayProblems.length > 0
                                            ? "Fix the problems below before the battle can start"
                                            : "Team is validated against the sim service before the battle starts"}
                            </p>
                        </div>
                        {problems.length > 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                <p className="text-sm font-semibold text-red-600">Team is not ready:</p>
                                <ul className="mt-1 list-inside list-disc text-sm text-red-600">
                                    {problems.map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                            </div>
                        )}
                        {/* G2: the lane-level re-gate — team members whose species
                            is not available in the picked format's generation.
                            Shown at load AND on every format switch (never
                            cleared by the service pass); the team is kept, each
                            offending set is named, and Start stays blocked. */}
                        {genProblems.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <p className="text-sm font-semibold text-amber-800">
                                    Not available in {gateFormatLabel}:
                                </p>
                                <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                                    {genProblems.map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Mobile sticky footer (C1 §2.5): Start battle is always reachable
                while scrolling; pb above (md:pb-28) clears it on desktop. */}
            <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 border-t border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
                <button
                    type="button"
                    onClick={startBattle}
                    disabled={!team.length || !teamComplete || displayProblems.length > 0 || validating}
                    className="min-h-11 flex-1 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {validating ? "Checking team…" : "Start battle"}
                </button>
                <button
                    type="button"
                    onClick={resetAll}
                    className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                    Reset
                </button>
            </div>
        </main>
    );
}
