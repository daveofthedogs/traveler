/**
 * SceneSettingsDialog — lets the GM override the distance-per-grid-square
 * for the current scene, independent of Foundry's combat-grid setting.
 *
 * Stored as a scene flag: MODULE_ID → "sceneDistance"
 *   { enabled: boolean, distancePerSquare: number, units: string }
 */

import { MODULE_ID, getSceneDistanceConfig } from "../settings.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class SceneSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS ?? {},
    {
      id:      "traveler-scene-settings",
      classes: ["traveler", "traveler-scene-settings"],
      window: {
        title:     "Traveler: Scene Distance Scale",
        resizable: false
      },
      position: { width: 360, height: "auto" }
    },
    { inplace: false }
  );

  static PARTS = {
    root: {
      id:       "root",
      template: `modules/${MODULE_ID}/templates/scene-settings.hbs`
    }
  };

  async _prepareContext() {
    const scene  = canvas?.scene;
    const flag   = scene?.getFlag?.(MODULE_ID, "sceneDistance") ?? {};
    const native = getSceneDistanceConfig(scene);
    return {
      enabled:           flag.enabled ?? false,
      distancePerSquare: flag.distancePerSquare ?? native.distancePerSquare ?? 1,
      units:             flag.units ?? native.units ?? "miles",
      nativeDistance:    scene?.grid?.distance ?? scene?.gridDistance ?? 1,
      nativeUnits:       scene?.grid?.units    ?? scene?.gridUnits    ?? "",
      sceneName:         scene?.name ?? "Current Scene"
    };
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners?.(partId, html, options);
    html.querySelector?.("[data-action='save']")?.addEventListener(
      "click", () => this._handleSave(html)
    );
    html.querySelector?.("[data-action='clear']")?.addEventListener(
      "click", () => this._handleClear()
    );

    // Toggle enabled state affects input visibility
    const toggle = html.querySelector?.("[name='enabled']");
    const fields = html.querySelector?.(".scene-dist-fields");
    if (toggle && fields) {
      const update = () => { fields.style.opacity = toggle.checked ? "1" : "0.4"; };
      toggle.addEventListener("change", update);
      update();
    }
  }

  async _handleSave(html) {
    const form = html;
    const enabled   = form.querySelector?.("[name='enabled']")?.checked ?? false;
    const distance  = parseFloat(form.querySelector?.("[name='distancePerSquare']")?.value ?? "1");
    const units     = form.querySelector?.("[name='units']")?.value?.trim() ?? "miles";

    const flag = {
      enabled,
      distancePerSquare: Number.isFinite(distance) && distance > 0 ? distance : 1,
      units: units || "miles"
    };

    await canvas.scene?.setFlag(MODULE_ID, "sceneDistance", flag);
    ui.notifications.info(
      `Traveler | Scene distance ${enabled ? `set to ${flag.distancePerSquare} ${flag.units}/square` : "override disabled"}.`
    );
    await this.close();
  }

  async _handleClear() {
    await canvas.scene?.unsetFlag(MODULE_ID, "sceneDistance");
    ui.notifications.info("Traveler | Scene distance override cleared.");
    await this.close();
  }
}
