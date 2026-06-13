/**
 * Grid-aware A* pathfinder for Foundry VTT v14.
 *
 * Uses:
 *  - canvas.grid.getOffset / getCenterPoint / getNeighbors  (grid topology)
 *  - canvas.walls.checkCollision                            (wall avoidance)
 *
 * Phase 2 adds fog-of-war and region passability via the `isPassable` option.
 */

// ---------------------------------------------------------------------------
// Binary min-heap (priority queue)
// ---------------------------------------------------------------------------

class MinHeap {
  constructor() {
    this._data = [];
  }

  get size() {
    return this._data.length;
  }

  /**
   * @param {{ key: string, f: number }} item
   */
  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  /** @returns {{ key: string, f: number }} */
  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._data[i].f < this._data[p].f) {
        [this._data[i], this._data[p]] = [this._data[p], this._data[i]];
        i = p;
      } else break;
    }
  }

  _siftDown(i) {
    const n = this._data.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[s].f) s = l;
      if (r < n && this._data[r].f < this._data[s].f) s = r;
      if (s === i) break;
      [this._data[i], this._data[s]] = [this._data[s], this._data[i]];
      i = s;
    }
  }
}

// ---------------------------------------------------------------------------
// Grid helpers — normalise Foundry's varying offset shapes
// ---------------------------------------------------------------------------

/**
 * Convert a pixel point to a GridOffset.
 * @param {{ x: number, y: number }} pt
 * @returns {{ i: number, j: number }}
 */
function toOffset(pt) {
  const off = canvas.grid.getOffset({ x: pt.x, y: pt.y });
  // Foundry v14 returns {i, j}; guard against older shapes
  if (typeof off?.i === "number") return { i: off.i, j: off.j };
  if (typeof off?.row === "number") return { i: off.row, j: off.col };
  if (Array.isArray(off)) return { i: off[0], j: off[1] };
  return { i: 0, j: 0 };
}

/**
 * Convert a GridOffset to the pixel centre of that cell.
 * @param {{ i: number, j: number }} off
 * @returns {{ x: number, y: number }}
 */
function toCenter(off) {
  const pt = canvas.grid.getCenterPoint({ i: off.i, j: off.j });
  if (pt && typeof pt.x === "number") return { x: pt.x, y: pt.y };
  // Fallback
  return { x: off.j * canvas.grid.size + canvas.grid.size / 2,
           y: off.i * canvas.grid.size + canvas.grid.size / 2 };
}

/**
 * Get neighbour offsets for a grid cell.
 * Normalises {i,j}, {row,col}, or [row,col] shapes returned by different
 * Foundry versions / grid types.
 * @param {{ i: number, j: number }} off
 * @returns {{ i: number, j: number }[]}
 */
function getNeighborOffsets(off) {
  let raw;
  try {
    raw = canvas.grid.getNeighbors(off.i, off.j);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((nb) => {
    if (nb && typeof nb === "object" && !Array.isArray(nb)) {
      if (typeof nb.i === "number") return { i: nb.i, j: nb.j };
      if (typeof nb.row === "number") return { i: nb.row, j: nb.col };
    }
    if (Array.isArray(nb) && nb.length >= 2) return { i: nb[0], j: nb[1] };
    return null;
  }).filter(Boolean);
}

/** @param {{ i: number, j: number }} off @returns {string} */
const offKey = (off) => `${off.i},${off.j}`;

// ---------------------------------------------------------------------------
// Wall collision
// ---------------------------------------------------------------------------

/**
 * Returns true if the segment from `from` to `to` crosses a MOVE-blocking wall.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {boolean}
 */
function wallBlocks(from, to) {
  try {
    return !!canvas.walls.checkCollision(from, to, { type: "move" });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AStarOptions
 * @property {number}  [maxNodes=2500]
 *   Maximum nodes to expand; prevents browser freeze on large maps.
 *   Returns a partial path when the budget is exhausted.
 * @property {function({x: number, y: number}): boolean} [isPassable]
 *   Extra per-node passability filter.  Receives the pixel centre of a
 *   candidate cell; return false to treat it as impassable.
 *   Used by Phase 2 for fog-of-war and region blocking.
 * @property {boolean} [fogAware=false]
 *   When true, unexplored cells (sampled from canvas.visibility.explored)
 *   are treated as impassable.  Requires Phase 2 fog-checker.
 * @property {boolean} [regionAware=false]
 *   When true, nodes inside non-passable regions are blocked.
 *   Nodes inside traveler.changeLevel regions are passable-with-check.
 */

/**
 * Find the shortest wall-avoiding path between two canvas pixel positions.
 *
 * @param {{ x: number, y: number }} origin  Token / start position (pixels)
 * @param {{ x: number, y: number }} dest    Click destination (pixels)
 * @param {AStarOptions} [opts]
 * @returns {{ x: number, y: number }[]}
 *   Array of pixel-space grid-cell centres from origin to dest (inclusive).
 *   Empty array means no path was found within the node budget.
 */
export function findPath(origin, dest, opts = {}) {
  if (!canvas?.grid || !canvas?.walls) return [];

  const maxNodes = opts.maxNodes ?? 2500;

  // Build a composite passability function from all active filters
  const filters = [];
  if (typeof opts.isPassable === "function") filters.push(opts.isPassable);
  if (opts.fogAware)    filters.push(_fogFilter());
  if (opts.regionAware) filters.push(_regionFilter());

  const isPassable = filters.length > 0
    ? (pt) => filters.every((fn) => fn(pt))
    : null;

  const startOff = toOffset(origin);
  const goalOff  = toOffset(dest);
  const goalKey  = offKey(goalOff);
  const goalCenter = toCenter(goalOff);

  // Early out — already at destination
  if (offKey(startOff) === goalKey) return [toCenter(startOff)];

  const heuristic = (off) => {
    const c = toCenter(off);
    return Math.hypot(c.x - goalCenter.x, c.y - goalCenter.y);
  };

  const gScore  = new Map();           // key → accumulated cost
  const cameFrom = new Map();          // key → parent key
  const closed  = new Set();

  const startKey = offKey(startOff);
  gScore.set(startKey, 0);

  const open = new MinHeap();
  open.push({ key: startKey, f: heuristic(startOff), off: startOff });

  let expanded = 0;
  let bestKey = startKey;
  let bestH = heuristic(startOff);

  while (open.size > 0 && expanded < maxNodes) {
    const { key: curKey, off: curOff } = open.pop();

    if (curKey === goalKey) {
      return _reconstructPath(cameFrom, curKey);
    }

    if (closed.has(curKey)) continue;
    closed.add(curKey);
    expanded++;

    // Track the closest node reached so we can return a partial path
    const h = heuristic(curOff);
    if (h < bestH) { bestH = h; bestKey = curKey; }

    const curCenter = toCenter(curOff);
    const neighbors = getNeighborOffsets(curOff);

    for (const nbOff of neighbors) {
      const nbKey = offKey(nbOff);
      if (closed.has(nbKey)) continue;

      const nbCenter = toCenter(nbOff);

      // Wall gate
      if (wallBlocks(curCenter, nbCenter)) continue;

      // Phase 2 passability gate (fog, regions)
      if (isPassable && !isPassable(nbCenter)) continue;

      const edgeCost = Math.hypot(nbCenter.x - curCenter.x, nbCenter.y - curCenter.y);
      const tentativeG = (gScore.get(curKey) ?? Infinity) + edgeCost;

      if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
        cameFrom.set(nbKey, curKey);
        gScore.set(nbKey, tentativeG);
        open.push({ key: nbKey, f: tentativeG + heuristic(nbOff), off: nbOff });
      }
    }
  }

  // Budget exhausted — return partial path to closest expanded node
  if (bestKey !== startKey) return _reconstructPath(cameFrom, bestKey);
  return [];
}

/**
 * Reconstruct the path from start to `currentKey` by following `cameFrom`.
 * @param {Map<string,string>} cameFrom
 * @param {string} currentKey
 * @returns {{ x: number, y: number }[]}
 */
function _reconstructPath(cameFrom, currentKey) {
  const path = [];
  let key = currentKey;
  while (key !== undefined) {
    const [i, j] = key.split(",").map(Number);
    path.unshift(toCenter({ i, j }));
    key = cameFrom.get(key);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Phase 2 passability filter factories
// ---------------------------------------------------------------------------

/**
 * Returns a passability function that blocks unexplored cells.
 * Lazy-imports fog-checker to keep Phase 1 bundle clean.
 * @returns {function({x,y}): boolean}
 */
function _fogFilter() {
  let _isExplored = null;
  return (pt) => {
    if (!_isExplored) {
      try {
        // Dynamic import resolved synchronously on first call —
        // the module is already loaded at this point.
        _isExplored = globalThis.__travelerIsExplored ?? null;
      } catch {}
      if (!_isExplored) return true; // fog module not loaded — allow
    }
    return _isExplored(pt);
  };
}

/**
 * Returns a passability function that blocks cells inside non-passable regions.
 * traveler.changeLevel regions are allowed (check fires at playback time).
 * @returns {function({x,y}): boolean}
 */
function _regionFilter() {
  return (pt) => {
    const regions = canvas.scene?.regions;
    if (!regions?.size) return true;

    for (const region of regions) {
      if (!region.object?.bounds?.contains?.(pt.x, pt.y)) continue;
      // Point is inside this region — check its behaviors
      for (const behavior of (region.behaviors ?? [])) {
        if (!behavior.system) continue;
        if (behavior.type === "traveler.changeLevel") continue; // passable via check
        if (behavior.type === "core.teleportToken") continue;   // passable (destination unknown)
        // Any other behavior type blocks this cell conservatively
        return false;
      }
    }
    return true;
  };
}
