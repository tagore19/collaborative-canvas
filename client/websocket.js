// client/websocket.js
// Handles socket.io connection and maintains a local mirror of server operations,
// plus a small "who's online" UI in the toolbar. Includes op_seg preview rendering.

(function() {
  const socket = io(); // from socket.io script tag

  let myId = null;
  let myColor = '#000';
  // local mirror of global operations (full op objects with active flag)
  window.__OPS = []; // exposed for debugging
  window.__USER_LIST = window.__USER_LIST || {};
  window.__USER_COLORS = window.__USER_COLORS || {};

  // render user-list UI in toolbar
  function renderUserList() {
    const container = document.getElementById('user-list');
    if (!container) return;
    container.innerHTML = '';
    const entries = Object.entries(window.__USER_LIST || {});
    // sort so current user appears first
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

  // welcome includes assigned id, color, and current active operations
  socket.on('welcome', (info) => {
    myId = info.id;
    myColor = info.color;
    console.log('welcome', info);
    window.__MY_SOCKET_ID = myId;
    window.__MY_COLOR = myColor;

    // add self to user list and colors
    window.__USER_LIST[myId] = { id: myId, color: myColor, name: 'You' };
    window.__USER_COLORS[myId] = myColor;

    // initialize local op log with server's active ops
    window.__OPS = Array.isArray(info.operations) ? info.operations.slice() : [];

    // draw them
    if (window.canvasApp) {
      if (typeof window.canvasApp.clearCanvas === 'function') window.canvasApp.clearCanvas();
      window.__OPS.forEach(op => {
        if (op.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(op);
      });
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

  // server broadcast: new op added
  socket.on('op_add', ({ op }) => {
    if (!op) return;
    // append to local ops
    window.__OPS.push(op);
    // draw for others; our own client likely already drew it locally
    if (window.canvasApp) {
      if (op.userId !== myId) {
        window.canvasApp.drawOperation && window.canvasApp.drawOperation(op);
      }
    }
  });

  // transient segment preview from other clients (now uses drawRemoteStroke so meta respected)
  socket.on('op_seg', ({ from, strokeId, points, meta }) => {
    // Draw transient preview segments for other users using the same draw routine.
    // 'points' are normalized coordinates; we use drawRemoteStroke so meta (size/color) is honored.
    if (!window.canvasApp || !Array.isArray(points) || points.length === 0) return;

    // Use drawRemoteStroke for consistent rendering (this will handle single-point dots too).
    // For preview we can call it directly; it won't add to ops[].
    window.canvasApp.drawRemoteStroke(points, meta || {});
  });

  // op_undo: server tells all clients this op is now inactive
  socket.on('op_undo', ({ id, userId }) => {
    const idx = window.__OPS.findIndex(o => o.id === id);
    if (idx !== -1) {
      window.__OPS[idx].active = false;
    }
    if (window.canvasApp) {
      window.canvasApp.clearCanvas && window.canvasApp.clearCanvas();
      window.__OPS.forEach(op => { if (op.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(op); });
    }
  });

  // op_redo: server reactivated an op and may include op object
  socket.on('op_redo', ({ id, userId, op }) => {
    const idx = window.__OPS.findIndex(o => o.id === id);
    if (idx !== -1) {
      window.__OPS[idx].active = true;
    } else if (op) {
      window.__OPS.push(op);
    }
    if (window.canvasApp) {
      window.canvasApp.clearCanvas && window.canvasApp.clearCanvas();
      window.__OPS.forEach(o => { if (o.active) window.canvasApp.drawOperation && window.canvasApp.drawOperation(o); });
    }
  });

  // legacy stroke event (ignored; server now uses op_add)
  socket.on('stroke', ({ from, packet }) => {
    console.log('deprecated stroke event received, ignoring');
  });

  // cursor updates from other clients
  socket.on('cursor', ({ id, cursor }) => {
    if (!window.canvasApp) return;
    const color = (window.__USER_COLORS && window.__USER_COLORS[id]) || '#ff0000';
    window.canvasApp.updateRemoteCursor && window.canvasApp.updateRemoteCursor(id, cursor, color);
  });

  // wire canvasApp hooks when ready
  function bindToCanvasApp() {
    if (!window.canvasApp) return;

    // when local segments are generated we send them to server as a stroke packet;
    // server will convert to an authoritative op and broadcast op_add.
    window.canvasApp.onLocalStroke = (normalizedPoints, meta, info) => {
      socket.emit('stroke', { points: normalizedPoints, meta, canvasSize: meta.canvasSize, strokeId: info && info.strokeId, isFinal: !!(info && info.isFinal) });
    };

    // cursor updates throttled
    let lastSent = 0;
    window.canvasApp.onLocalCursor = (norm) => {
      const now = Date.now();
      if (now - lastSent < 50) return;
      lastSent = now;
      socket.emit('cursor', norm);
    };

    // override undo/redo button wiring: send global commands
    window.sendGlobalUndo = () => socket.emit('undo');
    window.sendGlobalRedo = () => socket.emit('redo');
  }

  const binder = setInterval(() => {
    if (window.canvasApp) {
      bindToCanvasApp();
      clearInterval(binder);
    }
  }, 100);

})();
