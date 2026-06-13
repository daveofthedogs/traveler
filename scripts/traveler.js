import { MODULE_ID, DEFAULTS, DEFAULT_TRAVEL_MODES, applyMapScaling, applyColorNumbers, normalizeSettings } from "./settings.js";
import { CHANNEL } from "./constants.js";
import { IndyRouteRenderer } from "./renderer.js";
import { IndyRouteTool } from "./tool.js";
import { IndyRouteManager } from "./apps/manager.js";
import { IndyRouteSettingsApp } from "./apps/settings-app.js";
import { IndyRouteTravelModesApp } from "./apps/travel-modes.js";
import { IndyRouteCurrenciesApp } from "./apps/currencies.js";
import { buildRouteFromPoints, getSceneRoutes, createRouteRecord } from "./routes.js";

/* -------------------------------------------- */
/* Settings registration + menu                 */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "routeSettings", {
    name: "Route Settings",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULTS
  });

  game.settings.register(MODULE_ID, "travelModes", {
    name: "Travel Modes",
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_TRAVEL_MODES
  });

  game.settings.register(MODULE_ID, "currencyConversions", {
    name: "Currency Conversions",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "routeSettingsMenu", {
    name: "Route Tools",
    label: "Configure Route Tools",
    hint: "Configure the route drawing animation settings.",
    icon: "fas fa-route",
    type: IndyRouteSettingsApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "travelModesMenu", {
    name: "Travel Modes",
    label: "Configure Travel Modes",
    hint: "Configure travel speeds and fares used in route tooltips.",
    icon: "fas fa-route",
    type: IndyRouteTravelModesApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "currencyConversionsMenu", {
    name: "Currency Conversions",
    label: "Configure Currency Conversions",
    hint: "Override currency conversions used in route cost breakdowns.",
    icon: "fas fa-coins",
    type: IndyRouteCurrenciesApp,
    restricted: true
  });

  game.settings.register(MODULE_ID, "ignoreCurrencies", {
    name: "Ignore Currencies",
    hint: "Comma-separated currency keys to omit from cost breakdowns.",
    scope: "world",
    config: true,
    type: String,
    default: "ep,pp"
  });
});

/* -------------------------------------------- */
/* Scene controls buttons (2 buttons)           */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  // Add to Drawings controls if present; otherwise fall back to Tokens.
  const group = controls.drawings ?? controls.tokens;
  if (!group?.tools) return;
  const order = Object.keys(group.tools).length;

  // v14: buttons use `onChange` (was `onClick` in v13) and require an `order` value.
  group.tools.travelerStart = {
    name: "travelerStart",
    title: "Route Manager",
    icon: "fa-solid fa-route",
    order,
    button: true,
    visible: game.user.isGM,
    onChange: () => IndyRouteManager.show()
  };

  group.tools.travelerClear = {
    name: "travelerClear",
    title: "Clear Routes",
    icon: "fa-solid fa-eraser",
    order: order + 1,
    button: true,
    visible: game.user.isGM,
    onChange: () => IndyRouteTool.clearAllBroadcast()
  };
});

/* -------------------------------------------- */
/* Socket: render + clear                       */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  const readBoolOption = (value) => {
    if (value === true || value === false) return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };

  const applyRouteOverrides = (settings, options = {}) => ({
    ...settings,
    ...(readBoolOption(options.cinematicMovement) !== undefined
      ? { cinematicMovement: readBoolOption(options.cinematicMovement) }
      : null),
    ...(Number.isFinite(options.drawSpeed) ? { drawSpeed: options.drawSpeed } : null),
    ...(Number.isFinite(options.lingerMs) ? { lingerMs: options.lingerMs } : null),
    ...(readBoolOption(options.labelShowArrow) !== undefined
      ? { labelShowArrow: readBoolOption(options.labelShowArrow) }
      : null),
    ...(readBoolOption(options.labelShow) !== undefined
      ? { showLabel: readBoolOption(options.labelShow) }
      : null),
    ...(options.labelFontFamily ? { labelFontFamily: options.labelFontFamily.toString() } : null),
    ...(readBoolOption(options.showEndX) !== undefined
      ? { showEndX: readBoolOption(options.showEndX) }
      : null)
  });

  const COMMON_ROUTE_OPTIONS = [
    "points",
    "path",
    "name",
    "cinematicMovement",
    "drawSpeed",
    "lingerMs",
    "labelShowArrow",
    "labelShow",
    "labelFontFamily",
    "showEndX",
    "settings",
    "sceneId"
  ];

  const resolveSettings = (settings) => {
    const base = normalizeSettings(settings ?? game.settings.get(MODULE_ID, "routeSettings"));
    const scaled = base.scaleWithMap ? applyMapScaling(base) : base;
    return applyColorNumbers(scaled);
  };

  const buildRoutePayload = (options = {}) => {
    const sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
    if (!sceneId) return null;
    let path = Array.isArray(options.path) ? options.path : null;
    let settings = null;
    if (!path && Array.isArray(options.points)) {
      const baseSettings = applyRouteOverrides(
        options.settings ?? game.settings.get(MODULE_ID, "routeSettings"),
        options
      );
      const built = buildRouteFromPoints(options.points, baseSettings);
      path = built.path;
      settings = built.settings;
    } else if (path) {
      const baseSettings = applyRouteOverrides(
        options.settings ?? game.settings.get(MODULE_ID, "routeSettings"),
        options
      );
      settings = resolveSettings(baseSettings);
    }
    if (!Array.isArray(path) || path.length < 2 || !settings) return null;
    return {
      sceneId,
      path,
      settings,
      startTime: Number.isFinite(options.startTime) ? options.startTime : Date.now(),
      lingerMs: Number.isFinite(options.lingerMs) ? options.lingerMs : settings.lingerMs,
      routeId: options.routeId ?? null,
      labelText: options.name ?? options.labelText ?? ""
    };
  };

  game.socket.on(CHANNEL, (data) => {
    if (!data) return;

    if (data.type === "TRAVELER_ROUTE") IndyRouteRenderer.render(data.payload);
    if (data.type === "TRAVELER_CLEAR_ROUTE") IndyRouteRenderer.clearRoute(data.payload?.routeId);
    if (data.type === "TRAVELER_CLEAR") IndyRouteRenderer.clearLocal();
  });

  const api = {
    drawRoute(options = {}) {
      const payload = buildRoutePayload(options);
      if (!payload) return null;
      const broadcast = options.broadcast !== false;
      if (broadcast) game.socket.emit(CHANNEL, { type: "TRAVELER_ROUTE", payload });
      IndyRouteRenderer.render(payload);
      return payload.routeId ?? null;
    },
    async createRoute(options = {}) {
      const points = Array.isArray(options.points) ? options.points : (Array.isArray(options.path) ? options.path : null);
      if (!points || points.length < 2) return null;
      const scene = options.sceneId ? game.scenes?.get?.(options.sceneId) : canvas?.scene;
      if (!scene) return null;
      const routes = foundry.utils.deepClone(scene.getFlag(MODULE_ID, "routes") ?? []);
      const baseSettings = applyRouteOverrides(
        options.settings ?? game.settings.get(MODULE_ID, "routeSettings"),
        options
      );
      const name = options.name ?? options.labelText ?? `Route ${routes.length + 1}`;
      const record = createRouteRecord(points, baseSettings, name);
      routes.push(record);
      await scene.setFlag(MODULE_ID, "routes", routes);
      return record.id;
    },
    playRoute(routeId, options = {}) {
      const id = routeId ?? options.routeId;
      if (!id) return null;
      const routes = getSceneRoutes();
      const route = routes.find((entry) => entry.id === id);
      if (!route?.points || route.points.length < 2) return null;
      IndyRouteRenderer.clearRoute(id);
      game.socket.emit(CHANNEL, { type: "TRAVELER_CLEAR_ROUTE", payload: { routeId: id } });
      const built = buildRouteFromPoints(route.points, route.settings);
      const overrideCinematicMovement = readBoolOption(options.cinematicMovement);
      const overrideLabelArrow = readBoolOption(options.labelShowArrow);
      const overrideDrawSpeed = options.drawSpeed;
      const settings = {
        ...built.settings,
        ...(overrideCinematicMovement !== undefined ? { cinematicMovement: overrideCinematicMovement } : null),
        ...(overrideLabelArrow !== undefined ? { labelShowArrow: overrideLabelArrow } : null),
        ...(Number.isFinite(overrideDrawSpeed) ? { drawSpeed: overrideDrawSpeed } : null)
      };
      const payload = {
        sceneId: canvas?.scene?.id ?? null,
        path: built.path,
        settings,
        startTime: Number.isFinite(options.startTime) ? options.startTime : Date.now(),
        lingerMs: Number.isFinite(options.lingerMs) ? options.lingerMs : settings.lingerMs,
        routeId: id,
        labelText: options.labelText ?? route.name
      };
      game.socket.emit(CHANNEL, { type: "TRAVELER_ROUTE", payload });
      IndyRouteRenderer.render(payload);
      return id;
    },
    async drawRouteToTile(routeIdOrOptions = {}, maybeOptions = {}) {
      const options = (typeof routeIdOrOptions === "string" || typeof routeIdOrOptions === "number")
        ? { ...maybeOptions, routeId: String(routeIdOrOptions) }
        : (routeIdOrOptions ?? {});
      const routeId = options.routeId;
      let path = Array.isArray(options.path) ? options.path : null;
      let settings = null;
      let labelText = options.labelText ?? "";
      if (routeId) {
        const routes = getSceneRoutes();
        const route = routes.find((entry) => entry.id === routeId);
        if (!route?.points || route.points.length < 2) return null;
        const built = buildRouteFromPoints(route.points, route.settings);
        path = built.path;
        const overrideLabelArrow = readBoolOption(options.labelShowArrow);
        const overrideDrawSpeed = options.drawSpeed;
        settings = {
          ...built.settings,
          ...(overrideLabelArrow !== undefined ? { labelShowArrow: overrideLabelArrow } : null),
          ...(Number.isFinite(overrideDrawSpeed) ? { drawSpeed: overrideDrawSpeed } : null)
        };
        if (!labelText) labelText = route.name ?? "";
      } else if (!path && Array.isArray(options.points)) {
        const built = buildRouteFromPoints(options.points, options.settings ?? game.settings.get(MODULE_ID, "routeSettings"));
        path = built.path;
        const overrideLabelArrow = readBoolOption(options.labelShowArrow);
        const overrideDrawSpeed = options.drawSpeed;
        settings = {
          ...built.settings,
          ...(overrideLabelArrow !== undefined ? { labelShowArrow: overrideLabelArrow } : null),
          ...(Number.isFinite(overrideDrawSpeed) ? { drawSpeed: overrideDrawSpeed } : null)
        };
      } else if (path) {
        settings = resolveSettings(options.settings ?? game.settings.get(MODULE_ID, "routeSettings"));
      }
      if (!Array.isArray(path) || path.length < 2 || !settings) return null;
      const showEndX = readBoolOption(options.showEndX);
      const includeEndX = showEndX === undefined ? true : showEndX;
      return IndyRouteRenderer.persistRouteToTile(path, settings, { includeEndX, labelText });
    },
    clearRoute(routeId) {
      if (!routeId) return;
      IndyRouteRenderer.clearRoute(routeId);
      game.socket.emit(CHANNEL, { type: "TRAVELER_CLEAR_ROUTE", payload: { routeId } });
    },
    clearAllRoutes() {
      IndyRouteTool.clearAllBroadcast();
    },
    listRoutes(sceneId) {
      const scene = sceneId ? game.scenes?.get?.(sceneId) : canvas?.scene;
      if (!scene) return [];
      const routes = scene.getFlag(MODULE_ID, "routes") ?? [];
      return foundry.utils.deepClone(routes);
    },
    getRouteByName(name, sceneId) {
      if (!name) return null;
      const routes = this.listRoutes(sceneId);
      const search = name.toString().trim().toLowerCase();
      if (!search) return null;
      return routes.find((route) => route?.name?.toString?.().trim().toLowerCase() === search) ?? null;
    },
    help() {
      const drawRouteOptions = [...COMMON_ROUTE_OPTIONS, "startTime", "routeId", "labelText", "broadcast"];
      const createRouteOptions = [...COMMON_ROUTE_OPTIONS];
      const playRouteOptions = ["startTime", "lingerMs", "labelText", "cinematicMovement", "labelShowArrow", "drawSpeed"];
      const drawRouteToTileOptions = ["routeId", "points", "path", "settings", "showEndX", "labelText", "labelShowArrow", "drawSpeed"];
      return {
        drawRoute: {
          description: "Draw and play a route immediately on the canvas.",
          signature: "drawRoute(options)",
          options: drawRouteOptions
        },
        createRoute: {
          description: "Create and save a route without playback.",
          signature: "createRoute(options)",
          options: createRouteOptions
        },
        playRoute: {
          description: "Play an existing saved route by id.",
          signature: "playRoute(routeId, options)",
          options: playRouteOptions
        },
        drawRouteToTile: {
          description: "Persist a route to a tile.",
          signature: "drawRouteToTile(routeIdOrOptions, options?)",
          options: drawRouteToTileOptions
        },
        clearRoute: {
          description: "Clear a route by id locally and for other clients.",
          signature: "clearRoute(routeId)"
        },
        clearAllRoutes: {
          description: "Clear all routes locally and for other clients.",
          signature: "clearAllRoutes()"
        },
        listRoutes: {
          description: "List routes for the current scene or a scene id.",
          signature: "listRoutes(sceneId?)"
        },
        getRouteByName: {
          description: "Find a route by name for the current scene or a scene id.",
          signature: "getRouteByName(name, sceneId?)"
        }
      };
    }
  };

  const module = game.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
});
