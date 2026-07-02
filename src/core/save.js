// localStorage persistence for builds, best times, and settings.
// All access wrapped in try/catch (private/incognito or quota issues).

const KEY_BUILDS = "gunbuilder.v1.builds";
const KEY_BEST_TIMES = "gunbuilder.v1.bestTimes";
const KEY_SETTINGS = "gunbuilder.v1.settings";
const KEY_LAST_BUILD = "gunbuilder.v1.lastBuild";

const DEFAULT_SETTINGS = { sens: 1, touchSens: 1, volume: 0.8 };

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    console.error(`save: failed to read ${key}`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`save: failed to write ${key}`, err);
  }
}

export const save = {
  loadBuilds() {
    const builds = readJSON(KEY_BUILDS, []);
    return Array.isArray(builds) ? builds : [];
  },

  saveBuilds(arr) {
    writeJSON(KEY_BUILDS, Array.isArray(arr) ? arr : []);
  },

  loadLastBuild() {
    return readJSON(KEY_LAST_BUILD, null);
  },

  saveLastBuild(build) {
    writeJSON(KEY_LAST_BUILD, build);
  },

  loadBestTimes() {
    const fallback = { course: { global: null, byBuild: {} } };
    const result = readJSON(KEY_BEST_TIMES, fallback);
    if (!result || typeof result !== "object" || !result.course) return fallback;
    if (!result.course.byBuild || typeof result.course.byBuild !== "object") {
      result.course.byBuild = {};
    }
    if (result.course.global === undefined) result.course.global = null;
    return result;
  },

  saveBestTimes(obj) {
    writeJSON(KEY_BEST_TIMES, obj);
  },

  getSettings() {
    const settings = readJSON(KEY_SETTINGS, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  },

  saveSettings(patch) {
    const current = save.getSettings();
    const merged = { ...current, ...patch };
    writeJSON(KEY_SETTINGS, merged);
    return merged;
  },
};
