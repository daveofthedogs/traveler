import { MODULE_ID, normalizeSettings, getSceneDistanceConfig, getTravelModeById } from "./settings.js";

/** @typedef {{ x: number, y: number, hours: number }} LegMarkerPoint */

/**
 * Route travel mode, then world default, then walk-normal for time estimates.
 * @param {{ travelMode?: string } | null | undefined} settings
 * @returns {{ modeId: string, source: "route"|"global"|"default" }}
 */
export function resolveEffectiveTravelMode(settings) {
  const routeMode = settings?.travelMode;
  if (routeMode && routeMode !== "none") {
    return { modeId: routeMode, source: "route" };
  }
  try {
    const globalMode = normalizeSettings(game.settings.get(MODULE_ID, "routeSettings"))?.travelMode;
    if (globalMode && globalMode !== "none") {
      return { modeId: globalMode, source: "global" };
    }
  } catch {}
  return { modeId: "walk-normal", source: "default" };
}

/**
 * @param {number} value
 * @param {"min"|"h"|"d"|string} unit
 * @returns {number|null}
 */
export function legMarkerIntervalToHours(value, unit) {
  if (!Number.isFinite(value) || value <= 0) return null;
  switch (unit) {
    case "min":
      return value / 60;
    case "d":
      return value * 24;
    case "h":
    default:
      return value;
  }
}

/**
 * @param {{ x: number, y: number }[]} path
 * @param {number} gridSize
 * @param {number} distancePerSquare
 */
function buildPathDistances(path, gridSize, distancePerSquare) {
  const world = [0];
  for (let i = 1; i < path.length; i++) {
    const segPx = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    const prevWorld = world[i - 1];
    world.push(prevWorld + (segPx / gridSize) * distancePerSquare);
  }
  return { world, totalWorld: world[world.length - 1] ?? 0 };
}

/**
 * @param {{ x: number, y: number }[]} path
 * @param {number[]} px
 * @param {number[]} world
 * @param {number} targetWorld
 * @returns {{ x: number, y: number }}
 */
function pointAtWorldDistance(path, world, targetWorld) {
  if (targetWorld <= 0) return { x: path[0].x, y: path[0].y };
  for (let i = 1; i < path.length; i++) {
    if (world[i] >= targetWorld) {
      const segWorld = world[i] - world[i - 1];
      const t = segWorld > 0 ? (targetWorld - world[i - 1]) / segWorld : 0;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t
      };
    }
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * Compute marker positions spaced by travel time along a rendered path.
 * @param {{ x: number, y: number }[]} path
 * @param {object} settings
 * @param {Scene} [scene]
 * @returns {LegMarkerPoint[]}
 */
export function computeLegMarkerPoints(path, settings, scene = canvas?.scene) {
  if (!settings?.showLegMarkers) return [];
  if (!Array.isArray(path) || path.length < 2) return [];

  const intervalHours = legMarkerIntervalToHours(
    Number(settings.legMarkerInterval),
    settings.legMarkerIntervalUnit ?? "h"
  );
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return [];

  const { modeId } = resolveEffectiveTravelMode(settings);
  const mode = getTravelModeById(modeId);
  if (!mode?.speedMph) return [];

  const gridSize = canvas?.grid?.size ?? scene?.grid?.size ?? null;
  const { distancePerSquare } = getSceneDistanceConfig(scene);
  if (!gridSize || !distancePerSquare) return [];

  const intervalWorld = mode.speedMph * intervalHours;
  if (intervalWorld <= 0) return [];

  const { world, totalWorld } = buildPathDistances(path, gridSize, distancePerSquare);
  if (totalWorld <= intervalWorld) return [];

  /** @type {LegMarkerPoint[]} */
  const markers = [];
  for (let n = 1; ; n++) {
    const targetWorld = n * intervalWorld;
    if (targetWorld >= totalWorld) break;
    const pt = pointAtWorldDistance(path, world, targetWorld);
    markers.push({ x: pt.x, y: pt.y, hours: n * intervalHours });
  }
  return markers;
}
