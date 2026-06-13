/**
 * Party System for the Traveler module.
 *
 * A "party" is a named group of individual character actors that share a single
 * token on an overland map.  When the party token enters a level-change region
 * the system broadcasts an individual roll-check dialog to each member's
 * controlling user, collects results, and resolves the check as a group.
 */

import { MODULE_ID } from "./settings.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RESOLUTION_MODES = {
  all:        "All must pass",
  best:       "Best of party (any one passes)",
  majority:   "Majority passes",
  designated: "Designated roller"
};

export const TRAVEL_PACE_MODES = {
  slowest: "Slowest member",
  average: "Average speed",
  fastest: "Fastest member"
};

// ---------------------------------------------------------------------------
// Party factory
// ---------------------------------------------------------------------------

/**
 * Build a new party record with safe defaults.
 * @param {object} [overrides]
 * @returns {PartyRecord}
 */
export function createParty(overrides = {}) {
  return {
    id:                foundry.utils.randomID(),
    name:              "New Party",
    partyTokenActorId: null,
    memberActorIds:    [],
    resolutionMode:    "best",
    designatedActorId: null,
    travelPaceMode:    "slowest",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Read all party records from the world setting.
 * @returns {PartyRecord[]}
 */
export function getParties() {
  try {
    return game.settings.get(MODULE_ID, "parties") ?? [];
  } catch {
    return [];
  }
}

/**
 * Persist the full parties array to the world setting.
 * @param {PartyRecord[]} parties
 */
export async function saveParties(parties) {
  await game.settings.set(MODULE_ID, "parties", parties ?? []);
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find the party whose `partyTokenActorId` matches the given token document.
 * @param {TokenDocument} tokenDoc
 * @returns {PartyRecord|null}
 */
export function getPartyForToken(tokenDoc) {
  if (!tokenDoc) return null;
  const actorId = tokenDoc.actorId ?? tokenDoc.actor?.id;
  if (!actorId) return null;
  return getParties().find((p) => p.partyTokenActorId === actorId) ?? null;
}

/**
 * Resolve the actor IDs in a party to an array of participant descriptors.
 * Only returns members who have a non-GM controlling user in the current session.
 *
 * @param {PartyRecord} party
 * @returns {{ actorId: string, userId: string, actorName: string }[]}
 */
export function getPartyMemberUsers(party) {
  if (!party?.memberActorIds?.length) return [];

  const results = [];
  for (const actorId of party.memberActorIds) {
    const actor = game.actors?.get(actorId);
    if (!actor) continue;

    // Find the first non-GM user who has ownership of this actor.
    const user = game.users?.find(
      (u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER")
    );
    if (!user) continue;

    results.push({ actorId, userId: user.id, actorName: actor.name });
  }
  return results;
}

/**
 * Return true if the given userId is a member of the party whose token matches
 * the provided tokenDoc.
 *
 * @param {string} userId
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function isPartyMember(userId, tokenDoc) {
  const party = getPartyForToken(tokenDoc);
  if (!party) return false;
  const members = getPartyMemberUsers(party);
  return members.some((m) => m.userId === userId);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Determine whether the party as a whole passes the check, given each
 * participant's individual outcome.
 *
 * @param {{ actorId: string, passed: boolean, cancelled: boolean }[]} participants
 * @param {"all"|"best"|"majority"|"designated"} mode
 * @param {string|null} designatedActorId
 * @returns {boolean}
 */
export function resolvePartyCheck(participants, mode, designatedActorId = null) {
  if (!participants?.length) return false;

  // Treat "cancelled / gave up" as a failure for resolution purposes.
  const active = participants.map((p) => ({ ...p, passed: p.passed && !p.cancelled }));

  switch (mode) {
    case "all":
      return active.every((p) => p.passed);

    case "best":
      return active.some((p) => p.passed);

    case "majority": {
      const passed = active.filter((p) => p.passed).length;
      return passed > active.length / 2;
    }

    case "designated": {
      const designated = active.find((p) => p.actorId === designatedActorId);
      return designated?.passed ?? false;
    }

    default:
      return active.some((p) => p.passed);
  }
}

// ---------------------------------------------------------------------------
// PartyCheckSession — in-memory session store (GM client only)
// ---------------------------------------------------------------------------

/** @type {Map<string, PartyCheckSession>} */
const _sessions = new Map();

/**
 * Represents a single in-progress party check.  Lives only on the GM client.
 */
export class PartyCheckSession {
  /**
   * @param {object} opts
   * @param {string}   opts.partyId
   * @param {PartyRecord} opts.party
   * @param {{ actorId: string, userId: string, actorName: string }[]} opts.members
   * @param {{ label: string, formula: string, dc: number, failureDamage: string, allowRetry: boolean }} opts.checkConfig
   * @param {string}   opts.tokenDocId
   * @param {string}   opts.movementId
   * @param {string}   opts.continueKey
   */
  constructor(opts) {
    this.id          = foundry.utils.randomID();
    this.partyId     = opts.partyId;
    this.party       = opts.party;
    this.checkConfig = opts.checkConfig;
    this.tokenDocId  = opts.tokenDocId;
    this.movementId  = opts.movementId;
    this.continueKey = opts.continueKey;
    this.createdAt   = Date.now();

    /** @type {{ actorId: string, userId: string, actorName: string, status: "pending"|"rolled"|"timeout", total: number|null, passed: boolean|null, cancelled: boolean }[]} */
    this.participants = opts.members.map((m) => ({
      actorId:   m.actorId,
      userId:    m.userId,
      actorName: m.actorName,
      status:    "pending",
      total:     null,
      passed:    null,
      cancelled: false
    }));

    this.resolved = false;
    this.promise = new Promise((resolve) => { this._resolve = resolve; });
  }

  // -----------------------------------------------------------------------

  /**
   * Factory — create, register, and return a session.
   * @param {object} opts
   * @returns {PartyCheckSession}
   */
  static create(opts) {
    const session = new PartyCheckSession(opts);
    _sessions.set(session.id, session);
    return session;
  }

  /**
   * @param {string} sessionId
   * @returns {PartyCheckSession|undefined}
   */
  static get(sessionId) {
    return _sessions.get(sessionId);
  }

  /** Remove a session from the store. */
  static remove(sessionId) {
    _sessions.delete(sessionId);
  }

  // -----------------------------------------------------------------------

  /**
   * Record an individual result and resolve the session if all participants
   * have now responded.
   *
   * @param {{ actorId: string, total: number|null, passed: boolean, cancelled: boolean }} result
   */
  addResult(result) {
    const p = this.participants.find((x) => x.actorId === result.actorId);
    if (!p) return;

    p.status    = "rolled";
    p.total     = result.total ?? null;
    p.passed    = result.passed ?? false;
    p.cancelled = result.cancelled ?? false;

    if (this.participants.every((x) => x.status !== "pending")) {
      this._settle(this.participants);
    }
  }

  /**
   * The GM can force-resolve before all results arrive (e.g. a player
   * disconnected). Pending participants are treated as failures.
   */
  forceResolve() {
    for (const p of this.participants) {
      if (p.status === "pending") {
        p.status    = "timeout";
        p.passed    = false;
        p.cancelled = true;
      }
    }
    this._settle(this.participants);
  }

  // -----------------------------------------------------------------------

  _settle(participants) {
    if (this.resolved) return;
    this.resolved = true;
    this._resolve?.(participants);
    this._resolve = null;
  }
}
