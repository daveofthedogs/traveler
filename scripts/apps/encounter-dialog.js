/**
 * EncounterDialog — GM-facing confirmation dialog shown when an encounter
 * zone fires during route animation playback.
 *
 * The dialog is awaitable: construct it, render it, then await .promise.
 * Promise resolves with "accept" or "decline".
 *
 * The GM can:
 *  - Accept   — encounter proceeds (chat + note + token spawn)
 *  - Regenerate — re-rolls the same table, updates dialog in-place
 *  - Decline  — skips the encounter silently
 */

import { MODULE_ID } from "../settings.js";
import { rollTable } from "../encounters.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class EncounterDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS ?? {},
    {
      id:      "traveler-encounter-dialog",
      classes: ["traveler", "traveler-encounter-dialog"],
      window: {
        title:     "Traveler: Random Encounter",
        resizable: false
      },
      position: { width: 380, height: "auto" },
      modal: false
    },
    { inplace: false }
  );

  static PARTS = {
    root: {
      id:       "root",
      template: `modules/${MODULE_ID}/templates/encounter-dialog.hbs`
    }
  };

  /**
   * @param {object} options
   * @param {EncounterZone}             options.zone           The zone that fired
   * @param {EncounterResult}           options.initialResult  First rolled result
   * @param {string}                    options.routeId        For animation pause
   * @param {{x:number, y:number}}      options.pos            Map position
   */
  constructor(options = {}) {
    super(options);
    this.zone          = options.zone          ?? null;
    this.currentResult = options.initialResult ?? null;
    this.routeId       = options.routeId       ?? null;
    this.pos           = options.pos           ?? null;
    this._regenCount   = 0;
    this._settled      = false;

    this.promise = new Promise((resolve) => { this._resolve = resolve; });
  }

  async _prepareContext() {
    const result = this.currentResult ?? {};
    const zone   = this.zone ?? {};
    return {
      name:        result.name      ?? "Unknown",
      img:         result.img       ?? null,
      tableName:   result.tableName ?? zone.tableName ?? "",
      environment: zone.environment ?? "",
      label:       zone.label       ?? "",
      zoneType:    zone.type        ?? "explicit",
      regenCount:  this._regenCount,
      canRegen:    !!zone.tableId,
      isFixed:     zone.type === "fixed"
    };
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners?.(partId, html, options);
    html.querySelector?.("[data-action='accept']")?.addEventListener(
      "click", () => this._onAccept()
    );
    html.querySelector?.("[data-action='regenerate']")?.addEventListener(
      "click", () => this._onRegenerate()
    );
    html.querySelector?.("[data-action='decline']")?.addEventListener(
      "click", () => this._onDecline()
    );
  }

  async _onAccept() {
    this._settle("accept");
    await this.close();
  }

  async _onRegenerate() {
    if (!this.zone?.tableId) return;
    this._regenCount++;
    const newResult = await rollTable(this.zone.tableId);
    if (newResult) this.currentResult = newResult;
    // Re-render the dialog with the new result in-place
    await this.render({ force: true, parts: ["root"] });
  }

  _onDecline() {
    this._settle("decline");
    this.close();
  }

  _settle(decision) {
    if (this._settled) return;
    this._settled = true;
    this._resolve(decision);
  }

  async close(options = {}) {
    // Always resolve so callers aren't left hanging if the window is closed
    this._settle("decline");
    return super.close(options);
  }
}
