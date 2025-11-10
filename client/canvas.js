// client/canvas.js
// Reliable drawing + undo/redo using ImageData snapshots
// Now batches stroke segments using strokeId and marks final packet on pointerup.
// Includes robust drawRemoteStroke (handles dots, sizes, eraser).

class CanvasApp {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    // drawing state
    this.isDrawing = false;
    this.strokeColor = '#000000';
    this.strokeSize = 6;
    this.eraserMode = false;

    // undo/redo stacks (local fallback)
    this.undoStack = [];
    this.redoStack = [];
    this.maxStack = 40;

    // other
    this._debug = false;
    this._pendingPoints = [];

    // hooks for networking
    // onLocalStroke(normalizedPoints, meta, info) where info = { strokeId, isFinal }
    this.onLocalStroke = null;
    this.onLocalCursor = null;

    // current stroke id for the stroke being drawn
    this.currentStrokeId = null;

    // init
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindPointerEvents();

    // initial snapshot for undo baseline
    try { this._pushUndo(); } catch (e) {}
  }

  _log(...args) { if (this._debug) console.log('[CanvasApp]', ...args); }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.scale(this.dpr, this.dpr);

    if (this.undoStack.length === 0) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    } else {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last) this._restoreImageData(last);
    }
  }

  _bindPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  _getPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    return { x: clientX - rect.left, y: clientY - rect.top, t: Date.now() };
  }

  _makeStrokeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 's_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*100000).toString(36);
  }

  _onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.isDrawing = true;
    this.currentPath = [];
    const pt = this._getPoint(e);
    this.currentPath.push(pt);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}

    // create a stroke id for this logical stroke
    this.currentStrokeId = this._makeStrokeId();

    // push local undo snapshot and clear redo
    this._pushUndo();
    this.redoStack = [];

    // prepare pending points
    this._pendingPoints = [pt];
  }

  _onPointerMove(e) {
    const pt = this._getPoint(e);

    if (this.onLocalCursor) {
      this.onLocalCursor({ x: pt.x / this.logicalWidth, y: pt.y / this.logicalHeight });
    }

    if (!this.isDrawing) return;
    this.currentPath.push(pt);
    this._pendingPoints.push(pt);

    if (this._pendingPoints.length >= 2) {
      const len = this._pendingPoints.length;
      const seg = [ this._pendingPoints[len-2], this._pendingPoints[len-1] ];
      this._drawImmediate(seg);

      // send normalized minimal segment to hook, include strokeId and isFinal=false
      if (this.onLocalStroke) {
        const normalized = this._normalizePoints(seg);
        this.onLocalStroke(normalized, {
          color: this.eraserMode ? '#ffffff' : this.strokeColor,
          size: this.strokeSize,
          eraser: this.eraserMode,
          canvasSize: { w: this.logicalWidth, h: this.logicalHeight }
        }, { strokeId: this.currentStrokeId, isFinal: false });
      }

      this._pendingPoints = [ this._pendingPoints[len-1] ];
    }
  }

  _onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    try { this.canvas.releasePointerCapture && this.canvas.releasePointerCapture(e.pointerId); } catch (err) {}

    // if there is one pending point left, draw a dot and send it as final
    if (this._pendingPoints.length === 1) {
      const p = this._pendingPoints[0];
      const ctx = this.ctx;
      ctx.save();
      if (this.eraserMode) ctx.globalCompositeOperation = 'destination-out';
      else { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = this.strokeColor; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, this.strokeSize/2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (this.onLocalStroke) {
        this.onLocalStroke(this._normalizePoints([p]), {
          color: this.eraserMode ? '#ffffff' : this.strokeColor,
          size: this.strokeSize,
          eraser: this.eraserMode,
          canvasSize: { w: this.logicalWidth, h: this.logicalHeight }
        }, { strokeId: this.currentStrokeId, isFinal: true });
      }
    } else if (this._pendingPoints.length === 0) {
      // nothing pending: still send final to inform server (edge case)
      if (this.onLocalStroke) {
        this.onLocalStroke([], {
          color: this.eraserMode ? '#ffffff' : this.strokeColor,
          size: this.strokeSize,
          eraser: this.eraserMode,
          canvasSize: { w: this.logicalWidth, h: this.logicalHeight }
        }, { strokeId: this.currentStrokeId, isFinal: true });
      }
    } else {
      // there may be leftover pending points >1 (rare). send them as final segments
      const segs = [];
      for (let i = 1; i < this._pendingPoints.length; i++) {
        segs.push([ this._pendingPoints[i-1], this._pendingPoints[i] ]);
      }
      // draw remaining
      segs.forEach(s => this._drawImmediate(s));
      // flatten points to normalized list and send as final
      const ptsFlat = this._pendingPoints.slice();
      if (this.onLocalStroke) {
        this.onLocalStroke(this._normalizePoints(ptsFlat), {
          color: this.eraserMode ? '#ffffff' : this.strokeColor,
          size: this.strokeSize,
          eraser: this.eraserMode,
          canvasSize: { w: this.logicalWidth, h: this.logicalHeight }
        }, { strokeId: this.currentStrokeId, isFinal: true });
      }
    }

    this._pendingPoints = [];
    this.currentPath = [];
    this.currentStrokeId = null;
  }

  _drawImmediate(seg) {
    if (!seg || seg.length < 2) return;
    const a = seg[0], b = seg[1];
    const ctx = this.ctx;
    ctx.save();
    if (this.eraserMode) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(8, this.strokeSize * 1.5);
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.strokeColor;
      ctx.lineWidth = this.strokeSize;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  _normalizePoints(points) {
    return points.map(p => ({ x: p.x / this.logicalWidth, y: p.y / this.logicalHeight, t: p.t }));
  }

  // --- rest unchanged: undo/redo helpers, drawRemoteStroke, drawOperation, etc. ---
  _pushUndo() {
    try {
      const img = this._captureImageData();
      const last = this.undoStack.length ? this.undoStack[this.undoStack.length - 1] : null;
      if (last && this._imageDataEquals(last, img)) return;
      this.undoStack.push(img);
      if (this.undoStack.length > this.maxStack) this.undoStack.shift();
    } catch (err) { console.warn('pushUndo failed', err); }
  }

  _captureImageData() {
    const w = Math.floor(this.canvas.width / this.dpr);
    const h = Math.floor(this.canvas.height / this.dpr);
    return this.ctx.getImageData(0, 0, w, h);
  }

  _restoreImageData(imgData) {
    if (!imgData) return;
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.putImageData(imgData, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  _imageDataEquals(a, b) {
    if (!a || !b) return false;
    if (a.width !== b.width || a.height !== b.height) return false;
    const la = a.data, lb = b.data;
    if (la.length !== lb.length) return false;
    for (let i = 0; i < la.length; i++) if (la[i] !== lb[i]) return false;
    return true;
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev) this._restoreImageData(prev);
    else {
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.setTransform(1,0,0,1,0,0);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, rect.width, rect.height);
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    try { const snap = this._captureImageData(); this.undoStack.push(snap); } catch(e){}
    this._restoreImageData(next);
  }

  clear() {
    this._pushUndo();
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.redoStack = [];
  }

  setColor(hex) { this.strokeColor = hex; this.eraserMode = false; }
  setSize(n) { this.strokeSize = Number(n); }
  setEraser(on) { this.eraserMode = !!on; }

  // ---- New: operation-based helpers ----

  // Clear the canvas to white (used when replaying ops)
  clearCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.scale(this.dpr, this.dpr);
  }

  // Draw a single op (stroke) onto this canvas
  drawOperation(op) {
    if (!op || op.type !== 'stroke' || !op.data) return;
    const meta = {
      color: op.data.color,
      size: op.data.size,
      eraser: !!op.data.eraser
    };
    // op.data.points are normalized (server stored what client sent)
    this.drawRemoteStroke(op.data.points, meta);
  }

  // Draw remote stroke: convert normalized points to pixel coords and draw segments
  drawRemoteStroke(normalizedPoints, meta) {
    if (!Array.isArray(normalizedPoints) || normalizedPoints.length === 0) return;

    // convert normalized -> pixel coords
    const points = normalizedPoints.map(p => ({ x: p.x * this.logicalWidth, y: p.y * this.logicalHeight, t: p.t || Date.now() }));

    // save local drawing params
    const prevColor = this.strokeColor, prevSize = this.strokeSize, prevEraser = this.eraserMode;

    // apply remote meta (if provided)
    if (meta) {
      if (meta.color) this.strokeColor = meta.color;
      if (meta.size) this.strokeSize = meta.size;
      this.eraserMode = !!meta.eraser;
    }

    // If only a single point, draw a filled circle (dot)
    if (points.length === 1) {
      const p = points[0];
      const ctx = this.ctx;
      ctx.save();
      if (this.eraserMode) {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.strokeColor;
      }
      const radius = Math.max(1, this.strokeSize / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // restore
      this.strokeColor = prevColor;
      this.strokeSize = prevSize;
      this.eraserMode = prevEraser;
      return;
    }

    // Draw segments between consecutive points for multi-point stroke
    for (let i = 1; i < points.length; i++) {
      this._drawImmediate([points[i-1], points[i]]);
    }

    // restore local drawing params
    this.strokeColor = prevColor;
    this.strokeSize = prevSize;
    this.eraserMode = prevEraser;
  }

  // Optional: remote cursor support (overlay canvas)
  updateRemoteCursor(id, normPos, color) {
    if (!normPos) {
      if (this.remoteCursors) delete this.remoteCursors[id];
      return;
    }
    this.remoteCursors = this.remoteCursors || {};
    this.remoteCursors[id] = { x: normPos.x * this.logicalWidth, y: normPos.y * this.logicalHeight, color, lastSeen: Date.now() };
    this._renderCursors();
  }

  _getOrCreateOverlay() {
    if (this._overlay) return this._overlay;
    const overlay = document.createElement('canvas');
    overlay.style.position = 'absolute';
    overlay.style.left = this.canvas.style.left || '0';
    overlay.style.top = this.canvas.style.top || '0';
    overlay.style.width = this.canvas.style.width;
    overlay.style.height = this.canvas.style.height;
    overlay.style.pointerEvents = 'none';
    overlay.width = this.canvas.width;
    overlay.height = this.canvas.height;
    overlay.id = 'cursor-overlay';
    this.canvas.parentElement.style.position = 'relative';
    this.canvas.parentElement.appendChild(overlay);
    this._overlay = overlay;
    return overlay;
  }

  _renderCursors() {
    const overlay = this._getOrCreateOverlay();
    const octx = overlay.getContext('2d');
    octx.clearRect(0,0, overlay.width, overlay.height);
    octx.setTransform(1,0,0,1,0,0);
    octx.scale(this.dpr, this.dpr);
    if (!this.remoteCursors) return;
    const now = Date.now();
    Object.keys(this.remoteCursors).forEach(id => {
      const c = this.remoteCursors[id];
      if (now - c.lastSeen > 5000) { delete this.remoteCursors[id]; return; }
      octx.beginPath();
      octx.fillStyle = c.color || '#ff0000';
      octx.arc(c.x, c.y, 6, 0, Math.PI*2);
      octx.fill();
    });
  }

}

// expose
window.CanvasApp = CanvasApp;
