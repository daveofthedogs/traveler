/**
 * Quench integration tests — World Clock & Scene Distance Override.
 *
 * Tests advanceClock against a live Foundry instance:
 *  - worldClockEnabled setting gates the feature
 *  - game.time.worldTime advances by the correct amount
 *  - scene flag override is read by getSceneDistanceConfig
 */

import { SceneFixture, buildSceneFixture } from "./fixtures.js";
import { computeTravelSeconds, formatTravelDuration, advanceClock } from "../../scripts/clock.js";
import { getSceneDistanceConfig } from "../../scripts/settings.js";
import { MODULE_ID } from "../../scripts/settings.js";

export function registerClockTests(quench) {
  quench.registerBatch(
    "traveler.integration.clock",
    (context) => {
      const { describe, it, before, after, assert } = context;

      let ctx;

      before(async function() {
        ctx = await buildSceneFixture(this);
      });

      after(async () => {
        await ctx?.teardown();
        // Ensure clock setting is off after tests
        try {
          await game.settings.set(MODULE_ID, "worldClockEnabled", false);
        } catch {}
      });

      // ----------------------------------------------------------------
      describe("computeTravelSeconds (smoke)", () => {
        it("returns a positive number for valid inputs", () => {
          const s = computeTravelSeconds(500, 100, 5, 3);
          assert.ok(s > 0, "should return positive seconds");
        });

        it("returns 0 for zero path length", () => {
          assert.equal(computeTravelSeconds(0, 100, 5, 3), 0);
        });
      });

      // ----------------------------------------------------------------
      describe("formatTravelDuration (smoke)", () => {
        it("returns a non-empty string", () => {
          const label = formatTravelDuration(7200);
          assert.ok(typeof label === "string" && label.length > 0);
        });
      });

      // ----------------------------------------------------------------
      describe("advanceClock — disabled by default", () => {
        it("does not advance time when worldClockEnabled is false", async () => {
          await game.settings.set(MODULE_ID, "worldClockEnabled", false);
          const before = game.time.worldTime;
          await advanceClock(10000, "horseback");
          const after = game.time.worldTime;
          assert.equal(before, after, "time should not change when disabled");
        });
      });

      // ----------------------------------------------------------------
      describe("advanceClock — enabled", () => {
        it("advances worldTime by the correct number of seconds", async () => {
          await game.settings.set(MODULE_ID, "worldClockEnabled", true);

          // 1000 px, scene grid size/distance, walk-normal 3 mph
          const { distancePerSquare } = getSceneDistanceConfig(canvas.scene);
          const expected = computeTravelSeconds(1000, canvas.grid.size, distancePerSquare, 3);
          const timeBefore = game.time.worldTime;

          await advanceClock(1000, "walk-normal");

          const timeAfter = game.time.worldTime;
          const delta = timeAfter - timeBefore;

          // Allow ±5 s rounding tolerance
          assert.ok(
            Math.abs(delta - expected) <= 5,
            `Expected delta ~${expected}s, got ${delta}s`
          );

          // Restore
          await game.settings.set(MODULE_ID, "worldClockEnabled", false);
        });
      });

      // ----------------------------------------------------------------
      describe("getSceneDistanceConfig — scene flag override", () => {
        it("returns Foundry native when no flag is set", () => {
          const cfg = getSceneDistanceConfig(canvas.scene);
          assert.ok(Number.isFinite(cfg.distancePerSquare));
          assert.equal(cfg.overridden, false);
        });

        it("returns override when scene flag is set", async () => {
          await canvas.scene.setFlag(MODULE_ID, "sceneDistance", {
            enabled: true,
            distancePerSquare: 100,
            units: "miles"
          });
          const cfg = getSceneDistanceConfig(canvas.scene);
          assert.equal(cfg.distancePerSquare, 100);
          assert.equal(cfg.units, "miles");
          assert.equal(cfg.overridden, true);

          // Cleanup
          await canvas.scene.unsetFlag(MODULE_ID, "sceneDistance");
        });

        it("ignores disabled flag", async () => {
          await canvas.scene.setFlag(MODULE_ID, "sceneDistance", {
            enabled: false,
            distancePerSquare: 999
          });
          const cfg = getSceneDistanceConfig(canvas.scene);
          assert.equal(cfg.overridden, false);
          assert.notEqual(cfg.distancePerSquare, 999);

          await canvas.scene.unsetFlag(MODULE_ID, "sceneDistance");
        });
      });
    },
    { displayName: "Traveler: World Clock & Scene Distance (integration)" }
  );
}
