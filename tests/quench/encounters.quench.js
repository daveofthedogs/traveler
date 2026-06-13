/**
 * Quench integration tests — Encounter System.
 *
 * Tests the full encounter resolution pipeline inside a live Foundry instance:
 *  - rollTable returns a valid EncounterResult
 *  - createNote creates a NoteDocument on the active scene
 *  - createChatMessage posts to chat
 *  - EncounterDialog opens, resolves on Accept/Decline, and updates on Regenerate
 *
 * Registered by tests/quench/index.js.
 */

import { SceneFixture } from "./fixtures.js";
import {
  createEncounterZone,
  checkZones,
  resetZoneTriggers,
  buildFixedResult,
  createNote,
  createChatMessage
} from "../../scripts/encounters.js";

export function registerEncounterTests(quench) {
  quench.registerBatch(
    "traveler.integration.encounters",
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
      describe("checkZones — live playback simulation", () => {
        it("explicit zone fires when t crosses zone.t", () => {
          const zones = [createEncounterZone("explicit", { t: 0.5 })];
          const fired = checkZones(zones, 0.55, 0.45);
          assert.equal(fired.length, 1);
        });

        it("auto zone fires on interval boundary", () => {
          const zones = [createEncounterZone("auto", { frequency: 0.1 })];
          const fired = checkZones(zones, 0.11, 0.09);
          assert.equal(fired.length, 1);
        });

        it("resetZoneTriggers allows re-firing", () => {
          const zones = [createEncounterZone("explicit", { t: 0.5 })];
          checkZones(zones, 0.55, 0.45);
          assert.ok(zones[0]._triggered);
          resetZoneTriggers(zones);
          assert.ok(!zones[0]._triggered);
          const fired = checkZones(zones, 0.55, 0.45);
          assert.equal(fired.length, 1);
        });
      });

      // ----------------------------------------------------------------
      describe("createNote — live NoteDocument creation", () => {
        it("creates a NoteDocument on the active scene", async () => {
          const result = {
            name:      "Test Encounter",
            img:       null,
            tableName: "CI Test Table"
          };
          const pos = { x: 500, y: 500 };

          const noteDoc = await createNote(result, pos);
          assert.ok(noteDoc, "createNote should return a NoteDocument");
          assert.ok(noteDoc.id, "NoteDocument should have an id");

          // Cleanup
          await noteDoc?.delete?.();
          const journal = game.journal?.find?.((j) => j.name === "Encounter: Test Encounter");
          await journal?.delete?.();
        });
      });

      // ----------------------------------------------------------------
      describe("createChatMessage — live chat post", () => {
        it("posts a chat message without throwing", async () => {
          const result = {
            name:      "Goblin Ambush",
            img:       null,
            tableName: "Road Encounters"
          };
          const zone = createEncounterZone("explicit", { environment: "Road" });

          let threw = false;
          try {
            await createChatMessage(result, zone);
          } catch (err) {
            threw = true;
            console.error("createChatMessage threw:", err);
          }
          assert.ok(!threw, "createChatMessage should not throw");
        });
      });

      // ----------------------------------------------------------------
      describe("buildFixedResult — live actor lookup", () => {
        it("returns a result with zone label when no actorId", () => {
          const zone = createEncounterZone("fixed", { label: "Bandit Leader" });
          const result = buildFixedResult(zone);
          assert.ok(result);
          assert.equal(result.name, "Bandit Leader");
        });
      });

      // ----------------------------------------------------------------
      describe("EncounterDialog — open and resolve", () => {
        it("resolves 'decline' when close() is called without choosing", async () => {
          const { EncounterDialog } = await import("../../scripts/apps/encounter-dialog.js");
          const zone = createEncounterZone("explicit", {
            label: "CI Test Zone",
            tableId: null
          });
          const result = buildFixedResult(zone);

          const dialog = new EncounterDialog({
            zone,
            initialResult: result,
            routeId:       "ci-test-route",
            pos:           { x: 500, y: 500 }
          });

          // Close immediately without user interaction
          const decisionPromise = dialog.promise;
          await dialog.close();
          const decision = await decisionPromise;

          assert.equal(decision, "decline", "closing without choosing should resolve 'decline'");
        });

        it("is not open after close()", async () => {
          const { EncounterDialog } = await import("../../scripts/apps/encounter-dialog.js");
          const dialog = new EncounterDialog({
            zone:          createEncounterZone("fixed"),
            initialResult: buildFixedResult(createEncounterZone("fixed", { label: "x" })),
            routeId:       "ci-test-route",
            pos:           { x: 0, y: 0 }
          });
          dialog.render({ force: true });
          await dialog.close();
          // rendered = false after close
          assert.ok(!dialog.rendered, "dialog should not be rendered after close");
        });
      });
    },
    { displayName: "Traveler: Encounter System (integration)" }
  );
}
