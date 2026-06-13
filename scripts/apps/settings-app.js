import { MODULE_ID, DEFAULTS, normalizeSettings, getMapPixelSize, getTravelModes } from "../settings.js";
import { buildRouteFromPoints } from "../routes.js";
import { IndyRouteRenderer } from "../renderer.js";

export class IndyRouteSettingsBase extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    root: { id: "root", template: `modules/${MODULE_ID}/templates/settings.hbs`, root: true }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "traveler-settings",
    window: { title: "Traveler: Settings", resizable: true },
    position: { width: 440, height: 494 },
    classes: ["traveler", "traveler-settings"]
  }, { inplace: false });

  constructor(options = {}) {
    super(options);
    this.activeTab = "general";
  }

  async _prepareContext() {
    const base = game.settings.get(MODULE_ID, "routeSettings");
    const merged = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULTS), base, { inplace: false });
    return {
      settings: merged,
      route: this.route ?? null,
      activeTab: this.activeTab,
      tabs: ["general", "line", "dot", "label", "animation", "camera", "smoothing"],
      travelModes: getTravelModes(),
      labelFonts: this._getLabelFonts()
    };
  }

  _getLabelFonts() {
    const options = new Map();
    const add = (value, label) => {
      if (!value) return;
      const key = value.toLowerCase();
      if (options.has(key)) return;
      options.set(key, { value, label: label || value });
    };
    const getPrimaryFamily = (value) => {
      if (!value) return "";
      return value.split(",")[0].trim().replace(/^["']|["']$/g, "");
    };

    const defaults = [
      { value: "Modesto Condensed, serif", label: "Modesto Condensed" },
      { value: "Signika, sans-serif", label: "Signika" },
      { value: "Roboto, sans-serif", label: "Roboto" },
      { value: "Palatino, serif", label: "Palatino" },
      { value: "Garamond, serif", label: "Garamond" },
      { value: "Georgia, serif", label: "Georgia" },
      { value: "Times New Roman, serif", label: "Times New Roman" },
      { value: "Trebuchet MS, sans-serif", label: "Trebuchet MS" },
      { value: "Tahoma, sans-serif", label: "Tahoma" },
      { value: "Verdana, sans-serif", label: "Verdana" },
      { value: "Courier New, monospace", label: "Courier New" },
      { value: "Impact, sans-serif", label: "Impact" }
    ];
    defaults.forEach((entry) => add(entry.value, entry.label));
    const defaultFamilies = new Set(
      defaults
        .map((entry) => getPrimaryFamily(entry.value).toLowerCase())
        .filter(Boolean)
    );

    const defs = CONFIG?.fontDefinitions;
    if (defs && typeof defs === "object") {
      Object.entries(defs).forEach(([key, def]) => {
        const family = def?.family ?? def?.fontFamily ?? key;
        if (family) {
          const primary = getPrimaryFamily(family.toString()).toLowerCase();
          if (!defaultFamilies.has(primary)) add(family.toString());
        }
        const fonts = Array.isArray(def?.fonts) ? def.fonts : [];
        fonts.forEach((font) => {
          const f = font?.family ?? font?.fontFamily ?? font?.name ?? "";
          if (f) {
            const primary = getPrimaryFamily(f.toString()).toLowerCase();
            if (!defaultFamilies.has(primary)) add(f.toString());
          }
        });
      });
    }

    if (document?.fonts && typeof document.fonts[Symbol.iterator] === "function") {
      for (const face of document.fonts) {
        const family = face?.family;
        if (family) {
          const primary = getPrimaryFamily(family.toString()).toLowerCase();
          if (!defaultFamilies.has(primary)) add(family.toString());
        }
      }
    }

    return Array.from(options.values());
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Handled in _attachPartListeners for ApplicationV2 parts.
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0] ?? html;
    const content = root?.querySelector(".window-content") ?? root;

    if (this._tabClickHandler && content?.removeEventListener) {
      content.removeEventListener("click", this._tabClickHandler, true);
    }
    this._tabClickHandler = (event) => {
      const tabTarget = event.target?.closest?.("[data-tab]");
      if (tabTarget) {
        event.preventDefault();
        this._setActiveTab(tabTarget.dataset.tab, root);
        return;
      }
      const saveTarget = event.target?.closest?.("[data-action='save']");
      if (saveTarget) {
        event.preventDefault();
        this._handleSave();
        return;
      }
    };
    content?.addEventListener("click", this._tabClickHandler, true);

    if (this._submitHandler && content?.removeEventListener) {
      content.removeEventListener("submit", this._submitHandler, true);
    }
    this._submitHandler = (event) => {
      const form = event.target?.closest?.("form");
      if (!form) return;
      event.preventDefault();
      this._handleSave();
    };
    content?.addEventListener("submit", this._submitHandler, true);

    if (this._dropHandler && content?.removeEventListener) {
      content.removeEventListener("dragover", this._dropHandler, true);
      content.removeEventListener("drop", this._dropHandler, true);
    }
    this._dropHandler = async (event) => {
      const dropTarget = event.target?.closest?.("[data-drop='dot-token-uuid']");
      const soundTarget = event.target?.closest?.("[data-drop='route-sound']");
      if (!dropTarget && !soundTarget) return;
      event.preventDefault();
      event.stopPropagation();
      let data;
      try {
        const raw = event.dataTransfer?.getData("text/plain");
        data = raw ? JSON.parse(raw) : null;
      } catch {}
      if (dropTarget) {
        const uuid = data?.uuid || (data?.type && data?.id ? `${data.type}.${data.id}` : "");
        if (!uuid) return;
        dropTarget.value = uuid;
        dropTarget.dispatchEvent(new Event("input", { bubbles: true }));
        dropTarget.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (soundTarget) {
        const uuid = data?.uuid || (data?.type && data?.id ? `${data.type}.${data.id}` : "");
        let value = data?.src || data?.path || uuid || "";
        if (uuid && !value) {
          try {
            const doc = await fromUuid(uuid);
            value = doc?.path || doc?.src || doc?.sound?.path || "";
          } catch {}
        }
        if (!value) return;
        soundTarget.value = value;
        soundTarget.dispatchEvent(new Event("input", { bubbles: true }));
        soundTarget.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    content?.addEventListener("dragover", this._dropHandler, true);
    content?.addEventListener("drop", this._dropHandler, true);

    this._setActiveTab(this.activeTab, root);
  }

  _setActiveTab(tabId, html) {
    if (!tabId) return;
    this.activeTab = tabId;
    const root = (html instanceof HTMLElement) ? html : html?.[0] ?? html;
    root.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tabId);
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabId);
    });
  }

  _getFormElement() {
    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0];
    return root?.querySelector("form");
  }

  _readSettingsForm() {
    const form = this._getFormElement();
    if (!form) return normalizeSettings(game.settings.get(MODULE_ID, "routeSettings"));

    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) data[key] = value;

    const checkboxNames = [
      "settings.showDot",
      "settings.showEndX",
      "settings.showLabel",
      "settings.labelFollowPath",
      "settings.labelShowArrow",
      "settings.scaleWithMap",
      "settings.cinematicMovement"
    ];
    for (const name of checkboxNames) {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) data[name] = el.checked;
    }

    const expanded = foundry.utils.expandObject(data);
    const s = expanded.settings ?? expanded;
    return normalizeSettings({
      ...game.settings.get(MODULE_ID, "routeSettings"),
      ...s
    });
  }

  async _handleSave() {
    const updated = this._readSettingsForm();
    await game.settings.set(MODULE_ID, "routeSettings", updated);
    this.close();
  }
}

export class IndyRouteSettingsApp extends IndyRouteSettingsBase {}

export class IndyRouteEditor extends IndyRouteSettingsBase {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "traveler-editor",
    window: { title: "Edit Route" },
    position: { width: 440, height: 494 },
    classes: ["traveler", "traveler-editor"]
  }, { inplace: false });

  constructor(route, callbacks = {}) {
    super();
    this.route = foundry.utils.deepClone(route);
    this.settings = foundry.utils.mergeObject(
      foundry.utils.deepClone(DEFAULTS),
      this.route.settings ?? {},
      { inplace: false }
    );
    this.onSave = callbacks.onSave;
    this._rangeDragActive = false;
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0] ?? html;
    const content = root?.querySelector(".window-content") ?? root;

    if (this._editorClickHandler && content?.removeEventListener) {
      content.removeEventListener("click", this._editorClickHandler, true);
    }
    this._editorClickHandler = (event) => {
      const capture = event.target?.closest?.("[data-action='capture-scale']");
      if (!capture) return;
      event.preventDefault();
      const mapSize = getMapPixelSize();
      if (!mapSize) return;
      const next = {
        ...this._readSettingsForm(),
        scaleMapSize: { width: mapSize.width, height: mapSize.height }
      };
      this.settings = next;
      this._previewFromForm({ forceHighQuality: true });
    };
    content?.addEventListener("click", this._editorClickHandler, true);

    if (this._editorInputHandler && content?.removeEventListener) {
      content.removeEventListener("input", this._editorInputHandler, true);
      content.removeEventListener("change", this._editorInputHandler, true);
    }
    this._editorInputHandler = (event) => {
      const form = event.target?.closest?.("form");
      if (!form) return;
      const target = event.target;
      const isRange = target?.type === "range";
      const forceHighQuality = !(isRange && (this._rangeDragActive || event.type === "input"));
      this._previewFromForm({ forceHighQuality });
    };
    content?.addEventListener("input", this._editorInputHandler, true);
    content?.addEventListener("change", this._editorInputHandler, true);

    if (this._rangePointerDownHandler && content?.removeEventListener) {
      content.removeEventListener("pointerdown", this._rangePointerDownHandler, true);
    }
    this._rangePointerDownHandler = (event) => {
      if (event.target?.type !== "range") return;
      this._rangeDragActive = true;
    };
    content?.addEventListener("pointerdown", this._rangePointerDownHandler, true);

    if (this._rangePointerUpHandler && content?.removeEventListener) {
      content.removeEventListener("pointerup", this._rangePointerUpHandler, true);
      content.removeEventListener("pointercancel", this._rangePointerUpHandler, true);
    }
    this._rangePointerUpHandler = (event) => {
      if (!this._rangeDragActive) return;
      if (event.target?.type === "range") {
        this._rangeDragActive = false;
        this._previewFromForm({ forceHighQuality: true });
        return;
      }
      this._rangeDragActive = false;
    };
    content?.addEventListener("pointerup", this._rangePointerUpHandler, true);
    content?.addEventListener("pointercancel", this._rangePointerUpHandler, true);

    this._previewFromForm({ forceHighQuality: true });
  }

  async _prepareContext(options = {}) {
    const base = await super._prepareContext(options);
    return {
      ...base,
      settings: foundry.utils.mergeObject(
        foundry.utils.deepClone(DEFAULTS),
        this.settings ?? {},
        { inplace: false }
      )
    };
  }

  _previewFromForm(options = {}) {
    if (!this.route?.points || this.route.points.length < 2) return;
    const settings = this._readSettingsForm();
    const built = buildRouteFromPoints(this.route.points, settings);
    IndyRouteRenderer.renderStatic(
      built.path,
      built.settings,
      this.route.id,
      this.route.name,
      { forceHighQuality: options.forceHighQuality }
    );
  }


  _readSettingsForm() {
    const form = this._getFormElement();
    if (!form) return normalizeSettings(this.settings);

    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) data[key] = value;

    const checkboxNames = [
      "settings.showDot",
      "settings.showEndX",
      "settings.showLabel",
      "settings.labelFollowPath",
      "settings.labelShowArrow",
      "settings.scaleWithMap",
      "settings.cinematicMovement"
    ];
    for (const name of checkboxNames) {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) data[name] = el.checked;
    }

    const expanded = foundry.utils.expandObject(data);
    const s = expanded.settings ?? expanded;
    return normalizeSettings({
      ...this.settings,
      ...s
    });
  }

  async _handleSave() {
    const updatedSettings = this._readSettingsForm();
    let settings = updatedSettings;
    if (settings.scaleWithMap && !settings.scaleMapSize) {
      const mapSize = getMapPixelSize();
      if (mapSize) {
        settings = {
          ...settings,
          scaleMapSize: { width: mapSize.width, height: mapSize.height }
        };
      }
    }
    const updated = {
      ...this.route,
      settings,
      updatedAt: Date.now()
    };
    this.route = foundry.utils.deepClone(updated);
    this.settings = foundry.utils.deepClone(settings);
    if (this.onSave) await this.onSave(updated);
    this.close();
  }

  async close(options = {}) {
    IndyRouteRenderer.clearPreview();
    return super.close(options);
  }
}
