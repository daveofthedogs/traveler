import { MODULE_ID } from "../settings.js";
import { CHANNEL, MSG } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** FontAwesome icon class for each traversal mode. */
const MODE_ICONS = {
  stairs: "fa-solid fa-layer-group",
  ladder: "fa-solid fa-grip-lines",
  cliff: "fa-solid fa-mountain",
  drop: "fa-solid fa-arrow-down-long",
  "fly-only": "fa-solid fa-dove"
};

/** Human-readable label for each traversal mode. */
const MODE_LABELS = {
  stairs: "Stairs / Ramp",
  ladder: "Ladder",
  cliff: "Cliff Edge",
  drop: "Drop / Fall",
  "fly-only": "Fly-only Passage"
};

/**
 * An awaitable ApplicationV2 dialog that prompts the moving player to attempt
 * a configurable roll check before passing through a Change Level region.
 *
 * Usage:
 *   const dialog = new TravelerLevelCheckDialog({ behavior, tokenDoc });
 *   dialog.render({ force: true });
 *   const { success, roll, cancelled } = await dialog.promise;
 */
export class TravelerLevelCheckDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
      id: "traveler-level-check",
      window: { title: "Level Traversal Check" },
      position: { width: 360 },
      classes: ["traveler", "traveler-level-check-dialog"]
    },
    { inplace: false }
  );

  /** @override */
  static PARTS = {
    root: {
      id: "root",
      template: `modules/${MODULE_ID}/templates/level-check-dialog.hbs`
    }
  };

  // -----------------------------------------------------------------------

  /**
   * @param {object} options
   * @param {TravelerChangeLevelBehavior|object} options.behavior  Behavior or check-config object
   * @param {TokenDocument}                      options.tokenDoc
   * @param {string|null}  [options.partySessionId]  When set, result is submitted via socket
   *                                                  to the GM rather than resolved locally.
   * @param {string|null}  [options.partyActorId]    Actor ID to include in the socket result.
   */
  constructor(options = {}) {
    super(options);
    /** @type {import("./change-level.js").TravelerChangeLevelBehavior|object} */
    this.behavior        = options.behavior;
    /** @type {TokenDocument} */
    this.tokenDoc        = options.tokenDoc;
    /** @type {string|null} — non-null when this dialog was triggered by a party check */
    this.partySessionId  = options.partySessionId ?? null;
    /** @type {string|null} */
    this.partyActorId    = options.partyActorId   ?? null;

    /** Public promise resolved when the player acts (individual mode only). */
    this.promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  // -----------------------------------------------------------------------
  // Template context
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext() {
    const b = this.behavior;
    const mode = b?.mode ?? "stairs";
    return {
      actorName: this.tokenDoc?.actor?.name ?? this.tokenDoc?.name ?? "Token",
      checkLabel: b?.checkLabel || "Traversal Check",
      formula: b?.checkFormula || "1d20",
      dc: b?.checkDC ?? 10,
      modeName: MODE_LABELS[mode] ?? mode,
      modeIcon: MODE_ICONS[mode] ?? "fa-solid fa-layer-group"
    };
  }

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------

  /** @override */
  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    // `html` from HandlebarsApplicationMixin is the rendered DocumentFragment /
    // Element.  Walk up to the window-content container.
    const root = html instanceof HTMLElement ? html : html?.[0] ?? this.element;
    const content = root?.closest?.(".window-content") ?? root?.querySelector?.(".window-content") ?? root;

    content?.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-action]");
      if (!btn) return;
      event.preventDefault();
      if (btn.dataset.action === "attempt") this._onAttempt();
      else if (btn.dataset.action === "give-up") this._onGiveUp();
    });
  }

  // -----------------------------------------------------------------------
  // Button handlers
  // -----------------------------------------------------------------------

  async _onAttempt() {
    const b = this.behavior;
    const rollData = this.tokenDoc?.actor?.getRollData?.() ?? {};
    let roll;
    try {
      roll = await new Roll(b?.checkFormula || "1d20", rollData).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ token: this.tokenDoc }),
        flavor: b?.checkLabel || "Traversal Check"
      });
    } catch (err) {
      console.error("Traveler | Level check roll failed:", err);
      this._submitResult({ success: false, roll: null, cancelled: true });
      this.close();
      return;
    }

    const success = roll.total >= (b?.checkDC ?? 10);
    this._submitResult({ success, roll, cancelled: false });
    this.close();
  }

  _onGiveUp() {
    this._submitResult({ success: false, roll: null, cancelled: true });
    this.close();
  }

  /**
   * Route the result either to the local promise (individual mode) or back to
   * the GM via socket (party mode).
   * @param {{ success: boolean, roll: Roll|null, cancelled: boolean }} result
   */
  _submitResult(result) {
    if (this.partySessionId) {
      // Party mode — emit to GM
      game.socket.emit(CHANNEL, {
        type: MSG.PARTY_CHECK_RESULT,
        payload: {
          sessionId: this.partySessionId,
          actorId:   this.partyActorId,
          userId:    game.user.id,
          total:     result.roll?.total ?? null,
          passed:    result.success,
          cancelled: result.cancelled
        }
      });
      // Also resolve the local promise so the dialog can close cleanly.
      this._settle(result);
    } else {
      this._settle(result);
    }
  }

  // -----------------------------------------------------------------------
  // Promise resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve the promise exactly once.
   * @param {{ success: boolean, roll: Roll|null, cancelled: boolean }} result
   */
  _settle(result) {
    if (!this._resolve) return;
    this._resolve(result);
    this._resolve = null;
  }

  /** @override — guarantee the promise is always resolved, even if closed externally. */
  async close(options = {}) {
    this._settle({ success: false, roll: null, cancelled: true });
    return super.close(options);
  }
}
