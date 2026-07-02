// Small math + Three.js-agnostic disposal helpers shared across the codebase.

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, v) {
  if (a === b) return 0;
  return (v - a) / (b - a);
}

// Exponential smoothing / framerate-independent damping.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// Traverse an Object3D-like tree (duck-typed) and dispose geometries,
// materials, and textures to free GPU memory.
export function disposeScene(root) {
  if (!root || typeof root.traverse !== "function") return;

  const disposedMaterials = new Set();
  const disposedTextures = new Set();

  function disposeMaterial(material) {
    if (!material || disposedMaterials.has(material)) return;
    disposedMaterials.add(material);

    for (const key in material) {
      const value = material[key];
      if (value && typeof value === "object" && typeof value.dispose === "function" && value.isTexture) {
        if (!disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
    }

    if (typeof material.dispose === "function") {
      material.dispose();
    }
  }

  root.traverse((obj) => {
    if (obj.geometry && typeof obj.geometry.dispose === "function") {
      obj.geometry.dispose();
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(obj.material);
      }
    }
  });
}
