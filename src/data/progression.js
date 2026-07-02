// Career progression: XP curve, part unlock levels, and the 15-mission campaign.
// NO Three.js imports here — pure data/math, same convention as stats.js/compat.js.
//
// XP curve: cumulative xpForLevel(n) = round(400 * n^1.5) is the TOTAL xp required to have
// fully completed n levels (i.e. to be standing at level n+1). xpForLevel(0) = 0, so a brand
// new save (xp=0) is level 1. getLevel walks this table up to MAX_LEVEL.

import { PARTS } from "./parts.js";

export const MAX_LEVEL = 30;

// Cumulative XP required to have completed `n` levels (n=0..MAX_LEVEL-1).
function xpForLevel(n) {
  if (n <= 0) return 0;
  return Math.round(400 * Math.pow(n, 1.5));
}

// { level, into, toNext } — into = xp earned since hitting `level`, toNext = xp still
// needed to reach level+1 (0 once MAX_LEVEL is hit — curve caps, no further leveling).
export function getLevel(xp) {
  const total = Math.max(0, xp || 0);
  let level = 1;
  for (let n = 1; n < MAX_LEVEL; n++) {
    if (total >= xpForLevel(n)) {
      level = n + 1;
    } else {
      break;
    }
  }
  const into = total - xpForLevel(level - 1);
  const toNext = level >= MAX_LEVEL ? 0 : xpForLevel(level) - total;
  return { level, into, toNext };
}

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

// Level 1 base kit — the AX-4 Standard-ish starter loadout, always available.
// Every other canonical part id (64 of them) is mapped in UNLOCK_LEVEL below.
const BASE_KIT = new Set([
  "rcv_pistol", "rcv_ar",
  "brl_standard", "brl_carbine",
  "opt_irons",
  "mag_standard", "mag_compact",
  "stk_standard",
  "grp_standard",
  "amo_fmj",
]);

// Every part not in BASE_KIT, mapped to the level it unlocks at (2..28).
// Pacing notes:
//  - Receiver milestones are the spine (fixed per the design brief): rcv_smg 2, rcv_shotgun 4,
//    rcv_ak 6, rcv_dmr 8, rcv_vector 10, rcv_deagle 12, rcv_p90 14, rcv_lmg 16, rcv_burst 18,
//    rcv_bolt 20, rcv_nailer 22, rcv_gauss 25, rcv_minigun 28.
//  - Attachments/ammo/optics are sprinkled between and alongside receivers so every level
//    2-28 grants at least one unlock, and so gear tends to arrive with (or just after) the
//    receiver it's most useful on: mzl_choke/brl_shorty with the shotgun, opt_2x/opt_4x
//    bracketing the DMR, amo_slug right after shotgun (5, per design brief), amo_ap right
//    after the DMR (9, per design brief), mag_belt+mag_drum with the LMG (16), amo_explosive
//    at 17 (per design brief), ub_bipod alongside it, opt_8x pre-empting the bolt-action (19,
//    per design brief "8x with bolt-ish"), brl_long/stk_heavy landing on/just-before the bolt
//    (20/19), suppressor duo (mzl_suppressor+brl_suppressed) at 23 for a stealth spike, and a
//    wacky trio (brl_pepperbox/lsr_disco/stk_none) right before the minigun caps the climb.
//  - Lasers are spread mid-game (15, 21, 27) as flavorful side-grades, never gating anything.
export const UNLOCK_LEVEL = {
  // --- Level 2: rcv_smg milestone + early recoil-control options ---
  rcv_smg: 2,
  grp_rubber: 2,
  stk_wire: 2,
  amo_hollow: 2,

  // --- Level 3: first sights/attachments (no receiver milestone this level) ---
  opt_reddot: 3,
  ub_vert: 3,
  mzl_flash: 3,

  // --- Level 4: rcv_shotgun milestone + its signature muzzle ---
  rcv_shotgun: 4,
  mzl_choke: 4,

  // --- Level 5: shotgun follow-up (slugs, per design brief) ---
  amo_slug: 5,
  brl_shorty: 5,
  stk_folding: 5,

  // --- Level 6: rcv_ak milestone + hard-hitting barrel/muzzle ---
  rcv_ak: 6,
  mzl_brake: 6,
  brl_bull: 6,

  // --- Level 7 ---
  grp_skeleton: 7,
  mag_quickpull: 7,

  // --- Level 8: rcv_dmr milestone + light zoom ---
  rcv_dmr: 8,
  opt_2x: 8,

  // --- Level 9: DMR follow-up (AP rounds, per design brief; real scope) ---
  amo_ap: 9,
  brl_stub: 9,
  opt_4x: 9,

  // --- Level 10: rcv_vector milestone ---
  rcv_vector: 10,
  ub_angled: 10,
  stk_recon: 10,

  // --- Level 11 ---
  mag_extended: 11,
  stk_cushion: 11,

  // --- Level 12: rcv_deagle milestone ---
  rcv_deagle: 12,
  mzl_comp: 12,

  // --- Level 13 ---
  opt_holo: 13,
  grp_target: 13,

  // --- Level 14: rcv_p90 milestone + its signature huge mag ---
  rcv_p90: 14,
  mag_casket: 14,

  // --- Level 15: mid-game laser #1 ---
  lsr_red: 15,
  brl_carbon: 15,

  // --- Level 16: rcv_lmg milestone + belt/drum feed options ---
  rcv_lmg: 16,
  mag_belt: 16,
  mag_drum: 16,

  // --- Level 17: explosive rounds (per design brief) + bipod to brace for it ---
  amo_explosive: 17,
  ub_bipod: 17,

  // --- Level 18: rcv_burst milestone ---
  rcv_burst: 18,
  mzl_boost: 18,

  // --- Level 19: pre-empting the bolt-action (8x scope + heavy stock, per design brief) ---
  opt_8x: 19,
  stk_heavy: 19,

  // --- Level 20: rcv_bolt milestone + long reach barrel ---
  rcv_bolt: 20,
  brl_long: 20,

  // --- Level 21: mid-game laser #2, quiet ammo ---
  amo_subsonic: 21,
  lsr_green: 21,

  // --- Level 22: rcv_nailer milestone + wacky bare grip ---
  rcv_nailer: 22,
  grp_bare: 22,

  // --- Level 23: stealth spike (suppressor duo) ---
  mzl_suppressor: 23,
  brl_suppressed: 23,

  // --- Level 24 ---
  amo_incendiary: 24,
  ub_shield: 24,

  // --- Level 25: rcv_gauss milestone ---
  rcv_gauss: 25,
  opt_tritium: 25,

  // --- Level 26 ---
  amo_frangible: 26,
  ub_light: 26,

  // --- Level 27: wacky trio before the finale ---
  brl_pepperbox: 27,
  lsr_disco: 27,
  stk_none: 27,

  // --- Level 28: rcv_minigun milestone, capping the climb ---
  rcv_minigun: 28,
  mag_speed: 28,
  grp_ergo: 28,
};

// null / "None" (nullable slot placeholder) is always allowed; base-kit parts are always
// allowed; everything else needs UNLOCK_LEVEL[partId] <= level.
export function isUnlocked(partId, level) {
  if (partId == null || partId === "None") return true;
  if (BASE_KIT.has(partId)) return true;
  const at = UNLOCK_LEVEL[partId];
  if (at == null) return false;
  return level >= at;
}

// Parts (full Part objects, per data/parts.js) that unlock at EXACTLY this level.
export function unlocksAt(level) {
  return Object.keys(UNLOCK_LEVEL)
    .filter((id) => UNLOCK_LEVEL[id] === level)
    .map((id) => PARTS[id])
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Missions — 15-mission campaign at the Ironsight Proving Grounds. Range master
// Hale narrates; the arc runs rookie orientation -> certified gunsmith -> the
// experimental exotic cert (mission 15).
// ---------------------------------------------------------------------------

// Reusable forced loadouts (full Build objects — each passes sanitizeBuild unchanged,
// so nothing gets silently dropped when a mission hands it to the player).
const BUILD_PISTOL_IRONS = {
  name: "Range Iron",
  receiver: "rcv_pistol", barrel: "brl_carbine", muzzle: null, optic: "opt_irons",
  mag: "mag_compact", stock: null, grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_AR_ACADEMY = {
  name: "Academy AX-4",
  receiver: "rcv_ar", barrel: "brl_standard", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: "stk_standard", grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_SMG_ACADEMY = {
  name: "Academy Hornet",
  receiver: "rcv_smg", barrel: "brl_carbine", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: null, grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_SHOTGUN_ACADEMY = {
  name: "Academy Kodiak",
  receiver: "rcv_shotgun", barrel: "brl_standard", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: "stk_standard", grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_AK_ACADEMY = {
  name: "Academy Kalash",
  receiver: "rcv_ak", barrel: "brl_standard", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: "stk_standard", grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_DMR_ACADEMY = {
  name: "Academy Longeye",
  receiver: "rcv_dmr", barrel: "brl_standard", muzzle: null, optic: "opt_4x",
  mag: "mag_standard", stock: "stk_standard", grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_DEAGLE_ACADEMY = {
  name: "Academy Judge",
  receiver: "rcv_deagle", barrel: "brl_carbine", muzzle: null, optic: "opt_irons",
  mag: "mag_compact", stock: null, grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_P90_ACADEMY = {
  name: "Academy Hive",
  receiver: "rcv_p90", barrel: "brl_carbine", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: null, grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};
const BUILD_BOLT_ACADEMY = {
  name: "Academy Ridgeline",
  receiver: "rcv_bolt", barrel: "brl_long", muzzle: null, optic: "opt_8x",
  mag: "mag_extended", stock: "stk_heavy", grip: "grp_standard", underbarrel: null,
  laser: null, ammo: "amo_fmj",
};

export const MISSIONS = [
  {
    id: "m01",
    title: "Orientation",
    story: "Hale slaps a stock nine-mil into your hands. \"Ironsight Proving Grounds, rookie — "
      + "six steel dots, forty seconds, don't embarrass the range.\" Welcome to gunsmith certification.",
    mode: "lanes",
    forcedBuild: BUILD_PISTOL_IRONS,
    objective: { type: "hits", count: 6, timeLimit: 40 },
    stars: [1, 8, 16],
    rewardXp: 300,
  },
  {
    id: "m02",
    title: "Steady Hands",
    story: "\"Speed's nothing without control,\" Hale grunts, resetting the lane. Same pistol, "
      + "faster clock — prove your trigger discipline isn't a fluke.",
    mode: "lanes",
    forcedBuild: BUILD_PISTOL_IRONS,
    objective: { type: "hits", count: 8, timeLimit: 35 },
    stars: [1, 7, 14],
    rewardXp: 350,
  },
  {
    id: "m03",
    title: "First Course",
    story: "Hale walks you to the course gate. \"Real rifle, real room. Clear it clean and I'll "
      + "sign off on your first cert.\"",
    mode: "course",
    forcedBuild: BUILD_AR_ACADEMY,
    objective: { type: "time" },
    stars: [90, 60, 42],
    rewardXp: 420,
  },
  {
    id: "m04",
    title: "Spray and Pray",
    story: "\"Hornet SMG — light, loud, and thirsty for ammo,\" Hale says, tossing you a fresh "
      + "mag. Lay down thirty seconds of suppressive fire and show me the numbers.",
    mode: "lanes",
    forcedBuild: BUILD_SMG_ACADEMY,
    objective: { type: "damage", amount: 500, timeLimit: 30 },
    stars: [1, 6, 12],
    rewardXp: 480,
  },
  {
    id: "m05",
    title: "Boomstick Cert",
    story: "Hale racks the Kodiak's slide with a grin. \"Close and ugly — that's shotgun work. "
      + "Five targets, thirty seconds, don't flinch.\"",
    mode: "lanes",
    forcedBuild: BUILD_SHOTGUN_ACADEMY,
    objective: { type: "hits", count: 5, timeLimit: 30 },
    stars: [1, 6, 12],
    rewardXp: 550,
  },
  {
    id: "m06",
    title: "Iron Discipline",
    story: "\"Enough training wheels,\" Hale says, nodding at the builder rack. \"Build your own "
      + "loadout and put ten hits on the board.\"",
    mode: "lanes",
    objective: { type: "hits", count: 10, timeLimit: 45 },
    stars: [1, 8, 16],
    rewardXp: 620,
  },
  {
    id: "m07",
    title: "Full Course, First Run",
    story: "Hale hands you the keys to the full course. \"No hand-holding this time — your build, "
      + "your run. Show me a real gunsmith's time.\"",
    mode: "course",
    objective: { type: "time" },
    stars: [75, 50, 38],
    rewardXp: 700,
  },
  {
    id: "m08",
    title: "Heavy Caliber",
    story: "\"Kalash kicks like a mule and hits twice as hard,\" Hale warns, patting the AK's "
      + "receiver. Stack up the damage before the buzzer.",
    mode: "lanes",
    forcedBuild: BUILD_AK_ACADEMY,
    objective: { type: "damage", amount: 650, timeLimit: 35 },
    stars: [1, 7, 15],
    rewardXp: 780,
  },
  {
    id: "m09",
    title: "Reach Out",
    story: "Hale points downrange to the farthest lane. \"DMR work — one shot, one problem. Six "
      + "hits, take your time, just don't miss.\"",
    mode: "lanes",
    forcedBuild: BUILD_DMR_ACADEMY,
    objective: { type: "hits", count: 6, timeLimit: 45 },
    stars: [2, 10, 20],
    rewardXp: 860,
  },
  {
    id: "m10",
    title: "Second Lap",
    story: "\"Second lap, rookie,\" Hale says, checking his stopwatch. \"Same course, higher bar. "
      + "Let's see if the last cert stuck.\"",
    mode: "course",
    objective: { type: "time" },
    stars: [68, 46, 35],
    rewardXp: 950,
  },
  {
    id: "m11",
    title: "Quickdraw",
    story: "Hale flips you the Judge .50. \"Seven rounds, all thunder. Quickdraw drill — hit hard, "
      + "hit fast.\"",
    mode: "lanes",
    forcedBuild: BUILD_DEAGLE_ACADEMY,
    objective: { type: "damage", amount: 450, timeLimit: 25 },
    stars: [1, 5, 10],
    rewardXp: 1040,
  },
  {
    id: "m12",
    title: "Bullet Hose",
    story: "\"Fifty rounds and no reason to stop,\" Hale says, hefting the P90. Hose the range "
      + "and rack up the damage before the mag runs dry.",
    mode: "lanes",
    forcedBuild: BUILD_P90_ACADEMY,
    objective: { type: "damage", amount: 900, timeLimit: 30 },
    stars: [1, 6, 14],
    rewardXp: 1140,
  },
  {
    id: "m13",
    title: "The Long Course",
    story: "Hale doesn't say much this time — just points at the course and starts the clock. "
      + "\"You know the drill. Beat it.\"",
    mode: "course",
    objective: { type: "time" },
    stars: [62, 42, 32],
    rewardXp: 1250,
  },
  {
    id: "m14",
    title: "One Shot Certification",
    story: "\"Bolt action,\" Hale says, almost reverent, handing over the Ridgeline. \"Five shots, "
      + "five kills. This is where gunsmiths become marksmen.\"",
    mode: "lanes",
    forcedBuild: BUILD_BOLT_ACADEMY,
    objective: { type: "hits", count: 5, timeLimit: 50 },
    stars: [3, 12, 24],
    rewardXp: 1370,
  },
  {
    id: "m15",
    title: "Exotic Clearance",
    story: "Hale looks over the exotic rack — gauss coils, mini-gun barrels, all the wacky "
      + "proving-ground iron. \"Last cert, rookie — pick your monster and clear the course.\" "
      + "Do this, and you're not a rookie anymore.",
    mode: "course",
    objective: { type: "time" },
    stars: [56, 38, 29],
    rewardXp: 1500,
  },
];

// result = {timeSeconds} for "time" objectives, or {completed, timeLeft} for "hits"/"damage".
// Returns 0 when the mission wasn't completed, otherwise 1/2/3 against mission.stars thresholds.
export function starsForResult(mission, result) {
  if (!mission || !mission.objective || !Array.isArray(mission.stars) || mission.stars.length !== 3) {
    return 0;
  }
  const [s1, s2, s3] = mission.stars;

  if (mission.objective.type === "time") {
    const t = result && result.timeSeconds;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return 0;
    if (t <= s3) return 3;
    if (t <= s2) return 2;
    if (t <= s1) return 1;
    return 0;
  }

  // "hits" / "damage": must be flagged completed; stars scale with spare time left.
  if (!result || !result.completed) return 0;
  const timeLeft = typeof result.timeLeft === "number" && Number.isFinite(result.timeLeft)
    ? Math.max(0, result.timeLeft)
    : 0;
  if (timeLeft >= s3) return 3;
  if (timeLeft >= s2) return 2;
  if (timeLeft >= s1) return 1;
  return 0;
}
