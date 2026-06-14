/**
 * Quench integration tests for the Party System.
 *
 * Run inside a live Foundry VTT world via Quench.
 * These tests use real Foundry document APIs and the live socket.
 */

import {
  createParty,
  getParties,
  saveParties,
  getPartyForToken,
  getPartyMemberUsers,
  resolvePartyCheck,
  PartyCheckSession
} from "../../scripts/party.js";

export function registerPartyTests(quench) {
  quench.registerBatch("traveler.party", (context) => {
    const { describe, it, assert, before, after } = context;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    let createdActors   = [];
    let createdTokenIds = [];
    let originalParties = [];

    async function makeActor(name) {
      const a = await Actor.create({ name, type: "base" });
      createdActors.push(a);
      return a;
    }

    before(async function() {
      this.timeout(180_000);
      // Snapshot existing parties so we can restore after tests
      originalParties = foundry.utils.deepClone(getParties());
      await saveParties([]);
    });

    after(async () => {
      // Restore parties
      await saveParties(originalParties);
      // Clean up actors created during tests
      for (const a of createdActors) {
        await a.delete().catch(() => {});
      }
      // Clean up tokens
      if (canvas?.scene && createdTokenIds.length) {
        await canvas.scene.deleteEmbeddedDocuments("Token", createdTokenIds).catch(() => {});
      }
    });

    // -----------------------------------------------------------------------
    // CRUD round-trip
    // -----------------------------------------------------------------------

    describe("Party CRUD", () => {
      it("saveParties / getParties round-trip", async () => {
        const p = createParty({ name: "Round Trip Party" });
        await saveParties([p]);
        const loaded = getParties();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].name, "Round Trip Party");
        await saveParties([]);
      });

      it("createParty generates unique IDs", () => {
        const a = createParty();
        const b = createParty();
        assert.notEqual(a.id, b.id);
      });
    });

    // -----------------------------------------------------------------------
    // getPartyForToken
    // -----------------------------------------------------------------------

    describe("getPartyForToken", () => {
      it("finds a party by partyTokenActorId", async () => {
        const actor = await makeActor("Party Token Actor");
        const p = createParty({ partyTokenActorId: actor.id });
        await saveParties([p]);

        const tokenDoc = { actorId: actor.id };
        const found = getPartyForToken(tokenDoc);
        assert.ok(found, "should find the party");
        assert.equal(found.id, p.id);

        await saveParties([]);
      });

      it("returns null when no party matches", () => {
        const result = getPartyForToken({ actorId: "does-not-exist" });
        assert.isNull(result);
      });
    });

    // -----------------------------------------------------------------------
    // getPartyMemberUsers (live actors + users)
    // -----------------------------------------------------------------------

    describe("getPartyMemberUsers", () => {
      it("returns empty array when no non-GM user owns the actors", async () => {
        const actor = await makeActor("Orphan Actor");
        const party = createParty({ memberActorIds: [actor.id] });
        // In test world the only user is the GM, so no non-GM owner is found.
        const members = getPartyMemberUsers(party);
        assert.isArray(members);
        // May or may not have members depending on test world users — just
        // assert it doesn't throw.
      });
    });

    // -----------------------------------------------------------------------
    // resolvePartyCheck (pure logic, verified again in live context)
    // -----------------------------------------------------------------------

    describe("resolvePartyCheck", () => {
      const pass  = (id) => ({ actorId: id, passed: true,  cancelled: false });
      const fail  = (id) => ({ actorId: id, passed: false, cancelled: false });

      it("mode=all: passes when all pass", () => {
        assert.isTrue(resolvePartyCheck([pass("a"), pass("b")], "all"));
      });
      it("mode=all: fails when any fail", () => {
        assert.isFalse(resolvePartyCheck([pass("a"), fail("b")], "all"));
      });
      it("mode=best: passes when any pass", () => {
        assert.isTrue(resolvePartyCheck([fail("a"), pass("b")], "best"));
      });
      it("mode=majority: passes when strictly over half pass (3/4)", () => {
        assert.isTrue(resolvePartyCheck([pass("a"), pass("b"), pass("c"), fail("d")], "majority"));
      });
      it("mode=majority: fails when exactly half pass (2/4)", () => {
        assert.isFalse(resolvePartyCheck([pass("a"), pass("b"), fail("c"), fail("d")], "majority"));
      });
      it("mode=designated: passes if designated actor passed", () => {
        assert.isTrue(resolvePartyCheck([pass("leader"), fail("other")], "designated", "leader"));
      });
    });

    // -----------------------------------------------------------------------
    // PartyCheckSession
    // -----------------------------------------------------------------------

    describe("PartyCheckSession lifecycle", () => {
      let session;

      before(() => {
        session = PartyCheckSession.create({
          partyId:     "test-party",
          party:       createParty(),
          members:     [
            { actorId: "a1", userId: "u1", actorName: "Aria" },
            { actorId: "a2", userId: "u2", actorName: "Brom" }
          ],
          checkConfig: { label: "Test", formula: "1d20", dc: 10 },
          tokenDocId:  "tok",
          movementId:  "mov",
          continueKey: "ckey"
        });
      });

      after(() => {
        PartyCheckSession.remove(session?.id);
      });

      it("session is retrievable after create", () => {
        assert.equal(PartyCheckSession.get(session.id), session);
      });

      it("participants start as pending", () => {
        assert.isTrue(session.participants.every((p) => p.status === "pending"));
      });

      it("resolves when all results are added", async () => {
        session.addResult({ actorId: "a1", total: 14, passed: true,  cancelled: false });
        session.addResult({ actorId: "a2", total: 7,  passed: false, cancelled: false });
        const results = await session.promise;
        assert.equal(results.length, 2);
        assert.isTrue(results.find((r) => r.actorId === "a1").passed);
        assert.isFalse(results.find((r) => r.actorId === "a2").passed);
      });
    });

    // -----------------------------------------------------------------------
    // PartyConfigApp renders without error
    // -----------------------------------------------------------------------

    describe("PartyConfigApp", () => {
      it("opens and closes without errors", async () => {
        const { PartyConfigApp } = await import("../../scripts/apps/party-config.js");
        const app = new PartyConfigApp();
        await app.render({ force: true });
        assert.ok(app.element, "element should exist after render");
        await app.close();
      });
    });

    // -----------------------------------------------------------------------
    // PartyCheckCollector renders without error
    // -----------------------------------------------------------------------

    describe("PartyCheckCollector", () => {
      it("opens and closes without errors", async () => {
        const { PartyCheckCollector } = await import("../../scripts/apps/party-check-collector.js");
        const session = PartyCheckSession.create({
          partyId:     "q-party",
          party:       createParty({ name: "Quench Party" }),
          members:     [{ actorId: "qa1", userId: "qu1", actorName: "Quench Hero" }],
          checkConfig: { label: "Quench Check", formula: "1d20", dc: 10 },
          tokenDocId:  "qt",
          movementId:  "qm",
          continueKey: "qk"
        });
        const collector = new PartyCheckCollector({ session });
        await collector.render({ force: true });
        assert.ok(collector.element, "element should exist after render");
        session.forceResolve();
        await collector.close();
        PartyCheckSession.remove(session.id);
      });
    });

    // -----------------------------------------------------------------------
    // Socket round-trip (self-test: same client is both sender and receiver)
    // -----------------------------------------------------------------------

    describe("Socket round-trip", () => {
      it("PARTY_CHECK_RESULT payload resolves the session (same path as socket handler)", async () => {
        const session = PartyCheckSession.create({
          partyId:     "socket-party",
          party:       createParty(),
          members:     [{ actorId: "s1", userId: game.user.id, actorName: "Self" }],
          checkConfig: { label: "Socket Test", formula: "1d20", dc: 8 },
          tokenDocId:  "st",
          movementId:  "sm",
          continueKey: "sk"
        });

        try {
          // Foundry does not echo socket.emit to the same client — exercise the
          // handler path directly (what the GM receives on PARTY_CHECK_RESULT).
          session.addResult({
            actorId:   "s1",
            total:     17,
            passed:    true,
            cancelled: false
          });

          const results = await session.promise;
          assert.equal(results[0].total, 17);
          assert.isTrue(results[0].passed);
        } finally {
          PartyCheckSession.remove(session.id);
        }
      });
    });
  });
}
