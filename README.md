# Gunbuilder

A 3D gun-builder game for the browser. Build wild weapons from receivers, barrels, grips,
stocks, mags, optics, muzzles, underbarrels, lasers, and ammo types — every part has
buffs and debuffs — then test them at the shooting range or run the timed clearing course.

**Play:** https://josh17400.github.io/gunbuilder/

- Desktop: click to lock mouse. WASD move, Shift sprint, Space jump, LMB fire, RMB aim,
  R reload, X fire mode, E interact, Esc pause.
- iPhone/touch: left side virtual joystick, drag right side to look, on-screen
  FIRE / ADS / RELOAD / JUMP buttons. Add to Home Screen for fullscreen.

Real projectile ballistics (bullet drop, travel time, damage falloff, penetration),
low-poly procedural art, no build step — plain ES modules + Three.js from CDN.

## Develop

Serve the folder with any static server and open it:

```
python -m http.server 8000
```

Push to `main` and GitHub Pages redeploys the live game automatically.

Module interface spec: see `CONTRACTS.md`.
