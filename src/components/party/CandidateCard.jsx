import { getSpriteUrl, toProperCase } from "../../utils/api";
import TypeBadge from "../TypeBadge";

/**
 * A search candidate in the /party add section (C1 §2.2 CandidateCard):
 * ViewCard geometry (sprite, dex #, name, type badges) with the body ending in
 * a full-width red-600 `Add` button. `Add` is disabled when the party is full
 * (6/6). A duplicate of a species already in the party is still allowed — the
 * card just notes the `×n in party` count.
 *
 * @param {{
 *   speciesId: string,
 *   record: object|null,
 *   countInParty: number,
 *   full: boolean,
 *   onAdd: (speciesId: string) => void,
 * }} props
 *   speciesId — the Showdown species id being offered.
 *   record — the C2 §4 record for this species+format (null while the data
 *     lane has not resolved it; sprite/dex/name then fall back to the id).
 *   countInParty — how many sets in the team share this speciesId.
 *   full — the team already holds 6 sets; the Add button is disabled.
 *   onAdd — add a new set of this species to the team.
 */
export default function CandidateCard({ speciesId, record, countInParty, full, onAdd }) {
    const displayName = record?.species || toProperCase(speciesId);
    const types = record?.types;
    const dexNum = record?.dexNum;

    return (
        <div className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-lg transition-shadow hover:shadow-md">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                {dexNum ? (
                    <img src={getSpriteUrl(dexNum)} alt={displayName} className="h-full w-full object-contain" />
                ) : (
                    <div className="h-full w-full animate-pulse bg-neutral-100" />
                )}
            </div>
            <p className="text-xs font-semibold text-red-600">{dexNum ? `#${dexNum}` : " "}</p>
            <h3 className="text-base font-semibold text-neutral-900">{displayName}</h3>
            {types && (
                <span className="flex flex-wrap justify-center gap-1">
                    {types.map((t) => (
                        <TypeBadge key={t} type={t} />
                    ))}
                </span>
            )}
            {countInParty > 1 && (
                <p className="text-xs text-neutral-500">×{countInParty} in party</p>
            )}
            <button
                type="button"
                onClick={() => onAdd(speciesId)}
                disabled={full}
                className="mt-auto min-h-11 w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
                Add
            </button>
        </div>
    );
}
