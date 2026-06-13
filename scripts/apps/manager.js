import { MODULE_ID, DEFAULTS, normalizeSettings, getTravelModes } from "../settings.js";
import { CHANNEL } from "../constants.js";
import { IndyRouteRenderer } from "../renderer.js";
import { IndyRouteTool } from "../tool.js";
import { buildRouteFromPoints, createRouteRecord, getSceneRoutes, setSceneRoutes } from "../routes.js";
import { IndyRouteEditor } from "./settings-app.js";

export class IndyRouteManager extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    root: { id: "root", template: `modules/${MODULE_ID}/templates/route-manager.hbs`, root: true }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "traveler-manager",
    window: { title: "Traveler Route Manager", resizable: true },
    position: { width: 580, height: 500 },
    classes: ["traveler", "traveler-manager"]
  }, { inplace: false });

  static show() {
    this._instance ??= new IndyRouteManager();
    return this._instance.render({ force: true });
  }

  constructor(options = {}) {
    super(options);
    this.selectedId = null;
    this._draggedRouteId = null;
    this._dragOverTarget = null;
    this._draggingItem = null;
  }

  _getTravelModeData(mode) {
    const modes = getTravelModes();
    return modes.find((entry) => entry.id === mode) ?? null;
  }

  _formatTravelTime(hours) {
    if (!Number.isFinite(hours)) return "";
    if (hours >= 24) {
      const days = Math.round((hours / 24) * 10) / 10;
      return `${days} days`;
    }
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} h`;
  }

  _formatTravelDays(days) {
    if (!Number.isFinite(days)) return "";
    const totalHours = days * 24;
    if (totalHours < 24) {
      const hours = Math.round(totalHours * 10) / 10;
      return `${hours} h`;
    }
    let fullDays = Math.floor(days);
    let remHours = Math.round((days - fullDays) * 24);
    if (remHours === 24) {
      fullDays += 1;
      remHours = 0;
    }
    if (remHours > 0) return `${fullDays} days ${remHours} h`;
    return `${fullDays} days`;
  }

  _formatCostCurrency(cost) {
    if (!Number.isFinite(cost)) return "";
    const ignore = this._getIgnoredCurrencies();
    let entries = [];
    const configured = game.settings.get(MODULE_ID, "currencyConversions");
    if (Array.isArray(configured) && configured.length) {
      entries = configured
        .map((entry) => ({
          key: (entry?.key ?? "").toString(),
          label: (entry?.label ?? entry?.key ?? "").toString(),
          conversion: Number(entry?.conversion)
        }))
        .filter((entry) => entry.key && Number.isFinite(entry.conversion) && entry.conversion > 0)
        .filter((entry) => !ignore.has(entry.key.toLowerCase()));
    } else {
      const systemId = game.system?.id ?? "";
      const sysConfig =
        CONFIG?.[systemId?.toUpperCase?.()] ??
        CONFIG?.[systemId] ??
        null;
      const currencies = sysConfig?.currencies;
      if (currencies && typeof currencies === "object") {
        entries = Object.entries(currencies)
          .map(([key, data]) => ({
            key,
            label: data?.abbreviation ?? data?.label ?? key,
            conversion: Number(data?.conversion)
          }))
          .filter((entry) => Number.isFinite(entry.conversion) && entry.conversion > 0)
          .filter((entry) => !ignore.has(entry.key.toLowerCase()));
      }
    }

    if (!entries.length) {
      entries = [
        { key: "gp", label: "gp", conversion: 1 },
        { key: "sp", label: "sp", conversion: 10 },
        { key: "cp", label: "cp", conversion: 100 }
      ].filter((entry) => !ignore.has(entry.key));
    }

    if (!entries.length) return "";

    // Smaller conversion means higher value (fewer units per gp), so sort ascending.
    entries.sort((a, b) => a.conversion - b.conversion);

    const smallestConv = Math.max(...entries.map((entry) => entry.conversion));
    let remainingUnits = Math.round(cost * smallestConv);
    const parts = [];
    entries.forEach((entry, index) => {
      const conv = entry.conversion;
      if (!Number.isFinite(conv) || conv <= 0) return;
      const isLast = index === entries.length - 1;
      const unitFactor = smallestConv / conv;
      const raw = remainingUnits / unitFactor;
      const qty = isLast ? Math.round(raw) : Math.floor(raw);
      if (qty > 0 || (isLast && parts.length === 0)) {
        parts.push(`${qty} ${entry.label}`);
      }
      remainingUnits -= Math.round(qty * unitFactor);
    });
    return parts.join(" ");
  }

  _getIgnoredCurrencies() {
    const raw = (game.settings.get(MODULE_ID, "ignoreCurrencies") ?? "").toString();
    return new Set(
      raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  _getRouteLengthLabel(route) {
    if (!route?.points || route.points.length < 2) return "";
    const gridSize = canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? null;
    const gridDistance = canvas?.scene?.grid?.distance ?? canvas?.scene?.gridDistance ?? null;
    if (!gridSize || !gridDistance) return "";
    const built = buildRouteFromPoints(route.points, route.settings);
    const path = built?.path ?? route.points;
    let totalPx = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      totalPx += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const totalUnits = (totalPx / gridSize) * gridDistance;
    const useMiles = route?.settings?.travelMode && route.settings.travelMode !== "none";
    const units = useMiles ? "mi" : (canvas?.scene?.grid?.units ?? canvas?.scene?.gridUnits ?? "units");
    const rounded = Math.round(totalUnits * 100) / 100;
    const distanceLabel = `Length: ${rounded} ${units}`;
    if (useMiles) {
      const travel = this._getTravelModeData(route.settings.travelMode);
      const perDay = travel?.perDayMiles;
      const hours = travel?.speedMph ? (totalUnits / travel.speedMph) : null;
      const days = perDay ? (totalUnits / perDay) : null;
      let dayCount = Number.isFinite(days) ? Math.floor(days) : null;
      let partialHours = null;
      if (Number.isFinite(days) && perDay && travel?.speedMph) {
        const remainingMiles = totalUnits - dayCount * perDay;
        partialHours = Math.max(0, remainingMiles) / travel.speedMph;
      }
      const useHourlyOnly = !Number.isFinite(days);
      const timeLabel = useHourlyOnly
        ? this._formatTravelTime(hours)
        : (dayCount > 0
          ? `${dayCount} days${partialHours ? ` ${this._formatTravelTime(partialHours)}` : ""}`
          : this._formatTravelTime(partialHours ?? hours));
      const tier = route.settings.travelFareTier ?? "standard";
      const dayRate = travel?.costPerDay?.[tier] ?? travel?.costPerDay?.standard ?? null;
      const hourRate = travel?.costPerHour?.[tier] ?? travel?.costPerHour?.standard ?? null;
      const cost = useHourlyOnly
        ? (Number.isFinite(hourRate) && Number.isFinite(hours) ? hourRate * hours : null)
        : ((Number.isFinite(dayRate) && Number.isFinite(dayCount) ? dayRate * dayCount : 0) +
          (Number.isFinite(hourRate) && Number.isFinite(partialHours) ? hourRate * partialHours : 0));
      const costLabel = this._formatCostCurrency(cost);
      const modeLabel = travel?.label ? `Mode: ${travel.label}` : null;
      const firstLine = [distanceLabel, timeLabel ? `Time: ${timeLabel}` : null]
        .filter(Boolean)
        .join(" | ");
      const lines = [
        firstLine || null,
        modeLabel,
        costLabel ? `Cost: ${costLabel}` : null
      ].filter(Boolean);
      return lines.join("<br>");
    }
    return distanceLabel;
  }

  async _prepareContext() {
    const routes = getSceneRoutes().map((route) => ({
      ...route,
      lengthLabel: this._getRouteLengthLabel(route)
    }));
    return {
      routes,
      selectedId: this.selectedId
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // handled in _attachPartListeners for ApplicationV2 parts
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0] ?? html;
    const content = root?.querySelector(".window-content") ?? root;

    if (this._managerClickHandler && content?.removeEventListener) {
      content.removeEventListener("click", this._managerClickHandler, true);
    }
    this._managerClickHandler = (event) => {
      if (event.target?.closest?.("input, textarea, select")) return;
      const draw = event.target?.closest?.("[data-action='draw-route']");
      if (draw) {
        event.preventDefault();
        this._drawRoute();
        return;
      }
      const exportBtn = event.target?.closest?.("[data-action='export-routes']");
      if (exportBtn) {
        event.preventDefault();
        this._exportRoutes();
        return;
      }
      const importBtn = event.target?.closest?.("[data-action='import-routes']");
      if (importBtn) {
        event.preventDefault();
        this._importRoutes();
        return;
      }
      const play = event.target?.closest?.("[data-action='play-route']");
      if (play) {
        event.preventDefault();
        event.stopPropagation();
        this._playRoute(play.dataset.routeId);
        return;
      }
      const preview = event.target?.closest?.("[data-action='preview-route']");
      if (preview) {
        event.preventDefault();
        event.stopPropagation();
        this._previewPlayback(preview.dataset.routeId);
        return;
      }
      const editPoints = event.target?.closest?.("[data-action='edit-points']");
      if (editPoints) {
        event.preventDefault();
        event.stopPropagation();
        this._editRoutePoints(editPoints.dataset.routeId);
        return;
      }
      const edit = event.target?.closest?.("[data-action='edit-route']");
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        this._editRoute(edit.dataset.routeId);
        return;
      }
      const del = event.target?.closest?.("[data-action='delete-route']");
      if (del) {
        event.preventDefault();
        event.stopPropagation();
        this._deleteRoute(del.dataset.routeId);
        return;
      }
      const clear = event.target?.closest?.("[data-action='clear-route']");
      if (clear) {
        event.preventDefault();
        event.stopPropagation();
        this._clearRoute(clear.dataset.routeId);
        return;
      }
      const persist = event.target?.closest?.("[data-action='persist-route']");
      if (persist) {
        event.preventDefault();
        event.stopPropagation();
        this._persistRoute(persist.dataset.routeId);
        return;
      }
      const select = event.target?.closest?.("[data-action='select-route']");
      if (select) {
        event.preventDefault();
        this._selectRoute(select.dataset.routeId);
      }
    };
    content?.addEventListener("click", this._managerClickHandler, true);

    if (this._renameHandler && content?.removeEventListener) {
      content.removeEventListener("change", this._renameHandler, true);
    }
    this._renameHandler = (event) => {
      const rename = event.target?.closest?.("[data-action='rename-route']");
      if (!rename) return;
      event.stopPropagation();
      this._renameRoute(rename.dataset.routeId, rename.value);
    };
    content?.addEventListener("change", this._renameHandler, true);


    if (this._routeDragStartHandler && content?.removeEventListener) {
      content.removeEventListener("dragstart", this._routeDragStartHandler, true);
    }
    this._routeDragStartHandler = (event) => {
      const handle = event.target?.closest?.("[data-drag-handle]");
      if (!handle) return;
      const item = handle.closest?.(".route-item[data-route-id]");
      if (!item) return;
      const routeId = item.dataset.routeId;
      if (!routeId) return;
      this._draggedRouteId = routeId;
      this._draggingItem = item;
      item.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", routeId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    };
    content?.addEventListener("dragstart", this._routeDragStartHandler, true);

    if (this._routeDragEndHandler && content?.removeEventListener) {
      content.removeEventListener("dragend", this._routeDragEndHandler, true);
    }
    this._routeDragEndHandler = () => {
      this._clearRouteDragState();
    };
    content?.addEventListener("dragend", this._routeDragEndHandler, true);

    if (this._routeDragOverHandler && content?.removeEventListener) {
      content.removeEventListener("dragover", this._routeDragOverHandler, true);
    }
    this._routeDragOverHandler = (event) => {
      if (!this._draggedRouteId) return;
      if (event.target?.closest?.("input, textarea, select")) {
        event.stopPropagation();
        return;
      }
      const item = event.target?.closest?.(".route-item[data-route-id]");
      if (!item) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this._setDragOverTarget(item);
    };
    content?.addEventListener("dragover", this._routeDragOverHandler, true);

    if (this._routeDragLeaveHandler && content?.removeEventListener) {
      content.removeEventListener("dragleave", this._routeDragLeaveHandler, true);
    }
    this._routeDragLeaveHandler = (event) => {
      if (!this._draggedRouteId) return;
      const item = event.target?.closest?.(".route-item[data-route-id]");
      if (!item) return;
      const related = event.relatedTarget;
      if (related && item.contains(related)) return;
      if (this._dragOverTarget === item) this._setDragOverTarget(null);
    };
    content?.addEventListener("dragleave", this._routeDragLeaveHandler, true);

    if (this._routeDropHandler && content?.removeEventListener) {
      content.removeEventListener("drop", this._routeDropHandler, true);
    }
    this._routeDropHandler = async (event) => {
      const item = event.target?.closest?.(".route-item[data-route-id]");
      if (!item || !this._draggedRouteId) return;
      event.preventDefault();
      event.stopPropagation();
      this._setDragOverTarget(null);
      const dropId = item.dataset.routeId;
      if (!dropId) return;
      const routes = getSceneRoutes();
      const draggedIndex = routes.findIndex((route) => route.id === this._draggedRouteId);
      if (draggedIndex === -1) return;
      const [moved] = routes.splice(draggedIndex, 1);
      const targetIndex = routes.findIndex((route) => route.id === dropId);
      if (targetIndex === -1) return;
      routes.splice(targetIndex, 0, moved);
      await setSceneRoutes(routes);
      this.selectedId = moved.id;
      this._clearRouteDragState();
      this.render({ force: true });
    };
    content?.addEventListener("drop", this._routeDropHandler, true);
  }

  async close(options = {}) {
    IndyRouteRenderer.clearPreview();
    return super.close(options);
  }

  async _drawRoute() {
    const routes = getSceneRoutes();
    const defaultName = `Route ${routes.length + 1}`;

    IndyRouteTool.start({
      autoPlay: false,
      onComplete: async (data) => {
        const record = createRouteRecord(data.points, data.baseSettings, defaultName);
        routes.push(record);
        await setSceneRoutes(routes);
        this.selectedId = record.id;
        this._previewRoute(record);
        this.render({ force: true });
      }
    });
  }

  _getRoute(routeId) {
    const routes = getSceneRoutes();
    return routes.find((route) => route.id === routeId);
  }

  _previewRoute(route) {
    if (!route?.points || route.points.length < 2) {
      IndyRouteRenderer.clearPreview();
      return;
    }
    const built = buildRouteFromPoints(route.points, route.settings);
    IndyRouteRenderer.renderStatic(built.path, built.settings, route.id, route.name);
  }

  async _selectRoute(routeId) {
    this.selectedId = routeId;
    const route = this._getRoute(routeId);
    if (route) this._previewRoute(route);
    this.render({ force: true });
  }

  _playRoute(routeId) {
    const route = this._getRoute(routeId);
    if (!route?.points || route.points.length < 2) return;
    IndyRouteRenderer.clearRoute(routeId);
    game.socket.emit(CHANNEL, { type: "TRAVELER_CLEAR_ROUTE", payload: { routeId } });
    const built = buildRouteFromPoints(route.points, route.settings);
    const payload = {
      sceneId: canvas.scene.id,
      path: built.path,
      settings: built.settings,
      startTime: Date.now(),
      lingerMs: built.settings.lingerMs,
      routeId,
      labelText: route.name
    };
    game.socket.emit(CHANNEL, { type: "TRAVELER_ROUTE", payload });
    IndyRouteRenderer.render(payload);
  }

  _previewPlayback(routeId) {
    const route = this._getRoute(routeId);
    if (!route?.points || route.points.length < 2) return;
    IndyRouteRenderer.clearRoute(routeId);
    const built = buildRouteFromPoints(route.points, route.settings);
    const payload = {
      sceneId: canvas.scene.id,
      path: built.path,
      settings: built.settings,
      startTime: Date.now(),
      lingerMs: built.settings.lingerMs,
      routeId,
      labelText: route.name,
      preview: true
    };
    IndyRouteRenderer.render(payload);
  }

  async _persistRoute(routeId) {
    const route = this._getRoute(routeId);
    if (!route?.points || route.points.length < 2) return;
    const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
    const includeEndX = await dialogApi.confirm({
      title: "Persist Route to Tile",
      content: "<p>Draw ending cross on the tile?</p>"
    });
    const built = buildRouteFromPoints(route.points, route.settings);
    const created = await IndyRouteRenderer.persistRouteToTile(built.path, built.settings, {
      includeEndX,
      labelText: route.name
    });
    if (!created) {
      ui.notifications.warn("Unable to persist route to a tile.");
    }
  }

  _clearRoute(routeId) {
    IndyRouteRenderer.clearRoute(routeId);
    game.socket.emit(CHANNEL, { type: "TRAVELER_CLEAR_ROUTE", payload: { routeId } });
  }

  async _deleteRoute(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    const escapeHtml = (value) => {
      if (foundry.utils.escapeHTML) return foundry.utils.escapeHTML(value);
      if (foundry.utils.escapeHtml) return foundry.utils.escapeHtml(value);
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };
    const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
    const confirmed = await dialogApi.confirm({
      title: "Delete Route",
      content: `<p>Delete <strong>${escapeHtml(route.name)}</strong>?</p>`
    });
    if (!confirmed) return;

    const nextRoutes = routes.filter((r) => r.id !== routeId);
    await setSceneRoutes(nextRoutes);
    if (this.selectedId === routeId) {
      this.selectedId = null;
      IndyRouteRenderer.clearPreview();
    }
    this.render({ force: true });
  }

  _setDragOverTarget(target) {
    if (this._dragOverTarget && this._dragOverTarget !== target) {
      this._dragOverTarget.classList.remove("drag-over");
    }
    this._dragOverTarget = target;
    if (target) target.classList.add("drag-over");
  }

  _clearRouteDragState() {
    if (this._draggingItem) {
      this._draggingItem.classList.remove("dragging");
      this._draggingItem = null;
    }
    this._setDragOverTarget(null);
    this._draggedRouteId = null;
  }

  async _renameRoute(routeId, name) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    route.name = name?.trim() || route.name;
    route.updatedAt = Date.now();
    await setSceneRoutes(routes);
    this.render({ force: true });
  }

  _exportRoutes() {
    const routes = getSceneRoutes();
    const payload = {
      sceneId: canvas?.scene?.id ?? null,
      exportedAt: Date.now(),
      routes
    };
    const fileName = `traveler-${canvas?.scene?.id ?? "routes"}.json`;
    // v14: saveDataToFile global removed; use foundry.utils.saveDataToFile.
    foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", fileName);
  }

  _importRoutes() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
      const confirmed = await dialogApi.confirm({
        title: "Import Routes",
        content: "<p>Importing routes will overwrite existing routes for this scene. Continue?</p>"
      });
      if (!confirmed) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (err) {
        ui.notifications.error("Invalid JSON file.");
        return;
      }
      const rawRoutes = Array.isArray(parsed?.routes) ? parsed.routes : (Array.isArray(parsed) ? parsed : []);
      const routes = rawRoutes
        .filter((r) => Array.isArray(r?.points) && r.points.length >= 2)
        .map((r) => ({
          id: r.id ?? foundry.utils.randomID(),
          name: (r.name ?? "Imported Route").toString(),
          points: r.points.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
          settings: normalizeSettings({ ...DEFAULTS, ...(r.settings ?? {}) }),
          createdAt: r.createdAt ?? Date.now(),
          updatedAt: Date.now()
        }));
      await setSceneRoutes(routes);
      this.selectedId = null;
      IndyRouteRenderer.clearPreview();
      this.render({ force: true });
      ui.notifications.info(`Imported ${routes.length} routes.`);
    }, { once: true });
    input.click();
  }

  _editRoutePoints(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    IndyRouteTool.start({
      initialPoints: route.points,
      baseSettings: route.settings,
      autoPlay: false,
      onComplete: async (data) => {
        route.points = data.points.map((p) => ({ x: p.x, y: p.y }));
        route.updatedAt = Date.now();
        await setSceneRoutes(routes);
        this.selectedId = route.id;
        this._previewRoute(route);
        this.render({ force: true });
      }
    });
  }

  _editRoute(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    const editor = new IndyRouteEditor(route, {
      onSave: async (updated) => {
        const idx = routes.findIndex((r) => r.id === updated.id);
        if (idx >= 0) routes[idx] = updated;
        await setSceneRoutes(routes);
        this.selectedId = updated.id;
        this._previewRoute(updated);
        this.render({ force: true });
      }
    });

    editor.render({ force: true });
  }
}
