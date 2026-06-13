export const MODULE_ID = "traveler";

/** Allowed values for the `playerRouteMode` world setting. */
export const PLAYER_ROUTE_MODE = {
  OFF: "off",
  IMMEDIATE: "immediate",
  APPROVAL: "approval"
};

/**
 * Read the current playerRouteMode world setting.
 * Safe to call before `game.settings` is ready (returns "off").
 * @returns {"off"|"immediate"|"approval"}
 */
export function getPlayerRouteMode() {
  try {
    return game.settings.get(MODULE_ID, "playerRouteMode") ?? PLAYER_ROUTE_MODE.OFF;
  } catch {
    return PLAYER_ROUTE_MODE.OFF;
  }
}

export const DEFAULTS = {
  lineColor: "#d61f1f",
  lineAlpha: 0.95,
  lineWidth: 16,
  dashLength: 0,
  gapLength: 0,
  showLabel: true,
  labelColor: "#f21c0d",
  labelFontFamily: "Modesto Condensed, serif",
  labelFontSize: 24,
  labelOffset: 16,
  labelFollowPath: true,
  labelShowArrow: false,
  labelPosition: 50,
  scaleWithMap: true,
  scaleMultiplier: 1,
  cinematicMovement: true,
  showEndX: true,
  renderAboveTokens: false,

  dotColor: "#f7f0e6",
  dotRadius: 18,
  showDot: true,
  dotTokenUuid: "",
  dotTokenRotate: false,
  dotTokenScale: 1,
  dotTokenRotateOffset: 0,
  routeSound: "",
  travelMode: "none",
  travelFareTier: "standard",

  drawSpeed: 400,
  lingerMs: -1,          // -1 = persist until cleared
  sampleStepPx: 8,

  introMs: 1500,
  pauseMs: 1500,
  cameraZoomFactor: 0.3,
  cameraSmooth: 0.15,
  tokenUpdateMs: 25,

  smoothingMode: "catmull", // "none" | "catmull" | "chaikin"

  catmullSamplesPerSegment: 16,
  catmullAlpha: 0.5,

  // v14 Scene Levels — stored on the route settings so they travel with the route record.
  levelId: null,          // Scene Level document ID this route is associated with.
  defaultElevation: 0     // Canonical elevation (level.elevation.bottom) for this route.
};

export const DEFAULT_TRAVEL_MODES = [
  // encounterMult: multiplier applied to each encounter zone's chance at this speed.
  // >1 = higher danger (less observant / more noise), <1 = lower danger.
  { id: "walk-slow",        label: "Walking (Slow)",     speedMph: 2,  perDayMiles: 18,  encounterMult: 0.7 },
  { id: "walk-normal",      label: "Walking (Normal)",   speedMph: 3,  perDayMiles: 24,  encounterMult: 1.0 },
  { id: "walk-fast",        label: "Walking (Fast)",     speedMph: 4,  perDayMiles: 30,  encounterMult: 1.3 },
  { id: "horseback",        label: "Horseback",          speedMph: 6,  perDayMiles: 50,  encounterMult: 1.6 },
  { id: "coach",            label: "Coach",              speedMph: 4,  perDayMiles: 35,  encounterMult: 1.4, costPerHour: { standard: 0.1 }, costPerDay: { standard: 1 } },
  { id: "orien-coach",      label: "Orien Coach",        speedMph: 6,  perDayMiles: 50,  encounterMult: 1.4, costPerHour: { standard: 1 },   costPerDay: { standard: 8 } },
  { id: "lightning-rail",   label: "Lightning Rail",     speedMph: 30, perDayMiles: 720, encounterMult: 0.5, costPerHour: { first: 15, standard: 6, steerage: 0.6 }, costPerDay: { first: 350, standard: 150, steerage: 15 } },
  { id: "sailing-ship",     label: "Sailing Ship",       speedMph: 3,  perDayMiles: 75,  encounterMult: 1.2, costPerHour: { standard: 0.3 }, costPerDay: { standard: 7.5 } },
  { id: "galleon",          label: "Galleon",            speedMph: 5,  perDayMiles: 120, encounterMult: 1.2, costPerHour: { first: 1.5, standard: 0.5, steerage: 0.1 }, costPerDay: { first: 35, standard: 12, steerage: 2.5 } },
  { id: "elemental-galleon",label: "Elemental Galleon",  speedMph: 10, perDayMiles: 250, encounterMult: 0.8, costPerHour: { first: 5, standard: 2, steerage: 0.2 }, costPerDay: { first: 120, standard: 50, steerage: 5 } },
  { id: "elemental-airship",label: "Elemental Airship",  speedMph: 20, perDayMiles: 500, encounterMult: 0.4, costPerHour: { standard: 20 }, costPerDay: { standard: 500 } }
];

export function getTravelModes() {
  const modes = game.settings.get(MODULE_ID, "travelModes");
  if (Array.isArray(modes) && modes.length) return foundry.utils.deepClone(modes);
  return foundry.utils.deepClone(DEFAULT_TRAVEL_MODES);
}

/**
 * Return the effective distance-per-grid-square for the current scene.
 * Priority: scene flag override → Foundry's built-in grid.distance → fallback 1.
 * @param {Scene} [scene]
 * @returns {{ distancePerSquare: number, units: string }}
 */
export function getSceneDistanceConfig(scene = canvas?.scene) {
  if (scene) {
    const flag = scene.getFlag?.(MODULE_ID, "sceneDistance");
    if (flag?.enabled && Number.isFinite(flag.distancePerSquare) && flag.distancePerSquare > 0) {
      return {
        distancePerSquare: flag.distancePerSquare,
        units: flag.units || "miles",
        overridden: true
      };
    }
  }
  const d = scene?.grid?.distance ?? scene?.gridDistance ?? 1;
  const u = scene?.grid?.units  ?? scene?.gridUnits ?? "";
  return { distancePerSquare: d || 1, units: u, overridden: false };
}

/**
 * Look up a travel mode by id across the GM-customised list.
 * Returns undefined if not found.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getTravelModeById(id) {
  if (!id || id === "none") return undefined;
  return getTravelModes().find((m) => m.id === id);
}

export function getViewPixelSizeForScale(scale) {
  const screen = canvas?.app?.renderer?.screen;
  if (screen?.width && screen?.height && scale > 0) {
    return { width: screen.width / scale, height: screen.height / scale };
  }
  return null;
}

export function getMapPixelSize() {
  const scene = canvas?.scene;
  if (!scene) return null;

  const scale = canvas?.stage?.scale?.x ?? canvas?.stage?.worldTransform?.a ?? 1;
  const viewSize = getViewPixelSizeForScale(scale);
  if (viewSize) return viewSize;

  const dims = scene.dimensions ?? canvas?.dimensions;
  const width =
    dims?.sceneWidth ??
    scene.width ??
    dims?.width ??
    scene.background?.width ??
    null;
  const height =
    dims?.sceneHeight ??
    scene.height ??
    dims?.height ??
    scene.background?.height ??
    null;
  if (!width || !height) return null;
  return { width, height };
}

export function applyMapScaling(settings, sizeOverride) {
  if (!settings.scaleWithMap) return settings;
  const size = sizeOverride ?? getMapPixelSize();
  if (!size) return settings;
  const base = Math.max(size.width, size.height) / 300;
  const mult = Number.isFinite(settings.scaleMultiplier) ? settings.scaleMultiplier : 1;
  const safeMult = mult > 0 ? mult : 1;
  const n = base * safeMult;
  return {
    ...settings,
    lineWidth: Math.max(1, n),
    dotRadius: Math.max(1, n * 1.3),
    drawSpeed: Math.max(1, n * 25),
    sampleStepPx: Math.max(1, n),
    labelFontSize: Math.min(200, Math.max(8, n * 3.8))
  };
}

export function getStageScale() {
  return canvas?.stage?.scale?.x ?? canvas?.stage?.worldTransform?.a ?? 1;
}

export function getCameraScaleForPath(totalLen, zoomFactor = DEFAULTS.cameraZoomFactor) {
  const screen = canvas?.app?.renderer?.screen;
  if (!screen || !totalLen) return null;
  const screenMax = Math.max(screen.width, screen.height);
  const targetScale = ((2 * screenMax) / totalLen) * zoomFactor;
  const dims = canvas?.scene?.dimensions ?? canvas?.dimensions;
  const sceneWidth =
    dims?.sceneWidth ??
    canvas?.scene?.width ??
    dims?.width ??
    null;
  const sceneHeight =
    dims?.sceneHeight ??
    canvas?.scene?.height ??
    dims?.height ??
    null;
  const sceneMinScale = (sceneWidth && sceneHeight)
    ? Math.max(screen.width / sceneWidth, screen.height / sceneHeight)
    : 0.2;
  const minScale = Math.max(0.2, sceneMinScale);
  const maxScale = 3;
  return Math.min(maxScale, Math.max(minScale, targetScale));
}

/** Parse a CSS hex colour string (with or without leading `#`) to a number. */
function _hexToNum(hex, fallback) {
  const h = (hex || fallback || "#000000").replace(/^#/, "");
  return parseInt(h, 16);
}

export function getSettings() {
  const s = applyMapScaling(game.settings.get(MODULE_ID, "routeSettings"));
  return {
    ...s,
    lineColorNum:  _hexToNum(s.lineColor,  DEFAULTS.lineColor),
    dotColorNum:   _hexToNum(s.dotColor,   DEFAULTS.dotColor),
    labelColorNum: _hexToNum(s.labelColor, DEFAULTS.labelColor)
  };
}

export function applyColorNumbers(settings) {
  return {
    ...settings,
    lineColorNum:  _hexToNum(settings.lineColor,  DEFAULTS.lineColor),
    dotColorNum:   _hexToNum(settings.dotColor,   DEFAULTS.dotColor),
    labelColorNum: _hexToNum(settings.labelColor, DEFAULTS.labelColor)
  };
}

export function normalizeSettings(s) {
  const num = (v) => (v === "" || v === null || v === undefined) ? v : Number(v);
  const step = num(s.sampleStepPx);
  const dash = num(s.dashLength);
  const gap = num(s.gapLength);
  return {
    ...s,
    lineAlpha: num(s.lineAlpha),
    lineWidth: num(s.lineWidth),
    dashLength: Number.isFinite(dash) && dash > 0 ? dash : null,
    gapLength: Number.isFinite(gap) && gap > 0 ? gap : null,
    dotRadius: num(s.dotRadius),
    labelFontSize: Number.isFinite(num(s.labelFontSize)) ? Math.min(200, num(s.labelFontSize)) : num(s.labelFontSize),
    labelOffset: num(s.labelOffset),
    labelPosition: num(s.labelPosition),
    drawSpeed: num(s.drawSpeed),
    lingerMs: num(s.lingerMs),
    sampleStepPx: Number.isFinite(step) ? Math.max(1, step) : step,
    scaleMultiplier: num(s.scaleMultiplier),
    catmullSamplesPerSegment: num(s.catmullSamplesPerSegment),
    catmullAlpha: num(s.catmullAlpha),
    introMs: num(s.introMs),
    pauseMs: num(s.pauseMs),
    cameraZoomFactor: num(s.cameraZoomFactor),
    cameraSmooth: num(s.cameraSmooth),
    tokenUpdateMs: num(s.tokenUpdateMs),
    showDot: !!s.showDot,
    dotTokenUuid: s.dotTokenUuid ?? "",
    dotTokenRotate: !!s.dotTokenRotate,
    dotTokenScale: num(s.dotTokenScale),
    dotTokenRotateOffset: num(s.dotTokenRotateOffset),
    routeSound: s.routeSound ?? "",
    travelMode: s.travelMode ?? "none",
    travelFareTier: s.travelFareTier ?? "standard",
    showLabel: !!s.showLabel,
    labelColor: s.labelColor ?? "#f7f0e6",
    labelFontFamily: (s.labelFontFamily ?? "Modesto Condensed, serif").toString(),
    labelFollowPath: s.labelFollowPath !== false,
    labelShowArrow: !!s.labelShowArrow,
    showEndX: !!s.showEndX,
    renderAboveTokens: !!s.renderAboveTokens,
    scaleWithMap: !!s.scaleWithMap,
    cinematicMovement: !!s.cinematicMovement,
    levelId: s.levelId ?? null,
    defaultElevation: num(s.defaultElevation) ?? 0
  };
}
