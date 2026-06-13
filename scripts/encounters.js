/**
 * Encounter System for the Traveler module.
 *
 * System-agnostic: relies entirely on GM-curated Rollable Tables.
 * No CR/level lookups are performed; the GM selects the correct table
 * for each encounter zone.
 */

import { MODULE_ID } from "./settings.js";

// ---------------------------------------------------------------------------
// Default zone factory
// ---------------------------------------------------------------------------

/**
 * Build a new encounter zone with safe defaults.
 * @param {"explicit"|"auto"|"fixed"} type
 * @param {object} [overrides]
 * @returns {EncounterZone}
 */
export function createEncounterZone(type = "explicit", overrides = {}) {
  return {
    id:          foundry.utils.randomID(),
    type,

    // Position (explicit / fixed)
    t:           0.5,

    // Common
    label:       "",
    chance:      0.3,
    environment: "",

    // Table source (random / explicit)
    tableId:     null,
    tableName:   "",

    // Fixed source
    actorId:     null,
    journalId:   null,

    // Auto-interval
    frequency:   0.1,   // fire every 10 % of route distance

    // Resolution options
    spawnToken:  true,
    createNote:  true,
    chatMessage: true,

    // Runtime — not persisted
    _triggered: false,

    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Zone trigger logic
// ---------------------------------------------------------------------------

/**
 * Return every encounter zone that should fire this animation frame.
 * Mutates zone._triggered to prevent double-firing on the same playback.
 *
 * @param {EncounterZone[]} zones
 * @param {number} t        Current animation progress (0.0–1.0)
 * @param {number} tPrev    Previous frame's progress
 * @returns {EncounterZone[]}
 */
export function checkZones(zones, t, tPrev) {
  if (!Array.isArray(zones) || zones.length === 0) return [];
  const fired = [];

  for (const zone of zones) {
    if (zone._triggered) continue;

    if (zone.type === "explicit" || zone.type === "fixed") {
      // Fire once when the animation crosses zone.t.
      // Special case: zone at t=0 fires on the first real tick (tPrev===0, t>0).
      const zoneT = Number.isFinite(zone.t) ? zone.t : 0.5;
      const crosses = zoneT === 0
        ? (tPrev === 0 && t > 0)
        : (tPrev < zoneT && t >= zoneT);
      if (crosses) {
        zone._triggered = true;
        fired.push(zone);
      }

    } else if (zone.type === "auto") {
      // Fire every time a `frequency` interval boundary is crossed
      const freq = Number.isFinite(zone.frequency) && zone.frequency > 0
        ? zone.frequency
        : 0.1;
      const crossedPrev = Math.floor(tPrev / freq);
      const crossedCurr = Math.floor(t    / freq);
      if (crossedCurr > crossedPrev) {
        // Mark as triggered at the first interval boundary only;
        // auto zones re-arm themselves each interval so don't set _triggered.
        fired.push({ ...zone, _autoT: t });
      }
    }
  }

  return fired;
}

/**
 * Reset all _triggered flags — called at the start of each route playback.
 * @param {EncounterZone[]} zones
 */
export function resetZoneTriggers(zones) {
  if (!Array.isArray(zones)) return;
  for (const zone of zones) {
    zone._triggered = false;
  }
}

// ---------------------------------------------------------------------------
// Table rolling
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EncounterResult
 * @property {string}      name     Display name (actor or text)
 * @property {string|null} img      Portrait image path
 * @property {string|null} actorId  World actor id (if result is an Actor)
 * @property {string|null} packId   Compendium pack id (if result is a compendium Actor)
 * @property {string|null} packDocId Document id within the pack
 * @property {string}      text     Raw result text (fallback)
 * @property {string}      tableId  Source table id
 * @property {string}      tableName Source table name
 */

/**
 * Roll on a Rollable Table and return a normalised result.
 * @param {string} tableId
 * @returns {Promise<EncounterResult|null>}
 */
export async function rollTable(tableId) {
  if (!tableId) return null;

  const table = game.tables?.get(tableId);
  if (!table) {
    ui.notifications.warn(`Traveler | Encounter table "${tableId}" not found.`);
    return null;
  }

  let draw;
  try {
    draw = await table.draw({ displayChat: false });
  } catch (err) {
    ui.notifications.error(`Traveler | Failed to roll encounter table: ${err.message}`);
    return null;
  }

  const result = draw?.results?.[0];
  if (!result) return null;

  // Foundry v14 RollTableResult: documentType, documentCollection, documentId, text, img
  const isActor =
    result.type === CONST.TABLE_RESULT_TYPES?.COMPENDIUM ||
    result.type === CONST.TABLE_RESULT_TYPES?.ENTITY ||
    result.type === 1 || result.type === 2;

  let actorId    = null;
  let packId     = null;
  let packDocId  = null;
  let name       = result.text || "Unknown Encounter";
  let img        = result.img  || null;

  if (isActor && result.documentCollection) {
    // Compendium Actor result
    packId    = result.documentCollection;
    packDocId = result.documentId;
    // Try to get the name/img from the compendium index without full import
    try {
      const pack = game.packs?.get(packId);
      if (pack) {
        const index = pack.index?.get(packDocId);
        if (index) {
          name = index.name ?? name;
          img  = index.img  ?? img;
        }
      }
    } catch {}

  } else if (isActor && result.documentId) {
    // World Actor result
    actorId = result.documentId;
    const actor = game.actors?.get(actorId);
    if (actor) {
      name = actor.name;
      img  = actor.img ?? img;
    }
  }

  return {
    name,
    img: img || null,
    actorId,
    packId,
    packDocId,
    text:      result.text ?? name,
    tableId,
    tableName: table.name
  };
}

// ---------------------------------------------------------------------------
// Fixed-encounter result builder
// ---------------------------------------------------------------------------

/**
 * Build an EncounterResult from a fixed encounter zone (no roll needed).
 * @param {EncounterZone} zone
 * @returns {EncounterResult|null}
 */
export function buildFixedResult(zone) {
  if (!zone) return null;
  let name = zone.label || "Encounter";
  let img  = null;
  let actorId = zone.actorId ?? null;

  if (actorId) {
    const actor = game.actors?.get(actorId);
    if (actor) {
      name = actor.name;
      img  = actor.img ?? null;
    }
  }

  return {
    name,
    img,
    actorId,
    packId:     null,
    packDocId:  null,
    text:       name,
    tableId:    null,
    tableName:  null
  };
}

// ---------------------------------------------------------------------------
// Resolution: chat + note + token spawn
// ---------------------------------------------------------------------------

/**
 * Import an actor from a compendium into the "Random Encounters" world folder.
 * Returns an existing world Actor if one with the same name+source already exists.
 * @param {EncounterResult} result
 * @returns {Promise<Actor|null>}
 */
export async function importActor(result) {
  if (!result) return null;

  // If it's already a world actor, just return it
  if (result.actorId) return game.actors?.get(result.actorId) ?? null;
  if (!result.packId || !result.packDocId) return null;

  // Find or create the "Random Encounters" folder
  let folder = game.folders?.find(
    (f) => f.type === "Actor" && f.name === "Random Encounters"
  );
  if (!folder) {
    folder = await Folder.create({ name: "Random Encounters", type: "Actor" });
  }

  // Avoid re-importing the same actor (check by name within the folder)
  const existing = game.actors?.find(
    (a) => a.name === result.name && a.folder?.id === folder.id
  );
  if (existing) return existing;

  try {
    const pack = game.packs?.get(result.packId);
    if (!pack) return null;
    const source = await pack.getDocument(result.packDocId);
    if (!source) return null;
    return await Actor.create({ ...source.toObject(), folder: folder.id });
  } catch (err) {
    console.warn(`Traveler | Could not import actor: ${err.message}`);
    return null;
  }
}

/**
 * Spawn a token for the given actor near `pos` on the active scene.
 * @param {Actor} actor
 * @param {{x:number, y:number}} pos
 * @returns {Promise<TokenDocument|null>}
 */
export async function spawnToken(actor, pos) {
  if (!actor || !pos || !canvas?.scene) return null;

  const gridSize = canvas.grid?.size ?? 100;
  // Offset slightly so the NPC doesn't spawn on top of the party token
  const offsetX = gridSize * 1.5;
  const offsetY = 0;

  try {
    const tokenData = await actor.getTokenDocument({
      x: pos.x + offsetX,
      y: pos.y + offsetY
    });
    return await canvas.scene.createEmbeddedDocuments("Token", [tokenData.toObject()]).then(
      (docs) => docs[0] ?? null
    );
  } catch (err) {
    console.warn(`Traveler | Could not spawn token: ${err.message}`);
    return null;
  }
}

/**
 * Create a Note pin on the active scene at `pos` for this encounter.
 * @param {EncounterResult} result
 * @param {{x:number, y:number}} pos
 * @returns {Promise<NoteDocument|null>}
 */
export async function createNote(result, pos) {
  if (!result || !pos || !canvas?.scene) return null;

  try {
    const content = `<p><strong>${result.name}</strong></p>${
      result.tableName ? `<p><em>Rolled on: ${result.tableName}</em></p>` : ""
    }`;
    const journal = await JournalEntry.create({
      name: `Encounter: ${result.name}`,
      content
    });
    const noteData = {
      entryId:  journal.id,
      x:        pos.x,
      y:        pos.y,
      iconSize: 40,
      text:     result.name,
      fontSize: 24,
      textColor: "#ff6400"
    };
    return await canvas.scene.createEmbeddedDocuments("Note", [noteData]).then(
      (docs) => docs[0] ?? null
    );
  } catch (err) {
    console.warn(`Traveler | Could not create encounter note: ${err.message}`);
    return null;
  }
}

/**
 * Post an encounter notification to chat.
 * @param {EncounterResult} result
 * @param {EncounterZone}   zone
 */
export async function createChatMessage(result, zone) {
  const env = zone?.environment ? ` (${zone.environment})` : "";
  const src = result.tableName ? `<br><em>Table: ${result.tableName}</em>` : "";
  const img = result.img
    ? `<img src="${result.img}" style="width:48px;height:48px;float:left;margin:0 8px 4px 0;border-radius:4px;">`
    : "";
  const content = `
    <div class="traveler-encounter-chat" style="overflow:hidden;">
      ${img}
      <strong>⚔ Random Encounter${env}</strong><br>
      ${result.name}${src}
    </div>
  `;
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: "Traveler" })
  });
}

/**
 * Open any journal linked to a fixed encounter zone.
 * @param {EncounterZone} zone
 */
export async function openFixedJournal(zone) {
  if (!zone?.journalId) return;
  const entry = game.journal?.get(zone.journalId);
  if (!entry) return;
  entry.sheet?.render(true);
}

/**
 * Master resolver — called after the GM clicks Accept in the dialog.
 * @param {EncounterResult} result
 * @param {EncounterZone}   zone
 * @param {{x:number, y:number}} pos  Canvas position of the encounter
 */
export async function resolveEncounter(result, zone, pos) {
  const ops = [];

  if (zone?.chatMessage !== false) {
    ops.push(createChatMessage(result, zone));
  }

  if (zone?.createNote !== false) {
    ops.push(createNote(result, pos));
  }

  if (zone?.spawnToken !== false && game.user.isGM) {
    ops.push(
      importActor(result).then((actor) => {
        if (actor) return spawnToken(actor, pos);
      })
    );
  }

  // For fixed encounters, open the linked journal entry
  if (zone?.type === "fixed" && zone?.journalId) {
    ops.push(openFixedJournal(zone));
  }

  await Promise.allSettled(ops);
}

// ---------------------------------------------------------------------------
// Zone trigger orchestrator (called from renderer.js)
// ---------------------------------------------------------------------------

/**
 * Handle a zone that has fired during route animation.
 * Only called on the GM client.  Pauses the animation, shows the dialog,
 * resolves or skips, then resumes.
 *
 * @param {EncounterZone}   zone
 * @param {string}          routeId
 * @param {{x:number,y:number}} pos  Current canvas position
 */
export async function handleZoneFired(zone, routeId, pos) {
  // Lazy import to avoid circular dependency with renderer
  const { IndyRouteRenderer } = await import("./renderer.js");
  const { EncounterDialog }   = await import("./apps/encounter-dialog.js");

  // Roll the table (or use fixed result) before pausing the animation
  let result = null;
  if (zone.type === "fixed") {
    result = buildFixedResult(zone);
  } else if (zone.tableId) {
    result = await rollTable(zone.tableId);
  }

  if (!result) {
    // No table or roll failed — skip silently
    return;
  }

  // Chance check (not for fixed)
  if (zone.type !== "fixed") {
    const chance = Number.isFinite(zone.chance) ? zone.chance : 0.3;
    if (Math.random() > chance) return;
  }

  IndyRouteRenderer.pauseRoute(routeId);

  const dialog = new EncounterDialog({ zone, initialResult: result, routeId, pos });
  dialog.render({ force: true });

  const decision = await dialog.promise;

  IndyRouteRenderer.resumeRoute(routeId);

  if (decision === "accept") {
    await resolveEncounter(dialog.currentResult, zone, pos);
  }
}
