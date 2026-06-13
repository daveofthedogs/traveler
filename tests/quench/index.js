/**
 * Quench test suite registration.
 *
 * This file is the entry point loaded by the traveler module when Quench is
 * active.  It registers all integration test batches under the "traveler"
 * namespace.
 *
 * Add the following to scripts/traveler.js (inside a Hooks.once("init") or
 * separate Hooks.once("quenchReady") block):
 *
 *   if (typeof quench !== "undefined") {
 *     import("../tests/quench/index.js").then(({ registerAllSuites }) => {
 *       registerAllSuites(quench);
 *     });
 *   }
 *
 * OR use the quenchReady hook:
 *
 *   Hooks.once("quenchReady", (quench) => {
 *     import("../tests/quench/index.js").then(({ registerAllSuites }) => {
 *       registerAllSuites(quench);
 *     });
 *   });
 */

import { registerPathfindingTests }    from "./pathfinding.quench.js";
import { registerRegionBehaviorTests } from "./region-behavior.quench.js";
import { registerPlayerRouteTests }    from "./player-route.quench.js";
import { registerEncounterTests }      from "./encounters.quench.js";

/**
 * Register every traveler Quench batch with the provided quench instance.
 * @param {Quench} quench - The Quench API object from the quenchReady hook.
 */
export function registerAllSuites(quench) {
  registerPathfindingTests(quench);
  registerRegionBehaviorTests(quench);
  registerPlayerRouteTests(quench);
  registerEncounterTests(quench);
}

// Also register via the hook so the suites appear automatically when Quench
// is loaded alongside the traveler module in a test world.
Hooks.once("quenchReady", (quench) => {
  registerAllSuites(quench);
});
