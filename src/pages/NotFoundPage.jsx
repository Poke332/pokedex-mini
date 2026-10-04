import { Link } from "react-router-dom";

export default function NotFoundPage() {
    return (
        <main className="min-h-dvh flex items-center justify-center bg-neutral-50 px-4 py-8 text-neutral-900">
            <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center">
                <p className="text-6xl font-semibold tracking-tight text-blue-800">404</p>
                <h1 className="mt-4 text-lg font-semibold">Pokémon not found</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    There is no Pokédex entry at this address. It may have moved, or the name may be misspelled.
                </p>
                <Link
                    to="/"
                    className="mt-6 flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                    Back to the Pokédex
                </Link>
            </section>
        </main>
    )
}
