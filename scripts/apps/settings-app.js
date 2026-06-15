import { MODULE_ID, DEFAULTS, normalizeSettings, getMapPixelSize, getTravelModes } from "../settings.js";
import { createEncounterZone } from "../encounters.js";
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
      tabs: ["general", "line", "dot", "label", "animation", "camera", "smoothing", "encounters"],
      travelModes:  getTravelModes(),
      labelFonts:   this._getLabelFonts(),
      // Encounters tab context
      encounters:      this._prepareEncounters(),
      editingZoneId:   this._editingZoneId ?? null,
      rollTables:      this._getRollTables(),
      worldActors:     this._getWorldActors()
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

  /** Prepare encounter zones for the template (adds display-friendly fields). */
  _prepareEncounters() {
    const zones = this.route?.encounters ?? [];
    return zones.map((z) => ({
      ...z,
      tPct:         Math.round((z.t ?? 0.5) * 100),
      chancePct:    Math.round((z.chance ?? 0.3) * 100),
      frequencyPct: Math.round((z.frequency ?? 0.1) * 100)
    }));
  }

  /** Collect world RollTables for the zone editor <select>. */
  _getRollTables() {
    if (!game.tables) return [];
    return [...game.tables.values()].map((t) => ({ id: t.id, name: t.name }));
  }

  /** Collect world Actors for fixed-encounter <select>. */
  _getWorldActors() {
    if (!game.actors) return [];
    return [...game.actors.values()].map((a) => ({ id: a.id, name: a.name }));
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

      // ── Encounter editor actions ───────────────────────────────────────
      const action = event.target?.closest?.("[data-action]")?.dataset?.action;
      if (!action || !action.startsWith("add-zone") && !action.startsWith("edit-zone") &&
          !action.startsWith("delete-zone") && !action.startsWith("save-zone") &&
          action !== "cancel-zone-edit") return;
      event.preventDefault();
      const zoneId = event.target?.closest?.("[data-zone-id]")?.dataset?.zoneId ?? null;

      if (action === "add-zone-explicit") this._addEncounterZone("explicit");
      else if (action === "add-zone-auto")     this._addEncounterZone("auto");
      else if (action === "add-zone-fixed")    this._addEncounterZone("fixed");
      else if (action === "edit-zone")         { this._editingZoneId = zoneId; this.render({ force: true }); }
      else if (action === "cancel-zone-edit")  { this._editingZoneId = null;   this.render({ force: true }); }
      else if (action === "delete-zone")       this._deleteEncounterZone(zoneId);
      else if (action === "save-zone")         this._saveEncounterZone(zoneId, root);
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
      "settings.showLegMarkers",
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

  /** Returns the list of Scene Level documents for the current scene, or [] when none exist. */
  _getSceneLevels() {
    const levels = canvas?.scene?.levels;
    if (!levels?.size) return [];
    return Array.from(levels.values()).map((level) => ({
      id: level.id,
      name: level.name,
      elevationBottom: level.elevation?.bottom ?? 0,
      elevationTop: level.elevation?.top ?? 0
    }));
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
      ),
      sceneLevels: this._getSceneLevels()
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
      "settings.showLegMarkers",
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

    // When a Level is selected, derive the canonical defaultElevation from it.
    if (settings.levelId) {
      const level = canvas?.scene?.levels?.get?.(settings.levelId);
      if (level?.elevation?.bottom !== undefined) {
        settings = { ...settings, defaultElevation: level.elevation.bottom };
      }
    } else {
      settings = { ...settings, defaultElevation: 0 };
    }

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

  // ── Encounter zone CRUD ────────────────────────────────────────────────

  _addEncounterZone(type) {
    if (!this.route) return;
    this.route.encounters = this.route.encounters ?? [];
    const zone = createEncounterZone(type);
    this.route.encounters.push(zone);
    this._editingZoneId = zone.id;
    this.render({ force: true });
  }

  _deleteEncounterZone(zoneId) {
    if (!this.route || !zoneId) return;
    this.route.encounters = (this.route.encounters ?? []).filter((z) => z.id !== zoneId);
    if (this._editingZoneId === zoneId) this._editingZoneId = null;
    this.render({ force: true });
  }

  _saveEncounterZone(zoneId, root) {
    if (!this.route || !zoneId) return;
    const zone = (this.route.encounters ?? []).find((z) => z.id === zoneId);
    if (!zone) return;

    const form = (root instanceof HTMLElement ? root : root?.[0])
      ?.querySelector?.(`[data-zone-id="${zoneId}"] .enc-zone-form`);
    if (!form) { this._editingZoneId = null; this.render({ force: true }); return; }

    const v = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
    const cb = (name) => form.querySelector(`[name="${name}"]`)?.checked ?? false;

    if (zone.type !== "auto") {
      zone.t = Math.max(0, Math.min(1, parseFloat(v("enc-t")) / 100)) || 0.5;
    } else {
      zone.frequency = Math.max(0.01, Math.min(0.5, parseFloat(v("enc-frequency")) / 100)) || 0.1;
    }

    if (zone.type !== "fixed") {
      zone.chance   = Math.max(0.01, Math.min(1, parseFloat(v("enc-chance")) / 100)) || 0.3;
      zone.tableId   = v("enc-table") || null;
      const table    = zone.tableId ? game.tables?.get(zone.tableId) : null;
      zone.tableName = table?.name ?? zone.tableName ?? "";
    } else {
      zone.actorId   = v("enc-actor") || null;
      zone.chance    = 1;
    }

    zone.label       = v("enc-label");
    zone.environment = v("enc-environment");
    zone.chatMessage = cb("enc-chat");
    zone.createNote  = cb("enc-note");
    zone.spawnToken  = cb("enc-spawn");

    this._editingZoneId = null;
    this.render({ force: true });
  }

  // ──────────────────────────────────────────────────────────────────────────

  async close(options = {}) {
    IndyRouteRenderer.clearPreview();
    return super.close(options);
  }
}
