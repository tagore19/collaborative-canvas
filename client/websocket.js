// client/websocket.js
// Handles socket.io connection and maintains a local mirror of server operations,
// presence UI, op previews, and exposes global command hooks.

(function() {
  const socket = io(); // from socket.io script tag

  let myId = null;
  let myColor = '#000';
  window.__OPS = []; // authoritative op log mirror
  window.__USER_LIST = window.__USER_LIST || {};
  window.__USER_COLORS = window.__USER_COLORS || {};

  // render user-list UI (if present in DOM)
  function renderUserList() {
    const container = document.getElementById('user-list');
    if (!container) return;
    container.innerHTML = '';
    const entries = Object.entries(window.__USER_LIST || {});
    entries.sort((a,b) => {
      if (a[0] === myId) return -1;
      if (b[0] === myId) return 1;
      return 0;
    });
    entries.forEach(([id, info]) => {
      const pill = document.createElement('div');
      pill.className = 'user-pill' + (id === myId ? ' user-me' : '');
      pill.title = id === myId ? 'You' : `User ${id}`;
      const sw = document.createElement('span');
      sw.className = 'user-swatch';
      sw.style.background = info.color || '#999';
      pill.appendChild(sw);
      const txt = document.createElement('span');
      txt.textContent = id === myId ? 'You' : (info.name || id.slice(0,6));
      pill.appendChild(txt);
      container.appendChild(pill);
    });
  }

  socket.on('connect', () => {
    console.log('socket connected', socket.id);
  });

  socket.on('welcome', (info) => {
    myId = info.id;
    myColor = info.color;
    console.log('welcome', info);
    window.__MY_SOCKET_ID = myId;
    window.__MY_COLOR = myColor;

    window.__USER_LIST[myId] = { id: myId, color: myColor, name: 'You' };
    window.__USER_COLORS[myId] = myColor;

    window.__OPS = Array.isArray(info.operations) ? info.operations.slice() : [];

    if (window.canvasApp) {
      if (typeof window.canvasApp.clearCanvas === 'function') window.canvasApp.clearCanvas();
      window.__OPS.forEach(op => { if (op.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(op); });
    }

    renderUserList();
  });

  socket.on('user-join', (u) => {
    console.log('user-join', u);
    if (u && u.id) {
      window.__USER_LIST[u.id] = { id: u.id, color: u.color || '#777', name: u.name || u.id.slice(0,6) };
      if (u.color) window.__USER_COLORS[u.id] = u.color;
      renderUserList();
    }
  });

  socket.on('user-left', (u) => {
    console.log('user-left', u);
    if (u && u.id && window.__USER_LIST && window.__USER_LIST[u.id]) {
      delete window.__USER_LIST[u.id];
      delete window.__USER_COLORS[u.id];
      renderUserList();
    }
    if (window.canvasApp) window.canvasApp.updateRemoteCursor && window.canvasApp.updateRemoteCursor(u.id, null);
  });

  // Authoritative op added
  socket.on('op_add', ({ op }) => {
    if (!op) return;
    window.__OPS.push(op);
    if (window.canvasApp) {
      if (op.userId !== myId) {
        window.canvasApp.drawOperation && window.canvasApp.drawOperation(op);
      }
    }
  });

  // Transient segment preview from other clients
  socket.on('op_seg', ({ from, strokeId, points, meta }) => {
    if (!window.canvasApp || !Array.isArray(points) || points.length === 0) return;
    // Use canonical draw routine so meta (size/color/eraser) is preserved and dots render correctly
    window.canvasApp.drawRemoteStroke(points, meta || {});
  });

  // Op undo
  socket.on('op_undo', ({ id, userId }) => {
    const idx = window.__OPS.findIndex(o => o.id === id);
    if (idx !== -1) window.__OPS[idx].active = false;
    if (window.canvasApp) {
      window.canvasApp.clearCanvas && window.canvasApp.clearCanvas();
      window.__OPS.forEach(op => { if (op.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(op); });
    }
  });

  // Op redo
  socket.on('op_redo', ({ id, userId, op }) => {
    const idx = window.__OPS.findIndex(o => o.id === id);
    if (idx !== -1) window.__OPS[idx].active = true;
    else if (op) window.__OPS.push(op);
    if (window.canvasApp) {
      window.canvasApp.clearCanvas && window.canvasApp.clearCanvas();
      window.__OPS.forEach(o => { if (o.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(o); });
    }
  });

  // Global clear event
  socket.on('clear', () => {
    console.log('🧹 Canvas cleared (server)');
    if (window.canvasApp) {
      // clear main canvas
      window.canvasApp.clear();
      // clear client op mirror
      window.__OPS = [];
    }
    renderUserList();
  });

  // Legacy stroke (ignored)
  socket.on('stroke', ({ from, packet }) => {
    console.log('deprecated stroke event received, ignoring');
  });

  // Cursor updates
  socket.on('cursor', ({ id, cursor }) => {
    if (!window.canvasApp) return;
    const color = (window.__USER_COLORS && window.__USER_COLORS[id]) || '#ff0000';
    window.canvasApp.updateRemoteCursor && window.canvasApp.updateRemoteCursor(id, cursor, color);
  });

  // bind canvas hooks
  function bindToCanvasApp() {
    if (!window.canvasApp) return;

    window.canvasApp.onLocalStroke = (normalizedPoints, meta, info) => {
      socket.emit('stroke', { points: normalizedPoints, meta, canvasSize: meta.canvasSize, strokeId: info && info.strokeId, isFinal: !!(info && info.isFinal) });
    };

    let lastSent = 0;
    window.canvasApp.onLocalCursor = (norm) => {
      const now = Date.now();
      if (now - lastSent < 50) return;
      lastSent = now;
      socket.emit('cursor', norm);
    };

    // expose undo/redo/clear hooks for UI
    window.sendGlobalUndo = () => socket.emit('undo');
    window.sendGlobalRedo = () => socket.emit('redo');
    window.sendGlobalClear = () => socket.emit('clear');
  }

  const binder = setInterval(() => {
    if (window.canvasApp) {
      bindToCanvasApp();
      clearInterval(binder);
    }
  }, 100);

})();
