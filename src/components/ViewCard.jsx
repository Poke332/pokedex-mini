import { Link } from "react-router-dom";
import { getSpriteUrl, parseIdFromUrl, toProperCase } from "../utils/api"
import TypeBadge from "./TypeBadge"

export default function Card({ pokemon, types }) {
    const pokemonId = pokemon.id ? pokemon.id : parseIdFromUrl(pokemon.url);
    const spriteUrl = getSpriteUrl(pokemonId);
    const to = pokemon.id ? `/pokemon/${pokemon.id}` : `/pokemon/${pokemon.name}`;
    // List items carry no types; the full payload does. Prefer the resolved
    // prop (grid) and fall back to pokemon.types (search result).
    const typeNames = types ?? (pokemon.types ? pokemon.types.map((t) => t.type?.name) : null);
    return (
        <Link to={to} className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-xl transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600">
            <img src={spriteUrl} alt={pokemon.name} className="rounded-lg border border-blue-100 bg-blue-50"/>
            <p className="text-xs font-semibold text-red-600">#{pokemonId}</p>
            <h2 className="text-base font-semibold text-neutral-900">{toProperCase(pokemon.name)}</h2>
            {typeNames && (
                <span className="flex gap-1">
                    {typeNames.map((t) => (
                        <TypeBadge key={t} type={t} />
                    ))}
                </span>
            )}
        </Link>
    )
}
