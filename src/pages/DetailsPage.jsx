import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getPokemonByName, getSpecies, getEncounters, getEvolutionChain, getMoveResources, getSpriteUrl, toProperCase } from "../utils/api";
import Header from "../components/Header";
import DetailSection from "../components/DetailSection";
import StatBar from "../components/StatBar";
import TypeBadge from "../components/TypeBadge";
import MovesList from "../components/MovesList";
import EncountersList from "../components/EncountersList";
import SpeciesCard from "../components/SpeciesCard";
import EvolutionCard from "../components/EvolutionCard";
import SpriteGrid from "../components/SpriteGrid";
import CriesPlayer from "../components/CriesPlayer";
import TagList from "../components/TagList";

export default function DetailsPage() {
    const { name } = useParams();
    const [pokemon, setPokemon] = useState(null);
    const [species, setSpecies] = useState(null);
    const [encounters, setEncounters] = useState(null);
    const [moveResources, setMoveResources] = useState(null);
    const [evolutionChain, setEvolutionChain] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            setPokemon(null);
            setSpecies(null);
            setEncounters(null);
            setEvolutionChain(null);
            setMoveResources(null);
            try {
                const data = await getPokemonByName(name);
                if (cancelled) return;
                setPokemon(data);
                const [sp, en] = await Promise.allSettled([
                    data.species ? getSpecies(data.species.url) : Promise.resolve(null),
                    data.location_area_encounters ? getEncounters(data.location_area_encounters) : Promise.resolve(null),
                ]);
                if (cancelled) return;
                let speciesData = sp.status === "fulfilled" ? sp.value : null;
                // Species carries the evolution-chain URL; retry once so a
                // transient PokeAPI failure does not silently lose it.
                if (!speciesData && data.species) {
                    try {
                        speciesData = await getSpecies(data.species.url);
                    } catch {
                        speciesData = null;
                    }
                }
                setSpecies(speciesData);
                setEncounters(en.status === "fulfilled" ? en.value : null);
                const chainUrl = speciesData?.evolution_chain?.url;
                if (chainUrl) {
                    let chain = null;
                    for (let attempt = 0; attempt < 2 && !chain; attempt++) {
                        if (cancelled) return;
                        try {
                            const ev = await getEvolutionChain(chainUrl);
                            chain = ev?.chain ?? null;
                        } catch {
                            /* transient failure; retry */
                        }
                    }
                    if (!cancelled) setEvolutionChain(chain);
                }
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [name]);

    // Move power/pp load separately so the rest of the page never waits on
    // them; the moves table shows placeholders until these resolve.
    useEffect(() => {
        if (!pokemon) return;
        let cancelled = false;
        getMoveResources(pokemon.moves)
            .then((data) => { if (!cancelled) setMoveResources(data); })
            .catch(() => { if (!cancelled) setMoveResources(null); });
        return () => { cancelled = true; };
    }, [pokemon]);

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <Header compact title={pokemon ? toProperCase(pokemon.name) : toProperCase(name)}>
                <Link to="/" className="text-sm font-medium text-white hover:text-red-200 transition-colors">
                    Back to the Pokédex
                </Link>
            </Header>

            <div className="w-full flex-1 px-4 py-4">
                {loading && (
                    <p className="w-full max-w-3xl mx-auto py-16 text-center text-sm text-neutral-500">
                        Loading {toProperCase(name)}...
                    </p>
                )}

                {!loading && error && (
                    <div className="w-full max-w-md mx-auto rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-red-600">{error}</p>
                        <Link
                            to="/"
                            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                            Back to the Pokédex
                        </Link>
                    </div>
                )}

                {!loading && !error && pokemon && (
                    <div className="flex w-full flex-col gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 lg:gap-4 lg:items-stretch">
                        <div className="flex flex-col gap-4">
                            <section className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:gap-5">
                                <img
                                    src={(pokemon.sprites?.other?.["official-artwork"]?.front_default) || pokemon.sprites.front_default || getSpriteUrl(pokemon.id)}
                                    alt={`${toProperCase(pokemon.name)} official artwork`}
                                    className="w-28 rounded-lg border border-blue-100 bg-blue-50 p-2 object-contain"
                                    onError={(e) => { e.currentTarget.src = getSpriteUrl(pokemon.id); }}
                                />
                                <div className="flex flex-1 flex-col items-center gap-2 sm:items-start">
                                    <p className="text-xs font-semibold text-red-600">#{pokemon.id}</p>
                                    <h2 className="text-2xl font-semibold tracking-tight">{toProperCase(pokemon.name)}</h2>
                                    <div className="flex flex-wrap gap-2">
                                        {pokemon.types.map((entry) => (
                                            <TypeBadge key={entry.type.name} type={entry.type.name} />
                                        ))}
                                    </div>
                                    <p className="text-sm text-neutral-500">
                                        Height {pokemon.height / 10} m · Weight {pokemon.weight / 10} kg
                                    </p>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-neutral-500">Held items</span>
                                        <TagList items={pokemon.held_items?.map((h) => h.item.name)} tone="blue" />
                                    </div>
                                </div>
                            </section>

                            <DetailSection title="Stats">
                                <div className="flex flex-col gap-2">
                                    {pokemon.stats.map((stat) => (
                                        <StatBar key={stat.stat.name} stat={stat} />
                                    ))}
                                </div>
                            </DetailSection>

                            <DetailSection title="Species">
                                <SpeciesCard species={species} />
                            </DetailSection>

                            <DetailSection title="Evolution">
                                <EvolutionCard chain={evolutionChain} />
                            </DetailSection>

                            <DetailSection title="Where to find it">
                                <EncountersList encounters={encounters} />
                            </DetailSection>
                        </div>

                        <div className="flex flex-col gap-4">
                            <DetailSection title="Sprites">
                                <SpriteGrid sprites={pokemon.sprites} name={pokemon.name} id={pokemon.id} />
                            </DetailSection>

                            <DetailSection title="Abilities">
                                <ul className="flex flex-col gap-1.5">
                                    {pokemon.abilities.map((entry, index) => (
                                        <li key={index} className="flex items-center gap-2 text-sm">
                                            <span className="font-medium text-neutral-900">{toProperCase(entry.ability.name)}</span>
                                            {entry.is_hidden && <span className="text-xs text-neutral-500">(hidden)</span>}
                                        </li>
                                    ))}
                                </ul>
                            </DetailSection>

                            <DetailSection title="Cries">
                                <CriesPlayer cries={pokemon.cries} name={pokemon.name} />
                            </DetailSection>
                        </div>

                        <div className="flex flex-col gap-4 lg:self-start lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
                            <DetailSection title="Moves">
                                <MovesList moves={pokemon.moves} moveDataByName={moveResources} />
                            </DetailSection>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}
