// client/main.js
document.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('draw-canvas');
  const app = new CanvasApp(canvasEl);

  // wire toolbar
  const colorInput = document.getElementById('color');
  const sizeInput = document.getElementById('size');
  const erBtn = document.getElementById('eraser');
  colorInput.addEventListener('input', (e) => app.setColor(e.target.value));
  sizeInput.addEventListener('input', (e) => app.setSize(e.target.value));

  erBtn.addEventListener('click', () => {
    app.setEraser(!app.eraserMode);
    erBtn.textContent = app.eraserMode ? 'Brush' : 'Eraser';
  });

  // Global undo/redo: send to server (websocket.js exposes sendGlobalUndo/sendGlobalRedo)
  document.getElementById('undo').addEventListener('click', () => {
    if (typeof window.sendGlobalUndo === 'function') {
      window.sendGlobalUndo();
    } else {
      // fallback to local undo if websocket not yet bound
      app.undo();
    }
  });

  document.getElementById('redo').addEventListener('click', () => {
    if (typeof window.sendGlobalRedo === 'function') {
      window.sendGlobalRedo();
    } else {
      app.redo();
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    // clear local and also (optionally) inform server - for now local clear only
    app.clear();
  });

  // expose for debug and websocket binding
  window.canvasApp = app;
});
