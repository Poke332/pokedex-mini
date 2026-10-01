import { flavorColorClass, flavorLabel } from "../utils/berries";

// Max berry flavor potency across the API is 40 (sweet).
const MAX_POTENCY = 40;

export default function FlavorBar({ flavor }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-neutral-500">{flavorLabel(flavor.name)}</span>
            <div className="flex-1 rounded-full bg-neutral-100" style={{ height: 8 }}>
                <div
                    className={`rounded-full ${flavorColorClass(flavor.name)}`}
                    style={{ width: `${Math.min(100, (flavor.potency / MAX_POTENCY) * 100)}%`, height: 8 }}
                />
            </div>
            <span className="w-6 text-right text-xs font-semibold text-neutral-900">{flavor.potency}</span>
        </div>
    )
}
