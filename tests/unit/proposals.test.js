/**
 * Unit tests for ProposalStore (scripts/proposals.js).
 *
 * Pure in-memory state — no Foundry runtime required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ProposalStore } from "../../scripts/proposals.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeProposal = (overrides = {}) => ({
  id:          `p-${Math.random().toString(36).slice(2)}`,
  userId:      "user-1",
  playerName:  "Alice",
  tokenId:     "token-1",
  tokenName:   "Rogue",
  sceneId:     "scene-1",
  path:        [{ x: 100, y: 100 }, { x: 200, y: 200 }],
  settings:    {},
  elevations:  null,
  submittedAt: Date.now(),
  ...overrides
});

// ---------------------------------------------------------------------------

describe("ProposalStore", () => {
  beforeEach(() => {
    ProposalStore.clear();
  });

  it("starts empty", () => {
    expect(ProposalStore.size).toBe(0);
    expect(ProposalStore.getAll()).toHaveLength(0);
  });

  it("add() stores a proposal and increments size", () => {
    const p = makeProposal();
    ProposalStore.add(p);
    expect(ProposalStore.size).toBe(1);
  });

  it("get() retrieves a proposal by id", () => {
    const p = makeProposal({ id: "known-id" });
    ProposalStore.add(p);
    expect(ProposalStore.get("known-id")).toBe(p);
  });

  it("get() returns undefined for unknown id", () => {
    expect(ProposalStore.get("nope")).toBeUndefined();
  });

  it("getAll() returns all proposals", () => {
    const p1 = makeProposal();
    const p2 = makeProposal();
    ProposalStore.add(p1);
    ProposalStore.add(p2);
    const all = ProposalStore.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(p1);
    expect(all).toContain(p2);
  });

  it("remove() deletes a proposal by id", () => {
    const p = makeProposal({ id: "del-me" });
    ProposalStore.add(p);
    ProposalStore.remove("del-me");
    expect(ProposalStore.size).toBe(0);
    expect(ProposalStore.get("del-me")).toBeUndefined();
  });

  it("remove() is a no-op for unknown id", () => {
    ProposalStore.add(makeProposal());
    ProposalStore.remove("does-not-exist");
    expect(ProposalStore.size).toBe(1);
  });

  it("clear() removes all proposals", () => {
    ProposalStore.add(makeProposal());
    ProposalStore.add(makeProposal());
    ProposalStore.clear();
    expect(ProposalStore.size).toBe(0);
    expect(ProposalStore.getAll()).toHaveLength(0);
  });

  it("add() with duplicate id overwrites the previous entry", () => {
    const original = makeProposal({ id: "dup", playerName: "Alice" });
    const updated  = makeProposal({ id: "dup", playerName: "Bob" });
    ProposalStore.add(original);
    ProposalStore.add(updated);
    expect(ProposalStore.size).toBe(1);
    expect(ProposalStore.get("dup")?.playerName).toBe("Bob");
  });

  it("getAll() returns a snapshot array (not a live reference)", () => {
    const p = makeProposal();
    ProposalStore.add(p);
    const snap = ProposalStore.getAll();
    ProposalStore.clear();
    // The snapshot should still have the item
    expect(snap).toHaveLength(1);
  });
});
