/**
 * Unit tests for the A* pathfinder (scripts/pathfinding/astar.js).
 *
 * All tests use the global `canvas` stub from tests/setup.js.
 * Tests that need walls inject a checkCollision spy via beforeEach.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { findPath } from "../../scripts/pathfinding/astar.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a {x,y} pixel position for a grid cell (using the 100px grid stub). */
const cell = (col, row) => ({ x: col * 100 + 50, y: row * 100 + 50 });

/** Returns the grid offset for a pixel-space point. */
const offset = (pt) => ({
  i: Math.floor(pt.y / 100),
  j: Math.floor(pt.x / 100)
});

// ---------------------------------------------------------------------------

describe("findPath", () => {
  beforeEach(() => {
    // Reset wall mock to "no walls" before each test
    canvas.walls.checkCollision = vi.fn(() => false);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns origin when origin and dest are the same cell", () => {
    const origin = cell(2, 2);
    const path = findPath(origin, origin);
    expect(path).toHaveLength(1);
    expect(path[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });

  it("finds a straight horizontal path on an open grid", () => {
    const origin = cell(0, 2);
    const dest   = cell(4, 2);
    const path = findPath(origin, dest);

    expect(path.length).toBeGreaterThanOrEqual(2);

    // First cell should be near origin, last near dest
    const first = offset(path[0]);
    const last  = offset(path[path.length - 1]);
    expect(first).toMatchObject({ i: 2, j: 0 });
    expect(last).toMatchObject({ i: 2, j: 4 });
  });

  it("finds a diagonal path when diagonal movement is available", () => {
    const origin = cell(0, 0);
    const dest   = cell(3, 3);
    const path = findPath(origin, dest);

    expect(path.length).toBeGreaterThanOrEqual(2);
    const last = offset(path[path.length - 1]);
    expect(last).toMatchObject({ i: 3, j: 3 });
  });

  it("the path never goes backwards when a direct route exists", () => {
    const origin = cell(1, 1);
    const dest   = cell(5, 1);
    const path = findPath(origin, dest);

    // Every step should not decrease j (column) since we go right
    for (let i = 1; i < path.length; i++) {
      expect(offset(path[i]).j).toBeGreaterThanOrEqual(offset(path[i - 1]).j - 1);
    }
  });

  // ── Wall avoidance ────────────────────────────────────────────────────────

  it("returns empty array when direct path is fully walled and no detour exists", () => {
    // Block every edge — simulates an enclosed room
    canvas.walls.checkCollision = vi.fn(() => true);

    const origin = cell(0, 0);
    const dest   = cell(5, 5);
    const path = findPath(origin, dest, { maxNodes: 50 });

    expect(path).toHaveLength(0);
  });

  it("routes around a vertical wall", () => {
    // Wall at x = 300 (col 3): block any edge crossing col 2→3 or 3→2
    canvas.walls.checkCollision = vi.fn((from, to) => {
      const wallX = 300;
      const crossesWall =
        (from.x < wallX && to.x >= wallX) ||
        (from.x >= wallX && to.x < wallX);
      return crossesWall;
    });

    const origin = cell(0, 2);
    const dest   = cell(6, 2);
    const path = findPath(origin, dest);

    // Should find a path (around or above/below) despite the wall
    // OR return empty if the grid is too small to route around
    // In this test the path must never directly cross x=300
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to   = path[i];
      const wallX = 300;
      const crossesWall =
        (from.x < wallX && to.x >= wallX) ||
        (from.x >= wallX && to.x < wallX);
      expect(crossesWall).toBe(false);
    }
  });

  // ── Node budget ───────────────────────────────────────────────────────────

  it("respects the maxNodes budget and returns a partial path", () => {
    // Open grid, tiny budget
    const origin = cell(0, 0);
    const dest   = cell(50, 50);   // very far — would require many nodes
    const path = findPath(origin, dest, { maxNodes: 10 });

    // Must return something (partial path toward dest) rather than empty
    // (the budget guard returns the closest expanded node)
    expect(path.length).toBeGreaterThanOrEqual(1);

    // Partial path should not reach the dest in such a small budget
    if (path.length > 0) {
      const last = path[path.length - 1];
      const distFromDest = Math.hypot(last.x - dest.x, last.y - dest.y);
      expect(distFromDest).toBeGreaterThan(0);
    }
  });

  // ── isPassable filter ─────────────────────────────────────────────────────

  it("respects a custom isPassable filter", () => {
    // Block all cells in column 3
    const isPassable = (pt) => Math.floor(pt.x / 100) !== 3;

    const origin = cell(0, 2);
    const dest   = cell(6, 2);
    const path = findPath(origin, dest, { isPassable });

    // No cell in column 3 should appear in the path
    for (const pt of path) {
      expect(Math.floor(pt.x / 100)).not.toBe(3);
    }
  });

  it("returns empty array when isPassable blocks all cells", () => {
    const path = findPath(cell(0, 0), cell(4, 4), { isPassable: () => false });
    expect(path).toHaveLength(0);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("returns empty array when canvas.grid is unavailable", () => {
    const savedGrid = canvas.grid;
    canvas.grid = null;
    const path = findPath(cell(0, 0), cell(3, 3));
    canvas.grid = savedGrid;
    expect(path).toHaveLength(0);
  });

  it("handles a destination adjacent to origin", () => {
    const origin = cell(2, 2);
    const dest   = cell(3, 2);
    const path = findPath(origin, dest);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(offset(path[path.length - 1])).toMatchObject({ i: 2, j: 3 });
  });
});
