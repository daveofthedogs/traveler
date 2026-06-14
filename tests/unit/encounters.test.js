/**
 * Unit tests for the Encounter System (scripts/encounters.js).
 *
 * Tests cover pure logic only: zone firing, trigger math, result building.
 * Async Foundry interactions (rollTable, importActor, etc.) are not covered
 * here — those are covered by Quench integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createEncounterZone,
  checkZones,
  resetZoneTriggers,
  buildFixedResult,
  broadcastEncounterPause,
  broadcastEncounterResume,
  rollTable,
  createChatMessage,
  importActor,
  spawnToken,
  openFixedJournal,
  createNote
} from "../../scripts/encounters.js";

// ---------------------------------------------------------------------------
// createEncounterZone
// ---------------------------------------------------------------------------

describe("createEncounterZone", () => {
  it("returns an object with required fields", () => {
    const zone = createEncounterZone("explicit");
    expect(zone).toHaveProperty("id");
    expect(zone).toHaveProperty("type", "explicit");
    expect(zone).toHaveProperty("t");
    expect(zone).toHaveProperty("chance");
    expect(zone).toHaveProperty("_triggered", false);
  });

  it("applies overrides", () => {
    const zone = createEncounterZone("fixed", { t: 0.75, label: "Boss Fight" });
    expect(zone.t).toBe(0.75);
    expect(zone.label).toBe("Boss Fight");
  });

  it("generates a unique id each call", () => {
    const a = createEncounterZone("auto");
    const b = createEncounterZone("auto");
    expect(a.id).not.toBe(b.id);
  });

  it("auto zone defaults frequency to 0.1", () => {
    const zone = createEncounterZone("auto");
    expect(zone.frequency).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// checkZones — explicit
// ---------------------------------------------------------------------------

describe("checkZones — explicit zones", () => {
  let zone;
  beforeEach(() => {
    zone = createEncounterZone("explicit", { t: 0.5 });
  });

  it("fires when animation crosses zone.t", () => {
    const fired = checkZones([zone], 0.55, 0.45);
    expect(fired).toHaveLength(1);
    expect(fired[0].id).toBe(zone.id);
  });

  it("does not fire when animation has not reached zone.t", () => {
    expect(checkZones([zone], 0.4, 0.3)).toHaveLength(0);
  });

  it("does not fire again after _triggered is set", () => {
    zone._triggered = true;
    expect(checkZones([zone], 0.55, 0.45)).toHaveLength(0);
  });

  it("sets _triggered after firing", () => {
    checkZones([zone], 0.55, 0.45);
    expect(zone._triggered).toBe(true);
  });

  it("fires at t=0.0 (start of route)", () => {
    const z = createEncounterZone("explicit", { t: 0 });
    expect(checkZones([z], 0.01, 0)).toHaveLength(1);
  });

  it("fires at t=1.0 (end of route)", () => {
    const z = createEncounterZone("explicit", { t: 1.0 });
    expect(checkZones([z], 1.0, 0.99)).toHaveLength(1);
  });

  it("does not fire when tPrev equals zone.t exactly (boundary — already passed)", () => {
    // tPrev < t is the condition; if tPrev === t it hasn't moved
    const z = createEncounterZone("explicit", { t: 0.5 });
    expect(checkZones([z], 0.5, 0.5)).toHaveLength(0);
  });

  it("handles empty zones array", () => {
    expect(checkZones([], 0.5, 0.4)).toHaveLength(0);
  });

  it("handles null/undefined zones", () => {
    expect(checkZones(null,      0.5, 0.4)).toHaveLength(0);
    expect(checkZones(undefined, 0.5, 0.4)).toHaveLength(0);
  });

  it("fires multiple explicit zones in the same frame", () => {
    const z1 = createEncounterZone("explicit", { t: 0.3 });
    const z2 = createEncounterZone("explicit", { t: 0.4 });
    const fired = checkZones([z1, z2], 0.45, 0.25);
    expect(fired).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// checkZones — fixed (same trigger logic as explicit)
// ---------------------------------------------------------------------------

describe("checkZones — fixed zones", () => {
  it("fires when animation crosses zone.t", () => {
    const z = createEncounterZone("fixed", { t: 0.6 });
    expect(checkZones([z], 0.65, 0.55)).toHaveLength(1);
  });

  it("does not fire again after _triggered", () => {
    const z = createEncounterZone("fixed", { t: 0.6, _triggered: true });
    expect(checkZones([z], 0.65, 0.55)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkZones — auto interval
// ---------------------------------------------------------------------------

describe("checkZones — auto-interval zones", () => {
  it("fires when a frequency boundary is crossed", () => {
    // frequency 0.1 → boundaries at 0.1, 0.2, 0.3, …
    const z = createEncounterZone("auto", { frequency: 0.1 });
    // tPrev=0.09, t=0.11 crosses the 0.10 boundary
    const fired = checkZones([z], 0.11, 0.09);
    expect(fired).toHaveLength(1);
  });

  it("does not fire when no boundary is crossed within the frame", () => {
    const z = createEncounterZone("auto", { frequency: 0.1 });
    // Still within the same 0.1-0.2 interval
    expect(checkZones([z], 0.15, 0.12)).toHaveLength(0);
  });

  it("auto zones do not permanently set _triggered (can re-fire)", () => {
    const z = createEncounterZone("auto", { frequency: 0.1 });
    // First boundary
    checkZones([z], 0.11, 0.09);
    // Second boundary
    const fired = checkZones([z], 0.21, 0.19);
    expect(fired).toHaveLength(1);
  });

  it("fires once per boundary even if frame spans multiple", () => {
    // Large frame spanning two boundaries (0.1 and 0.2)
    const z = createEncounterZone("auto", { frequency: 0.1 });
    // floor(0.25/0.1)=2, floor(0.05/0.1)=0 → should fire (2 > 0)
    const fired = checkZones([z], 0.25, 0.05);
    // Only one entry per zone per call (the zone fires but we return one entry)
    expect(fired.length).toBeGreaterThanOrEqual(1);
  });

  it("uses default frequency of 0.1 when missing", () => {
    const z = createEncounterZone("auto");
    delete z.frequency;
    const fired = checkZones([z], 0.11, 0.09);
    expect(fired).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resetZoneTriggers
// ---------------------------------------------------------------------------

describe("resetZoneTriggers", () => {
  it("clears _triggered on all zones", () => {
    const zones = [
      createEncounterZone("explicit", { t: 0.3, _triggered: true }),
      createEncounterZone("explicit", { t: 0.6, _triggered: true })
    ];
    resetZoneTriggers(zones);
    expect(zones[0]._triggered).toBe(false);
    expect(zones[1]._triggered).toBe(false);
  });

  it("is safe with null/empty arrays", () => {
    expect(() => resetZoneTriggers(null)).not.toThrow();
    expect(() => resetZoneTriggers([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildFixedResult
// ---------------------------------------------------------------------------

describe("buildFixedResult", () => {
  it("returns a result with zone label as name when no actor", () => {
    const z = createEncounterZone("fixed", { label: "Ambush", actorId: null });
    const result = buildFixedResult(z);
    expect(result).not.toBeNull();
    expect(result.name).toBe("Ambush");
    expect(result.actorId).toBeNull();
  });

  it("returns null when zone is null", () => {
    expect(buildFixedResult(null)).toBeNull();
  });

  it("looks up actor from game.actors by actorId", () => {
    game.actors = {
      get: vi.fn((id) => id === "actor-1"
        ? { name: "Troll King", img: "icons/troll.png" }
        : undefined
      )
    };
    const z = createEncounterZone("fixed", { actorId: "actor-1" });
    const result = buildFixedResult(z);
    expect(result.name).toBe("Troll King");
    expect(result.img).toBe("icons/troll.png");
    game.actors = { get: vi.fn(), find: vi.fn(), values: () => [] };
  });

  it("falls back to label when actor is not found", () => {
    game.actors = { get: vi.fn(() => undefined) };
    const z = createEncounterZone("fixed", { actorId: "missing", label: "Mystery" });
    const result = buildFixedResult(z);
    expect(result.name).toBe("Mystery");
  });
});

// ---------------------------------------------------------------------------
// broadcastEncounterPause / broadcastEncounterResume
// game.socket.emit is already a vi.fn() from tests/setup.js — use it directly
// and reset call history with vi.clearAllMocks() before each test.
// ---------------------------------------------------------------------------

describe("broadcastEncounterPause", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits ENCOUNTER_PAUSE via game.socket with the routeId", () => {
    broadcastEncounterPause("route-abc");
    expect(game.socket.emit).toHaveBeenCalledOnce();
    const [channel, data] = game.socket.emit.mock.calls[0];
    expect(channel).toMatch(/traveler/i);
    expect(data.type).toBe("TRAVELER_ENCOUNTER_PAUSE");
    expect(data.payload.routeId).toBe("route-abc");
  });

  it("sends a different routeId when called with a different id", () => {
    broadcastEncounterPause("route-xyz");
    const [, data] = game.socket.emit.mock.calls[0];
    expect(data.payload.routeId).toBe("route-xyz");
  });
});

describe("broadcastEncounterResume", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits ENCOUNTER_RESUME via game.socket with the routeId", () => {
    broadcastEncounterResume("route-abc");
    expect(game.socket.emit).toHaveBeenCalledOnce();
    const [channel, data] = game.socket.emit.mock.calls[0];
    expect(channel).toMatch(/traveler/i);
    expect(data.type).toBe("TRAVELER_ENCOUNTER_RESUME");
    expect(data.payload.routeId).toBe("route-abc");
  });

  it("is distinct from ENCOUNTER_PAUSE", () => {
    broadcastEncounterPause("r1");
    const pauseType = game.socket.emit.mock.calls[0][1].type;
    vi.clearAllMocks();
    broadcastEncounterResume("r1");
    const resumeType = game.socket.emit.mock.calls[0][1].type;
    expect(pauseType).not.toBe(resumeType);
  });
});

// ---------------------------------------------------------------------------
// rollTable / createChatMessage / resolveEncounter
// ---------------------------------------------------------------------------

describe("rollTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tableId is empty", async () => {
    expect(await rollTable("")).toBeNull();
  });

  it("returns null and warns when table is not found", async () => {
    game.tables = { get: vi.fn(() => null) };
    ui.notifications.warn = vi.fn();
    expect(await rollTable("missing")).toBeNull();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });

  it("returns normalised result from a world actor draw", async () => {
    const drawResult = {
      results: [{
        type: 2,
        documentId: "actor-1",
        text: "Goblin",
        img: "goblin.png"
      }]
    };
    game.tables = {
      get: vi.fn(() => ({
        name: "Forest Encounters",
        draw: vi.fn(async () => drawResult)
      }))
    };
    game.actors = {
      get: vi.fn(() => ({ name: "Goblin", img: "goblin.png" }))
    };
    const result = await rollTable("table-1");
    expect(result.name).toBe("Goblin");
    expect(result.actorId).toBe("actor-1");
    expect(result.tableName).toBe("Forest Encounters");
  });
});

describe("createChatMessage", () => {
  it("posts a chat message with encounter details", async () => {
    ChatMessage.create = vi.fn(async () => {});
    await createChatMessage(
      { name: "Wolf", img: "wolf.png", tableName: "Forest" },
      { environment: "Forest" }
    );
    expect(ChatMessage.create).toHaveBeenCalled();
    const content = ChatMessage.create.mock.calls[0][0].content;
    expect(content).toMatch(/Wolf/);
    expect(content).toMatch(/Forest/);
  });
});

describe("importActor", () => {
  it("returns existing world actor by actorId", async () => {
    const actor = { id: "a1", name: "Goblin" };
    game.actors = { get: vi.fn(() => actor), find: vi.fn() };
    const result = await importActor({ actorId: "a1" });
    expect(result).toBe(actor);
  });

  it("returns null when compendium info is missing", async () => {
    expect(await importActor({ name: "X" })).toBeNull();
  });

  it("reuses an existing actor in the Random Encounters folder", async () => {
    const folder = { id: "f1" };
    const existing = { id: "a2", name: "Orc", folder };
    game.folders = { find: vi.fn(() => folder) };
    game.actors = {
      get: vi.fn(),
      find: vi.fn((fn) => (fn(existing) ? existing : null))
    };
    const result = await importActor({
      name: "Orc",
      packId: "pack.monsters",
      packDocId: "doc1"
    });
    expect(result).toBe(existing);
  });
});

describe("spawnToken", () => {
  it("returns null when actor or pos is missing", async () => {
    expect(await spawnToken(null, { x: 0, y: 0 })).toBeNull();
    expect(await spawnToken({ id: "a" }, null)).toBeNull();
  });

  it("creates a token offset from the party position", async () => {
    const actor = {
      getTokenDocument: vi.fn(async () => ({
        toObject: () => ({ name: "Goblin" })
      }))
    };
    canvas.scene = {
      ...canvas.scene,
      createEmbeddedDocuments: vi.fn(async () => [{ id: "tok1" }])
    };
    const token = await spawnToken(actor, { x: 100, y: 200 });
    expect(token?.id).toBe("tok1");
    expect(actor.getTokenDocument).toHaveBeenCalledWith(
      expect.objectContaining({ x: 250, y: 200 })
    );
  });
});

describe("openFixedJournal", () => {
  it("opens the journal sheet when journalId is set", async () => {
    const render = vi.fn();
    game.journal = {
      get: vi.fn(() => ({ sheet: { render } }))
    };
    await openFixedJournal({ journalId: "j1" });
    expect(render).toHaveBeenCalledWith(true);
  });

  it("is a no-op when journalId is absent", async () => {
    game.journal = { get: vi.fn() };
    await openFixedJournal({});
    expect(game.journal.get).not.toHaveBeenCalled();
  });
});

describe("createNote", () => {
  it("returns null when canvas scene is unavailable", async () => {
    const saved = canvas.scene;
    canvas.scene = null;
    expect(await createNote({ name: "X" }, { x: 0, y: 0 })).toBeNull();
    canvas.scene = saved;
  });
});
