const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── Directories ────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// ─── Simple JSON DB ─────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DATA_FILE)) return { todos: [], files: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { todos: [], files: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Multer ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// ═══════════════════════════════════════════════════════════════
//  TODOS
// ═══════════════════════════════════════════════════════════════
app.get("/api/todos", (_, res) => res.json(readDB().todos));

app.post("/api/todos", (req, res) => {
  const { title, description, assignee, dueDate, priority } = req.body;
  if (!title) return res.status(400).json({ error: "Title required" });
  const db = readDB();
  const todo = {
    id: uuidv4(), title, description: description || "",
    assignee: assignee || "You", dueDate: dueDate || null,
    priority: priority || "medium", completed: false,
    createdAt: new Date().toISOString(),
  };
  db.todos.unshift(todo);
  writeDB(db);
  io.emit("todo:new", todo);
  res.status(201).json(todo);
});

app.patch("/api/todos/:id", (req, res) => {
  const db = readDB();
  const idx = db.todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.todos[idx] = { ...db.todos[idx], ...req.body };
  writeDB(db);
  io.emit("todo:update", db.todos[idx]);
  res.json(db.todos[idx]);
});

app.delete("/api/todos/:id", (req, res) => {
  const db = readDB();
  db.todos = db.todos.filter(t => t.id !== req.params.id);
  writeDB(db);
  io.emit("todo:delete", req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
//  FILES
// ═══════════════════════════════════════════════════════════════
app.get("/api/files", (_, res) => res.json(readDB().files));

app.post("/api/files", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const db = readDB();
  const fileRecord = {
    id: uuidv4(),
    originalName: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedBy: req.body.uploadedBy || "You",
    uploadedAt: new Date().toISOString(),
    url: `/uploads/${req.file.filename}`,
  };
  db.files.unshift(fileRecord);
  writeDB(db);
  io.emit("file:new", fileRecord);
  res.status(201).json(fileRecord);
});

app.delete("/api/files/:id", (req, res) => {
  const db = readDB();
  const file = db.files.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: "Not found" });
  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.files = db.files.filter(f => f.id !== req.params.id);
  writeDB(db);
  io.emit("file:delete", req.params.id);
  res.json({ success: true });
});

// ─── Socket.io ──────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// ─── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0',() => {
  console.log(`✅ Server running on Port ${PORT}`);
});
