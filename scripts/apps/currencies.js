import { MODULE_ID } from "../settings.js";

export class IndyRouteCurrenciesApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    root: { id: "root", template: `modules/${MODULE_ID}/templates/currencies.hbs`, root: true }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "traveler-currencies",
    window: { title: "Traveler: Currency Conversions", resizable: true },
    position: { width: 520, height: 520 },
    classes: ["traveler", "traveler-currencies"]
  }, { inplace: false });

  static show() {
    this._instance ??= new IndyRouteCurrenciesApp();
    this._instance.currencies = this._instance._loadCurrencies();
    return this._instance.render({ force: true });
  }

  constructor(options = {}) {
    super(options);
    this.currencies = this._loadCurrencies();
  }

  _loadCurrencies() {
    const stored = game.settings.get(MODULE_ID, "currencyConversions");
    if (Array.isArray(stored) && stored.length) return foundry.utils.deepClone(stored);
    return this._getSystemCurrencies();
  }

  _getSystemCurrencies() {
    const systemId = game.system?.id ?? "";
    const sysConfig =
      CONFIG?.[systemId?.toUpperCase?.()] ??
      CONFIG?.[systemId] ??
      null;
    const currencies = sysConfig?.currencies;
    if (currencies && typeof currencies === "object") {
      const entries = Object.entries(currencies)
        .map(([key, data]) => ({
          key,
          label: data?.abbreviation ?? data?.label ?? key,
          conversion: Number(data?.conversion)
        }))
        .filter((entry) => entry.key && Number.isFinite(entry.conversion) && entry.conversion > 0);
      if (entries.length) return entries;
    }
    return [
      { key: "gp", label: "gp", conversion: 1 },
      { key: "sp", label: "sp", conversion: 10 },
      { key: "cp", label: "cp", conversion: 100 }
    ];
  }

  async _prepareContext() {
    return { currencies: this.currencies };
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
      const add = event.target?.closest?.("[data-action='add-currency']");
      if (add) {
        event.preventDefault();
        this._addCurrency();
        return;
      }
      const del = event.target?.closest?.("[data-action='delete-currency']");
      if (del) {
        event.preventDefault();
        this._deleteCurrency(Number(del.dataset.index));
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

  _addCurrency() {
    const next = { key: "", label: "", conversion: 1 };
    this.currencies = [...this.currencies, next];
    this.render({ force: true });
  }

  _deleteCurrency(index) {
    if (!Number.isFinite(index)) return;
    this.currencies = this.currencies.filter((_, idx) => idx !== index);
    this.render({ force: true });
  }

  _readForm() {
    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0];
    const form = root?.querySelector("form");
    if (!form) return this.currencies;
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) data[key] = value;
    const expanded = foundry.utils.expandObject(data);
    let raw = [];
    if (Array.isArray(expanded.currencies)) {
      raw = expanded.currencies;
    } else if (expanded.currencies && typeof expanded.currencies === "object") {
      raw = Object.keys(expanded.currencies)
        .map((key) => ({ key: Number(key), value: expanded.currencies[key] }))
        .filter((entry) => Number.isFinite(entry.key))
        .sort((a, b) => a.key - b.key)
        .map((entry) => entry.value);
    }
    const num = (v) => (v === "" || v === null || v === undefined) ? null : Number(v);
    return raw
      .map((entry) => ({
        key: (entry?.key ?? "").toString().trim(),
        label: (entry?.label ?? "").toString().trim() || (entry?.key ?? "").toString().trim(),
        conversion: num(entry?.conversion)
      }))
      .filter((entry) => entry.key && Number.isFinite(entry.conversion) && entry.conversion > 0);
  }

  async _handleSave() {
    const next = this._readForm();
    this.currencies = next;
    await game.settings.set(MODULE_ID, "currencyConversions", next);
    this.close();
  }
}
