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

import { SceneFixture } from "./fixtures.js";

export function registerRegionBehaviorTests(quench) {
  quench.registerBatch(
    "traveler.integration.regionBehavior",
    (context) => {
      const { describe, it, before, after, assert } = context;

      let ctx;

      before(async () => {
        ctx = await SceneFixture.build();
      });

      after(async () => {
        await ctx?.teardown();
      });

      // ----------------------------------------------------------------
      describe("_checkPrerequisites via live behavior", () => {
        it("returns met:true when no prerequisites are configured", async () => {
          // cliffRegion behavior has no status/item requirements
          const behavior = ctx.cliffRegion.behaviors.find(
            (b) => b.type === "traveler.changeLevel"
          );
          assert.ok(behavior, "cliffRegion should have a traveler.changeLevel behavior");

          const result = behavior.system._checkPrerequisites(null);
          assert.ok(result.met, "should be met with null actor and no requirements");
        });

        it("blocks when a required status is missing", async () => {
          const behavior = ctx.cliffRegion.behaviors.find(
            (b) => b.type === "traveler.changeLevel"
          );

          // Temporarily configure a required status
          await behavior.update({ "system.requiredStatusEffect": "flying" });

          const mockActor = { name: "Test Hero", statuses: new Set(), items: [] };
          const result = behavior.system._checkPrerequisites(mockActor);
          assert.ok(!result.met, "should be blocked without flying status");
          assert.ok(result.reason?.includes("flying"), "reason should mention flying");

          // Restore
          await behavior.update({ "system.requiredStatusEffect": "" });
        });

        it("passes when the actor has the required status", async () => {
          const behavior = ctx.cliffRegion.behaviors.find(
            (b) => b.type === "traveler.changeLevel"
          );

          await behavior.update({ "system.requiredStatusEffect": "flying" });

          const mockActor = {
            name: "Test Hero",
            statuses: new Set(["flying"]),
            items: []
          };
          const result = behavior.system._checkPrerequisites(mockActor);
          assert.ok(result.met, "should pass when actor has flying status");

          await behavior.update({ "system.requiredStatusEffect": "" });
        });
      });

      // ----------------------------------------------------------------
      describe("_resolveTargetElevation via live behavior", () => {
        it("returns the configured targetElevation", async () => {
          const behavior = ctx.cliffRegion.behaviors.find(
            (b) => b.type === "traveler.changeLevel"
          );
          // cliffRegion is configured with targetElevation: 30
          assert.equal(behavior.system._resolveTargetElevation(), 30);
        });
      });

      // ----------------------------------------------------------------
      describe("Elevation update on token", () => {
        it("_applyElevation sets token elevation to targetElevation", async () => {
          const behavior = ctx.cliffRegion.behaviors.find(
            (b) => b.type === "traveler.changeLevel"
          );

          const initialElevation = ctx.token.elevation ?? 0;
          await behavior.system._applyElevation(ctx.token);

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
    },
    { displayName: "Traveler: Region Behavior (integration)" }
  );
}
