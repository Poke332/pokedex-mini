import { Link } from "react-router-dom";
import { getBerrySpriteUrl, berryLabel, dominantFlavor, flavorLabel } from "../utils/berries";

export default function BerryCard({ berry }) {
    const sprite = getBerrySpriteUrl(berry);
    const flavor = dominantFlavor(berry);
    return (
        <Link
            to={`/berry/${berry.name}`}
            className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-xl transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
        >
            {sprite && (
                <img src={sprite} alt={berry.name} className="rounded-lg border border-blue-100 bg-blue-50 p-2" />
            )}
            <h2 className="text-base font-semibold text-neutral-900">{berryLabel(berry)}</h2>
            <div className="flex flex-col items-center gap-1">
                {flavor && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                        {flavorLabel(flavor)} flavor
                    </span>
                )}
                <p className="text-xs text-neutral-500">Growth {berry.growth_time}h · Max harvest {berry.max_harvest}</p>
            </div>
        </Link>
    )
}
