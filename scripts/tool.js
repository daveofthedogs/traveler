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

export const IndyRouteTool = {
  state: null,

  start(options = {}) {
    if (!canvas?.ready) return ui.notifications.error("Canvas not ready.");

    if (this.state?.active) {
      ui.notifications.warn("Route tool already active.");
      return;
    }

    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 999999;

    canvas.primary.sortableChildren = true;
    canvas.primary.addChild(container);

    const preview = new PIXI.Graphics();
    preview.zIndex = 1;
    container.addChild(preview);

    this.state = {
      active: true,
      points: Array.isArray(options.initialPoints) ? options.initialPoints.map((p) => ({ x: p.x, y: p.y })) : [],
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

    const getCanvasPos = () => ({ x: canvas.mousePosition.x, y: canvas.mousePosition.y });

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
      preview.lineStyle(s.lineWidth, s.lineColorNum, 0.35);
      preview.moveTo(this.state.points[0].x, this.state.points[0].y);
      for (let i = 1; i < this.state.points.length; i++) preview.lineTo(this.state.points[i].x, this.state.points[i].y);
      if (mousePos) preview.lineTo(mousePos.x, mousePos.y);
    };

    const stopListeners = () => {
      const h = this.state.handlers;
      canvas.stage.off("pointerdown", h.pointerdown);
      canvas.stage.off("pointermove", h.pointermove);
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

    // handlers
    this.state.handlers.pointerdown = (event) => {
      const btn = event?.data?.button ?? event?.button ?? 0;
      if (btn !== 0) return;
      const pos = getCanvasPos();
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
      drawPreview();
    };

    this.state.handlers.pointermove = () => {
      if (!this.state?.active) return;
      const pos = getCanvasPos();
      this.state.lastMouse = pos;
      if (this.state.points.length) drawPreview(pos);
    };

    this.state.handlers.keydown = (e) => {
      if (!this.state?.active) return;

      if (e.key === "Escape") { e.preventDefault(); return cleanup("Route tool cancelled."); }
      if (e.key === "Backspace") { e.preventDefault(); this.state.points.pop(); return drawPreview(); }
      if (e.key === "Enter") { e.preventDefault(); stopListeners(); return finishAndBroadcast(); }
      if (e.key.toLowerCase() === "o" && e.altKey) { e.preventDefault(); new IndyRouteSettingsApp().render({ force: true }); }
    };

    // attach
    canvas.stage.on("pointerdown", this.state.handlers.pointerdown);
    canvas.stage.on("pointermove", this.state.handlers.pointermove);
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
