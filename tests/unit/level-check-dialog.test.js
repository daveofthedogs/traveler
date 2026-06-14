import { describe, it, expect, beforeEach, vi } from "vitest";
import { TravelerLevelCheckDialog } from "../../scripts/behaviors/level-check-dialog.js";

function makeDialog(opts = {}) {
  return new TravelerLevelCheckDialog({
    behavior: {
      checkFormula: "1d20",
      checkDC: 10,
      checkLabel: "Climb Check",
      ...opts.behavior
    },
    tokenDoc: {
      actor: {
        name: "Hero",
        getRollData: () => ({})
      },
      ...opts.tokenDoc
    },
    partySessionId: opts.partySessionId ?? null,
    partyActorId:   opts.partyActorId   ?? null
  });
}

describe("TravelerLevelCheckDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves promise with cancelled when closed externally", async () => {
    const dialog = makeDialog();
    const resultPromise = dialog.promise;
    await dialog.close();
    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
  });

  it("emits PARTY_CHECK_RESULT in party mode on give-up", () => {
    const dialog = makeDialog({
      partySessionId: "sess-1",
      partyActorId:   "actor-a"
    });
    dialog._onGiveUp();
    expect(game.socket.emit).toHaveBeenCalled();
    const [, data] = game.socket.emit.mock.calls[0];
    expect(data.type).toBe("TRAVELER_PARTY_CHECK_RESULT");
    expect(data.payload.sessionId).toBe("sess-1");
    expect(data.payload.cancelled).toBe(true);
  });

  it("does not emit socket in individual mode on give-up", () => {
    const dialog = makeDialog();
    dialog._onGiveUp();
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("_prepareContext includes actor and check info", async () => {
    const dialog = makeDialog({ behavior: { mode: "cliff", checkDC: 15 } });
    const ctx = await dialog._prepareContext();
    expect(ctx.actorName).toBe("Hero");
    expect(ctx.dc).toBe(15);
    expect(ctx.checkLabel).toBe("Climb Check");
  });

  it("_onAttempt resolves success when roll meets DC", async () => {
    const dialog = makeDialog();
    Roll.prototype.evaluate = vi.fn(async function () {
      this.total = 15;
      return this;
    });
    Roll.prototype.toMessage = vi.fn(async () => {});

    await dialog._onAttempt();
    const result = await dialog.promise;
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(false);
  });
});
