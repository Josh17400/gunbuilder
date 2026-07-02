// Weapon stat definitions + the stat-composition pipeline.
// NO Three.js imports here — pure data/math, shared by UI (builder screen) and
// gameplay (weapon.js reads composeStats(build) once per equip).
//
// Composition formula per numeric stat: (base + Sum(add)) * Product(1 + mult), then clamp.
// `base` comes from the equipped receiver's `base` stat set; every other equipped part
// (barrel, muzzle, optic, mag, stock, grip, underbarrel, laser, ammo) contributes optional
// `add` (flat) and `mult` (fractional, e.g. -0.15 = -15%) entries per stat.
//
// adsZoom mechanism (chosen so there is exactly one way zoom is reached): every receiver's
// base.adsZoom is 1.0, and each optic's `add.adsZoom` is a negative offset that lands the
// final value on its target (opt_irons -0.15 -> 0.85, opt_reddot -0.25 -> 0.75, opt_holo -0.3
// -> 0.7, opt_4x -0.55 -> 0.45, opt_8x -0.7 -> 0.3). No part uses mult.adsZoom.

import { clamp } from "../core/utils.js";
import { PARTS, SLOTS } from "./parts.js";

// Stats that participate in the (base + add) * (1 + mult) numeric pipeline.
// fireModes (array) and suppressed (bool) are derived separately below.
const NUMERIC_STATS = [
  "damage",
  "fireRate",
  "recoilV",
  "recoilH",
  "recoilRecovery",
  "muzzleVelocity",
  "adsTime",
  "adsZoom",
  "mobility",
  "magSize",
  "reloadTime",
  "spreadHip",
  "spreadAds",
  "falloffStart",
  "falloffEnd",
  "pellets",
  "penetration",
];

// [min, max] clamp applied to every composed numeric stat.
const CLAMPS = {
  damage: [1, 300],
  fireRate: [40, 1500],
  recoilV: [0.05, 10],
  recoilH: [0.05, 10],
  recoilRecovery: [1, 100],
  muzzleVelocity: [80, 2000],
  adsTime: [0.08, 1.2],
  adsZoom: [0.2, 1.0],
  mobility: [0.5, 1.2],
  magSize: [1, 300],
  reloadTime: [0.3, 8],
  spreadHip: [0, 12],
  spreadAds: [0, 12],
  falloffStart: [0, 600],
  falloffEnd: [0, 600],
  pellets: [1, 16],
  penetration: [0, 3],
};

export const STAT_DEFS = {
  damage: {
    label: "Damage", unit: "", min: 1, max: 300, lowerIsBetter: false,
    format: (v) => `${Math.round(v)}`, showInPanel: true,
  },
  fireRate: {
    label: "Fire Rate", unit: "RPM", min: 40, max: 1500, lowerIsBetter: false,
    format: (v) => `${Math.round(v)} RPM`, showInPanel: true,
  },
  fireModes: {
    label: "Fire Modes", unit: "", min: 0, max: 0, lowerIsBetter: null,
    format: (v) => (Array.isArray(v) ? v.join(" / ") : String(v)), showInPanel: false,
  },
  recoilV: {
    label: "Vertical Recoil", unit: "°", min: 0.05, max: 10, lowerIsBetter: true,
    format: fixed2WithDeg, showInPanel: true,
  },
  recoilH: {
    label: "Horizontal Recoil", unit: "°", min: 0.05, max: 10, lowerIsBetter: true,
    format: fixed2WithDeg, showInPanel: true,
  },
  recoilRecovery: {
    label: "Recoil Recovery", unit: "°/s", min: 1, max: 100, lowerIsBetter: false,
    format: (v) => `${v.toFixed(1)}°/s`, showInPanel: true,
  },
  muzzleVelocity: {
    label: "Muzzle Velocity", unit: "m/s", min: 80, max: 2000, lowerIsBetter: false,
    format: (v) => `${Math.round(v)} m/s`, showInPanel: true,
  },
  adsTime: {
    label: "ADS Time", unit: "s", min: 0.08, max: 1.2, lowerIsBetter: true,
    format: (v) => `${v.toFixed(2)}s`, showInPanel: true,
  },
  adsZoom: {
    label: "ADS Zoom", unit: "×", min: 0.2, max: 1.0, lowerIsBetter: false,
    format: (v) => `${v.toFixed(2)}×`, showInPanel: true,
  },
  mobility: {
    label: "Mobility", unit: "×", min: 0.5, max: 1.2, lowerIsBetter: false,
    format: (v) => `${v.toFixed(2)}×`, showInPanel: true,
  },
  magSize: {
    label: "Mag Size", unit: "", min: 1, max: 300, lowerIsBetter: false,
    format: (v) => `${Math.round(v)}`, showInPanel: true,
  },
  reloadTime: {
    label: "Reload Time", unit: "s", min: 0.3, max: 8, lowerIsBetter: true,
    format: (v) => `${v.toFixed(2)}s`, showInPanel: true,
  },
  spreadHip: {
    label: "Hip Spread", unit: "°", min: 0, max: 12, lowerIsBetter: true,
    format: fixed2WithDeg, showInPanel: true,
  },
  spreadAds: {
    label: "ADS Spread", unit: "°", min: 0, max: 12, lowerIsBetter: true,
    format: fixed2WithDeg, showInPanel: true,
  },
  falloffStart: {
    label: "Falloff Start", unit: "m", min: 0, max: 600, lowerIsBetter: false,
    format: (v) => `${Math.round(v)}m`, showInPanel: true,
  },
  falloffEnd: {
    label: "Falloff End", unit: "m", min: 0, max: 600, lowerIsBetter: false,
    format: (v) => `${Math.round(v)}m`, showInPanel: true,
  },
  pellets: {
    label: "Pellets", unit: "", min: 1, max: 16, lowerIsBetter: null,
    format: (v) => (v > 1 ? `${Math.round(v)}×` : "1"), showInPanel: true,
  },
  penetration: {
    label: "Penetration", unit: "", min: 0, max: 2, lowerIsBetter: false,
    format: (v) => v.toFixed(2), showInPanel: true,
  },
  suppressed: {
    label: "Suppressed", unit: "", min: 0, max: 1, lowerIsBetter: null,
    format: (v) => (v ? "Suppressed" : "—"), showInPanel: false,
  },
};

function fixed2WithDeg(v) {
  return `${v.toFixed(2)}°`;
}

function clampStat(stat, value) {
  const range = CLAMPS[stat];
  if (!range) return value;
  return clamp(value, range[0], range[1]);
}

// (base + Sum(add)) * Product(1 + mult), then clamp. Merges tags from every equipped
// part to derive `suppressed`. fireModes is copied straight from the receiver.
export function composeStats(build) {
  const receiver = PARTS[build.receiver];
  if (!receiver || receiver.slot !== "receiver") {
    throw new Error(`composeStats: unknown receiver "${build.receiver}"`);
  }

  const sums = {};
  const mults = {};
  for (const stat of NUMERIC_STATS) {
    sums[stat] = receiver.base[stat] ?? 0;
    mults[stat] = 0;
  }

  let suppressed = (receiver.tags || []).includes("integral-suppressor");

  for (const slot of SLOTS) {
    if (slot === "receiver") continue;
    const partId = build[slot];
    if (!partId) continue;
    const part = PARTS[partId];
    if (!part) continue;

    if (part.id === "mzl_suppressor" || (part.tags || []).includes("integral-suppressor")) {
      suppressed = true;
    }

    if (part.add) {
      for (const stat in part.add) {
        if (!(stat in sums)) { sums[stat] = 0; mults[stat] = 0; }
        sums[stat] += part.add[stat];
      }
    }
    if (part.mult) {
      for (const stat in part.mult) {
        if (!(stat in mults)) { sums[stat] = sums[stat] ?? 0; mults[stat] = 0; }
        mults[stat] += part.mult[stat];
      }
    }
  }

  const result = {};
  for (const stat of NUMERIC_STATS) {
    const raw = (sums[stat] ?? 0) * (1 + (mults[stat] ?? 0));
    result[stat] = clampStat(stat, raw);
  }

  // Ammo rpmCap clamps fireRate down further (e.g. explosive rounds cap RPM).
  const ammo = PARTS[build.ammo];
  if (ammo && ammo.ammo && typeof ammo.ammo.rpmCap === "number") {
    result.fireRate = Math.min(result.fireRate, ammo.ammo.rpmCap);
  }
  result.fireRate = clampStat("fireRate", result.fireRate);

  result.magSize = Math.max(1, Math.round(result.magSize));
  result.pellets = Math.max(1, Math.round(result.pellets));

  result.fireModes = receiver.base.fireModes.slice();
  result.suppressed = suppressed;

  return result;
}

// Only returns stats that differ between a and b. better is true/false when the stat
// is numeric and STAT_DEFS marks a direction (lowerIsBetter true/false), null otherwise
// (arrays, booleans, or stats without a meaningful direction).
export function diffStats(a, b) {
  const out = {};
  for (const stat of Object.keys(STAT_DEFS)) {
    const from = a[stat];
    const to = b[stat];
    const isArray = Array.isArray(from) || Array.isArray(to);
    const changed = isArray ? JSON.stringify(from) !== JSON.stringify(to) : from !== to;
    if (!changed) continue;

    const def = STAT_DEFS[stat];
    let better = null;
    if (!isArray && typeof from === "number" && typeof to === "number" &&
        (def.lowerIsBetter === true || def.lowerIsBetter === false)) {
      better = def.lowerIsBetter ? to < from : to > from;
    }
    out[stat] = { from, to, better };
  }
  return out;
}
