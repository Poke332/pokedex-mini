import { toProperCase } from "./api";

// Machine list entries carry only a URL; these read the single machine
// resource ({ id, item, version_group, move }).
export function machineItemLabel(machine) {
    return machine?.item?.name ? machine.item.name.toUpperCase() : null;
}

export function machineGroupLabel(machine) {
    return machine?.version_group?.name ? toProperCase(machine.version_group.name) : null;
}

export function machineMoveName(machine) {
    return machine?.move?.name ?? null;
}

// "tm00" -> "TM00", "tr1" -> "TR1": the item slug is the machine's label.
export function machineLabel(machine) {
    return machine?.item?.name ? machine.item.name.toUpperCase() : "#";
}
