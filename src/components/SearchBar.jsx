import { useState } from "react";

export default function SearchBar({ onSearch, placeholder = "Search Pokémon by name" }) {
    const [query, setQuery] = useState("");
    const handleSearch = (event) => {
        event.preventDefault();
        onSearch(query);
    }

    return (
        <form className="flex w-full max-w-md gap-2" onSubmit={handleSearch}>
            <input
                type="text"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-h-11 w-full rounded-lg bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <button type="submit" className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700">
                Search
            </button>
        </form>
    )
}