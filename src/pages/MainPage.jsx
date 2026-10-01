import { useState, useEffect } from "react";
import { getPokemons, getPokemonByName, getTypesByPokedexName } from "../utils/api";
import ViewCard from "../components/ViewCard";
import SearchBar from "../components/SearchBar";

export default function MainPage() {
    const [pokemons, setPokemons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [searched, setSearched] = useState(null);
    const [cardTypes, setCardTypes] = useState(null);

    const [error, setError] = useState(null);
    
    useEffect(() => {
        const loadPokemons = async () => {
            setLoading(true);
            try {
                const data = await getPokemons((page - 1) * 20);
                setPokemons(data.results);
                setTotalCount(data.count);
                setError(null);
            } catch (error) {
                setError(error.message);
            }
            setLoading(false);
        }
        loadPokemons();
    }, [page])

    // Types are not part of the /pokemon list response; resolve them for the
    // current page separately so the grid renders immediately and the type
    // icons fill in as they load.
    useEffect(() => {
        if (!pokemons.length) return;
        let cancelled = false;
        getTypesByPokedexName(pokemons)
            .then((types) => { if (!cancelled) setCardTypes(types); })
            .catch(() => { if (!cancelled) setCardTypes(null); });
        return () => { cancelled = true; };
    }, [pokemons]);

    const searchHandler = async (name) => {
        if (name.trim() === "") {
            setSearched(null);
            return;
        }
        setLoading(true);
        try {
            const data = await getPokemonByName(name);
            setSearched(data);
            setError(null);
        } catch (error) {
            setSearched(null);
            setError(error.message);
        }
        setLoading(false);
    }

    return <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
        <div className="w-full flex flex-col items-center gap-4 bg-blue-800 px-6 py-8 border-b-4 border-red-600">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Pokédex</h1>
            <SearchBar onSearch={searchHandler} />
        </div>
        <div className="w-full flex-1 flex flex-col items-center gap-6 px-6 py-8">
            { loading ? <p className="py-16 text-sm text-neutral-500">Page is loading</p>
            : error ? <p className="max-w-md text-center py-16 text-sm text-red-600">{error}</p> 
            : searched ? <ViewCard key={searched.name} pokemon={searched} />
            : <>
                <div className="w-full flex flex-row flex-wrap justify-center gap-4">
                    {pokemons.map((pokemon) => (
                        <ViewCard key={pokemon.name} pokemon={pokemon} types={cardTypes?.[pokemon.name]} />
                    ))}
                </div>
                <div className="flex w-full flex-1 items-center justify-center gap-4 border-t border-neutral-200 pt-8">
                    <button className="min-h-11 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setPage(page - 1)} disabled={page === 1}>
                        Previous
                    </button>
                    <span className="text-sm text-neutral-500">Page {page} out of {Math.ceil(totalCount / 20)}</span>
                    <button className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700" onClick={() => setPage(page + 1)}>
                        Next
                    </button>
                </div>
            </>
            }
        </div>
    </main>
}