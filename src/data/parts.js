// Part catalog. NO Three.js imports here — meshes are built elsewhere (src/gun/partMeshes.js)
// keyed off these ids. See CONTRACTS.md "Part shape" for the exact object shape and
// src/data/stats.js for how `base`/`add`/`mult` combine into final weapon stats.
//
// adsZoom: every receiver base is 1.0; optics reach their target zoom via a flat `add`
// offset (see stats.js header comment) — no part ever uses mult.adsZoom.

export const SLOTS = [
  "receiver", "barrel", "muzzle", "optic", "mag",
  "stock", "grip", "underbarrel", "laser", "ammo",
];

// ---------------------------------------------------------------------------
// Receivers
// ---------------------------------------------------------------------------

const RECEIVERS = {
  rcv_pistol: {
    id: "rcv_pistol", slot: "receiver", name: "Vandal 9", blurb: "Quick draw, quick reload",
    sizeClass: "light", tags: [], caliberFamily: "pistol",
    slotsAllowed: { stock: false, underbarrel: false },
    base: {
      damage: 30, fireRate: 400, fireModes: ["semi"],
      recoilV: 1.6, recoilH: 0.5, recoilRecovery: 18,
      muzzleVelocity: 360, adsTime: 0.16, adsZoom: 1.0, mobility: 1.1,
      magSize: 12, reloadTime: 1.4, spreadHip: 1.6, spreadAds: 0.12,
      falloffStart: 18, falloffEnd: 45, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_smg: {
    id: "rcv_smg", slot: "receiver", name: "Hornet SMG", blurb: "Spray hard, run faster",
    sizeClass: "light", tags: [], caliberFamily: "pistol",
    slotsAllowed: {},
    base: {
      damage: 22, fireRate: 850, fireModes: ["auto", "semi"],
      recoilV: 1.1, recoilH: 0.9, recoilRecovery: 18,
      muzzleVelocity: 400, adsTime: 0.18, adsZoom: 1.0, mobility: 1.05,
      magSize: 25, reloadTime: 1.9, spreadHip: 2.2, spreadAds: 0.2,
      falloffStart: 15, falloffEnd: 40, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_ar: {
    id: "rcv_ar", slot: "receiver", name: "AX-4 Rifle", blurb: "Does everything, excels nowhere",
    sizeClass: "medium", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 32, fireRate: 640, fireModes: ["auto", "semi"],
      recoilV: 1.4, recoilH: 0.6, recoilRecovery: 18,
      muzzleVelocity: 720, adsTime: 0.25, adsZoom: 1.0, mobility: 1.0,
      magSize: 30, reloadTime: 2.2, spreadHip: 2.8, spreadAds: 0.1,
      falloffStart: 35, falloffEnd: 90, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_dmr: {
    id: "rcv_dmr", slot: "receiver", name: "Longeye DMR", blurb: "One shot, one problem",
    sizeClass: "medium", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 58, fireRate: 260, fireModes: ["semi"],
      recoilV: 2.6, recoilH: 0.7, recoilRecovery: 18,
      muzzleVelocity: 850, adsTime: 0.32, adsZoom: 1.0, mobility: 0.92,
      magSize: 15, reloadTime: 2.4, spreadHip: 3.5, spreadAds: 0.05,
      falloffStart: 70, falloffEnd: 160, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_shotgun: {
    id: "rcv_shotgun", slot: "receiver", name: "Kodiak 12", blurb: "Close talk, loud answer",
    sizeClass: "medium", tags: ["shotgun"], caliberFamily: "shell",
    slotsAllowed: {},
    base: {
      damage: 12, fireRate: 90, fireModes: ["semi"],
      recoilV: 4.0, recoilH: 1.2, recoilRecovery: 18,
      muzzleVelocity: 380, adsTime: 0.3, adsZoom: 1.0, mobility: 0.95,
      magSize: 6, reloadTime: 3.0, spreadHip: 4.5, spreadAds: 3.0,
      falloffStart: 8, falloffEnd: 22, pellets: 8, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_lmg: {
    id: "rcv_lmg", slot: "receiver", name: "Bulwark LMG", blurb: "Bring a chair, hold the line",
    sizeClass: "heavy", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 34, fireRate: 720, fireModes: ["auto"],
      recoilV: 1.8, recoilH: 1.3, recoilRecovery: 18,
      muzzleVelocity: 700, adsTime: 0.42, adsZoom: 1.0, mobility: 0.72,
      magSize: 75, reloadTime: 5.2, spreadHip: 3.6, spreadAds: 0.15,
      falloffStart: 40, falloffEnd: 110, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_nailer: {
    id: "rcv_nailer", slot: "receiver", name: "Nail Driver", blurb: "Questionable engineering, full auto",
    sizeClass: "light", tags: ["wacky"], caliberFamily: "exotic",
    slotsAllowed: { stock: false },
    base: {
      damage: 18, fireRate: 1100, fireModes: ["auto"],
      recoilV: 0.7, recoilH: 1.6, recoilRecovery: 18,
      muzzleVelocity: 250, adsTime: 0.2, adsZoom: 1.0, mobility: 1.05,
      magSize: 40, reloadTime: 2.3, spreadHip: 3.0, spreadAds: 0.6,
      falloffStart: 12, falloffEnd: 35, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_gauss: {
    id: "rcv_gauss", slot: "receiver", name: "Gauss Bench Rig", blurb: "One round, one crater",
    sizeClass: "heavy", tags: ["wacky"], caliberFamily: "exotic",
    slotsAllowed: {},
    base: {
      damage: 120, fireRate: 45, fireModes: ["semi"],
      recoilV: 5.5, recoilH: 0.2, recoilRecovery: 18,
      muzzleVelocity: 1600, adsTime: 0.5, adsZoom: 1.0, mobility: 0.65,
      magSize: 3, reloadTime: 3.4, spreadHip: 5.0, spreadAds: 0.02,
      falloffStart: 200, falloffEnd: 400, pellets: 1, penetration: 1.0, suppressed: false, spinUp: 0,
    },
  },
  rcv_ak: {
    id: "rcv_ak", slot: "receiver", name: "Kalash-74", blurb: "Hits harder, kicks harder",
    sizeClass: "medium", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 38, fireRate: 600, fireModes: ["auto", "semi"],
      recoilV: 1.9, recoilH: 0.9, recoilRecovery: 18,
      muzzleVelocity: 715, adsTime: 0.27, adsZoom: 1.0, mobility: 0.98,
      magSize: 30, reloadTime: 2.4, spreadHip: 3.0, spreadAds: 0.12,
      falloffStart: 30, falloffEnd: 85, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_vector: {
    id: "rcv_vector", slot: "receiver", name: "Kriss Vex", blurb: "Insanely fast, almost no recoil",
    sizeClass: "light", tags: [], caliberFamily: "pistol",
    slotsAllowed: { stock: false, underbarrel: false },
    base: {
      damage: 16, fireRate: 1200, fireModes: ["auto", "semi"],
      recoilV: 0.6, recoilH: 0.5, recoilRecovery: 18,
      muzzleVelocity: 400, adsTime: 0.16, adsZoom: 1.0, mobility: 1.07,
      magSize: 19, reloadTime: 1.8, spreadHip: 2.0, spreadAds: 0.15,
      falloffStart: 9, falloffEnd: 28, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_p90: {
    id: "rcv_p90", slot: "receiver", name: "Hive-57", blurb: "Bullpup, absurd magazine, full auto",
    sizeClass: "light", tags: ["bullpup"], caliberFamily: "pistol",
    slotsAllowed: { stock: false },
    base: {
      damage: 20, fireRate: 900, fireModes: ["auto"],
      recoilV: 0.9, recoilH: 0.7, recoilRecovery: 18,
      muzzleVelocity: 430, adsTime: 0.22, adsZoom: 1.0, mobility: 1.06,
      magSize: 50, reloadTime: 2.9, spreadHip: 2.4, spreadAds: 0.2,
      falloffStart: 14, falloffEnd: 38, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_deagle: {
    id: "rcv_deagle", slot: "receiver", name: "Judge .50", blurb: "Massive hand cannon, brutal kick",
    sizeClass: "light", tags: ["heavy-pistol"], caliberFamily: "pistol",
    slotsAllowed: { stock: false, underbarrel: false },
    base: {
      damage: 55, fireRate: 220, fireModes: ["semi"],
      recoilV: 3.4, recoilH: 1.0, recoilRecovery: 18,
      muzzleVelocity: 470, adsTime: 0.2, adsZoom: 1.0, mobility: 1.05,
      magSize: 7, reloadTime: 1.9, spreadHip: 2.2, spreadAds: 0.1,
      falloffStart: 25, falloffEnd: 60, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_bolt: {
    id: "rcv_bolt", slot: "receiver", name: "Ridgeline .338", blurb: "Bolt action, devastating single shot",
    sizeClass: "heavy", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 105, fireRate: 55, fireModes: ["semi"],
      recoilV: 4.5, recoilH: 0.4, recoilRecovery: 18,
      muzzleVelocity: 900, adsTime: 0.45, adsZoom: 1.0, mobility: 0.8,
      magSize: 5, reloadTime: 3.6, spreadHip: 5.0, spreadAds: 0.02,
      falloffStart: 120, falloffEnd: 300, pellets: 1, penetration: 0.5, suppressed: false, spinUp: 0,
    },
  },
  rcv_burst: {
    id: "rcv_burst", slot: "receiver", name: "Trident B3", blurb: "Three-round burst, controlled and deadly",
    sizeClass: "medium", tags: [], caliberFamily: "rifle",
    slotsAllowed: {},
    base: {
      damage: 30, fireRate: 900, fireModes: ["burst", "semi"],
      recoilV: 1.3, recoilH: 0.6, recoilRecovery: 18,
      muzzleVelocity: 750, adsTime: 0.24, adsZoom: 1.0, mobility: 1.0,
      magSize: 33, reloadTime: 2.3, spreadHip: 2.6, spreadAds: 0.1,
      falloffStart: 35, falloffEnd: 90, pellets: 1, penetration: 0, suppressed: false, spinUp: 0,
    },
  },
  rcv_minigun: {
    id: "rcv_minigun", slot: "receiver", name: "Grinder GAU", blurb: "Spins up, never stops shredding",
    sizeClass: "heavy", tags: ["wacky"], caliberFamily: "exotic",
    slotsAllowed: { stock: false },
    base: {
      damage: 20, fireRate: 1500, fireModes: ["auto"],
      recoilV: 1.2, recoilH: 2.0, recoilRecovery: 18,
      muzzleVelocity: 650, adsTime: 0.6, adsZoom: 1.0, mobility: 0.6,
      magSize: 200, reloadTime: 6.5, spreadHip: 5.0, spreadAds: 1.5,
      falloffStart: 25, falloffEnd: 70, pellets: 1, penetration: 0, suppressed: false, spinUp: 0.8,
    },
  },
};

// ---------------------------------------------------------------------------
// Barrels
// ---------------------------------------------------------------------------

const BARRELS = {
  brl_stub: {
    id: "brl_stub", slot: "barrel", name: "Stub Barrel", blurb: "Snappy up close, weak far",
    sizeClass: "light", tags: [],
    add: {}, mult: { adsTime: -0.25, muzzleVelocity: -0.2, falloffStart: -0.25, falloffEnd: -0.25, mobility: 0.04 },
  },
  brl_carbine: {
    id: "brl_carbine", slot: "barrel", name: "Carbine Barrel", blurb: "Balanced, a little quicker",
    sizeClass: "light", tags: [],
    add: {}, mult: { adsTime: -0.08, muzzleVelocity: -0.05 },
  },
  brl_standard: {
    id: "brl_standard", slot: "barrel", name: "Standard Barrel", blurb: "No surprises, steady aim",
    sizeClass: "medium", tags: [],
    add: {}, mult: { recoilV: -0.03 },
  },
  brl_bull: {
    id: "brl_bull", slot: "barrel", name: "Bull Barrel", blurb: "Hits harder, moves slower",
    sizeClass: "medium", tags: [],
    add: {}, mult: { damage: 0.08, muzzleVelocity: 0.15, mobility: -0.08, adsTime: 0.15 },
  },
  brl_long: {
    id: "brl_long", slot: "barrel", name: "Long Barrel", blurb: "Reaches out, slows you down",
    sizeClass: "heavy", tags: [],
    add: {}, mult: { muzzleVelocity: 0.3, recoilH: -0.2, spreadAds: -0.15, mobility: -0.1, adsTime: 0.2 },
  },
  brl_suppressed: {
    id: "brl_suppressed", slot: "barrel", name: "Integral Suppressor", blurb: "Whisper-quiet, blocks muzzle",
    sizeClass: "medium", tags: ["integral-suppressor"],
    add: {}, mult: { muzzleVelocity: -0.1, recoilV: -0.15 },
  },
  brl_pepperbox: {
    id: "brl_pepperbox", slot: "barrel", name: "Pepperbox Barrel", blurb: "Doubles the pellets, wrecks accuracy",
    sizeClass: "light", tags: ["wacky"],
    add: { pellets: 2 }, mult: { spreadHip: 0.8, spreadAds: 1.5, damage: -0.15 },
  },
  brl_carbon: {
    id: "brl_carbon", slot: "barrel", name: "Carbon Barrel", blurb: "Ultralight, trades power for speed",
    sizeClass: "light", tags: [],
    add: {}, mult: { mobility: 0.05, adsTime: -0.12, muzzleVelocity: -0.05 },
  },
  brl_shorty: {
    id: "brl_shorty", slot: "barrel", name: "Shorty Barrel", blurb: "Sawed-off, wide spread up close",
    sizeClass: "light", tags: [], requiresReceiverTag: "shotgun",
    add: {}, mult: { spreadHip: 0.3, mobility: 0.06, adsTime: -0.2, falloffStart: -0.3, falloffEnd: -0.3 },
  },
};

// ---------------------------------------------------------------------------
// Grips
// ---------------------------------------------------------------------------

const GRIPS = {
  grp_standard: {
    id: "grp_standard", slot: "grip", name: "Standard Grip", blurb: "Nothing to write home about",
    tags: [], add: {}, mult: {},
  },
  grp_rubber: {
    id: "grp_rubber", slot: "grip", name: "Rubber Grip", blurb: "Settles the gun back down fast",
    tags: [], add: {}, mult: { recoilRecovery: 0.2 },
  },
  grp_skeleton: {
    id: "grp_skeleton", slot: "grip", name: "Skeleton Grip", blurb: "Snaps up faster, wanders sideways",
    tags: [], add: {}, mult: { adsTime: -0.1, recoilH: 0.1 },
  },
  grp_target: {
    id: "grp_target", slot: "grip", name: "Target Grip", blurb: "Locked in, a bit stiff",
    tags: [], add: {}, mult: { recoilH: -0.15, mobility: -0.03 },
  },
  grp_bare: {
    id: "grp_bare", slot: "grip", name: "Bare Frame", blurb: "No grip at all, somehow faster",
    tags: ["wacky"], add: {}, mult: { mobility: 0.05, recoilV: 0.25, recoilH: 0.25 },
  },
  grp_ergo: {
    id: "grp_ergo", slot: "grip", name: "Ergo Grip", blurb: "Comfortable, quicker hands all around",
    tags: [], add: {}, mult: { adsTime: -0.05, recoilRecovery: 0.1 },
  },
};

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

const STOCKS = {
  stk_none: {
    id: "stk_none", slot: "stock", name: "No Stock", blurb: "Fast hands, weak walls",
    sizeClass: "light", tags: [],
    add: {}, mult: { mobility: 0.08, spreadHip: 0.4, recoilV: 0.3, recoilH: 0.3, adsTime: -0.1 },
  },
  stk_wire: {
    id: "stk_wire", slot: "stock", name: "Wire Stock", blurb: "Light and quick to shoulder",
    sizeClass: "light", tags: [],
    add: {}, mult: { adsTime: -0.1, recoilV: 0.05 },
  },
  stk_folding: {
    id: "stk_folding", slot: "stock", name: "Folding Stock", blurb: "Compact, faster on your feet",
    sizeClass: "medium", tags: [],
    add: {}, mult: { mobility: 0.02 },
  },
  stk_standard: {
    id: "stk_standard", slot: "stock", name: "Standard Stock", blurb: "Solid, does the job",
    sizeClass: "medium", tags: [],
    add: {}, mult: {},
  },
  stk_heavy: {
    id: "stk_heavy", slot: "stock", name: "Heavy Stock", blurb: "Tames recoil, weighs you down",
    sizeClass: "heavy", tags: [],
    add: {}, mult: { recoilV: -0.25, adsTime: 0.2, mobility: -0.08 },
  },
  stk_cushion: {
    id: "stk_cushion", slot: "stock", name: "Cushion Stock", blurb: "Bounces back between shots",
    sizeClass: "medium", tags: [],
    add: {}, mult: { recoilRecovery: 0.35 },
  },
  stk_recon: {
    id: "stk_recon", slot: "stock", name: "Recon Stock", blurb: "Fast to aim, slightly loose",
    sizeClass: "medium", tags: [],
    add: {}, mult: { adsTime: -0.15, recoilV: 0.08 },
  },
};

// ---------------------------------------------------------------------------
// Mags
// ---------------------------------------------------------------------------

const MAGS = {
  mag_compact: {
    id: "mag_compact", slot: "mag", name: "Compact Mag", blurb: "Fewer rounds, faster swap",
    sizeClass: "light", tags: [],
    add: {}, mult: { magSize: -0.4, reloadTime: -0.2, adsTime: -0.05 },
  },
  mag_standard: {
    id: "mag_standard", slot: "mag", name: "Standard Mag", blurb: "The dependable default",
    sizeClass: "light", tags: [],
    add: {}, mult: {},
  },
  mag_extended: {
    id: "mag_extended", slot: "mag", name: "Extended Mag", blurb: "More rounds, slower reload",
    sizeClass: "medium", tags: [],
    add: {}, mult: { magSize: 0.5, reloadTime: 0.15, mobility: -0.03 },
  },
  mag_drum: {
    id: "mag_drum", slot: "mag", name: "Drum Mag", blurb: "Huge capacity, huge reload",
    sizeClass: "medium", tags: [],
    add: {}, mult: { magSize: 1.5, reloadTime: 0.5, adsTime: 0.15, mobility: -0.06 },
  },
  mag_belt: {
    id: "mag_belt", slot: "mag", name: "Ammo Belt", blurb: "Never stops feeding",
    sizeClass: "heavy", tags: [],
    add: {}, mult: { magSize: 2.5, reloadTime: 0.9, mobility: -0.12 },
  },
  mag_quickpull: {
    id: "mag_quickpull", slot: "mag", name: "Quickpull Mag", blurb: "Slim, snaps in instantly",
    sizeClass: "light", tags: [],
    add: {}, mult: { magSize: -0.1, reloadTime: -0.35 },
  },
  mag_casket: {
    id: "mag_casket", slot: "mag", name: "Casket Mag", blurb: "Massive capacity, slow to raise",
    sizeClass: "light", tags: [],
    add: {}, mult: { magSize: 0.8, reloadTime: 0.3, adsTime: 0.1 },
  },
  mag_speed: {
    id: "mag_speed", slot: "mag", name: "Speed Mag", blurb: "Snappy reload, slightly fewer rounds",
    sizeClass: "light", tags: [],
    add: {}, mult: { reloadTime: -0.25, magSize: -0.05 },
  },
};

// ---------------------------------------------------------------------------
// Optics
// ---------------------------------------------------------------------------

const OPTICS = {
  opt_irons: {
    id: "opt_irons", slot: "optic", name: "Iron Sights", blurb: "Always there, barely zoomed",
    tags: [], add: { adsZoom: -0.15 }, mult: {},
  },
  opt_reddot: {
    id: "opt_reddot", slot: "optic", name: "Red Dot", blurb: "Fast dot, mild zoom",
    tags: [], add: { adsZoom: -0.25 }, mult: {},
  },
  opt_holo: {
    id: "opt_holo", slot: "optic", name: "Holo Sight", blurb: "Crisp reticle, tighter aim",
    tags: [], add: { adsZoom: -0.3 }, mult: { spreadAds: -0.05 },
  },
  opt_4x: {
    id: "opt_4x", slot: "optic", name: "4x Scope", blurb: "Real zoom, slower to raise",
    tags: [], add: { adsZoom: -0.55 }, mult: { adsTime: 0.2 },
  },
  opt_8x: {
    id: "opt_8x", slot: "optic", name: "8x Scope", blurb: "Sniper glass, sluggish everything",
    tags: [], add: { adsZoom: -0.7 }, mult: { adsTime: 0.4, mobility: -0.03 },
  },
  opt_2x: {
    id: "opt_2x", slot: "optic", name: "2x Scope", blurb: "Light zoom, quick to raise",
    tags: [], add: { adsZoom: -0.4 }, mult: { adsTime: 0.05 },
  },
  opt_tritium: {
    id: "opt_tritium", slot: "optic", name: "Tritium Sights", blurb: "Glows in the dark, fast",
    tags: [], add: { adsZoom: -0.2 }, mult: { adsTime: -0.15 },
  },
};

// ---------------------------------------------------------------------------
// Muzzles
// ---------------------------------------------------------------------------

const MUZZLES = {
  mzl_comp: {
    id: "mzl_comp", slot: "muzzle", name: "Compensator", blurb: "Keeps the muzzle down",
    tags: [], add: {}, mult: { recoilV: -0.15 },
  },
  mzl_brake: {
    id: "mzl_brake", slot: "muzzle", name: "Muzzle Brake", blurb: "Cuts sideways kick, spreads hip",
    tags: [], add: {}, mult: { recoilH: -0.2, spreadHip: 0.1 },
  },
  mzl_flash: {
    id: "mzl_flash", slot: "muzzle", name: "Flash Hider", blurb: "Hides the flash, tightens hip",
    tags: [], add: {}, mult: { spreadHip: -0.05 },
  },
  mzl_suppressor: {
    id: "mzl_suppressor", slot: "muzzle", name: "Suppressor", blurb: "Quiet, softens recoil and speed",
    tags: [], add: {}, mult: { recoilV: -0.1, recoilH: -0.1, muzzleVelocity: -0.05, mobility: -0.03 },
  },
  mzl_choke: {
    id: "mzl_choke", slot: "muzzle", name: "Choke", blurb: "Tightens the shot pattern",
    tags: [], requiresReceiverTag: "shotgun", add: {}, mult: { spreadHip: -0.3, spreadAds: -0.3 },
  },
  mzl_boost: {
    id: "mzl_boost", slot: "muzzle", name: "Velocity Booster", blurb: "Faster rounds, rougher muzzle rise",
    tags: [], add: {}, mult: { muzzleVelocity: 0.08, recoilV: 0.1 },
  },
};

// ---------------------------------------------------------------------------
// Underbarrel
// ---------------------------------------------------------------------------

const UNDERBARRELS = {
  ub_vert: {
    id: "ub_vert", slot: "underbarrel", name: "Vertical Grip", blurb: "Steadies the muzzle climb",
    sizeClass: "light", tags: [], add: {}, mult: { recoilV: -0.12 },
  },
  ub_angled: {
    id: "ub_angled", slot: "underbarrel", name: "Angled Grip", blurb: "Snappier aim-down-sights",
    sizeClass: "light", tags: [], add: {}, mult: { adsTime: -0.08 },
  },
  ub_bipod: {
    id: "ub_bipod", slot: "underbarrel", name: "Bipod", blurb: "Braces the gun, slows you",
    sizeClass: "medium", tags: [], add: {}, mult: { recoilV: -0.2, recoilH: -0.2, mobility: -0.04 },
  },
  ub_shield: {
    id: "ub_shield", slot: "underbarrel", name: "Ballistic Shield", blurb: "Absurd, heavy, oddly stable",
    sizeClass: "heavy", tags: ["wacky"], add: {}, mult: { mobility: -0.15, recoilH: -0.1 },
  },
  ub_light: {
    id: "ub_light", slot: "underbarrel", name: "Tac Light", blurb: "Cosmetic light, tighter hip fire",
    sizeClass: "light", tags: [], add: {}, mult: { spreadHip: -0.05 },
  },
};

// ---------------------------------------------------------------------------
// Lasers
// ---------------------------------------------------------------------------

const LASERS = {
  lsr_red: {
    id: "lsr_red", slot: "laser", name: "Red Laser", blurb: "Classic dot, tighter hip fire",
    tags: [], laserColor: 0xff3333, add: {}, mult: { spreadHip: -0.2 },
  },
  lsr_green: {
    id: "lsr_green", slot: "laser", name: "Green Laser", blurb: "Sharper beam, tightest hip fire",
    tags: [], laserColor: 0x33ff66, add: {}, mult: { spreadHip: -0.3, mobility: -0.01 },
  },
  lsr_disco: {
    id: "lsr_disco", slot: "laser", name: "Disco Laser", blurb: "Ridiculous, still helps aim",
    tags: ["wacky"], laserColor: 0xff00ff, add: {}, mult: { spreadHip: -0.25 },
  },
};

// ---------------------------------------------------------------------------
// Ammo
// ---------------------------------------------------------------------------

const ALL_FAMILIES = ["pistol", "rifle", "shell", "exotic"];

const AMMO = {
  amo_fmj: {
    id: "amo_fmj", slot: "ammo", name: "Full Metal Jacket", blurb: "Reliable all-rounder",
    tags: [], add: { penetration: 0.3 }, mult: {},
    ammo: { tracer: 0xffcc55, tracerAlpha: 1, families: ALL_FAMILIES.slice() },
  },
  amo_hollow: {
    id: "amo_hollow", slot: "ammo", name: "Hollow Point", blurb: "Hits hard, drops off fast",
    tags: [], add: {}, mult: { damage: 0.25, falloffStart: -0.4, falloffEnd: -0.4 },
    ammo: { tracer: 0xff8855, tracerAlpha: 1, families: ALL_FAMILIES.slice() },
  },
  amo_ap: {
    id: "amo_ap", slot: "ammo", name: "Armor Piercing", blurb: "Punches through cover",
    tags: [], add: { penetration: 1.0 }, mult: { damage: -0.1 },
    ammo: { tracer: 0x88ddff, tracerAlpha: 1, families: ["pistol", "rifle", "exotic"] },
  },
  amo_explosive: {
    id: "amo_explosive", slot: "ammo", name: "Explosive Rounds", blurb: "Boom on impact, slow fire",
    tags: [], add: {}, mult: { damage: -0.3, muzzleVelocity: -0.15 },
    ammo: {
      tracer: 0xff5533, tracerAlpha: 1, families: ["rifle", "shell", "exotic"],
      rpmCap: 450, explosive: { radius: 2.5, damage: 25 },
    },
  },
  amo_incendiary: {
    id: "amo_incendiary", slot: "ammo", name: "Incendiary Rounds", blurb: "Sets targets on fire",
    tags: [], add: {}, mult: { damage: -0.2 },
    ammo: { tracer: 0xff7722, tracerAlpha: 1, families: ALL_FAMILIES.slice(), incendiary: { dps: 5, duration: 3 } },
  },
  amo_subsonic: {
    id: "amo_subsonic", slot: "ammo", name: "Subsonic Rounds", blurb: "Slow, quiet, hits softer targets harder",
    tags: [], add: {}, mult: { muzzleVelocity: -0.35, damage: 0.1, recoilV: -0.05 },
    ammo: { tracer: 0x99aabb, tracerAlpha: 0.25, families: ["pistol", "rifle"] },
  },
  amo_slug: {
    id: "amo_slug", slot: "ammo", name: "Slug Rounds", blurb: "Single slug, punches through range",
    // pelletsOverride forces the composed pellet count to exactly 1 regardless of the
    // receiver's base pellet count (see stats.js composeStats) — a single-projectile slug
    // replacing a shotgun's spread pattern, not a spread multiplier.
    tags: [], requiresReceiverTag: "shotgun",
    add: {}, mult: { damage: 2.0, falloffStart: 1.0, falloffEnd: 1.0, spreadHip: -0.5, spreadAds: -0.5 },
    ammo: { tracer: 0xdddddd, tracerAlpha: 1, families: ["shell"], pelletsOverride: 1 },
  },
  amo_frangible: {
    id: "amo_frangible", slot: "ammo", name: "Frangible Rounds", blurb: "Shatters on impact, hits flesh harder",
    // mult.penetration: -1 zeroes penetration outright ((base + 0) * (1 - 1) = 0) regardless
    // of the receiver's base penetration value.
    tags: [], add: {}, mult: { damage: 0.15, penetration: -1 },
    ammo: { tracer: 0xffddaa, tracerAlpha: 1, families: ["pistol", "rifle"], fleshBonus: 1.35 },
  },
};

// ---------------------------------------------------------------------------
// Combined catalog
// ---------------------------------------------------------------------------

export const PARTS = {
  ...RECEIVERS, ...BARRELS, ...GRIPS, ...STOCKS, ...MAGS,
  ...OPTICS, ...MUZZLES, ...UNDERBARRELS, ...LASERS, ...AMMO,
};

export const PARTS_BY_SLOT = SLOTS.reduce((acc, slot) => {
  acc[slot] = Object.values(PARTS).filter((p) => p.slot === slot);
  return acc;
}, {});

export const DEFAULT_BUILD = {
  name: "AX-4 Standard",
  receiver: "rcv_ar",
  barrel: "brl_standard",
  muzzle: null,
  optic: "opt_irons",
  mag: "mag_standard",
  stock: "stk_standard",
  grip: "grp_standard",
  underbarrel: null,
  laser: null,
  ammo: "amo_fmj",
};
