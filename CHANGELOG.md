# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Fork note:** v1.x history originates from the upstream `indy-route` module by PinguTwo.  
> This fork (`traveler`) diverges at commit `7f32132` (v1.2.2) and continues as a standalone module targeting Foundry VTT v14.

---

## [Unreleased] — targeting v2.0.0

### Commits
- *(pending)* — 2026-06-14 — Fix GM route draw tool: canvas clicks and preview on Foundry v14
- `b4284fc` — 2026-06-13 — Add Party System (party tokens, multi-user checks, party config UI)
- `e0662db` — 2026-06-13 — Add architecture.md documentation
- `c3df688` — 2026-06-13 — Uplift to Foundry v14; fork renamed from `indy-route` to `traveler`
- `5bd191a` — 2026-06-13 — Add v14 Scene Levels support (per-point elevation, level picker, token elevation during playback)
- `f083f4f` — 2026-06-13 — Add `traveler.changeLevel` Region Behavior with roll-check dialog
- `3e7e174` — 2026-06-13 — Add player pathfinding with A*, fog-of-war gating, and GM approval workflow
- `97ca978` — 2026-06-13 — Add Vitest unit tests, Quench integration tests, Docker CI, and GitHub Actions workflow
- *(pending)* — 2026-06-13 — Fix `applyColorNumbers` for hex strings without leading `#`; add `.gitignore` and `.vscode/settings.json`
- `55e7ca5` — 2026-06-13 — Add Encounter System (encounter zones on routes, GM confirmation dialog, Rollable Table integration)
- `15b545e` — 2026-06-13 — Fix `checkZones` boundary condition for zones placed at t=0.0
- `3cc96d8` — 2026-06-13 — Add world clock advance, player speed dialog, encounter speed scaling, per-scene distance override
- `b949842` — 2026-06-13 — Update CHANGELOG with travel-time features
- `1349ee7` — 2026-06-13 — Add Docker inspect mode, world:clean script, .env.example, named Foundry data volume
- `b24889e` — 2026-06-13 — Rewrite README.md for Traveler; add DEVELOPER-README.md
- `91264e9` — 2026-06-13 — Fix encounter pause: broadcast ENCOUNTER_PAUSE/RESUME to all clients
- `157af25` — 2026-06-13 — Move compose file to docker/, overhaul .gitignore, update CI and npm scripts
- `b4284fc` — 2026-06-13 — Add Party System (party tokens, multi-user checks, party config UI)

### Fixed — GM Route Draw Tool (Foundry v14)

**Bug:** After clicking **Draw New Route** in the Route Manager, left-clicks on the canvas placed no
visible waypoints and gave no rubber-band preview. GMs could not tell whether clicks were registering.

**Root cause:** The draw tool listened for `pointerdown` on `canvas.stage`, which Foundry v14 often
does not deliver when layer hit-testing consumes the event. Preview graphics were also placed on
`canvas.primary`, where they could sit under tiles on hex maps. A follow-up attempt to force the
Drawing scene-control layer could leave the toolbar layout in a broken state.

**Fix:**
- **`scripts/tool.js`**: Bind pointer handlers on `canvas.app.view` and map coordinates via
  `canvas.canvasCoordinatesFromClient`. Render the in-progress preview on `canvas.foreground`
  (above tiles). Draw red waypoint dots on each click plus a rubber-band line to the cursor.
  Removed programmatic scene-control activation that could scramble the Foundry UI.

### Added — Party System

When an overland map uses a single **party token** (one token representing the whole group),
the module now dispatches individual roll-check dialogs to each party member and collects results
via a GM collector dialog.

**New files:**
- `scripts/party.js` — Party data model, CRUD helpers, `PartyCheckSession` store, and
  `resolvePartyCheck` pure logic (4 resolution modes).
- `scripts/apps/party-config.js` — `PartyConfigApp` (ApplicationV2) for managing party groups.
- `scripts/apps/party-check-collector.js` — `PartyCheckCollector` (ApplicationV2) shown to the GM
  while waiting for member rolls; live-updates as each result arrives; has a Force Resolve button.
- `templates/party-config.hbs` — Party list + inline editor with drag-drop actor assignment.
- `templates/party-check-collector.hbs` — Roll progress table with pass/fail indicators.
- `docs/party.plan.md` — Design plan.
- `tests/unit/party.test.js` — 39 unit tests covering all helpers and resolution modes.
- `tests/quench/party.quench.js` — Integration test suite (CRUD, socket round-trip, UI open/close).

**Modified files:**
- `scripts/constants.js` — Added `MSG.PARTY_CHECK_REQUEST`, `MSG.PARTY_CHECK_RESULT`,
  `MSG.PARTY_CHECK_RESOLVED`.
- `scripts/behaviors/change-level.js` — `_handleMoveIn` now calls `getPartyForToken`; if the
  token is a party token the new `_handlePartyMoveIn` method orchestrates the full multi-user
  socket protocol including chat summary.
- `scripts/behaviors/level-check-dialog.js` — New `partySessionId` / `partyActorId` constructor
  options; when set, `_submitResult` emits a `PARTY_CHECK_RESULT` socket message instead of only
  resolving a local promise.
- `scripts/traveler.js` — Registers the `parties` world setting and `Configure Parties` menu;
  loads new templates; adds `PARTY_CHECK_REQUEST` and `PARTY_CHECK_RESULT` socket handlers.
- `scripts/tool-player.js` — `start()` now falls back to the party token when the current user
  has no owned token but is a member of the party assigned to a token on the scene.

**Party data model:**
```
id, name, partyTokenActorId, memberActorIds[], resolutionMode, designatedActorId, travelPaceMode
```

**Resolution modes:** `all` | `best` (default) | `majority` | `designated`

**Travel pace modes:** `slowest` | `average` | `fastest`

### Changed — CI Bootstrap & Test Coverage

- **`docker/patches/10-install-quench.sh`**: Container patch (Felddy `CONTAINER_PATCHES`) that
  downloads Quench v0.10.0 into `/data/modules/quench` on every fresh CI volume.
- **`docker/compose.test.yml`**: Mounts patch directory; sets `FOUNDRY_TELEMETRY=false`,
  `FOUNDRY_PROTOCOL=4`, and `CONTAINER_PATCHES=/data/container_patches`.
- **`scripts/ci-bootstrap.js`**: Playwright bootstrap — verifies Quench, installs **dnd5e** via
  Setup API/UI, confirms traveler + quench are active in the CI world.
- **`scripts/foundry-playwright.js`**: Shared Playwright helpers (`gotoWithRetry`, setup auth,
  `joinWorldAsGM`) used by bootstrap and Quench runner.
- **`scripts/foundry-wait.js`**: Now waits for both `/api/status` and root HTTP reachability;
  default timeout raised to 300 s.
- **`scripts/run-quench.js`**: Uses shared helpers instead of navigating directly to `/game`.
- **`package.json`**: Added `foundry:bootstrap` npm script.
- **`.github/workflows/ci.yml`**: Runs bootstrap after `foundry:wait`; dumps Docker logs on failure.
- **`vitest.config.js`**: Coverage scoped to unit-testable modules; thresholds remain 70 %.
- **Unit tests**: Expanded coverage for smoothing, routes, fog-checker, level-check-dialog,
  party-check-collector, settings, clock, encounters, change-level, party, and player-speed.
- **`tests/quench/party.quench.js`**: Fixed invalid `await import()` in non-async socket test.

### Changed — Repository Housekeeping (pre-push)

- **`docker-compose.test.yml` → `docker/compose.test.yml`**: Docker Compose file moved to a
  dedicated `docker/` subdirectory to keep the project root clean. All volume bind-mount paths
  inside the file updated from `./` to `../` (relative to new location). Git detected as a rename
  — history is preserved.
- **`package.json`**: `foundry:up`, `foundry:down`, `foundry:down:clean` npm scripts updated to
  reference `docker/compose.test.yml`. Also switched from legacy `docker-compose` (v1 standalone,
  deprecated) to `docker compose` (v2 plugin built into Docker CLI).
- **`.github/workflows/ci.yml`**: Both `docker compose` invocations updated to use
  `docker/compose.test.yml`.
- **`.gitignore`**: Overhauled:
  - `tests/world/` four separate patterns replaced with `tests/world/**` + `!tests/world/world.json`
    negation (simpler, catches any new Foundry-generated files automatically).
  - `.env` replaced with `.env*` + `!.env.example` (catches `.env.local`, `.env.production`, etc.).
  - Added `playwright-report/`, `test-results/`, `*.log`, `npm-debug.log*`.
- **`DEVELOPER-README.md`**: Updated all references from `docker-compose.test.yml` to
  `docker/compose.test.yml`.

### Fixed — Encounter Pause Synchronisation (all clients)

**Bug:** When an encounter zone fired during route playback, only the GM's animation paused while
the EncounterDialog was open. Player clients continued uninterrupted and could reach the route
destination before the GM resolved the encounter.

**Root cause:** `handleZoneFired` called `IndyRouteRenderer.pauseRoute()` / `resumeRoute()`
directly on the local renderer only. The `ENCOUNTER_PAUSE` and `ENCOUNTER_RESUME` socket message
types existed in `constants.js` but were never emitted or handled.

**Fix:**
- **`scripts/encounters.js`**: Added two exported helpers, `broadcastEncounterPause(routeId)` and
  `broadcastEncounterResume(routeId)`, each of which calls `game.socket.emit(CHANNEL, …)`. The
  `handleZoneFired` function now calls these immediately after the local pause/resume calls so all
  connected clients freeze and resume together.
- **`scripts/traveler.js`**: Added socket handlers for `MSG.ENCOUNTER_PAUSE` and
  `MSG.ENCOUNTER_RESUME` — each calls `IndyRouteRenderer.pauseRoute` / `resumeRoute` on the
  receiving client.
- **`tests/unit/encounters.test.js`**: Imported `broadcastEncounterPause` /
  `broadcastEncounterResume`; added four new unit tests verifying the correct socket channel,
  message type, and payload `routeId` for each helper.
- **`tests/quench/encounters.quench.js`**: Added a new describe block
  `broadcastEncounterPause / broadcastEncounterResume — socket wiring` with three integration
  tests: socket emit verification for both helpers and a live renderer pause/resume state check.
- **`DEVELOPER-README.md`**: Updated the *Encounter Zone Resolution* Mermaid sequence diagram to
  include the `Socket` and `Player Clients` participants; updated the *Encounter animation pause*
  design decision; updated the socket message table (removed `*(reserved)*` from both entries).
- **`README.md`**: Updated the GM Guide encounter dialog description and the Notes section to
  accurately describe the all-clients pause behaviour.

### Added — Documentation Overhaul

- **`README.md`**: Completely rewritten. Title changed from *Indy Route* to *Traveler*. Attribution
  link to the original [jwrpalmer99/indy-route](https://github.com/jwrpalmer99/indy-route)
  repository added. Foundry v14 badge replaces old v13 badge. Full Table of Contents added.
  New major sections: **GM Guide** (installation, recommended setup order, full module settings
  reference table, scene configuration, all UI controls described button-by-button, encounter zone
  editor, world clock, export/import, API reference) and **Player Guide** (player route tool
  step-by-step, travel speed selection, fog-of-war constraints, GM approval workflow).
- **`DEVELOPER-README.md`** *(new)*: Developer-focused documentation covering repository
  structure, architecture overview with ASCII diagrams, key design decisions (system-agnostic
  design, socket sync model, ESM-only, `globalThis` circular import avoidance, encounter pause
  model, scene distance override), module lifecycle hooks, full data model (route record,
  RouteSettings, EncounterZone, PlayerRouteProposal), socket message table, unit and integration
  test runbooks, local CI setup steps, remote CI (GitHub Actions) configuration with required
  secrets, and changelog convention.

### Added — Docker Inspect Mode & CI Ergonomics

- **`docker-compose.test.yml`**: Added a named `foundry-data` volume so Foundry config, users, and module installs (Quench) persist across container restarts — no more re-activation on every `docker-compose up`. Header comment rewritten with full usage guide.
- **`TRAVELER_KEEP_WORLD=true`**: New env flag for `npm run test:inspect`. When set, Quench test `after()` teardown hooks are skipped so all created scenes, actors, notes, and tokens remain in the world. The Foundry instance stays running at `http://localhost:30000` for manual inspection.
- **`scripts/run-quench.js`**: Reads `TRAVELER_KEEP_WORLD` and injects it as `window.TRAVELER_KEEP_WORLD` into the Foundry page before tests run. Prints an inspection guide to stdout when inspect mode is active.
- **`tests/quench/fixtures.js`**: `teardown()` checks `globalThis.TRAVELER_KEEP_WORLD` and skips deletion (with a console log) when inspect mode is on.
- **`scripts/world-clean.js`**: New script (`npm run world:clean`) removes all Foundry-generated database files from `tests/world/` while preserving `world.json`. Run this after an inspect session to reset the world to a clean state.
- **`.env.example`**: Template for local credentials used by docker-compose — copy to `.env` (git-ignored).
- **`.gitignore`**: Added `.env`, `tests/world/data/`, `tests/world/packs/`, `tests/world/*.db`, `tests/world/*.db.lock`.
- **`package.json`**: New npm scripts: `test:inspect`, `foundry:up`, `foundry:down`, `foundry:down:clean`, `world:clean`. Added `cross-env` dev dependency for Windows-compatible env var passing.

### Added — World Clock, Player Speed & Scene Distance

- **`scripts/clock.js`**: `computeTravelSeconds(totalPx, gridSizePx, distancePerSquare, speedMph)` — pure math; `formatTravelDuration(seconds)` — human-readable label; `advanceClock(totalPx, modeId)` — calls `game.time.advance()` on route finish (GM only, respects `worldClockEnabled` setting). Simple Calendar and Seasons & Stars respond automatically.
- **`scripts/settings.js`**: `DEFAULT_TRAVEL_MODES` gains `encounterMult` per mode (0.4–1.6). New helpers: `getSceneDistanceConfig(scene)` — returns effective distance/square (flag override or Foundry native); `getTravelModeById(id)`.
- **`scripts/traveler.js`**: Two new module settings: `worldClockEnabled` (Boolean, default `false`) and `playerSpeedPrompt` (Boolean, default `true`). Clock helper exposed on `globalThis.__travelerClock`. Pre-loads `player-speed-dialog.hbs` and `scene-settings.hbs` templates.
- **`scripts/renderer.js`**: `finish()` callback calls `advanceClock(totalLen, travelModeId)` on the GM client.
- **`scripts/apps/player-speed-dialog.js`**: `PlayerSpeedDialog` — awaitable `ApplicationV2` modal showing the travel mode list as radio buttons before a player submits a route proposal. Returns the selected mode id or `null` on cancel. Also exports `scaleDrawSpeed(baseDraw, speedMph, baseRef)` for adjusting animation speed proportionally.
- **`templates/player-speed-dialog.hbs`**: Compact speed-picker dialog.
- **`scripts/tool-player.js`**: Shows `PlayerSpeedDialog` when `playerSpeedPrompt` is enabled. Selected mode is stored as `proposal.travelModeId` / `proposal.travelModeLabel`. `drawSpeed` is scaled by the selected mode vs Walking Normal (3 mph). Speed label visible to GM in the approval panel.
- **`templates/route-manager.hbs`**: Proposal rows now show the player's selected speed. "Scene Scale" toolbar button (map icon) opens the scene distance dialog.
- **`scripts/apps/scene-settings.js`**: `SceneSettingsDialog` — GM dialog to set `distancePerSquare` and `units` as a scene flag override, independent of Foundry's combat grid distance. Accessible from the Route Manager toolbar.
- **`templates/scene-settings.hbs`**: Scene distance override form.
- **`scripts/apps/manager.js`**: `_getRouteLengthLabel` now reads `getSceneDistanceConfig()` so distance labels honour the scene override. `_openSceneSettings()` wired to the toolbar button.
- **`scripts/encounters.js`**: `handleZoneFired` accepts `travelModeId`; effective encounter chance = `zone.chance × mode.encounterMult` (clamped 0–1).
- **`scripts/renderer.js`**: Passes `payload.travelModeId` to `handleZoneFired`.
- **`tests/unit/clock.test.js`**: 22 unit tests for `computeTravelSeconds` and `formatTravelDuration`.
- **`tests/unit/player-speed.test.js`**: 20 unit tests for `scaleDrawSpeed`, `encounterMult` coverage, `getTravelModeById`, and encounter chance scaling math.
- **`tests/quench/clock.quench.js`** + **`index.js`**: Integration tests for `advanceClock` (disabled/enabled), `getSceneDistanceConfig` with/without flag override.

### Added — Encounter System
- **`scripts/encounters.js`**: `EncounterManager` — `createEncounterZone`, `checkZones`, `resetZoneTriggers`, `rollTable`, `buildFixedResult`, `importActor`, `spawnToken`, `createNote`, `createChatMessage`, `resolveEncounter`, `handleZoneFired`.
- **`scripts/apps/encounter-dialog.js`**: `EncounterDialog` — awaitable `ApplicationV2`. Accept (resolve encounter), Regenerate (re-roll in-place), Decline (skip). Resolves `"accept"` or `"decline"`.
- **`templates/encounter-dialog.hbs`** / **`templates/encounter-editor.hbs`**: GM dialog and route-editor Encounters tab templates.
- **`scripts/renderer.js`**: `entry.encounterPaused` flag; `pauseRoute` / `resumeRoute`; encounter zone check in `onTick` (GM-only, non-reentrant).
- **`scripts/routes.js`**: `createRouteRecord` initialises `encounters: []`.
- **`scripts/constants.js`**: `MSG.ENCOUNTER_PAUSE`, `MSG.ENCOUNTER_RESUME`.
- **`scripts/apps/settings-app.js`**: "Encounters" tab with zone CRUD (add/edit/delete explicit, auto-interval, and fixed types).
- **`templates/settings.hbs`**: "⚔ Encounters" tab button and panel.
- **`scripts/apps/manager.js`** / **`templates/route-manager.hbs`**: Orange `⚔ N` badge on routes with encounter zones.
- **`scripts/traveler.js`**: Pre-loads encounter templates; exposes helpers on `globalThis.__travelerEncounters`; resets triggers on each `playRoute`.
- **`tests/unit/encounters.test.js`**: 28 unit tests (zone firing, auto-interval math, trigger reset, fixed result builder).
- **`tests/quench/encounters.quench.js`** + **`index.js`**: Integration tests for live zone checks, note creation, chat post, and `EncounterDialog` lifecycle.

### Fixed
- **`scripts/settings.js`** — `applyColorNumbers` and `getSettings` now correctly parse hex colour strings that lack a leading `#` (e.g. `"ff6400"`). Extracted shared `_hexToNum` helper to remove duplicated parsing logic.

### Added — Testing Infrastructure
- **`package.json`**: Dev dependencies for Vitest 1.x, Playwright 1.x, and `@vitest/coverage-v8`. Five npm scripts: `test`, `test:watch`, `coverage`, `test:integration`, `foundry:wait`.
- **`vitest.config.js`**: Node environment, `tests/setup.js` for global stubs, V8 coverage with 70 % line/function thresholds.
- **`tests/setup.js`**: Comprehensive Foundry VTT global mocks (`canvas`, `game`, `CONST`, `foundry`, `Hooks`, `ui`, `Roll`, `PIXI`, etc.) using `vi.stubGlobal` — no browser required for unit tests.
- **`tests/unit/astar.test.js`**: 10 unit tests covering open-grid paths, wall avoidance, node-budget enforcement, custom `isPassable` filters, and edge cases (same cell, adjacent cell, null grid).
- **`tests/unit/proposals.test.js`**: 10 unit tests for `ProposalStore` (add, get, remove, getAll, clear, duplicate-id overwrite, snapshot immutability).
- **`tests/unit/change-level.test.js`**: 18 unit tests for `TravelerChangeLevelBehavior` helpers (`_checkPrerequisites` — status/item/combined requirements, invalid regex; `_resolveTargetElevation` — explicit, levelId, fallback null).
- **`tests/unit/settings.test.js`**: 16 unit tests for `normalizeSettings`, `applyColorNumbers`, `applyMapScaling`, `PLAYER_ROUTE_MODE`, and `getPlayerRouteMode`.
- **`tests/quench/fixtures.js`**: `SceneFixture.build()` programmatically creates a 1000×1000 scene with a gapped vertical wall, a stairs region, a cliff/check region, and a test token. `teardown()` deletes the scene. `WallFixture.createHorizontal()` for ad-hoc walls.
- **`tests/quench/pathfinding.quench.js`**: Integration tests for A* on the real `canvas` (open grid, wall avoidance via gap, fully-walled destination, node-budget timing).
- **`tests/quench/region-behavior.quench.js`**: Integration tests for `traveler.changeLevel` behaviors (prerequisite blocking, prerequisite pass, `_applyElevation` updating `TokenDocument.elevation`).
- **`tests/quench/player-route.quench.js`**: Integration tests for the player-route workflow (ProposalStore round-trip with real UUIDs, MSG constant uniqueness, `IndyRouteRenderer.render` smoke test, proposal approve/reject cycle).
- **`tests/quench/index.js`**: Registers all three Quench batches via `Hooks.once("quenchReady", ...)` and exports `registerAllSuites` for dynamic import.
- **`tests/world/world.json`**: Minimal Foundry world manifest for the CI Docker container (`traveler-ci`, dnd5e system, `traveler` + `quench` modules). No scene data committed.
- **`docker-compose.test.yml`**: Spins up `felddy/foundryvtt:14`, mounts module source and test world, exposes port 30000, health-checks `/api/status`.
- **`scripts/foundry-wait.js`**: Polls `/api/status` every 5 s until Foundry is ready or times out (configurable via `FOUNDRY_WAIT_TIMEOUT`).
- **`scripts/run-quench.js`**: Playwright headless driver — navigates to Foundry, joins as GM, calls `quench.runAll()`, collects pass/fail stats, exits 0 or 1 for CI.
- **`.github/workflows/ci.yml`**: Two-job Actions workflow: `unit-tests` (Vitest + coverage artifact) and `integration-tests` (Docker + Playwright + Quench). Integration job skipped on fork PRs where secrets are unavailable.
- **`docs/testing.plan.md`**: Plan document describing the full testing architecture, Vitest rationale, Quench overview, Docker setup, and CI environment guidance (GitHub Actions vs CircleCI).

### Added
- `architecture.md` — full module documentation including Mermaid class, sequence, and data-flow diagrams.

### Added (Player Pathfinding — Phase 1 + 2)
- **`playerRouteMode` setting** — world-scope GM setting: `off` (default), `immediate` (player routes play without approval), `approval` (GM queue).
- **`PlayerRouteTool`** (`scripts/tool-player.js`) — player-facing canvas tool activated via toolbar button (visible when `playerRouteMode ≠ off`). Player selects their token, clicks a destination, A* computes the route, preview renders in the player's color; Enter submits, Esc cancels.
- **A* pathfinder** (`scripts/pathfinding/astar.js`) — grid-aware shortest-path engine using `canvas.grid.getNeighbors`, `canvas.walls.checkCollision`, and a binary min-heap. 2 500-node budget prevents browser freeze; returns a partial path to the closest expanded node if the budget is hit.
- **Fog-of-war gating** (`scripts/pathfinding/fog-checker.js`) — samples `canvas.visibility.explored` (a PIXI.RenderTexture) to block unexplored cells in pathfinding. Degrades gracefully when the texture is unavailable.
- **Fog-boundary anchor** — when A* terminates at the fog edge, a pulsing ring is drawn at the last reachable node. The `sightRefresh` Foundry hook automatically re-runs pathfinding when vision expands. Clicking near the anchor starts a new path leg from that point.
- **Region passability** — during pathfinding, cells inside regions are evaluated: `traveler.changeLevel` regions are passable (the check fires at playback time); `core.teleportToken` is passable; any other behavior type blocks the cell.
- **GM approval workflow** (`scripts/proposals.js`, `ProposalStore`) — ephemeral in-memory queue of `PlayerRouteProposal` objects. On submit in approval mode, a socket message (`TRAVELER_PLAYER_PROPOSE`) delivers the proposal to the GM. The Route Manager shows a **Player Proposals** section with Preview (4 s preview animation), Approve (plays route for all clients), and Reject (optional reason, notifies player) buttons.
- **Proposal socket messages** added to `constants.js`: `TRAVELER_PLAYER_IMMEDIATE`, `TRAVELER_PLAYER_PROPOSE`, `TRAVELER_PLAYER_APPROVE`, `TRAVELER_PLAYER_REJECT`.
- **Plan document** saved to `docs/player-pathfinding.plan.md`.

### Added (Region Behavior — `traveler.changeLevel`)
- **`TravelerChangeLevelBehavior`** (`scripts/behaviors/change-level.js`) — custom `RegionBehaviorType` registered as `traveler.changeLevel`.  GMs configure it via the standard Foundry RegionConfig panel.  Fields: `mode`, `targetLevelId`, `targetElevation`, `requiredStatusEffect`, `requiredItemPattern`, `requiresCheck`, `checkLabel`, `checkFormula`, `checkDC`, `failureDamage`, `allowRetry`.
- **Five traversal modes** — `stairs` (automatic), `ladder` (interact), `cliff` (check required), `drop` (fall), `fly-only`.
- **Prerequisite gate** — status-effect check (`actor.statuses.has`) and item-name regex (`actor.items`) evaluated before any roll; blocks movement with a `ui.notifications.warn` on failure.
- **Roll-check dialog** (`scripts/behaviors/level-check-dialog.js`, `templates/level-check-dialog.hbs`) — awaitable `ApplicationV2` with "Attempt" (evaluates Roll formula, posts to chat) and "Give Up" (cancels movement) buttons.
- **Retry loop** — when `allowRetry` is true and the roll fails, a `DialogV2.confirm` prompt lets the player try again; movement stays paused at the boundary until pass, cancel, or final failure.
- **Failure damage** — if `failureDamage` is set, a damage roll is evaluated and posted to chat; applied via `actor.applyDamage(total)` (dnd5e), or a direct `system.attributes.hp.value` update, or a manual-apply warning as fallback.
- **Elevation write on success** — `tokenDoc.update({ elevation })` called after `continueMovement` using `targetElevation` or the Scene Level's `elevation.bottom`.
- **No socket work needed** — `TOKEN_MOVE_IN` with `event.user.isSelf` guard ensures the dialog runs on the correct player's client; all movement control calls are local.

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
