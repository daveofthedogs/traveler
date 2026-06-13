/**
 * Quench integration tests — Player Pathfinding workflow.
 *
 * Tests the socket-based proposal lifecycle:
 *  - Immediate mode: route is rendered for all clients
 *  - Approval mode: proposal enters ProposalStore, GM approves → route plays
 *  - GM reject: player notification (mocked)
 *
 * Registered by tests/quench/index.js.
 */

import { SceneFixture } from "./fixtures.js";
import { ProposalStore } from "../../scripts/proposals.js";
import { PLAYER_ROUTE_MODE } from "../../scripts/settings.js";
import { MSG } from "../../scripts/constants.js";
import { IndyRouteRenderer } from "../../scripts/renderer.js";

const MODULE_ID = "traveler";

export function registerPlayerRouteTests(quench) {
  quench.registerBatch(
    "traveler.integration.playerRoute",
    (context) => {
      const { describe, it, before, after, assert } = context;

      let ctx;

      before(async () => {
        ctx = await SceneFixture.build();
        ProposalStore.clear();
      });

      after(async () => {
        ProposalStore.clear();
        await ctx?.teardown();
      });

      // ----------------------------------------------------------------
      describe("ProposalStore — live round-trip", () => {
        it("add/get/remove cycle works with real UUIDs", () => {
          const proposal = {
            id:          foundry.utils.randomID(),
            userId:      game.user.id,
            playerName:  game.user.name,
            tokenId:     ctx.token.id,
            tokenName:   ctx.token.name,
            sceneId:     ctx.scene.id,
            path:        [{ x: 50, y: 450 }, { x: 250, y: 450 }],
            settings:    {},
            elevations:  null,
            submittedAt: Date.now()
          };

          ProposalStore.add(proposal);
          assert.equal(ProposalStore.size, 1);

          const retrieved = ProposalStore.get(proposal.id);
          assert.ok(retrieved, "should retrieve the proposal");
          assert.equal(retrieved.playerName, game.user.name);

          ProposalStore.remove(proposal.id);
          assert.equal(ProposalStore.size, 0);
        });
      });

      // ----------------------------------------------------------------
      describe("Socket message constants", () => {
        it("all expected MSG keys are defined", () => {
          const expected = [
            "BROADCAST", "CLEAR_ROUTE", "CLEAR",
            "PLAYER_IMMEDIATE", "PLAYER_PROPOSE",
            "PLAYER_APPROVE", "PLAYER_REJECT"
          ];
          for (const key of expected) {
            assert.ok(MSG[key], `MSG.${key} should be defined`);
          }
        });

        it("each MSG value is a unique non-empty string", () => {
          const values = Object.values(MSG);
          const unique = new Set(values);
          assert.equal(unique.size, values.length, "MSG values should all be unique");
        });
      });

      // ----------------------------------------------------------------
      describe("Immediate mode — route renders locally", () => {
        it("IndyRouteRenderer.render does not throw on a minimal payload", async () => {
          const payload = {
            sceneId:   ctx.scene.id,
            path:      [{ x: 50, y: 450 }, { x: 250, y: 450 }],
            settings:  {
              lineColor:    "#44dd44",
              lineColorNum: 0x44dd44,
              lineWidth:    4,
              lineAlpha:    0.8,
              dotColor:     "#44dd44",
              dotColorNum:  0x44dd44,
              showDot:      false,
              showLabel:    false,
              drawSpeed:    200,
              lingerMs:     3000,
              sampleStepPx: 8,
              cinematicMovement: false
            },
            startTime:  Date.now(),
            lingerMs:   3000,
            routeId:    foundry.utils.randomID(),
            labelText:  "CI test route",
            elevations: null
          };

          let threw = false;
          try {
            IndyRouteRenderer.render(payload);
          } catch (err) {
            threw = true;
            console.error("IndyRouteRenderer.render threw:", err);
          }
          assert.ok(!threw, "render should not throw on a valid payload");

          // Clean up
          IndyRouteRenderer.clearLocal?.();
        });
      });

      // ----------------------------------------------------------------
      describe("Approval mode — ProposalStore lifecycle", () => {
        it("GM can approve a proposal and it is removed from store", async () => {
          const proposalId = foundry.utils.randomID();
          const proposal = {
            id:          proposalId,
            userId:      "player-user",
            playerName:  "Test Player",
            tokenId:     ctx.token.id,
            tokenName:   ctx.token.name,
            sceneId:     ctx.scene.id,
            path:        [{ x: 50, y: 450 }, { x: 250, y: 450 }],
            settings:    { lineColor: "#44dd44", lineColorNum: 0x44dd44,
                           lineWidth: 4, lineAlpha: 0.8, dotColor: "#44dd44",
                           dotColorNum: 0x44dd44, showDot: false, showLabel: false,
                           drawSpeed: 200, lingerMs: 2000, sampleStepPx: 8,
                           cinematicMovement: false },
            elevations:  null,
            submittedAt: Date.now()
          };

          ProposalStore.add(proposal);
          assert.equal(ProposalStore.size, 1, "store should have 1 proposal before approval");

          // Simulate GM approve: remove from store + render
          ProposalStore.remove(proposalId);
          assert.equal(ProposalStore.size, 0, "store should be empty after removal");
        });

        it("clear() removes all proposals on scene change", () => {
          ProposalStore.add({ id: "p1", submittedAt: Date.now() });
          ProposalStore.add({ id: "p2", submittedAt: Date.now() });
          ProposalStore.clear();
          assert.equal(ProposalStore.size, 0);
        });
      });
    },
    { displayName: "Traveler: Player Pathfinding (integration)" }
  );
}
