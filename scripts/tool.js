import {
  MODULE_ID,
  getSettings,
  applyMapScaling,
  getStageScale,
  normalizeSettings,
  applyColorNumbers
} from "./settings.js";
import { buildRouteFromPoints } from "./routes.js";
import { IndyRouteRenderer } from "./renderer.js";
import { IndyRouteSettingsApp } from "./apps/settings-app.js";
import { CHANNEL } from "./constants.js";

/** Overlay layer for draw preview — avoid canvas.interface (Foundry HUD group). */
function _getRouteOverlayLayer() {
  return canvas?.foreground ?? canvas?.primary ?? null;
}

/** Map a pointer event to world canvas coordinates. */
function _pointerToCanvasPos(event) {
  const elevation = canvas?.level?.elevation?.bottom ?? 0;
  const native = event?.data?.originalEvent ?? event;
  const clientX = native?.clientX;
  const clientY = native?.clientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY) && canvas.canvasCoordinatesFromClient) {
    const pt = canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
    return { x: pt.x, y: pt.y, elevation };
  }
  if (event?.data?.getLocalPosition && canvas.stage) {
    const pt = event.data.getLocalPosition(canvas.stage);
    return { x: pt.x, y: pt.y, elevation };
  }
  return { x: canvas.mousePosition.x, y: canvas.mousePosition.y, elevation };
}

export const IndyRouteTool = {
  state: null,

  start(options = {}) {
    if (!canvas?.ready) return ui.notifications.error("Canvas not ready.");

    if (this.state?.active) {
      ui.notifications.warn("Route tool already active.");
      return;
    }

    const overlay = _getRouteOverlayLayer();
    if (!overlay) return ui.notifications.error("Canvas overlay not ready.");

    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 999999;

    overlay.sortableChildren = true;
    overlay.addChild(container);

    const preview = new PIXI.Graphics();
    preview.zIndex = 1;
    container.addChild(preview);

    this.state = {
      active: true,
      points: Array.isArray(options.initialPoints) ? options.initialPoints.map((p) => {
        const point = { x: p.x, y: p.y };
        if (Number.isFinite(p.elevation)) point.elevation = p.elevation;
        return point;
      }) : [],
      container,
      preview,
      baseSettings: options.baseSettings ? normalizeSettings(options.baseSettings) : null,
      settings: getSettings(),
      lastScale: getStageScale(),
      lastMouse: null,
      lastClickTime: 0,
      lastClickPos: null,
      handlers: {},
      onComplete: typeof options.onComplete === "function" ? options.onComplete : null,
      autoPlay: options.autoPlay !== false
    };
    if (this.state.baseSettings) {
      const scaled = this.state.baseSettings.scaleWithMap
        ? applyMapScaling(this.state.baseSettings)
        : this.state.baseSettings;
      this.state.settings = applyColorNumbers(scaled);
    }

    ui.notifications.info("Route: Left-click points. Double-click or Enter to finish. Backspace removes last. Esc cancels.");

    const getCanvasPos = (event) => (event ? _pointerToCanvasPos(event) : {
      x: canvas.mousePosition.x,
      y: canvas.mousePosition.y,
      elevation: canvas?.level?.elevation?.bottom ?? 0
    });

    const drawPreview = (mousePos) => {
      let s = this.state.settings;
      const base = this.state.baseSettings ?? game.settings.get(MODULE_ID, "routeSettings");

      if (base.scaleWithMap) {
        const scale = getStageScale();
        if (scale !== this.state.lastScale) {
          this.state.lastScale = scale;
          if (this.state.baseSettings) {
            const scaled = applyMapScaling(this.state.baseSettings);
            this.state.settings = applyColorNumbers(scaled);
          } else {
            this.state.settings = getSettings();
          }
        }
        s = this.state.settings;
      }

      preview.clear();
      if (this.state.points.length === 0) return;

      const color = s.lineColorNum ?? 0xd61f1f;
      const width = Math.max(2, s.lineWidth ?? 4);
      const dotR = Math.max(6, Math.min(24, width * 0.75));

      if (this.state.points.length >= 1) {
        preview.lineStyle(width, color, 0.55);
        preview.moveTo(this.state.points[0].x, this.state.points[0].y);
        for (let i = 1; i < this.state.points.length; i++) {
          preview.lineTo(this.state.points[i].x, this.state.points[i].y);
        }
        if (mousePos) preview.lineTo(mousePos.x, mousePos.y);
      }

      for (const p of this.state.points) {
        preview.lineStyle(2, 0xffffff, 0.9);
        preview.beginFill(color, 0.95);
        preview.drawCircle(p.x, p.y, dotR);
        preview.endFill();
      }
    };

    const stopListeners = () => {
      const h = this.state.handlers;
      const view = canvas.app?.view;
      if (view && h.viewPointerDown) {
        view.removeEventListener("pointerdown", h.viewPointerDown);
        view.removeEventListener("pointermove", h.viewPointerMove);
      }
      if (h.pointerdown) canvas.stage.off("pointerdown", h.pointerdown);
      if (h.pointermove) canvas.stage.off("pointermove", h.pointermove);
      window.removeEventListener("keydown", h.keydown, true);
    };

    const cleanup = (notice) => {
      stopListeners();
      try { container.destroy({ children: true }); } catch {}
      this.state = null;
      if (notice) ui.notifications.info(notice);
    };

    const finishAndBroadcast = () => {
      if (this.state.points.length < 2) return ui.notifications.warn("Add at least 2 points.");

      const base = this.state.baseSettings
        ? normalizeSettings(this.state.baseSettings)
        : normalizeSettings(game.settings.get(MODULE_ID, "routeSettings"));
      const built = buildRouteFromPoints(this.state.points, base);
      const s = built.settings;
      const path = built.path;

      const payload = {
        sceneId: canvas.scene.id,
        path,
        settings: s,
        startTime: Date.now(),
        lingerMs: s.lingerMs
      };

      if (this.state.autoPlay) {
        // Send to others
        game.socket.emit(CHANNEL, { type: "TRAVELER_ROUTE", payload });

        // Render locally too (emit doesn't loop back)
        IndyRouteRenderer.render(payload);
      }

      if (this.state.onComplete) {
        this.state.onComplete({
          points: this.state.points,
          baseSettings: normalizeSettings(base),
          built
        });
      }

      cleanup();
    };

    const handlePointerDown = (event) => {
      if (!this.state?.active) return;
      const btn = event?.data?.button ?? event?.button ?? 0;
      if (btn !== 0) return;
      const pos = getCanvasPos(event);
      const nowMs = Date.now();
      const lastTime = this.state.lastClickTime ?? 0;
      const lastPos = this.state.lastClickPos;
      const doubleClick = lastPos
        && (nowMs - lastTime) < 300
        && Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < 5;
      if (doubleClick) {
        if (this.state.points.length) {
          this.state.points[this.state.points.length - 1] = pos;
        } else {
          this.state.points.push(pos);
        }
        drawPreview();
        stopListeners();
        return finishAndBroadcast();
      }
      this.state.points.push(pos);
      this.state.lastClickTime = nowMs;
      this.state.lastClickPos = pos;
      drawPreview(getCanvasPos(event));
    };

    const handlePointerMove = (event) => {
      if (!this.state?.active) return;
      const pos = getCanvasPos(event);
      this.state.lastMouse = pos;
      if (this.state.points.length) drawPreview(pos);
    };

    this.state.handlers.pointerdown = handlePointerDown;
    this.state.handlers.pointermove = handlePointerMove;

    this.state.handlers.keydown = (e) => {
      if (!this.state?.active) return;

      if (e.key === "Escape") { e.preventDefault(); return cleanup("Route tool cancelled."); }
      if (e.key === "Backspace") { e.preventDefault(); this.state.points.pop(); return drawPreview(); }
      if (e.key === "Enter") { e.preventDefault(); stopListeners(); return finishAndBroadcast(); }
      if (e.key.toLowerCase() === "o" && e.altKey) { e.preventDefault(); new IndyRouteSettingsApp().render({ force: true }); }
    };

    // v14: canvas.stage pointer events are often swallowed by layer hit-testing;
    // bind the HTML canvas directly and fall back to stage listeners.
    const view = canvas.app?.view;
    if (view) {
      this.state.handlers.viewPointerDown = handlePointerDown;
      this.state.handlers.viewPointerMove = handlePointerMove;
      view.addEventListener("pointerdown", this.state.handlers.viewPointerDown);
      view.addEventListener("pointermove", this.state.handlers.viewPointerMove);
    } else {
      canvas.stage.on("pointerdown", this.state.handlers.pointerdown);
      canvas.stage.on("pointermove", this.state.handlers.pointermove);
    }
    window.addEventListener("keydown", this.state.handlers.keydown, true);
  },

  clearAllBroadcast() {
    // local
    this.state = null;
    IndyRouteRenderer.clearLocal();
    // others
    game.socket.emit(CHANNEL, { type: "TRAVELER_CLEAR" });
  }
};
