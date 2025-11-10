# ARCHITECTURE.md

## Project
**Collaborative Canvas** — real-time multi-user drawing app using HTML5 Canvas (vanilla JS) + Node.js + Socket.io.

---

## Goals (short)
- Real-time synchronized freehand drawing across multiple clients.
- Server-authoritative operation log for replay and global undo/redo.
- Low-latency UX: immediate local rendering + server finalization.
- Minimal dependencies, plain DOM + Canvas API, no drawing libraries.

---

## High-level components
- **Client**
  - `index.html`, `style.css` — UI and toolbar.
  - `canvas.js` — drawing engine, DPR handling, local snapshots, replay helpers.
  - `websocket.js` — socket client: send strokes, receive ops/cursors, manage presence.
  - `main.js` — toolbar wiring.
- **Server**
  - `server/server.js` — Express static server + Socket.io; stores global op log and handles undo/redo.
- **Runtime**
  - Node process hosts server; clients connect via Socket.io.

---

## Data Flow (step-by-step)
1. **Local stroke creation (Client)**
   - Pointerdown → begin stroke; client generates a `strokeId`.
   - Pointermove → client draws segments immediately on local canvas.
   - Sends packets: `{ points, meta:{color,size,eraser}, strokeId, isFinal:false }`
   - On pointerup → final packet `{ isFinal:true }`.

2. **Server-side buffering & finalization**
   - Buffers incoming stroke segments in `pendingStrokes[strokeId]`.
   - On final packet, combines into one op:
     ```js
     { id: uuid, userId, type: 'stroke', data: { points, color, size, eraser }, active: true, timestamp }
     ```
   - Appends to `operations[]`, broadcasts `op_add` to all clients.

3. **Client replay & preview**
   - Clients apply incoming ops via `drawOperation()`.
   - Transient `op_seg` messages provide live preview while drawing.
   - New clients on connect receive full replay (`welcome` message).

4. **Global Undo/Redo**
   - `undo` → server marks last active op by that user as inactive.
   - `redo` → reactivates most recent inactive op by that user.
   - Clients replay active ops in order for consistency.

5. **Cursor / Presence**
   - Clients send throttled cursor positions.
   - Server rebroadcasts to others; clients draw overlay dots.

---

## WebSocket Protocol (summary)

### Client → Server
- `stroke` — `{ points[], meta, strokeId?, isFinal? }`
- `undo`, `redo`
- `cursor` — `{ x:0..1, y:0..1 }`

### Server → Client
- `welcome` — `{ id, color, operations: [active ops] }`
- `user-join`, `user-left`
- `op_add`, `op_seg`, `op_undo`, `op_redo`, `cursor`

---

## Undo/Redo Strategy

- **Per-user LIFO semantics**: Each user can undo/redo their own strokes.
- Server keeps `operations[]` with `active` flag per op.
- Undo = mark last active op inactive → broadcast.
- Redo = re-enable last inactive op for that user.
- Clients clear canvas and replay all `active` ops for consistent view.

---

## Conflict Resolution

### Problems
- Simultaneous drawings in overlapping regions.
- Multiple undos/redos across users.

### Solution
- Server log is **append-only**: last operation drawn always wins.
- Undo/Redo scoped per user (no shared-history conflicts).
- Replaying operations deterministically guarantees identical results for all clients.

---

## Performance Decisions

- **Local drawing prediction**: draw locally for zero-lag experience.
- **Batched strokes**: one op per stroke, not per segment.
- **Normalized coordinates**: scale-independent data, low bandwidth.
- **Replay strategy**: simple clear + replay approach (fine for <1000 ops).
- **Cursor throttling**: limits to ~20Hz updates.

---

## Known Limitations

- In-memory op log (lost on server restart).
- No authentication or rate limiting.
- Undo/Redo clears and replays all strokes (O(n) per op).
- Not optimized for >100 concurrent users.
- No persistence; add DB for production.

---

## Scaling Notes

- Store ops per room → enables isolated canvases.
- Persist ops to DB for durability.
- Implement snapshotting every N ops to reduce replay cost.
- Add message compression and binary transport for heavy loads.

---

## Architecture Diagram (textual)

```
Client (CanvasApp)
  │
  ├─ pointer events → local draw + emit "stroke"
  │
  ▼
Server (Socket.io)
  ├─ Buffer segments → finalize op → broadcast "op_add"
  ├─ Handle "undo"/"redo" → toggle op.active → broadcast updates
  └─ Track active users, cursors
  │
  ▼
All Clients
  ├─ Update ops list
  ├─ Clear & replay active ops for consistency
  └─ Render cursors
```

---

## Testing Checklist

1. Run `npm run dev`
2. Open 2+ browser tabs → draw → confirm live sync.
3. Undo/Redo → full-stroke changes reflected globally.
4. Open third tab → correct replay of previous drawings.
5. Cursor dots visible for all users.

---

## Design Summary

The system implements a **real-time CRDT-lite approach** where all actions (strokes) are commutative and replayable. Undo/Redo work by toggling inclusion in the replay list. This keeps architecture simple, deterministic, and robust against latency or order issues.
