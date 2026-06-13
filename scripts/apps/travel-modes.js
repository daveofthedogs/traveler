import { MODULE_ID, DEFAULT_TRAVEL_MODES } from "../settings.js";

export class IndyRouteTravelModesApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    root: { id: "root", template: `modules/${MODULE_ID}/templates/travel-modes.hbs`, root: true }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "traveler-travel-modes",
    window: { title: "Traveler: Travel Modes", resizable: true },
    position: { width: 640, height: 520 },
    classes: ["traveler", "traveler-travel-modes"]
  }, { inplace: false });

  static show() {
    this._instance ??= new IndyRouteTravelModesApp();
    this._instance.modes = this._instance._loadModes();
    return this._instance.render({ force: true });
  }

  constructor(options = {}) {
    super(options);
    this.modes = this._loadModes();
  }

  _loadModes() {
    const stored = game.settings.get(MODULE_ID, "travelModes");
    if (Array.isArray(stored) && stored.length) return foundry.utils.deepClone(stored);
    return foundry.utils.deepClone(DEFAULT_TRAVEL_MODES);
  }

  async _prepareContext() {
    return { modes: this.modes, currencyLabel: this._getCurrencyLabel() };
  }

  _getCurrencyLabel() {
    const configured = game.settings.get(MODULE_ID, "currencyConversions");
    if (Array.isArray(configured) && configured.length) {
      const entries = configured
        .map((entry) => ({
          key: (entry?.key ?? "").toString(),
          label: (entry?.label ?? entry?.key ?? "").toString(),
          conversion: Number(entry?.conversion)
        }))
        .filter((entry) => entry.key && Number.isFinite(entry.conversion) && entry.conversion > 0)
        .sort((a, b) => a.conversion - b.conversion);
      const base = entries.find((entry) => entry.conversion === 1) ?? entries[0];
      return base?.label ?? "currency";
    }
    const systemId = game.system?.id ?? "";
    const sysConfig =
      CONFIG?.[systemId?.toUpperCase?.()] ??
      CONFIG?.[systemId] ??
      null;
    const currencies = sysConfig?.currencies;
    if (window?.TRAVELER_DEBUG) {
      console.info("[IndyRoute] currency lookup", { systemId, sysConfig, currencies });
    }
    if (!currencies || typeof currencies !== "object") return "gp";
    if (currencies.gp) {
      const label = currencies.gp.abbreviation ?? currencies.gp.label ?? "gp";
      if (window?.TRAVELER_DEBUG) {
        console.info("[IndyRoute] currency label", { label });
      }
      return label;
    }
    const entries = Object.entries(currencies)
      .map(([key, data]) => ({
        key,
        label: data?.abbreviation ?? data?.label ?? key,
        conversion: Number(data?.conversion)
      }))
      .filter((entry) => Number.isFinite(entry.conversion) && entry.conversion > 0)
      .sort((a, b) => a.conversion - b.conversion);
    const base = entries.find((entry) => entry.conversion === 1) ?? entries[0];
    const label = base?.label ?? "currency";
    if (window?.TRAVELER_DEBUG) {
      console.info("[IndyRoute] currency label", { label, entries });
    }
    return label;
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0] ?? html;
    const content = root?.querySelector(".window-content") ?? root;

    if (this._clickHandler && content?.removeEventListener) {
      content.removeEventListener("click", this._clickHandler, true);
    }
    this._clickHandler = (event) => {
      const add = event.target?.closest?.("[data-action='add-mode']");
      if (add) {
        event.preventDefault();
        this._addMode();
        return;
      }
      const del = event.target?.closest?.("[data-action='delete-mode']");
      if (del) {
        event.preventDefault();
        this._deleteMode(Number(del.dataset.index));
        return;
      }
      const save = event.target?.closest?.("[data-action='save']");
      if (save) {
        event.preventDefault();
        this._handleSave();
        return;
      }
      const cancel = event.target?.closest?.("[data-action='cancel']");
      if (cancel) {
        event.preventDefault();
        this.close();
      }
    };
    content?.addEventListener("click", this._clickHandler, true);
  }

  _addMode() {
    const next = {
      id: foundry.utils.randomID(),
      label: "New Mode",
      speedMph: 0,
      perDayMiles: 0,
      costPerHour: { first: null, standard: null, steerage: null },
      costPerDay: { first: null, standard: null, steerage: null }
    };
    this.modes = [...this.modes, next];
    this.render({ force: true });
  }

  _deleteMode(index) {
    if (!Number.isFinite(index)) return;
    this.modes = this.modes.filter((_, idx) => idx !== index);
    this.render({ force: true });
  }

  _readForm() {
    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0];
    const form = root?.querySelector("form");
    if (!form) return this.modes;
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) data[key] = value;
    const expanded = foundry.utils.expandObject(data);
    let rawModes = [];
    if (Array.isArray(expanded.modes)) {
      rawModes = expanded.modes;
    } else if (expanded.modes && typeof expanded.modes === "object") {
      rawModes = Object.keys(expanded.modes)
        .map((key) => ({ key: Number(key), value: expanded.modes[key] }))
        .filter((entry) => Number.isFinite(entry.key))
        .sort((a, b) => a.key - b.key)
        .map((entry) => entry.value);
    }
    return rawModes.map((mode, idx) => {
      const base = this.modes[idx] ?? {};
      const num = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);
      const cleanTier = (obj) => ({
        first: num(obj?.first),
        standard: num(obj?.standard),
        steerage: num(obj?.steerage)
      });
      return {
        id: base.id ?? foundry.utils.randomID(),
        label: (mode?.label ?? base.label ?? "Travel Mode").toString(),
        speedMph: num(mode?.speedMph),
        perDayMiles: num(mode?.perDayMiles),
        costPerHour: cleanTier(mode?.costPerHour),
        costPerDay: cleanTier(mode?.costPerDay)
      };
    });
  }

  async _handleSave() {
    const next = this._readForm();
    this.modes = next;
    await game.settings.set(MODULE_ID, "travelModes", next);
    this.close();
  }
}
