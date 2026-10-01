import { switchDisabledReason } from "../../utils/battleLog";

/**
 * The dedicated ⇄ SWITCH button (C1 §3.2 design ruling: a class apart from
 * the move buttons — solid blue-800 fill, white text, swap icon, same
 * min-h-11 footprint). Tapping it toggles the bench row into its
 * switchable state; the reason for a disabled button lives in the
 * aria-label, not just the tooltip (C1 §3.5).
 *
 * @param {{
 *   active: boolean,
 *   busy: boolean,
 *   canSwitch: boolean,
 *   reason: string,
 *   trapped: boolean,
 *   onToggle: () => void,
 * }} props
 *   active — the bench is in its switchable state (instruction row shown).
 *   busy   — the service is processing; the button ignores clicks.
 *   canSwitch / reason / trapped — from the C2 §2.5 choiceRequest;
 *     when !canSwitch the button is disabled with a tooltip + aria reason.
 */
export default function SwitchButton({ active, busy, canSwitch, reason, trapped, onToggle }) {
    const disabledReason = switchDisabledReason({ canSwitch, trapped, reason });
    const disabled = busy || !canSwitch;
    return (
        <button
            type="button"
            title={disabledReason || (active ? "Close the bench picker" : "Choose a Pokémon to switch to")}
            aria-label={`Switch: ${disabledReason || (active ? "switching open" : "switching closed")}`}
            aria-pressed={active}
            aria-disabled={disabled}
            onClick={() => { if (!disabled) onToggle(); }}
            className={`min-h-11 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 md:w-auto ${
                active ? "ring-2 ring-red-600 ring-offset-2" : ""
            } ${
                disabled ? "cursor-not-allowed opacity-40" : "hover:bg-blue-900 cursor-pointer"
            }`}
        >
            <span aria-hidden="true" className="text-base leading-none">⇄</span>
            SWITCH
        </button>
    );
}
