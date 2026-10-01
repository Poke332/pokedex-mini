import { getSpriteUrl, toProperCase } from "../../utils/api";
import TypeBadge from "../TypeBadge";

/**
 * The team-preview / lead-selection step (C1 §3.1): a grid of the caller's
 * up-to-6 team cards (1 col / md 2 / lg 3). One card is the selected lead
 * (red-600 ring + a "LEAD" chip on 390px — color-only rings are hard to
 * perceive at small size, C1 §3.1); tapping the selected card deselects.
 *
 * The card content (sprite, #dex, name, types, move count, level) is the
 * C1 §3.1 spec. Species display data comes from the data-lane records
 * (C2 §4) the page already fetched for the team; the team sets come from
 * the C5 party store (C2 §1 shape).
 *
 * @param {{
 *   team: object[],
 *   records: Record<string, object|null>,
 *   selected: number|null,
 *   format: string,
 *   onSelect: (index: number|null) => void,
 *   onStart: () => void,
 *   busy: boolean,
 * }} props
 *   team     — the caller's team (C2 §1 sets, index = team position).
 *   records  — the C2 §4 record per species id (sprite/dex/types), or null
 *     while the lane loads.
 *   selected — the lead-picked index (null when nothing is chosen yet).
 *   format   — the battle format id (badge in the header band).
 *   onSelect — pick / deselect a lead.
 *   onStart  — commit the lead (`teampreview <i>`) and enter the battle.
 *   busy     — the service is creating the room / committing the lead.
 */
export default function TeamPreviewGrid({
    team, records, selected, format, onSelect, onStart, busy,
}) {
    const canStart = selected != null && !busy;
    return (
        <div className="flex w-full flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {team.map((set, i) => {
                    const rec = records?.[set.species] || null;
                    const isLead = selected === i;
                    const dex = rec?.dexNum;
                    const types = rec?.types || [];
                    const ability = rec?.abilities?.find((a) => a.id === set.ability)?.name
                        || (set.ability ? toProperCase(set.ability) : null);
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onSelect(isLead ? null : i)}
                            aria-pressed={isLead}
                            aria-label={`${rec?.species || toProperCase(set.species)}${isLead ? ", lead" : ""}`}
                            className={`relative w-full rounded-lg border bg-white p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                                isLead
                                    ? "border-red-600 ring-2 ring-red-600 ring-offset-2"
                                    : "border-neutral-200 hover:border-blue-800 hover:bg-blue-50 cursor-pointer"
                            }`}
                        >
                            {isLead && (
                                <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                                    Lead
                                </span>
                            )}
                            <div className="flex items-start gap-3">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                                    {dex ? (
                                        <img
                                            src={getSpriteUrl(dex)}
                                            alt={rec?.species || set.species}
                                            className="h-full w-full object-contain"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="h-full w-full animate-pulse bg-neutral-100" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-red-600">
                                        {dex ? `#${dex}` : " "}
                                    </p>
                                    <h3 className="truncate text-base font-semibold text-neutral-900">
                                        {rec?.species || toProperCase(set.species)}
                                    </h3>
                                    {types.length > 0 && (
                                        <span className="mt-1 flex flex-wrap gap-1">
                                            {types.map((t) => (
                                                <TypeBadge key={t} type={t} />
                                            ))}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-neutral-600">
                                <p>
                                    {(set.moves || []).filter(Boolean).length}/4 moves
                                    {ability ? ` · ${ability}` : ""} · Lv. {set.level ?? 100}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                    type="button"
                    onClick={onStart}
                    disabled={!canStart}
                    className="min-h-11 w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                    {busy ? "Starting battle…" : "Start battle"}
                </button>
                <p className="text-sm text-neutral-500">
                    {selected == null
                        ? "Pick a lead — your lead acts first in the opening turn"
                        : "The lead is locked once the battle starts"}
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        {format}
                    </span>
                </p>
            </div>
        </div>
    );
}
