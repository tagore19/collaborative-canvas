// client/main.js
document.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('draw-canvas');
  const app = new CanvasApp(canvasEl);

  // toolbar elements
  const colorInput = document.getElementById('color');
  const sizeInput = document.getElementById('size');
  const erBtn = document.getElementById('eraser');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const clearBtn = document.getElementById('clear');

  colorInput.addEventListener('input', (e) => app.setColor(e.target.value));
  sizeInput.addEventListener('input', (e) => app.setSize(e.target.value));

  erBtn.addEventListener('click', () => {
    app.setEraser(!app.eraserMode);
    erBtn.textContent = app.eraserMode ? 'Brush' : 'Eraser';
  });

  undoBtn.addEventListener('click', () => {
    if (typeof window.sendGlobalUndo === 'function') {
      window.sendGlobalUndo();
    } else {
      app.undo();
    }
  });

  redoBtn.addEventListener('click', () => {
    if (typeof window.sendGlobalRedo === 'function') {
      window.sendGlobalRedo();
    } else {
      app.redo();
    }
  });

  clearBtn.addEventListener('click', () => {
    // local immediate clear for snappy UX
    app.clear();
    // inform server to clear for everyone (sendGlobalClear is provided by websocket.js)
    if (typeof window.sendGlobalClear === 'function') {
      window.sendGlobalClear();
    }
    // also clear local op mirror if present
    if (window.__OPS) window.__OPS = [];
  });

  // expose for debug and websocket binding
  window.canvasApp = app;
});
