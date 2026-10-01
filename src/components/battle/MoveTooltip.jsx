import TypeBadge from "../TypeBadge";
import { effectivenessFor, effectivenessLabel } from "../../utils/typechart";

// D1 (fix 3): the move-detail tooltip PANEL (a sibling region next to the
// move button in MoveButton.jsx). Shows the move's full row — name, type
// badge, category, power, accuracy, PP n/max — plus the type effectiveness
// vs the CURRENT ACTIVE FOE ("Super effective (2×)", "No effect", …).
//
// The parent (MoveButton) owns open-state, the hover/focus wiring, and the
// ESC-to-close listener; this component is pure presentational.
//
// @param {{
//   id: string,
//   move: object,
//   foe: object|null,
//   relations: object|null,
//   disabledReason: string,
// }} props
//   id — the region id MoveButton's button points at via aria-describedby.
//   move — the C2 §2.2 MoveEntry, optionally enriched with `accuracy` from
//     the data lane's move record for this species.
//   foe — the active-foe mon (envelope `foe`) with `types` attached by the
//     page's `withMeta`. null = no active foe (preview/over) → "—".
//   relations — the PokeAPI damage_relations map; null while the fetch is
//     pending → "—" rather than a guessed number.
//   disabledReason — the move's disabled-reason copy ("" when usable);
//     shown as a footer line when the move is disabled.
const TONE_TEXT = {
    super: "text-green-600",
    weak: "text-amber-600",
    immune: "text-red-600",
    neutral: "text-neutral-600",
};

export default function MoveTooltip({ id, move, foe, relations, disabledReason }) {
    const name = move.move || move.id;
    const category = move.category ? String(move.category).toLowerCase() : "";
    const power = move.power;
    // accuracy: a number (100), or true = "always hits" (Status-class moves
    // in the data lane); undefined when the entry is a bare C2 §2.2 MoveEntry
    // (the service does not ship accuracy) — the row is simply omitted.
    const acc = move.accuracy;
    // The effectiveness is only judged when it can be computed: a damaging
    // move with a known type, a foe with known types, and the relations
    // table. Anything else reads "—" — never a wrong number.
    const canJudge =
        power != null && power > 0 &&
        Array.isArray(foe?.types) && foe.types.length > 0 &&
        relations && move.type;
    const eff = canJudge ? effectivenessFor(move.type, foe.types, relations) : null;
    const effMeta = effectivenessLabel(eff);

    return (
        <div
            id={id}
            role="tooltip"
            className="absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-lg sm:w-72"
        >
            <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{name}</p>
                {move.type ? <TypeBadge type={move.type} /> : null}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-neutral-600">
                {category && (
                    <>
                        <dt className="text-neutral-400">Category</dt>
                        <dd className="text-right font-medium capitalize">{category}</dd>
                    </>
                )}
                {power != null && power > 0 && (
                    <>
                        <dt className="text-neutral-400">Power</dt>
                        <dd className="text-right font-medium">{power}</dd>
                    </>
                )}
                {acc != null && (
                    <>
                        <dt className="text-neutral-400">Accuracy</dt>
                        <dd className="text-right font-medium">{acc === true ? "—" : acc}</dd>
                    </>
                )}
                <dt className="text-neutral-400">PP</dt>
                <dd className="text-right font-medium">{move.pp}/{move.maxpp}</dd>
            </dl>
            <div className="mt-2 border-t border-neutral-100 pt-2">
                <p className="text-neutral-400">
                    Effectiveness vs {foe?.name || "active foe"}
                </p>
                <p className={`text-sm font-medium ${TONE_TEXT[effMeta.tone]}`}>
                    {effMeta.text}
                </p>
            </div>
            {move.disabled && disabledReason && (
                <p className="mt-2 text-amber-600">{disabledReason}</p>
            )}
        </div>
    );
}
