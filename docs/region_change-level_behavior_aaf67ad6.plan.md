---
name: Region Change-Level Behavior
overview: Add a custom `traveler.changeLevel` RegionBehaviorType that intercepts token movement into a region, checks item/status prerequisites, optionally prompts the player for a configurable Roll-formula check, changes the token's Scene Level elevation on success, and auto-applies falling/failure damage on failure.
todos:
  - id: b1
    content: Create scripts/behaviors/change-level.js — TravelerChangeLevelBehavior class with schema and _handleRegionEvent
    status: completed
  - id: b2
    content: Create scripts/behaviors/level-check-dialog.js — awaitable ApplicationV2 dialog with Attempt/Give Up buttons
    status: completed
  - id: b3
    content: Create templates/level-check-dialog.hbs — player-facing check dialog template
    status: completed
  - id: b4
    content: Update module.json — add templates array
    status: completed
  - id: b5
    content: Update scripts/traveler.js — import behavior and register in CONFIG.RegionBehavior.dataModels in init hook
    status: completed
  - id: b6
    content: Update CHANGELOG.md with new commit hash
    status: completed
isProject: false
---

# Region "Change Level" Behavior

## How it fits into Foundry v14

```mermaid
flowchart TD
    A["Token moves toward Region"] --> B["TOKEN_MOVE_IN fires on all clients"]
    B --> C{"event.user.isSelf?"}
    C -- no --> Z["no-op"]
    C -- yes --> D["pauseMovement(continueKey)"]
    D --> E{"Prerequisites met?\n(status, item)"}
    E -- no --> F["stopMovement\n+ warn notification"]
    E -- yes --> G{"requiresCheck?"}
    G -- no --> H["continueMovement\n+ set elevation"]
    G -- yes --> I["TravelerLevelCheckDialog\n(awaitable ApplicationV2)"]
    I -- "Roll >= DC" --> J["continueMovement\n+ set elevation\n+ chat success"]
    I -- "Roll < DC" --> K["stopMovement\n+ applyFailureDamage\n+ chat failure"]
    K --> L{"allowRetry?"}
    L -- yes --> I
    L -- no --> M["done"]
    I -- cancelled --> F
```

## New Files

### `scripts/behaviors/change-level.js`

Extend `foundry.data.regionBehaviors.RegionBehaviorType`.

**Schema fields** (registered in `CONFIG.RegionBehavior.dataModels["traveler.changeLevel"]`):

- `mode` — `StringField`, choices: `stairs | ladder | cliff | drop | fly-only`, default `"stairs"`
- `targetLevelId` — `StringField` — Level document ID to transition the token to
- `targetElevation` — `NumberField` — exact `elevation` value written to the token
- `requiredStatusEffect` — `StringField` — e.g. `"flying"` or `"spider-climb"`; empty = no requirement
- `requiredItemPattern` — `StringField` — regex tested against `actor.items` names; empty = no requirement
- `requiresCheck` — `BooleanField` default `false`
- `checkLabel` — `StringField` default `"Traversal Check"` — shown in dialog title
- `checkFormula` — `StringField` default `"1d20"` — any valid Roll expression; actor data is available via `@`
- `checkDC` — `NumberField` default `10`
- `failureDamage` — `StringField` — dice formula e.g. `"2d6"`; empty = no damage
- `allowRetry` — `BooleanField` default `false`

Core method (`_handleRegionEvent`):
```js
async _handleRegionEvent(event) {
  if (event.type !== CONST.REGION_EVENTS.TOKEN_MOVE_IN) return;
  if (!event.user.isSelf) return;                // only the moving user acts

  const tokenDoc = event.data.token;
  const movementId = event.data.movement?.id;
  const continueKey = this.parent.uuid;

  const paused = tokenDoc.pauseMovement?.(continueKey);
  if (!paused) return;

  // prerequisite check …
  // dialog loop (while allowRetry) …
  // continue or stop …
}
```

### `scripts/behaviors/level-check-dialog.js`

`TravelerLevelCheckDialog extends foundry.applications.api.HandlebarsApplicationMixin(ApplicationV2)`

- Constructor accepts `{ behavior, tokenDoc }` and creates `this.promise = new Promise(…)`
- `_prepareContext` — builds `{ checkLabel, formula, dc, actorName, modeName, canAttempt }`
- Two buttons wired via `_attachPartListeners`:
  - **Attempt** — evaluates `new Roll(formula, actorData).evaluate()`, posts to chat, resolves promise with `{ success, roll, cancelled: false }`
  - **Give Up** — resolves promise with `{ success: false, roll: null, cancelled: true }`, closes dialog
- Template: `modules/traveler/templates/level-check-dialog.hbs`

### `templates/level-check-dialog.hbs`

- Shows actor name, behavior mode icon, check label, formula, DC
- "Attempt" and "Give Up" buttons
- Displays last roll result inline when retrying

## Modified Files

### [`module.json`](module.json)

Add a `"templates"` array (Foundry pre-loads these on `init`):
```json
"templates": ["templates/level-check-dialog.hbs"]
```

### [`scripts/traveler.js`](scripts/traveler.js)

In `Hooks.once("init")`:
```js
import { TravelerChangeLevelBehavior } from "./behaviors/change-level.js";
// …
CONFIG.RegionBehavior.dataModels["traveler.changeLevel"] = TravelerChangeLevelBehavior;
```

Import and register before any settings — registration must happen in `init`.

### [`CHANGELOG.md`](CHANGELOG.md)

Add entry under `[Unreleased]`.

## Key Implementation Notes

- **Damage application** — `applyFailureDamage` tries, in order: `actor.applyDamage(total)` (dnd5e/pf2e common), then `actor.update({"system.attributes.hp.value": hp - total})`, then falls back to posting a roll to chat with a warning.
- **Elevation update** — `tokenDoc.update({ elevation: this.targetElevation }, { animate: false })` called after `continueMovement` (v14 standard).
- **Roll data** — actor data injected via `Roll(formula, tokenDoc.actor?.getRollData?.() ?? {})` for `@` references.
- **Prerequisite checks** — status via `actor?.statuses?.has(statusId)`; items via a `new RegExp(pattern, "i")` test against `item.name`; either field empty means that requirement is skipped.
- **No socket work needed** — `TOKEN_MOVE_IN` with `event.user.isSelf` guard means the dialog runs naturally on the correct player's client; `pauseMovement`/`continueMovement`/`stopMovement` are all called on that same client.
- **RegionBehavior config form** — Foundry auto-generates form fields from the DataModel schema in `RegionConfig`; no custom config template needed for MVP.
