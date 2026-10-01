export default function Header({ title = "Pokédex", children = null, compact = false }) {
    return (
        <header className={`w-full border-b-4 border-red-600 bg-blue-800 px-6 pb-4 ${compact ? "pt-4" : "pt-8"}`}>
            <div className={`flex w-full flex-col items-center ${compact ? "gap-2" : "gap-4"}`}>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
                {children}
            </div>
        </header>
    )
}
