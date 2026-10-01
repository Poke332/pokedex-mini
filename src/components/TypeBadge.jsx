import { toProperCase } from "../utils/api";
import { typeClasses } from "../utils/types";

export default function TypeBadge({ type }) {
    const [bg, text] = typeClasses(type);
    return (
        <span className={`rounded-full ${bg} ${text} px-3 py-1 text-xs font-semibold uppercase tracking-wide`}>
            {toProperCase(type)}
        </span>
    )
}
