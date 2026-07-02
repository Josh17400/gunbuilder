---
name: gunbuilder-playwright-headless-rig
description: How to actually launch a working headless Chromium against Gunbuilder in this environment (no package.json/node_modules in the repo) — port pinning, ESM import gotchas, audio autoplay flag, __gb probing tricks
metadata:
  type: project
---

Context: [[project-gunbuilder-contracts]]. Gunbuilder has no `package.json` /
`node_modules` in the repo itself — it's plain ES modules loaded via
`index.html`'s import map (three.js from jsdelivr CDN, network access to
`cdn.jsdelivr.net` works fine in this sandbox). To drive it with Playwright
from a scratchpad script, several non-obvious steps are needed:

**Static server**: write a throwaway `node -e "http.createServer(...)"` (or a
scratchpad `.mjs`) that serves the repo root as-is on a free port (e.g. 8934)
with correct `Content-Type: application/javascript` for `.js` — the browser's
ESM loader is strict about MIME type.

**Playwright package resolution is broken for bare imports.** There's no
local `playwright` package and no global `npm link`, but a working Chromium +
`playwright` copy already exists as a transitive dependency of the globally
installed `@playwright/mcp` package:
`C:/Users/joshu/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright`.
Import it by an absolute `file://` URL (Windows requires the `file:///C:/...`
form — a bare `C:/...` path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`), and
because that copy of `playwright` is CommonJS, use the default-import +
destructure form, not a named import:
```js
import playwrightPkg from "file:///C:/Users/joshu/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright/index.js";
const { chromium } = playwrightPkg;
```
`npx playwright install` does NOT work here (it refuses without a local
`package.json`/`@playwright/test` dependency) — don't waste time on it.

**Browser binary version mismatch.** That `playwright` copy (v1.55.0-alpha)
expects Chromium revision 1186, but only 1187/1228 are actually present under
`~/AppData/Local/ms-playwright/` (installed by some other global tool, e.g.
the `@playwright/mcp` server itself or a prior `npx playwright install`
chromium run). `chromium.launch()` with no args fails with "Executable
doesn't exist at .../chromium_headless_shell-1186/...". Fix: pass
`executablePath` explicitly, e.g.
`C:/Users/joshu/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe`
(verify the exact folder/exe name first — `chromium-N/chrome-win64/chrome.exe`
on newer revisions, `chromium-N/chrome-win/chrome.exe` on older ones).

**Audio autoplay**: launch with
`args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"]`
— the swiftshader flags avoid GPU/WebGL init flakiness in a headless/sandboxed
box, and the autoplay flag is required for `audio.init()`'s
`ctx.resume()` to actually reach `"running"` state without a real user
gesture (Playwright's synthetic `click`/`keyboard` events don't count as a
gesture for the Web Audio autoplay policy without this flag).

**`window.__gb`** (set at the bottom of `src/main.js`) exposes
`{ manager, input, renderer, audio }` — this is the entire debugging surface;
there's no per-screen expose. To get a live camera for probing e.g. headbob,
navigate via `await manager.goTo("staticRange", { build })` from inside
`page.evaluate` (dynamic `import("./src/core/save.js")` and
`import("./src/data/parts.js")` work fine inside the page context to build a
valid build object) — `manager.active.camera` is then a real
`THREE.PerspectiveCamera` you can poll every frame via repeated
`page.evaluate(() => window.__gb.manager.active.camera.position.y)` calls
interleaved with `page.waitForTimeout(20)`.

**Expected noise**: the page always logs one console error for
`GET /favicon.ico 404` (project has no favicon at all) — filter it out by
checking `msg.location().url` for `favicon.ico`, not `msg.text()` (the text
itself is the generic "Failed to load resource: ... 404" with no URL in it).

**Audio.js has no exported way to read `AudioContext.state`.** If a future
brief needs to assert `"running"` vs `"suspended"` from outside the module,
add a tiny debug-only accessor (`getContextState()` was added for exactly
this in the audio+feel-polish brief, 2026-07-02) rather than trying to probe
it indirectly — there's no other way in since `ctx` is a module-private
variable.
