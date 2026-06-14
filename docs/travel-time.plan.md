---
name: Travel Time, World Clock & Player Speed
---

# Travel Time, World Clock & Player Speed

## Four features implemented together

---

## Feature 1 — World Clock Advance

When a GM-broadcast route finishes animating, advance `game.time.worldTime`
by the in-game travel duration derived from the route's travel mode.

### How duration is calculated

```
totalPx       = sum of segment lengths in the path array
totalUnits    = (totalPx / gridSize) * distancePerSquare
travelSeconds = (totalUnits / speedMph) * 3600
```

`distancePerSquare` comes from (in priority order):
1. Scene distance override flag (`MODULE_ID.sceneDistance.distancePerSquare`)
2. `canvas.scene.grid.distance`

`speedMph` comes from the route's `travelModeId` → `DEFAULT_TRAVEL_MODES[id].speedMph`.

### Clock advance call

```js
await game.time.advance(Math.round(travelSeconds));
```

Both **Simple Calendar** and **Seasons & Stars** automatically listen to
`game.time.worldTime` updates — no module-specific hook is needed.

### Module setting

`worldClockEnabled` (Boolean, GM-only, default `false`) — a global on/off
switch so GMs can opt in without touching their calendar module.

---

## Feature 2 — Per-scene Distance Scale Override

Foundry's `canvas.scene.grid.distance` is meant for combat squares (e.g. "5 ft").
On a geo-scale overland map, the GM needs to say "1 square = 100 miles" without
changing the combat grid distance.

Store as a scene flag: `MODULE_ID → sceneDistance`

```json
{
  "enabled": false,
  "distancePerSquare": 100,
  "units": "miles"
}
```

Accessible via a "Scene Scale" button in the Route Manager toolbar.
Opens `SceneSettingsDialog` (a compact `ApplicationV2`).

`manager.js → _getRouteLengthLabel()` and `clock.js → computeTravelSeconds()`
both check the flag before falling back to `canvas.scene.grid.distance`.

---

## Feature 3 — Player Speed Selection Dialog

Before a player submits a pathfinding proposal, a compact modal appears:

```
┌─────────────────────────────┐
│  🚶 Choose Travel Speed      │
│                             │
│  ○ Walking (Slow)   2 mph   │
│  ● Walking (Normal) 3 mph   │
│  ○ Walking (Fast)   4 mph   │
│  ○ Horseback        6 mph   │
│  ○ (other modes…)          │
│                             │
│  [Submit]  [Cancel]         │
└─────────────────────────────┘
```

Returns the selected travel mode id.  
If the GM approval mode is ON, the mode id is visible in the approval panel.

### `drawSpeed` adjustment

The route's `drawSpeed` is scaled relative to **Walking (Normal)** (3 mph):

```js
effectiveDrawSpeed = baseDraw * (selectedMph / 3)
```

This makes horseback routes animate visibly faster than a slow walk.

### Proposal payload additions

```js
proposal.travelModeId   = "horseback"
proposal.travelModeLabel = "Horseback"  // display only
```

---

## Feature 4 — Encounter Chance Scaling by Speed

Each `DEFAULT_TRAVEL_MODE` gains an `encounterMult` field (default `1.0`):

| Mode | encounterMult | Rationale |
|---|---|---|
| Walking (Slow) | 0.7 | Careful, observant |
| Walking (Normal) | 1.0 | Baseline |
| Walking (Fast) | 1.3 | Less watchful |
| Horseback | 1.6 | Noise + speed |
| Coach / Orien Coach | 1.4 | Road noise |
| Lightning Rail | 0.5 | Well-defended, fast |
| Sailing / Galleon | 1.2 | Visible at sea |
| Elemental Galleon | 0.8 | Faster, more defended |
| Elemental Airship | 0.4 | High altitude |

In `handleZoneFired(zone, routeId, pos, travelModeId)`:

```js
const mult = getTravelMode(travelModeId)?.encounterMult ?? 1.0;
const effectiveChance = Math.min(1, zone.chance * mult);
if (Math.random() > effectiveChance) return; // miss
```

---

## New / modified files

| File | Action |
|---|---|
| `docs/travel-time.plan.md` | NEW — this file |
| `scripts/clock.js` | NEW — `computeTravelSeconds`, `advanceClock`, `getDistancePerSquare` |
| `scripts/apps/player-speed-dialog.js` | NEW — speed picker dialog |
| `templates/player-speed-dialog.hbs` | NEW |
| `scripts/apps/scene-settings.js` | NEW — scene distance override dialog |
| `templates/scene-settings.hbs` | NEW |
| `scripts/settings.js` | MOD — add `encounterMult` to travel modes |
| `scripts/renderer.js` | MOD — call clock advance in `finish()` |
| `scripts/tool-player.js` | MOD — show speed dialog; include `travelModeId` in proposal |
| `scripts/encounters.js` | MOD — `handleZoneFired` uses speed multiplier |
| `scripts/traveler.js` | MOD — register settings; expose clock helpers; load templates |
| `scripts/apps/manager.js` | MOD — show speed badge on proposals; scene settings button |
| `templates/route-manager.hbs` | MOD — scene settings button; speed badge |
| `tests/unit/clock.test.js` | NEW |
| `tests/unit/player-speed.test.js` | NEW |
| `tests/quench/clock.quench.js` | NEW |
| `tests/quench/index.js` | MOD |
| `CHANGELOG.md` | MOD |
