# Collaborative Canvas

A **real-time multi-user drawing application** built with **Vanilla JavaScript**, **HTML5 Canvas**, and **Node.js (Socket.io)**.  
Multiple users can draw simultaneously, see each other's strokes in real time, undo/redo globally, and track active users with color indicators.

---

## 🚀 Features

✅ Real-time synchronized drawing across users  
✅ Live cursor indicators showing other users' positions  
✅ Brush, color picker, and eraser tool  
✅ Adjustable stroke width  
✅ Global undo/redo (per-user LIFO)  
✅ Users assigned unique colors  
✅ New users instantly see the full current canvas  
✅ Simple UI — no frameworks or drawing libraries

---

## 🧩 Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── canvas.js
│   ├── websocket.js
│   └── main.js
├── server/
│   └── server.js
├── package.json
├── README.md
└── ARCHITECTURE.md
```

---

## ⚙️ Setup Instructions

### 1. Clone or download this repository
```bash
git clone <your-repo-url>
cd collaborative-canvas
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the server
For development:
```bash
npm run dev
```

Or for normal mode:
```bash
npm start
```

### 4. Open the app
Open your browser and go to:
```
http://localhost:3000
```

You should see a **Collaborative Canvas Test Page**.  
Draw on it — open multiple tabs or browsers to see the live sync.

---

## 🧪 How to Test Multi-user Collaboration

1. Open `http://localhost:3000` in two browser windows.  
2. Draw on one tab — strokes appear instantly on the other.  
3. Click **Undo** — removes your last stroke on both tabs.  
4. Click **Redo** — restores your stroke globally.  
5. Each user gets a random color assigned automatically.  
6. Cursor dots show where other users are drawing.  
7. Use **Eraser** to delete parts of the canvas.

---

## 🧰 WebSocket Events Overview

| Direction | Event | Description |
|------------|--------|-------------|
| C → S | `stroke` | Send stroke segment(s) or final stroke with `{points, meta, strokeId, isFinal}` |
| C → S | `undo` / `redo` | Request global undo/redo for user |
| C → S | `cursor` | Send cursor position `{x, y}` (normalized 0–1) |
| S → C | `welcome` | Initial data with user id, color, and existing strokes |
| S → C | `op_add` | Add finalized stroke from any user |
| S → C | `op_undo` / `op_redo` | Update global operation state |
| S → C | `cursor` | Broadcast cursor updates to others |
| S → C | `op_seg` | Transient preview (live drawing) updates |

---

## ⚖️ Known Limitations

- **Canvas resets** if server restarts (data in memory only).  
- **Per-user undo only** — users can’t undo others’ strokes.  
- **No authentication** (user = socket id).  
- **Replay cost**: undo/redo clears and redraws all strokes.  
- **No rate-limiting** for excessive strokes (could add later).  
- **Clear button is local only** — does not broadcast a global clear.

---

## ⏱️ Development Time

Approx. **10 hours** total  
(Including coding, debugging real-time sync, and undo/redo logic)

---

## 🧠 Key Technical Concepts

- **Canvas smoothing & scaling:** uses device pixel ratio for crisp lines.  
- **Batched strokes:** segments grouped by `strokeId`, finalized once per stroke.  
- **Server-authoritative log:** keeps consistent history across users.  
- **Reconstructable state:** new clients replay all active ops.  
- **Undo/Redo:** per-user toggle of `active` flag in the operation log.

---

## 🌐 Deployment

Once tested locally, deploy easily using **Render** or **Railway**:

1. Push this code to a **GitHub repo**.  
2. Go to [https://render.com](https://render.com).  
3. Create a **New Web Service** → Connect your GitHub repo.  
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node 18+
5. Deploy and wait ~1–2 minutes.  
6. Open your live URL (e.g., `https://collaborative-canvas.onrender.com`).

Your deployed link is now ready for the submission demo.

---

## 💬 Author

**Name:** Tagore Reddy  
**Email:** tagorepasham@gmail.com  
**Tech Stack:** Node.js, Vanilla JS, Socket.io, HTML5 Canvas  
**Submission Type:** Real-time Collaborative Drawing App Assignment  

---

## 🧾 License

This project is for educational and evaluation purposes.
