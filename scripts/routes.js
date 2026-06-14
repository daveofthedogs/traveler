import {
  MODULE_ID,
  DEFAULTS,
  applyMapScaling,
  applyColorNumbers,
  getMapPixelSize,
  normalizeSettings
} from "./settings.js";
import { chaikin, catmullRom } from "./smoothing.js";

function routeDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function resample(points, stepPx) {
  if (points.length < 2) return points.slice();
  if (!Number.isFinite(stepPx) || stepPx <= 0) return points.slice();
  const out = [points[0]];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segLen = routeDistance(a, b);
    if (segLen === 0) continue;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;
    let dist = stepPx - carry;
    while (dist <= segLen) {
      out.push({ x: a.x + dx * dist, y: a.y + dy * dist });
      dist += stepPx;
    }
    carry = segLen - (dist - stepPx);
    if (carry === stepPx) carry = 0;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (!tail || routeDistance(tail, last) > 1e-6) out.push({ x: last.x, y: last.y });
  return out;
}

/**
 * Builds a per-path-point elevation array by arc-length interpolation from the
 * raw waypoints.  Returns null when no waypoint carries elevation data, so
 * callers can omit elevation from single-level scenes gracefully.
 */
function buildElevationsForPath(rawPoints, path) {
  if (!rawPoints.some((p) => Number.isFinite(p.elevation))) return null;

  // Fill any gaps by inheriting the previous known elevation (forward fill).
  let lastElev = 0;
  const elevs = rawPoints.map((p) => {
    if (Number.isFinite(p.elevation)) lastElev = p.elevation;
    return lastElev;
  });

  if (elevs.length < 2) return path.map(() => elevs[0] ?? 0);

  // Cumulative arc-length of raw waypoints.
  const rawCum = [0];
  for (let i = 1; i < rawPoints.length; i++) {
    rawCum.push(rawCum[i - 1] + Math.hypot(
      rawPoints[i].x - rawPoints[i - 1].x,
      rawPoints[i].y - rawPoints[i - 1].y
    ));
  }
  const totalRaw = rawCum[rawCum.length - 1];

  // Cumulative arc-length of (smoothed + resampled) path points.
  const pathCum = [0];
  for (let i = 1; i < path.length; i++) {
    pathCum.push(pathCum[i - 1] + Math.hypot(
      path[i].x - path[i - 1].x,
      path[i].y - path[i - 1].y
    ));
  }
  const totalPath = pathCum[pathCum.length - 1];

  if (totalRaw <= 0 || totalPath <= 0) return path.map(() => elevs[0]);

  return path.map((_, pi) => {
    // Map this path point's arc-length fraction onto the raw-waypoint arc space.
    const rawArc = (pathCum[pi] / totalPath) * totalRaw;
    let seg = 1;
    while (seg < rawCum.length - 1 && rawCum[seg] < rawArc) seg++;
    const segLen = rawCum[seg] - rawCum[seg - 1];
    const localT = segLen > 1e-6 ? (rawArc - rawCum[seg - 1]) / segLen : 0;
    return elevs[seg - 1] + (elevs[seg] - elevs[seg - 1]) * Math.min(1, Math.max(0, localT));
  });
}

export function buildRouteFromPoints(points, baseSettings) {
  const s = normalizeSettings(baseSettings);
  let smooth;
  switch (s.smoothingMode) {
    case "none":
      smooth = points.slice();
      break;
    case "chaikin":
      smooth = chaikin(points, s.chaikinIterations);
      break;
    case "catmull":
    default:
      smooth = catmullRom(points, s.catmullSamplesPerSegment, s.catmullAlpha);
      break;
  }

  const sizeOverride = s.scaleMapSize && s.scaleMapSize.width && s.scaleMapSize.height
    ? s.scaleMapSize
    : null;
  const scaledSettings = s.scaleWithMap ? applyMapScaling(s, sizeOverride) : s;

  const colored = applyColorNumbers(scaledSettings);
  const path = resample(smooth, colored.sampleStepPx);
  const elevations = buildElevationsForPath(points, path);
  return { path, settings: colored, smoothPoints: smooth, elevations };
}

export function getSceneRoutes(scene = canvas?.scene) {
  if (!scene) return [];
  return foundry.utils.deepClone(scene.getFlag(MODULE_ID, "routes") ?? []);
}

export async function setSceneRoutes(routes, scene = canvas?.scene) {
  if (!scene) return;
  await scene.setFlag(MODULE_ID, "routes", routes);
}

export function createRouteRecord(points, baseSettings, name) {
  const now = Date.now();
  let settings = normalizeSettings(baseSettings);
  if (settings.scaleWithMap && !settings.scaleMapSize) {
    const mapSize = getMapPixelSize();
    if (mapSize) {
      settings = {
        ...settings,
        scaleMapSize: { width: mapSize.width, height: mapSize.height }
      };
    }
  }
  return {
    id: foundry.utils.randomID(),
    name: name || `Route ${now}`,
    points: points.map((p) => {
      const point = { x: p.x, y: p.y };
      if (Number.isFinite(p.elevation)) point.elevation = p.elevation;
      return point;
    }),
    settings,
    encounters: [],   // EncounterZone[] — populated via the Encounters tab in the route editor
    createdAt: now,
    updatedAt: now
  };
}
