# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Fork note:** v1.x history originates from the upstream `indy-route` module by PinguTwo.  
> This fork (`traveler`) diverges at commit `7f32132` (v1.2.2) and continues as a standalone module targeting Foundry VTT v14.

---

## [Unreleased] — targeting v2.0.0

### Commits
- `e0662db` — 2026-06-13 — Add architecture.md documentation
- `c3df688` — 2026-06-13 — Uplift to Foundry v14; fork renamed from `indy-route` to `traveler`
- `5bd191a` — 2026-06-13 — Add v14 Scene Levels support (per-point elevation, level picker, token elevation during playback)

### Added
- `architecture.md` — full module documentation including Mermaid class, sequence, and data-flow diagrams.

### Added (v14 Scene Levels — breaks v13 compatibility)
- **Per-point elevation capture** — each waypoint now records the `elevation.bottom` of `canvas.level` at click time. Routes drawn on multi-level scenes automatically carry elevation data across level transitions.
- **Arc-length elevation interpolation** — `buildElevationsForPath()` in `routes.js` produces a per-path-point elevation array by interpolating between waypoints in arc-length space, so smooth/resampled paths get accurate elevation values even after Catmull-Rom or Chaikin processing.
- **Token elevation during playback** — `renderer.js` now passes the interpolated elevation to every `TokenDocument.update()` call (snap-to-start, per-frame throttled update, and final position), keeping a token's `elevation` property in sync with the route as it animates.
- **Level picker in Route Editor** — the General tab in the route editor now shows a "Scene Level" `<select>` populated from `canvas.scene.levels` when the scene has levels defined. Saving the editor resolves `defaultElevation` from the chosen level's `elevation.bottom`.
- **Level badge in Route Manager** — each route row shows a small `<i class="fa-layer-group"> Level name</i>` badge when the route has an associated Scene Level, resolved via `levelId` or `defaultElevation`.
- **`levelId` and `defaultElevation` fields** — added to `DEFAULTS` and `normalizeSettings()` in `settings.js`; flow transparently through all existing serialization / deserialization paths including export/import.
- **Elevation preserved on import and point-edit** — `_importRoutes` and `_editRoutePoints` in `manager.js` now forward the `elevation` property on each point so multi-level route data round-trips cleanly.
- **Graceful single-level fallback** — `getCanvasPos()` in `tool.js` and `buildElevationsForPath()` both return `0` / `null` when `canvas.level` is absent, leaving single-level scenes completely unaffected.

### Changed (Foundry v14 API uplift)
- **`getSceneControlButtons` hook** — toolbar button callbacks changed from `onClick` to `onChange`; added required `order` property to both toolbar tools.
- **`ApplicationV2.render`** — all `render(true)` calls updated to `render({ force: true })` to match the v14 options-object signature.
- **`ImageHelper`** — upload path migrated from `foundry.utils.ImageHelper.uploadBase64(base64, { folder, filename })` to `foundry.helpers.media.ImageHelper.uploadBase64(base64, fileName, filePath)` with fallback to the v13 path.
- **`loadTexture`** — global `loadTexture` removed in v14; all calls now use `foundry.canvas.loadTexture` directly.
- **`saveDataToFile`** — global removed in v14; updated to `foundry.utils.saveDataToFile`.
- **Fog of war refresh** — added `canvas?.visibility?.refresh?.()` alongside `canvas?.sight?.refresh?.()` for cross-version compatibility (`canvas.sight` renamed to `canvas.visibility` in v14).
- **`module.json`** — `compatibility.verified` bumped from `13` to `14`; minimum remains `13`.

### Changed (fork rename: `indy-route` → `traveler`)
- Module `id` changed to `"traveler"` in `module.json`.
- `MODULE_ID` in `settings.js` updated to `"traveler"`.
- Entry point renamed from `scripts/indy-route.js` to `scripts/traveler.js`; `module.json` `esmodules` updated accordingly.
- Socket message types renamed: `INDY_ROUTE` → `TRAVELER_ROUTE`, `INDY_CLEAR_ROUTE` → `TRAVELER_CLEAR_ROUTE`, `INDY_CLEAR` → `TRAVELER_CLEAR`.
- Toolbar tool keys renamed: `indyRouteStart` → `travelerStart`, `indyRouteClear` → `travelerClear`.
- ApplicationV2 `id` and `classes` renamed across all apps (`indy-route-*` → `traveler-*`).
- Window titles updated to `"Traveler …"`.
- Global PIXI state key renamed: `window.__indyRouteBroadcast` → `window.__travelerBroadcast`.
- PIXI container property keys renamed: `indyRouteTokenSprite/State` → `travelerTokenSprite/State`; `indyRouteLabelSprite/LastArgs/InFlight/Pending/UpdateToken` → `travelerLabel*`.
- Tile export folder and filenames: `"indy-route"` / `indy-route-*.png` → `"traveler"` / `traveler-*.png`.
- SVG path IDs: `indy-route-label-*` → `traveler-label-*`.
- Debug flag: `window.INDY_ROUTE_DEBUG` → `window.TRAVELER_DEBUG`.
- CSS classes in all `.hbs` templates: `.indy-route-*` → `.traveler-*`.
- VS Code deploy task updated: `modules\indy-route` → `modules\traveler`.

---

## [v1.2.2] — 2026-01-18 — `7f32132`

### Added
- Public JavaScript API exposed at `game.modules.get("indy-route").api`:
  - `drawRoute(options)` — draw and animate a route immediately.
  - `createRoute(options)` — save a route without playback.
  - `playRoute(routeId, options)` — play a saved route by ID.
  - `drawRouteToTile(routeIdOrOptions, options?)` — persist a route as a scene tile.
  - `clearRoute(routeId)` — clear a single route for all clients.
  - `clearAllRoutes()` — clear all routes for all clients.
  - `listRoutes(sceneId?)` — list saved routes for a scene.
  - `getRouteByName(name, sceneId?)` — look up a route by name.
  - `help()` — return API documentation object.
- Drag-to-reorder routes in the Route Manager list.
- Enhanced label rendering clarity improvements.

---

## [v1.2.1] — 2026-01-17 — `bfba3f3`

### Added
- Label fade-in effect that reveals the route label as the animation draw reaches it.

---

## [v1.2.0] — 2026-01-17 — `59c7eba`

### Added
- Route labeling features: path-following labels via SVG `<textPath>`, font selection, arrow markers, configurable position, size, and color.
- Label settings tab in the route style editor.
- **Persist to Tile** — render a route as a PNG and create a locked Tile on the scene for a permanent map overlay.

---

## [v1.1.0] — 2026-01-15 — `83fab04`

### Added
- Travel mode tooltips on route list items showing distance, travel time, and fare cost.
- Travel Modes configuration app — CRUD editor for travel speeds (mph, miles/day) and tiered fares (first/standard/steerage).
- Currency Conversions configuration app — override denomination conversion rates used in cost breakdowns.
- `ignoreCurrencies` world setting — comma-separated list of currency keys to omit from cost displays.
- Route length tooltip in the Route Manager (pixels → scene units).

---

## [v1.0.0] — 2026-01-14 — `4eb0b3e`

### Added
- Interactive route drawing tool: click waypoints on the canvas, double-click or Enter to finish, Backspace to undo last point, Escape to cancel.
- Animated route playback: dashed line draws progressively, moving dot or token sprite follows the path.
- Cinematic camera mode: animates pan and zoom to follow the route during playback.
- Route smoothing: Catmull-Rom (default) and Chaikin algorithms with configurable parameters; raw point mode available.
- Per-route settings: line color, width, alpha, dash pattern, dot color/radius, token UUID override, draw speed, linger time.
- Map scaling: all visual sizes scale proportionally with the scene dimensions.
- Route Manager UI (ApplicationV2): list, play, preview, edit points, edit style, clear, delete routes per scene.
- Route persistence: routes stored as scene flags (`scene.setFlag("indy-route", "routes", [...])`).
- Multiplayer sync via Foundry socket: `INDY_ROUTE`, `INDY_CLEAR_ROUTE`, `INDY_CLEAR` message types broadcast animations to all clients.
- Sound playback during route animation (file path or document UUID).
- Token follow mode: moves an actual scene Token along the route path during playback.
- Preview mode: GM-only local playback with optional fog-of-war and token position restore prompt.
- Import / export routes as JSON.
- GitHub Actions CI release workflow: tags trigger token replacement in `module.json` and zip packaging.
