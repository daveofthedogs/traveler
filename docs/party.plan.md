# Party System — Design Plan

## Problem Statement

When using a single **party token** on an overland map instead of individual tokens,
the existing module breaks in three places:

| Feature | Current broken behaviour |
|---|---|
| `traveler.changeLevel` region check | Dialog shown only to token owner (GM); players see nothing |
| Prerequisite checks (items/statuses) | Checked against the party actor, not individual characters |
| Player pathfinding tool | Requires `token.isOwner`; players can't pathfind with a GM-owned token |

---

## Goals

1. Let a GM define one or more **parties** (named groups of actors with a shared token).
2. When the party token enters a region with a `traveler.changeLevel` behavior that requires a
   check, **each party member** receives an individual check dialog for their own character.
3. The GM sees a **real-time collector dialog** showing every member's roll as it arrives.
4. A configurable **resolution mode** determines whether the party passes as a group.
5. Failure damage is applied to individual members who failed, not the party token.
6. Any party member can use the **player pathfinding tool** to move the party token.
7. The **travel pace** used for the route is derived from the configured pace mode.

---

## Data Model

### Party record (stored in world setting `traveler.parties`, type `Array`)

```js
{
  id:                 string,   // randomID()
  name:               string,   // e.g. "The Adventurers"
  partyTokenActorId:  string,   // actorId of the token on the map
  memberActorIds:     string[], // individual character actor IDs
  resolutionMode:     "all" | "best" | "majority" | "designated",
  designatedActorId:  string | null,  // only used when mode === "designated"
  travelPaceMode:     "slowest" | "average" | "fastest"
}
```

### Resolution modes

| Mode | Party passes when… |
|---|---|
| `all` | Every member passes their individual check |
| `best` | At least one member passes |
| `majority` | More than half pass |
| `designated` | The designated actor passes (others roll for narrative only) |

### Travel pace modes

| Mode | Route speed uses… |
|---|---|
| `slowest` | Lowest `speedMph` among member actors' linked travel modes |
| `average` | Mean `speedMph` across members |
| `fastest` | Highest `speedMph` |

---

## Socket Protocol

Three new `MSG` types added to `constants.js`:

```
PARTY_CHECK_REQUEST  — GM → specific player user  (request an individual roll)
PARTY_CHECK_RESULT   — player → GM                (submit roll outcome)
PARTY_CHECK_RESOLVED — GM → all                   (broadcast final pass/fail)
```

### Full sequence

```
GM client (TOKEN_MOVE_IN on party token)
  │
  ├─ getPartyForToken(tokenDoc)  → party
  ├─ getPartyMemberUsers(party)  → [{actorId, userId, actorName}]
  ├─ PartyCheckSession.create(…) → session (in-memory, keyed by sessionId)
  ├─ game.socket.emit PARTY_CHECK_REQUEST to each member's userId
  ├─ new PartyCheckCollector(session).render() — real-time GM view
  └─ await session.promise

Each player (on their client):
  ├─ socket PARTY_CHECK_REQUEST arrives (filtered by userId)
  ├─ find own token for the actorId
  ├─ TravelerLevelCheckDialog rendered (existing UI, party mode flag set)
  ├─ player rolls (or gives up)
  └─ game.socket.emit PARTY_CHECK_RESULT → GM

GM client (collecting results):
  ├─ socket PARTY_CHECK_RESULT arrives
  ├─ session.addResult(…) — marks participant done
  ├─ PartyCheckCollector re-renders (live update)
  └─ when all results in (or GM force-resolves):
      ├─ resolvePartyCheck(participants, mode, designatedActorId)
      ├─ if pass  → tokenDoc.continueMovement + applyElevation
      ├─ if fail  → tokenDoc.stopMovement
      │            + applyFailureDamage to each failed participant's actor
      └─ game.socket.emit PARTY_CHECK_RESOLVED (for chat summary)
```

---

## New Files

| File | Purpose |
|---|---|
| `scripts/party.js` | Data model CRUD, session store (`PartyCheckSession`), helper functions |
| `scripts/apps/party-config.js` | ApplicationV2 — list/create/edit/delete parties |
| `scripts/apps/party-check-collector.js` | ApplicationV2 — GM real-time roll collector |
| `templates/party-config.hbs` | Party management UI template |
| `templates/party-check-collector.hbs` | GM roll progress template |
| `docs/party.plan.md` | This document |

---

## Modified Files

| File | Change |
|---|---|
| `scripts/constants.js` | Add `PARTY_CHECK_REQUEST`, `PARTY_CHECK_RESULT`, `PARTY_CHECK_RESOLVED` |
| `scripts/behaviors/change-level.js` | `_handleMoveIn` checks `getPartyForToken`; delegates to `_handlePartyMoveIn` if party token |
| `scripts/behaviors/level-check-dialog.js` | New constructor option `partySessionId`; in party mode submit result via socket instead of resolving locally |
| `scripts/traveler.js` | Register `parties` setting and menu; load new templates; add 3 new socket handlers |
| `scripts/tool-player.js` | `start()` accepts party token if user is a party member |

---

## Party Config UI

**Access:** Settings → Module Settings → Traveler → **Configure Parties**

**Features:**
- Table listing all parties with name, member count, resolution mode
- **Add Party** button — adds an inline empty row for editing
- Per-party fields: Name, Party Token Actor (drag/drop), Members (drag/drop list with remove),
  Resolution Mode dropdown, Designated Actor (only when mode=designated), Travel Pace Mode
- **Save** and **Delete** buttons per party

---

## Party Check Collector Dialog (GM)

Shown on the GM client while waiting for player rolls. Updates live as each result arrives.

**Columns:** Actor name | Status (⏳ / 🎲 / ✅ pass / ❌ fail / 🚫 gave up) | Roll total

**Bottom bar:** Resolution mode label + required threshold | **Force Resolve** button

When all results in:
- Green banner: "PARTY PASSES — motion continues"
- Red banner: "PARTY BLOCKED — movement stopped"

---

## Player Pathfinding Changes

`PlayerRouteTool.start()` currently requires `canvas.tokens.controlled[0]` to be owned by the
current user. Additional logic:

```
if no controlled owned token:
  find party where current user is a member
  use party token as the subject token (if present on scene)
```

The proposal payload includes `partyId` so the GM can see it originated from a party member.

---

## Tests

### Unit tests (`tests/unit/party.test.js`)

- `createParty` factory — required fields, defaults, unique IDs
- `getPartyForToken` — returns correct party or null
- `getPartyMemberUsers` — resolves actor IDs to user IDs correctly
- `resolvePartyCheck` — all four resolution modes with edge cases
  - `all`: fails if any participant failed
  - `best`: passes if any participant passed
  - `majority`: correct rounding (even numbers, odd numbers)
  - `designated`: passes iff designated actor passed; ignores others
- `PartyCheckSession` — create, addResult, auto-resolves when all in, get/remove

### Integration tests (`tests/quench/party.quench.js`)

- Party CRUD round-trip via `saveParties` / `getParties`
- `getPartyForToken` on a live scene with a real actor/token
- Socket round-trip: emit `PARTY_CHECK_REQUEST`, receive on same client (self-test with
  `game.user` acting as both GM and player), emit `PARTY_CHECK_RESULT`, session resolves
- `PartyCheckCollector` renders and closes without error
- `PartyConfigApp` opens and closes without error

---

## Prerequisites / Setup Order

1. Create or identify the actors that will be **party members** (individual character actors).
2. Create or identify the **party token actor** (the single token on the overland map).
3. Open **Settings → Module Settings → Traveler → Configure Parties**.
4. Click **Add Party**, fill in name, drag the party token actor, drag in member actors.
5. Set resolution mode and travel pace.
6. On the scene, ensure the party token actor has a token placed.
7. Draw routes and/or create level-change regions as normal.
