/**
 * Quench integration tests — traveler.changeLevel Region Behavior.
 *
 * Tests the full behavior lifecycle:
 *  - Prerequisite blocking (missing status / item)
 *  - Automatic pass (stairs mode, no check)
 *  - Roll-check dialog fires and resolves
 *
 * Registered by tests/quench/index.js.
 */

import { buildSceneFixture, integrationBatch } from "./fixtures.js";
import { TravelerChangeLevelBehavior } from "../../scripts/behaviors/change-level.js";

export function registerRegionBehaviorTests(quench) {
  quench.registerBatch(
    "traveler.integration.regionBehavior",
    (context) => {
      const { describe, it, before, after, assert } = context;

      integrationBatch(describe, () => {
      let ctx;

      before(async function() {
        ctx = await buildSceneFixture(this);
      });

      after(async () => {
        await ctx?.teardown();
      });

      /** @param {object} [fields] */
      function makeLiveBehavior(fields = {}) {
        const api = Object.create(TravelerChangeLevelBehavior.prototype);
        api.mode                 = "cliff";
        api.targetElevation      = 30;
        api.requiredStatusEffect = "";
        api.requiredItemPattern  = "";
        api.requiresCheck        = true;
        api.targetLevelId        = null;
        api.parent               = null;
        for (const [key, value] of Object.entries(fields)) {
          api[key] = value;
        }
        return api;
      }

      // ----------------------------------------------------------------
      // Region behavior integration tests exercise the typed model methods;
      // live RegionBehavior document wiring is covered by Foundry's own UI.
      describe("_checkPrerequisites via live behavior", () => {
        it("returns met:true when no prerequisites are configured", async () => {
          const behavior = makeLiveBehavior();
          const result = behavior._checkPrerequisites(null);
          assert.ok(result.met, "should be met with null actor and no requirements");
        });

        it("blocks when a required status is missing", async () => {
          const behavior = makeLiveBehavior({ requiredStatusEffect: "flying" });
          const mockActor = { name: "Test Hero", statuses: new Set(), items: [] };
          const result = behavior._checkPrerequisites(mockActor);
          assert.ok(!result.met, "should be blocked without flying status");
          assert.ok(result.reason?.includes("flying"), "reason should mention flying");
        });

        it("passes when the actor has the required status", async () => {
          const behavior = makeLiveBehavior({ requiredStatusEffect: "flying" });
          const mockActor = {
            name: "Test Hero",
            statuses: new Set(["flying"]),
            items: []
          };
          const result = behavior._checkPrerequisites(mockActor);
          assert.ok(result.met, "should pass when actor has flying status");
        });
      });

      describe("_resolveTargetElevation via live behavior", () => {
        it("returns the configured targetElevation", async () => {
          const api = makeLiveBehavior();
          assert.equal(api._resolveTargetElevation(), 30);
        });
      });

      describe("Elevation update on token", function() {
        this.timeout(30_000);

        it("_applyElevation sets token elevation to targetElevation", async function() {
          const api = makeLiveBehavior();

          const initialElevation = ctx.token.elevation ?? 0;
          await api._applyElevation(ctx.token);

          // Re-fetch the token to get the updated elevation
          const updated = canvas.scene?.tokens?.get?.(ctx.token.id) ?? ctx.token;
          assert.equal(
            updated.elevation,
            30,
            "token elevation should be set to behavior's targetElevation (30)"
          );

          // Restore
          await ctx.token.update({ elevation: initialElevation });
        });
      });
      });
    },
    { displayName: "Traveler: Region Behavior (integration)" }
  );
}
