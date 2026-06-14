/**
 * PlayerSpeedDialog — shown to players before they submit a pathfinding
 * proposal so they can choose their travel speed.
 *
 * Resolves to the selected travel mode id string, or null if cancelled.
 */

import { MODULE_ID, getTravelModes } from "../settings.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class PlayerSpeedDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS ?? {},
    {
      id:      "traveler-player-speed-dialog",
      classes: ["traveler", "traveler-player-speed-dialog"],
      window: {
        title:     "Traveler: Choose Travel Speed",
        resizable: false
      },
      position: { width: 340, height: "auto" },
      modal: true
    },
    { inplace: false }
  );

  static PARTS = {
    root: {
      id:       "root",
      template: `modules/${MODULE_ID}/templates/player-speed-dialog.hbs`
    }
  };

  constructor(options = {}) {
    super(options);
    this._selectedId = options.defaultModeId ?? "walk-normal";
    this._settled    = false;
    this.promise = new Promise((resolve) => { this._resolve = resolve; });
  }

  async _prepareContext() {
    const modes = getTravelModes();
    return {
      modes: modes.map((m) => ({
        ...m,
        selected: m.id === this._selectedId
      }))
    };
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners?.(partId, html, options);

    // Radio change — update selected
    html.querySelectorAll?.("input[name='travelModeId']").forEach((radio) => {
      radio.addEventListener("change", () => {
        this._selectedId = radio.value;
      });
    });

    html.querySelector?.("[data-action='submit']")?.addEventListener(
      "click", () => this._onSubmit()
    );
    html.querySelector?.("[data-action='cancel']")?.addEventListener(
      "click", () => this._onCancel()
    );
  }

  _onSubmit() {
    this._settle(this._selectedId);
    this.close();
  }

  _onCancel() {
    this._settle(null);
    this.close();
  }

  _settle(value) {
    if (this._settled) return;
    this._settled = true;
    this._resolve(value);
  }

  async close(options = {}) {
    this._settle(null);
    return super.close(options);
  }
}

// ---------------------------------------------------------------------------
// drawSpeed scaling helper (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Scale a base drawSpeed by the selected travel mode relative to
 * Walking (Normal) at 3 mph.
 *
 * @param {number} baseDraw   Base drawSpeed pixels/sec
 * @param {number} speedMph   Selected mode's speedMph
 * @param {number} [baseRef]  Reference speed (Walking Normal = 3 mph)
 * @returns {number}
 */
export function scaleDrawSpeed(baseDraw, speedMph, baseRef = 3) {
  if (!Number.isFinite(baseDraw) || baseDraw <= 0)  return baseDraw;
  if (!Number.isFinite(speedMph) || speedMph <= 0)  return baseDraw;
  if (!Number.isFinite(baseRef)  || baseRef  <= 0)  return baseDraw;
  return Math.max(1, baseDraw * (speedMph / baseRef));
}
