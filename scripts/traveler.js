import { MODULE_ID, DEFAULTS, DEFAULT_TRAVEL_MODES, applyMapScaling, applyColorNumbers, normalizeSettings } from "./settings.js";
import { CHANNEL } from "./constants.js";
import { IndyRouteRenderer } from "./renderer.js";
import { IndyRouteTool } from "./tool.js";
import { IndyRouteManager } from "./apps/manager.js";
import { IndyRouteSettingsApp } from "./apps/settings-app.js";
import { IndyRouteTravelModesApp } from "./apps/travel-modes.js";
import { IndyRouteCurrenciesApp } from "./apps/currencies.js";
import { buildRouteFromPoints, getSceneRoutes, createRouteRecord } from "./routes.js";
import { TravelerChangeLevelBehavior } from "./behaviors/change-level.js";
import { TravelerLevelCheckDialog } from "./behaviors/level-check-dialog.js";
import { PlayerRouteTool, proposalToPayload } from "./tool-player.js";
import { ProposalStore } from "./proposals.js";
import { PLAYER_ROUTE_MODE, getPlayerRouteMode } from "./settings.js";
import { MSG } from "./constants.js";
import { PartyConfigApp } from "./apps/party-config.js";
import { PartyCheckSession } from "./party.js";
import { registerAllSuites } from "../tests/quench/index.js";

/* -------------------------------------------- */
/* Settings registration + menu                 */
/* -------------------------------------------- */

Hooks.once("init", () => {
  /* ------------------------------------------------------------------ */
  /* Region Behavior — Change Level                                      */
  /* ------------------------------------------------------------------ */

  // Register the custom behavior type so Foundry's RegionConfig UI exposes it.
  CONFIG.RegionBehavior.dataModels["traveler.changeLevel"] = TravelerChangeLevelBehavior;

  // Wire TOKEN_MOVE_IN to the behavior's handler.
  // Done here (not at class-body level) so CONST.REGION_EVENTS is guaranteed
  // to be populated before the assignment runs.
  TravelerChangeLevelBehavior.events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: TravelerChangeLevelBehavior.prototype._handleMoveIn
  };

  // Pre-load Handlebars templates used by the behavior's dialog.
  loadTemplates([
    `modules/${MODULE_ID}/templates/level-check-dialog.hbs`,
    `modules/${MODULE_ID}/templates/encounter-dialog.hbs`,
    `modules/${MODULE_ID}/templates/encounter-editor.hbs`,
    `modules/${MODULE_ID}/templates/player-speed-dialog.hbs`,
    `modules/${MODULE_ID}/templates/scene-settings.hbs`,
    `modules/${MODULE_ID}/templates/party-config.hbs`,
    `modules/${MODULE_ID}/templates/party-check-collector.hbs`
  ]);

  // Expose encounter helpers on globalThis so renderer.js can use them
  // without a circular ESM import (renderer is a peer, not a child).
  import("./encounters.js").then((enc) => {
    globalThis.__travelerEncounters = {
      checkZones:        enc.checkZones,
      handleZoneFired:   enc.handleZoneFired,
      resetZoneTriggers: enc.resetZoneTriggers
    };
  });

  // Expose clock helper on globalThis for renderer finish() callback.
  import("./clock.js").then((clk) => {
    globalThis.__travelerClock = { advanceClock: clk.advanceClock };
  });

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

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

  game.settings.register(MODULE_ID, "parties", {
    name: "Parties",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "partiesMenu", {
    name: "Parties",
    label: "Configure Parties",
    hint: "Define party groups for overland travel with a shared party token.",
    icon: "fas fa-users",
    type: PartyConfigApp,
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

  game.settings.register(MODULE_ID, "playerRouteMode", {
    name: "Player Pathfinding",
    hint: "Allow players to draw travel routes for their own tokens using the pathfinding tool.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [PLAYER_ROUTE_MODE.OFF]:       "Off — GM only (default)",
      [PLAYER_ROUTE_MODE.IMMEDIATE]: "On — players can submit routes (plays immediately)",
      [PLAYER_ROUTE_MODE.APPROVAL]:  "On — players submit routes for GM approval"
    },
    default: PLAYER_ROUTE_MODE.OFF
  });

  game.settings.register(MODULE_ID, "worldClockEnabled", {
    name: "Advance World Clock on Route Playback",
    hint: "When the GM plays a route with a travel mode, automatically advance game.time.worldTime by the travel duration. Works with Simple Calendar and Seasons & Stars.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "playerSpeedPrompt", {
    name: "Prompt Players for Travel Speed",
    hint: "When a player submits a pathfinding route, show a dialog to select their travel speed (affects animation and encounter chance).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
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

  // Player pathfinding button — visible to players (and GM) when mode is not off.
  const playerMode = getPlayerRouteMode();
  if (playerMode !== PLAYER_ROUTE_MODE.OFF) {
    group.tools.travelerPlayerRoute = {
      name: "travelerPlayerRoute",
      title: "Plan My Route",
      icon: "fa-solid fa-person-walking-arrow-right",
      order: order + 2,
      button: true,
      visible: !game.user.isGM || true,  // visible to everyone when enabled
      onChange: () => PlayerRouteTool.start()
    };
  }
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
    let elevations = null;
    if (!path && Array.isArray(options.points)) {
      const baseSettings = applyRouteOverrides(
        options.settings ?? game.settings.get(MODULE_ID, "routeSettings"),
        options
      );
      const built = buildRouteFromPoints(options.points, baseSettings);
      path = built.path;
      settings = built.settings;
      elevations = built.elevations ?? null;
    } else if (path) {
      const baseSettings = applyRouteOverrides(
        options.settings ?? game.settings.get(MODULE_ID, "routeSettings"),
        options
      );
      settings = resolveSettings(baseSettings);
    }
    if (!Array.isArray(path) || path.length < 2 || !settings) return null;
    // Reset encounter zone triggers so they fire fresh each playback
    const encounters = Array.isArray(options.encounters) ? options.encounters : [];
    const { resetZoneTriggers } = globalThis.__travelerEncounters ?? {};
    if (resetZoneTriggers) resetZoneTriggers(encounters);

    return {
      sceneId,
      path,
      settings,
      startTime: Number.isFinite(options.startTime) ? options.startTime : Date.now(),
      lingerMs: Number.isFinite(options.lingerMs) ? options.lingerMs : settings.lingerMs,
      routeId: options.routeId ?? null,
      labelText: options.name ?? options.labelText ?? "",
      elevations,
      encounters
    };
  };

  game.socket.on(CHANNEL, (data) => {
    if (!data) return;

    // --- existing GM broadcast messages ---
    if (data.type === MSG.BROADCAST)   IndyRouteRenderer.render(data.payload);
    if (data.type === MSG.CLEAR_ROUTE) IndyRouteRenderer.clearRoute(data.payload?.routeId);
    if (data.type === MSG.CLEAR)       IndyRouteRenderer.clearLocal();

    // --- player pathfinding messages ---

    // Immediate mode: all clients play the route directly
    if (data.type === MSG.PLAYER_IMMEDIATE) {
      IndyRouteRenderer.render(data.payload);
    }

    // Approval mode: GM receives proposal and queues it
    if (data.type === MSG.PLAYER_PROPOSE && game.user.isGM) {
      const proposal = data.payload;
      if (!proposal?.id) return;
      ProposalStore.add(proposal);
      // Refresh the Route Manager if it is open
      IndyRouteManager._instance?.render({ force: false });
      ui.notifications.info(
        `Traveler | ${proposal.playerName} proposed a route for ${proposal.tokenName}.`
      );
    }

    // All clients: GM paused animation for an encounter dialog
    if (data.type === MSG.ENCOUNTER_PAUSE) {
      IndyRouteRenderer.pauseRoute(data.payload?.routeId);
    }

    // All clients: GM resumed animation after encounter dialog closed
    if (data.type === MSG.ENCOUNTER_RESUME) {
      IndyRouteRenderer.resumeRoute(data.payload?.routeId);
    }

    // --- party check protocol ---

    // Player receives a check request targeted at their userId
    if (data.type === MSG.PARTY_CHECK_REQUEST && data.payload?.userId === game.user.id) {
      const { sessionId, actorId, checkConfig } = data.payload;
      // Find a token for this actor on the current scene
      const tokenDoc = canvas.tokens?.placeables?.find?.(
        (t) => t.actor?.id === actorId
      )?.document ?? null;
      const dialog = new TravelerLevelCheckDialog({
        behavior:       checkConfig,
        tokenDoc,
        partySessionId: sessionId,
        partyActorId:   actorId
      });
      dialog.render({ force: true });
      // No need to await — result is submitted via socket in _submitResult
    }

    // GM receives an individual result back from a party member
    if (data.type === MSG.PARTY_CHECK_RESULT && game.user.isGM) {
      const { sessionId } = data.payload ?? {};
      const session = PartyCheckSession.get(sessionId);
      if (session) {
        session.addResult(data.payload);
        session._collector?.refresh?.();
      }
    }

    // All clients: GM approved — play the route and remove from store
    if (data.type === MSG.PLAYER_APPROVE) {
      const proposal = data.payload;
      if (!proposal?.id) return;
      ProposalStore.remove(proposal.id);
      IndyRouteRenderer.render(proposalToPayload(proposal));
      IndyRouteManager._instance?.render({ force: false });
      if (data.payload.userId === game.user.id) {
        ui.notifications.info("Your proposed route was approved!");
      }
    }

    // Targeted user: GM rejected
    if (data.type === MSG.PLAYER_REJECT) {
      if (data.payload?.userId !== game.user.id) return;
      const reason = data.payload?.reason ? `: ${data.payload.reason}` : ".";
      ui.notifications.warn(`Traveler | Your route proposal was rejected${reason}`);
    }
  });

  // Clear ephemeral proposals on scene change
  Hooks.on("canvasReady", () => {
    ProposalStore.clear();
    IndyRouteManager._instance?.render({ force: false });
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
      // Prepare encounters and reset trigger state for this playback
      const encounters = Array.isArray(route.encounters) ? foundry.utils.deepClone(route.encounters) : [];
      const { resetZoneTriggers } = globalThis.__travelerEncounters ?? {};
      if (resetZoneTriggers) resetZoneTriggers(encounters);

      const payload = {
        sceneId: canvas?.scene?.id ?? null,
        path: built.path,
        settings,
        startTime: Number.isFinite(options.startTime) ? options.startTime : Date.now(),
        lingerMs: Number.isFinite(options.lingerMs) ? options.lingerMs : settings.lingerMs,
        routeId: id,
        labelText: options.labelText ?? route.name,
        elevations: built.elevations ?? null,
        encounters
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

// ---------------------------------------------------------------------------
// Quench integration tests — registered only when the quench module is active
// ---------------------------------------------------------------------------
Hooks.once("quenchReady", (quench) => {
  registerAllSuites(quench);
});
