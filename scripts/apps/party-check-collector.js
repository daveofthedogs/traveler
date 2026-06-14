import { MODULE_ID } from "../settings.js";
import { RESOLUTION_MODES } from "../party.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-side dialog shown while waiting for party members to submit their
 * individual level-check results.  Updates live as each result arrives.
 *
 * Usage:
 *   const collector = new PartyCheckCollector({ session });
 *   collector.render({ force: true });
 *   // Later, call collector.refresh() when session.addResult() is called.
 *   // Resolved automatically when the session promise settles.
 */
export class PartyCheckCollector extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
      id: "traveler-party-check-collector",
      window: { title: "Party Level Check — Waiting for Rolls", resizable: false },
      position: { width: 440 },
      classes: ["traveler", "traveler-party-check-collector"]
    },
    { inplace: false }
  );

  /** @override */
  static PARTS = {
    root: {
      id: "root",
      template: `modules/${MODULE_ID}/templates/party-check-collector.hbs`
    }
  };

  /**
   * @param {object} options
   * @param {import("../party.js").PartyCheckSession} options.session
   */
  constructor(options = {}) {
    super(options);
    this.session = options.session;
  }

  // -----------------------------------------------------------------------
  // Context
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext() {
    const s = this.session;
    const dc = s.checkConfig?.dc ?? 10;

    const rows = s.participants.map((p) => {
      let icon, statusLabel;
      switch (p.status) {
        case "pending":
          icon = "fa-solid fa-hourglass-half";
          statusLabel = "Waiting…";
          break;
        case "rolled":
          if (p.cancelled) {
            icon = "fa-solid fa-ban";
            statusLabel = "Gave up";
          } else if (p.passed) {
            icon = "fa-solid fa-circle-check text-success";
            statusLabel = `Pass (${p.total ?? "—"} vs DC ${dc})`;
          } else {
            icon = "fa-solid fa-circle-xmark text-failure";
            statusLabel = `Fail (${p.total ?? "—"} vs DC ${dc})`;
          }
          break;
        case "timeout":
          icon = "fa-solid fa-clock text-failure";
          statusLabel = "Timed out";
          break;
        default:
          icon = "fa-solid fa-question";
          statusLabel = p.status;
      }
      return { ...p, icon, statusLabel };
    });

    const allDone   = s.participants.every((p) => p.status !== "pending");
    const modeName  = RESOLUTION_MODES[s.party?.resolutionMode] ?? s.party?.resolutionMode ?? "—";
    const partyName = s.party?.name ?? "Party";

    return {
      partyName,
      checkLabel: s.checkConfig?.label ?? "Traversal Check",
      dc,
      modeName,
      rows,
      allDone,
      resolved: s.resolved
    };
  }

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------

  /** @override */
  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = html instanceof HTMLElement ? html : html?.[0] ?? this.element;
    const win  = root?.closest?.(".window-content") ?? root?.querySelector?.(".window-content") ?? root;

    win.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.action === "force-resolve") this._onForceResolve();
    });
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  _onForceResolve() {
    this.session.forceResolve();
  }

  /**
   * Called by the socket handler in traveler.js whenever a new result arrives.
   * Re-renders the dialog to update the live roll table.
   */
  refresh() {
    this.render({ force: false });
  }
}
