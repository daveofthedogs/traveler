import { describe, it, expect, vi } from "vitest";
import { PartyCheckCollector } from "../../scripts/apps/party-check-collector.js";
import { PartyCheckSession, createParty } from "../../scripts/party.js";

function makeSession(overrides = {}) {
  return PartyCheckSession.create({
    partyId:     "p1",
    party:       createParty({ name: "Test Party", resolutionMode: "best" }),
    members:     [
      { actorId: "a1", userId: "u1", actorName: "Aria" },
      { actorId: "a2", userId: "u2", actorName: "Brom" }
    ],
    checkConfig: { label: "Cliff Climb", formula: "1d20", dc: 12 },
    tokenDocId:  "tok",
    movementId:  "mov",
    continueKey:  "key",
    ...overrides
  });
}

describe("PartyCheckCollector", () => {
  it("_prepareContext lists pending participants", async () => {
    const session   = makeSession();
    const collector = new PartyCheckCollector({ session });
    const ctx = await collector._prepareContext();

    expect(ctx.partyName).toBe("Test Party");
    expect(ctx.checkLabel).toBe("Cliff Climb");
    expect(ctx.dc).toBe(12);
    expect(ctx.rows).toHaveLength(2);
    expect(ctx.rows.every((r) => r.status === "pending")).toBe(true);
    expect(ctx.allDone).toBe(false);

    PartyCheckSession.remove(session.id);
  });

  it("_prepareContext reflects rolled results", async () => {
    const session = makeSession();
    session.addResult({ actorId: "a1", total: 14, passed: true,  cancelled: false });
    session.addResult({ actorId: "a2", total: 8,  passed: false, cancelled: false });

    const collector = new PartyCheckCollector({ session });
    const ctx = await collector._prepareContext();

    expect(ctx.allDone).toBe(true);
    expect(ctx.rows.find((r) => r.actorId === "a1").statusLabel).toMatch(/Pass/);
    expect(ctx.rows.find((r) => r.actorId === "a2").statusLabel).toMatch(/Fail/);

    PartyCheckSession.remove(session.id);
  });

  it("forceResolve triggers session settlement via collector button handler", () => {
    const session   = makeSession();
    const collector = new PartyCheckCollector({ session });
    collector._onForceResolve();
    expect(session.resolved).toBe(true);
    PartyCheckSession.remove(session.id);
  });

  it("refresh re-renders without throwing", () => {
    const session   = makeSession();
    const collector = new PartyCheckCollector({ session });
    collector.render = vi.fn();
    collector.refresh();
    expect(collector.render).toHaveBeenCalledWith({ force: false });
    PartyCheckSession.remove(session.id);
  });
});
