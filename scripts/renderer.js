import { DEFAULTS, getCameraScaleForPath } from "./settings.js";
import { IndyRouteLabelRenderer } from "./label-renderer.js";

function panToPosition(x, y, scale) {
  if (canvas?.pan) return canvas.pan({ x, y, scale });
  if (canvas?.animatePan) return canvas.animatePan({ x, y, scale, duration: 0 });
}

const labelRenderer = new IndyRouteLabelRenderer();

export const IndyRouteRenderer = {
  ensureRoot() {
    window.__travelerBroadcast ??= { containers: [], preview: null, previewRouteId: null };
    return window.__travelerBroadcast;
  },

  clearLocal() {
    const root = this.ensureRoot();
    for (const entry of root.containers) {
      const c = entry?.container ?? entry;
      try { c.destroy({ children: true }); } catch {}
    }
    root.containers.length = 0;
    this.clearPreview();
  },

  clearRoute(routeId) {
    if (!routeId) return;
    const root = this.ensureRoot();
    for (let i = root.containers.length - 1; i >= 0; i--) {
      const entry = root.containers[i];
      if (entry?.routeId !== routeId) continue;
      const c = entry?.container ?? entry;
      try { c.destroy({ children: true }); } catch {}
      root.containers.splice(i, 1);
    }
    if (root.preview && root.previewRouteId === routeId) {
      try { root.preview.destroy({ children: true }); } catch {}
      root.preview = null;
      root.previewRouteId = null;
    }
  },

  clearPreview() {
    const root = this.ensureRoot();
    if (root.preview) {
      try { root.preview.destroy({ children: true }); } catch {}
      root.preview = null;
    }
    root.previewRouteId = null;
  },

  /** Pause a route's animation on this client (used by encounter system). */
  pauseRoute(routeId) {
    const root = this.ensureRoot();
    const entry = root.containers.find((e) => e?.routeId === routeId);
    if (entry) entry.encounterPaused = true;
  },

  /** Resume a paused route's animation on this client. */
  resumeRoute(routeId) {
    const root = this.ensureRoot();
    const entry = root.containers.find((e) => e?.routeId === routeId);
    if (entry) entry.encounterPaused = false;
  },

  distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  },

  createRouteContainer(settings) {
    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 999999;

    const preferAbove = settings?.renderAboveTokens;
    const layer = preferAbove
      ? (canvas.effects ?? canvas.foreground ?? canvas.primary)
      : canvas.primary;
    layer.sortableChildren = true;
    layer.addChild(container);

    const finalLine = new PIXI.Graphics(); finalLine.zIndex = 2; container.addChild(finalLine);
    const dot = new PIXI.Graphics();      dot.zIndex = 3; container.addChild(dot);

    return { container, finalLine, dot };
  },

  drawDot(dot, x, y, settings, angleRad) {
    if (!dot) return;
    const container = dot?.parent;
    if (!settings.showDot) {
      dot?.clear?.();
      if (container?.travelerTokenSprite) container.travelerTokenSprite.visible = false;
      return;
    }
    this.ensureTokenSprite(container, settings);
    if (container?.travelerTokenState === "ready" && container.travelerTokenSprite) {
      const sprite = container.travelerTokenSprite;
      sprite.visible = true;
      sprite.position.set(x, y);
      const scaleMult = Number.isFinite(settings.dotTokenScale) ? settings.dotTokenScale : 1;
      const size = settings.dotRadius * 2 * scaleMult;
      const tex = sprite.texture;
      const base = Math.max(tex?.width || 1, tex?.height || 1);
      const scale = size / base;
      sprite.scale.set(scale);
      if (settings.dotTokenRotate && Number.isFinite(angleRad)) {
        const offsetDeg = Number.isFinite(settings.dotTokenRotateOffset)
          ? settings.dotTokenRotateOffset
          : 0;
        const offsetRad = (offsetDeg * Math.PI) / 180;
        sprite.rotation = angleRad + offsetRad;
      } else {
        sprite.rotation = 0;
      }
      dot?.clear?.();
      return;
    }
    if (settings.dotTokenUuid && container?.travelerTokenState !== "failed") {
      dot?.clear?.();
      return;
    }
    dot.clear();
    dot.beginFill(settings.dotColorNum, 1.0);
    dot.drawCircle(x, y, settings.dotRadius);
    dot.endFill();
  },

  drawEndX(container, x, y, settings, size = 20) {
    if (settings.showEndX === false) return;
    const g = new PIXI.Graphics();
    g.lineStyle({
      width: settings.lineWidth * 2,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND
    });
    g.moveTo(x - size, y - size); g.lineTo(x + size, y + size);
    g.moveTo(x + size, y - size); g.lineTo(x - size, y + size);
    container.addChild(g);
  },

  drawDashedSegment(graphics, a, b, dashState, dashLen = 20, gapLen = 14) {
    const segLen = this.distance(a, b);
    if (segLen <= 1e-6) return;
    const patternLen = dashLen + gapLen;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;

    let remaining = segLen;
    let t = 0;
    while (remaining > 0) {
      const offset = dashState.offset % patternLen;
      const inDash = offset < dashLen;
      const step = inDash ? Math.min(dashLen - offset, remaining) : Math.min(patternLen - offset, remaining);
      if (inDash) {
        const x0 = a.x + dx * t;
        const y0 = a.y + dy * t;
        const x1 = a.x + dx * (t + step);
        const y1 = a.y + dy * (t + step);
        graphics.moveTo(x0, y0);
        graphics.lineTo(x1, y1);
      }
      t += step;
      remaining -= step;
      dashState.offset = (dashState.offset + step) % patternLen;
    }
  },

  getDashPattern(settings) {
    const width = Number.isFinite(settings?.lineWidth) ? settings.lineWidth : 1;
    const dashSetting = Number.isFinite(settings?.dashLength) && settings.dashLength > 0 ? settings.dashLength : null;
    const gapSetting = Number.isFinite(settings?.gapLength) && settings.gapLength > 0 ? settings.gapLength : null;
    return {
      dashLen: dashSetting ? dashSetting : Math.max(20, width * 2),
      gapLen: gapSetting ? gapSetting : Math.max(14, width * 1.6)
    };
  },

  ensureTokenSprite(container, settings) {
    if (!container || !settings.dotTokenUuid) return;
    if (container.travelerTokenState) return;
    container.travelerTokenState = "loading";
    this.resolveTokenTexture(settings.dotTokenUuid)
      .then((texture) => {
        if (!texture || container.destroyed) {
          container.travelerTokenState = "failed";
          return;
        }
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.zIndex = 3;
        container.addChild(sprite);
        container.travelerTokenSprite = sprite;
        container.travelerTokenState = "ready";
      })
      .catch(() => {
        container.travelerTokenState = "failed";
      });
  },

  async resolveTokenTexture(uuid) {
    const root = this.ensureRoot();
    root.tokenCache ??= new Map();
    if (root.tokenCache.has(uuid)) return root.tokenCache.get(uuid);

    let texture = null;
    try {
      const doc = await fromUuid(uuid);
      const src =
        doc?.texture?.src ||
        doc?.prototypeToken?.texture?.src ||
        doc?.actor?.prototypeToken?.texture?.src ||
        doc?.img ||
        null;
      if (src) {
        // v14: foundry.canvas.loadTexture is the canonical path; global loadTexture removed.
        texture = await foundry.canvas.loadTexture(src);
      }
    } catch {}

    root.tokenCache.set(uuid, texture);
    return texture;
  },

  async resolveRouteToken(uuid) {
    if (!uuid) return null;
    try {
      const doc = await fromUuid(uuid);
      let tokenDoc = null;
      if (doc?.documentName === "Token") {
        tokenDoc = doc;
      } else if (doc?.document?.documentName === "Token") {
        tokenDoc = doc.document;
      } else if (doc?.documentName === "Actor") {
        const tokens = doc.getActiveTokens?.(true, true) ?? doc.getActiveTokens?.() ?? [];
        tokenDoc = tokens[0]?.document ?? null;
      }
      if (!tokenDoc) return null;
      if (tokenDoc.parent?.id && canvas?.scene?.id && tokenDoc.parent.id !== canvas.scene.id) return null;
      return tokenDoc;
    } catch {
      return null;
    }
  },

  async resolveRouteTokenInfo(uuid) {
    if (!uuid) return { tokenDoc: null, sourceType: null };
    try {
      const doc = await fromUuid(uuid);
      let tokenDoc = null;
      let sourceType = null;
      if (doc?.documentName === "Token") {
        tokenDoc = doc;
        sourceType = "token";
      } else if (doc?.document?.documentName === "Token") {
        tokenDoc = doc.document;
        sourceType = "token";
      } else if (doc?.documentName === "Actor") {
        const tokens = doc.getActiveTokens?.(true, true) ?? doc.getActiveTokens?.() ?? [];
        tokenDoc = tokens[0]?.document ?? null;
        sourceType = "actor";
      }
      if (!tokenDoc) return { tokenDoc: null, sourceType };
      if (tokenDoc.parent?.id && canvas?.scene?.id && tokenDoc.parent.id !== canvas.scene.id) {
        return { tokenDoc: null, sourceType };
      }
      return { tokenDoc, sourceType };
    } catch {
      return { tokenDoc: null, sourceType: null };
    }
  },

  async resolveRouteSound(value) {
    if (!value) return null;
    const root = this.ensureRoot();
    root.soundCache ??= new Map();
    if (root.soundCache.has(value)) return root.soundCache.get(value);

    let src = null;
    try {
      if (value.includes(".") && !value.includes("/") && !value.includes("\\")) {
        const doc = await fromUuid(value);
        src = doc?.path || doc?.src || doc?.sound?.path || null;
      } else {
        src = value;
      }
    } catch {
      src = value;
    }

    root.soundCache.set(value, src);
    return src;
  },

  snapshotFogExploration() {
    const exploration = canvas?.fog?.exploration ?? null;
    if (!exploration) return { exploration: null, explored: null, hadExploration: false };
    const explored =
      exploration.document?.explored ??
      exploration.explored ??
      exploration.data?.explored ??
      null;
    if (explored == null) return { exploration, explored: null, hadExploration: false };
    if (typeof explored === "string") return { exploration, explored, hadExploration: true };
    if (explored instanceof ArrayBuffer) return { exploration, explored: explored.slice(0), hadExploration: true };
    if (ArrayBuffer.isView(explored)) {
      const copy = explored.slice ? explored.slice() : new explored.constructor(explored);
      return { exploration, explored: copy, hadExploration: true };
    }
    if (explored?.clone) {
      try {
        return { exploration, explored: explored.clone(), hadExploration: true };
      } catch {}
    }
    if (foundry.utils?.deepClone) {
      return { exploration, explored: foundry.utils.deepClone(explored), hadExploration: true };
    }
    return { exploration, explored, hadExploration: true };
  },

  async updateFogExploration(exploration, explored) {
    if (!exploration) return;
    const updateData = { explored };
    if (exploration.document?.update) {
      await exploration.document.update(updateData, { diff: false });
      return;
    }
    if (exploration.update) {
      try {
        await exploration.update(updateData, { diff: false });
        return;
      } catch (err) {
        const id = exploration.id ?? exploration._id ?? exploration.document?._id;
        if (id && canvas?.scene?.updateEmbeddedDocuments) {
          await canvas.scene.updateEmbeddedDocuments("SceneExploration", [{ _id: id, explored }], { diff: false });
          return;
        }
        if (id && exploration.constructor?.updateDocuments) {
          await exploration.constructor.updateDocuments([{ _id: id, explored }], { diff: false });
          return;
        }
        console.warn("IndyRoute preview: fog restore failed", err);
        return;
      }
    }
    const id = exploration.id ?? exploration._id ?? exploration.document?._id;
    if (id && canvas?.scene?.updateEmbeddedDocuments) {
      console.log("IndyRoute preview: updating exploration via scene.updateEmbeddedDocuments", { id });
      await canvas.scene.updateEmbeddedDocuments("SceneExploration", [{ _id: id, explored }], { diff: false });
    }
  },

  async restoreFogExploration(snapshot) {
    if (!snapshot) return;
    const exploration = snapshot.exploration ?? canvas?.fog?.exploration ?? null;
    if (!snapshot.hadExploration) {
      if (exploration) {
        await this.updateFogExploration(exploration, "");
      } else if (canvas?.fog?.reset) {
        canvas.fog.reset();
      } else if (canvas?.fog?.clear) {
        canvas.fog.clear();
      }
    canvas?.fog?.refresh?.();
    // v14 renamed canvas.sight → canvas.visibility; call both for cross-version compat.
    canvas?.visibility?.refresh?.();
    canvas?.sight?.refresh?.();
    return;
  }
  if (!exploration || snapshot.explored == null) return;
  const explored = snapshot.explored;
  await this.updateFogExploration(exploration, explored);
  canvas?.fog?.refresh?.();
  canvas?.visibility?.refresh?.();
  canvas?.sight?.refresh?.();
  },

  moveTokenMarker(tokenDoc, x, y) {
    const tokenObj = tokenDoc?.object ?? tokenDoc?._object;
    const topLeft = this.getTokenTopLeft(tokenDoc, x, y);
    if (tokenObj?.setPosition) {
      tokenObj.setPosition(topLeft);
      return;
    }
    if (!tokenObj) return;
    tokenObj.x = topLeft.x;
    tokenObj.y = topLeft.y;
    tokenObj.refresh?.();
  },

  getTokenTopLeft(tokenDoc, x, y) {
    const tokenObj = tokenDoc?.object ?? tokenDoc?._object;
    let w = tokenObj?.w;
    let h = tokenObj?.h;
    if ((!w || !h) && tokenDoc?.width && tokenDoc?.height && canvas?.grid?.size) {
      w = tokenDoc.width * canvas.grid.size;
      h = tokenDoc.height * canvas.grid.size;
    }
    const dx = (w || 0) / 2;
    const dy = (h || 0) / 2;
    return { x: x - dx, y: y - dy };
  },

  render(payload) {
    if (!canvas?.ready) {
      Hooks.once("canvasReady", () => this.render(payload));
      return;
    }
    const { sceneId, path, settings, startTime, lingerMs, routeId, labelText, preview, elevations } = payload ?? {};
    if (game.scenes.current?.id !== sceneId) return;
    if (!Array.isArray(path) || path.length < 2) return;

    // Returns the interpolated elevation for a given path index, or undefined when
    // no elevation data was supplied (single-level scene, no change needed).
    const hasElevations = Array.isArray(elevations) && elevations.length === path.length;
    const getElevationAtIdx = hasElevations
      ? (i) => elevations[Math.min(Math.max(0, i), elevations.length - 1)]
      : () => undefined;

    const root = this.ensureRoot();
    const { container, finalLine, dot } = this.createRouteContainer(settings);
    const entry = { container, routeId: routeId ?? null, encounterPaused: false };
    root.containers.push(entry);

    let totalLen = 0;
    for (let i = 0; i < path.length - 1; i++) totalLen += this.distance(path[i], path[i + 1]);
    const duration = Math.max(0.05, totalLen / settings.drawSpeed);
    const start = path[0];
    const end = path[path.length - 1];
    const zoomFactor = Number.isFinite(settings.cameraZoomFactor) ? settings.cameraZoomFactor : DEFAULTS.cameraZoomFactor;
    const cameraScale = getCameraScaleForPath(totalLen, zoomFactor);
    const canAnimateCamera = settings.cinematicMovement && !!canvas?.animatePan && !!cameraScale;
    const introMs = canAnimateCamera
      ? (Number.isFinite(settings.introMs) ? settings.introMs : DEFAULTS.introMs)
      : 0;
    const pauseMs = canAnimateCamera
      ? (Number.isFinite(settings.pauseMs) ? settings.pauseMs : DEFAULTS.pauseMs)
      : 0;
    const startTimeAdjusted = startTime + introMs + pauseMs;
    const labelPosition = Number.isFinite(settings.labelPosition) ? settings.labelPosition : 50;
    const labelSpanInfo = settings.labelFollowPath
      ? labelRenderer.computeLabelSpanInfo(path, settings, labelText)
      : null;
    const labelRevealT = (labelSpanInfo?.metrics?.totalLen && Number.isFinite(labelSpanInfo.startDist))
      ? Math.min(1, Math.max(0, labelSpanInfo.startDist / labelSpanInfo.metrics.totalLen))
      : Math.min(1, Math.max(0, labelPosition / 100));
    let labelShown = false;
    const maybeShowLabel = () => {
      if (labelShown) return;
      labelShown = true;
      labelRenderer.drawLabel(container, path, settings, labelText, { initialAlpha: 0, spanInfo: labelSpanInfo }).then((result) => {
        console.log("checking label fade");
        const display = result?.display;
        if (!display || display.destroyed || container.destroyed) return;
        const labelLen = Number.isFinite(result?.length)
          ? result.length
          : (Number.isFinite(labelSpanInfo?.spanText) ? labelSpanInfo.spanText : 0);
        const speed = Number.isFinite(settings.drawSpeed) && settings.drawSpeed > 0 ? settings.drawSpeed : 1;
        const duration = labelLen > 0 ? (labelLen / speed) : 0;
        if (!Number.isFinite(duration) || duration <= 0) {
          display.alpha = 1;
          return;
        }
        display.alpha = 0;
        const ticker = canvas.app.ticker;
        let fadeElapsed = 0;
        const onFade = (delta) => {
          if (display.destroyed || container.destroyed) {
            ticker.remove(onFade);
            return;
          }
          fadeElapsed += delta / 60;
          const t = Math.min(1, fadeElapsed / duration);
          display.alpha = t;
          if (t >= 1) ticker.remove(onFade);
        };
        ticker.add(onFade);
      });
    };

    finalLine.clear();
    finalLine.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });

    const isPreview = preview === true;
    const restoreState = isPreview
      ? {
        tokenDoc: null,
        tokenSource: null,
        tokenStart: null,
        fogSnapshot: null,
        previewEnded: false,
        prompted: false
      }
      : null;
    const maybePromptRestore = async () => {
      if (!restoreState || restoreState.prompted) return;
      if (restoreState.tokenSource !== "token" || !restoreState.tokenDoc || !restoreState.tokenStart) return;
      restoreState.prompted = true;
      const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
      const confirmed = await dialogApi.confirm({
        title: "Restore Preview",
        content: "<p>Restore the token's original position and fog of war?</p>"
      });
      if (!confirmed) return;
      const tokenDoc = restoreState.tokenDoc;
      const { x, y } = restoreState.tokenStart;
      const tokenObj = tokenDoc?.object ?? tokenDoc?._object;
      if (tokenObj?.setPosition) {
        tokenObj.setPosition({ x, y });
      } else if (tokenObj) {
        tokenObj.x = x;
        tokenObj.y = y;
        tokenObj.refresh?.();
      }
      if (game.user.isGM && tokenDoc?.update) {
        await tokenDoc.update({ x, y }, { animate: false });
      }
      await this.restoreFogExploration(restoreState.fogSnapshot);
    };

    const marker = { tokenDoc: null, lastDocUpdate: 0, snapReady: false };
    const snapTokenToStart = () => {
      if (!marker.tokenDoc) return false;
      this.moveTokenMarker(marker.tokenDoc, start.x, start.y);
      if (game.user.isGM) {
        const topLeft = this.getTokenTopLeft(marker.tokenDoc, start.x, start.y);
        const startElev = getElevationAtIdx(0);
        const updateData = { ...topLeft };
        if (Number.isFinite(startElev)) updateData.elevation = startElev;
        marker.tokenDoc.update(updateData, { animate: false }).catch(() => {});
      }
      return true;
    };
    if (settings.dotTokenUuid) {
      this.resolveRouteTokenInfo(settings.dotTokenUuid).then((info) => {
        marker.tokenDoc = info.tokenDoc;
        if (restoreState && info.tokenDoc && info.sourceType === "token") {
          restoreState.tokenDoc = info.tokenDoc;
          restoreState.tokenSource = info.sourceType;
          restoreState.tokenStart = { x: info.tokenDoc.x, y: info.tokenDoc.y };
          restoreState.fogSnapshot = this.snapshotFogExploration();
          if (restoreState.previewEnded) maybePromptRestore();
        }
        if (marker.snapReady) snapTokenToStart();
      });
    }
    const updateMarker = (x, y, angleRad, elevation) => {
      if (marker.tokenDoc) {
        this.moveTokenMarker(marker.tokenDoc, x, y);
        if (game.user.isGM) {
          const intervalMs = Number.isFinite(settings.tokenUpdateMs)
            ? settings.tokenUpdateMs
            : DEFAULTS.tokenUpdateMs;
          const nowMs = Date.now();
          if (nowMs - marker.lastDocUpdate > intervalMs) {
            marker.lastDocUpdate = nowMs;
            const topLeft = this.getTokenTopLeft(marker.tokenDoc, x, y);
            const updateData = { ...topLeft };
            if (Number.isFinite(elevation)) updateData.elevation = elevation;
            marker.tokenDoc.update(updateData, { animate: false }).catch(() => {});
          }
        }
        dot.clear();
        return;
      }
      this.drawDot(dot, x, y, settings, angleRad);
    };

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    const deferTokenSnap = !!settings.dotTokenUuid && canAnimateCamera && introMs > 0;
    if (deferTokenSnap) {
      setTimeout(() => {
        marker.snapReady = true;
        snapTokenToStart();
      }, introMs);
    } else {
      updateMarker(start.x, start.y, 0);
    }

    const cumulative = [0];
    for (let i = 1; i < path.length; i++) {
      cumulative[i] = cumulative[i - 1] + this.distance(path[i - 1], path[i]);
    }

    const pointAt = (t) => {
      const targetLen = t * totalLen;
      let i = 1;
      while (i < cumulative.length && cumulative[i] < targetLen) i++;
      if (i >= path.length) return end;
      const prevLen = cumulative[i - 1];
      const segLen = Math.max(1e-6, cumulative[i] - prevLen);
      const segT = (targetLen - prevLen) / segLen;
      const a = path[i - 1];
      const b = path[i];
      return { x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT };
    };

    const easeInOut = (t) => t * t * (3 - 2 * t);
    const now = Date.now();
    let elapsed = Math.max(0, (now - startTimeAdjusted) / 1000);
    const shouldAnimateCamera = canAnimateCamera && elapsed < duration;
    if (shouldAnimateCamera) {
      canvas.animatePan({ x: start.x, y: start.y, scale: cameraScale, duration: introMs });
    }

    const finish = () => {
      dot.clear();
      const end = path[path.length - 1];
      this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
      if (!labelShown) maybeShowLabel();

      // lingerMs: >0 remove after ms; otherwise persist
      if (typeof lingerMs === "number" && lingerMs > 0) {
        setTimeout(() => {
          try { container.destroy({ children: true }); } catch {}
          const i = root.containers.findIndex((e) => (e?.container ?? e) === container);
          if (i >= 0) root.containers.splice(i, 1);
        }, lingerMs);
      }
      if (restoreState) {
        restoreState.previewEnded = true;
        maybePromptRestore();
      }

      // ── World clock advance (GM only, non-preview) ───────────────────
      if (game.user?.isGM && !payload.preview) {
        const modeId = payload.travelModeId ?? settings.travelMode ?? null;
        if (modeId && modeId !== "none") {
          const { advanceClock } = globalThis.__travelerClock ?? {};
          if (advanceClock) advanceClock(totalLen, modeId);
        }
      }
    };

    let soundHandle = null;
    let soundPromise = null;

    const startAnimation = () => {
      const ticker = canvas.app.ticker;
      const cam = { x: start.x, y: start.y };
      if (settings.routeSound) {
        soundPromise = this.resolveRouteSound(settings.routeSound).then((src) => {
          if (!src) return null;
          try {
            return foundry.audio?.AudioHelper?.play?.({ src, autoplay: true, loop: false });
          } catch {
            return null;
          }
        }).then((sound) => {
          soundHandle = sound ?? null;
          return soundHandle;
        });
      }

      // fast-forward
      let idx = 1;
      dashState.offset = 0;
      const t0 = Math.min(1, elapsed / duration);
      const targetIndex0 = Math.floor(t0 * (path.length - 1)) + 1;
      while (idx <= targetIndex0 && idx < path.length) {
        this.drawDashedSegment(finalLine, path[idx - 1], path[idx], dashState, dash.dashLen, dash.gapLen);
        const prev = path[idx - 1];
        const curr = path[idx];
        const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        updateMarker(curr.x, curr.y, angle, getElevationAtIdx(idx));
        idx += 1;
      }
      if (t0 >= labelRevealT) maybeShowLabel();

      if ((elapsed / duration) >= 1) {
        // DRAW FULL LINE FIRST
        dashState.offset = 0;
        for (let i = 1; i < path.length; i++) {
          this.drawDashedSegment(finalLine, path[i - 1], path[i], dashState, dash.dashLen, dash.gapLen);
        }

        finish();
        return;
      }

      // Encounter state — tracks tPrev for zone boundary detection
      const encState = { tPrev: 0, _busy: false };

      const onTick = (delta) => {
        if (container?.destroyed || finalLine?.destroyed || dot?.destroyed) {
          ticker.remove(onTick);
          return;
        }

        // Freeze progress while the GM is resolving an encounter dialog
        if (entry.encounterPaused) return;

        const tPrev = encState.tPrev;
        elapsed += delta / 60;

        const t = Math.min(1, elapsed / duration);
        const tSmooth = easeInOut(t);
        if (shouldAnimateCamera) {
          const p = pointAt(tSmooth);
          const smoothBase = Number.isFinite(settings.cameraSmooth)
            ? settings.cameraSmooth
            : DEFAULTS.cameraSmooth;
          const alpha = 1 - Math.pow(1 - smoothBase, delta);
          cam.x += (p.x - cam.x) * alpha;
          cam.y += (p.y - cam.y) * alpha;
          panToPosition(cam.x, cam.y, cameraScale);
        }
        const targetIndex = Math.floor(t * (path.length - 1)) + 1;

        while (idx <= targetIndex && idx < path.length) {
          this.drawDashedSegment(finalLine, path[idx - 1], path[idx], dashState, dash.dashLen, dash.gapLen);
          const prev = path[idx - 1];
          const curr = path[idx];
          const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
          updateMarker(curr.x, curr.y, angle, getElevationAtIdx(idx));
          idx += 1;
        }
        if (t >= labelRevealT) maybeShowLabel();

        // ── Encounter zone check (GM only, non-reentrant) ───────────────
        encState.tPrev = t;
        if (game.user?.isGM && !encState._busy && Array.isArray(payload.encounters) && payload.encounters.length) {
          const { checkZones, handleZoneFired } = globalThis.__travelerEncounters ?? {};
          if (checkZones && handleZoneFired) {
            const fired = checkZones(payload.encounters, t, tPrev);
            if (fired.length > 0) {
              const currentPos  = path[Math.min(idx - 1, path.length - 1)];
              const travelModeId = payload.travelModeId ?? settings.travelMode ?? null;
              encState._busy = true;
              // Fire zones sequentially to avoid dialog overlap
              (async () => {
                for (const zone of fired) {
                  await handleZoneFired(zone, routeId, currentPos, travelModeId);
                }
                encState._busy = false;
              })();
            }
          }
        }

        if (t >= 1) {
          ticker.remove(onTick);
          if (marker.tokenDoc && game.user.isGM) {
            const topLeft = this.getTokenTopLeft(marker.tokenDoc, end.x, end.y);
            const finalElev = getElevationAtIdx(path.length - 1);
            const finalUpdate = { ...topLeft };
            if (Number.isFinite(finalElev)) finalUpdate.elevation = finalElev;
            marker.tokenDoc.update(finalUpdate);
          }
          const fadeMs = 500;
          if (soundHandle?.fade) {
            soundHandle.fade(0, fadeMs);
          } else if (soundPromise) {
            soundPromise.then((sound) => sound?.fade?.(0, fadeMs));
          } else if (soundHandle?.stop) {
            soundHandle.stop();
          }
          if (shouldAnimateCamera) panToPosition(end.x, end.y, cameraScale);
          finish();
        }
      };

      ticker.add(onTick);
    };

    if (now < startTimeAdjusted) {
      setTimeout(startAnimation, Math.max(0, startTimeAdjusted - now));
    } else {
      startAnimation();
    }
  },

  renderStatic(path, settings, routeId, labelText, renderOptions = {}) {
    if (!canvas?.ready) return;
    if (!Array.isArray(path) || path.length < 2) return;
    this.clearPreview();

    const root = this.ensureRoot();
    const { container, finalLine, dot } = this.createRouteContainer(settings);
    root.preview = container;
    root.previewRouteId = routeId ?? null;

    finalLine.clear();
    finalLine.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    for (let i = 1; i < path.length; i++) {
      this.drawDashedSegment(finalLine, path[i - 1], path[i], dashState, dash.dashLen, dash.gapLen);
    }

    dot.clear();
    const end = path[path.length - 1];
    this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
    labelRenderer.drawLabel(container, path, settings, labelText, {
      forceHighQuality: renderOptions.forceHighQuality
    });
  },

  _estimateRouteTilePadding(settings, { includeEndX = true, labelText = "" } = {}) {
    const lineWidth = settings?.lineWidth ?? 1;
    const pad = Math.max(10, lineWidth * 2 + 4);
    const endPad = includeEndX && settings?.showEndX !== false ? lineWidth * 2 : 0;
    let labelPad = 0;
    if (settings?.showLabel && (labelText ?? "").toString().trim()) {
      const fontSize = Math.min(
        200,
        Number.isFinite(settings.labelFontSize) ? settings.labelFontSize : Math.max(10, lineWidth * 2)
      );
      const offset = Number.isFinite(settings.labelOffset) ? settings.labelOffset : 16;
      labelPad = fontSize + Math.abs(offset) + pad;
    }
    return pad + endPad + labelPad;
  },

  _measureRouteTileBounds(container, fallbackWidth, fallbackHeight) {
    const rect = new PIXI.Rectangle();
    try {
      container.getBounds(false, rect);
    } catch {
      rect.x = 0;
      rect.y = 0;
      rect.width = fallbackWidth;
      rect.height = fallbackHeight;
    }
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      rect.x = 0;
      rect.y = 0;
      rect.width = fallbackWidth;
      rect.height = fallbackHeight;
    }
    return rect;
  },

  async persistRouteToTile(path, settings, { includeEndX = true, labelText = "" } = {}) {
    if (!canvas?.ready || !canvas?.scene) return null;
    if (!Array.isArray(path) || path.length < 2) return null;
    const renderer = canvas.app?.renderer;
    if (!renderer) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of path) {
      if (!point) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;

    const margin = this._estimateRouteTilePadding(settings, { includeEndX, labelText });
    const fallbackWidth = Math.max(1, Math.ceil(maxX - minX + margin * 2));
    const fallbackHeight = Math.max(1, Math.ceil(maxY - minY + margin * 2));

    const container = new PIXI.Container();
    const line = new PIXI.Graphics();
    line.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });
    container.addChild(line);

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    for (let i = 1; i < path.length; i++) {
      this.drawDashedSegment(line, path[i - 1], path[i], dashState, dash.dashLen, dash.gapLen);
    }

    if (includeEndX) {
      const end = path[path.length - 1];
      this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
    }
    await labelRenderer.drawLabel(container, path, settings, labelText, { forceHighQuality: true });

    const bounds = this._measureRouteTileBounds(container, fallbackWidth, fallbackHeight);
    const extraPad = Math.max(2, Math.ceil((settings?.lineWidth ?? 1) / 2));
    const tileX = Math.floor(bounds.x - extraPad);
    const tileY = Math.floor(bounds.y - extraPad);
    const renderWidth = Math.max(1, Math.ceil(bounds.width + extraPad * 2));
    const renderHeight = Math.max(1, Math.ceil(bounds.height + extraPad * 2));
    container.position.set(-tileX, -tileY);

    const renderTexture = PIXI.RenderTexture.create({ width: renderWidth, height: renderHeight, resolution: 1 });
    renderer.render(container, { renderTexture, clear: true });
    const extractCanvas = renderer.extract.canvas(renderTexture);
    renderTexture.destroy(true);
    container.destroy({ children: true });

    if (!extractCanvas) return null;
    let textureSrc = null;
    const folder = "traveler";
    const fileName = `traveler-${foundry.utils.randomID()}.png`;
    try {
      // v14: FilePicker moved under foundry.applications.apps; global removed.
      const picker = foundry?.applications?.apps?.FilePicker?.implementation
        ?? foundry?.applications?.apps?.FilePicker
        ?? globalThis.FilePicker;
      // v14: ImageHelper moved from foundry.utils to foundry.helpers.media.
      // v14 uploadBase64 signature: (base64, fileName, filePath, options?)
      // v13 uploadBase64 signature: (base64, { folder, filename })
      const ImageHelper = foundry.helpers?.media?.ImageHelper ?? foundry.utils?.ImageHelper;
      if (ImageHelper?.uploadBase64) {
        await picker?.createDirectory("data", folder).catch(() => {});
        const dataUrl = extractCanvas.toDataURL("image/png");
        let upload;
        if (foundry.helpers?.media?.ImageHelper) {
          // v14 path
          upload = await foundry.helpers.media.ImageHelper.uploadBase64(dataUrl, fileName, folder);
        } else {
          // v13 path
          upload = await foundry.utils.ImageHelper.uploadBase64(dataUrl, { folder, filename: fileName });
        }
        textureSrc = upload?.path ?? (typeof upload === "string" ? upload : null) ?? textureSrc;
      } else if (picker?.upload) {
        await picker.createDirectory("data", folder).catch(() => {});
        const blob = await new Promise((resolve) => extractCanvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Failed to create PNG blob.");
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        const upload = await picker.upload("data", folder, file, {});
        textureSrc = upload?.path ?? upload ?? textureSrc;
      }
    } catch {
      textureSrc = null;
    }
    if (!textureSrc) return null;
    const tileName = (labelText ?? "").toString().trim() || "Traveler Route";
    const tileData = {
      name: tileName,
      x: tileX,
      y: tileY,
      width: extractCanvas.width || renderWidth,
      height: extractCanvas.height || renderHeight,
      alpha: Number.isFinite(settings?.lineAlpha) ? settings.lineAlpha : 1,
      texture: { src: textureSrc },
      locked: false
    };
    const created = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    return created?.[0] ?? null;
  }
};
