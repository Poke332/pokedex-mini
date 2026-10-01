import { toProperCase } from "../utils/api";
import { toneClasses } from "../utils/types";

export default function TagList({ items, tone = "neutral" }) {
    if (!items?.length) return null;
    const [bg, text] = toneClasses(tone);
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((label, i) => (
                <span key={i} className={`rounded-full ${bg} ${text} px-3 py-1 text-xs font-semibold`}>
                    {toProperCase(label)}
                </span>
            ))}
        </div>
    );
}
