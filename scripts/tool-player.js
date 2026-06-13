import { MODULE_ID, PLAYER_ROUTE_MODE, getPlayerRouteMode, normalizeSettings, applyColorNumbers, getTravelModeById } from "./settings.js";
import { CHANNEL } from "./constants.js";
import { IndyRouteRenderer } from "./renderer.js";
import { findPath } from "./pathfinding/astar.js";
import { isExplored, fogBoundaryAnchor } from "./pathfinding/fog-checker.js";
import { getPartyForToken, isPartyMember } from "./party.js";

// Expose isExplored on globalThis so astar.js can consume it without a
// circular import (fog-checker ← astar indirect dependency avoided).
globalThis.__travelerIsExplored = isExplored;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a CSS hex colour string to a PIXI integer. */
function colorToNum(hex) {
  const clean = (hex ?? "#44dd44").replace(/^#/, "");
  return parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16) || 0x44dd44;
}

/** Format a timestamp as "X min ago" / "just now". */
function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

// ---------------------------------------------------------------------------
// PlayerRouteTool — click-to-pathfind canvas tool for players
// ---------------------------------------------------------------------------

export const PlayerRouteTool = {
  /** @type {object|null} */
  state: null,

  /**
   * Activate the player route tool.  Requires at least one controlled token.
   * @param {object} [opts]
   * @param {boolean} [opts.fogAware=true]      Block unexplored cells.
   * @param {boolean} [opts.regionAware=true]   Block non-passable regions.
   * @param {function({x,y}): boolean} [opts.isPassable]  Additional filter.
   */
  start(opts = {}) {
    if (!canvas?.ready) {
      ui.notifications.error("Canvas not ready.");
      return;
    }
    if (this.state?.active) {
      ui.notifications.warn("Player route tool already active. Press Esc to cancel.");
      return;
    }

    // Prefer a directly-controlled owned token.
    let token = canvas.tokens.controlled.find((t) => t.isOwner);

    // If no owned token is controlled, check whether a party token is selected
    // that the current user belongs to, OR find the party token on the scene.
    if (!token) {
      const controlled = canvas.tokens.controlled[0];
      if (controlled && isPartyMember(game.user.id, controlled.document)) {
        token = controlled;
      } else {
        // No controlled token at all — search the scene for a party whose member
        // the current user is.
        const partyToken = canvas.tokens.placeables.find((t) => {
          return isPartyMember(game.user.id, t.document);
        });
        if (partyToken) {
          token = partyToken;
        }
      }
    }

    if (!token) {
      ui.notifications.warn("Select your token (or the party token) before drawing a route.");
      return;
    }
    if (!token.isOwner && !isPartyMember(game.user.id, token.document)) {
      ui.notifications.warn("You do not own that token and are not a member of its party.");
      return;
    }

    // PIXI overlay — slightly below GM routes (zIndex 999999)
    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 999998;
    canvas.primary.sortableChildren = true;
    canvas.primary.addChild(container);

    const preview = new PIXI.Graphics();
    preview.zIndex = 1;
    container.addChild(preview);

    // Pulsing "fog anchor" indicator (Phase 2 — initially hidden)
    const anchorGfx = new PIXI.Graphics();
    anchorGfx.zIndex = 2;
    anchorGfx.visible = false;
    container.addChild(anchorGfx);

    // Phase 2 flags — default ON so fog/region constraints apply automatically.
    const fogAware    = opts.fogAware    !== false;
    const regionAware = opts.regionAware !== false;

    this.state = {
      active: true,
      token,
      origin: { x: token.center.x, y: token.center.y },
      path: null,       // computed A* path (pixel waypoints)
      blocked: false,   // true when A* returned no route
      destTarget: null, // last clicked destination (for anchor re-evaluation)
      fogAnchor: null,  // last reachable node before fog boundary
      pathBeforeAnchor: null, // path segments before the fog anchor
      container,
      preview,
      anchorGfx,
      fogAware,
      regionAware,
      isPassable: typeof opts.isPassable === "function" ? opts.isPassable : null,
      handlers: {}
    };

    ui.notifications.info(
      "Player Route: Click a destination to pathfind. Enter to submit, Esc to cancel."
    );

    // -----------------------------------------------------------------------
    // Drawing helpers
    // -----------------------------------------------------------------------

    const playerColorNum = colorToNum(game.user.color);

    const drawPreview = () => {
      preview.clear();
      anchorGfx.clear();
      const { path, blocked, origin, fogAnchor } = this.state;
      if (!path || path.length < 1) return;

      const color = blocked ? 0xff3333 : playerColorNum;
      const alpha = blocked ? 0.6 : 0.85;

      preview.lineStyle(5, color, alpha);
      preview.moveTo(origin.x, origin.y);
      for (const pt of path) preview.lineTo(pt.x, pt.y);

      // Destination marker
      const dest = path[path.length - 1];
      if (blocked) {
        const r = 10;
        preview.lineStyle(3, 0xff3333, 0.9);
        preview.moveTo(dest.x - r, dest.y - r); preview.lineTo(dest.x + r, dest.y + r);
        preview.moveTo(dest.x + r, dest.y - r); preview.lineTo(dest.x - r, dest.y + r);
      } else {
        preview.lineStyle(0);
        preview.beginFill(playerColorNum, 0.9);
        preview.drawCircle(dest.x, dest.y, 8);
        preview.endFill();
      }

      // Fog-boundary anchor — pulsing ring
      if (fogAnchor) {
        anchorGfx.visible = true;
        anchorGfx.lineStyle(3, playerColorNum, 0.9);
        anchorGfx.drawCircle(fogAnchor.x, fogAnchor.y, 12);
        anchorGfx.lineStyle(2, 0xffffff, 0.5);
        anchorGfx.drawCircle(fogAnchor.x, fogAnchor.y, 16);
        // Inner fill
        anchorGfx.beginFill(playerColorNum, 0.3);
        anchorGfx.drawCircle(fogAnchor.x, fogAnchor.y, 10);
        anchorGfx.endFill();
      } else {
        anchorGfx.visible = false;
      }
    };

    // -----------------------------------------------------------------------
    // Pathfind helper — also handles fog anchor detection
    // -----------------------------------------------------------------------

    const computePath = (dest) => {
      const { fogAware, regionAware, isPassable: extraFilter, origin } = this.state;
      this.state.destTarget = dest;

      const pathOpts = {
        fogAware,
        regionAware,
        ...(extraFilter ? { isPassable: extraFilter } : {})
      };

      const computed = findPath(origin, dest, pathOpts);

      if (computed.length >= 2) {
        // Check if the destination was reachable or if we hit a fog boundary
        const lastPt = computed[computed.length - 1];
        const destOff = canvas.grid?.getOffset?.(dest);
        const lastOff = canvas.grid?.getOffset?.(lastPt);
        const reachedDest = destOff && lastOff &&
          destOff.i === lastOff.i && destOff.j === lastOff.j;

        this.state.path = computed;
        this.state.blocked = false;

        if (!reachedDest && fogAware) {
          // A* terminated at fog boundary
          this.state.fogAnchor = lastPt;
          ui.notifications.info(
            "Route reaches the edge of your explored area. " +
            "Move your token to extend visibility, then click the anchor to continue."
          );
        } else {
          this.state.fogAnchor = null;
        }
      } else {
        this.state.path = [dest];
        this.state.blocked = true;
        this.state.fogAnchor = null;
        ui.notifications.warn("No clear path — destination may be behind walls or unexplored.");
      }
      drawPreview();
    };

    // -----------------------------------------------------------------------
    // Cleanup / cancel
    // -----------------------------------------------------------------------

    const cleanup = (notice) => {
      const h = this.state?.handlers ?? {};
      canvas.stage.off("pointerdown", h.pointerdown);
      window.removeEventListener("keydown", h.keydown, true);
      if (h.sightRefresh) Hooks.off("sightRefresh", h.sightRefresh);
      try { container.destroy({ children: true }); } catch {}
      this.state = null;
      if (notice) ui.notifications.info(notice);
    };
    this._cleanup = cleanup;

    // -----------------------------------------------------------------------
    // Submit
    // -----------------------------------------------------------------------

    const submit = () => {
      const { path, blocked, token: tok } = this.state ?? {};
      if (!path || path.length < 2) {
        ui.notifications.warn("Click a destination first.");
        return;
      }
      if (blocked) {
        ui.notifications.warn("No clear path found — the route may cross walls.");
        return;
      }
      _submitRoute(path, tok);
      cleanup(null);
    };

    // -----------------------------------------------------------------------
    // Pointer handler — runs A* on each click
    // -----------------------------------------------------------------------

    this.state.handlers.pointerdown = (event) => {
      if (!this.state?.active) return;
      const btn = event?.data?.button ?? event?.button ?? 0;
      if (btn !== 0) return;
      const dest = { x: canvas.mousePosition.x, y: canvas.mousePosition.y };

      // If clicking near the fog anchor, extend the path from the anchor
      if (this.state.fogAnchor) {
        const anchor = this.state.fogAnchor;
        const distToAnchor = Math.hypot(dest.x - anchor.x, dest.y - anchor.y);
        const gridSize = canvas.grid?.size ?? 100;
        if (distToAnchor < gridSize * 1.5) {
          // Click was close to anchor — treat as "start new leg from anchor"
          this.state.origin = anchor;
          this.state.fogAnchor = null;
          ui.notifications.info("Now extending route from fog boundary anchor.");
        }
      }

      computePath(dest);
    };

    // -----------------------------------------------------------------------
    // sightRefresh hook — re-evaluate path when vision expands
    // -----------------------------------------------------------------------

    this.state.handlers.sightRefresh = () => {
      if (!this.state?.active || !this.state.fogAnchor || !this.state.destTarget) return;
      // Vision may have expanded — retry pathfinding toward the original destination
      computePath(this.state.destTarget);
    };
    Hooks.on("sightRefresh", this.state.handlers.sightRefresh);

    // -----------------------------------------------------------------------
    // Keyboard handler
    // -----------------------------------------------------------------------

    this.state.handlers.keydown = (event) => {
      if (!this.state?.active) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cleanup("Route cancelled.");
      }
    };

    canvas.stage.on("pointerdown", this.state.handlers.pointerdown);
    window.addEventListener("keydown", this.state.handlers.keydown, true);
  },

  /** Programmatically cancel without a notification. */
  cancel() {
    this._cleanup?.(null);
  }
};

// ---------------------------------------------------------------------------
// Route submission
// ---------------------------------------------------------------------------

/**
 * Build a route payload and emit it via the appropriate socket message.
 * @param {{ x: number, y: number }[]} path  Pixel waypoints from A*
 * @param {Token} token
 */
async function _submitRoute(path, token) {
  const mode = getPlayerRouteMode();
  if (mode === PLAYER_ROUTE_MODE.OFF) return;

  const sceneId = canvas.scene?.id;
  if (!sceneId) return;

  // ── Optional speed prompt ─────────────────────────────────────────────
  let travelModeId   = null;
  let travelModeLabel = null;

  let promptSpeed = false;
  try { promptSpeed = game.settings.get(MODULE_ID, "playerSpeedPrompt"); } catch {}

  if (promptSpeed) {
    const { PlayerSpeedDialog } = await import("./apps/player-speed-dialog.js");
    const dialog = new PlayerSpeedDialog({});
    dialog.render({ force: true });
    const chosen = await dialog.promise;
    if (!chosen) return; // player cancelled
    travelModeId    = chosen;
    travelModeLabel = getTravelModeById(chosen)?.label ?? chosen;
  }

  // Use the player's colour for the route visuals.
  const base = normalizeSettings(game.settings.get(MODULE_ID, "routeSettings"));
  const playerColor = (game.user.color ?? "#44dd44").toString();

  // Scale drawSpeed by the selected travel mode relative to walk-normal (3 mph)
  const { scaleDrawSpeed } = await import("./apps/player-speed-dialog.js");
  const selectedMph = getTravelModeById(travelModeId)?.speedMph ?? 3;
  const scaledDraw  = scaleDrawSpeed(base.drawSpeed, selectedMph);

  const settings = applyColorNumbers({
    ...base,
    lineColor: playerColor,
    dotColor: playerColor,
    labelColor: playerColor,
    // Disable cinematic camera for player routes by default
    cinematicMovement: false,
    drawSpeed: scaledDraw
  });

  const proposal = {
    id: foundry.utils.randomID(),
    userId: game.user.id,
    playerName: game.user.name ?? "Player",
    tokenId: token.id,
    tokenName: token.document?.name ?? token.name ?? "Token",
    sceneId,
    path,
    settings,
    elevations: null,
    travelModeId,
    travelModeLabel,
    submittedAt: Date.now()
  };

  if (mode === PLAYER_ROUTE_MODE.IMMEDIATE) {
    const payload = _proposalToPayload(proposal);
    game.socket.emit(CHANNEL, { type: "TRAVELER_PLAYER_IMMEDIATE", payload });
    IndyRouteRenderer.render(payload);
    ui.notifications.info("Route is now playing.");
  } else {
    // Approval mode — send to GM's queue
    game.socket.emit(CHANNEL, { type: "TRAVELER_PLAYER_PROPOSE", payload: proposal });
    ui.notifications.info("Route submitted — awaiting GM approval.");
  }
}

/**
 * Convert a stored proposal into a renderer-ready payload.
 * @param {import("./proposals.js").PlayerRouteProposal} proposal
 * @returns {object}
 */
export function proposalToPayload(proposal) {
  return _proposalToPayload(proposal);
}

function _proposalToPayload(proposal) {
  return {
    sceneId:      proposal.sceneId,
    path:         proposal.path,
    settings:     proposal.settings,
    startTime:    Date.now(),
    lingerMs:     proposal.settings?.lingerMs ?? -1,
    routeId:      proposal.id,
    labelText:    `${proposal.playerName}: ${proposal.tokenName}`,
    elevations:   proposal.elevations ?? null,
    travelModeId: proposal.travelModeId ?? null,
    encounters:   []
  };
}
