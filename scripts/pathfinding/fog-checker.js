/**
 * Fog-of-war / vision passability helpers for the A* pathfinder.
 *
 * Foundry v14 stores explored fog as `canvas.visibility.explored`, a
 * PIXI.RenderTexture.  We read individual pixel values by extracting a 1×1
 * region via `PIXI.Extract`.
 *
 * If the texture is unavailable (future Foundry change, headless mode, etc.)
 * `isExplored` degrades gracefully by returning `true` (treat all cells as
 * explored) and emitting a one-time console warning.
 */

let _warned = false;

/**
 * Read a single pixel from a PIXI.RenderTexture at canvas coordinates.
 * Returns the red channel value (0–255), or -1 on failure.
 *
 * @param {PIXI.RenderTexture} rt
 * @param {number} x  Canvas pixel X
 * @param {number} y  Canvas pixel Y
 * @returns {number}
 */
function _sampleRenderTexture(rt, x, y) {
  try {
    const renderer = canvas.app?.renderer;
    if (!renderer?.extract) return -1;

    // Canvas coords → screen coords via the stage transform
    const pt = canvas.stage.toGlobal({ x, y }, undefined, false);

    // Extract a 1-pixel RGBA array
    const pixels = renderer.extract.pixels(
      rt,
      new PIXI.Rectangle(Math.round(pt.x), Math.round(pt.y), 1, 1)
    );
    // pixels[0] = R, pixels[3] = A
    // Explored cells have non-zero alpha in the explored texture
    return pixels?.[3] ?? -1;
  } catch {
    return -1;
  }
}

/**
 * Returns `true` if the canvas position has been explored by the current
 * user's token vision.
 *
 * A cell is considered explored when the alpha channel of
 * `canvas.visibility.explored` at that point is > 0.
 *
 * @param {{ x: number, y: number }} point  Canvas pixel coordinates
 * @returns {boolean}
 */
export function isExplored(point) {
  // No fog exploration tracking → treat everything as open
  if (!canvas?.visibility) return true;

  const explored = canvas.visibility?.explored;
  if (!explored) {
    // Fog not initialised yet — allow passage
    return true;
  }

  if (!(explored instanceof PIXI.RenderTexture)) {
    if (!_warned) {
      _warned = true;
      console.warn(
        "Traveler | canvas.visibility.explored is not a RenderTexture — " +
        "fog-of-war gating disabled.  All cells treated as explored."
      );
    }
    return true;
  }

  const alpha = _sampleRenderTexture(explored, point.x, point.y);
  if (alpha < 0) return true; // sampling failed → allow
  return alpha > 0;
}

/**
 * Walk from `origin` toward `dest` in grid steps and return the centre of the
 * last explored cell — the "fog boundary anchor."
 *
 * If the destination is already explored, returns `dest` unchanged.
 * If the origin is unexplored, returns `origin`.
 *
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} dest
 * @returns {{ x: number, y: number }}
 */
export function fogBoundaryAnchor(origin, dest) {
  if (!canvas?.grid) return origin;

  const gridSize = canvas.grid.size;
  const dx = dest.x - origin.x;
  const dy = dest.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return origin;

  // Step in grid-cell-sized increments along the ray
  const steps = Math.ceil(dist / gridSize);
  let last = origin;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pt = { x: origin.x + dx * t, y: origin.y + dy * t };
    if (!isExplored(pt)) break;
    last = pt;
  }

  return last;
}
