# ARCHITECTURE.md

## Project Overview

**Collaborative Canvas** — real-time collaborative drawing using HTML5 Canvas + Node.js + Socket.io.  
Allows multiple users to draw together, with synchronized updates, undo/redo, and a global clear function.

---

## ⚙️ Core Architecture

### **Client-Side Components**
- **canvas.js** — Manages drawing logic and canvas rendering.  
- **websocket.js** — Handles socket connection, real-time events, and global undo/redo/clear actions.  
- **main.js** — UI controls: color, brush size, eraser, undo, redo, clear.  

### **Server-Side Components**
- **server.js** — Node.js + Express + Socket.io server.  
  - Manages user connections and broadcasts drawing events.  
  - Maintains an in-memory list of all operations (`operations[]`).  
  - Handles Undo, Redo, Clear, and synchronization logic.

---

## 📊 Data Flow Diagram

1. **User draws a stroke** → client emits `stroke` with normalized coordinates.  
2. **Server receives stroke** → buffers segments and emits `op_seg` for live preview.  
3. **On stroke end**, server finalizes the stroke → appends to `operations[]` → emits `op_add` to all clients.  
4. **Clients replay** all active operations to reconstruct the canvas.  
5. **Undo/Redo:** server toggles `active` flag and broadcasts changes → clients replay active ops.  
6. **Clear:** one user emits `clear` → server empties `operations[]` → broadcasts `clear` → all clients clear canvas.

---

## 🧩 WebSocket Events

| Direction | Event | Description |
|------------|--------|-------------|
| C → S | `stroke` | Send stroke segment or final stroke data |
| C → S | `undo` / `redo` | Request undo/redo of user's stroke |
| C → S | `clear` | Request global clear |
| C → S | `cursor` | Send normalized cursor position |
| S → C | `welcome` | Initial sync: user ID, color, existing strokes |
| S → C | `op_add` | Append finalized stroke |
| S → C | `op_seg` | Show live stroke preview |
| S → C | `op_undo` / `op_redo` | Update canvas for undo/redo |
| S → C | `clear` | Global clear broadcast |
| S → C | `cursor` | Cursor position updates |

---

## 🔁 Undo/Redo Strategy

- **Operation-based (LIFO per user)**  
Each user can undo their own last active operation.  
The server sets `op.active = false` (undo) or `true` (redo).  
Clients rebuild the canvas by replaying all active operations.

- **Why not global undo?**  
Simpler conflict resolution and predictable results per user.  
All clients remain consistent because the server is authoritative.

---

## 💥 Conflict Resolution

### Conflicts:
- Overlapping strokes from different users.
- Concurrent undo/redo actions.

### Strategy:
- Server orders operations chronologically; last operation overwrites earlier pixels.  
- Undo only affects the requesting user's operations.  
- Global Clear removes all operations and resets state.

---

## ⚙️ Performance Decisions

- **Local rendering prediction:** smooth UX despite network delay.  
- **Normalized coordinates (0–1):** ensures consistent scaling on all screen sizes.  
- **Batched strokes:** server batches per `strokeId` instead of per point.  
- **Global Clear:** one event resets everything; avoids expensive loops.  
- **Replay simplicity:** clearing + redrawing all active ops ensures consistency.

---

## 🧱 Scaling & Persistence

For production scaling:
- Use a database (MongoDB/PostgreSQL) to persist `operations`.  
- Add room support via Socket.io namespaces.  
- Implement snapshots every N operations for faster replay.  
- Add authentication and user names.  

---

## 🧠 Design Summary

The architecture balances **simplicity** and **deterministic consistency**.  
All clients replay the same sequence of operations from the server, guaranteeing identical canvases.  
Undo/Redo and Clear remain conflict-free through server authority.

---

## ✅ Deployment Info

- Platform: **Render** (Node.js 22 runtime)  
- Build Command: `npm install`  
- Start Command: `npm start`  
- Health Check Path: `/` (serves `index.html`)  
- Auto binds to `process.env.PORT` for compatibility.

---

## 🔗 Links

- **Live Demo:** [https://collaborative-canvas-l5jt.onrender.com](https://collaborative-canvas-l5jt.onrender.com)  
- **GitHub:** [https://github.com/tagore19/collaborative-canvas](https://github.com/tagore19/collaborative-canvas)

---

## 🧑‍💻 Author
**Name:** Tagore Reddy  
**Email:** tagorepasham@gmail.com  
**GitHub:** [https://github.com/tagore19](https://github.com/tagore19)
