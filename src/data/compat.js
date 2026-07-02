// Compatibility rules between a receiver and the parts that can be mounted on it.
// NO Three.js imports here.

import { PARTS, PARTS_BY_SLOT, SLOTS, DEFAULT_BUILD } from "./parts.js";

const SIZE_ORDER = { light: 0, medium: 1, heavy: 2 };

// Required slots sanitizeBuild will fill if null/invalid. Order matters: barrel is
// finalized before the cross-slot "suppressed barrel blocks muzzle" check runs.
const REQUIRED_FILL_ORDER = ["barrel", "optic", "mag", "grip", "ammo"];
const REQUIRED_FALLBACK = {
  barrel: "brl_standard",
  optic: "opt_irons",
  grip: "grp_standard",
  ammo: "amo_fmj",
};

export function isCompatible(receiverId, slot, partId) {
  const receiver = PARTS[receiverId];
  if (!receiver || receiver.slot !== "receiver") {
    return { ok: false, reason: "Unknown receiver" };
  }
  const part = PARTS[partId];
  if (!part) {
    return { ok: false, reason: "Unknown part" };
  }
  if (part.slot !== slot) {
    return { ok: false, reason: `${part.name} is not a ${slot} part` };
  }
  if (slot === "receiver") {
    return { ok: true };
  }

  // Receiver forbids this slot entirely (e.g. pistols have no stock mount).
  if (receiver.slotsAllowed && receiver.slotsAllowed[slot] === false) {
    return { ok: false, reason: `${receiver.name} has no ${slot} mount` };
  }

  // Size class: within 1 step of the receiver. Only barrels/stocks/mags/underbarrel
  // carry a sizeClass — grips, optics, muzzles, lasers, ammo are size-agnostic.
  if (part.sizeClass) {
    const partSize = SIZE_ORDER[part.sizeClass];
    const rcvSize = SIZE_ORDER[receiver.sizeClass];
    if (Math.abs(partSize - rcvSize) > 1) {
      return { ok: false, reason: `${part.name} size doesn't fit ${receiver.name}` };
    }
  }

  // mag_drum / mag_belt have stricter minimums than the generic 1-step size rule.
  if (partId === "mag_drum" && SIZE_ORDER[receiver.sizeClass] < SIZE_ORDER.medium) {
    return { ok: false, reason: "Drum mags need a medium or heavy receiver" };
  }
  if (partId === "mag_belt" && receiver.sizeClass !== "heavy") {
    return { ok: false, reason: "Belt feed needs a heavy receiver" };
  }

  // Tag-gated parts (e.g. mzl_choke needs a "shotgun"-tagged receiver).
  if (part.requiresReceiverTag && !(receiver.tags || []).includes(part.requiresReceiverTag)) {
    return { ok: false, reason: `${part.name} requires a ${part.requiresReceiverTag} receiver` };
  }

  // Ammo family must include the receiver's caliber family.
  if (slot === "ammo") {
    const families = (part.ammo && part.ammo.families) || [];
    if (!families.includes(receiver.caliberFamily)) {
      return { ok: false, reason: `${part.name} isn't chambered for ${receiver.caliberFamily}` };
    }
  }

  // NOTE: brl_suppressed's "integral-suppressor" tag blocking the muzzle slot is a
  // cross-slot interaction (which barrel is equipped affects the muzzle slot) that
  // isCompatible cannot see — it only receives (receiverId, slot, partId), no build.
  // sanitizeBuild enforces that rule directly since it has the full build object.

  return { ok: true };
}

function partName(id) {
  const part = PARTS[id];
  return part ? part.name : id;
}

// Picks the first part in PARTS_BY_SLOT[slot] that is compatible with receiverId.
function firstCompatible(receiverId, slot) {
  const list = PARTS_BY_SLOT[slot] || [];
  for (const part of list) {
    if (isCompatible(receiverId, slot, part.id).ok) return part.id;
  }
  return null;
}

// Drops incompatible parts (nulling optional slots, refilling required ones with a
// sensible default) and returns { build, dropped } where dropped is the list of
// part names removed/replaced.
export function sanitizeBuild(build) {
  const dropped = [];
  const result = { ...build };

  // Receiver itself must be valid; fall back to the default build's receiver.
  if (!PARTS[result.receiver] || PARTS[result.receiver].slot !== "receiver") {
    if (result.receiver) dropped.push(partName(result.receiver));
    result.receiver = DEFAULT_BUILD.receiver;
  }

  // Pass 1: null out anything already equipped that isn't compatible with the receiver.
  for (const slot of SLOTS) {
    if (slot === "receiver") continue;
    const partId = result[slot];
    if (!partId) continue;
    const check = isCompatible(result.receiver, slot, partId);
    if (!check.ok) {
      dropped.push(partName(partId));
      result[slot] = null;
    }
  }

  // Pass 2: fill required slots that ended up null.
  for (const slot of REQUIRED_FILL_ORDER) {
    if (result[slot]) continue;
    const fallback = REQUIRED_FALLBACK[slot];
    if (fallback && isCompatible(result.receiver, slot, fallback).ok) {
      result[slot] = fallback;
    } else {
      result[slot] = firstCompatible(result.receiver, slot);
    }
  }

  // Cross-slot rule: an integral-suppressor barrel blocks the muzzle slot outright.
  const barrelPart = PARTS[result.barrel];
  if (barrelPart && (barrelPart.tags || []).includes("integral-suppressor") && result.muzzle) {
    dropped.push(partName(result.muzzle));
    result.muzzle = null;
  }

  return { build: result, dropped };
}
