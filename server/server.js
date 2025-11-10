// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../client")));

const users = {};
const operations = []; // global op log (append-only; ops have active flag)

// temp buffer for in-progress strokes keyed by strokeId
const pendingStrokes = {}; // strokeId -> { userId, meta, points: [] }

function pickColor(id) {
  const palette = ["#e6194b","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#46f0f0","#f032e6","#bcf60c","#fabebe"];
  const sum = id.split("").reduce((s,c)=> s + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  const color = pickColor(socket.id);
  users[socket.id] = { color };

  // send current active ops to this client
  socket.emit("welcome", { id: socket.id, color, operations: operations.filter(op => op.active) });

  socket.broadcast.emit("user-join", { id: socket.id, color });

  // handle incoming stroke packets (segments). Packet may contain:
  // { points: [...], meta: {...}, canvasSize: {...}, strokeId: "...", isFinal: true/false }
  socket.on("stroke", (packet) => {
    if (!packet || !Array.isArray(packet.points)) return;

    const strokeId = packet.strokeId;
    const isFinal = !!packet.isFinal;
    const meta = packet.meta || {};

    // If client provided a strokeId, buffer segments under it
    if (strokeId) {
      // ensure an entry
      if (!pendingStrokes[strokeId]) {
        pendingStrokes[strokeId] = { userId: socket.id, meta: { color: meta.color, size: meta.size, eraser: meta.eraser }, points: [] };
      }
      // append incoming segments
      pendingStrokes[strokeId].points.push(...packet.points);

      if (isFinal) {
        // finalize: create single op combining all collected points
        const entry = pendingStrokes[strokeId];
        const op = {
          id: randomUUID(),
          userId: entry.userId,
          type: "stroke",
          data: {
            points: entry.points.slice(), // normalized points
            color: entry.meta.color,
            size: entry.meta.size,
            eraser: !!entry.meta.eraser
          },
          active: true,
          timestamp: Date.now()
        };
        operations.push(op);
        // broadcast the finalized op
        io.emit("op_add", { op });
        // cleanup
        delete pendingStrokes[strokeId];
      } else {
        // not final yet: Optionally broadcast for live preview (we don't create authoritative op yet).
        // To keep responsiveness, we can broadcast the segment as a transient preview; but to avoid
        // polluting op log we won't add to operations[]. Instead, broadcast a lightweight "seg" event
        // for others to optionally preview. We'll use "op_seg" events.
        socket.broadcast.emit("op_seg", { from: socket.id, strokeId, points: packet.points, meta });
      }
      return;
    }

    // fallback: no strokeId — legacy behavior create op immediately
    const op = {
      id: randomUUID(),
      userId: socket.id,
      type: "stroke",
      data: {
        points: packet.points,
        color: meta.color,
        size: meta.size,
        eraser: meta.eraser
      },
      active: true,
      timestamp: Date.now()
    };
    operations.push(op);
    io.emit("op_add", { op });
  });

  // global undo requested by client: server finds last active op by that user and deactivates it
  socket.on("undo", () => {
    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      if (op.userId === socket.id && op.active) {
        op.active = false;
        io.emit("op_undo", { id: op.id, userId: socket.id });
        return;
      }
    }
    socket.emit("undo_none");
  });

  // redo: reactivate the most recent inactive op by this user
  socket.on("redo", () => {
    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      if (op.userId === socket.id && !op.active) {
        op.active = true;
        io.emit("op_redo", { id: op.id, userId: socket.id, op });
        return;
      }
    }
    socket.emit("redo_none");
  });

  socket.on("cursor", (c) => {
    socket.broadcast.emit("cursor", { id: socket.id, cursor: c });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    socket.broadcast.emit("user-left", { id: socket.id });
    console.log("❌ Disconnected:", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
