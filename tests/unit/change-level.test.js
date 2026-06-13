/**
 * Unit tests for TravelerChangeLevelBehavior (scripts/behaviors/change-level.js).
 *
 * Only pure helper methods are tested here (_checkPrerequisites,
 * _resolveTargetElevation).  The async _handleMoveIn method requires a live
 * Foundry runtime with real TokenDocument; that is covered by Quench.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TravelerChangeLevelBehavior } from "../../scripts/behaviors/change-level.js";

// ---------------------------------------------------------------------------
// Factory — builds a minimal behavior instance with given field values
// ---------------------------------------------------------------------------

function makeBehavior(fields = {}) {
  // Bypass DataModel constructor by creating a plain object and delegating
  // to the prototype's methods directly.
  const instance = Object.create(TravelerChangeLevelBehavior.prototype);
  Object.assign(instance, {
    mode:                  "stairs",
    targetLevelId:         null,
    targetElevation:       null,
    requiredStatusEffect:  "",
    requiredItemPattern:   "",
    requiresCheck:         false,
    checkLabel:            "Traversal Check",
    checkFormula:          "1d20",
    checkDC:               10,
    failureDamage:         "",
    allowRetry:            false,
    parent:                null,
    scene:                 canvas.scene,
    ...fields
  });
  return instance;
}

// ---------------------------------------------------------------------------
// _checkPrerequisites
// ---------------------------------------------------------------------------

describe("TravelerChangeLevelBehavior._checkPrerequisites", () => {
  describe("no requirements configured", () => {
    it("returns met:true when actor is null", () => {
      const b = makeBehavior();
      expect(b._checkPrerequisites(null)).toMatchObject({ met: true });
    });

    it("returns met:true when neither status nor item is required", () => {
      const b = makeBehavior();
      const actor = { statuses: new Set(), items: [] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });
  });

  describe("status effect requirement", () => {
    it("passes when actor has the required status", () => {
      const b = makeBehavior({ requiredStatusEffect: "flying" });
      const actor = { name: "Hero", statuses: new Set(["flying"]), items: [] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });

    it("fails when actor lacks the required status", () => {
      const b = makeBehavior({ requiredStatusEffect: "flying" });
      const actor = { name: "Hero", statuses: new Set(["poisoned"]), items: [] };
      const result = b._checkPrerequisites(actor);
      expect(result.met).toBe(false);
      expect(result.reason).toMatch(/flying/);
    });

    it("is case-sensitive (status ids are lowercase in Foundry)", () => {
      const b = makeBehavior({ requiredStatusEffect: "Spider-Climb" });
      const actor = { name: "Hero", statuses: new Set(["spider-climb"]), items: [] };
      // "Spider-Climb" !== "spider-climb" — expect failure
      expect(b._checkPrerequisites(actor).met).toBe(false);
    });

    it("ignores leading/trailing whitespace in the configured value", () => {
      const b = makeBehavior({ requiredStatusEffect: "  flying  " });
      const actor = { name: "Hero", statuses: new Set(["flying"]), items: [] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });
  });

  describe("item pattern requirement", () => {
    const rope  = { name: "Hemp Rope" };
    const sword = { name: "Longsword +1" };

    it("passes when an item name matches the pattern", () => {
      const b = makeBehavior({ requiredItemPattern: "rope" });
      const actor = { name: "Hero", statuses: new Set(), items: [sword, rope] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });

    it("pattern is case-insensitive", () => {
      const b = makeBehavior({ requiredItemPattern: "ROPE" });
      const actor = { name: "Hero", statuses: new Set(), items: [rope] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });

    it("supports regex alternation", () => {
      const b = makeBehavior({ requiredItemPattern: "rope|climber|piton" });
      const grappler = { name: "Climbing Piton" };
      const actor = { name: "Hero", statuses: new Set(), items: [sword, grappler] };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });

    it("fails when no item matches", () => {
      const b = makeBehavior({ requiredItemPattern: "rope" });
      const actor = { name: "Hero", statuses: new Set(), items: [sword] };
      const result = b._checkPrerequisites(actor);
      expect(result.met).toBe(false);
      expect(result.reason).toMatch(/rope/);
    });

    it("returns met:false and a reason on invalid regex", () => {
      const b = makeBehavior({ requiredItemPattern: "[invalid(" });
      const actor = { name: "Hero", statuses: new Set(), items: [] };
      const result = b._checkPrerequisites(actor);
      expect(result.met).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe("combined requirements", () => {
    it("passes only when BOTH status and item are present", () => {
      const b = makeBehavior({ requiredStatusEffect: "flying", requiredItemPattern: "rope" });
      const actor = {
        name: "Hero",
        statuses: new Set(["flying"]),
        items: [{ name: "Hemp Rope" }]
      };
      expect(b._checkPrerequisites(actor)).toMatchObject({ met: true });
    });

    it("fails when status is present but item is missing", () => {
      const b = makeBehavior({ requiredStatusEffect: "flying", requiredItemPattern: "rope" });
      const actor = { name: "Hero", statuses: new Set(["flying"]), items: [] };
      expect(b._checkPrerequisites(actor).met).toBe(false);
    });

    it("fails when item is present but status is missing", () => {
      const b = makeBehavior({ requiredStatusEffect: "flying", requiredItemPattern: "rope" });
      const actor = {
        name: "Hero",
        statuses: new Set(),
        items: [{ name: "Hemp Rope" }]
      };
      expect(b._checkPrerequisites(actor).met).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// _resolveTargetElevation
// ---------------------------------------------------------------------------

describe("TravelerChangeLevelBehavior._resolveTargetElevation", () => {
  it("returns the explicit targetElevation when set", () => {
    const b = makeBehavior({ targetElevation: 30 });
    expect(b._resolveTargetElevation()).toBe(30);
  });

  it("returns 0 as a valid explicit elevation (not treated as falsy)", () => {
    const b = makeBehavior({ targetElevation: 0 });
    expect(b._resolveTargetElevation()).toBe(0);
  });

  it("falls back to the scene level's elevation.bottom when only targetLevelId set", () => {
    const levelId = "level-abc";
    const mockLevel = { elevation: { bottom: 15 } };
    canvas.scene.levels = new Map([[levelId, mockLevel]]);

    const b = makeBehavior({ targetLevelId: levelId, targetElevation: null });
    expect(b._resolveTargetElevation()).toBe(15);
  });

  it("returns null when neither explicit elevation nor a matching level exists", () => {
    canvas.scene.levels = new Map();
    const b = makeBehavior({ targetLevelId: null, targetElevation: null });
    expect(b._resolveTargetElevation()).toBeNull();
  });

  it("prefers explicit targetElevation over targetLevelId", () => {
    const levelId = "level-abc";
    canvas.scene.levels = new Map([[levelId, { elevation: { bottom: 15 } }]]);
    const b = makeBehavior({ targetLevelId: levelId, targetElevation: 99 });
    expect(b._resolveTargetElevation()).toBe(99);
  });

  it("returns null when targetLevelId references a non-existent level", () => {
    canvas.scene.levels = new Map();
    const b = makeBehavior({ targetLevelId: "ghost-level", targetElevation: null });
    expect(b._resolveTargetElevation()).toBeNull();
  });
});
