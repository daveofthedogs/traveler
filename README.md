# Traveler

![Foundry v14](https://img.shields.io/badge/Foundry-v14-informational)
![License MIT](https://img.shields.io/badge/license-MIT-green)

> **Attribution** — Traveler is a fork of [Indy Route](https://github.com/jwrpalmer99/indy-route)
> by [jwrpalmer99 (PinguTwo)](https://github.com/jwrpalmer99). The fork diverges at v1.2.2 and
> continues as a standalone module targeting Foundry VTT v14 with expanded functionality.

Draw and animate Indiana Jones-style travel routes on the canvas. Plan overland journeys, trigger
random encounters, track in-world travel time, and let players propose their own paths — all from
inside Foundry.

---

## Table of Contents

- [Features](#features)
- [GM Guide](#gm-guide)
  - [Installation](#installation)
  - [Pre-Setup: Rollable Tables for Encounters](#pre-setup-rollable-tables-for-encounters)
  - [Pre-Setup: Travel Modes](#pre-setup-travel-modes)
  - [Pre-Setup: Scene Levels & Regions](#pre-setup-scene-levels--regions)
  - [Recommended Setup Order](#recommended-setup-order)
  - [Module Settings Reference](#module-settings-reference)
  - [Scene Configuration](#scene-configuration)
  - [GM UI Controls](#gm-ui-controls)
  - [Route Manager](#route-manager)
  - [Route Style Editor](#route-style-editor)
  - [Encounter Zone Editor](#encounter-zone-editor)
  - [Scene Distance Scale Override](#scene-distance-scale-override)
  - [Drawing & Editing Routes](#drawing--editing-routes)
  - [Level Change Regions](#level-change-regions)
  - [Encounter Zones](#encounter-zones)
  - [World Clock Integration](#world-clock-integration)
  - [Export & Import](#export--import)
  - [Macro / API Reference](#macro--api-reference)
- [Player Guide](#player-guide)
  - [Enabling Player Routes](#enabling-player-routes)
  - [Using the Player Route Tool](#using-the-player-route-tool)
  - [Selecting Travel Speed](#selecting-travel-speed)
  - [Fog of War & Vision](#fog-of-war--vision)
  - [GM Approval Workflow](#gm-approval-workflow)
- [Notes & Troubleshooting](#notes--troubleshooting)

---

## Features

| Feature | Description |
|---|---|
| Route drawing | Draw smooth animated travel paths on any scene |
| Cinematic camera | Auto-pan and zoom during playback |
| Per-scene storage | Routes saved as scene flags — no extra database |
| Token follow | Attach an Actor or Token to move along the path |
| Travel time & cost | Calculated from configurable travel modes |
| **Scene Levels** | Routes carry per-point elevation; token elevation updates live |
| **Level Change Regions** | Region behaviors gate elevation transitions behind skill checks |
| **Encounter zones** | Explicit, auto-interval, and fixed encounter zones on routes |
| **GM encounter dialog** | Accept / Regenerate / Decline when a random encounter fires |
| **Player pathfinding** | Players draw A* routes respecting walls, fog, and regions |
| **World clock** | Automatically advance `game.time` by travel duration |
| **Scene distance override** | Set miles-per-square for geo-scale maps independently of combat grid |

---

## GM Guide

### Installation

1. Open Foundry's **Add-on Modules** panel.
2. Paste the manifest URL (or install from the manifest file in this repository).
3. Enable **Traveler** in your world's Manage Modules dialog.
4. The **Route Manager** button ( <kbd>⟳ route</kbd> icon ) appears in the **Drawing** controls
   toolbar — visible to the GM only.

---

### Pre-Setup: Rollable Tables for Encounters

Encounter zones reference world **Rollable Tables**. Tables are game-system-agnostic: each result
can be a text label, a world Actor, or a compendium Actor.

**Recommended table structure:**

- Create one table per environment (e.g. *Road Encounters*, *Forest Encounters*, *Dungeon Encounters*).
- Add results for each creature or encounter type. For token spawning, link each result to an Actor
  (world or compendium).
- Assign relative weights so rare encounters roll less often.

> **You do not need to set up tables before enabling the module.** Tables are only required when you
> add encounter zones to a route. You can create them at any time before a route is played.

---

### Pre-Setup: Travel Modes

Travel modes drive distance labels, travel-time tooltips, world clock advancement, and encounter
chance multipliers. The module ships with D&D 5e / Eberron defaults.

**To customise travel modes:**

1. Go to **Settings → Module Settings → Traveler → Configure Travel Modes**.
2. Add, edit, or remove modes. Each mode has:
   - `id` — unique key (e.g. `horseback`)
   - `label` — displayed name
   - `speedMph` — speed in miles per hour
   - `perDayMiles` — miles per travel day
   - `encounterMult` — multiplier applied to encounter zone chance (default `1.0`)
   - Optional `costPerHour` / `costPerDay` fare tiers

> Travel modes only affect distance labels and time estimates when the mode is set to something
> other than **None** in the route's Style → General tab.

---

### Pre-Setup: Scene Levels & Regions

**Scene Levels** (v14 only) define elevation layers on a scene. **Regions** with the
`traveler.changeLevel` behavior control how tokens move between those layers.

**To set up levels:**

1. Open **Scene Configuration → Levels** (requires the Levels module or Foundry v14's native
   scene levels — check your version's documentation).
2. Create levels for each floor/elevation you need.

**To set up a level-change region:**

1. Open the **Regions** layer in the toolbar.
2. Draw a region over the stairs, ladder, or cliff area.
3. In the region's **Behaviors** tab, add a new behavior → **Traveler: Change Level**.
4. Configure:

| Field | Description |
|---|---|
| Mode | `stairs` (auto), `ladder` (prompt), `cliff` (check required), `fly-only`, `drop` |
| Target Elevation | The elevation value the token moves to on success |
| Target Level ID | Alternatively, pick a Scene Level by id |
| Requires Check | Show a skill-check dialog to the player |
| Check Label | e.g. *Athletics*, *Acrobatics* |
| Check Formula | Roll formula, e.g. `1d20+3` |
| Check DC | Difficulty of the check |
| Failure Damage | Optional damage formula applied on failed check |
| Allow Retry | Whether the player can attempt the check again |
| Required Status | Status effect the token must have (e.g. `flying`) |
| Required Item Pattern | Regex matched against item names (e.g. `rope\|climbing kit`) |

> Regions do not require levels to be configured first — you can use a plain elevation number as
> the target instead of a Level ID.

---

### Recommended Setup Order

If you intend to use all features, do these steps before your first session:

1. *(Optional)* Create **Rollable Tables** for each environment type.
2. *(Optional)* Customise **Travel Modes** to match your game system.
3. *(Optional)* Configure **Scene Levels** on each overland/dungeon scene.
4. *(Optional)* Draw **Regions** and attach `traveler.changeLevel` behaviors.
5. Open **Module Settings → Traveler** and configure:
   - `Advance World Clock` — on or off
   - `Player Pathfinding` — off / immediate / approval
   - `Prompt Players for Travel Speed` — on or off
6. Draw routes and add encounter zones as needed.

> Steps 1–4 can be done at any time — they are not required before enabling the module or drawing
> routes. The module settings (step 5) take effect immediately and can be changed mid-session.

---

### Module Settings Reference

Access all settings at **Settings → Module Settings → Traveler**.

| Setting | Type | Default | Description |
|---|---|---|---|
| **Configure Route Tools** | Menu button | — | Open the visual defaults editor for new routes |
| **Configure Travel Modes** | Menu button | — | Add / edit travel speeds, fares, and encounter multipliers |
| **Configure Currency Conversions** | Menu button | — | Override gp/sp/cp conversion ratios used in cost tooltips |
| **Ignore Currencies** | String | `ep,pp` | Comma-separated currency keys to hide from cost breakdowns |
| **Player Pathfinding** | Select | `Off` | Whether players can draw routes: Off / Immediate / Approval |
| **Advance World Clock on Route Playback** | Boolean | `false` | Auto-advance `game.time` by travel duration when a route finishes |
| **Prompt Players for Travel Speed** | Boolean | `true` | Show a speed-selection dialog before a player submits a route |

---

### Scene Configuration

#### Grid Distance & Units (Foundry built-in)

Foundry's **Scene Configuration → Grid → Distance** and **Units** fields are used directly by
Traveler to compute route distances and travel times. For overland maps:

- Set **Distance** to the real-world distance one grid square represents (e.g. `5` miles).
- Set **Units** to `miles` (or `km`, `leagues`, etc.).

> If your world uses the same scene for both combat (5 ft squares) and overland travel, use the
> **Scene Distance Override** instead (see below).

#### Scene Distance Override (Traveler-specific)

For scenes where Foundry's grid distance is set to combat scale but the map is geo-scale, use the
per-scene override:

1. Open the **Route Manager**.
2. Click the **map icon** ( 🗺 ) in the toolbar — opens the *Scene Distance Scale* dialog.
3. Enable the override, set **Distance per square** (e.g. `100`) and **Units** (e.g. `miles`).
4. Click **Save**.

The override is stored as a scene flag and does not affect combat measurements.

---

### GM UI Controls

#### Toolbar buttons (Drawing controls)

| Button | Action |
|---|---|
| **Route Manager** | Open/close the route list for the current scene |
| **Clear Routes** | Remove all animated route overlays from the canvas (does not delete saved routes) |
| **Player Route Tool** *(if player routing is enabled)* | Draw a pathfinding route for a controlled token |

#### Route Manager toolbar

| Button | Action |
|---|---|
| **Draw New Route** | Start drawing a new route |
| 🗺 (map icon) | Open the Scene Distance Scale override dialog |
| **Export Routes** | Download all scene routes as a JSON file |
| **Import Routes** | Replace scene routes from a JSON file |

#### Per-route actions

| Button | Action |
|---|---|
| ▶ **Play** | Broadcast the animated route to all connected users |
| 👁 **Preview** | Play the animation locally only (no broadcast) |
| **Persist to Tile** | Bake the route into a tile image on the scene |
| ✏ **Edit** | Re-enter the drawing tool to add or remove points |
| 🎨 **Style** | Open the Style editor for this route |
| ✕ **Clear** | Remove this route's animation from the canvas |
| 🗑 **Delete** | Delete the route after confirmation |

> Routes with encounter zones show an orange **⚔ N** badge (where N is the zone count).

---

### Route Manager

The Route Manager lists all saved routes for the current scene. Routes display:
- Name (editable inline — click and type)
- Level badge (if the route is associated with a Scene Level)
- ⚔ encounter badge (if encounter zones are configured)
- Ruler icon with distance tooltip (shows length, travel time, and cost when a travel mode is set)

Drag the grip handle on the left of each route to reorder.

---

### Route Style Editor

Open with the 🎨 **Style** button. Changes to the style preview immediately on canvas but are not
saved until you click **Save**.

#### Tabs

| Tab | Settings |
|---|---|
| **General** | Scale with map, scale multiplier, cinematic movement, sound, travel mode, fare tier, render above tokens, Scene Level |
| **Line** | Color, alpha, width, end-marker toggle |
| **Dot** | Show dot, color, radius, token/actor UUID (drag-drop supported), rotation, scale |
| **Label** | Show label, color, font, size, offset, path-following, direction arrow, position % |
| **Animation** | Draw speed (px/sec), linger time, resample step |
| **Camera** | Intro pan duration, pause before draw, zoom factor, smoothness, token update rate |
| **Smoothing** | None, Catmull-Rom (spline), Chaikin (rounded corners) |
| **⚔ Encounters** | Add and manage encounter zones *(only visible when editing a saved route)* |

---

### Encounter Zone Editor

Open the **⚔ Encounters** tab in the Style editor.

#### Zone types

| Type | When it fires | Use case |
|---|---|---|
| **Explicit Zone** | Once, when animation crosses a T position (0–100% along route) | Specific encounter spot (ambush point, danger zone) |
| **Auto-interval** | At regular percentage intervals throughout the route | Background random encounter rolls |
| **Fixed Encounter** | Once, guaranteed (no chance roll) | Side quest, scripted event |

#### Adding a zone

1. Click **Add Zone**, **Auto-interval**, or **Fixed Encounter**.
2. Fill in the inline form:
   - **Label** — GM note (shown in the encounter dialog)
   - **Position %** — Where along the route it fires (explicit/fixed only)
   - **Every %** — Interval (auto only, e.g. `10` = fires at 10%, 20%, 30%…)
   - **Chance %** — Probability the encounter actually triggers (skipped for fixed)
   - **Table** — Which Rollable Table to roll on
   - **Environment** — Displayed in the GM dialog (e.g. *Coniferous Forest*)
   - **Options** — Chat message / Note pin / Spawn token
3. Click **Save**.

#### GM Encounter Dialog

When a zone fires during playback the animation pauses on the GM's client and a dialog appears:

| Button | Effect |
|---|---|
| ✅ **Accept** | Creates a chat message, drops a Note pin on the map, and spawns the NPC token |
| 🎲 **Regenerate** | Re-rolls the table and updates the dialog in place (can repeat) |
| ✕ **Decline** | Skips the encounter; animation resumes |

> The encounter chance is automatically scaled by the active travel mode's `encounterMult`. A party
> on horseback (1.6×) is more likely to attract encounters than one walking slowly (0.7×).

---

### World Clock Integration

When **Advance World Clock on Route Playback** is enabled, Traveler calls
`game.time.advance(seconds)` when a route finishes animating (GM client only). The duration is
derived from the route's travel mode and the scene's distance-per-square setting.

**Compatibility:** Both [Simple Calendar](https://foundryvtt.com/packages/foundryvtt-simple-calendar)
and [Seasons & Stars](https://foundryvtt.com/packages/seasons-and-stars) respond automatically to
`game.time` changes — no additional configuration is needed.

**Clock does not advance when:**
- The setting is off (default).
- The route's travel mode is set to **None**.
- The route is a player-submitted proposal without a travel mode.
- The playback is a **Preview** (GM-only preview).

---

### Export & Import

**Export** — downloads a JSON file containing all routes for the current scene:

```json
{
  "sceneId": "...",
  "exportedAt": 1700000000000,
  "routes": [ ... ]
}
```

Each route includes its points, style settings, scene level, and encounter zones.

**Import** — replaces all current scene routes with those from a JSON file. Existing routes are
overwritten after confirmation.

---

### Macro / API Reference

The module exposes a full API at `game.modules.get("traveler").api`.

```js
const api = game.modules.get("traveler").api;
api.help(); // print available methods to the console
```

#### Common operations

```js
// List all routes on the current scene
const routes = api.listRoutes();

// Find and play by name
const r = api.getRouteByName("Road to Neverwinter");
api.playRoute(r?.id);

// Draw and play a one-off route immediately
api.drawRoute({
  points: [{ x: 100, y: 100 }, { x: 800, y: 500 }],
  name: "Quick Route",
  cinematicMovement: true
});

// Create a route without playing it
const id = await api.createRoute({
  points: [{ x: 100, y: 100 }, { x: 800, y: 500 }],
  name: "Saved Route"
});

// Play a saved route with overrides
api.playRoute("ROUTE_ID", {
  drawSpeed: 200,
  lingerMs:  3000,
  cinematicMovement: false
});

// Clear a specific route from the canvas
api.clearRoute("ROUTE_ID");
api.clearAllRoutes();

// Bake a route to a tile
await api.drawRouteToTile("ROUTE_ID");
```

---

## Player Guide

### Enabling Player Routes

Player pathfinding is **disabled by default**. The GM must enable it in
**Settings → Module Settings → Traveler → Player Pathfinding**:

| Option | Behaviour |
|---|---|
| **Off** | Only GMs can draw routes (default) |
| **On — Immediate** | Player routes play instantly for all users without GM approval |
| **On — Approval** | Player routes are queued in the Route Manager for GM review |

---

### Using the Player Route Tool

When player routing is enabled, the **player route tool** button appears in the Drawing controls
for players who own at least one token.

1. **Select your token** on the canvas.
2. Click the **player route tool** button (path icon).
3. **Left-click** anywhere on the canvas to set a destination. The module runs an A* pathfinder
   and draws a preview path from your token to the click point.
4. Keep clicking to refine or extend the path.
5. Press **Enter** (or click the submit button) to submit the route.
6. Press **Escape** to cancel.

---

### Selecting Travel Speed

If **Prompt Players for Travel Speed** is enabled (the default), a small dialog appears when
you submit the route:

- Shows all configured travel modes (Walking Slow → Airship).
- Select the mode that matches your intended travel.
- Click **Submit Route**.

Your selected speed:
- Scales the route's animation speed proportionally.
- Is shown to the GM in the approval panel.
- Influences random encounter chance via the mode's `encounterMult`.
- Is used for world clock advancement if enabled.

---

### Fog of War & Vision

The player route tool **respects fog of war**:

- Unexplored cells block pathfinding. You cannot draw a route through areas your token has never seen.
- As your token moves and vision expands, you can click the **fog boundary anchor** (a pulsing dot
  at the edge of explored territory) to extend your route from that point.
- If vision expands while the tool is active (e.g. another token reveals area), the path
  automatically re-evaluates toward your original destination.

Impassable walls, non-passable regions, and level changes are all respected by the pathfinder.

---

### GM Approval Workflow

When the GM has set player routing to **Approval** mode:

1. After the player submits, a notification appears for the GM in the Route Manager:  
   *"PlayerName proposed a route for TokenName."*
2. The **Proposals** section in the Route Manager shows each pending route with:
   - Player name and token name
   - How long ago it was submitted
   - Number of waypoints
   - Selected travel speed (if the player chose one)
3. The GM can:
   - 👁 **Preview** — see the proposed route on canvas for 4 seconds
   - ✅ **Approve** — broadcast the route to all users
   - ✕ **Reject** — remove the proposal and notify the player

---

## Notes & Troubleshooting

- Routes are scene-specific. Switching scenes clears the canvas view but routes are still saved.
- If scale-based values look wrong, open the route's **Style** dialog and re-save to recapture the map scale.
- Token-follow moves the actual token document — useful for fog-of-war reveal. Use an Actor UUID if you want a visual only.
- Travel time uses full days plus a partial-day remainder (priced hourly).
- The module attempts to use world currencies if conversions are available; otherwise falls back to gp/sp/cp.
- Encounter tokens are imported into a world folder named **Random Encounters** and are reused if an actor with the same name already exists there.
- The `scene.getFlag("traveler", "routes")` flag stores all routes for a scene. The old `"indy-route"` flag is not read — migration is manual if needed.
- For developer documentation (architecture, testing, local CI) see [DEVELOPER-README.md](DEVELOPER-README.md).
