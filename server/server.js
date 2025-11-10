// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve static files from client/
app.use(express.static(path.join(__dirname, "../client")));

// fallback route to serve index.html for health checks and root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// simple in-memory user map (socketId -> { color, name })
const users = {};
const operations = []; // global op log
const pendingStrokes = {}; // for batching stroke segments

function pickColor(id) {
  const palette = ["#e6194b","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#46f0f0","#f032e6","#bcf60c","#fabebe"];
  const sum = id.split("").reduce((s,c)=> s + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

io.on("connection", (socket) => {
  console.log("✅ New user connected:", socket.id);
  const color = pickColor(socket.id);
  users[socket.id] = { color };

  // tell this client its assigned info + active ops
  socket.emit("welcome", { id: socket.id, color, operations: operations.filter(op => op.active) });

  socket.broadcast.emit("user-join", { id: socket.id, color });

  // handle incoming stroke packets (with strokeId and isFinal)
  socket.on("stroke", (packet) => {
    if (!packet || !Array.isArray(packet.points)) return;

    const strokeId = packet.strokeId;
    const isFinal = !!packet.isFinal;
    const meta = packet.meta || {};

    if (strokeId) {
      if (!pendingStrokes[strokeId]) {
        pendingStrokes[strokeId] = { userId: socket.id, meta: { color: meta.color, size: meta.size, eraser: meta.eraser }, points: [] };
      }
      pendingStrokes[strokeId].points.push(...packet.points);

      if (isFinal) {
        const entry = pendingStrokes[strokeId];
        const op = {
          id: randomUUID(),
          userId: entry.userId,
          type: "stroke",
          data: {
            points: entry.points.slice(),
            color: entry.meta.color,
            size: entry.meta.size,
            eraser: !!entry.meta.eraser
          },
          active: true,
          timestamp: Date.now()
        };
        operations.push(op);
        io.emit("op_add", { op });
        delete pendingStrokes[strokeId];
      } else {
        socket.broadcast.emit("op_seg", { from: socket.id, strokeId, points: packet.points, meta });
      }
      return;
    }

    // fallback: immediate op if no strokeId provided
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
    console.log("❌ User disconnected:", socket.id);
  });
});

// IMPORTANT: use platform-provided port and bind to all interfaces
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
