---
name: Encounter System
overview: |
  Add encounter zones to saved routes.  Zones fire during route animation
  playback and present the GM with a confirmation dialog — Accept / Regenerate
  / Decline — before committing the encounter to the world.
  Two zone types: explicit (GM-placed at a T position along the route) and
  auto-interval (fires at regular distance intervals throughout the whole
  route).  The system uses Foundry's built-in Rollable Tables so it stays
  system-agnostic; the GM curates which table is appropriate for each
  environment/level.
todos:
  - e1: docs/encounters.plan.md (this file)
  - e2: constants.js — ENCOUNTER_PAUSE, ENCOUNTER_RESUME
  - e3: routes.js — encounters array in route record
  - e4: scripts/encounters.js — EncounterManager
  - e5: scripts/apps/encounter-dialog.js — GM confirm dialog
  - e6: templates/encounter-dialog.hbs
  - e7: templates/encounter-editor.hbs — zone list panel
  - e8: renderer.js — pause/resume + tick checks
  - e9: settings-app.js — Encounters tab
  - e10: manager.js — encounter badge
  - e11: route-manager.hbs — badge
  - e12: settings.hbs — Encounters tab panel
  - e13: traveler.js — loadTemplates + socket handlers
  - e14: tests/unit/encounters.test.js
  - e15: tests/quench/encounters.quench.js
  - e16: tests/quench/index.js
  - e17: CHANGELOG.md
---

# Encounter System

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Route record (scene flag)                                         │
│    id, name, points, settings, elevations                          │
│    encounters: [                                      ← NEW        │
│      { type:"explicit", t:0.35, tableId, chance:0.4, … }          │
│      { type:"auto",     frequency:0.1, tableId, chance:0.25, … }  │
│      { type:"fixed",    t:0.7,  actorId, journalId, label, … }    │
│    ]                                                               │
└────────────────────────────────────────────────────────────────────┘
                              │
                    Route playback (renderer.js)
                              │
            onTick: EncounterManager.checkZones(...)
                              │
                  Zone fires (GM client only)
                              │
                 ┌─────────────────────────┐
                 │ animation pauses (GM)   │
                 │ EncounterDialog opens   │
                 └─────────────────────────┘
                    │          │        │
                 Accept    Regen    Decline
                    │          │        │
              Resolve     Re-roll   Resume
              encounter   table     animation
              (chat +     → update
              note +      dialog
              token)
```

---

## Encounter Zone Types

| Type | Trigger | Config |
|---|---|---|
| `explicit` | Animation reaches T position (0.0–1.0 along route) | T value (0–100 %), label, table, chance |
| `auto` | Every `frequency` % of total route distance | frequency %, table, chance |
| `fixed` | Same as explicit, but guaranteed (no roll) | T value, specific actorId OR journalId, label |

---

## Encounter Zone Data Schema

```js
{
  id:          string,          // foundry.utils.randomID()
  type:        "explicit" | "auto" | "fixed",

  // Position (explicit / fixed only)
  t:           number,          // 0.0–1.0 along route length

  // Common config
  label:       string,          // GM-facing label shown in editor + dialog
  chance:      number,          // 0.0–1.0  (ignored for type:"fixed")
  environment: string,          // free text shown in dialog (e.g. "Coniferous Forest")

  // Random / explicit source
  tableId:     string | null,   // RollTable document id
  tableName:   string,          // cached display name

  // Fixed source (type:"fixed" only)
  actorId:     string | null,   // specific Actor id
  journalId:   string | null,   // JournalEntry id to open

  // Auto-interval specific
  frequency:   number,          // trigger every N % of total route (0.0–1.0)

  // Resolution options
  spawnToken:  boolean,         // create token on map
  createNote:  boolean,         // create Note pin at encounter position
  chatMessage: boolean,         // post to chat

  // Runtime state (not persisted — reset each playback)
  _triggered:  boolean
}
```

---

## EncounterManager (`scripts/encounters.js`)

```
checkZones(encounters, t, tPrev, totalLen)
  → fired: EncounterZone[]    — zones that crossed their trigger this frame

rollTable(tableId)
  → { name, img, actorId, packId, packName, text }

importActor(result)
  → Actor                     — imports from compendium into "Random Encounters" folder

spawnToken(actor, pos)
  → TokenDocument

createNote(result, pos)
  → NoteDocument

createChatMessage(result, zone, pos)
  → ChatMessage

resolveEncounter(result, zone, pos)
  → orchestrates chat + note + spawn based on zone flags
```

---

## EncounterDialog (`scripts/apps/encounter-dialog.js`)

Extends `HandlebarsApplicationMixin(ApplicationV2)`.  Opened only on the GM
client.  Constructor takes `{ zone, initialResult, routeId, pos }`.

```
promise: Promise<"accept"|"decline">
_onAccept()   → resolveEncounter → this._resolve("accept")
_onRegenerate() → rollTable again → update displayed result in-place
_onDecline()  → this._resolve("decline")
close()       → always resolves ("decline" if not yet resolved)
```

The dialog pauses the GM's local route animation while it is open.
`IndyRouteRenderer.pauseRoute(routeId)` / `.resumeRoute(routeId)` control
the pause state.

---

## Renderer Integration (`scripts/renderer.js`)

### Changes

1. `entry` gains `encounterPaused: false`.
2. New methods: `pauseRoute(routeId)`, `resumeRoute(routeId)`.
3. In `onTick`: if `entry.encounterPaused`, skip advancing `elapsed` (animation
   freezes on GM client; other clients unaffected).
4. After advancing `idx`, call encounter zone checks (GM-only guard).
5. Zone checks run `EncounterManager.checkZones(encounters, t, tPrev, totalLen)`.
6. For each fired zone: `EncounterManager.handleZoneFired(zone, routeId, currentPos)`.

`handleZoneFired` is async and:
1. Rolls the table (or uses fixed actor).
2. Pauses animation.
3. Opens EncounterDialog.
4. Awaits resolution.
5. On accept: calls `resolveEncounter`.
6. Resumes animation.

---

## UI — Encounters Tab in Route Editor

Added to `settings-app.js` as a new `"encounters"` tab (alongside general,
line, dot, etc.).  Tab content rendered from `encounter-editor.hbs`.

The tab shows:
- List of existing encounter zones (label, type, T position, table name)
- "Add Explicit Zone" button
- "Add Auto-Interval Zone" button
- "Add Fixed Encounter" button
- Per-zone: Edit / Delete buttons

Editing a zone opens an inline form in the same panel.

---

## Route Manager Badge

Each route row in the Route Manager shows a small encounter badge if
`route.encounters.length > 0`:

```html
<span class="encounter-badge" title="3 encounter zones">⚔ 3</span>
```

---

## System-Agnostic Notes

- No CR/level lookup — the GM selects the appropriate Rollable Table.
- Token spawning uses `game.packs` and `Actor.create()` — standard Foundry API.
- Damage application is NOT part of encounter resolution (that remains in the
  region-behavior check system).
- Works with any game system whose actors appear in compendium Rollable Tables.

---

## CI Notes

- Unit tests: encounter logic (zone firing, T check, auto-interval math).
- Quench tests: table roll returns a result; note creation; EncounterDialog
  opens and resolves correctly.
