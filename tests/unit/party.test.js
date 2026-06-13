/**
 * Unit tests for the Party System (scripts/party.js).
 *
 * Tests cover pure logic only: factory, resolution modes, session lifecycle.
 * Network/Foundry interactions (saveParties, getPartyMemberUsers) rely on
 * the global mocks in tests/setup.js.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createParty,
  getParties,
  saveParties,
  getPartyForToken,
  getPartyMemberUsers,
  isPartyMember,
  resolvePartyCheck,
  PartyCheckSession,
  RESOLUTION_MODES,
  TRAVEL_PACE_MODES
} from "../../scripts/party.js";

// ---------------------------------------------------------------------------
// createParty
// ---------------------------------------------------------------------------

describe("createParty", () => {
  it("returns an object with required fields", () => {
    const p = createParty();
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("name");
    expect(p).toHaveProperty("partyTokenActorId");
    expect(p).toHaveProperty("memberActorIds");
    expect(p).toHaveProperty("resolutionMode");
    expect(p).toHaveProperty("travelPaceMode");
  });

  it("generates a unique id each call", () => {
    expect(createParty().id).not.toBe(createParty().id);
  });

  it("applies overrides", () => {
    const p = createParty({ name: "Test Party", resolutionMode: "all" });
    expect(p.name).toBe("Test Party");
    expect(p.resolutionMode).toBe("all");
  });

  it("defaults to empty memberActorIds array", () => {
    expect(createParty().memberActorIds).toEqual([]);
  });

  it("defaults resolutionMode to 'best'", () => {
    expect(createParty().resolutionMode).toBe("best");
  });
});

// ---------------------------------------------------------------------------
// RESOLUTION_MODES / TRAVEL_PACE_MODES constants
// ---------------------------------------------------------------------------

describe("RESOLUTION_MODES", () => {
  it("has all four expected keys", () => {
    expect(Object.keys(RESOLUTION_MODES)).toEqual(
      expect.arrayContaining(["all", "best", "majority", "designated"])
    );
  });
});

describe("TRAVEL_PACE_MODES", () => {
  it("has all three expected keys", () => {
    expect(Object.keys(TRAVEL_PACE_MODES)).toEqual(
      expect.arrayContaining(["slowest", "average", "fastest"])
    );
  });
});

// ---------------------------------------------------------------------------
// getPartyForToken
// ---------------------------------------------------------------------------

describe("getPartyForToken", () => {
  beforeEach(() => {
    // Stub game.settings.get to return a specific party list
    game.settings.get = vi.fn((mod, key) => {
      if (key === "parties") {
        return [
          createParty({ id: "p1", partyTokenActorId: "actor-token-1" }),
          createParty({ id: "p2", partyTokenActorId: "actor-token-2" })
        ];
      }
      return undefined;
    });
  });

  it("returns the party matching the token's actorId", () => {
    const tokenDoc = { actorId: "actor-token-1" };
    const party = getPartyForToken(tokenDoc);
    expect(party).not.toBeNull();
    expect(party.id).toBe("p1");
  });

  it("returns null when no party matches", () => {
    const tokenDoc = { actorId: "actor-unknown" };
    expect(getPartyForToken(tokenDoc)).toBeNull();
  });

  it("returns null for a null tokenDoc", () => {
    expect(getPartyForToken(null)).toBeNull();
  });

  it("falls back to token.actor.id when actorId is absent", () => {
    const tokenDoc = { actor: { id: "actor-token-2" } };
    const party = getPartyForToken(tokenDoc);
    expect(party?.id).toBe("p2");
  });
});

// ---------------------------------------------------------------------------
// getPartyMemberUsers
// ---------------------------------------------------------------------------

describe("getPartyMemberUsers", () => {
  beforeEach(() => {
    // Set up mock actors and users
    const mockActors = [
      {
        id: "actor-a",
        name: "Aria",
        testUserPermission: vi.fn((u) => u.id === "user-1")
      },
      {
        id: "actor-b",
        name: "Brom",
        testUserPermission: vi.fn((u) => u.id === "user-2")
      },
      {
        id: "actor-no-owner",
        name: "NPC",
        testUserPermission: vi.fn(() => false)
      }
    ];
    game.actors = {
      get: vi.fn((id) => mockActors.find((a) => a.id === id)),
      find: vi.fn((fn) => mockActors.find(fn)),
      contents: mockActors,
      values: () => mockActors
    };
    game.users = [
      { id: "user-1", isGM: false, active: true },
      { id: "user-2", isGM: false, active: true },
      { id: "gm-user", isGM: true,  active: true }
    ];
    game.users.find = (fn) => game.users.slice().find(fn);
  });

  it("returns member descriptors for actors with active non-GM owners", () => {
    const party = createParty({ memberActorIds: ["actor-a", "actor-b"] });
    const members = getPartyMemberUsers(party);
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ actorId: "actor-a", userId: "user-1", actorName: "Aria" });
    expect(members[1]).toMatchObject({ actorId: "actor-b", userId: "user-2", actorName: "Brom" });
  });

  it("omits actors with no non-GM owner", () => {
    const party = createParty({ memberActorIds: ["actor-no-owner"] });
    expect(getPartyMemberUsers(party)).toHaveLength(0);
  });

  it("omits actors not found in game.actors", () => {
    const party = createParty({ memberActorIds: ["missing-id"] });
    expect(getPartyMemberUsers(party)).toHaveLength(0);
  });

  it("returns empty array for empty memberActorIds", () => {
    expect(getPartyMemberUsers(createParty())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isPartyMember
// ---------------------------------------------------------------------------

describe("isPartyMember", () => {
  beforeEach(() => {
    game.settings.get = vi.fn((mod, key) =>
      key === "parties"
        ? [createParty({ id: "p1", partyTokenActorId: "actor-pt", memberActorIds: ["actor-a"] })]
        : undefined
    );
    game.actors = {
      get: vi.fn((id) => {
        if (id === "actor-a") return { id: "actor-a", name: "Aria", testUserPermission: (u) => u.id === "user-1" };
        return undefined;
      })
    };
    game.users = [{ id: "user-1", isGM: false, active: true }];
    game.users.find = (fn) => game.users.slice().find(fn);
  });

  it("returns true when user is a member of the party for this token", () => {
    const tokenDoc = { actorId: "actor-pt" };
    expect(isPartyMember("user-1", tokenDoc)).toBe(true);
  });

  it("returns false when user is not a member", () => {
    const tokenDoc = { actorId: "actor-pt" };
    expect(isPartyMember("user-999", tokenDoc)).toBe(false);
  });

  it("returns false when token is not a party token", () => {
    expect(isPartyMember("user-1", { actorId: "some-other-actor" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePartyCheck
// ---------------------------------------------------------------------------

describe("resolvePartyCheck — mode: all", () => {
  it("passes when all participants passed", () => {
    const p = [
      { actorId: "a", passed: true,  cancelled: false },
      { actorId: "b", passed: true,  cancelled: false }
    ];
    expect(resolvePartyCheck(p, "all")).toBe(true);
  });

  it("fails when any participant failed", () => {
    const p = [
      { actorId: "a", passed: true,  cancelled: false },
      { actorId: "b", passed: false, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "all")).toBe(false);
  });

  it("treats cancelled as failure", () => {
    const p = [
      { actorId: "a", passed: true, cancelled: false },
      { actorId: "b", passed: true, cancelled: true  }
    ];
    expect(resolvePartyCheck(p, "all")).toBe(false);
  });
});

describe("resolvePartyCheck — mode: best", () => {
  it("passes when any participant passed", () => {
    const p = [
      { actorId: "a", passed: false, cancelled: false },
      { actorId: "b", passed: true,  cancelled: false }
    ];
    expect(resolvePartyCheck(p, "best")).toBe(true);
  });

  it("fails when all participants failed", () => {
    const p = [
      { actorId: "a", passed: false, cancelled: false },
      { actorId: "b", passed: false, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "best")).toBe(false);
  });
});

describe("resolvePartyCheck — mode: majority", () => {
  it("passes when strictly more than half pass (3/4)", () => {
    const p = [
      { actorId: "a", passed: true,  cancelled: false },
      { actorId: "b", passed: true,  cancelled: false },
      { actorId: "c", passed: true,  cancelled: false },
      { actorId: "d", passed: false, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "majority")).toBe(true);
  });

  it("fails when exactly half pass (2/4)", () => {
    const p = [
      { actorId: "a", passed: true,  cancelled: false },
      { actorId: "b", passed: true,  cancelled: false },
      { actorId: "c", passed: false, cancelled: false },
      { actorId: "d", passed: false, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "majority")).toBe(false);
  });

  it("passes with odd number (2/3)", () => {
    const p = [
      { actorId: "a", passed: true,  cancelled: false },
      { actorId: "b", passed: true,  cancelled: false },
      { actorId: "c", passed: false, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "majority")).toBe(true);
  });
});

describe("resolvePartyCheck — mode: designated", () => {
  const participants = [
    { actorId: "leader", passed: true,  cancelled: false },
    { actorId: "other",  passed: false, cancelled: false }
  ];

  it("passes when the designated actor passed (ignoring others)", () => {
    expect(resolvePartyCheck(participants, "designated", "leader")).toBe(true);
  });

  it("fails when the designated actor failed (even if others passed)", () => {
    const p = [
      { actorId: "leader", passed: false, cancelled: false },
      { actorId: "other",  passed: true,  cancelled: false }
    ];
    expect(resolvePartyCheck(p, "designated", "leader")).toBe(false);
  });

  it("returns false when designatedActorId does not match any participant", () => {
    expect(resolvePartyCheck(participants, "designated", "missing-id")).toBe(false);
  });
});

describe("resolvePartyCheck — edge cases", () => {
  it("returns false for empty participants array", () => {
    expect(resolvePartyCheck([], "best")).toBe(false);
  });

  it("returns false for null participants", () => {
    expect(resolvePartyCheck(null, "best")).toBe(false);
  });

  it("unknown mode falls back to 'best' behaviour", () => {
    const p = [
      { actorId: "a", passed: true, cancelled: false }
    ];
    expect(resolvePartyCheck(p, "unknown-mode")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PartyCheckSession
// ---------------------------------------------------------------------------

describe("PartyCheckSession", () => {
  const makeSession = () => PartyCheckSession.create({
    partyId: "p1",
    party:   createParty({ resolutionMode: "best" }),
    members: [
      { actorId: "actor-a", userId: "user-1", actorName: "Aria" },
      { actorId: "actor-b", userId: "user-2", actorName: "Brom" }
    ],
    checkConfig:  { label: "Climb", formula: "1d20", dc: 12 },
    tokenDocId:   "tok-1",
    movementId:   "mov-1",
    continueKey:  "key-1"
  });

  it("creates a session with the correct participants", () => {
    const s = makeSession();
    expect(s.participants).toHaveLength(2);
    expect(s.participants[0].status).toBe("pending");
    PartyCheckSession.remove(s.id);
  });

  it("is retrievable via PartyCheckSession.get()", () => {
    const s = makeSession();
    expect(PartyCheckSession.get(s.id)).toBe(s);
    PartyCheckSession.remove(s.id);
  });

  it("is removed after PartyCheckSession.remove()", () => {
    const s = makeSession();
    PartyCheckSession.remove(s.id);
    expect(PartyCheckSession.get(s.id)).toBeUndefined();
  });

  it("resolves the promise when all participants have rolled", async () => {
    const s = makeSession();
    s.addResult({ actorId: "actor-a", total: 15, passed: true,  cancelled: false });
    s.addResult({ actorId: "actor-b", total: 8,  passed: false, cancelled: false });
    const results = await s.promise;
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.actorId === "actor-a").passed).toBe(true);
    expect(results.find((r) => r.actorId === "actor-b").passed).toBe(false);
    PartyCheckSession.remove(s.id);
  });

  it("does not resolve early when only one of two has rolled", () => {
    const s = makeSession();
    let resolved = false;
    s.promise.then(() => { resolved = true; });
    s.addResult({ actorId: "actor-a", total: 15, passed: true, cancelled: false });
    // Give microtask queue a tick
    return new Promise((resolve) => setTimeout(() => {
      expect(resolved).toBe(false);
      PartyCheckSession.remove(s.id);
      resolve();
    }, 0));
  });

  it("forceResolve marks pending participants as timeout failures", async () => {
    const s = makeSession();
    s.addResult({ actorId: "actor-a", total: 18, passed: true, cancelled: false });
    s.forceResolve();
    const results = await s.promise;
    const b = results.find((r) => r.actorId === "actor-b");
    expect(b.status).toBe("timeout");
    expect(b.cancelled).toBe(true);
    PartyCheckSession.remove(s.id);
  });

  it("resolves only once even if called multiple times", async () => {
    const s = makeSession();
    let callCount = 0;
    s.promise.then(() => callCount++);
    s.forceResolve();
    s.forceResolve();
    await s.promise;
    await new Promise((r) => setTimeout(r, 0));
    expect(callCount).toBe(1);
    PartyCheckSession.remove(s.id);
  });
});
