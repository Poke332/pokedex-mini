import { NavLink } from "react-router-dom";

const NAV_SECTIONS = [
    {
        title: "Encyclopedia",
        items: [
            { to: "/", label: "Pokedex", end: true },
            { to: "/type-advantage", label: "Type Advantage" },
            { to: "/berries", label: "Berries" },
            { to: "/items", label: "Items" },
            { to: "/moves", label: "Moves" },
            { to: "/machines", label: "Machines" },
        ],
    },
    {
        // Empty for now — simulation pages are still to be built. The
        // header stays so the two-part structure is visible.
        title: "Simulation",
        items: [],
    },
];

function NavItem({ item }) {
    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                `flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                    isActive
                        ? "bg-blue-800 text-white"
                        : "text-neutral-600 hover:bg-blue-50 hover:text-blue-800"
                }`
            }
        >
            {item.label}
        </NavLink>
    );
}

function SectionLabel({ title, inline = false }) {
    const cls = inline
        ? "mx-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-neutral-500 self-center"
        : "px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 first:pt-0";
    return <span className={cls}>{title}</span>;
}

function Brand() {
    return (
        <div className="border-b-4 border-red-600 bg-blue-800 px-4 py-3">
            <h1 className="text-lg font-semibold tracking-tight text-white">Pokédex</h1>
        </div>
    );
}

export default function Sidebar() {
    return (
        <>
            {/* Mobile: brand + horizontally scrolling nav chips */}
            <div className="md:hidden">
                <Brand />
                <nav
                    aria-label="Primary"
                    className="flex items-center gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2"
                >
                    {NAV_SECTIONS.map((section) => (
                        <span key={section.title} className="flex shrink-0 items-center gap-2">
                            <SectionLabel title={section.title} inline />
                            <span className="flex shrink-0 items-center gap-2 border-l border-neutral-200 pl-2">
                                {section.items.map((item) => (
                                    <NavItem key={item.to} item={item} />
                                ))}
                            </span>
                        </span>
                    ))}
                </nav>
            </div>

            {/* Desktop: fixed-width rail */}
            <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white md:block">
                <Brand />
                <nav aria-label="Primary" className="flex flex-col gap-4 p-3">
                    {NAV_SECTIONS.map((section) => (
                        <div key={section.title} className="flex flex-col gap-1">
                            <SectionLabel title={section.title} />
                            <div className="ml-3 flex flex-col gap-1 border-l border-neutral-200 pl-3">
                                {section.items.map((item) => (
                                    <NavItem key={item.to} item={item} />
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
