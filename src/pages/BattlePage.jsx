import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadParty } from "../utils/partyStore";
import { buildTeam } from "../utils/pokemonSets";
import { startBattle, sendChoice, getBattleState } from "../utils/simService";
import { getRecordsForSpecies } from "../utils/showdownData";
import { loadDexMap } from "../utils/battleSprites";
import { isDisplayLogLine, parseLogLine, reconcileLog } from "../utils/battleLog";
import { fxEvents, fxClass, fxDuration } from "../utils/battleFx";
import { getTypeDamageRelations } from "../utils/api";
import TeamPreviewGrid from "../components/battle/TeamPreviewGrid";
import PokemonPlate from "../components/battle/PokemonPlate";
import MoveButton from "../components/battle/MoveButton";
import SwitchButton from "../components/battle/SwitchButton";
import BenchChip from "../components/battle/BenchChip";
import BattleLog from "../components/battle/BattleLog";
import EndStateCard from "../components/battle/EndStateCard";

const SESSION_KEY = "pokedex.simulation.battle";

// Phase machine: idle -> connecting -> preview -> battle -> over; any phase
// can drop into "error" (service / room lost). The phase is derived from
// the latest envelope's choiceRequest + local flags, never from guesses.
/**
 * C6 — /battle: drives the C4 sim service one turn at a time and renders the
 * C2 §2 envelopes.
 *
 * Phases: team-preview (lead pick, C1 §3.1) -> battle (arena + controls +
 * log, C1 §3.2/§3.3) -> end card (C1 §3.2 end state). Every user choice is
 * a single `POST /battle/:id/choice` (C2 §3.2) and the UI re-renders from
 * the returned envelope only — the full battle never ships at once.
 */
export default function BattlePage() {
    const navigate = useNavigate();

    // The party is the team source (C5 lane): restored silently, never edited
    // here. An empty team means the preview step has nothing to show.
    const party = useState(loadParty)[0];
    const team = useMemo(() => party.team || [], [party]);
    const format = party.format || "gen9ou";

    const [phase, setPhase] = useState("idle"); // idle|connecting|preview|battle|over|error|empty
    const [battleId, setBattleId] = useState(null);
    const [envelope, setEnvelope] = useState(null);
    const [log, setLog] = useState([]);
    const [choiceCount, setChoiceCount] = useState(0);
    const [leadIndex, setLeadIndex] = useState(null);
    const [benchOpen, setBenchOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errorInfo, setErrorInfo] = useState(null);
    const [toast, setToast] = useState(null);
    // C1 §3.4: re-entering /battle mid-session while an abandoned battle was
    // running surfaces a small "abandon" indicator (battles are ephemeral).
    // The flag is an initial value read from sessionStorage — not effect state.
    const [abandoned] = useState(() => {
        try {
            const had = !!sessionStorage.getItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            return had;
        } catch {
            return false; // private mode
        }
    });

    // Data lane: species records (types/dex) for the team + any foe seen.
    const [speciesIds, setSpeciesIds] = useState(() => team.map((t) => t.species));
    const [records, setRecords] = useState({});
    const [dexMap, setDexMap] = useState({});
    const [laneRetry, setLaneRetry] = useState(0);
    // D1 (fix 3): the move tooltips' type-effectiveness table. Loaded once
    // module-wide (api.js caches the promise); null while pending → the
    // panels read "—" rather than guess.
    const [typeRelations, setTypeRelations] = useState(null);
    useEffect(() => {
        let cancelled = false;
        getTypeDamageRelations()
            .then((rel) => {
                if (!cancelled) setTypeRelations(rel.relations);
            })
            .catch(() => { /* the panels stay "—"; the rest of the page is unaffected */ });
        return () => { cancelled = true; };
    }, []);

    // The lane returns the nested C2 §4 shape { speciesId: { formatId: record } }
    // (the getRecordsForSpecies output); the components consume a flat
    // speciesId -> record map for the current format, derived here.
    const recordsForFormat = (() => {
        const out = {};
        for (const [sp, perFormat] of Object.entries(records)) {
            out[sp] = perFormat?.[format] ?? null;
        }
        return out;
    })();

    // StrictMode double-invokes effects in dev — create the room exactly once.
    const startingRef = useRef(false);
    const toastTimer = useRef(null);
    const startTimer = useRef(null);
    const laneKey = speciesIds.join(",");

    // D3 — scene FX scheduling (docs/battle-scene-spec.md §2.3). The one-shot
    // `bs-*` classes are toggled on the DOM directly (the spec §2.3 one-shot
    // rule: "add the class on the next frame, then setTimeout(duration)
    // removes it"). The plate roots + pill have STATIC className props, so
    // React's re-render on an envelope commit does NOT rewrite the
    // attribute — an imperatively-added class survives until its timer
    // removes it. Only a species-key change (a switch) remounts a plate,
    // which is exactly when we want the animation to restart. A fresh
    // envelope supersedes any in-flight removals (rule 4); re-adding a
    // class that is still live is a no-op, so races cannot double-fire.
    const foePlateRef = useRef(null);
    const yourPlateRef = useRef(null);
    const foeChipRef = useRef(null);
    const yourChipRef = useRef(null);
    const pillRef = useRef(null);
    const prevEnvRef = useRef(null);   // previous envelope (FX diff base)
    const logRef = useRef([]);         // mirrors `log` — the PRE-log at apply time
    const pendingFxRef = useRef([]);   // in-flight one-shot removal timers
    useEffect(() => { logRef.current = log; }, [log]);
    // Clean up any still-pending FX removals on unmount (a battle can end
    // while a window is open; timers must not fire on dead refs).
    useEffect(() => () => { pendingFxRef.current.forEach(clearTimeout); }, []);

    // D3: fire one scene FX event. `kind`+`side` select the target; `offset`
    // defers the class add (spec §2.1 choreography: pulse(0) -> your
    // attack(0-200) -> foe hit@150 + HP drain -> foe attack@200 -> your hit;
    // faints last). turnPulse adds the pill scale + both plates' border flash
    // on the same beat.
    const playEvent = useCallback((ev) => {
        const cls = fxClass(ev.kind);
        const fire = () => {
            const target = ev.kind === "status"
                ? (ev.side === "foe" ? foeChipRef.current : yourChipRef.current)
                : (ev.side === "foe" ? foePlateRef.current : yourPlateRef.current);
            if (!target) return;
            target.classList.add(cls);
            pendingFxRef.current.push(
                setTimeout(() => target.classList.remove(cls), fxDuration(ev.kind)),
            );
        };
        const run = () => {
            if (ev.kind === "turnPulse") {
                if (pillRef.current) {
                    pillRef.current.classList.add("bs-turn-pulse");
                    pendingFxRef.current.push(
                        setTimeout(() => pillRef.current.classList.remove("bs-turn-pulse"), fxDuration("turnPulse")),
                    );
                }
                for (const plate of [foePlateRef.current, yourPlateRef.current]) {
                    if (!plate) continue;
                    plate.classList.add("bs-turn-pulse-plate");
                    pendingFxRef.current.push(
                        setTimeout(() => plate.classList.remove("bs-turn-pulse-plate"), fxDuration("turnPulse")),
                    );
                }
                return;
            }
            fire();
        };
        // "Add the class on the next frame" — schedule the add on rAF so the
        // offset-0 events fire AFTER React commits the (possibly freshly
        // remounted) plate; the rest is a one-shot CSS animation.
        requestAnimationFrame(() => {
            if (ev.offset) setTimeout(run, ev.offset);
            else run();
        });
    }, []);

    // D3: diff this envelope against the previous one and schedule the FX.
    // `newLines` are ONLY the log lines this envelope added (reconcileLog's
    // tail) — a notYourTurn resync that re-ships its last slice overlaps the
    // accumulated log, yields an empty new-lines diff, and re-fires nothing.
    const scheduleFx = useCallback((env, newLines) => {
        // Supersede in-flight removals (spec §2.3 rule 4): a new envelope
        // cancels any pending timer so the scene restarts from commit time.
        pendingFxRef.current.forEach(clearTimeout);
        pendingFxRef.current = [];
        const events = fxEvents(prevEnvRef.current, env, newLines);
        // Dev QA bridge (D3 live-verify): record exactly which events the
        // envelope diff scheduled, for the completion log + D4 assertion.
        if (typeof window !== "undefined" && window.__d3sched) {
            for (const ev of events) {
                window.__d3sched.push({
                    kind: ev.kind,
                    side: ev.side || "all",
                    offset: ev.offset,
                });
            }
        }
        for (const ev of events) playEvent(ev);
    }, [playEvent]);
    // D1 (fix 4): the mount-time create call runs before the data lane lands,
    // but the retry path (and every later create) must resolve form-gated
    // species with the CURRENT records. A ref synced in an effect reads the
    // latest value without adding the derived object to startNewBattle's
    // deps (no ref writes during render).
    const recordsForFormatRef = useRef({});
    useEffect(() => {
        recordsForFormatRef.current = recordsForFormat;
    }, [recordsForFormat]);

    const showToast = useCallback((msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    // ------------------------------------------------------------------ lane
    // Records for the team species (preview grid + plates) and any foe
    // species seen so far (plates need types + dex). The lane is optional:
    // plates fall back gracefully while it loads (C1 §3.2). `laneFailKey`
    // names the laneKey whose fetch failed — a successful fetch (or a new
    // laneKey) hides the banner without any synchronous state reset.
    const [laneFailKey, setLaneFailKey] = useState(null);
    const laneError = laneFailKey === laneKey;
    useEffect(() => {
        if (!laneKey) return;
        let cancelled = false;
        getRecordsForSpecies(laneKey.split(","), [format])
            .then((res) => {
                if (cancelled) return;
                setRecords((prev) => ({ ...prev, ...res }));
                setLaneFailKey(null);
                return loadDexMap(laneKey.split(","), format);
            })
            .then((map) => {
                if (!cancelled) setDexMap(map);
            })
            .catch(() => {
                if (!cancelled) setLaneFailKey(laneKey);
            });
        return () => { cancelled = true; };
    }, [laneKey, format, laneRetry]);

    // ------------------------------------------------------------ room start
    const startNewBattle = useCallback(async () => {
        if (startingRef.current) return;
        startingRef.current = true;
        setPhase("connecting");
        setEnvelope(null);
        setLog([]);
        setChoiceCount(0);
        setLeadIndex(null);
        setBenchOpen(false);
        setErrorInfo(null);
        try {
            // D1 (fix 4): pass the current-format records so buildTeam can
            // resolve form-gated sets (base form + gate item → the transformed
            // form; forme without the item → base) before shipping to the sim.
            // The ref carries the latest records (the mount-time create runs
            // before the lane lands; retries read the loaded map).
            const res = await startBattle({ format, p1Team: buildTeam(team, recordsForFormatRef.current) });
            if (!res.ok) {
                setErrorInfo(res);
                setPhase("error");
                return;
            }
            setBattleId(res.envelope.battleId);
            setEnvelope(res.envelope);
            const freshLog = res.envelope.log || [];
            setLog(freshLog);
            // D3: a fresh battle is a fresh FX/log baseline — the teampreview
            // envelope's actives are absent, so the next (battle) envelope's
            // first-appear animation is correct, and a stale previous-battle
            // tail can never bleed into the new battle's diff.
            logRef.current = freshLog;
            prevEnvRef.current = null;
            pendingFxRef.current.forEach(clearTimeout);
            pendingFxRef.current = [];
            // The first envelope's state is "teampreview" (C2 §3.1) — the
            // lead-pick step; an already-over battle skips straight to end.
            setPhase(res.envelope.battleOver ? "over" : "preview");
            try { sessionStorage.setItem(SESSION_KEY, res.envelope.battleId); } catch { /* noop */ }
        } finally {
            startingRef.current = false;
        }
    }, [format, team]);

    useEffect(() => {
        // Defer both paths off the effect body (no synchronous setState here):
        // the room is created exactly once (StrictMode-safe via startingRef).
        startTimer.current = setTimeout(() => {
            if (team.length === 0) setPhase("empty");
            else startNewBattle();
        }, 0);
        return () => clearTimeout(startTimer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ------------------------------------------------------------------ turn
    const applyEnvelope = useCallback((env) => {
        setEnvelope(env);
        // Idempotent accumulation (D1 fix 1): a normal advance ships only new
        // lines, but the notYourTurn resync path re-ships the room's LAST
        // slice, which can already be in the log. reconcileLog overlaps the
        // matching tail and drops exact consecutive duplicates, so re-apply
        // can never double the display rows. startNewBattle above is the
        // only reset point.
        const nextLog = env.log?.length
            ? reconcileLog(logRef.current, env.log)
            : logRef.current;
        // D3 (spec §2.3): the PRE-log is captured BEFORE updating the mirror —
        // the diff (nextLog minus the pre-tail) is exactly THIS envelope's new
        // lines. A notYourTurn resync that re-ships its last slice overlaps the
        // pre-tail and yields an empty diff, so already-played lines never
        // re-fire FX.
        const preLog = logRef.current;
        logRef.current = nextLog; // keep the mirror synchronous (two applies
                                  // in flight must never diff against stale tails)
        setLog(nextLog);
        const newLines = nextLog.slice(preLog.length);
        scheduleFx(env, newLines);
        prevEnvRef.current = env;
        const cr = env.choiceRequest || {};
        // A new foe can appear (switch on the opposing side) — widen the lane.
        if (env.foe?.species) {
            setSpeciesIds((prev) => (prev.includes(env.foe.species) ? prev : [...prev, env.foe.species]));
        }
        if (env.battleOver) {
            setPhase("over");
            try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
        } else if (cr.state === "teampreview") {
            setPhase("preview");
        } else {
            setPhase("battle");
        }
    }, [scheduleFx]);

    const submitChoice = useCallback(async (choice) => {
        if (busy || !battleId) return;
        setBusy(true);
        setBenchOpen(false);
        try {
            const res = await sendChoice(battleId, choice);
            if (res.ok) {
                applyEnvelope(res.envelope);
                setChoiceCount((n) => n + 1);
                if (choice.startsWith("switch")) {
                    // OD-7: immediate-commit confirmation (no dialog).
                    const target = (res.envelope.active || [])[0];
                    if (target) showToast(`Sent ${target.name} to battle`);
                }
            } else if (res.kind === "notYourTurn") {
                // Race with a simultaneous resolution: resync the envelope
                // (C2 §3.3) instead of erroring — the room still exists.
                const sync = await getBattleState(battleId);
                if (sync.ok) {
                    applyEnvelope(sync.envelope);
                } else {
                    setErrorInfo(sync);
                    setPhase("error");
                }
            } else {
                // unreachable / battleGone / service: the room is lost
                // (C1 §3.2 service-error banner, OD-8 retry = re-preview).
                setErrorInfo(res);
                setPhase("error");
            }
        } finally {
            setBusy(false);
        }
    }, [battleId, busy, applyEnvelope, showToast]);

    const commitLead = useCallback((index) => {
        setLeadIndex(index);
        submitChoice(`teampreview ${index}`);
    }, [submitChoice]);

    const commitMove = useCallback((moveId) => {
        submitChoice(`move ${moveId}`);
    }, [submitChoice]);

    const commitSwitch = useCallback((position) => {
        submitChoice(`switch ${position}`);
    }, [submitChoice]);

    // ------------------------------------------------------------------ view
    const cr = envelope?.choiceRequest;
    const state = cr?.state;
    const activeMon = envelope?.active?.[0] || null;
    const foeMon = envelope?.foe || null;
    const bench = envelope?.bench || [];

    // Attach lane data the plate renders (types/dex) — the envelope itself
    // carries no types (C2 §2.1); the data lane does.
    const withMeta = useCallback((mon) => {
        if (!mon) return mon;
        // `records` is the nested C2 §4 shape {speciesId:{formatId:record}}.
        return { ...mon, types: records?.[mon.species]?.[format]?.types || [] };
    }, [records, format]);

    // C1 §3.3: the mobile turn strip also carries the most recent log line.
    const lastLogLine = (() => {
        for (let i = log.length - 1; i >= 0; i -= 1) {
            if (isDisplayLogLine(log[i])) return parseLogLine(log[i]).text;
        }
        return "";
    })();

    const turnLabel = (() => {
        if (phase !== "battle" && phase !== "over") return "";
        if (busy) return "…";
        switch (state) {
            case "move": return "Your move";
            case "switch": return "Choose a replacement";
            case "wait": return "Waiting…";
            case "over": return "Battle over";
            default: return "";
        }
    })();

    // The bench is switchable in the forced-switch state (OD-9: switch-only
    // controls) or when the user opened the voluntary switch (C1 §3.2).
    const benchSwitchable = state === "switch" || (state === "move" && benchOpen);
    const movesDisabledByState = state === "switch" || state === "over" || state === "wait";

    const headerTitle =
        phase === "preview" ? "Battle — choose your lead" :
        phase === "over" ? "Battle" :
        "Battle";

    const errorBanner = (title, body) => (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-sm font-semibold text-red-600">{title}</p>
                {body && <p className="mt-1 text-sm text-neutral-600">{body}</p>}
            </div>
            <button
                type="button"
                onClick={startNewBattle}
                className="min-h-11 shrink-0 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
                Retry
            </button>
        </div>
    );

    const controlCard = (
        <div className="w-full rounded-lg border border-neutral-200 bg-white p-4">
            {/* Moves: 2×2 grid (C1 §3.2) */}
            <div className="grid grid-cols-2 gap-2">
                {(cr?.legalMoves || []).map((move) => {
                    // D1 (fix 3): enrich the C2 §2.2 MoveEntry with the
                    // data-lane record for this move (adds `accuracy` so the
                    // tooltip can show the full detail row); the active
                    // foe's types come from withMeta so the effectiveness
                    // line recomputes when the opponent's active changes.
                    const moveMeta =
                        activeMon && recordsForFormat[activeMon.species]
                            ? (recordsForFormat[activeMon.species].moves || []).find((m) => m.id === move.id)
                            : null;
                    return (
                        <MoveButton
                            key={move.id}
                            move={move}
                            moveMeta={moveMeta}
                            busy={busy}
                            disabledByState={movesDisabledByState}
                            onMove={commitMove}
                            foe={withMeta(foeMon)}
                            relations={typeRelations}
                        />
                    );
                })}
                {(cr?.legalMoves || []).length === 0 && !busy && (
                    <p className="col-span-2 text-sm text-neutral-500">No moves available</p>
                )}
            </div>

            {/* Switch affordance — a class apart (C1 §3.2 ruling) */}
            <div className="mt-3 flex">
                <SwitchButton
                    active={benchOpen}
                    busy={busy || state !== "move"}
                    canSwitch={!!cr?.canSwitch}
                    reason={cr?.reason || ""}
                    trapped={!!cr?.trapped}
                    onToggle={() => setBenchOpen((o) => !o)}
                />
            </div>

            {/* Bench row: horizontal scroll-snap strip on mobile, inline row
                on desktop (C1 §3.2/§3.3). */}
            {bench.length > 0 && (
                <div className="mt-3">
                    {benchSwitchable && (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-800">
                            Choose a Pokémon to switch to
                        </p>
                    )}
                    <div className="flex gap-2 overflow-x-auto snap-x pb-1 lg:flex-wrap">
                        {bench.map((mon) => (
                            <BenchChip
                                key={mon.position}
                                mon={mon}
                                switchable={benchSwitchable}
                                dexMap={dexMap}
                                onSwitch={commitSwitch}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // ------------------------------------------------------------ the page
    return (
        <main className="min-h-dvh bg-neutral-50 text-neutral-900">
            {/* Header band (C1 §3.1 / §3.2) */}
            <div className="border-b-4 border-red-600 bg-blue-800 px-6 py-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {headerTitle}
                    </h1>
                    <span className="rounded-full bg-blue-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
                        {format}
                    </span>
                    {abandoned && (
                        <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-neutral-900">
                            Previous battle was abandoned
                        </span>
                    )}
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
                {/* No team yet */}
                {phase === "empty" && (
                    <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-neutral-200 bg-white p-8">
                        <p className="text-sm font-semibold text-neutral-900">
                            No team in your party yet
                        </p>
                        <p className="text-sm text-neutral-500">
                            Build a team in the party builder, then come back to start a battle.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate("/party")}
                            className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                            Open Party Builder
                        </button>
                    </div>
                )}

                {/* Team-preview / lead selection (C1 §3.1) */}
                {(phase === "preview" || phase === "connecting") && (
                    <div className="flex w-full flex-col gap-5">
                        {phase === "connecting" && (
                            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-800 border-t-transparent" aria-hidden="true" />
                                <span className="text-sm text-neutral-600">Connecting to the battle service…</span>
                            </div>
                        )}
                        {phase === "preview" && (
                            <TeamPreviewGrid
                                team={team}
                                records={recordsForFormat}
                                selected={leadIndex}
                                format={format}
                                onSelect={setLeadIndex}
                                onStart={() => leadIndex != null && commitLead(leadIndex)}
                                busy={busy}
                            />
                        )}
                        {laneError && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-white p-4">
                                <p className="text-sm text-red-600">Could not load species data — sprites and types will be limited. Retry</p>
                                <button
                                    type="button"
                                    onClick={() => setLaneRetry((t) => t + 1)}
                                    className="min-h-11 shrink-0 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Service / room error (C1 §3.2, OD-8) */}
                {phase === "error" && (
                    <div className="flex w-full flex-col gap-5">
                        {errorInfo?.kind === "invalidTeam" ? (
                            <div className="rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-white p-4">
                                <p className="text-sm font-semibold text-red-600">
                                    {errorInfo.error || "Team is not legal in this format"}
                                </p>
                                {errorInfo.problems?.length > 0 && (
                                    <ul className="mt-2 list-inside list-disc text-sm text-red-600">
                                        {errorInfo.problems.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                )}
                                <button
                                    type="button"
                                    onClick={() => navigate("/party")}
                                    className="mt-3 min-h-11 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50"
                                >
                                    Edit Party
                                </button>
                            </div>
                        ) : (
                            errorBanner(
                                "Battle service unreachable",
                                "The battle state lives on the service and is lost. Retry re-runs the preview with the same team.",
                            )
                        )}
                    </div>
                )}

                {/* Battle + end state (C1 §3.2/§3.3) */}
                {(phase === "battle" || phase === "over") && (
                    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                        <div className="flex min-w-0 flex-col gap-4">
                            {/* Turn surface (D3 §1.2): the centered turn pill,
                                sticky at both breakpoints — on mobile the
                                two-row strip (pill + last-log row) pins at
                                top-0 while the bench/controls scroll; on
                                desktop the card chrome drops and the pill
                                row pins at top-4 over the tall arena. The
                                pill is the bs-turn-pulse target (§2.1). */}
                            <div className="sticky top-0 z-10 flex flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 lg:top-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                                <div className="flex items-center gap-2">
                                    {busy ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-800 border-t-transparent" aria-hidden="true" />
                                    ) : null}
                                    <span
                                        ref={pillRef}
                                        className="rounded-full bg-blue-800 px-3 py-1 text-xs font-semibold text-white"
                                    >
                                        Turn {choiceCount}
                                    </span>
                                    {turnLabel ? (
                                        <span className="text-xs font-medium text-neutral-500">{turnLabel}</span>
                                    ) : null}
                                </div>
                                {/* Mobile-only last-log line (C1 §3.3) */}
                                <p className="min-w-0 truncate text-center text-xs text-neutral-500 lg:hidden">
                                    {lastLogLine}
                                </p>
                            </div>

                            {phase === "over" ? (
                                <div className="flex flex-col gap-4">
                                    {/* Mobile read order: log above the end card (C1 §3.2) */}
                                    <div className="lg:hidden">
                                        <BattleLog log={log} collapsible />
                                    </div>
                                    <div className="mx-auto w-full max-w-md">
                                        <EndStateCard
                                            victory={envelope.winner === 0}
                                            turns={choiceCount}
                                            format={format}
                                            busy={busy}
                                            onRematch={startNewBattle}
                                            onEditParty={() => navigate("/party")}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Arena: foe plate then your plate (C1 §3.3 mobile order).
                                        D3 §2.2: the plates mount on the active species —
                                        a switch unmounts the outgoing mon and remounts the
                                        incoming one, which is what makes bs-switch-in a
                                        clean mount-animation. */}
                                    <PokemonPlate
                                        key={`foe:${foeMon?.species || "none"}`}
                                        mon={withMeta(foeMon)}
                                        side="foe"
                                        dexMap={dexMap}
                                        rootRef={foePlateRef}
                                        statusChipRef={foeChipRef}
                                    />
                                    <PokemonPlate
                                        key={`yours:${activeMon?.species || "none"}`}
                                        mon={withMeta(activeMon)}
                                        side="yours"
                                        dexMap={dexMap}
                                        rootRef={yourPlateRef}
                                        statusChipRef={yourChipRef}
                                    />

                                    {controlCard}
                                </>
                            )}

                            {/* Mobile: log below everything (C1 §3.3) — hidden on
                                desktop, where the side column holds it. */}
                            {phase === "battle" && (
                                <div className="lg:hidden">
                                    <BattleLog log={log} collapsible />
                                </div>
                            )}
                        </div>

                        {/* Desktop side column: sticky log (C1 §3.2). It stays
                            visible in the end state so the full fight remains
                            readable alongside the end card. */}
                        <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
                            <BattleLog log={log} />
                        </div>
                    </div>
                )}
            </div>

            {/* OD-7 switch confirmation toast */}
            {toast && (
                <div
                    role="status"
                    className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
                >
                    {toast}
                </div>
            )}
        </main>
    );
}
