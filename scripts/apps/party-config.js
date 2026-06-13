import { MODULE_ID } from "../settings.js";
import {
  createParty,
  getParties,
  saveParties,
  RESOLUTION_MODES,
  TRAVEL_PACE_MODES
} from "../party.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only Application for managing party configurations.
 * Accessible via Settings → Module Settings → Traveler → Configure Parties.
 */
export class PartyConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
      id: "traveler-party-config",
      window: { title: "Traveler: Configure Parties", resizable: true },
      position: { width: 680, height: 560 },
      classes: ["traveler", "traveler-party-config"]
    },
    { inplace: false }
  );

  /** @override */
  static PARTS = {
    root: {
      id: "root",
      template: `modules/${MODULE_ID}/templates/party-config.hbs`,
      scrollable: [".party-list"]
    }
  };

  // Singleton — only one instance open at a time
  static _instance = null;

  // -----------------------------------------------------------------------
  // Context
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext() {
    const parties    = getParties();
    const actors     = game.actors?.contents ?? [];
    const actorList  = actors.map((a) => ({ id: a.id, name: a.name, img: a.img }))
                             .sort((a, b) => a.name.localeCompare(b.name));

    // Enrich each party with resolved actor names for display
    const enriched = parties.map((p) => ({
      ...p,
      partyTokenActor: actorList.find((a) => a.id === p.partyTokenActorId) ?? null,
      members: (p.memberActorIds ?? [])
        .map((id) => actorList.find((a) => a.id === id))
        .filter(Boolean),
      resolutionLabel: RESOLUTION_MODES[p.resolutionMode] ?? p.resolutionMode,
      designatedActor: actorList.find((a) => a.id === p.designatedActorId) ?? null,
      paceModeLabel:   TRAVEL_PACE_MODES[p.travelPaceMode] ?? p.travelPaceMode
    }));

    return {
      parties:        enriched,
      actorList,
      resolutionModes: Object.entries(RESOLUTION_MODES).map(([k, v]) => ({ value: k, label: v })),
      paceModes:       Object.entries(TRAVEL_PACE_MODES).map(([k, v]) => ({ value: k, label: v }))
    };
  }

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------

  /** @override */
  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = html instanceof HTMLElement ? html : html?.[0] ?? this.element;
    const win  = root?.closest?.(".window-content") ?? root?.querySelector?.(".window-content") ?? root;

    win.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      e.preventDefault();
      const { action, partyId, actorId } = btn.dataset;
      switch (action) {
        case "add-party":        return this._addParty();
        case "delete-party":     return this._deleteParty(partyId);
        case "save-party":       return this._saveParty(partyId);
        case "remove-member":    return this._removeMember(partyId, actorId);
        case "remove-token-actor": return this._removeTokenActor(partyId);
      }
    });

    // Drag-drop: actors onto token or member slots
    win.querySelectorAll(".party-token-drop, .party-member-drop").forEach((zone) => {
      zone.addEventListener("dragover", (e) => e.preventDefault());
      zone.addEventListener("drop",     (e) => this._onDrop(e));
    });
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  async _addParty() {
    const parties = getParties();
    parties.push(createParty());
    await saveParties(parties);
    this.render({ force: true });
  }

  async _deleteParty(partyId) {
    const confirmed = await foundry.applications?.api?.DialogV2?.confirm?.({
      title: "Delete Party",
      content: "<p>Delete this party configuration? Routes are not affected.</p>"
    }) ?? await Dialog.confirm({
      title: "Delete Party",
      content: "<p>Delete this party configuration? Routes are not affected.</p>"
    });
    if (!confirmed) return;

    const parties = getParties().filter((p) => p.id !== partyId);
    await saveParties(parties);
    this.render({ force: true });
  }

  async _saveParty(partyId) {
    const parties = getParties();
    const idx = parties.findIndex((p) => p.id === partyId);
    if (idx < 0) return;

    // Collect form values for this party from the DOM
    const root = this.element;
    const row  = root?.querySelector(`[data-party-id="${partyId}"]`);
    if (!row) return;

    const get = (sel) => row.querySelector(sel)?.value?.trim() ?? "";

    parties[idx] = {
      ...parties[idx],
      name:              get("[name='name']") || "Party",
      resolutionMode:    get("[name='resolutionMode']") || "best",
      designatedActorId: get("[name='designatedActorId']") || null,
      travelPaceMode:    get("[name='travelPaceMode']") || "slowest"
    };

    await saveParties(parties);
    ui.notifications.info("Traveler | Party saved.");
    this.render({ force: true });
  }

  async _removeMember(partyId, actorId) {
    const parties = getParties();
    const party = parties.find((p) => p.id === partyId);
    if (!party) return;
    party.memberActorIds = party.memberActorIds.filter((id) => id !== actorId);
    await saveParties(parties);
    this.render({ force: true });
  }

  async _removeTokenActor(partyId) {
    const parties = getParties();
    const party = parties.find((p) => p.id === partyId);
    if (!party) return;
    party.partyTokenActorId = null;
    await saveParties(parties);
    this.render({ force: true });
  }

  // -----------------------------------------------------------------------
  // Drag / drop
  // -----------------------------------------------------------------------

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch { return; }

    if (data.type !== "Actor") return;

    const actor = await fromUuid(data.uuid).catch(() => null);
    if (!actor) return;

    const zone    = event.currentTarget;
    const partyId = zone.dataset.partyId;
    const parties = getParties();
    const party   = parties.find((p) => p.id === partyId);
    if (!party) return;

    if (zone.classList.contains("party-token-drop")) {
      party.partyTokenActorId = actor.id;
    } else if (zone.classList.contains("party-member-drop")) {
      if (!party.memberActorIds.includes(actor.id)) {
        party.memberActorIds.push(actor.id);
      }
    }

    await saveParties(parties);
    this.render({ force: true });
  }
}
