/**
 * World clock integration for the Traveler module.
 *
 * When a GM route finishes animating, `advanceClock` is called to push
 * `game.time.worldTime` forward by the in-world travel duration.
 *
 * Both Simple Calendar and Seasons & Stars automatically respond to
 * `game.time.worldTime` changes, so no module-specific hook is needed.
 */

import { MODULE_ID, getSceneDistanceConfig, getTravelModeById } from "./settings.js";

// ---------------------------------------------------------------------------
// Pure time math (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Convert a pixel-length path to an in-world travel duration in seconds.
 *
 * @param {number}  totalPx           Path length in canvas pixels
 * @param {number}  gridSizePx        Canvas pixels per grid square
 * @param {number}  distancePerSquare In-world units per grid square
 * @param {number}  speedMph          Travel speed in units/hour (treated as mph)
 * @returns {number}  Travel time in seconds, or 0 if inputs are invalid
 */
export function computeTravelSeconds(totalPx, gridSizePx, distancePerSquare, speedMph) {
  if (
    !Number.isFinite(totalPx)          || totalPx <= 0     ||
    !Number.isFinite(gridSizePx)       || gridSizePx <= 0  ||
    !Number.isFinite(distancePerSquare)|| distancePerSquare <= 0 ||
    !Number.isFinite(speedMph)         || speedMph <= 0
  ) return 0;

  const totalUnits = (totalPx / gridSizePx) * distancePerSquare;
  return (totalUnits / speedMph) * 3600;
}

/**
 * Format a seconds duration as a human-readable travel time string.
 * e.g. 90061 → "1 day 1 hr 1 min"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTravelDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  if (seconds < 60) return "< 1 min";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;

  const totalHours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (totalHours < 24) {
    const parts = [`${totalHours} hr`];
    if (mins > 0) parts.push(`${mins} min`);
    return parts.join(" ");
  }

  const days  = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [`${days} day${days !== 1 ? "s" : ""}`];
  if (hours > 0) parts.push(`${hours} hr`);
  if (mins  > 0) parts.push(`${mins} min`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Live clock advance
// ---------------------------------------------------------------------------

/**
 * Derive travel seconds for the just-finished route and advance
 * `game.time.worldTime` if the worldClockEnabled setting is on.
 *
 * Called only on the GM client (renderer.js finish() callback).
 *
 * @param {number}   totalPx      Path length in pixels (pre-computed by renderer)
 * @param {string}   modeId       Travel mode id (e.g. "horseback") or null
 * @param {Scene}    [scene]      Defaults to canvas.scene
 */
export async function advanceClock(totalPx, modeId, scene = canvas?.scene) {
  if (!game.user?.isGM) return;

  // Feature guard — off by default
  let enabled = false;
  try {
    enabled = game.settings.get(MODULE_ID, "worldClockEnabled");
  } catch { return; }
  if (!enabled) return;

  const mode = getTravelModeById(modeId);
  if (!mode?.speedMph) return;

  const gridSizePx = canvas?.grid?.size ?? scene?.grid?.size ?? 100;
  const { distancePerSquare } = getSceneDistanceConfig(scene);

  const seconds = computeTravelSeconds(totalPx, gridSizePx, distancePerSquare, mode.speedMph);
  if (seconds <= 0) return;

  try {
    await game.time.advance(Math.round(seconds));
    const label = formatTravelDuration(seconds);
    ui.notifications.info(
      `Traveler | World time advanced by ${label} (${mode.label}).`
    );
  } catch (err) {
    console.warn("Traveler | Could not advance world time:", err.message);
  }
}
