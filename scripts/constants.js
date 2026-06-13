import { MODULE_ID } from "./settings.js";

export const CHANNEL = `module.${MODULE_ID}`;

/** All socket message type strings used on the CHANNEL. */
export const MSG = {
  // GM-broadcast route animation
  BROADCAST:        "TRAVELER_ROUTE",
  CLEAR_ROUTE:      "TRAVELER_CLEAR_ROUTE",
  CLEAR:            "TRAVELER_CLEAR",

  // Player pathfinding workflow
  PLAYER_IMMEDIATE: "TRAVELER_PLAYER_IMMEDIATE",  // immediate mode: play now for all
  PLAYER_PROPOSE:   "TRAVELER_PLAYER_PROPOSE",    // approval mode: GM queue
  PLAYER_APPROVE:   "TRAVELER_PLAYER_APPROVE",    // GM approves: play for all
  PLAYER_REJECT:    "TRAVELER_PLAYER_REJECT",     // GM rejects: notify player

  // Encounter system
  ENCOUNTER_PAUSE:  "TRAVELER_ENCOUNTER_PAUSE",   // GM pauses animation (all clients)
  ENCOUNTER_RESUME: "TRAVELER_ENCOUNTER_RESUME"   // GM resumes animation (all clients)
};
