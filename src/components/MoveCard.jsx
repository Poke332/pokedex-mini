import { Link } from "react-router-dom";
import { moveLabel, moveType, movePower, movePP, moveAccuracy, moveDamageClass } from "../utils/moves";
import TypeBadge from "./TypeBadge";

function Stat({ label, value }) {
    return (
        <span className="text-xs text-neutral-500">
            {label} <span className="font-semibold text-neutral-900">{value}</span>
        </span>
    );
}

export default function MoveCard({ move }) {
    const type = moveType(move);
    const power = movePower(move);
    const pp = movePP(move);
    const accuracy = moveAccuracy(move);
    const dmg = moveDamageClass(move);

    return (
        <Link
            to={`/move/${move.name}`}
            className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-xl transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
        >
            {type ? (
                <TypeBadge type={type} />
            ) : (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">Status</span>
            )}
            <h2 className="text-base font-semibold text-neutral-900">{moveLabel(move)}</h2>
            <div className="flex flex-col items-center gap-1">
                {dmg && <span className="text-xs text-neutral-500">{dmg}</span>}
                <div className="flex flex-row flex-wrap justify-center gap-3">
                    <Stat label="Pwr" value={power ?? "—"} />
                    <Stat label="PP" value={pp ?? "—"} />
                    <Stat label="Acc" value={accuracy != null ? `${accuracy}%` : "—"} />
                </div>
            </div>
        </Link>
    );
}
