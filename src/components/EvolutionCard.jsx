import { toProperCase } from "../utils/api";
import { buildEvolutionTree } from "../utils/evolution";

function Node({ node, isRoot }) {
    if (!node.name) return null;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${isRoot ? "text-neutral-900" : "text-neutral-700"}`}>
                    {toProperCase(node.name)}
                </span>
                {node.condition && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                        {node.condition}
                    </span>
                )}
            </div>
            {node.children.length > 0 && (
                <div className="flex flex-col gap-2 pl-3 border-l border-neutral-200">
                    {node.children.map((child, i) => (
                        <Node key={i} node={child} isRoot={false} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function EvolutionCard({ chain }) {
    const tree = buildEvolutionTree(chain);
    if (!tree) {
        return (
            <p className="text-xs text-neutral-400">
                Evolution chain could not be loaded for this Pokémon.
            </p>
        );
    }
    return (
        <div>
            <Node node={tree} isRoot />
        </div>
    );
}
