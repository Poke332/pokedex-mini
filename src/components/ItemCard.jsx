import { Link } from "react-router-dom";
import { itemLabel, itemCategoryLabel, itemSpriteUrl } from "../utils/items";

export default function ItemCard({ item }) {
    const sprite = itemSpriteUrl(item);
    const category = itemCategoryLabel(item);
    return (
        <Link
            to={`/item/${item.name}`}
            className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-xl transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
        >
            {sprite ? (
                <img src={sprite} alt={item.name} className="rounded-lg border border-blue-100 bg-blue-50 p-2" />
            ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400">
                    no art
                </div>
            )}
            <h2 className="text-base font-semibold text-neutral-900">{itemLabel(item)}</h2>
            {category && (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {category}
                </span>
            )}
        </Link>
    );
}
