---
name: Player Pathfinding
overview: |
  Add a player-facing route tool that uses A* pathfinding to compute wall-aware
  travel paths from a token's current position to a clicked destination.
  Phase 1 delivers the core tool, A* engine, and GM-approval workflow.
  Phase 2 adds fog-of-war gating with fog-boundary anchors and full region/level
  passability awareness so unexplored areas remain off-limits until vision expands.
todos:
  # ── Phase 1 ────────────────────────────────────────────────────────────────
  - id: p1-s1
    content: "Add playerRouteMode setting (off/immediate/approval) to settings.js"
    status: pending
  - id: p1-s2
    content: "Create scripts/pathfinding/astar.js — grid A* with wall-collision edges"
    status: pending
  - id: p1-s3
    content: "Create scripts/tool-player.js — PlayerRouteTool (click-to-pathfind, preview, submit)"
    status: pending
  - id: p1-s4
    content: "Create scripts/apps/proposal-panel.js — GM proposal queue ApplicationV2"
    status: pending
  - id: p1-s5
    content: "Update scripts/constants.js — add PLAYER_ROUTE_PROPOSE / APPROVE / REJECT socket message types"
    status: pending
  - id: p1-s6
    content: "Update scripts/traveler.js — register setting, player tool, proposal socket handlers"
    status: pending
  - id: p1-s7
    content: "Update scripts/apps/manager.js — add Proposals tab (approval mode only)"
    status: pending
  - id: p1-s8
    content: "Update templates/route-manager.hbs — Proposals tab markup and badge"
    status: pending
  - id: p1-s9
    content: "Update CHANGELOG.md — Phase 1 entry"
    status: pending
  # ── Phase 2 ────────────────────────────────────────────────────────────────
  - id: p2-s1
    content: "Create scripts/pathfinding/fog-checker.js — fog/vision texture sampling helpers"
    status: pending
  - id: p2-s2
    content: "Update scripts/pathfinding/astar.js — add fog-aware node cost (unexplored = impassable)"
    status: pending
  - id: p2-s3
    content: "Update scripts/tool-player.js — fog-boundary anchor storage + 'extend path' UX"
    status: pending
  - id: p2-s4
    content: "Update scripts/pathfinding/astar.js — region passability (traveler.changeLevel passable; others blocking)"
    status: pending
  - id: p2-s5
    content: "Update scripts/traveler.js — sightRefresh hook re-evaluates pending anchors"
    status: pending
  - id: p2-s6
    content: "Update CHANGELOG.md — Phase 2 entry"
    status: pending
isProject: true
---

# Player Pathfinding

## Module Setting — `playerRouteMode`

Added to `scripts/settings.js` as a world-scoped, GM-only `config: true` setting.

| Value | Behaviour |
|---|---|
| `"off"` | GM-only routing; player tool hidden (default) |
| `"immediate"` | Player routes animate the token without approval |
| `"approval"` | Player routes queue for GM review before anything moves |

---

## Phase 1 — Core Tool + A* + Approval Workflow

### New file: `scripts/pathfinding/astar.js`

Grid-based A* that uses Foundry v14 APIs for neighbour generation and collision
testing.  Phase 2 adds fog and region awareness via optional cost modifiers.

```js
/**
 * Finds the shortest wall-avoiding path on the canvas grid.
 *
 * @param {{ x: number, y: number }} origin   Canvas pixel coords (token centre)
 * @param {{ x: number, y: number }} dest     Canvas pixel coords (destination)
 * @param {AStarOptions} [opts]
 * @returns {{ x: number, y: number }[]}      Array of canvas pixel waypoints,
 *                                            empty if no path found.
 */
export function findPath(origin, dest, opts = {}) { … }
```

**Implementation notes**

- Convert pixel coords → grid offset with `canvas.grid.getOffset(point)`.
- Generate neighbours with `canvas.grid.getNeighbors(offset, { distance: 1 })`.
- Edge validity: `canvas.walls.checkCollision(segmentRay, { type: "move" })` — an
  edge is blocked if the ray crosses any `MOVE`-blocking wall.
- Heuristic: Euclidean distance in grid units (`canvas.grid.measurePath`).
- Use a binary min-heap priority queue to keep performance O(n log n).
- Hard cap of 2 500 nodes expanded (configurable) to prevent UI freezes on
  very large scenes; returns a partial path to the last reached node.
- Returns pixel-space waypoints (grid cell centres) ready for `buildRouteFromPoints`.

---

### New file: `scripts/tool-player.js` — `PlayerRouteTool`

Mirrors `IndyRouteTool` but for players.  Single-click pathfind instead of
multi-click free-draw.

**Flow**

```
1. Player activates tool
2. Player clicks destination cell
3. PlayerRouteTool calls findPath(tokenPos, dest)
4. Preview renders in player color (not GM orange)
5. Path shown — invalid if no route found (red dashed)
6. Player clicks Submit (or presses Enter)
   a. immediate mode  → socket.emit PLAYER_ROUTE_IMMEDIATE → renderer plays it
   b. approval mode   → socket.emit PLAYER_ROUTE_PROPOSE   → queued on GM
7. Player can click Cancel to discard
```

**Key APIs**

- `canvas.tokens.controlled[0]` — origin token.
- PIXI overlay uses the same `IndyRouteRenderer` path; just passes a different
  `settings.color` (derived from the token owner's player color).
- Preview is local-only (not broadcast) until submitted.

---

### New file: `scripts/apps/proposal-panel.js` — `TravelerProposalPanel`

`ApplicationV2` shown inside the existing Route Manager when `playerRouteMode`
is `"approval"`.  Only visible to the GM.

**Context shape**

```js
{
  proposals: [
    {
      id,           // uuid
      playerName,   // game.users.get(userId).name
      tokenName,    // tokenDoc.name
      pathLength,   // formatted distance string
      submittedAt,  // formatted time
      path,         // raw path array (for preview highlight on hover)
    }
  ]
}
```

**Actions**

- **Preview** (hover) — briefly renders the proposed path on canvas without
  animating, so the GM can see where the player wants to go.
- **Approve** — emits `PLAYER_ROUTE_APPROVE` with the proposal id; the route
  plays on all clients using the normal renderer.
- **Reject** — emits `PLAYER_ROUTE_REJECT` with an optional reason string;
  player sees a `ui.notifications.warn`.
- **Modify** — opens the proposed path in `IndyRouteEditor` pre-populated with
  the player's waypoints; GM can adjust then approve.

---

### Socket message types (add to `scripts/constants.js`)

```js
export const CHANNEL = "module.traveler";   // existing

// New player-route messages
export const MSG = {
  // existing
  BROADCAST:  "TRAVELER_ROUTE",
  CLEAR:      "TRAVELER_CLEAR",
  // new
  PLAYER_IMMEDIATE: "TRAVELER_PLAYER_IMMEDIATE",
  PLAYER_PROPOSE:   "TRAVELER_PLAYER_PROPOSE",
  PLAYER_APPROVE:   "TRAVELER_PLAYER_APPROVE",
  PLAYER_REJECT:    "TRAVELER_PLAYER_REJECT",
};
```

---

### `scripts/traveler.js` additions

In `Hooks.once("init")`:
- Register `playerRouteMode` setting.

In `Hooks.once("ready")`:
- Register socket handler for `PLAYER_IMMEDIATE` (all clients: play route).
- Register socket handler `PLAYER_PROPOSE` (GM only: add to proposal store).
- Register socket handler `PLAYER_APPROVE` (all clients: play route + remove from store).
- Register socket handler `PLAYER_REJECT` (sender only: warn notification).

In `getSceneControlButtons`:
- Add `playerRoute` tool button only when `playerRouteMode !== "off"` **and**
  the user has at least one controlled token (players) or is GM.

---

### Route Manager (`manager.js` + `route-manager.hbs`) changes

- When `playerRouteMode === "approval"` and the GM is viewing, show a
  **Proposals** tab alongside the existing routes list.
- Tab badge shows pending count.
- Proposals are stored in a module-level `Map` (not persisted to scene flags)
  so they disappear on reload — proposals are ephemeral intent, not saved routes.

---

## Phase 2 — Fog of War + Region Passability

### New file: `scripts/pathfinding/fog-checker.js`

```js
/**
 * Returns true if the canvas pixel coordinate has been explored by the
 * given user's token vision.
 *
 * Uses canvas.visibility.explored (v14) with a pixel-sampling fallback.
 *
 * @param {{ x: number, y: number }} point  Canvas pixel coords
 * @param {User} [user]  Defaults to game.user
 * @returns {boolean}
 */
export function isExplored(point, user) { … }

/**
 * Returns the last explored point along the ray from `origin` toward `dest`,
 * i.e. the fog boundary anchor.
 *
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} dest
 * @returns {{ x: number, y: number }}
 */
export function fogBoundaryAnchor(origin, dest) { … }
```

**Implementation notes**

- Foundry v14: `canvas.visibility.explored` is a `PIXI.RenderTexture`.
  Extract pixel value with a `PIXI.Extract` read at the grid-cell centre.
- Cells where the alpha/red channel is 0 are unexplored (impassable).
- `fogBoundaryAnchor` steps along the ray in grid increments, stopping at the
  last explored cell — this becomes the terminal waypoint of the submitted path.

---

### A* fog integration (`astar.js` update)

Add an optional `fogChecker` callback to `AStarOptions`:

```js
/**
 * @typedef {Object} AStarOptions
 * @property {number}   [maxNodes=2500]
 * @property {function({ x, y }): boolean} [isPassable]  Extra passability filter.
 *           Called for each candidate neighbour; return false to block the node.
 */
```

`PlayerRouteTool` passes `isExplored` as the `isPassable` filter so the A*
engine is fog-agnostic but the player tool opts in.

---

### Fog-boundary anchor UX (`tool-player.js` update)

```
Explored area         │  Unexplored area
──────────────────────┼────────── ···
[Token] ──────────────[Anchor ●] ···── [Destination (blocked)]
                      ↑
              Stored as this.fogAnchor
              Rendered as a pulsing ring
```

- When A* terminates at the fog boundary (destination unreachable), the last
  reached node is stored as `this.fogAnchor`.
- The anchor is rendered as a pulsing PIXI circle in player color.
- `Hooks.on("sightRefresh", …)` calls `attemptAnchorExtension()`:
  - Re-runs A* from the anchor toward the original destination.
  - If destination is now reachable: auto-extends the path and re-renders.
  - If still unreachable: re-stores the new (expanded) anchor position.
- Player can also manually click the anchor to draw a new leg from that point,
  chaining segments: `path = [...pathSoFar, ...newLeg]`.

---

### Region passability (`astar.js` update)

During neighbour evaluation, check `canvas.scene.regions`:

```js
function regionPassability(point) {
  for (const region of canvas.scene.regions) {
    if (!region.object.bounds.contains(point.x, point.y)) continue;
    for (const behavior of region.behaviors) {
      if (behavior.type === "traveler.changeLevel") {
        // Passable — level check fires at playback time via the behavior
        return "passable-with-check";
      }
      if (behavior.type === "core.teleportToken") {
        // Treat teleporters as passable; destination is unknown at plan time
        return "passable";
      }
      // Unknown blocking behavior — treat conservatively as impassable
      // (Can be overridden by a future allowlist setting)
      return "impassable";
    }
  }
  return "passable";
}
```

- Nodes inside `impassable` regions get cost = `Infinity` in the A* open set.
- `traveler.changeLevel` nodes are stored in `path.levelTransitions` for the
  renderer to display the existing level-badge style marker.

---

## Key Implementation Notes

### Performance
- A* is synchronous.  On a 100×100 grid with the 2 500-node cap, worst case is
  ~2 ms in V8.  Increase cap only if maps grow beyond ~150×150 cells.
- Fog pixel sampling is done once per cell per pathfind, not per frame.

### Player color
- `game.user.color` (Foundry's built-in player color) is used for the preview
  path and submitted route animation, distinguishing it visually from GM routes.

### Permissions
- Players can only submit routes for tokens they **own** (`tokenDoc.isOwner`).
- The `PLAYER_IMMEDIATE` socket handler on the server validates ownership before
  broadcasting to all clients.

### Scene changes
- Pending proposals are cleared when the active scene changes
  (`Hooks.on("canvasReady", …)`).
- Fog anchors are also cleared on scene change.

### Compatibility
- Fog sampling degrades gracefully: if `canvas.visibility.explored` is not a
  `RenderTexture` (future Foundry change), `isExplored` returns `true` (treats
  all cells as explored) and emits a one-time `console.warn`.
- A* wall-check degrades gracefully: if `canvas.walls.checkCollision` is
  unavailable, returns the straight-line path with a warning.
