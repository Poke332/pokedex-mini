import { getSpriteUrl, toProperCase } from "../utils/api";
import { buildShowdownTiles } from "../utils/sprites";

function Tile({ url, label, alt, fallback }) {
    return (
        <figure className="flex flex-col items-center gap-1.5">
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-blue-100 bg-blue-50 p-2">
                <img
                    src={url}
                    alt={alt}
                    loading="lazy"
                    className="h-full w-full object-contain"
                    onError={(e) => { e.currentTarget.src = fallback; }}
                />
            </div>
            <figcaption className="text-center text-[11px] leading-tight text-neutral-500">{label}</figcaption>
        </figure>
    );
}

export default function SpriteGrid({ sprites, name, id }) {
    const tiles = buildShowdownTiles(sprites, id);
    const fallback = getSpriteUrl(id);
    return (
        <div className="grid grid-cols-2 gap-3">
            {tiles.map((t, i) => (
                <Tile key={i} url={t.url} label={t.label} alt={`${toProperCase(name)} ${t.label}`} fallback={fallback} />
            ))}
        </div>
    );
}
