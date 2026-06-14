/**
 * Ephemeral in-memory store for player route proposals.
 *
 * Proposals are NOT persisted to scene flags; they are cleared on scene change
 * or reload.  The GM's Route Manager reads this store to display the Proposals
 * tab and accept/reject each entry.
 *
 * @typedef {Object} PlayerRouteProposal
 * @property {string}  id           Unique identifier (foundry.utils.randomID())
 * @property {string}  userId       game.user.id of the submitting player
 * @property {string}  playerName   Human-readable player name
 * @property {string}  tokenId      Source token document id
 * @property {string}  tokenName    Source token display name
 * @property {string}  sceneId      Scene the route belongs to
 * @property {{x:number,y:number}[]} path  Pixel-space waypoints
 * @property {object}  settings     Normalised route settings (player color applied)
 * @property {number[]|null} elevations  Per-path-point elevations, or null
 * @property {number}  submittedAt  Date.now() timestamp
 */

export const ProposalStore = {
  /** @type {Map<string, PlayerRouteProposal>} */
  _map: new Map(),

  /** @param {PlayerRouteProposal} proposal */
  add(proposal) {
    this._map.set(proposal.id, proposal);
  },

  /** @param {string} id */
  remove(id) {
    this._map.delete(id);
  },

  /** @returns {PlayerRouteProposal|undefined} */
  get(id) {
    return this._map.get(id);
  },

  /** @returns {PlayerRouteProposal[]} */
  getAll() {
    return Array.from(this._map.values());
  },

  get size() {
    return this._map.size;
  },

  clear() {
    this._map.clear();
  }
};
