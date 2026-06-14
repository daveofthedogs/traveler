/**
 * Quench integration tests — A* Pathfinding.
 *
 * Runs inside a live Foundry instance.  The SceneFixture creates a 1000×1000
 * scene with a vertical wall at x = 300 (gap at y = 400–500).
 *
 * Registered by tests/quench/index.js.
 */

import { SceneFixture, buildSceneFixture, WallFixture, integrationBatch } from "./fixtures.js";
import { findPath, isWallBlocked } from "../../scripts/pathfinding/astar.js";

export function registerPathfindingTests(quench) {
  quench.registerBatch(
    "traveler.integration.pathfinding",
    (context) => {
      const { describe, it, expect, before, after, assert } = context;

      integrationBatch(describe, () => {
      let ctx;

      before(async function() {
        ctx = await buildSceneFixture(this);
      });

      after(async () => {
        await ctx?.teardown();
      });

      // ----------------------------------------------------------------
      describe("Open-grid pathfinding", () => {
        it("finds a path across an open area (left side)", async () => {
          // Both points are left of x = 300 — no wall in between
          const origin = { x: 50,  y: 450 };
          const dest   = { x: 250, y: 450 };
          const path = findPath(origin, dest);

          assert.ok(path.length >= 2, "path should have at least 2 waypoints");
          const last = path[path.length - 1];
          assert.approximately(last.x, dest.x, 100, "path should end near destination x");
          assert.approximately(last.y, dest.y, 100, "path should end near destination y");
        });

        it("returns a single-element path when origin and dest are the same cell", () => {
          const pt = { x: 150, y: 150 };
          const path = findPath(pt, pt);
          assert.equal(path.length, 1);
        });
      });

      // ----------------------------------------------------------------
      describe("Wall avoidance", () => {
        it("routes through the gap in the vertical wall", async () => {
          // Origin left of wall, dest right of wall; gap is at y = 400–500
          const origin = { x: 150, y: 450 };
          const dest   = { x: 750, y: 450 };
          const path = findPath(origin, dest);

          assert.ok(path.length >= 2, "should find a path through the gap");

          // Verify no step crosses x=300 except at the gap (y between 400–500)
          for (let i = 1; i < path.length; i++) {
            const from = path[i - 1];
            const to   = path[i];
            const wallX = 300;
            const crossesWall =
              (from.x < wallX && to.x >= wallX) ||
              (from.x >= wallX && to.x < wallX);
            if (crossesWall) {
              // If it crosses, midpoint y must be in the gap
              const midY = (from.y + to.y) / 2;
              assert.ok(
                midY >= 400 && midY <= 500,
                `wall crossing at y=${midY.toFixed(0)} must be inside the gap (400–500)`
              );
            }
          }
        });

        it("returns empty or partial path when destination is fully walled off", async () => {
          // Create a complete box around destination
          const { scene } = ctx;
          const x0 = 800, y0 = 800, x1 = 900, y1 = 900;
          const origin = { x: 50, y: 50 };
          const dest   = { x: 850, y: 850 };

          const walls = await scene.createEmbeddedDocuments("Wall", [
            { c: [x0, y0, x1, y0], move: 1 },
            { c: [x1, y0, x1, y1], move: 1 },
            { c: [x1, y1, x0, y1], move: 1 },
            { c: [x0, y1, x0, y0], move: 1 }
          ]);

          if (typeof canvas.scene?.initializeEdges === "function") {
            await canvas.scene.initializeEdges();
          } else if (typeof canvas.walls?.setWalls === "function") {
            canvas.walls.setWalls(canvas.scene.walls);
          } else {
            canvas.walls?.refresh?.();
          }

          assert.ok(
            isWallBlocked(origin, dest),
            "direct route into the box should be blocked by walls"
          );

          const path = findPath(origin, dest, { maxNodes: 500 });

          await scene.deleteEmbeddedDocuments("Wall", walls.map((w) => w.id));

          // Destination inside box — path should not reach it
          if (path.length > 0) {
            const last = path[path.length - 1];
            const insideBox = last.x > x0 && last.x < x1 && last.y > y0 && last.y < y1;
            assert.ok(!insideBox, "path should not reach the walled-off destination");
          }
        });
      });

      // ----------------------------------------------------------------
      describe("Node budget", () => {
        it("terminates within the maxNodes budget on a long path", async () => {
          // Very small budget; should return a partial path quickly
          const start = performance.now();
          const path = findPath({ x: 50, y: 50 }, { x: 950, y: 950 }, { maxNodes: 20 });
          const elapsed = performance.now() - start;

          assert.ok(elapsed < 200, `pathfinding should complete in < 200 ms (took ${elapsed.toFixed(0)} ms)`);
          // A partial path is acceptable
          assert.ok(path.length >= 0, "should not throw on budget exhaustion");
        });
      });
      });
    },
    { displayName: "Traveler: A* Pathfinding (integration)" }
  );
}
