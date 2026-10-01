import { typeAbbr, typeIconUrl } from "../utils/types";

// Circular type badge icon (partywhale/pokemon-type-icons). Falls back to a
// short abbreviation if the SVG fails to load, so a table header or card
// never shows a broken image.
export default function TypeIcon({ type, size = "h-5 w-5" }) {
    return (
        <span className="inline-flex items-center justify-center" title={type}>
            <img
                src={typeIconUrl(type)}
                alt={type}
                loading="lazy"
                className={size}
                onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const next = e.currentTarget.nextElementSibling;
                    if (next) next.style.display = "inline";
                }}
            />
            <span className="hidden text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                {typeAbbr(type)}
            </span>
        </span>
    )
}
